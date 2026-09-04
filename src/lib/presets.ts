import { ClipEffects, TextStyle, TransitionType, defaultEffects, defaultTextStyle, Transform, defaultTransform } from "../types";

// ── Fonts ───────────────────────────────────────────────────────────────────

export interface FontDef {
  family: string;
  label: string;
  weights: number[];
  category: "sans" | "serif" | "display" | "mono";
}

export const FONTS: FontDef[] = [
  { family: "Inter", label: "Inter", weights: [400, 500, 600, 700, 800, 900], category: "sans" },
  { family: "Poppins", label: "Poppins", weights: [400, 500, 600, 700, 800], category: "sans" },
  { family: "Montserrat", label: "Montserrat", weights: [400, 500, 600, 700, 800, 900], category: "sans" },
  { family: "Space Grotesk", label: "Space Grotesk", weights: [400, 500, 600, 700], category: "sans" },
  { family: "DM Sans", label: "DM Sans", weights: [400, 500, 600, 700, 800, 900], category: "sans" },
  { family: "Oswald", label: "Oswald", weights: [400, 500, 600, 700], category: "display" },
  { family: "Bebas Neue", label: "Bebas Neue", weights: [400], category: "display" },
  { family: "Anton", label: "Anton", weights: [400], category: "display" },
  { family: "Playfair Display", label: "Playfair Display", weights: [400, 500, 600, 700, 800, 900], category: "serif" },
  { family: "DM Serif Display", label: "DM Serif Display", weights: [400], category: "serif" },
  { family: "Lora", label: "Lora", weights: [400, 500, 600, 700], category: "serif" },
  { family: "JetBrains Mono", label: "JetBrains Mono", weights: [400, 500, 600, 700, 800], category: "mono" },
];

export function fontWeightsFor(family: string): number[] {
  return FONTS.find((f) => f.family === family)?.weights ?? [400, 700];
}

export const WEIGHT_LABELS: Record<number, string> = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semi Bold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};

let fontsWarmed = false;
export async function warmFonts() {
  if (fontsWarmed || typeof document === "undefined" || !("fonts" in document)) return;
  fontsWarmed = true;
  const loads: Promise<unknown>[] = [];
  for (const f of FONTS) {
    for (const w of f.weights) loads.push(document.fonts.load(`${w} 48px "${f.family}"`).catch(() => undefined));
  }
  await Promise.allSettled(loads);
}

// ── Color looks ─────────────────────────────────────────────────────────────

export interface LookPreset {
  id: string;
  name: string;
  description: string;
  swatch: [string, string];
  effects: Partial<ClipEffects>;
}

export const LOOKS: LookPreset[] = [
  { id: "none", name: "None", description: "Reset color grade", swatch: ["#404040", "#a3a3a3"], effects: {} },
  { id: "clean", name: "Clean", description: "Subtle punch & clarity", swatch: ["#1e293b", "#e2e8f0"], effects: { contrast: 108, saturation: 108, exposure: 4 } },
  { id: "cinematic", name: "Cinematic", description: "Teal shadows, warm highlights", swatch: ["#0f3d3e", "#f6b26b"], effects: { contrast: 112, saturation: 92, temperature: 14, tint: -6, vignette: 32 } },
  { id: "warm", name: "Golden Hour", description: "Warm, soft glow", swatch: ["#7c2d12", "#fcd34d"], effects: { temperature: 38, exposure: 6, saturation: 112, contrast: 96, vignette: 18 } },
  { id: "cool", name: "Arctic", description: "Cool, crisp tones", swatch: ["#1e3a8a", "#bae6fd"], effects: { temperature: -34, contrast: 106, saturation: 96 } },
  { id: "moody", name: "Moody", description: "Dark & desaturated", swatch: ["#111827", "#6b7280"], effects: { exposure: -18, contrast: 120, saturation: 70, vignette: 45 } },
  { id: "vivid", name: "Vivid", description: "Bold, saturated colors", swatch: ["#be123c", "#22d3ee"], effects: { saturation: 145, contrast: 110, exposure: 3 } },
  { id: "matte", name: "Matte", description: "Lifted blacks, film-like", swatch: ["#3f3f46", "#d4d4d8"], effects: { contrast: 82, brightness: 106, saturation: 88, vignette: 12 } },
  { id: "bw", name: "Noir", description: "High-contrast monochrome", swatch: ["#000000", "#ffffff"], effects: { grayscale: 100, contrast: 128, vignette: 40 } },
  { id: "vintage", name: "Vintage", description: "Faded sepia film", swatch: ["#78350f", "#fde68a"], effects: { sepia: 42, contrast: 92, saturation: 80, vignette: 30, brightness: 104 } },
  { id: "bleach", name: "Bleach Bypass", description: "Gritty, silver highlights", swatch: ["#374151", "#f3f4f6"], effects: { saturation: 45, contrast: 135, exposure: 4 } },
  { id: "pastel", name: "Pastel", description: "Airy and soft", swatch: ["#fbcfe8", "#a5f3fc"], effects: { brightness: 108, contrast: 88, saturation: 82, temperature: 6, tint: 8 } },
  { id: "cyber", name: "Cyberpunk", description: "Magenta/cyan punch", swatch: ["#c026d3", "#06b6d4"], effects: { saturation: 150, contrast: 118, tint: 26, temperature: -14, vignette: 34 } },
  { id: "dream", name: "Dream", description: "Soft focus haze", swatch: ["#c4b5fd", "#fdf4ff"], effects: { brightness: 106, contrast: 86, saturation: 96, blur: 0.6, vignette: 22 } },
];

export function applyLook(fx: ClipEffects, look: LookPreset): ClipEffects {
  const base = defaultEffects();
  // Preserve non-color properties.
  return {
    ...base,
    ...look.effects,
    opacity: fx.opacity,
    fadeIn: fx.fadeIn,
    fadeOut: fx.fadeOut,
    lookId: look.id === "none" ? undefined : look.id,
  };
}

// ── Transitions ─────────────────────────────────────────────────────────────

export interface TransitionDef {
  type: TransitionType;
  name: string;
  group: "Dissolve" | "Wipe" | "Motion" | "Stylized";
}

export const TRANSITIONS: TransitionDef[] = [
  { type: "crossfade", name: "Cross Dissolve", group: "Dissolve" },
  { type: "dip-black", name: "Dip to Black", group: "Dissolve" },
  { type: "dip-white", name: "Dip to White", group: "Dissolve" },
  { type: "blur", name: "Blur Dissolve", group: "Dissolve" },
  { type: "wipe-left", name: "Wipe Left", group: "Wipe" },
  { type: "wipe-right", name: "Wipe Right", group: "Wipe" },
  { type: "wipe-up", name: "Wipe Up", group: "Wipe" },
  { type: "wipe-down", name: "Wipe Down", group: "Wipe" },
  { type: "iris", name: "Iris", group: "Wipe" },
  { type: "slide-left", name: "Slide Left", group: "Motion" },
  { type: "slide-right", name: "Slide Right", group: "Motion" },
  { type: "slide-up", name: "Slide Up", group: "Motion" },
  { type: "slide-down", name: "Slide Down", group: "Motion" },
  { type: "push-left", name: "Push Left", group: "Motion" },
  { type: "push-right", name: "Push Right", group: "Motion" },
  { type: "zoom-in", name: "Zoom In", group: "Motion" },
  { type: "zoom-out", name: "Zoom Out", group: "Motion" },
  { type: "glitch-cut", name: "Glitch", group: "Stylized" },
];

export function transitionName(type: TransitionType) {
  return TRANSITIONS.find((t) => t.type === type)?.name ?? "None";
}

// ── Text templates ──────────────────────────────────────────────────────────

export interface TextPreset {
  id: string;
  name: string;
  category: "Titles" | "Lower Thirds" | "Captions" | "Social";
  style: Partial<TextStyle>;
  transform?: Partial<Transform>;
  duration?: number;
  /** Preview card styling */
  preview: { bg: string; fg: string; sample: string; font: string; weight: number; size: number; italic?: boolean; box?: string };
}

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: "title-bold",
    name: "Bold Title",
    category: "Titles",
    style: { content: "BOLD TITLE", fontFamily: "Inter", fontWeight: 900, fontSize: 140, uppercase: true, letterSpacing: -4, animIn: "scale", animOut: "fade" },
    preview: { bg: "linear-gradient(135deg,#0f172a,#1e293b)", fg: "#fff", sample: "BOLD", font: "Inter", weight: 900, size: 26 },
  },
  {
    id: "title-elegant",
    name: "Elegant Serif",
    category: "Titles",
    style: { content: "An Elegant Story", fontFamily: "Playfair Display", fontWeight: 500, fontSize: 120, italic: true, letterSpacing: 1, animIn: "blur", animOut: "blur", shadowBlur: 40 },
    preview: { bg: "linear-gradient(135deg,#1c1917,#44403c)", fg: "#fef3c7", sample: "Elegant", font: "Playfair Display", weight: 500, size: 22, italic: true },
  },
  {
    id: "title-cinematic",
    name: "Cinematic Wide",
    category: "Titles",
    style: { content: "CINEMATIC", fontFamily: "Bebas Neue", fontWeight: 400, fontSize: 180, uppercase: true, letterSpacing: 28, animIn: "reveal", animInDuration: 1.2, animOut: "fade", shadow: false },
    preview: { bg: "#000", fg: "#fff", sample: "C I N E M A", font: "Bebas Neue", weight: 400, size: 22 },
  },
  {
    id: "title-modern",
    name: "Modern Grotesk",
    category: "Titles",
    style: { content: "Modern\nGrotesk", fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 130, align: "left", letterSpacing: -5, lineHeight: 0.95, animIn: "slide-up", animOut: "slide-down" },
    transform: { x: -420, y: 160 },
    preview: { bg: "linear-gradient(135deg,#312e81,#4c1d95)", fg: "#fff", sample: "Modern", font: "Space Grotesk", weight: 700, size: 24 },
  },
  {
    id: "title-poster",
    name: "Poster",
    category: "Titles",
    style: { content: "POSTER", fontFamily: "Anton", fontWeight: 400, fontSize: 220, uppercase: true, color: "#facc15", strokeWidth: 0, animIn: "pop", animOut: "scale", shadowColor: "rgba(0,0,0,0.7)", shadowY: 14, shadowBlur: 0 },
    preview: { bg: "#dc2626", fg: "#facc15", sample: "POSTER", font: "Anton", weight: 400, size: 26 },
  },
  {
    id: "lt-clean",
    name: "Clean Lower Third",
    category: "Lower Thirds",
    style: { content: "Jane Appleseed\nCreative Director", fontFamily: "Inter", fontWeight: 600, fontSize: 52, align: "left", lineHeight: 1.2, letterSpacing: 0, boxEnabled: true, boxColor: "rgba(15,23,42,0.85)", boxPaddingX: 40, boxPaddingY: 26, boxRadius: 10, animIn: "slide-left", animOut: "slide-right", shadow: false },
    transform: { x: -560, y: 340 },
    duration: 5,
    preview: { bg: "#334155", fg: "#fff", sample: "Name · Title", font: "Inter", weight: 600, size: 13, box: "rgba(15,23,42,0.9)" },
  },
  {
    id: "lt-bar",
    name: "Accent Bar",
    category: "Lower Thirds",
    style: { content: "BREAKING NEWS", fontFamily: "Oswald", fontWeight: 600, fontSize: 60, uppercase: true, align: "left", letterSpacing: 4, boxEnabled: true, boxColor: "#dc2626", boxPaddingX: 36, boxPaddingY: 16, boxRadius: 0, animIn: "reveal", animOut: "fade", shadow: false },
    transform: { x: -560, y: 380 },
    duration: 5,
    preview: { bg: "#111", fg: "#fff", sample: "BREAKING", font: "Oswald", weight: 600, size: 14, box: "#dc2626" },
  },
  {
    id: "lt-minimal",
    name: "Minimal Line",
    category: "Lower Thirds",
    style: { content: "Location  ·  2026", fontFamily: "DM Sans", fontWeight: 500, fontSize: 44, align: "left", letterSpacing: 6, uppercase: true, animIn: "fade", animOut: "fade", shadow: true, shadowBlur: 12 },
    transform: { x: -600, y: 420 },
    duration: 5,
    preview: { bg: "linear-gradient(135deg,#0f766e,#134e4a)", fg: "#ccfbf1", sample: "LOCATION · 2026", font: "DM Sans", weight: 500, size: 11 },
  },
  {
    id: "cap-subtitle",
    name: "Subtitle",
    category: "Captions",
    style: { content: "This is a clean subtitle line.", fontFamily: "Inter", fontWeight: 500, fontSize: 54, letterSpacing: 0, boxEnabled: true, boxColor: "rgba(0,0,0,0.6)", boxPaddingX: 28, boxPaddingY: 14, boxRadius: 8, animIn: "none", animOut: "none", shadow: false, maxWidth: 70 },
    transform: { x: 0, y: 420 },
    duration: 3,
    preview: { bg: "#27272a", fg: "#fff", sample: "Subtitle text", font: "Inter", weight: 500, size: 12, box: "rgba(0,0,0,0.7)" },
  },
  {
    id: "cap-karaoke",
    name: "Bold Caption",
    category: "Captions",
    style: { content: "WORDS THAT POP", fontFamily: "Montserrat", fontWeight: 900, fontSize: 88, uppercase: true, color: "#ffffff", strokeWidth: 10, strokeColor: "#000000", shadow: true, shadowBlur: 0, shadowY: 8, shadowColor: "rgba(0,0,0,0.6)", animIn: "pop", animOut: "none", letterSpacing: -1 },
    transform: { x: 0, y: 260 },
    duration: 2,
    preview: { bg: "#7c3aed", fg: "#fff", sample: "POP", font: "Montserrat", weight: 900, size: 24 },
  },
  {
    id: "cap-typewriter",
    name: "Typewriter",
    category: "Captions",
    style: { content: "> typing something cool_", fontFamily: "JetBrains Mono", fontWeight: 600, fontSize: 60, color: "#a3e635", align: "left", animIn: "typewriter", animInDuration: 1.6, animOut: "fade", shadow: false, boxEnabled: true, boxColor: "rgba(0,0,0,0.75)", boxRadius: 6 },
    transform: { x: -300, y: 300 },
    duration: 4,
    preview: { bg: "#052e16", fg: "#a3e635", sample: "> typing_", font: "JetBrains Mono", weight: 600, size: 12 },
  },
  {
    id: "social-hook",
    name: "Hook",
    category: "Social",
    style: { content: "Wait for it…", fontFamily: "Poppins", fontWeight: 800, fontSize: 110, color: "#ffffff", strokeWidth: 8, strokeColor: "#111827", animIn: "pop", animOut: "scale", shadow: true, shadowY: 10, shadowBlur: 0, shadowColor: "rgba(0,0,0,0.5)" },
    transform: { x: 0, y: -300 },
    duration: 2.5,
    preview: { bg: "linear-gradient(135deg,#f472b6,#fb923c)", fg: "#fff", sample: "Wait for it…", font: "Poppins", weight: 800, size: 15 },
  },
  {
    id: "social-tag",
    name: "Handle Tag",
    category: "Social",
    style: { content: "@yourhandle", fontFamily: "DM Sans", fontWeight: 700, fontSize: 48, color: "#111827", boxEnabled: true, boxColor: "#ffffff", boxPaddingX: 30, boxPaddingY: 14, boxRadius: 999, animIn: "slide-up", animOut: "fade", shadow: false },
    transform: { x: 0, y: 440 },
    duration: 6,
    preview: { bg: "#e5e7eb", fg: "#111827", sample: "@handle", font: "DM Sans", weight: 700, size: 12, box: "#fff" },
  },
  {
    id: "social-quote",
    name: "Quote",
    category: "Social",
    style: { content: "“Simplicity is the ultimate sophistication.”", fontFamily: "Lora", fontWeight: 500, fontSize: 84, italic: true, maxWidth: 70, lineHeight: 1.3, animIn: "blur", animOut: "blur", shadowBlur: 30 },
    duration: 5,
    preview: { bg: "linear-gradient(135deg,#0c4a6e,#082f49)", fg: "#e0f2fe", sample: "“Quote”", font: "Lora", weight: 500, size: 18, italic: true },
  },
];

export function buildTextStyle(preset: TextPreset): TextStyle {
  return { ...defaultTextStyle(), ...preset.style, presetId: preset.id };
}

export function buildTextTransform(preset: TextPreset): Transform {
  return { ...defaultTransform(), ...(preset.transform ?? {}) };
}

// ── Solid / element presets ─────────────────────────────────────────────────

export interface ElementPreset {
  id: string;
  name: string;
  color: string;
  gradient?: { from: string; to: string; angle: number };
  shape: "rectangle" | "ellipse";
  width: number;
  height: number;
  cornerRadius: number;
  opacity?: number;
  blend?: string;
  transform?: Partial<Transform>;
}

export const ELEMENTS: ElementPreset[] = [
  { id: "black", name: "Black", color: "#000000", shape: "rectangle", width: 100, height: 100, cornerRadius: 0 },
  { id: "white", name: "White", color: "#ffffff", shape: "rectangle", width: 100, height: 100, cornerRadius: 0 },
  { id: "dim", name: "Dim Overlay", color: "#000000", shape: "rectangle", width: 100, height: 100, cornerRadius: 0, opacity: 45 },
  { id: "gradient-dark", name: "Bottom Fade", color: "#000000", gradient: { from: "rgba(0,0,0,0)", to: "rgba(0,0,0,0.85)", angle: 180 }, shape: "rectangle", width: 100, height: 100, cornerRadius: 0 },
  { id: "gradient-sunset", name: "Sunset", color: "#f97316", gradient: { from: "#f97316", to: "#db2777", angle: 135 }, shape: "rectangle", width: 100, height: 100, cornerRadius: 0 },
  { id: "gradient-ocean", name: "Ocean", color: "#0ea5e9", gradient: { from: "#0ea5e9", to: "#1e3a8a", angle: 160 }, shape: "rectangle", width: 100, height: 100, cornerRadius: 0 },
  { id: "gradient-mint", name: "Mint", color: "#34d399", gradient: { from: "#a7f3d0", to: "#0f766e", angle: 45 }, shape: "rectangle", width: 100, height: 100, cornerRadius: 0 },
  { id: "card", name: "Card", color: "rgba(15,23,42,0.85)", shape: "rectangle", width: 60, height: 40, cornerRadius: 28 },
  { id: "pill", name: "Pill", color: "#6366f1", shape: "rectangle", width: 30, height: 9, cornerRadius: 999 },
  { id: "circle", name: "Circle", color: "#f59e0b", shape: "ellipse", width: 30, height: 53, cornerRadius: 0 },
  { id: "bar", name: "Accent Bar", color: "#ef4444", shape: "rectangle", width: 1.2, height: 30, cornerRadius: 6 },
  { id: "letterbox", name: "Letterbox 2.39", color: "#000000", shape: "rectangle", width: 100, height: 100, cornerRadius: 0 },
];
