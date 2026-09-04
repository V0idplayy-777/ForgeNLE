/**
 * Video scopes — computed from a downsampled copy of the preview canvas.
 * All functions take an ImageData (already downsampled) and draw into a 2D
 * canvas context. They are deliberately allocation-light so they can run at
 * ~15 Hz without stalling playback.
 */

export type ScopeKind = "waveform" | "parade" | "vectorscope" | "histogram";

const BG = "#0a0a0c";

function clear(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
}

function graticuleH(ctx: CanvasRenderingContext2D, w: number, h: number, labels: string[]) {
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "9px ui-monospace, monospace";
  ctx.lineWidth = 1;
  const n = labels.length - 1;
  for (let i = 0; i <= n; i++) {
    const y = Math.round((h - 1) * (1 - i / n)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.fillText(labels[i], 3, Math.max(9, Math.min(h - 2, y - 2)));
  }
}

/** Luma waveform: x = image column, y = luma. */
export function drawWaveform(ctx: CanvasRenderingContext2D, img: ImageData, w: number, h: number) {
  clear(ctx, w, h);
  const { data, width, height } = img;
  const acc = new Float32Array(w * h);
  const gain = 40 / height; // brightness per sample
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      const px0 = Math.min(w - 1, (x * w) / width) | 0;
      const px1 = Math.min(w, ((x + 1) * w) / width) | 0;
      const py = Math.min(h - 1, ((255 - l) * (h - 1)) / 255) | 0;
      for (let px = px0; px < Math.max(px1, px0 + 1); px++) acc[py * w + px] += gain;
    }
  }
  const out = ctx.createImageData(w, h);
  const o = out.data;
  for (let i = 0; i < acc.length; i++) {
    const v = Math.min(1, acc[i]);
    if (v <= 0) continue;
    const j = i * 4;
    o[j] = 120 + 135 * v;
    o[j + 1] = 200 + 55 * v;
    o[j + 2] = 120 + 100 * v;
    o[j + 3] = 40 + 215 * v;
  }
  ctx.putImageData(out, 0, 0);
  graticuleH(ctx, w, h, ["0", "25", "50", "75", "100"]);
}

/** RGB parade: three side-by-side waveforms, one per channel. */
export function drawParade(ctx: CanvasRenderingContext2D, img: ImageData, w: number, h: number) {
  clear(ctx, w, h);
  const { data, width, height } = img;
  const third = Math.floor(w / 3);
  const acc = new Float32Array(w * h * 3);
  const gain = 40 / height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const px0 = Math.min(third - 1, (x * third) / width) | 0;
      const px1 = Math.min(third, ((x + 1) * third) / width) | 0;
      for (let c = 0; c < 3; c++) {
        const py = Math.min(h - 1, ((255 - data[i + c]) * (h - 1)) / 255) | 0;
        for (let px = px0; px < Math.max(px1, px0 + 1); px++) acc[(py * w + px + c * third) * 3 + c] += gain;
      }
    }
  }
  const out = ctx.createImageData(w, h);
  const o = out.data;
  for (let p = 0; p < w * h; p++) {
    const r = Math.min(1, acc[p * 3]);
    const g = Math.min(1, acc[p * 3 + 1]);
    const b = Math.min(1, acc[p * 3 + 2]);
    const m = Math.max(r, g, b);
    if (m <= 0) continue;
    const j = p * 4;
    o[j] = 60 + 195 * r;
    o[j + 1] = 60 + 195 * g;
    o[j + 2] = 60 + 195 * b;
    o[j + 3] = 40 + 215 * m;
  }
  ctx.putImageData(out, 0, 0);
  graticuleH(ctx, w, h, ["0", "50", "100"]);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  for (let c = 1; c < 3; c++) {
    ctx.beginPath();
    ctx.moveTo(c * third + 0.5, 0);
    ctx.lineTo(c * third + 0.5, h);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,120,120,0.7)";
  ctx.fillText("R", third - 10, h - 4);
  ctx.fillStyle = "rgba(120,255,120,0.7)";
  ctx.fillText("G", 2 * third - 10, h - 4);
  ctx.fillStyle = "rgba(120,160,255,0.7)";
  ctx.fillText("B", w - 10, h - 4);
}

/** Vectorscope: Cb/Cr chroma plot with primary/secondary targets and skin-tone line. */
export function drawVectorscope(ctx: CanvasRenderingContext2D, img: ImageData, w: number, h: number) {
  clear(ctx, w, h);
  const { data } = img;
  const size = Math.min(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const r = size / 2 - 6;
  const acc = new Float32Array(w * h);
  const n = data.length / 4;
  const gain = 4000 / n;
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    const cb = -0.1146 * R - 0.3854 * G + 0.5 * B; // -128..128
    const cr = 0.5 * R - 0.4542 * G - 0.0458 * B;
    const px = Math.round(cx + (cb / 128) * r);
    const py = Math.round(cy - (cr / 128) * r);
    if (px < 0 || py < 0 || px >= w || py >= h) continue;
    acc[py * w + px] += gain;
  }
  const out = ctx.createImageData(w, h);
  const o = out.data;
  for (let p = 0; p < acc.length; p++) {
    const v = Math.min(1, acc[p]);
    if (v <= 0) continue;
    const j = p * 4;
    o[j] = 200 + 55 * v;
    o[j + 1] = 200 + 55 * v;
    o[j + 2] = 220;
    o[j + 3] = 50 + 205 * v;
  }
  ctx.putImageData(out, 0, 0);

  // graticule
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.stroke();

  // 75% colour bar targets
  const targets: [string, number, number, number][] = [
    ["R", 191, 0, 0], ["Yl", 191, 191, 0], ["G", 0, 191, 0], ["Cy", 0, 191, 191], ["B", 0, 0, 191], ["Mg", 191, 0, 191],
  ];
  ctx.font = "9px ui-monospace, monospace";
  for (const [name, R, G, B] of targets) {
    const cb = -0.1146 * R - 0.3854 * G + 0.5 * B;
    const cr = 0.5 * R - 0.4542 * G - 0.0458 * B;
    const x = cx + (cb / 128) * r;
    const y = cy - (cr / 128) * r;
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.strokeRect(x - 4, y - 4, 8, 8);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(name, x + 6, y + 3);
  }
  // skin tone line (~123°)
  const a = (123 * Math.PI) / 180;
  ctx.strokeStyle = "rgba(255,180,120,0.45)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * r, cy - Math.sin(a) * r);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** RGB + luma histogram. */
export function drawHistogram(ctx: CanvasRenderingContext2D, img: ImageData, w: number, h: number) {
  clear(ctx, w, h);
  const { data } = img;
  const bins = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let i = 0; i < data.length; i += 4) {
    bins[0][data[i]]++;
    bins[1][data[i + 1]]++;
    bins[2][data[i + 2]]++;
    bins[3][(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) | 0]++;
  }
  let max = 1;
  for (const b of bins) for (let i = 1; i < 255; i++) max = Math.max(max, b[i]);
  const colors = ["rgba(255,80,80,0.55)", "rgba(80,255,120,0.55)", "rgba(90,140,255,0.55)", "rgba(255,255,255,0.85)"];
  ctx.globalCompositeOperation = "lighter";
  for (let c = 0; c < 4; c++) {
    ctx.fillStyle = colors[c];
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < 256; i++) {
      const v = Math.min(1, Math.log1p(bins[c][i]) / Math.log1p(max));
      ctx.lineTo((i / 255) * w, h - v * (h - 4));
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    if (c === 3) ctx.stroke();
    else ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  for (const f of [0.25, 0.5, 0.75]) {
    ctx.beginPath();
    ctx.moveTo(Math.round(f * w) + 0.5, 0);
    ctx.lineTo(Math.round(f * w) + 0.5, h);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "9px ui-monospace, monospace";
  ctx.fillText("0", 3, h - 3);
  ctx.fillText("255", w - 22, h - 3);
}

export function drawScope(kind: ScopeKind, ctx: CanvasRenderingContext2D, img: ImageData, w: number, h: number) {
  switch (kind) {
    case "waveform":
      return drawWaveform(ctx, img, w, h);
    case "parade":
      return drawParade(ctx, img, w, h);
    case "vectorscope":
      return drawVectorscope(ctx, img, w, h);
    case "histogram":
      return drawHistogram(ctx, img, w, h);
  }
}

/** Grab a small ImageData from a source canvas (max ~160px wide). */
export function sampleCanvas(src: HTMLCanvasElement, scratch: HTMLCanvasElement, maxW = 160): ImageData | null {
  if (!src.width || !src.height) return null;
  const w = Math.min(maxW, src.width);
  const h = Math.max(1, Math.round((w * src.height) / src.width));
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  const c = scratch.getContext("2d", { willReadFrequently: true });
  if (!c) return null;
  c.drawImage(src, 0, 0, w, h);
  try {
    return c.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
}
