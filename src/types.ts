// ─────────────────────────────────────────────────────────────────────────────
// Forge NLE — core data model
// ─────────────────────────────────────────────────────────────────────────────

export type MediaType = "video" | "audio" | "image";
export type TrackType = "video" | "audio";
export type ClipKind = "media" | "text" | "solid" | "adjustment";

export interface MediaAsset {
  id: string;
  name: string;
  type: MediaType;
  url: string;
  duration: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  thumbnail?: string;
  /** Evenly spaced filmstrip frames (data URLs) for timeline rendering. */
  filmstrip?: string[];
  waveform?: number[];
  /** Cached beat analysis (source-relative seconds). */
  beats?: { times: number[]; strengths: number[]; bpm: number };
  /** True when the underlying file could not be restored from storage. */
  missing?: boolean;
  size?: number;
}

// ── Effects / color ─────────────────────────────────────────────────────────

export interface ClipEffects {
  brightness: number; // 100 = normal
  contrast: number; // 100 = normal
  saturation: number; // 100 = normal
  exposure: number; // -100..100 (stops * 100)
  temperature: number; // -100 (cool) .. 100 (warm)
  tint: number; // -100 (green) .. 100 (magenta)
  hue: number; // deg
  vignette: number; // 0..100
  blur: number; // px
  grayscale: number; // 0..100
  sepia: number; // 0..100
  invert: number; // 0..100
  opacity: number; // 0..100
  fadeIn: number; // seconds (visual fade from transparent)
  fadeOut: number; // seconds
  lookId?: string; // applied preset id (informational)
}

export function defaultEffects(): ClipEffects {
  return {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    exposure: 0,
    temperature: 0,
    tint: 0,
    hue: 0,
    vignette: 0,
    blur: 0,
    grayscale: 0,
    sepia: 0,
    invert: 0,
    opacity: 100,
    fadeIn: 0,
    fadeOut: 0,
  };
}

// ── Transform ───────────────────────────────────────────────────────────────

export type FitMode = "contain" | "cover" | "stretch" | "none";

export type BlendMode =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: "source-over", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "darken", label: "Darken" },
  { value: "lighten", label: "Lighten" },
  { value: "color-dodge", label: "Color Dodge" },
  { value: "color-burn", label: "Color Burn" },
  { value: "hard-light", label: "Hard Light" },
  { value: "soft-light", label: "Soft Light" },
  { value: "difference", label: "Difference" },
  { value: "exclusion", label: "Exclusion" },
  { value: "hue", label: "Hue" },
  { value: "saturation", label: "Saturation" },
  { value: "color", label: "Color" },
  { value: "luminosity", label: "Luminosity" },
];

export interface Transform {
  x: number; // px offset from frame center (project space)
  y: number;
  scale: number; // 1 = 100%
  rotation: number; // degrees
}

export interface Crop {
  left: number; // percent 0..100 of source
  top: number;
  right: number;
  bottom: number;
}

export function defaultTransform(): Transform {
  return { x: 0, y: 0, scale: 1, rotation: 0 };
}
export function defaultCrop(): Crop {
  return { left: 0, top: 0, right: 0, bottom: 0 };
}

// ── Keyframes ───────────────────────────────────────────────────────────────

export type Easing = "linear" | "ease-in" | "ease-out" | "ease-in-out";
export type AnimProp = "x" | "y" | "scale" | "rotation" | "opacity" | "volume";
export const ANIM_PROPS: AnimProp[] = ["x", "y", "scale", "rotation", "opacity", "volume"];

export interface Keyframe {
  id: string;
  time: number; // seconds relative to clip start (timeline time)
  value: number;
  easing: Easing;
}

export type KeyframeMap = Partial<Record<AnimProp, Keyframe[]>>;

// ── Chroma key ──────────────────────────────────────────────────────────────

export interface ChromaKey {
  enabled: boolean;
  color: string; // key colour (hex)
  similarity: number; // 0..100 — how close a pixel must be to the key colour
  smoothness: number; // 0..100 — width of the soft edge
  spill: number; // 0..100 — spill suppression strength
}

export function defaultChromaKey(): ChromaKey {
  return { enabled: false, color: "#00ff00", similarity: 32, smoothness: 12, spill: 50 };
}

// ── Masks ───────────────────────────────────────────────────────────────────

export type MaskShape = "none" | "rectangle" | "ellipse";

export interface ClipMask {
  shape: MaskShape;
  /** Centre offset from frame centre, in percent of frame size (-100..100). */
  x: number;
  y: number;
  /** Size in percent of frame size. */
  width: number;
  height: number;
  rotation: number; // deg
  feather: number; // px (project space)
  cornerRadius: number; // px (rectangle only)
  invert: boolean;
}

export function defaultMask(): ClipMask {
  return { shape: "none", x: 0, y: 0, width: 60, height: 60, rotation: 0, feather: 0, cornerRadius: 0, invert: false };
}

// ── Transitions ─────────────────────────────────────────────────────────────

export type TransitionType =
  | "none"
  | "crossfade"
  | "dip-black"
  | "dip-white"
  | "wipe-left"
  | "wipe-right"
  | "wipe-up"
  | "wipe-down"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "push-left"
  | "push-right"
  | "zoom-in"
  | "zoom-out"
  | "blur"
  | "iris"
  | "glitch-cut";

export interface Transition {
  type: TransitionType;
  duration: number;
}

export function defaultTransition(): Transition {
  return { type: "none", duration: 0.6 };
}

// ── Audio ───────────────────────────────────────────────────────────────────

export interface ClipAudio {
  volume: number; // 0..200 percent
  pan: number; // -100..100
  fadeIn: number;
  fadeOut: number;
  muted: boolean;
  preservesPitch: boolean;
}

export function defaultAudio(): ClipAudio {
  return { volume: 100, pan: 0, fadeIn: 0, fadeOut: 0, muted: false, preservesPitch: true };
}

// ── Text ────────────────────────────────────────────────────────────────────

export type TextAlign = "left" | "center" | "right";
export type TextAnim =
  | "none"
  | "fade"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "scale"
  | "blur"
  | "typewriter"
  | "pop"
  | "reveal";

export interface TextStyle {
  content: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  italic: boolean;
  uppercase: boolean;
  color: string;
  align: TextAlign;
  letterSpacing: number; // px
  lineHeight: number; // multiplier
  maxWidth: number; // percent of frame width
  strokeWidth: number;
  strokeColor: string;
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowX: number;
  shadowY: number;
  boxEnabled: boolean;
  boxColor: string;
  boxPaddingX: number;
  boxPaddingY: number;
  boxRadius: number;
  animIn: TextAnim;
  animInDuration: number;
  animOut: TextAnim;
  animOutDuration: number;
  presetId?: string;
}

export function defaultTextStyle(): TextStyle {
  return {
    content: "Your title here",
    fontFamily: "Inter",
    fontWeight: 700,
    fontSize: 96,
    italic: false,
    uppercase: false,
    color: "#ffffff",
    align: "center",
    letterSpacing: -1,
    lineHeight: 1.15,
    maxWidth: 80,
    strokeWidth: 0,
    strokeColor: "#000000",
    shadow: true,
    shadowColor: "rgba(0,0,0,0.55)",
    shadowBlur: 24,
    shadowX: 0,
    shadowY: 6,
    boxEnabled: false,
    boxColor: "rgba(0,0,0,0.6)",
    boxPaddingX: 36,
    boxPaddingY: 20,
    boxRadius: 12,
    animIn: "fade",
    animInDuration: 0.5,
    animOut: "fade",
    animOutDuration: 0.4,
  };
}

// ── Solids / shapes ─────────────────────────────────────────────────────────

export type SolidShape = "rectangle" | "ellipse";

export interface SolidStyle {
  color: string;
  gradient?: { from: string; to: string; angle: number };
  shape: SolidShape;
  /** Width/height as percent of frame; 100 = full frame. */
  width: number;
  height: number;
  cornerRadius: number;
}

export function defaultSolid(): SolidStyle {
  return { color: "#111827", shape: "rectangle", width: 100, height: 100, cornerRadius: 0 };
}

// ── Clip / Track ────────────────────────────────────────────────────────────

export interface Clip {
  id: string;
  trackId: string;
  kind: ClipKind;
  mediaId?: string;
  name: string;
  color: string;
  start: number; // timeline position (s)
  duration: number; // timeline length (s)
  trimIn: number; // in-point inside source media (s, source time)
  speed: number; // 0.1 .. 8
  /** Play the source backwards (source time runs from the out-point to the in-point). */
  reverse?: boolean;
  /** Freeze frame: source time is pinned to trimIn for the whole clip. */
  freeze?: boolean;
  /**
   * Speed ramp: keyframes on playback rate (value = speed multiplier) in clip-local
   * seconds. When present, `speed` is ignored and source time is the integral of the
   * rate curve — like Premiere's Time Remapping.
   */
  speedRamp?: Keyframe[];
  effects: ClipEffects;
  transform: Transform;
  crop: Crop;
  cornerRadius: number; // px in project space
  fit: FitMode;
  blendMode: BlendMode;
  keyframes: KeyframeMap;
  audio: ClipAudio;
  /** Audio of this video clip has been detached to a separate audio clip. */
  audioDetached?: boolean;
  transitionIn?: Transition;
  text?: TextStyle;
  solid?: SolidStyle;
  /** Pixel keying (media clips). */
  chromaKey?: ChromaKey;
  /** Shape mask applied in clip space (any video clip, including adjustment layers). */
  mask?: ClipMask;
  linkGroup?: string;
}

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  clips: Clip[];
  muted: boolean;
  solo: boolean;
  hidden: boolean;
  locked: boolean;
  volume: number; // 0..200 percent (audio + video tracks)
  height: "s" | "m" | "l";
}

export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
  /** Optional grouping tag, e.g. "beats:<assetId>" for auto-generated markers. */
  tag?: string;
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  background: string;
}

export function defaultProjectSettings(): ProjectSettings {
  return { width: 1920, height: 1080, fps: 30, background: "#000000" };
}

export const RESOLUTION_PRESETS: { label: string; width: number; height: number; group: string }[] = [
  { label: "1080p · 16:9", width: 1920, height: 1080, group: "Landscape" },
  { label: "4K UHD · 16:9", width: 3840, height: 2160, group: "Landscape" },
  { label: "720p · 16:9", width: 1280, height: 720, group: "Landscape" },
  { label: "Cinema 2K · 2.39:1", width: 2048, height: 858, group: "Landscape" },
  { label: "Vertical · 9:16", width: 1080, height: 1920, group: "Social" },
  { label: "Square · 1:1", width: 1080, height: 1080, group: "Social" },
  { label: "Portrait · 4:5", width: 1080, height: 1350, group: "Social" },
];

export type ToolMode = "select" | "razor" | "hand" | "slip" | "roll" | "ripple";

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
}

export interface SerializedProject {
  version: 2;
  projectName: string;
  settings: ProjectSettings;
  tracks: Track[];
  markers: Marker[];
  mediaAssets: Omit<MediaAsset, "url">[];
  inPoint: number | null;
  outPoint: number | null;
  savedAt: number;
}
