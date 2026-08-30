import { Clip, MediaAsset, Track } from "../types";
import { cssFilterString, fadeOpacity, contain, clamp, getProjectDuration } from "./utils";

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  mimeType: string;
  onProgress: (ratio: number) => void;
}

interface Prepared {
  clip: Clip;
  track: Track;
  asset?: MediaAsset;
  el?: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
}

export async function exportProject(tracks: Track[], mediaAssets: MediaAsset[], opts: ExportOptions): Promise<Blob> {
  const duration = getProjectDuration(tracks);
  if (duration <= 0) throw new Error("Timeline is empty — nothing to export.");

  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext("2d", { alpha: false })!;

  const audioCtx = new AudioContext();
  await audioCtx.resume();
  const dest = audioCtx.createMediaStreamDestination();
  const cleanupEls: HTMLElement[] = [];

  const prepared: Prepared[] = [];

  for (const track of tracks) {
    if (track.hidden) continue;
    for (const clip of track.clips) {
      if (track.type === "text") {
        prepared.push({ clip, track });
        continue;
      }
      const asset = mediaAssets.find((m) => m.id === clip.mediaId);
      if (!asset) continue;

      if (asset.type === "image") {
        const img = new Image();
        img.src = asset.url;
        await img.decode().catch(() => {});
        prepared.push({ clip, track, asset, el: img });
        continue;
      }

      const el = document.createElement(asset.type === "audio" ? "audio" : "video") as HTMLVideoElement;
      el.src = asset.url;
      el.playsInline = true;
      el.crossOrigin = "anonymous";
      el.muted = false;
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      cleanupEls.push(el);
      await new Promise<void>((resolve) => {
        el.onloadedmetadata = () => resolve();
        el.onerror = () => resolve();
        setTimeout(resolve, 4000);
      });

      try {
        const srcNode = audioCtx.createMediaElementSource(el);
        const gain = audioCtx.createGain();
        gain.gain.value = track.muted ? 0 : clamp(clip.effects.volume / 100, 0, 2);
        srcNode.connect(gain);
        gain.connect(dest);
      } catch (e) {
        console.warn("Could not route audio for clip", clip.name, e);
      }

      prepared.push({ clip, track, asset, el: el as HTMLVideoElement });
    }
  }

  const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(opts.fps);
  const audioTracks = dest.stream.getAudioTracks();
  const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
  const mimeType = MediaRecorder.isTypeSupported(opts.mimeType) ? opts.mimeType : "video/webm";
  const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: opts.bitrate });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start(250);

  await new Promise<void>((resolve) => {
    const startPerf = performance.now();
    let raf = 0;
    syncMedia(prepared, 0);
    const frame = () => {
      const elapsed = (performance.now() - startPerf) / 1000;
      const t = Math.min(elapsed, duration);
      drawFrame(ctx, opts, prepared, t);
      syncMedia(prepared, t);
      opts.onProgress(t / duration);
      if (elapsed >= duration) {
        cancelAnimationFrame(raf);
        resolve();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  });

  recorder.stop();
  const blob = await finished;

  for (const p of prepared) {
    const el = p.el as HTMLMediaElement | undefined;
    if (el && "pause" in el) {
      try {
        el.pause();
      } catch {}
    }
  }
  cleanupEls.forEach((el) => el.parentElement?.removeChild(el));
  audioCtx.close().catch(() => {});

  return blob;
}

function syncMedia(prepared: Prepared[], t: number) {
  for (const p of prepared) {
    if (p.track.type === "text" || !p.asset || p.asset.type === "image" || !p.el) continue;
    const el = p.el as HTMLMediaElement;
    const active = t >= p.clip.start && t < p.clip.start + p.clip.duration;
    if (!active) {
      if (!el.paused) el.pause();
      continue;
    }
    const localTime = p.clip.trimIn + (t - p.clip.start) * p.clip.effects.speed;
    el.playbackRate = clamp(p.clip.effects.speed, 0.1, 16);
    const drift = Math.abs(el.currentTime - localTime);
    if (drift > 0.2 || el.paused) {
      try {
        el.currentTime = localTime;
      } catch {}
      el.play().catch(() => {});
    }
  }
}

function drawFrame(ctx: CanvasRenderingContext2D, opts: ExportOptions, prepared: Prepared[], t: number) {
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, opts.width, opts.height);

  for (const p of prepared) {
    if (p.track.type !== "video" || !p.asset || !p.el) continue;
    const active = t >= p.clip.start && t < p.clip.start + p.clip.duration;
    if (!active) continue;
    const el = p.el as HTMLVideoElement | HTMLImageElement;
    let opacity = fadeOpacity(p.clip, t);
    let clipPath: Path2D | null = null;
    const tIn = p.clip.transitionIn;
    if (tIn && tIn.type !== "none") {
      const local = t - p.clip.start;
      if (local < tIn.duration) {
        const prog = local / tIn.duration;
        if (tIn.type === "crossfade" || tIn.type === "dip-black") {
          opacity *= prog;
        } else if (tIn.type === "wipe-left") {
          const w = opts.width * prog;
          clipPath = new Path2D();
          clipPath.rect(0, 0, w, opts.height);
        }
      }
    }
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.filter = cssFilterString(p.clip.effects);
    if (clipPath) ctx.clip(clipPath);
    const srcW = (el as HTMLVideoElement).videoWidth || (el as HTMLImageElement).naturalWidth || opts.width;
    const srcH = (el as HTMLVideoElement).videoHeight || (el as HTMLImageElement).naturalHeight || opts.height;
    const rect = contain(srcW || opts.width, srcH || opts.height, opts.width, opts.height);
    try {
      ctx.drawImage(el as CanvasImageSource, rect.x, rect.y, rect.w, rect.h);
    } catch {}
    ctx.restore();
  }

  ctx.filter = "none";
  for (const p of prepared) {
    if (p.track.type !== "text" || !p.clip.text) continue;
    const active = t >= p.clip.start && t < p.clip.start + p.clip.duration;
    if (!active) continue;
    drawText(ctx, opts, p.clip, t);
  }
}

function drawText(ctx: CanvasRenderingContext2D, opts: ExportOptions, clip: Clip, t: number) {
  const txt = clip.text!;
  const opacity = fadeOpacity(clip, t);
  ctx.save();
  ctx.globalAlpha = opacity;
  const fontWeight = txt.bold ? "700" : "400";
  const fontStyle = txt.italic ? "italic" : "normal";
  ctx.font = `${fontStyle} ${fontWeight} ${txt.fontSize}px ${txt.fontFamily}`;
  ctx.textAlign = txt.align;
  ctx.textBaseline = "middle";
  const x = (txt.x / 100) * opts.width;
  const y = (txt.y / 100) * opts.height;
  const lines = txt.content.split("\n");
  const lineHeight = txt.fontSize * 1.25;
  const totalHeight = lineHeight * lines.length;

  if (txt.background !== "transparent") {
    let maxWidth = 0;
    for (const line of lines) maxWidth = Math.max(maxWidth, ctx.measureText(line).width);
    const padX = 22;
    const padY = 14;
    let boxX = x - maxWidth / 2;
    if (txt.align === "left") boxX = x;
    else if (txt.align === "right") boxX = x - maxWidth;
    ctx.fillStyle = txt.background;
    ctx.fillRect(boxX - padX, y - totalHeight / 2 - padY, maxWidth + padX * 2, totalHeight + padY * 2);
  }

  if (txt.outline) {
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
  }
  ctx.fillStyle = txt.color;
  lines.forEach((line, i) => {
    const ly = y - totalHeight / 2 + lineHeight * (i + 0.5);
    ctx.fillText(line, x, ly);
  });
  ctx.restore();
}
