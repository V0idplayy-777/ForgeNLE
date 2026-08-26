import { Clip, ClipEffects, Track } from "../types";

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now()
    .toString(36)
    .slice(-4)}`;
}

export function formatTimecode(seconds: number, fps = 30): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const totalFrames = Math.round(seconds * fps);
  const fr = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  const pad = (n: number, l = 2) => n.toString().padStart(l, "0");
  return h > 0
    ? `${pad(h)}:${pad(m)}:${pad(s)}:${pad(fr)}`
    : `${pad(m)}:${pad(s)}:${pad(fr)}`;
}

export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function getProjectDuration(tracks: Track[]): number {
  let max = 0;
  for (const t of tracks) {
    for (const c of t.clips) {
      max = Math.max(max, c.start + c.duration);
    }
  }
  return max;
}

export function cssFilterString(fx: ClipEffects): string {
  return [
    `brightness(${fx.brightness}%)`,
    `contrast(${fx.contrast}%)`,
    `saturate(${fx.saturation}%)`,
    `hue-rotate(${fx.hue}deg)`,
    `blur(${fx.blur}px)`,
    `grayscale(${fx.grayscale}%)`,
    `sepia(${fx.sepia}%)`,
    `invert(${fx.invert}%)`,
  ].join(" ");
}

export function fadeOpacity(clip: Clip, time: number): number {
  const base = clip.effects.opacity / 100;
  const t = time - clip.start;
  let mult = 1;
  if (clip.effects.fadeIn > 0 && t < clip.effects.fadeIn) {
    mult = Math.min(mult, clamp(t / clip.effects.fadeIn, 0, 1));
  }
  const remaining = clip.duration - t;
  if (clip.effects.fadeOut > 0 && remaining < clip.effects.fadeOut) {
    mult = Math.min(mult, clamp(remaining / clip.effects.fadeOut, 0, 1));
  }
  return clamp(base * mult, 0, 1);
}

export function findSnapTargets(tracks: Track[], excludeClipId?: string): number[] {
  const points = new Set<number>([0]);
  for (const t of tracks) {
    for (const c of t.clips) {
      if (c.id === excludeClipId) continue;
      points.add(round3(c.start));
      points.add(round3(c.start + c.duration));
    }
  }
  return Array.from(points);
}

export function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function snapValue(value: number, targets: number[], threshold: number): number {
  let best = value;
  let bestDist = threshold;
  for (const t of targets) {
    const d = Math.abs(value - t);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

export const TRACK_COLORS: Record<string, string> = {
  video: "#6366f1",
  audio: "#10b981",
  text: "#f59e0b",
};

export const CLIP_PALETTE = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#ef4444",
  "#84cc16",
];

export function pickClipColor(): string {
  return CLIP_PALETTE[Math.floor(Math.random() * CLIP_PALETTE.length)];
}

export function contain(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): { x: number; y: number; w: number; h: number } {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  let w = dstW;
  let h = dstH;
  if (srcRatio > dstRatio) {
    w = dstW;
    h = dstW / srcRatio;
  } else {
    h = dstH;
    w = dstH * srcRatio;
  }
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}
