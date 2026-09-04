// ─────────────────────────────────────────────────────────────────────────────
// Export pipeline.
//   1. Frame-accurate offline render → WebCodecs (H.264/AAC) → MP4 (preferred)
//   2. Real-time canvas capture → MediaRecorder (WebM) fallback
// Both paths share the same compositor as the preview.
// ─────────────────────────────────────────────────────────────────────────────

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { Clip, MediaAsset, ProjectSettings, Track } from "../types";
import { evaluateClip } from "./keyframes";
import { PlaybackEngine } from "./playbackEngine";
import { clipActiveRange, isClipActive, renderFrame, sourceTime } from "./renderer";
import { clamp, fadeMultiplier, getProjectDuration } from "./utils";
import { warmFonts } from "./presets";

export type ExportContainer = "mp4" | "webm";

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  bitrate: number; // video bits per second
  audioBitrate?: number;
  container: ExportContainer;
  range?: [number, number];
  includeAudio: boolean;
  onProgress: (ratio: number, stage: string) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  extension: string;
  mimeType: string;
  frames: number;
  seconds: number;
}

export interface ExportInput {
  tracks: Track[];
  assets: MediaAsset[];
  settings: ProjectSettings;
}

export function supportsWebCodecs() {
  return typeof (window as any).VideoEncoder !== "undefined" && typeof (window as any).VideoFrame !== "undefined";
}

export async function canExportMp4(width: number, height: number, fps: number, bitrate: number): Promise<boolean> {
  if (!supportsWebCodecs()) return false;
  try {
    const cfg = await VideoEncoder.isConfigSupported(videoConfig(width, height, fps, bitrate));
    return !!cfg.supported;
  } catch {
    return false;
  }
}

function avcLevel(width: number, height: number, fps: number) {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const mbps = mbs * fps;
  if (mbps <= 245760 && mbs <= 8192) return "avc1.640028"; // 4.0
  if (mbps <= 589824 && mbs <= 22080) return "avc1.640032"; // 5.0
  return "avc1.640033"; // 5.1
}

function videoConfig(width: number, height: number, fps: number, bitrate: number): VideoEncoderConfig {
  return {
    codec: avcLevel(width, height, fps),
    width,
    height,
    bitrate,
    framerate: fps,
    hardwareAcceleration: "no-preference",
    latencyMode: "quality",
    avc: { format: "avc" },
  } as VideoEncoderConfig;
}

// ── Public entry ────────────────────────────────────────────────────────────

export async function exportProject(input: ExportInput, opts: ExportOptions): Promise<ExportResult> {
  const total = getProjectDuration(input.tracks);
  if (total <= 0) throw new Error("Timeline is empty — nothing to export.");
  const [rs, re] = opts.range ?? [0, total];
  if (re - rs <= 0.05) throw new Error("Export range is empty.");
  await warmFonts();
  if (opts.container === "mp4" && (await canExportMp4(opts.width, opts.height, opts.fps, opts.bitrate))) {
    return exportWithWebCodecs(input, opts, rs, re);
  }
  return exportWithMediaRecorder(input, opts, rs, re);
}

// ── Offline audio mix ───────────────────────────────────────────────────────

const decodeCache = new Map<string, Promise<AudioBuffer | null>>();

async function decodeAsset(asset: MediaAsset, sampleRate: number): Promise<AudioBuffer | null> {
  const key = `${asset.id}@${sampleRate}`;
  if (!decodeCache.has(key)) {
    decodeCache.set(
      key,
      (async () => {
        try {
          const resp = await fetch(asset.url);
          const buf = await resp.arrayBuffer();
          const ctx = new OfflineAudioContext(2, 1, sampleRate);
          return await ctx.decodeAudioData(buf);
        } catch (e) {
          console.warn("Audio decode failed for", asset.name, e);
          return null;
        }
      })()
    );
  }
  return decodeCache.get(key)!;
}

export function clearDecodeCache() {
  decodeCache.clear();
}

function clipProducesAudio(track: Track, clip: Clip, asset: MediaAsset) {
  if (clip.kind !== "media") return false;
  if (asset.type === "image") return false;
  if (track.type === "audio") return true;
  return !clip.audioDetached && asset.hasAudio !== false;
}

async function renderAudioMix(input: ExportInput, rs: number, re: number, sampleRate: number, onProgress?: (r: number) => void): Promise<AudioBuffer | null> {
  const length = Math.ceil((re - rs) * sampleRate);
  const offline = new OfflineAudioContext(2, Math.max(1, length), sampleRate);
  const anyAudioSolo = input.tracks.some((t) => t.type === "audio" && t.solo);
  const anyVideoSolo = input.tracks.some((t) => t.type === "video" && t.solo);
  let count = 0;
  let scheduled = 0;

  const jobs: Promise<void>[] = [];
  for (const track of input.tracks) {
    if (track.muted) continue;
    if (track.type === "audio" && anyAudioSolo && !track.solo) continue;
    if (track.type === "video" && ((anyVideoSolo && !track.solo) || track.hidden)) continue;
    for (const clip of track.clips) {
      const asset = input.assets.find((a) => a.id === clip.mediaId);
      if (!asset || asset.missing || !clipProducesAudio(track, clip, asset)) continue;
      if (clip.audio.muted) continue;
      const ce = clip.start + clip.duration;
      if (ce <= rs || clip.start >= re) continue;
      count++;
      jobs.push(
        (async () => {
          const buffer = await decodeAsset(asset, sampleRate);
          if (!buffer) return;
          const src = offline.createBufferSource();
          src.buffer = buffer;
          src.playbackRate.value = clip.speed;
          const gain = offline.createGain();
          const panner = offline.createStereoPanner();
          panner.pan.value = clamp(clip.audio.pan / 100, -1, 1);
          src.connect(panner);
          panner.connect(gain);
          gain.connect(offline.destination);

          // Gain automation: sample the envelope at ~50Hz.
          const step = 0.02;
          const trackGain = track.volume / 100;
          const startT = Math.max(clip.start, rs);
          const endT = Math.min(ce, re);
          gain.gain.setValueAtTime(envelope(clip, startT, trackGain), 0);
          for (let t = startT; t <= endT; t += step) {
            const v = envelope(clip, t, trackGain);
            gain.gain.linearRampToValueAtTime(v, Math.max(0, t - rs));
          }
          gain.gain.linearRampToValueAtTime(0, Math.max(0, endT - rs));

          const when = Math.max(0, clip.start - rs);
          const offset = sourceTime(clip, startT, asset);
          const dur = (endT - startT) * clip.speed;
          if (dur > 0) src.start(when, clamp(offset, 0, buffer.duration), Math.min(dur, buffer.duration - offset));
          scheduled++;
          onProgress?.(scheduled / Math.max(1, count));
        })()
      );
    }
  }
  if (!count) return null;
  await Promise.all(jobs);
  return offline.startRendering();
}

function envelope(clip: Clip, t: number, trackGain: number) {
  const local = t - clip.start;
  const anim = evaluateClip(clip, local);
  const fade = fadeMultiplier(clip.audio.fadeIn, clip.audio.fadeOut, local, clip.duration);
  return clamp((anim.volume / 100) * fade * trackGain, 0, 2);
}

// ── WebCodecs / MP4 path ────────────────────────────────────────────────────

async function exportWithWebCodecs(input: ExportInput, opts: ExportOptions, rs: number, re: number): Promise<ExportResult> {
  const { width, height, fps } = opts;
  const duration = re - rs;
  const totalFrames = Math.max(1, Math.round(duration * fps));
  const sampleRate = 48000;

  opts.onProgress(0, "Mixing audio");
  let audioBuffer: AudioBuffer | null = null;
  if (opts.includeAudio) {
    try {
      audioBuffer = await renderAudioMix(input, rs, re, sampleRate, (r) => opts.onProgress(r * 0.05, "Mixing audio"));
    } catch (e) {
      console.warn("Audio mix failed; exporting without audio", e);
    }
  }

  // Audio encoder support check
  let audioCodec: "aac" | "opus" | null = null;
  let audioConfig: AudioEncoderConfig | null = null;
  if (audioBuffer && typeof (window as any).AudioEncoder !== "undefined") {
    const tryCfg = async (cfg: AudioEncoderConfig, name: "aac" | "opus") => {
      try {
        const r = await AudioEncoder.isConfigSupported(cfg);
        if (r.supported) {
          audioCodec = name;
          audioConfig = cfg;
          return true;
        }
      } catch {}
      return false;
    };
    const ab = opts.audioBitrate ?? 192_000;
    (await tryCfg({ codec: "mp4a.40.2", numberOfChannels: 2, sampleRate, bitrate: ab }, "aac")) ||
      (await tryCfg({ codec: "opus", numberOfChannels: 2, sampleRate, bitrate: ab }, "opus"));
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height, frameRate: fps },
    audio: audioCodec ? { codec: audioCodec, numberOfChannels: 2, sampleRate } : undefined,
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  let encodeError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e as Error;
    },
  });
  videoEncoder.configure(videoConfig(width, height, fps, opts.bitrate));

  // ── audio encode ──
  if (audioBuffer && audioConfig && audioCodec) {
    opts.onProgress(0.05, "Encoding audio");
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        encodeError = e as Error;
      },
    });
    audioEncoder.configure(audioConfig);
    const frameSize = 1024;
    const ch0 = audioBuffer.getChannelData(0);
    const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : ch0;
    for (let i = 0; i < audioBuffer.length; i += frameSize) {
      const n = Math.min(frameSize, audioBuffer.length - i);
      const data = new Float32Array(n * 2);
      data.set(ch0.subarray(i, i + n), 0);
      data.set(ch1.subarray(i, i + n), n);
      const ad = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: n,
        numberOfChannels: 2,
        timestamp: Math.round((i / sampleRate) * 1e6),
        data,
      });
      audioEncoder.encode(ad);
      ad.close();
      if (audioEncoder.encodeQueueSize > 32) await new Promise((r) => setTimeout(r, 4));
      if (opts.signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  // ── video frames ──
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true })!;
  const engine = new PlaybackEngine({ silent: true, lookahead: 0.5 });
  const rc = {
    settings: input.settings,
    tracks: input.tracks,
    assets: input.assets,
    getSource: (clip: Clip) => engine.getSource(clip, input.assets),
  };

  // Pre-load images
  for (const a of input.assets) if (a.type === "image") await engine.getImage(a).decode?.().catch(() => {});

  const mediaClips: { clip: Clip; asset: MediaAsset; track: Track }[] = [];
  for (const track of input.tracks) {
    if (track.type !== "video" || track.hidden) continue;
    for (const clip of track.clips) {
      const asset = input.assets.find((a) => a.id === clip.mediaId);
      if (asset && asset.type === "video" && !asset.missing) mediaClips.push({ clip, asset, track });
    }
  }

  try {
    const start = performance.now();
    for (let f = 0; f < totalFrames; f++) {
      if (opts.signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      if (encodeError) throw encodeError;
      const t = rs + f / fps + 0.0001;

      // Seek every visible video source to the exact frame time.
      const seeks: Promise<unknown>[] = [];
      for (const { clip, asset, track } of mediaClips) {
        const [ars, are] = clipActiveRange(track, clip);
        if (t >= ars && t < are) seeks.push(engine.seekExact(clip, asset, sourceTime(clip, t, asset)));
      }
      await Promise.all(seeks);

      renderFrame(ctx, rc, t);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((f / fps) * 1e6), duration: Math.round(1e6 / fps) });
      videoEncoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
      frame.close();
      while (videoEncoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 2));

      if (f % 3 === 0) {
        const elapsed = (performance.now() - start) / 1000;
        const rate = (f + 1) / Math.max(0.001, elapsed);
        const eta = Math.max(0, (totalFrames - f - 1) / rate);
        opts.onProgress(0.08 + (f / totalFrames) * 0.9, `Rendering frame ${f + 1} / ${totalFrames} · ${Math.round(rate)} fps · ${formatEta(eta)} left`);
      }
    }
    opts.onProgress(0.98, "Finalizing");
    await videoEncoder.flush();
    videoEncoder.close();
    if (encodeError) throw encodeError;
    muxer.finalize();
  } finally {
    engine.dispose();
  }
  const buffer = (muxer.target as ArrayBufferTarget).buffer;
  const blob = new Blob([buffer], { type: "video/mp4" });
  opts.onProgress(1, "Done");
  return { blob, extension: "mp4", mimeType: "video/mp4", frames: totalFrames, seconds: duration };
}

function formatEta(s: number) {
  if (!isFinite(s)) return "…";
  if (s < 60) return `${Math.ceil(s)}s`;
  return `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`;
}

// ── MediaRecorder fallback ──────────────────────────────────────────────────

async function exportWithMediaRecorder(input: ExportInput, opts: ExportOptions, rs: number, re: number): Promise<ExportResult> {
  const { width, height, fps } = opts;
  const duration = re - rs;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false })!;

  const audioCtx = new AudioContext();
  await audioCtx.resume();
  const dest = audioCtx.createMediaStreamDestination();
  const engine = new PlaybackEngine({ audioContext: audioCtx, destination: dest, lookahead: 2 });
  const rc = {
    settings: input.settings,
    tracks: input.tracks,
    assets: input.assets,
    getSource: (clip: Clip) => engine.getSource(clip, input.assets),
  };
  const mix = { tracks: input.tracks, assets: input.assets, masterVolume: 100, masterMuted: !opts.includeAudio };

  // Prime the pool
  engine.sync(mix, rs, false, 1);
  await new Promise((r) => setTimeout(r, 600));

  const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(fps);
  const tracks = [...canvasStream.getVideoTracks(), ...(opts.includeAudio ? dest.stream.getAudioTracks() : [])];
  const combined = new MediaStream(tracks);
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: opts.bitrate, audioBitsPerSecond: opts.audioBitrate ?? 192_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });
  recorder.start(200);

  let frames = 0;
  await new Promise<void>((resolve, reject) => {
    const startPerf = performance.now();
    let raf = 0;
    const frame = () => {
      if (opts.signal?.aborted) {
        cancelAnimationFrame(raf);
        reject(new DOMException("Export cancelled", "AbortError"));
        return;
      }
      const elapsed = (performance.now() - startPerf) / 1000;
      const t = rs + Math.min(elapsed, duration);
      engine.sync(mix, t, true, 1);
      renderFrame(ctx, rc, t);
      frames++;
      opts.onProgress(Math.min(1, elapsed / duration), `Recording in real time · ${formatEta(duration - elapsed)} left`);
      if (elapsed >= duration) {
        cancelAnimationFrame(raf);
        resolve();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }).finally(() => {
    engine.pauseAll();
  });

  recorder.stop();
  const blob = await finished;
  engine.dispose();
  audioCtx.close().catch(() => {});
  return { blob, extension: "webm", mimeType, frames, seconds: duration };
}

// ── Still frame export ──────────────────────────────────────────────────────

export async function exportStill(input: ExportInput, t: number, width: number, height: number): Promise<Blob> {
  await warmFonts();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const engine = new PlaybackEngine({ silent: true });
  try {
    for (const a of input.assets) if (a.type === "image") await engine.getImage(a).decode?.().catch(() => {});
    const seeks: Promise<unknown>[] = [];
    for (const track of input.tracks) {
      if (track.type !== "video" || track.hidden) continue;
      for (const clip of track.clips) {
        if (!isClipActive(clip, t)) continue;
        const asset = input.assets.find((a) => a.id === clip.mediaId);
        if (asset && asset.type === "video") seeks.push(engine.seekExact(clip, asset, sourceTime(clip, t, asset)));
      }
    }
    await Promise.all(seeks);
    renderFrame(ctx, { settings: input.settings, tracks: input.tracks, assets: input.assets, getSource: (c) => engine.getSource(c, input.assets) }, t);
  } finally {
    engine.dispose();
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}
