// ─────────────────────────────────────────────────────────────────────────────
// Forge NLE — canvas compositor. Used by both the live preview and the export
// pipeline so what you see is exactly what you get.
// ─────────────────────────────────────────────────────────────────────────────

import { Clip, MediaAsset, ProjectSettings, TextStyle, Track, Transition, TransitionType } from "../types";
import { evaluateClip, ease, sourceOffsetAt, sourceSpan } from "./keyframes";
import { clamp, contain, cover, cssFilterString, fadeMultiplier, hexToRgba, previousAdjacentClip, Rect } from "./utils";

export type FrameSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

export interface RenderContext {
  settings: ProjectSettings;
  tracks: Track[];
  assets: MediaAsset[];
  /** Returns a drawable source for a media clip, or null when not ready. */
  getSource: (clip: Clip) => FrameSource | null;
  /** Mute solo logic etc. is not needed here; visibility only. */
}

export interface ClipBounds {
  cx: number; // center in frame px (after transform offset)
  cy: number;
  w: number; // unscaled content width in frame px
  h: number;
  scale: number;
  rotation: number; // deg
}

const scratchCanvases: HTMLCanvasElement[] = [];
function getScratch(idx: number, w: number, h: number) {
  let c = scratchCanvases[idx];
  if (!c) {
    c = document.createElement("canvas");
    scratchCanvases[idx] = c;
  }
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx() {
  if (!measureCtx) {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 4;
    measureCtx = c.getContext("2d")!;
  }
  return measureCtx;
}

function sourceSize(src: FrameSource | null): { w: number; h: number } | null {
  if (!src) return null;
  const v = src as HTMLVideoElement;
  if (v.videoWidth) return { w: v.videoWidth, h: v.videoHeight };
  const i = src as HTMLImageElement;
  if (i.naturalWidth) return { w: i.naturalWidth, h: i.naturalHeight };
  const c = src as HTMLCanvasElement;
  if (c.width) return { w: c.width, h: c.height };
  return null;
}

// ── Public helpers ──────────────────────────────────────────────────────────

export function isClipActive(clip: Clip, t: number) {
  return t >= clip.start && t < clip.start + clip.duration;
}

/** Source (media) time for a clip at timeline time t. */
export function sourceTime(clip: Clip, t: number, asset?: MediaAsset) {
  const local = clamp(t - clip.start, 0, clip.duration);
  const max = asset?.duration ?? Infinity;
  const offset = sourceOffsetAt(clip, local);
  let st: number;
  if (clip.reverse) {
    // Reverse plays from the end of the covered span back towards trimIn.
    st = clip.trimIn + sourceSpan(clip) - offset;
  } else {
    st = clip.trimIn + offset;
  }
  return clamp(st, 0, isFinite(max) ? Math.max(0, max - 0.001) : st);
}

/** Outgoing transition length for a clip (the next adjacent clip's transition). */
export function outgoingTransition(track: Track, clip: Clip): Transition | undefined {
  const end = clip.start + clip.duration;
  const next = track.clips.find((c) => c.id !== clip.id && Math.abs(c.start - end) < 0.02 && c.transitionIn && c.transitionIn.type !== "none");
  return next?.transitionIn;
}

/** Time range in which a clip's media must be available (includes outgoing transition tail). */
export function clipActiveRange(track: Track, clip: Clip): [number, number] {
  const out = outgoingTransition(track, clip);
  return [clip.start, clip.start + clip.duration + (out ? out.duration : 0)];
}

export function fontString(style: TextStyle) {
  return `${style.italic ? "italic " : ""}${style.fontWeight} ${style.fontSize}px "${style.fontFamily}", Inter, sans-serif`;
}

export interface TextLayout {
  lines: string[];
  lineWidths: number[];
  width: number;
  height: number;
  lineHeight: number;
  boxWidth: number;
  boxHeight: number;
}

export function layoutText(style: TextStyle, frameWidth: number, ctx?: CanvasRenderingContext2D): TextLayout {
  const c = ctx ?? getMeasureCtx();
  c.save();
  c.font = fontString(style);
  // letter spacing support (Chrome/Edge/Safari 17+)
  (c as any).letterSpacing = `${style.letterSpacing}px`;
  const content = style.uppercase ? style.content.toUpperCase() : style.content;
  const maxW = (style.maxWidth / 100) * frameWidth;
  const rawLines = content.split("\n");
  const lines: string[] = [];
  for (const raw of rawLines) {
    const words = raw.split(/(\s+)/);
    let cur = "";
    for (const w of words) {
      const test = cur + w;
      if (c.measureText(test).width > maxW && cur.trim().length > 0) {
        lines.push(cur.trimEnd());
        cur = w.trimStart();
      } else {
        cur = test;
      }
    }
    lines.push(cur);
  }
  const lineWidths = lines.map((l) => c.measureText(l).width);
  const width = Math.max(1, ...lineWidths);
  const lineHeight = style.fontSize * style.lineHeight;
  const height = lineHeight * lines.length;
  c.restore();
  const boxWidth = width + (style.boxEnabled ? style.boxPaddingX * 2 : 0);
  const boxHeight = height + (style.boxEnabled ? style.boxPaddingY * 2 : 0);
  return { lines, lineWidths, width, height, lineHeight, boxWidth, boxHeight };
}

/** Content rect (unscaled, centered at origin) for a clip. */
export function contentRect(clip: Clip, srcW: number, srcH: number, W: number, H: number): Rect {
  let r: Rect;
  switch (clip.fit) {
    case "cover":
      r = cover(srcW, srcH, W, H);
      break;
    case "stretch":
      r = { x: 0, y: 0, w: W, h: H };
      break;
    case "none":
      r = { x: (W - srcW) / 2, y: (H - srcH) / 2, w: srcW, h: srcH };
      break;
    default:
      r = contain(srcW, srcH, W, H);
  }
  return { x: r.x - W / 2, y: r.y - H / 2, w: r.w, h: r.h };
}

export function getClipBounds(clip: Clip, t: number, settings: ProjectSettings, src: FrameSource | null): ClipBounds | null {
  const W = settings.width;
  const H = settings.height;
  const local = t - clip.start;
  const anim = evaluateClip(clip, local);
  let w = W;
  let h = H;
  if (clip.kind === "media") {
    const size = sourceSize(src);
    if (size) {
      const r = contentRect(clip, size.w, size.h, W, H);
      const cropW = 1 - (clip.crop.left + clip.crop.right) / 100;
      const cropH = 1 - (clip.crop.top + clip.crop.bottom) / 100;
      w = r.w * cropW;
      h = r.h * cropH;
    }
  } else if (clip.kind === "text" && clip.text) {
    const lay = layoutText(clip.text, W);
    w = lay.boxWidth;
    h = lay.boxHeight;
  } else if (clip.kind === "solid" && clip.solid) {
    w = (clip.solid.width / 100) * W;
    h = (clip.solid.height / 100) * H;
  }
  let cx = W / 2 + anim.x;
  let cy = H / 2 + anim.y;
  if (clip.kind === "media") {
    const size = sourceSize(src);
    if (size) {
      const r = contentRect(clip, size.w, size.h, W, H);
      // crop shifts the visual center
      const offX = ((clip.crop.left - clip.crop.right) / 200) * r.w;
      const offY = ((clip.crop.top - clip.crop.bottom) / 200) * r.h;
      const rad = (anim.rotation * Math.PI) / 180;
      cx += (offX * Math.cos(rad) - offY * Math.sin(rad)) * anim.scale;
      cy += (offX * Math.sin(rad) + offY * Math.cos(rad)) * anim.scale;
    }
  }
  return { cx, cy, w, h, scale: anim.scale, rotation: anim.rotation };
}

// ── Transitions ─────────────────────────────────────────────────────────────

interface TransState {
  inAlpha: number;
  outAlpha: number;
  inDx: number;
  inDy: number;
  outDx: number;
  outDy: number;
  inScale: number;
  outScale: number;
  inBlur: number;
  outBlur: number;
  inClip?: (ctx: CanvasRenderingContext2D, W: number, H: number) => void;
  overlay?: { color: string; alpha: number };
  glitchSeed?: number;
}

function transState(type: TransitionType, p: number, W: number, H: number): TransState {
  const e = ease(p, "ease-in-out");
  const s: TransState = {
    inAlpha: 1,
    outAlpha: 1,
    inDx: 0,
    inDy: 0,
    outDx: 0,
    outDy: 0,
    inScale: 1,
    outScale: 1,
    inBlur: 0,
    outBlur: 0,
  };
  switch (type) {
    case "crossfade":
      s.inAlpha = e;
      break;
    case "dip-black":
    case "dip-white": {
      s.outAlpha = 1;
      s.inAlpha = p >= 0.5 ? 1 : 0;
      s.overlay = { color: type === "dip-black" ? "#000000" : "#ffffff", alpha: 1 - Math.abs(2 * p - 1) };
      break;
    }
    case "wipe-left":
      s.inClip = (ctx) => ctx.rect(W * (1 - e), 0, W * e + 1, H);
      break;
    case "wipe-right":
      s.inClip = (ctx) => ctx.rect(0, 0, W * e + 1, H);
      break;
    case "wipe-up":
      s.inClip = (ctx) => ctx.rect(0, H * (1 - e), W, H * e + 1);
      break;
    case "wipe-down":
      s.inClip = (ctx) => ctx.rect(0, 0, W, H * e + 1);
      break;
    case "iris": {
      const r = Math.hypot(W, H) * 0.5 * e;
      s.inClip = (ctx) => ctx.arc(W / 2, H / 2, Math.max(0.01, r), 0, Math.PI * 2);
      break;
    }
    case "slide-left":
      s.inDx = W * (1 - e);
      break;
    case "slide-right":
      s.inDx = -W * (1 - e);
      break;
    case "slide-up":
      s.inDy = H * (1 - e);
      break;
    case "slide-down":
      s.inDy = -H * (1 - e);
      break;
    case "push-left":
      s.inDx = W * (1 - e);
      s.outDx = -W * e;
      break;
    case "push-right":
      s.inDx = -W * (1 - e);
      s.outDx = W * e;
      break;
    case "zoom-in":
      s.inAlpha = e;
      s.inScale = 1.5 - 0.5 * e;
      s.outScale = 1 + 0.25 * e;
      break;
    case "zoom-out":
      s.inAlpha = e;
      s.inScale = 0.6 + 0.4 * e;
      s.outScale = 1 - 0.1 * e;
      break;
    case "blur":
      s.inAlpha = e;
      s.inBlur = (1 - e) * 24;
      s.outBlur = e * 24;
      break;
    case "glitch-cut":
      s.glitchSeed = Math.floor(p * 14);
      s.inAlpha = 1;
      s.outAlpha = p < 0.35 ? 1 : 0;
      break;
  }
  return s;
}

// ── Main render ─────────────────────────────────────────────────────────────

export function renderFrame(ctx: CanvasRenderingContext2D, rc: RenderContext, t: number) {
  const { settings, tracks } = rc;
  const W = settings.width;
  const H = settings.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Fit project frame into actual canvas
  const sx = ctx.canvas.width / W;
  const sy = ctx.canvas.height / H;
  ctx.scale(sx, sy);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.fillStyle = settings.background;
  ctx.fillRect(0, 0, W, H);

  const anySolo = tracks.some((tr) => tr.type === "video" && tr.solo);
  // Draw from bottom track (last in array) to top (first in array).
  for (let i = tracks.length - 1; i >= 0; i--) {
    const track = tracks[i];
    if (track.type !== "video" || track.hidden) continue;
    if (anySolo && !track.solo) continue;
    const clips = [...track.clips].sort((a, b) => a.start - b.start);
    for (const clip of clips) {
      if (!isClipActive(clip, t)) continue;
      const local = t - clip.start;
      const tin = clip.transitionIn;
      if (tin && tin.type !== "none" && local < tin.duration) {
        const prev = previousAdjacentClip(track, clip);
        const p = clamp(local / tin.duration, 0, 1);
        const st = transState(tin.type, p, W, H);
        if (prev) {
          drawClip(ctx, rc, prev, t, { alpha: st.outAlpha, dx: st.outDx, dy: st.outDy, scale: st.outScale, blur: st.outBlur });
        }
        drawClip(ctx, rc, clip, t, { alpha: st.inAlpha, dx: st.inDx, dy: st.inDy, scale: st.inScale, blur: st.inBlur, clip: st.inClip, glitchSeed: st.glitchSeed });
        if (st.overlay && st.overlay.alpha > 0) {
          ctx.save();
          ctx.globalAlpha = st.overlay.alpha;
          ctx.fillStyle = st.overlay.color;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
      } else if (clip.kind === "adjustment") {
        drawAdjustment(ctx, clip, t, W, H);
      } else {
        drawClip(ctx, rc, clip, t);
      }
    }
  }
  ctx.restore();
}

/**
 * Adjustment layer: grabs everything composited so far and re-draws it through
 * the layer's colour pipeline (filters, temperature/tint, vignette), limited to
 * the layer's mask and faded by its opacity. Works like Premiere/Resolve
 * adjustment layers — put a grade above a whole sequence in one clip.
 */
function drawAdjustment(ctx: CanvasRenderingContext2D, clip: Clip, t: number, W: number, H: number) {
  const local = t - clip.start;
  const anim = evaluateClip(clip, local);
  const fade = fadeMultiplier(clip.effects.fadeIn, clip.effects.fadeOut, local, clip.duration);
  const alpha = clamp((anim.opacity / 100) * fade, 0, 1);
  if (alpha <= 0) return;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  // Snapshot of what's beneath (device pixels)
  const snap = getScratch(2, cw, ch);
  const sctx = snap.getContext("2d")!;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalCompositeOperation = "source-over";
  sctx.globalAlpha = 1;
  sctx.filter = "none";
  sctx.clearRect(0, 0, cw, ch);
  sctx.drawImage(ctx.canvas, 0, 0);

  // Graded version
  const graded = getScratch(3, cw, ch);
  const gctx = graded.getContext("2d")!;
  gctx.setTransform(1, 0, 0, 1, 0, 0);
  gctx.globalCompositeOperation = "source-over";
  gctx.globalAlpha = 1;
  gctx.clearRect(0, 0, cw, ch);
  const dpr = cw / W;
  gctx.filter = cssFilterString(clip.effects).replace(/blur\(([\d.]+)px\)/, (_m, px) => `blur(${Number(px) * dpr}px)`);
  gctx.drawImage(snap, 0, 0);
  gctx.filter = "none";
  gctx.save();
  gctx.scale(dpr, dpr);
  gctx.translate(W / 2, H / 2);
  applyColorOverlays(gctx, clip, { x: -W / 2, y: -H / 2, w: W, h: H });
  gctx.restore();

  // Mask (if any) in project space
  const mask = clip.mask;
  if (mask && mask.shape !== "none") {
    gctx.save();
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.scale(dpr, dpr);
    gctx.globalCompositeOperation = "destination-in";
    drawMaskShape(gctx, mask, W, H, anim);
    gctx.restore();
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(graded, 0, 0);
  ctx.restore();
}

/**
 * Paints the mask coverage (white = keep) for a clip, in project-space
 * coordinates, using a feathered gradient / shadow blur for soft edges.
 * Expects the ctx already scaled to project space with origin at top-left.
 */
function drawMaskShape(ctx: CanvasRenderingContext2D, mask: import("../types").ClipMask, W: number, H: number, anim: { x: number; y: number; scale: number; rotation: number }) {
  const mw = Math.max(1, (mask.width / 100) * W);
  const mh = Math.max(1, (mask.height / 100) * H);
  const feather = Math.max(0, mask.feather);

  // Same order as the clip's own transform so the mask travels with the content.
  const paint = (target: CanvasRenderingContext2D) => {
    target.save();
    target.translate(W / 2 + anim.x, H / 2 + anim.y);
    target.rotate((anim.rotation * Math.PI) / 180);
    target.scale(anim.scale, anim.scale);
    target.translate((mask.x / 100) * W, (mask.y / 100) * H);
    target.rotate((mask.rotation * Math.PI) / 180);
    target.beginPath();
    if (mask.shape === "ellipse") target.ellipse(0, 0, mw / 2, mh / 2, 0, 0, Math.PI * 2);
    else roundRectPath(target, -mw / 2, -mh / 2, mw, mh, mask.cornerRadius);
    target.fillStyle = "#fff";
    target.fill();
    target.restore();
  };

  if (mask.invert) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "destination-out";
  }
  if (feather > 0) {
    // Draw the shape offscreen with a blur filter for a soft edge.
    const dpr = ctx.getTransform().a || 1;
    const layer = getScratch(4, Math.round(W * dpr), Math.round(H * dpr));
    const lctx = layer.getContext("2d")!;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, layer.width, layer.height);
    lctx.filter = `blur(${feather * dpr * 0.5}px)`;
    lctx.scale(dpr, dpr);
    lctx.globalCompositeOperation = "source-over";
    paint(lctx);
    lctx.filter = "none";
    ctx.drawImage(layer, 0, 0, layer.width, layer.height, 0, 0, W, H);
  } else {
    paint(ctx);
  }
}

// ── Chroma key ──────────────────────────────────────────────────────────────

let keyCanvas: HTMLCanvasElement | null = null;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Returns a keyed copy of the source (transparent where the key colour matches).
 * Works in a YCbCr-ish chroma distance so luminance differences (shadows on a
 * green screen) don't break the key. Processes at reduced resolution for speed.
 */
function chromaKeySource(src: CanvasImageSource, sw: number, sh: number, key: import("../types").ChromaKey, maxW: number): HTMLCanvasElement | null {
  const scale = Math.min(1, maxW / sw);
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  if (!keyCanvas) keyCanvas = document.createElement("canvas");
  if (keyCanvas.width !== w || keyCanvas.height !== h) {
    keyCanvas.width = w;
    keyCanvas.height = h;
  }
  const kctx = keyCanvas.getContext("2d", { willReadFrequently: true })!;
  kctx.clearRect(0, 0, w, h);
  try {
    kctx.drawImage(src, 0, 0, w, h);
  } catch {
    return null;
  }
  let img: ImageData;
  try {
    img = kctx.getImageData(0, 0, w, h);
  } catch {
    return null; // tainted canvas
  }
  const d = img.data;
  const [kr, kg, kb] = hexToRgb(key.color);
  // chroma components of the key colour
  const kcb = -0.169 * kr - 0.331 * kg + 0.5 * kb;
  const kcr = 0.5 * kr - 0.419 * kg - 0.081 * kb;
  const tol = (key.similarity / 100) * 120; // distance at which a pixel is fully keyed
  const soft = Math.max(1, (key.smoothness / 100) * 120); // width of the ramp
  const spill = key.spill / 100;
  const isGreen = kg > kr && kg > kb;
  const isBlue = kb > kr && kb > kg;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const cb = -0.169 * r - 0.331 * g + 0.5 * b;
    const cr = 0.5 * r - 0.419 * g - 0.081 * b;
    const dist = Math.hypot(cb - kcb, cr - kcr);
    let a = (dist - tol) / soft; // 0 = keyed, 1 = kept
    if (a <= 0) {
      d[i + 3] = 0;
      continue;
    }
    if (a < 1) d[i + 3] = Math.round(d[i + 3] * a);
    // spill suppression on remaining pixels near the key hue
    if (spill > 0 && a < 2) {
      const amt = spill * (1 - Math.min(1, a / 2));
      if (isGreen) {
        const lim = (r + b) / 2;
        if (g > lim) d[i + 1] = Math.round(g - (g - lim) * amt);
      } else if (isBlue) {
        const lim = (r + g) / 2;
        if (b > lim) d[i + 2] = Math.round(b - (b - lim) * amt);
      } else {
        const lim = (g + b) / 2;
        if (r > lim) d[i] = Math.round(r - (r - lim) * amt);
      }
    }
  }
  kctx.putImageData(img, 0, 0);
  return keyCanvas;
}

interface DrawMods {
  alpha?: number;
  dx?: number;
  dy?: number;
  scale?: number;
  blur?: number;
  clip?: (ctx: CanvasRenderingContext2D, W: number, H: number) => void;
  glitchSeed?: number;
}

function drawClip(ctx: CanvasRenderingContext2D, rc: RenderContext, clip: Clip, t: number, mods: DrawMods = {}) {
  const W = rc.settings.width;
  const H = rc.settings.height;
  const local = t - clip.start;
  const anim = evaluateClip(clip, local);
  const fade = fadeMultiplier(clip.effects.fadeIn, clip.effects.fadeOut, local, clip.duration);
  const alpha = clamp((anim.opacity / 100) * fade * (mods.alpha ?? 1), 0, 1);
  if (alpha <= 0) return;

  const fx = clip.effects;
  const needsLayer =
    fx.temperature !== 0 || fx.tint !== 0 || fx.vignette > 0 || mods.glitchSeed !== undefined || (clip.blendMode !== "source-over" && clip.kind !== "solid");

  const target: CanvasRenderingContext2D = needsLayer ? getScratch(0, ctx.canvas.width, ctx.canvas.height).getContext("2d")! : ctx;
  if (needsLayer) {
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.clearRect(0, 0, target.canvas.width, target.canvas.height);
    target.setTransform(ctx.getTransform());
    target.globalAlpha = 1;
    target.globalCompositeOperation = "source-over";
    target.filter = "none";
  }

  target.save();
  if (!needsLayer) {
    target.globalAlpha = alpha;
    target.globalCompositeOperation = clip.blendMode;
  }
  if (mods.clip) {
    target.beginPath();
    mods.clip(target, W, H);
    target.clip();
  }

  target.translate(W / 2 + anim.x + (mods.dx ?? 0), H / 2 + anim.y + (mods.dy ?? 0));
  target.rotate((anim.rotation * Math.PI) / 180);
  const sc = anim.scale * (mods.scale ?? 1);
  target.scale(sc, sc);

  const filterBase = cssFilterString(fx);
  const blur = mods.blur ?? 0;
  const filter = blur > 0 ? `${filterBase === "none" ? "" : filterBase + " "}blur(${blur / sc}px)` : filterBase;

  let drawnRect: Rect | null = null;

  // Shape mask: clip the drawing region (in clip space, before content transform
  // so the mask travels with position/scale/rotation animation).
  const mask = clip.mask;
  const hasMask = !!mask && mask.shape !== "none";
  let maskLayer: CanvasRenderingContext2D | null = null;
  if (hasMask && mask!.feather <= 0 && !mask!.invert) {
    // Hard-edged: a plain clip path is cheapest.
    const mw = (mask!.width / 100) * W;
    const mh = (mask!.height / 100) * H;
    target.save();
    target.translate((mask!.x / 100) * W, (mask!.y / 100) * H);
    target.rotate((mask!.rotation * Math.PI) / 180);
    target.beginPath();
    if (mask!.shape === "ellipse") target.ellipse(0, 0, mw / 2, mh / 2, 0, 0, Math.PI * 2);
    else roundRectPath(target, -mw / 2, -mh / 2, mw, mh, mask!.cornerRadius);
    target.restore();
    target.clip();
  } else if (hasMask) {
    // Soft / inverted: render content to its own layer and multiply by mask coverage.
    maskLayer = getScratch(1, ctx.canvas.width, ctx.canvas.height).getContext("2d")!;
    maskLayer.setTransform(1, 0, 0, 1, 0, 0);
    maskLayer.globalCompositeOperation = "source-over";
    maskLayer.globalAlpha = 1;
    maskLayer.filter = "none";
    maskLayer.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    maskLayer.setTransform(target.getTransform());
  }
  const out: CanvasRenderingContext2D = maskLayer ?? target;

  if (clip.kind === "media") {
    let src = rc.getSource(clip);
    let size = sourceSize(src);
    if (src && size && clip.chromaKey?.enabled) {
      const keyed = chromaKeySource(src as CanvasImageSource, size.w, size.h, clip.chromaKey, Math.min(size.w, Math.max(640, W)));
      if (keyed) {
        src = keyed;
        size = { w: keyed.width, h: keyed.height };
      }
    }
    if (src && size) {
      const r = contentRect(clip, size.w, size.h, W, H);
      const cl = clip.crop.left / 100;
      const ct = clip.crop.top / 100;
      const cr = clip.crop.right / 100;
      const cb = clip.crop.bottom / 100;
      const sxp = size.w * cl;
      const syp = size.h * ct;
      const swp = size.w * (1 - cl - cr);
      const shp = size.h * (1 - ct - cb);
      const dx = r.x + r.w * cl;
      const dy = r.y + r.h * ct;
      const dw = r.w * (1 - cl - cr);
      const dh = r.h * (1 - ct - cb);
      drawnRect = { x: dx, y: dy, w: dw, h: dh };
      if (swp > 0 && shp > 0 && dw > 0 && dh > 0) {
        out.save();
        if (clip.cornerRadius > 0) {
          out.beginPath();
          roundRectPath(out, dx, dy, dw, dh, Math.min(clip.cornerRadius, dw / 2, dh / 2));
          out.clip();
        }
        out.filter = filter;
        try {
          out.drawImage(src as CanvasImageSource, sxp, syp, swp, shp, dx, dy, dw, dh);
        } catch {
          /* source not ready */
        }
        out.filter = "none";
        out.restore();
      }
    } else {
      // Placeholder while loading
      drawnRect = { x: -W / 2, y: -H / 2, w: W, h: H };
    }
  } else if (clip.kind === "text" && clip.text) {
    out.filter = filter;
    drawnRect = drawText(out, clip, local, W, H);
    out.filter = "none";
  } else if (clip.kind === "solid" && clip.solid) {
    out.filter = filter;
    drawnRect = drawSolid(out, clip, W, H);
    out.filter = "none";
  }

  // Color overlays constrained to drawn content
  if (drawnRect && needsLayer) {
    applyColorOverlays(out, clip, drawnRect);
  }

  if (maskLayer) {
    // Multiply the layer by the (feathered / inverted) mask coverage, then composite.
    const m = mask!;
    maskLayer.save();
    maskLayer.globalCompositeOperation = "destination-in";
    maskLayer.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = ctx.canvas.width / W;
    maskLayer.scale(dpr, dpr);
    // mask is defined relative to clip anchor; anim already applied via target transform,
    // so express it in project space using the animated values.
    drawMaskShape(maskLayer, m, W, H, { x: anim.x + (mods.dx ?? 0), y: anim.y + (mods.dy ?? 0), scale: sc, rotation: anim.rotation });
    maskLayer.restore();
    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.drawImage(maskLayer.canvas, 0, 0);
    target.restore();
  }
  target.restore();

  if (needsLayer) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = clip.blendMode;
    if (mods.glitchSeed !== undefined) {
      drawGlitch(ctx, target.canvas, mods.glitchSeed);
    } else {
      ctx.drawImage(target.canvas, 0, 0);
    }
    ctx.restore();
  }
}

function applyColorOverlays(ctx: CanvasRenderingContext2D, clip: Clip, r: Rect) {
  const fx = clip.effects;
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  if (clip.cornerRadius > 0 && clip.kind === "media") {
    ctx.beginPath();
    roundRectPath(ctx, r.x, r.y, r.w, r.h, Math.min(clip.cornerRadius, r.w / 2, r.h / 2));
    ctx.clip();
  }
  if (fx.temperature !== 0) {
    const a = Math.min(0.5, Math.abs(fx.temperature) / 100) * 0.55;
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = fx.temperature > 0 ? `rgba(255,150,40,${a})` : `rgba(40,140,255,${a})`;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  if (fx.tint !== 0) {
    const a = Math.min(0.5, Math.abs(fx.tint) / 100) * 0.45;
    ctx.fillStyle = fx.tint > 0 ? `rgba(255,60,220,${a})` : `rgba(60,255,120,${a})`;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  if (fx.vignette > 0) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const outer = Math.hypot(r.w, r.h) / 2;
    const g = ctx.createRadialGradient(cx, cy, outer * 0.35, cx, cy, outer);
    const strength = fx.vignette / 100;
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${0.95 * strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}

function drawGlitch(ctx: CanvasRenderingContext2D, layer: HTMLCanvasElement, seed: number) {
  const w = layer.width;
  const h = layer.height;
  ctx.drawImage(layer, 0, 0);
  const rnd = mulberry(seed * 7919 + 17);
  const slices = 6 + Math.floor(rnd() * 6);
  for (let i = 0; i < slices; i++) {
    const y = Math.floor(rnd() * h);
    const sh = Math.max(2, Math.floor(rnd() * h * 0.08));
    const dx = Math.floor((rnd() - 0.5) * w * 0.12);
    try {
      ctx.drawImage(layer, 0, y, w, sh, dx, y, w, sh);
    } catch {}
  }
  // RGB split
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha *= 0.5;
  const off = Math.floor((rnd() - 0.5) * w * 0.02) + 4;
  ctx.filter = "url(#none)";
  ctx.filter = "none";
  ctx.drawImage(layer, off, 0);
  ctx.drawImage(layer, -off, 0);
}

function mulberry(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

// ── Solids ──────────────────────────────────────────────────────────────────

function drawSolid(ctx: CanvasRenderingContext2D, clip: Clip, W: number, H: number): Rect {
  const s = clip.solid!;
  const w = (s.width / 100) * W;
  const h = (s.height / 100) * H;
  const x = -w / 2;
  const y = -h / 2;
  let fill: string | CanvasGradient = s.color;
  if (s.gradient) {
    const rad = ((s.gradient.angle - 90) * Math.PI) / 180;
    const len = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
    const gx = (Math.cos(rad) * len) / 2;
    const gy = (Math.sin(rad) * len) / 2;
    const g = ctx.createLinearGradient(-gx, -gy, gx, gy);
    g.addColorStop(0, s.gradient.from);
    g.addColorStop(1, s.gradient.to);
    fill = g;
  }
  ctx.beginPath();
  if (s.shape === "ellipse") {
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (s.shape === "arrow") {
    // chunky meme arrow filling the box, pointing right (rotate to aim)
    const sh = h * 0.34; // shaft half-height
    const hx = w * 0.52; // head start
    const hy = h * 0.52; // head half-height
    ctx.moveTo(x, -sh);
    ctx.lineTo(x + hx, -sh);
    ctx.lineTo(x + hx, -hy);
    ctx.lineTo(x + w / 2, 0);
    ctx.lineTo(x + hx, hy);
    ctx.lineTo(x + hx, sh);
    ctx.lineTo(x, sh);
    ctx.closePath();
  } else {
    roundRectPath(ctx, x, y, w, h, s.cornerRadius);
  }
  const stroke = (s.strokeWidth ?? 0) > 0;
  if (stroke) {
    ctx.lineWidth = s.strokeWidth!;
    ctx.strokeStyle = s.strokeColor ?? "#ffffff";
    ctx.stroke();
  } else {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  return { x, y, w, h };
}

// ── Text ────────────────────────────────────────────────────────────────────

interface TextAnimState {
  alpha: number;
  dx: number;
  dy: number;
  scale: number;
  rot: number; // radians of wobble rotation
  blur: number;
  reveal: number; // 0..1 fraction of chars visible (typewriter) or clip width (reveal)
  mode: "none" | "typewriter" | "reveal";
}

function textAnim(style: TextStyle, local: number, duration: number): TextAnimState {
  const st: TextAnimState = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, blur: 0, reveal: 1, mode: "none" };
  const inD = Math.min(style.animInDuration, duration);
  const outD = Math.min(style.animOutDuration, duration);
  const apply = (anim: TextStyle["animIn"], p: number, dir: 1 | -1) => {
    // p: 0 = fully hidden, 1 = fully shown
    const e = ease(p, "ease-out");
    const back = 1 - ease(p, "ease-in-out");
    switch (anim) {
      case "fade":
        st.alpha *= e;
        break;
      case "slide-up":
        st.alpha *= e;
        st.dy += dir * 60 * (1 - e);
        break;
      case "slide-down":
        st.alpha *= e;
        st.dy -= dir * 60 * (1 - e);
        break;
      case "slide-left":
        st.alpha *= e;
        st.dx += dir * 90 * (1 - e);
        break;
      case "slide-right":
        st.alpha *= e;
        st.dx -= dir * 90 * (1 - e);
        break;
      case "scale":
        st.alpha *= e;
        st.scale *= 0.8 + 0.2 * e;
        break;
      case "pop": {
        // overshoot
        const k = p < 1 ? 1 + Math.sin(p * Math.PI) * 0.18 : 1;
        st.alpha *= Math.min(1, p * 3);
        st.scale *= (0.4 + 0.6 * ease(p, "ease-out")) * k;
        break;
      }
      case "blur":
        st.alpha *= e;
        st.blur += back * 18;
        break;
      case "typewriter":
        st.mode = "typewriter";
        st.reveal = Math.min(st.reveal, p);
        break;
      case "reveal":
        st.mode = "reveal";
        st.reveal = Math.min(st.reveal, ease(p, "ease-in-out"));
        break;
      case "wobble": {
        // Big decaying oscillation while fading/scaling in, plus a constant meme-shake.
        const w = 1 - e;
        st.alpha *= Math.min(1, p * 2.5);
        st.scale *= 0.6 + 0.4 * e;
        st.rot += Math.sin(p * Math.PI * 5) * 0.14 * w;
        st.dy += Math.sin(p * Math.PI * 4) * 26 * w;
        break;
      }
    }
  };
  if (style.animIn !== "none" && inD > 0 && local < inD) apply(style.animIn, clamp(local / inD, 0, 1), 1);
  const remaining = duration - local;
  if (style.animOut !== "none" && outD > 0 && remaining < outD) apply(style.animOut, clamp(remaining / outD, 0, 1), -1);
  // Meme captions set to wobble keep jittering for their whole life (deterministic in time).
  if (style.animIn === "wobble" || style.animOut === "wobble") {
    st.dx += Math.sin(local * 31) * 3;
    st.dy += Math.cos(local * 26) * 3;
    st.rot += Math.sin(local * 22) * 0.028;
  }
  return st;
}

function drawText(ctx: CanvasRenderingContext2D, clip: Clip, local: number, W: number, _H: number): Rect {
  const style = clip.text!;
  const anim = textAnim(style, local, clip.duration);
  if (anim.alpha <= 0.001) return { x: 0, y: 0, w: 0, h: 0 };
  const lay = layoutText(style, W, ctx);
  ctx.save();
  ctx.globalAlpha *= clamp(anim.alpha, 0, 1);
  ctx.translate(anim.dx, anim.dy);
  if (anim.rot !== 0) ctx.rotate(anim.rot);
  ctx.scale(anim.scale, anim.scale);
  if (anim.blur > 0) {
    const f = ctx.filter;
    ctx.filter = `${f === "none" ? "" : f + " "}blur(${anim.blur}px)`;
  }
  ctx.font = fontString(style);
  (ctx as any).letterSpacing = `${style.letterSpacing}px`;
  ctx.textBaseline = "middle";

  const boxX = -lay.boxWidth / 2;
  const boxY = -lay.boxHeight / 2;

  if (anim.mode === "reveal") {
    ctx.beginPath();
    ctx.rect(boxX - 40, boxY - 40, (lay.boxWidth + 80) * anim.reveal, lay.boxHeight + 80);
    ctx.clip();
  }

  if (style.boxEnabled) {
    ctx.save();
    ctx.fillStyle = style.boxColor;
    ctx.beginPath();
    roundRectPath(ctx, boxX, boxY, lay.boxWidth, lay.boxHeight, style.boxRadius);
    ctx.fill();
    ctx.restore();
  }

  // typewriter char budget
  let charBudget = Infinity;
  if (anim.mode === "typewriter") {
    const total = lay.lines.reduce((n, l) => n + l.length, 0);
    charBudget = Math.floor(total * anim.reveal);
  }

  const padX = style.boxEnabled ? style.boxPaddingX : 0;
  const padY = style.boxEnabled ? style.boxPaddingY : 0;
  const top = boxY + padY;
  const left = boxX + padX;

  for (let i = 0; i < lay.lines.length; i++) {
    let line = lay.lines[i];
    if (charBudget !== Infinity) {
      if (charBudget <= 0) break;
      if (line.length > charBudget) line = line.slice(0, charBudget);
      charBudget -= lay.lines[i].length;
    }
    const lw = lay.lineWidths[i];
    let x = left;
    if (style.align === "center") x = left + (lay.width - lw) / 2;
    else if (style.align === "right") x = left + lay.width - lw;
    const y = top + lay.lineHeight * (i + 0.5);
    ctx.textAlign = "left";

    if (style.shadow) {
      ctx.save();
      ctx.shadowColor = style.shadowColor;
      ctx.shadowBlur = style.shadowBlur;
      ctx.shadowOffsetX = style.shadowX;
      ctx.shadowOffsetY = style.shadowY;
      ctx.fillStyle = style.color;
      if (style.strokeWidth > 0) {
        ctx.lineJoin = "round";
        ctx.lineWidth = style.strokeWidth;
        ctx.strokeStyle = style.strokeColor;
        ctx.strokeText(line, x, y);
      }
      ctx.fillText(line, x, y);
      ctx.restore();
    }
    if (style.strokeWidth > 0) {
      ctx.lineJoin = "round";
      ctx.lineWidth = style.strokeWidth;
      ctx.strokeStyle = style.strokeColor;
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = style.color;
    ctx.fillText(line, x, y);
  }
  ctx.restore();
  return { x: boxX, y: boxY, w: lay.boxWidth, h: lay.boxHeight };
}

// ── Utilities for UI overlays ───────────────────────────────────────────────

export function clipTint(color: string, alpha: number) {
  return hexToRgba(color, alpha);
}
