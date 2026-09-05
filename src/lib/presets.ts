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
  { id: "arcade", name: "Arcade", description: "Hyper-saturated gameplay pop", swatch: ["#22d3ee", "#f472b6"], effects: { saturation: 138, contrast: 112, exposure: 4, vignette: 16 } },
  { id: "nightops", name: "Night Ops", description: "Cold crushed blacks for night raids", swatch: ["#0f172a", "#38bdf8"], effects: { temperature: -26, exposure: -10, contrast: 124, saturation: 84, vignette: 38 } },
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
  category: "Titles" | "Lower Thirds" | "Captions" | "Social" | "Emphasis";
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
  // ── Emphasis: reaction captions ──
  {
    id: "em-boom",
    name: "BOOM",
    category: "Emphasis",
    style: { content: "BOOM!", fontFamily: "Anton", fontWeight: 400, fontSize: 230, uppercase: true, color: "#facc15", strokeWidth: 16, strokeColor: "#111111", letterSpacing: -2, animIn: "pop", animInDuration: 0.28, animOut: "scale", animOutDuration: 0.25, shadow: true, shadowBlur: 0, shadowY: 12, shadowColor: "rgba(0,0,0,0.65)" },
    transform: { y: -40 },
    duration: 1.2,
    preview: { bg: "linear-gradient(135deg,#7f1d1d,#450a0a)", fg: "#facc15", sample: "BOOM!", font: "Anton", weight: 400, size: 24 },
  },
  {
    id: "em-wait-what",
    name: "WAIT WHAT",
    category: "Emphasis",
    style: { content: "WAIT WHAT?!", fontFamily: "Montserrat", fontWeight: 900, fontSize: 130, uppercase: true, color: "#ffffff", strokeWidth: 12, strokeColor: "#111827", letterSpacing: -3, animIn: "scale", animInDuration: 0.22, animOut: "fade", animOutDuration: 0.2, shadow: true, shadowBlur: 0, shadowY: 8, shadowColor: "rgba(0,0,0,0.6)" },
    transform: { y: -260, rotation: -3 },
    duration: 1.4,
    preview: { bg: "linear-gradient(135deg,#4c1d95,#1e1b4b)", fg: "#fff", sample: "WAIT WHAT?!", font: "Montserrat", weight: 900, size: 15 },
  },
  {
    id: "em-nope",
    name: "NOPE",
    category: "Emphasis",
    style: { content: "NOPE", fontFamily: "Anton", fontWeight: 400, fontSize: 210, uppercase: true, color: "#ef4444", strokeWidth: 14, strokeColor: "#0a0a0a", letterSpacing: 2, animIn: "slide-left", animInDuration: 0.22, animOut: "slide-right", animOutDuration: 0.2, shadow: true, shadowBlur: 0, shadowY: 10, shadowColor: "rgba(0,0,0,0.6)" },
    transform: { y: 120, rotation: 3 },
    duration: 1.1,
    preview: { bg: "linear-gradient(135deg,#111,#27272a)", fg: "#ef4444", sample: "NOPE", font: "Anton", weight: 400, size: 24 },
  },
  {
    id: "em-lol",
    name: "LOL",
    category: "Emphasis",
    style: { content: "LOL", fontFamily: "Poppins", fontWeight: 800, fontSize: 200, uppercase: true, color: "#a3e635", strokeWidth: 14, strokeColor: "#14532d", letterSpacing: -2, animIn: "pop", animInDuration: 0.25, animOut: "fade", animOutDuration: 0.22, shadow: true, shadowBlur: 0, shadowY: 10, shadowColor: "rgba(0,0,0,0.5)" },
    transform: { x: 320, y: -300, rotation: -7 },
    duration: 1.2,
    preview: { bg: "linear-gradient(135deg,#166534,#052e16)", fg: "#a3e635", sample: "LOL", font: "Poppins", weight: 800, size: 24 },
  },
  {
    id: "em-hold-up",
    name: "HOLD UP",
    category: "Emphasis",
    style: { content: "HOLD UP", fontFamily: "Oswald", fontWeight: 700, fontSize: 120, uppercase: true, color: "#ffffff", letterSpacing: 6, boxEnabled: true, boxColor: "#dc2626", boxPaddingX: 44, boxPaddingY: 18, boxRadius: 8, animIn: "slide-up", animInDuration: 0.26, animOut: "slide-down", animOutDuration: 0.22, shadow: false },
    transform: { y: 300 },
    duration: 1.5,
    preview: { bg: "linear-gradient(135deg,#0f172a,#1e293b)", fg: "#fff", sample: "HOLD UP", font: "Oswald", weight: 700, size: 15, box: "#dc2626" },
  },
  {
    id: "em-omg",
    name: "OH NO",
    category: "Emphasis",
    style: { content: "OH NO", fontFamily: "Bebas Neue", fontWeight: 400, fontSize: 190, uppercase: true, color: "#f472b6", strokeWidth: 14, strokeColor: "#111111", letterSpacing: 4, animIn: "scale", animInDuration: 0.25, animOut: "scale", animOutDuration: 0.22, shadow: true, shadowBlur: 0, shadowY: 10, shadowColor: "rgba(0,0,0,0.6)" },
    transform: { x: -300, y: -260, rotation: 4 },
    duration: 1.3,
    preview: { bg: "linear-gradient(135deg,#831843,#500724)", fg: "#f472b6", sample: "OH NO", font: "Bebas Neue", weight: 400, size: 24 },
  },
  // ── Gaming: replay tags, callouts ──
  {
    id: "em-replay",
    name: "REPLAY",
    category: "Emphasis",
    style: { content: "↺ REPLAY", fontFamily: "Oswald", fontWeight: 700, fontSize: 72, uppercase: true, color: "#ffffff", letterSpacing: 8, boxEnabled: true, boxColor: "#dc2626", boxPaddingX: 40, boxPaddingY: 16, boxRadius: 10, animIn: "slide-left", animInDuration: 0.25, animOut: "slide-right", animOutDuration: 0.22, shadow: false },
    transform: { x: -560, y: -380 },
    duration: 2.5,
    preview: { bg: "linear-gradient(135deg,#0f172a,#1e293b)", fg: "#fff", sample: "↺ REPLAY", font: "Oswald", weight: 700, size: 15, box: "#dc2626" },
  },
  {
    id: "em-clutch",
    name: "CLUTCH",
    category: "Emphasis",
    style: { content: "CLUTCH!", fontFamily: "Anton", fontWeight: 400, fontSize: 210, uppercase: true, color: "#22d3ee", strokeWidth: 15, strokeColor: "#0a0a0a", letterSpacing: 0, animIn: "wobble", animInDuration: 0.4, animOut: "scale", animOutDuration: 0.22, shadow: true, shadowBlur: 0, shadowY: 12, shadowColor: "rgba(0,0,0,0.65)" },
    transform: { y: -60 },
    duration: 1.4,
    preview: { bg: "linear-gradient(135deg,#083344,#0c4a6e)", fg: "#22d3ee", sample: "CLUTCH!", font: "Anton", weight: 400, size: 23 },
  },
  {
    id: "em-easy",
    name: "TOO EASY",
    category: "Emphasis",
    style: { content: "TOO EASY 😤", fontFamily: "Montserrat", fontWeight: 900, fontSize: 120, uppercase: true, color: "#a3e635", strokeWidth: 11, strokeColor: "#14532d", letterSpacing: -2, animIn: "wobble", animInDuration: 0.4, animOut: "fade", animOutDuration: 0.2, shadow: true, shadowBlur: 0, shadowY: 9, shadowColor: "rgba(0,0,0,0.55)" },
    transform: { y: 220, rotation: -2 },
    duration: 1.4,
    preview: { bg: "linear-gradient(135deg,#052e16,#14532d)", fg: "#a3e635", sample: "TOO EASY", font: "Montserrat", weight: 900, size: 16 },
  },
  {
    id: "em-wtf",
    name: "BRO WHAT",
    category: "Emphasis",
    style: { content: "BRO WHAT?!", fontFamily: "Poppins", fontWeight: 800, fontSize: 150, uppercase: true, color: "#fda4af", strokeWidth: 12, strokeColor: "#4c0519", letterSpacing: -2, animIn: "wobble", animInDuration: 0.45, animOut: "scale", animOutDuration: 0.22, shadow: true, shadowBlur: 0, shadowY: 10, shadowColor: "rgba(0,0,0,0.6)" },
    transform: { x: 260, y: -240, rotation: 5 },
    duration: 1.3,
    preview: { bg: "linear-gradient(135deg,#4c0519,#881337)", fg: "#fda4af", sample: "BRO WHAT?!", font: "Poppins", weight: 800, size: 15 },
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
  /** Timeline duration for short-lived overlays (seconds). */
  duration?: number;
  /** Effect fades (seconds). */
  fadeIn?: number;
  fadeOut?: number;
  /** Draw as an outline instead of a fill (px stroke). */
  strokeWidth?: number;
  strokeColor?: string;
  group?: string;
}

export const ELEMENTS: ElementPreset[] = [
  { id: "black", name: "Black", color: "#000000", shape: "rectangle", width: 100, height: 100, cornerRadius: 0, group: "Basics" },
  { id: "white", name: "White", color: "#ffffff", shape: "rectangle", width: 100, height: 100, cornerRadius: 0, group: "Basics" },
  { id: "dim", name: "Dim Overlay", color: "#000000", shape: "rectangle", width: 100, height: 100, cornerRadius: 0, opacity: 45, group: "Basics" },
  { id: "gradient-dark", name: "Bottom Fade", color: "#000000", gradient: { from: "rgba(0,0,0,0)", to: "rgba(0,0,0,0.85)", angle: 180 }, shape: "rectangle", width: 100, height: 100, cornerRadius: 0, group: "Basics" },
  { id: "gradient-sunset", name: "Sunset", color: "#f97316", gradient: { from: "#f97316", to: "#db2777", angle: 135 }, shape: "rectangle", width: 100, height: 100, cornerRadius: 0, group: "Basics" },
  { id: "gradient-ocean", name: "Ocean", color: "#0ea5e9", gradient: { from: "#0ea5e9", to: "#1e3a8a", angle: 160 }, shape: "rectangle", width: 100, height: 100, cornerRadius: 0, group: "Basics" },
  { id: "gradient-mint", name: "Mint", color: "#34d399", gradient: { from: "#a7f3d0", to: "#0f766e", angle: 45 }, shape: "rectangle", width: 100, height: 100, cornerRadius: 0, group: "Basics" },
  { id: "card", name: "Card", color: "rgba(15,23,42,0.85)", shape: "rectangle", width: 60, height: 40, cornerRadius: 28, group: "Basics" },
  { id: "pill", name: "Pill", color: "#6366f1", shape: "rectangle", width: 30, height: 9, cornerRadius: 999, group: "Basics" },
  { id: "circle", name: "Circle", color: "#f59e0b", shape: "ellipse", width: 30, height: 53, cornerRadius: 0, group: "Basics" },
  { id: "bar", name: "Accent Bar", color: "#ef4444", shape: "rectangle", width: 1.2, height: 30, cornerRadius: 6, group: "Basics" },
  { id: "letterbox", name: "Letterbox 2.39", color: "#000000", shape: "rectangle", width: 100, height: 100, cornerRadius: 0, group: "Basics" },
  // ── Overlays: flashes, bars, accents ──
  { id: "flash-white", name: "Flash White", color: "#ffffff", shape: "rectangle", width: 100, height: 100, cornerRadius: 0, opacity: 88, duration: 0.45, fadeOut: 0.4, group: "Overlays" },
  { id: "flash-red", name: "Flash Red", color: "#ef4444", shape: "rectangle", width: 100, height: 100, cornerRadius: 0, opacity: 78, duration: 0.5, fadeOut: 0.45, group: "Overlays" },
  { id: "flash-amber", name: "Flash Amber", color: "#f59e0b", shape: "rectangle", width: 100, height: 100, cornerRadius: 0, opacity: 78, duration: 0.5, fadeOut: 0.45, group: "Overlays" },
  { id: "accent-bars", name: "Accent Bars", color: "#ef4444", shape: "rectangle", width: 100, height: 5, cornerRadius: 0, group: "Overlays" },
  { id: "ring", name: "Ring Outline", color: "#ffffff", shape: "ellipse", width: 46, height: 82, cornerRadius: 0, strokeWidth: 14, strokeColor: "#ffffff", group: "Overlays" },
  { id: "thin-rule", name: "Thin Rule", color: "#ffffff", shape: "rectangle", width: 36, height: 0.4, cornerRadius: 2, group: "Overlays" },
];
