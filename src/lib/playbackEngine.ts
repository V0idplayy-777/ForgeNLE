// ─────────────────────────────────────────────────────────────────────────────
// Media pool + Web Audio mixer. Keeps HTMLMediaElements in sync with the
// timeline clock, routes every clip through gain/pan nodes, and hands frame
// sources to the compositor.
// ─────────────────────────────────────────────────────────────────────────────

import { Clip, MediaAsset, Track } from "../types";
import { evaluateClip, rateAt } from "./keyframes";
import { clipActiveRange, isClipActive, sourceTime, FrameSource } from "./renderer";
import { clamp, fadeMultiplier } from "./utils";

interface PoolEntry {
  clipId: string;
  assetId: string;
  el: HTMLVideoElement | HTMLAudioElement;
  srcNode?: MediaElementAudioSourceNode;
  gain?: GainNode;
  panner?: StereoPannerNode;
  lastUsed: number;
  pendingSeek: number | null;
  seeking: boolean;
  ready: boolean;
}

export interface MixState {
  tracks: Track[];
  assets: MediaAsset[];
  masterVolume: number; // 0..100
  masterMuted: boolean;
}

export interface EngineOptions {
  /** Where audio should go. Defaults to the AudioContext destination. */
  destination?: AudioNode;
  audioContext?: AudioContext;
  /** Disable audio entirely (e.g. for silent offline frame rendering). */
  silent?: boolean;
  lookahead?: number;
}

export class PlaybackEngine {
  private pool = new Map<string, PoolEntry>();
  private images = new Map<string, HTMLImageElement>();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private opts: EngineOptions;
  private disposed = false;
  private lastResumeAttempt = 0;
  private analysers: [AnalyserNode, AnalyserNode] | null = null;
  private splitter: ChannelSplitterNode | null = null;

  constructor(opts: EngineOptions = {}) {
    this.opts = opts;
    if (opts.audioContext) {
      this.ctx = opts.audioContext;
      this.master = this.ctx.createGain();
      this.master.connect(opts.destination ?? this.ctx.destination);
    }
  }

  get audioContext() {
    return this.ctx;
  }

  /**
   * Stereo peak/RMS meters on the master bus. Returns null until audio is live.
   * Values are linear (0..1+) so callers can convert to dBFS.
   */
  meterLevels(): { peak: [number, number]; rms: [number, number] } | null {
    if (!this.ctx || !this.master) return null;
    if (!this.analysers) {
      try {
        this.splitter = this.ctx.createChannelSplitter(2);
        const mk = () => {
          const a = this.ctx!.createAnalyser();
          a.fftSize = 1024;
          a.smoothingTimeConstant = 0;
          return a;
        };
        this.analysers = [mk(), mk()];
        this.master.connect(this.splitter);
        this.splitter.connect(this.analysers[0], 0);
        this.splitter.connect(this.analysers[1], 1);
      } catch {
        return null;
      }
    }
    const peak: [number, number] = [0, 0];
    const rms: [number, number] = [0, 0];
    const buf = new Float32Array(this.analysers[0].fftSize);
    for (let c = 0; c < 2; c++) {
      this.analysers[c].getFloatTimeDomainData(buf);
      let p = 0;
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i]);
        if (v > p) p = v;
        sum += buf[i] * buf[i];
      }
      peak[c] = p;
      rms[c] = Math.sqrt(sum / buf.length);
    }
    return { peak, rms };
  }

  /** Must be called from a user gesture (play button) so audio is allowed. */
  ensureAudio() {
    if (this.opts.silent) return;
    if (!this.ctx) {
      try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new Ctx({ latencyHint: "interactive" });
        this.master = this.ctx.createGain();
        this.master.connect(this.opts.destination ?? this.ctx.destination);
      } catch (e) {
        console.warn("AudioContext unavailable", e);
        return;
      }
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    // Attach any elements created before the context existed
    for (const entry of this.pool.values()) this.attachAudio(entry);
  }

  private attachAudio(entry: PoolEntry) {
    if (!this.ctx || !this.master || entry.srcNode || this.opts.silent) return;
    try {
      entry.srcNode = this.ctx.createMediaElementSource(entry.el);
      entry.gain = this.ctx.createGain();
      entry.gain.gain.value = 0;
      entry.panner = this.ctx.createStereoPanner();
      entry.srcNode.connect(entry.panner);
      entry.panner.connect(entry.gain);
      entry.gain.connect(this.master);
      // A MediaElementAudioSourceNode's output is scaled by the element's own
      // volume/muted state, so once routed through the graph the element must
      // be at unity — the per-clip GainNode does the real mixing.
      entry.el.muted = false;
      entry.el.volume = 1;
    } catch (e) {
      // Element is probably already attached to another context; fall back to element volume.
      console.warn("audio routing failed", e);
    }
  }

  private makeEntry(clip: Clip, asset: MediaAsset, wantVideo: boolean): PoolEntry {
    const el = document.createElement(wantVideo ? "video" : "audio") as HTMLVideoElement;
    el.src = asset.url;
    el.preload = "auto";
    el.playsInline = true;
    el.crossOrigin = "anonymous";
    el.muted = this.opts.silent ? true : false;
    if (this.opts.silent) el.volume = 0;
    (el as any).disableRemotePlayback = true;
    el.style.display = "none";
    const entry: PoolEntry = {
      clipId: clip.id,
      assetId: asset.id,
      el,
      lastUsed: performance.now(),
      pendingSeek: null,
      seeking: false,
      ready: false,
    };
    el.addEventListener("loadeddata", () => {
      entry.ready = true;
    });
    el.addEventListener("seeking", () => {
      entry.seeking = true;
    });
    el.addEventListener("seeked", () => {
      entry.seeking = false;
      if (entry.pendingSeek !== null) {
        const t = entry.pendingSeek;
        entry.pendingSeek = null;
        if (Math.abs(el.currentTime - t) > 0.005) {
          try {
            el.currentTime = t;
          } catch {}
        }
      }
    });
    // Silent until the first sync() computes the real level.
    el.volume = 0;
    el.muted = true;
    this.attachAudio(entry);
    return entry;
  }

  private getEntry(clip: Clip, asset: MediaAsset, wantVideo: boolean): PoolEntry {
    let e = this.pool.get(clip.id);
    if (e && (e.assetId !== asset.id || (wantVideo && e.el.tagName !== "VIDEO"))) {
      this.disposeEntry(e);
      e = undefined;
    }
    if (!e) {
      e = this.makeEntry(clip, asset, wantVideo);
      this.pool.set(clip.id, e);
    }
    e.lastUsed = performance.now();
    return e;
  }

  private disposeEntry(e: PoolEntry) {
    try {
      e.el.pause();
    } catch {}
    try {
      e.gain?.disconnect();
      e.panner?.disconnect();
      e.srcNode?.disconnect();
    } catch {}
    e.el.removeAttribute("src");
    try {
      e.el.load();
    } catch {}
    this.pool.delete(e.clipId);
  }

  getImage(asset: MediaAsset): HTMLImageElement {
    let img = this.images.get(asset.id);
    if (!img) {
      img = new Image();
      img.decoding = "async";
      img.src = asset.url;
      this.images.set(asset.id, img);
    }
    return img;
  }

  /** Frame source for the compositor. */
  getSource = (clip: Clip, assets: MediaAsset[]): FrameSource | null => {
    const asset = assets.find((a) => a.id === clip.mediaId);
    if (!asset || asset.missing) return null;
    if (asset.type === "image") {
      const img = this.getImage(asset);
      return img.complete && img.naturalWidth ? img : null;
    }
    if (asset.type === "video") {
      const e = this.pool.get(clip.id);
      if (!e || e.el.tagName !== "VIDEO") return null;
      const v = e.el as HTMLVideoElement;
      return v.readyState >= 2 ? v : null;
    }
    return null;
  };

  /** Seek an element and wait for the frame (used by the exporter). */
  async seekExact(clip: Clip, asset: MediaAsset, time: number, timeoutMs = 2500): Promise<HTMLVideoElement | HTMLAudioElement> {
    const e = this.getEntry(clip, asset, asset.type === "video");
    const el = e.el;
    if (el.readyState < 1) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        el.addEventListener("loadedmetadata", done, { once: true });
        el.addEventListener("error", done, { once: true });
        setTimeout(done, timeoutMs);
      });
    }
    const target = clamp(time, 0, Math.max(0, (isFinite(el.duration) ? el.duration : asset.duration) - 0.001));
    if (Math.abs(el.currentTime - target) < 0.0005 && el.readyState >= 2 && !el.seeking) return el;
    await new Promise<void>((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        el.removeEventListener("seeked", done);
        resolve();
      };
      el.addEventListener("seeked", done);
      try {
        el.currentTime = target;
      } catch {
        done();
      }
      setTimeout(done, timeoutMs);
    });
    // Give the decoder a moment to present the frame.
    if ("requestVideoFrameCallback" in el && el.readyState >= 2) {
      await new Promise<void>((resolve) => {
        let finished = false;
        const done = () => {
          if (!finished) {
            finished = true;
            resolve();
          }
        };
        (el as any).requestVideoFrameCallback(() => done());
        setTimeout(done, 60);
      });
    }
    return el;
  }

  /**
   * Main sync — call every frame. Keeps elements at the right time, playing or
   * paused, with correct gain.
   */
  sync(state: MixState, t: number, playing: boolean, rate = 1) {
    if (this.disposed) return;
    const now = performance.now();
    // Playback was requested (play button / space / JKL) — that always follows a
    // user gesture, so it's safe to bring the audio graph up here if it's missing.
    if (playing && !this.ctx && !this.opts.silent) this.ensureAudio();
    const lookahead = this.opts.lookahead ?? 1.5;
    const anyVideoSolo = state.tracks.some((tr) => tr.type === "video" && tr.solo);
    const anyAudioSolo = state.tracks.some((tr) => tr.type === "audio" && tr.solo);
    const used = new Set<string>();
    const masterGain = state.masterMuted ? 0 : state.masterVolume / 100;
    if (this.master) this.master.gain.value = masterGain;
    if (playing && this.ctx && this.ctx.state === "suspended" && now - this.lastResumeAttempt > 500) {
      this.lastResumeAttempt = now;
      this.ctx.resume().catch(() => {});
    }

    for (const track of state.tracks) {
      for (const clip of track.clips) {
        if (clip.kind !== "media" || !clip.mediaId) continue;
        const asset = state.assets.find((a) => a.id === clip.mediaId);
        if (!asset || asset.missing || asset.type === "image") continue;
        const [rs, re] = clipActiveRange(track, clip);
        const inWindow = t >= rs - lookahead && t < re + 0.25;
        if (!inWindow) continue;
        const wantVideo = track.type === "video" && asset.type === "video";
        const entry = this.getEntry(clip, asset, wantVideo);
        used.add(clip.id);
        const el = entry.el;
        const active = t >= rs && t < re;
        const local = t - clip.start;
        const target = sourceTime(clip, t, asset);

        // ── audio level ──
        let vol = 0;
        const trackAudible = track.type === "video" ? !(anyVideoSolo && !track.solo) && !track.hidden : !(anyAudioSolo && !track.solo);
        const producesAudio = track.type === "audio" || (track.type === "video" && !clip.audioDetached && asset.hasAudio !== false);
        if (active && producesAudio && trackAudible && !track.muted && !clip.audio.muted && isClipActive(clip, t)) {
          const anim = evaluateClip(clip, local);
          const fade = fadeMultiplier(clip.audio.fadeIn, clip.audio.fadeOut, local, clip.duration);
          vol = clamp((anim.volume / 100) * fade * (track.volume / 100), 0, 2);
        }
        if (this.opts.silent) {
          el.muted = true;
        } else if (entry.gain) {
          entry.gain.gain.setTargetAtTime(vol, this.ctx!.currentTime, 0.015);
          if (entry.panner) entry.panner.pan.value = clamp(clip.audio.pan / 100, -1, 1);
          if (el.muted) el.muted = false;
          if (el.volume !== 1) el.volume = 1;
        } else {
          // No Web Audio graph for this element: drive the element directly.
          el.volume = clamp(vol * masterGain, 0, 1);
          el.muted = el.volume <= 0;
        }
        (el as any).preservesPitch = clip.audio.preservesPitch;

        // ── time / playback ──
        const remapped = !!clip.reverse || !!clip.freeze || !!(clip.speedRamp && clip.speedRamp.length);
        const instRate = remapped ? rateAt(clip, local) : clip.speed;
        const speed = clamp(instRate * Math.abs(rate), 0.0625, 16);
        if (remapped) {
          // Browsers can't play media backwards or follow a rate curve natively:
          // hold the element paused and step it to the exact source time each
          // frame. Audio is muted in these modes (scrubbing audio would chatter).
          if (!el.paused) el.pause();
          if (entry.gain) entry.gain.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.005);
          else el.volume = 0;
          const drift = Math.abs(el.currentTime - target);
          if (drift > (playing ? 0.02 : 0.005)) this.seekSoft(entry, target);
          continue;
        }
        if (playing && active && rate > 0) {
          if (el.playbackRate !== speed) {
            try {
              el.playbackRate = speed;
            } catch {}
          }
          const drift = Math.abs(el.currentTime - target);
          if (el.paused || el.ended) {
            this.seekSoft(entry, target);
            el.play().catch(() => {});
          } else if (drift > 0.12) {
            this.seekSoft(entry, target);
          }
        } else {
          if (!el.paused) el.pause();
          // Scrub / paused: chase target with coalesced seeks.
          const drift = Math.abs(el.currentTime - target);
          if (drift > 0.01) this.seekSoft(entry, target);
        }
      }
    }

    // Retire unused entries (keep briefly for quick re-use)
    for (const [id, e] of this.pool) {
      if (used.has(id)) continue;
      if (!e.el.paused) e.el.pause();
      if (e.gain) e.gain.gain.value = 0;
      if (now - e.lastUsed > 8000 || this.pool.size > 24) this.disposeEntry(e);
    }
  }

  private seekSoft(entry: PoolEntry, target: number) {
    const el = entry.el;
    if (entry.seeking) {
      entry.pendingSeek = target;
      return;
    }
    try {
      el.currentTime = target;
    } catch {}
  }

  pauseAll() {
    for (const e of this.pool.values()) {
      if (!e.el.paused) e.el.pause();
    }
  }

  /** Drop entries whose clips no longer exist. */
  prune(validClipIds: Set<string>) {
    for (const [id, e] of this.pool) if (!validClipIds.has(id)) this.disposeEntry(e);
  }

  dispose() {
    this.disposed = true;
    for (const e of Array.from(this.pool.values())) this.disposeEntry(e);
    this.images.clear();
    if (this.ctx && !this.opts.audioContext) this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}

/** Shared preview engine singleton. */
let previewEngine: PlaybackEngine | null = null;
export function getPreviewEngine() {
  if (!previewEngine) previewEngine = new PlaybackEngine({ lookahead: 2 });
  return previewEngine;
}
