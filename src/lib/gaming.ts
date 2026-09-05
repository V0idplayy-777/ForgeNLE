// ─────────────────────────────────────────────────────────────────────────────
// Forge NLE — gaming / Caylus-style edit builders.
//
// Pure helpers behind the Gaming tab: zoom-cut tracks, beat pops, facecam
// geometry and montage range math. The store actions consume these so the
// timeline mutations stay in one place.
// ─────────────────────────────────────────────────────────────────────────────

import { Clip, Crop, Keyframe, Transform } from "../types";
import { clamp, uid } from "./utils";

const kf = (time: number, value: number, easing: Keyframe["easing"] = "linear"): Keyframe => ({
  id: uid("kf"),
  time,
  value,
  easing,
});

// ── Zoom cuts ───────────────────────────────────────────────────────────────

export type ZoomCutMode = "alternate" | "ramp-in" | "random";

export interface ZoomCutOpts {
  /** Seconds between punches. */
  interval: number;
  /** Punch depth as a fraction, e.g. 0.12 = 112%. */
  amount: number;
  mode: ZoomCutMode;
  fps: number;
}

/**
 * Builds a stepped scale track: snappy ~1-frame ramps between punch levels so
 * playback looks like hard zoom cuts rather than smooth zooms.
 */
export function zoomCutScaleTrack(duration: number, base: number, opts: ZoomCutOpts): Keyframe[] {
  const { interval, amount, mode, fps } = opts;
  const chunks = Math.max(1, Math.round(duration / Math.max(0.2, interval)));
  const segLen = duration / chunks;
  const eps = 0.6 / Math.max(1, fps);
  const level = (i: number): number => {
    if (mode === "alternate") return i % 2 === 0 ? base : base * (1 + amount);
    if (mode === "ramp-in") return base * (1 + amount * (chunks <= 1 ? 1 : i / (chunks - 1)));
    // deterministic pseudo-random in [base, base*(1+amount)]
    const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    return base * (1 + amount * (0.35 + 0.65 * r));
  };
  const track: Keyframe[] = [kf(0, level(0))];
  for (let i = 1; i < chunks; i++) {
    const b = i * segLen;
    const prev = level(i - 1);
    const next = level(i);
    if (Math.abs(prev - next) < 1e-4) continue;
    track.push(kf(Math.max(0, b - eps), prev));
    track.push(kf(b, next));
  }
  track.push(kf(duration, level(chunks - 1)));
  return track.sort((a, b) => a.time - b.time);
}

// ── Beat punch ──────────────────────────────────────────────────────────────

export interface BeatPunchOpts {
  /** Pop height as a fraction, e.g. 0.1 = 110% at the hit. */
  amount: number;
}

/** Quick attack + smooth decay scale pops at each hit time (clip-local secs). */
export function popTrackAtTimes(duration: number, base: number, times: number[], opts: BeatPunchOpts): Keyframe[] {
  const peak = base * (1 + opts.amount);
  const attack = 0.06;
  const decay = 0.3;
  const hits = [...times].filter((t) => t > 0.02 && t < duration - 0.02).sort((a, b) => a - b);
  const track: Keyframe[] = [kf(0, base, "ease-out")];
  for (const h of hits) {
    const a = Math.max(0, h - attack);
    // skip the wind-up if it would collide with the previous decay
    const last = track[track.length - 1];
    if (a > last.time + 0.02) track.push(kf(a, base, "ease-out"));
    track.push(kf(h, peak, "ease-in-out"));
    const d = Math.min(duration, h + decay);
    track.push(kf(d, base, "ease-in-out"));
  }
  track.push(kf(duration, base, "ease-in-out"));
  // enforce strictly increasing times (fast beats can overlap decays)
  track.sort((a, b) => a.time - b.time);
  for (let i = 1; i < track.length; i++) {
    if (track[i].time <= track[i - 1].time) track[i].time = track[i - 1].time + 0.001;
  }
  return track;
}

// ── Facecam ─────────────────────────────────────────────────────────────────

export type FacecamPresetId = "circle-br" | "rounded-br" | "circle-bl" | "side-right";

export interface FacecamPresetDef {
  id: FacecamPresetId;
  name: string;
  hint: string;
}

export const FACECAM_PRESETS: FacecamPresetDef[] = [
  { id: "circle-br", name: "Circle · BR", hint: "Classic circle cam, bottom-right" },
  { id: "rounded-br", name: "Rounded · BR", hint: "Rounded rectangle, bottom-right" },
  { id: "circle-bl", name: "Circle · BL", hint: "Circle cam, bottom-left" },
  { id: "side-right", name: "Side bar", hint: "Full-height cam strip on the right" },
];

export interface FacecamOpts {
  /** Diameter (circle/rounded) as a fraction of the smaller frame side. */
  size: number;
  /** Border ring thickness in px (0 = none). */
  border: number;
  borderColor: string;
}

export interface FacecamPatch {
  transform: Transform;
  fit: Clip["fit"];
  crop: Crop;
  cornerRadius: number;
  border: {
    shape: "ellipse" | "rectangle";
    wPct: number;
    hPct: number;
    x: number;
    y: number;
    strokeWidth: number;
    strokeColor: string;
    cornerRadius: number;
  } | null;
}

/**
 * Stuffs a source into a facecam cell. Circle presets centre-crop the source
 * to a square; the side preset fills a right-hand strip (cover-cropped).
 */
export function facecamPatch(
  preset: FacecamPresetId,
  W: number,
  H: number,
  srcAspect: number | null,
  opts: FacecamOpts
): FacecamPatch {
  const aspect = srcAspect && isFinite(srcAspect) && srcAspect > 0 ? srcAspect : W / H;
  const frameAspect = W / H;
  // cover-fit rect of the source over the full frame
  const fw = aspect > frameAspect ? H * aspect : W;
  const fh = aspect > frameAspect ? H : W / aspect;
  const margin = 0.03 * Math.min(W, H);

  if (preset === "side-right") {
    const cellW = 0.22 * W;
    const cellH = H;
    const cellAspect = cellW / cellH;
    const crop: Crop = { left: 0, top: 0, right: 0, bottom: 0 };
    let wv = fw;
    let hv = fh;
    if (aspect > cellAspect) {
      wv = cellAspect * fh;
      const t = Math.max(0, 1 - wv / fw) * 100;
      crop.left = t / 2;
      crop.right = t / 2;
    } else {
      hv = fw / cellAspect;
      const t = Math.max(0, 1 - hv / fh) * 100;
      crop.top = t / 2;
      crop.bottom = t / 2;
    }
    const scale = cellW / wv;
    const cx = W - cellW / 2;
    return {
      transform: { x: cx - W / 2, y: 0, scale, rotation: 0 },
      fit: "cover",
      crop,
      cornerRadius: 0,
      border: null,
    };
  }

  // circle / rounded: square centre-crop
  const crop: Crop = { left: 0, top: 0, right: 0, bottom: 0 };
  let side: number;
  if (aspect > 1) {
    const t = (1 - fh / fw) * 100;
    crop.left = t / 2;
    crop.right = t / 2;
    side = fh;
  } else if (aspect < 1) {
    const t = (1 - fw / fh) * 100;
    crop.top = t / 2;
    crop.bottom = t / 2;
    side = fw;
  } else {
    side = fw;
  }
  const D = clamp(opts.size, 0.12, 0.5) * Math.min(W, H);
  const scale = D / side;
  const right = preset !== "circle-bl";
  const cx = right ? W - margin - D / 2 : margin + D / 2;
  const cy = H - margin - D / 2;
  const circle = preset.startsWith("circle");
  const b = Math.max(0, opts.border);
  return {
    transform: { x: cx - W / 2, y: cy - H / 2, scale, rotation: 0 },
    fit: "cover",
    crop,
    cornerRadius: circle ? 4000 : Math.round(30 / scale),
    border:
      b > 0
        ? {
            shape: circle ? "ellipse" : "rectangle",
            wPct: ((D + b * 2) / W) * 100,
            hPct: ((D + b * 2) / H) * 100,
            x: cx - W / 2,
            y: cy - H / 2,
            strokeWidth: b,
            strokeColor: opts.borderColor,
            cornerRadius: circle ? 4000 : Math.round(30 + b * 1.5),
          }
        : null,
  };
}

// ── Montage ranges ──────────────────────────────────────────────────────────

export interface MontageRange {
  start: number;
  end: number;
  label: string;
  color: string;
}

/** Marker times → merged keep-ranges, clamped to the project. */
export function montageRanges(
  markers: { time: number; label: string; color: string }[],
  pre: number,
  post: number,
  maxDur: number
): MontageRange[] {
  const sorted = [...markers].sort((a, b) => a.time - b.time);
  const ranges: MontageRange[] = [];
  for (const m of sorted) {
    const s = clamp(m.time - pre, 0, maxDur);
    const e = clamp(m.time + post, 0, maxDur);
    if (e - s < 0.1) continue;
    const last = ranges[ranges.length - 1];
    if (last && s <= last.end + 0.05) {
      last.end = Math.max(last.end, e);
      last.label = `${last.label} + ${m.label}`;
    } else {
      ranges.push({ start: s, end: e, label: m.label, color: m.color });
    }
  }
  return ranges;
}

// ── Caption burst ───────────────────────────────────────────────────────────

export interface BurstStyle {
  presetId: string;
  x: number;
  y: number;
  rotation: number;
}

/** Cycles meme caption looks so a burst feels varied without any tweaking. */
export const BURST_STYLES: BurstStyle[] = [
  { presetId: "em-boom", x: 0, y: -260, rotation: -3 },
  { presetId: "em-wait-what", x: 0, y: 200, rotation: 2 },
  { presetId: "em-lol", x: -320, y: -80, rotation: -6 },
  { presetId: "em-hold-up", x: 0, y: 320, rotation: 0 },
  { presetId: "em-omg", x: 300, y: -200, rotation: 5 },
  { presetId: "em-nope", x: 0, y: 60, rotation: -2 },
];
