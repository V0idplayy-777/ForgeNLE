// ─────────────────────────────────────────────────────────────────────────────
// Motion / camera presets + compose (split-screen) layouts.
//
// Every motion preset is a pure keyframe generator: given the clip duration,
// frame size and a strength knob it returns keyframe tracks (clip-local
// seconds) plus optional base-transform overrides. Applying a preset only
// replaces the properties it animates — everything else is left alone.
// ─────────────────────────────────────────────────────────────────────────────

import { Clip, Crop, Keyframe, KeyframeMap, Transform, defaultCrop } from "../types";
import { clamp, uid } from "./utils";

export type MotionPresetId =
  | "punch-in"
  | "camera-shake"
  | "push-in"
  | "pull-out"
  | "pan-left"
  | "pan-right"
  | "spin-in"
  | "settle"
  | "swipe-in"
  | "float"
  | "hit-shake"
  | "explosion"
  | "whip-pan"
  | "crash-out"
  | "tension";

export interface MotionPresetDef {
  id: MotionPresetId;
  name: string;
  hint: string;
  group: "Impact" | "Camera" | "Entries";
  /** CSS class for the hover preview dot in the library. */
  previewClass: string;
  /** Base transform the clip settles on after the move (keyframes override). */
  build: (ctx: MotionBuildCtx) => MotionBuildResult;
}

export interface MotionBuildCtx {
  duration: number;
  width: number;
  height: number;
  /** 0.3 .. 2 — scales amplitudes / zoom amounts. */
  strength: number;
  /** The clip's current scale (so presets stack on top of a zoomed clip). */
  startScale: number;
}

export interface MotionBuildResult {
  keyframes: Partial<KeyframeMap>;
  transform?: Partial<Transform>;
}

const kf = (time: number, value: number, easing: Keyframe["easing"] = "ease-in-out"): Keyframe => ({ id: uid("kf"), time, value, easing });

/** Clamp a move length so it always fits inside the clip (min 3 frames-ish). */
function moveLen(d: number, want: number) {
  return clamp(want, 0.15, Math.max(0.15, d));
}

export const MOTION_PRESETS: MotionPresetDef[] = [
  {
    id: "punch-in",
    name: "Punch-in",
    hint: "Fast zoom slam that settles (great on impacts)",
    group: "Impact",
    previewClass: "mp-punch",
    build: ({ duration, strength, startScale }) => {
      const peak = startScale * (1 + 0.42 * strength);
      const rest = startScale * (1 + 0.24 * strength);
      const t1 = moveLen(duration, 0.16);
      const t2 = moveLen(duration, 0.55);
      return {
        keyframes: { scale: [kf(0, startScale, "ease-out"), kf(t1, peak, "ease-in-out"), kf(t2, rest, "ease-in-out")] },
        transform: { scale: rest },
      };
    },
  },
  {
    id: "camera-shake",
    name: "Camera shake",
    hint: "Decaying vibration — drops in hard and settles out",
    group: "Impact",
    previewClass: "mp-shake",
    build: ({ duration, width, height, strength }) => {
      const T = moveLen(duration, 0.9);
      const ax = 0.022 * width * strength; // ~42px @1080p, strength 1
      const ay = 0.016 * height * strength;
      const rot = 1.1 * strength;
      const steps = 15;
      const x: Keyframe[] = [kf(0, 0, "linear")];
      const y: Keyframe[] = [kf(0, 0, "linear")];
      const r: Keyframe[] = [kf(0, 0, "linear")];
      for (let i = 1; i <= steps; i++) {
        const t = (T * i) / steps;
        const decay = Math.exp(-3.4 * (i / steps));
        // deterministic pseudo-random jitter so preview + export agree
        const jx = Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 4.1414) * 0.5;
        const jy = Math.sin(i * 7.2331) * 0.5 + Math.sin(i * 9.777) * 0.5;
        const last = i === steps;
        x.push(kf(t, last ? 0 : ax * decay * (i % 2 ? 1 : -0.72) * (0.7 + 0.3 * jx), "linear"));
        y.push(kf(t, last ? 0 : ay * decay * (i % 2 ? -0.8 : 1) * (0.7 + 0.3 * jy), "linear"));
        r.push(kf(t, last ? 0 : rot * decay * (i % 2 ? -1 : 1), "linear"));
      }
      return { keyframes: { x, y, rotation: r } };
    },
  },
  {
    id: "push-in",
    name: "Push in",
    hint: "Slow continuous zoom in across the clip",
    group: "Camera",
    previewClass: "mp-push",
    build: ({ duration, strength, startScale }) => {
      const to = startScale * (1 + 0.14 * strength);
      return {
        keyframes: { scale: [kf(0, startScale, "linear"), kf(duration, to, "linear")] },
        transform: { scale: to },
      };
    },
  },
  {
    id: "pull-out",
    name: "Pull out",
    hint: "Starts tight, eases back to full frame",
    group: "Camera",
    previewClass: "mp-pull",
    build: ({ duration, strength, startScale }) => {
      const from = startScale * (1 + 0.18 * strength);
      return {
        keyframes: { scale: [kf(0, from, "ease-out"), kf(duration, startScale, "ease-out")] },
        transform: { scale: startScale },
      };
    },
  },
  {
    id: "pan-left",
    name: "Pan left",
    hint: "Drifts left across the clip (edge-safe zoom baked in)",
    group: "Camera",
    previewClass: "mp-panl",
    build: ({ duration, width, strength, startScale }) => {
      const a = 0.055 * width * strength;
      const scale = Math.max(startScale, 1 + 0.12 * strength);
      return {
        keyframes: { x: [kf(0, a, "linear"), kf(duration, -a, "linear")] },
        transform: { scale },
      };
    },
  },
  {
    id: "pan-right",
    name: "Pan right",
    hint: "Drifts right across the clip (edge-safe zoom baked in)",
    group: "Camera",
    previewClass: "mp-panr",
    build: ({ duration, width, strength, startScale }) => {
      const a = 0.055 * width * strength;
      const scale = Math.max(startScale, 1 + 0.12 * strength);
      return {
        keyframes: { x: [kf(0, -a, "linear"), kf(duration, a, "linear")] },
        transform: { scale },
      };
    },
  },
  {
    id: "spin-in",
    name: "Spin-in",
    hint: "Tumbles in from off-angle and snaps upright",
    group: "Entries",
    previewClass: "mp-spin",
    build: ({ duration, strength }) => {
      const T = moveLen(duration, 0.65);
      return {
        keyframes: {
          rotation: [kf(0, -160 * strength, "ease-out"), kf(T, 0, "ease-out")],
          scale: [kf(0, 0.25, "ease-out"), kf(T, 1, "ease-out")],
        },
        transform: { rotation: 0, scale: 1 },
      };
    },
  },
  {
    id: "settle",
    name: "Settle",
    hint: "Overshoots its mark, bounces, locks in",
    group: "Entries",
    previewClass: "mp-settle",
    build: ({ duration, strength, startScale }) => {
      const over = startScale * (1 + 0.2 * strength);
      const under = startScale * (1 - 0.07 * strength);
      const t1 = moveLen(duration, 0.24);
      const t2 = moveLen(duration, 0.58);
      return {
        keyframes: { scale: [kf(0, over, "ease-out"), kf(t1, under, "ease-in-out"), kf(t2, startScale, "ease-in-out")] },
        transform: { scale: startScale },
      };
    },
  },
  {
    id: "swipe-in",
    name: "Swipe-in",
    hint: "Slams in from the left with a hint of rotation",
    group: "Entries",
    previewClass: "mp-swipe",
    build: ({ duration, width, strength }) => {
      const T = moveLen(duration, 0.42);
      const from = -0.65 * width * (0.6 + 0.4 * strength);
      return {
        keyframes: {
          x: [kf(0, from, "ease-out"), kf(T, 0, "ease-out")],
          rotation: [kf(0, -7 * strength, "ease-out"), kf(T, 0, "ease-out")],
        },
        transform: { rotation: 0 },
      };
    },
  },
  {
    id: "hit-shake",
    name: "Hit shake",
    hint: "Violent short shake for punches, kills and impacts",
    group: "Impact",
    previewClass: "mp-hit",
    build: ({ duration, width, height, strength }) => {
      const T = moveLen(duration, 0.5);
      const ax = 0.035 * width * strength;
      const ay = 0.026 * height * strength;
      const rot = 2.2 * strength;
      const steps = 11;
      const x: Keyframe[] = [kf(0, 0, "linear")];
      const y: Keyframe[] = [kf(0, 0, "linear")];
      const r: Keyframe[] = [kf(0, 0, "linear")];
      for (let i = 1; i <= steps; i++) {
        const t = (T * i) / steps;
        const decay = Math.exp(-4.2 * (i / steps));
        const last = i === steps;
        const sx = i % 2 ? 1 : -0.85;
        const sy = i % 2 ? -0.9 : 1;
        x.push(kf(t, last ? 0 : ax * decay * sx, "linear"));
        y.push(kf(t, last ? 0 : ay * decay * sy, "linear"));
        r.push(kf(t, last ? 0 : rot * decay * (i % 2 ? -1 : 1), "linear"));
      }
      return { keyframes: { x, y, rotation: r } };
    },
  },
  {
    id: "explosion",
    name: "Explosion",
    hint: "Zoom blast with shake — kill confirms, TNT, clutch plays",
    group: "Impact",
    previewClass: "mp-explosion",
    build: ({ duration, width, height, strength, startScale }) => {
      const T = moveLen(duration, 0.7);
      const peak = startScale * (1 + 0.38 * strength);
      const rest = startScale * (1 + 0.16 * strength);
      const ax = 0.018 * width * strength;
      const ay = 0.014 * height * strength;
      const steps = 12;
      const x: Keyframe[] = [kf(0, 0, "linear")];
      const y: Keyframe[] = [kf(0, 0, "linear")];
      for (let i = 1; i <= steps; i++) {
        const t = (T * i) / steps;
        const decay = Math.exp(-3.2 * (i / steps));
        const last = i === steps;
        x.push(kf(t, last ? 0 : ax * decay * (i % 2 ? 1 : -0.8), "linear"));
        y.push(kf(t, last ? 0 : ay * decay * (i % 2 ? -0.9 : 1), "linear"));
      }
      return {
        keyframes: {
          scale: [kf(0, startScale, "ease-out"), kf(moveLen(duration, 0.14), peak, "ease-in-out"), kf(T, rest, "ease-in-out")],
          x,
          y,
        },
        transform: { scale: rest },
      };
    },
  },
  {
    id: "whip-pan",
    name: "Whip pan",
    hint: "Violent sideways whip — hides cuts, adds speed",
    group: "Impact",
    previewClass: "mp-whip",
    build: ({ duration, width, strength }) => {
      const T = moveLen(duration, 0.34);
      const from = -0.42 * width * strength;
      return {
        keyframes: {
          x: [kf(0, from, "ease-out"), kf(T, 0, "ease-out")],
          rotation: [kf(0, -5 * strength, "ease-out"), kf(T, 0, "ease-out")],
        },
        transform: { rotation: 0 },
      };
    },
  },
  {
    id: "crash-out",
    name: "Crash zoom out",
    hint: "Slams in close, then snaps back to wide",
    group: "Impact",
    previewClass: "mp-crash",
    build: ({ duration, strength, startScale }) => {
      const peak = startScale * (1 + 0.5 * strength);
      const t1 = moveLen(duration, 0.16);
      const t2 = moveLen(duration, 0.6);
      return {
        keyframes: { scale: [kf(0, startScale, "ease-out"), kf(t1, peak, "ease-in-out"), kf(t2, startScale, "ease-in-out")] },
        transform: { scale: startScale },
      };
    },
  },
  {
    id: "tension",
    name: "Tension jitter",
    hint: "Subtle high-frequency tremble for the whole clip — 'wait for it…'",
    group: "Impact",
    previewClass: "mp-tension",
    build: ({ duration, width, height, strength }) => {
      const ax = 0.004 * width * strength;
      const ay = 0.0035 * height * strength;
      const cycles = Math.max(2, Math.round(duration * 9));
      const N = cycles * 4;
      const x: Keyframe[] = [];
      const y: Keyframe[] = [];
      for (let i = 0; i <= N; i++) {
        const t = (duration * i) / N;
        const p = (2 * Math.PI * i * cycles) / N;
        // fade the jitter in over the first 10% so it doesn't pop
        const env = clamp(t / Math.max(0.05, duration * 0.1), 0, 1);
        x.push(kf(t, Math.sin(p) * ax * env, "linear"));
        y.push(kf(t, Math.cos(p * 1.13) * ay * env, "linear"));
      }
      return { keyframes: { x, y } };
    },
  },
  {
    id: "float",
    name: "Float / drift",
    hint: "Gentle looping drift — keeps static shots alive",
    group: "Camera",
    previewClass: "mp-float",
    build: ({ duration, width, height, strength }) => {
      const ax = 0.014 * width * strength;
      const ay = 0.012 * height * strength;
      const N = 8; // one full loop, ends where it started
      const x: Keyframe[] = [];
      const y: Keyframe[] = [];
      for (let i = 0; i <= N; i++) {
        const t = (duration * i) / N;
        const p = (2 * Math.PI * i) / N;
        x.push(kf(t, Math.sin(p) * ax, "linear"));
        y.push(kf(t, Math.cos(p) * ay, "linear"));
      }
      return { keyframes: { x, y } };
    },
  },
];

export function motionPresetById(id: MotionPresetId) {
  return MOTION_PRESETS.find((p) => p.id === id);
}

// ── Compose layouts ─────────────────────────────────────────────────────────

export type ComposeLayoutId = "side-by-side" | "stacked" | "grid-2x2" | "pip" | "triptych" | "spotlight";

export interface ComposeLayoutDef {
  id: ComposeLayoutId;
  name: string;
  hint: string;
  /** How many clips this layout arranges. */
  slots: number;
}

export const COMPOSE_LAYOUTS: ComposeLayoutDef[] = [
  { id: "side-by-side", name: "Side by side", hint: "Two halves left / right", slots: 2 },
  { id: "stacked", name: "Stacked", hint: "Two halves top / bottom", slots: 2 },
  { id: "grid-2x2", name: "2 × 2 grid", hint: "Four quadrants", slots: 4 },
  { id: "pip", name: "Picture-in-picture", hint: "Full frame + corner insert", slots: 2 },
  { id: "triptych", name: "Triptych", hint: "Three columns", slots: 3 },
  { id: "spotlight", name: "Spotlight + detail", hint: "Hero left, stack of details right", slots: 3 },
];

interface Cell {
  /** Fractions of the frame (0..1), x/y = top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
}

export function layoutCells(id: ComposeLayoutId, n: number): Cell[] {
  switch (id) {
    case "side-by-side":
      return n >= 3 ? columns(Math.min(n, 4)) : [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }];
    case "stacked":
      return [
        { x: 0, y: 0, w: 1, h: 0.5 },
        { x: 0, y: 0.5, w: 1, h: 0.5 },
      ];
    case "grid-2x2":
      return [
        { x: 0, y: 0, w: 0.5, h: 0.5 },
        { x: 0.5, y: 0, w: 0.5, h: 0.5 },
        { x: 0, y: 0.5, w: 0.5, h: 0.5 },
        { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      ];
    case "pip": {
      const cells: Cell[] = [{ x: 0, y: 0, w: 1, h: 1 }];
      // extra inserts cycle the corners
      const corners: Cell[] = [
        { x: 0.67, y: 0.67, w: 0.29, h: 0.29, radius: 0.012 },
        { x: 0.04, y: 0.67, w: 0.29, h: 0.29, radius: 0.012 },
        { x: 0.04, y: 0.04, w: 0.29, h: 0.29, radius: 0.012 },
      ];
      for (let i = 1; i < Math.max(2, n); i++) cells.push(corners[(i - 1) % corners.length]);
      return cells;
    }
    case "triptych":
      return columns(Math.max(3, Math.min(n, 4)));
    case "spotlight": {
      if (n <= 2) return [{ x: 0, y: 0, w: 0.66, h: 1 }, { x: 0.66, y: 0, w: 0.34, h: 1 }];
      return [
        { x: 0, y: 0, w: 0.66, h: 1 },
        { x: 0.66, y: 0, w: 0.34, h: 0.5 },
        { x: 0.66, y: 0.5, w: 0.34, h: 0.5 },
      ];
    }
  }
}

function columns(n: number): Cell[] {
  return Array.from({ length: n }, (_, i) => ({ x: i / n, y: 0, w: 1 / n, h: 1 }));
}

export interface ComposeTarget {
  clip: Clip;
  /** Source aspect (w/h); falls back to the frame aspect when unknown. */
  srcAspect: number | null;
}

export interface ComposePatch {
  transform: Transform;
  fit: Clip["fit"];
  crop: Crop;
  cornerRadius: number;
}

/**
 * Computes the patch that stuffs a clip into one cell of a composition.
 *
 * Strategy: fit "cover" makes the source cover the whole frame; we then crop
 * the fitted rect down to the cell's aspect ratio (centre-crop) and uniformly
 * scale it to the cell size. The result fills the cell exactly with no spill
 * into neighbouring cells — a proper split screen rather than two overlapping
 * rectangles.
 */
export function composeCell(target: ComposeTarget, cell: Cell, W: number, H: number, gapPx: number): ComposePatch {
  const { x, y, w, h } = cell;
  // Inset on internal edges only so the composition stays full-bleed.
  const x0 = x * W + (x > 0.001 ? gapPx / 2 : 0);
  const y0 = y * H + (y > 0.001 ? gapPx / 2 : 0);
  const x1 = (x + w) * W - (x + w < 0.999 ? gapPx / 2 : 0);
  const y1 = (y + h) * H - (y + h < 0.999 ? gapPx / 2 : 0);
  const cw = Math.max(8, x1 - x0);
  const ch = Math.max(8, y1 - y0);

  const frameAspect = W / H;
  const srcAspect = target.srcAspect && isFinite(target.srcAspect) ? target.srcAspect : frameAspect;
  // cover-fit rect (aspect of the source, covering the frame)
  const fw = srcAspect > frameAspect ? H * srcAspect : W;
  const fh = srcAspect > frameAspect ? H : W / srcAspect;

  const cellAspect = cw / ch;
  const crop = defaultCrop();
  let wv = fw;
  let hv = fh;
  if (srcAspect > cellAspect) {
    // too wide: crop the sides so the visible rect matches the cell aspect
    // (Crop is percent of source, 0..100)
    wv = cellAspect * fh;
    const t = Math.max(0, 1 - wv / fw) * 100;
    crop.left = t / 2;
    crop.right = t / 2;
  } else {
    // too tall: crop top/bottom
    hv = fw / cellAspect;
    const t = Math.max(0, 1 - hv / fh) * 100;
    crop.top = t / 2;
    crop.bottom = t / 2;
  }
  const scale = cw / wv; // == ch / hv by construction
  return {
    transform: { x: x0 + cw / 2 - W / 2, y: y0 + ch / 2 - H / 2, scale, rotation: 0 },
    fit: "cover",
    crop,
    cornerRadius: cell.radius ? Math.round(cell.radius * Math.min(W, H)) : 0,
  };
}

export function composeLayoutById(id: ComposeLayoutId) {
  return COMPOSE_LAYOUTS.find((l) => l.id === id);
}

export { kf as motionKeyframe };
