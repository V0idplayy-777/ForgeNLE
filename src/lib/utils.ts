import { Clip, ClipEffects, Marker, Track } from "../types";

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export const EPS = 1e-4;

export function approx(a: number, b: number, eps = EPS) {
  return Math.abs(a - b) < eps;
}

export function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function snapToFrame(t: number, fps: number) {
  return Math.round(t * fps) / fps;
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
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(fr)}`;
}

export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatBytes(bytes: number) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function getProjectDuration(tracks: Track[]): number {
  let max = 0;
  for (const t of tracks) for (const c of t.clips) max = Math.max(max, c.start + c.duration);
  return max;
}

export function clipEnd(c: Clip) {
  return c.start + c.duration;
}

export function findClip(tracks: Track[], id: string): { clip: Clip; track: Track } | null {
  for (const t of tracks) {
    const c = t.clips.find((x) => x.id === id);
    if (c) return { clip: c, track: t };
  }
  return null;
}

export function allClips(tracks: Track[]): Clip[] {
  return tracks.flatMap((t) => t.clips);
}

/** Clip on the same track that ends exactly where `clip` starts (for transitions). */
export function previousAdjacentClip(track: Track, clip: Clip): Clip | undefined {
  return track.clips.find((c) => c.id !== clip.id && approx(c.start + c.duration, clip.start, 0.02));
}

export function nextAdjacentClip(track: Track, clip: Clip): Clip | undefined {
  return track.clips.find((c) => c.id !== clip.id && approx(c.start, clip.start + clip.duration, 0.02));
}

/** CSS filter string for the "simple" part of a clip's color effects. */
export function cssFilterString(fx: ClipEffects): string {
  const exposureMul = Math.pow(2, fx.exposure / 100);
  const brightness = fx.brightness * exposureMul;
  const parts: string[] = [];
  if (brightness !== 100) parts.push(`brightness(${brightness}%)`);
  if (fx.contrast !== 100) parts.push(`contrast(${fx.contrast}%)`);
  if (fx.saturation !== 100) parts.push(`saturate(${fx.saturation}%)`);
  if (fx.hue !== 0) parts.push(`hue-rotate(${fx.hue}deg)`);
  if (fx.blur > 0) parts.push(`blur(${fx.blur}px)`);
  if (fx.grayscale > 0) parts.push(`grayscale(${fx.grayscale}%)`);
  if (fx.sepia > 0) parts.push(`sepia(${fx.sepia}%)`);
  if (fx.invert > 0) parts.push(`invert(${fx.invert}%)`);
  return parts.length ? parts.join(" ") : "none";
}

export function fadeMultiplier(fadeIn: number, fadeOut: number, local: number, duration: number): number {
  let mult = 1;
  if (fadeIn > 0 && local < fadeIn) mult = Math.min(mult, clamp(local / fadeIn, 0, 1));
  const remaining = duration - local;
  if (fadeOut > 0 && remaining < fadeOut) mult = Math.min(mult, clamp(remaining / fadeOut, 0, 1));
  return mult;
}

export function fadeOpacity(clip: Clip, time: number): number {
  const base = clip.effects.opacity / 100;
  const local = time - clip.start;
  return clamp(base * fadeMultiplier(clip.effects.fadeIn, clip.effects.fadeOut, local, clip.duration), 0, 1);
}

export interface SnapTargets {
  points: number[];
}

export function findSnapTargets(
  tracks: Track[],
  markers: Marker[],
  extra: number[],
  excludeIds: string[] = []
): number[] {
  const points = new Set<number>([0, ...extra.map(round3)]);
  const ex = new Set(excludeIds);
  for (const t of tracks) {
    for (const c of t.clips) {
      if (ex.has(c.id)) continue;
      points.add(round3(c.start));
      points.add(round3(c.start + c.duration));
    }
  }
  for (const m of markers) points.add(round3(m.time));
  return Array.from(points);
}

export function snapValue(value: number, targets: number[], threshold: number): { value: number; snapped: number | null } {
  let best = value;
  let bestDist = threshold;
  let snapped: number | null = null;
  for (const t of targets) {
    const d = Math.abs(value - t);
    if (d < bestDist) {
      bestDist = d;
      best = t;
      snapped = t;
    }
  }
  return { value: best, snapped };
}

export const TRACK_COLORS: Record<string, string> = {
  video: "#6366f1",
  audio: "#10b981",
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
  "#f97316",
  "#14b8a6",
];

export const CLIP_COLOR_LABELS: { label: string; color: string }[] = [
  { label: "Indigo", color: "#6366f1" },
  { label: "Violet", color: "#8b5cf6" },
  { label: "Pink", color: "#ec4899" },
  { label: "Amber", color: "#f59e0b" },
  { label: "Emerald", color: "#10b981" },
  { label: "Cyan", color: "#06b6d4" },
  { label: "Red", color: "#ef4444" },
  { label: "Lime", color: "#84cc16" },
  { label: "Orange", color: "#f97316" },
  { label: "Teal", color: "#14b8a6" },
  { label: "Slate", color: "#64748b" },
];

export function pickClipColor(): string {
  return CLIP_PALETTE[Math.floor(Math.random() * CLIP_PALETTE.length)];
}

export function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function contain(srcW: number, srcH: number, dstW: number, dstH: number): Rect {
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

export function cover(srcW: number, srcH: number, dstW: number, dstH: number): Rect {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  let w = dstW;
  let h = dstH;
  if (srcRatio > dstRatio) {
    h = dstH;
    w = dstH * srcRatio;
  } else {
    w = dstW;
    h = dstW / srcRatio;
  }
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}

export function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

export function modKey() {
  return isMac() ? "⌘" : "Ctrl";
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFilename(name: string) {
  return name.replace(/[^a-z0-9\-_ ]/gi, "").trim().replace(/\s+/g, "-") || "forge-export";
}
