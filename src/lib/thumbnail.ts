// ─────────────────────────────────────────────────────────────────────────────
// Forge NLE — thumbnail maker.
//
// Renders the frame at the playhead through the normal compositor, then slaps
// big readable meme text on top (stroke, shadow, optional scrim) and returns a
// PNG ready for YouTube. Same rendering path as export, so WYSIWYG.
// ─────────────────────────────────────────────────────────────────────────────

import { isClipActive, renderFrame, sourceTime } from "./renderer";
import { PlaybackEngine } from "./playbackEngine";
import { warmFonts } from "./presets";
import { ExportInput } from "./exportEngine";

export type ThumbPosition = "top" | "center" | "bottom";

export interface ThumbnailOptions {
  title: string;
  fontSize: number; // px at project scale
  color: string;
  strokeWidth: number;
  strokeColor: string;
  position: ThumbPosition;
  uppercase: boolean;
  scrim: boolean; // dark gradient behind the text for readability
  fontFamily: string;
  fontWeight: number;
}

export function defaultThumbnailOptions(): ThumbnailOptions {
  return {
    title: "HE DID WHAT?!",
    fontSize: 0.14, // fraction of frame height; multiplied in draw
    color: "#ffffff",
    strokeWidth: 10,
    strokeColor: "#000000",
    position: "bottom",
    uppercase: true,
    scrim: true,
    fontFamily: "Archivo Black",
    fontWeight: 400,
  };
}

export async function exportThumbnail(input: ExportInput, t: number, opts: ThumbnailOptions, width: number, height: number): Promise<Blob> {
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

  drawThumbnailText(ctx, opts, width, height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}

/** Shared by the live preview so the modal can show exactly what will render. */
export function drawThumbnailText(ctx: CanvasRenderingContext2D, opts: ThumbnailOptions, W: number, H: number) {
  const text = (opts.uppercase ? opts.title.toUpperCase() : opts.title).trim();
  if (!text) return;
  const fontSize = Math.max(8, opts.fontSize * H);

  if (opts.scrim) {
    const band = fontSize * 3.2;
    const y0 = opts.position === "top" ? 0 : opts.position === "bottom" ? H - band : (H - band) / 2;
    const g =
      opts.position === "top"
        ? (() => {
            const gr = ctx.createLinearGradient(0, 0, 0, band);
            gr.addColorStop(0, "rgba(0,0,0,0.55)");
            gr.addColorStop(1, "rgba(0,0,0,0)");
            return gr;
          })()
        : opts.position === "bottom"
          ? (() => {
              const gr = ctx.createLinearGradient(0, H - band, 0, H);
              gr.addColorStop(0, "rgba(0,0,0,0)");
              gr.addColorStop(1, "rgba(0,0,0,0.55)");
              return gr;
            })()
          : (() => {
              const gr = ctx.createLinearGradient(0, y0, 0, y0 + band);
              gr.addColorStop(0, "rgba(0,0,0,0)");
              gr.addColorStop(0.5, "rgba(0,0,0,0.55)");
              gr.addColorStop(1, "rgba(0,0,0,0)");
              return gr;
            })();
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, W, band);
    ctx.restore();
  }

  const lines = text.split("\n");
  ctx.save();
  ctx.font = `${opts.fontWeight} ${fontSize}px "${opts.fontFamily}", Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  const lineH = fontSize * 1.08;
  const blockH = lines.length * lineH;
  let cy = opts.position === "top" ? blockH * 0.62 : opts.position === "bottom" ? H - blockH * 0.62 : H / 2;

  for (const line of lines) {
    const maxW = W * 0.92;
    let size = fontSize;
    // shrink long lines to fit the frame
    let m = ctx.measureText(line).width;
    if (m > maxW) {
      size = Math.max(10, (fontSize * maxW) / m);
      ctx.font = `${opts.fontWeight} ${size}px "${opts.fontFamily}", Inter, sans-serif`;
      m = ctx.measureText(line).width;
    }
    if (opts.strokeWidth > 0) {
      ctx.strokeStyle = opts.strokeColor;
      ctx.lineWidth = (opts.strokeWidth * size) / fontSize;
      ctx.strokeText(line, W / 2, cy);
    }
    ctx.fillStyle = opts.color;
    ctx.fillText(line, W / 2, cy);
    cy += lineH;
  }
  ctx.restore();
}
