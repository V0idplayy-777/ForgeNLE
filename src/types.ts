export type MediaType = "video" | "audio" | "image";
export type TrackType = "video" | "audio" | "text";

export interface MediaAsset {
  id: string;
  name: string;
  type: MediaType;
  url: string;
  duration: number;
  width?: number;
  height?: number;
  thumbnail?: string;
  waveform?: number[];
}

export interface ClipEffects {
  brightness: number; // 100 = normal
  contrast: number;
  saturation: number;
  hue: number; // degrees 0-360
  blur: number; // px 0-20
  grayscale: number; // 0-100
  sepia: number; // 0-100
  invert: number; // 0-100
  opacity: number; // 0-100
  volume: number; // 0-200
  speed: number; // 0.25 - 4
  fadeIn: number; // seconds
  fadeOut: number; // seconds
}

export function defaultEffects(): ClipEffects {
  return {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    blur: 0,
    grayscale: 0,
    sepia: 0,
    invert: 0,
    opacity: 100,
    volume: 100,
    speed: 1,
    fadeIn: 0,
    fadeOut: 0,
  };
}

export type TextAlign = "left" | "center" | "right";

export interface TextStyle {
  content: string;
  color: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  x: number; // percent 0-100 (center anchor)
  y: number; // percent 0-100 (center anchor)
  background: string; // css color or 'transparent'
  outline: boolean;
}

export function defaultTextStyle(): TextStyle {
  return {
    content: "Your Title Here",
    color: "#ffffff",
    fontSize: 48,
    fontFamily: "Inter, sans-serif",
    bold: true,
    italic: false,
    align: "center",
    x: 50,
    y: 85,
    background: "transparent",
    outline: true,
  };
}

export interface Clip {
  id: string;
  trackId: string;
  mediaId?: string;
  name: string;
  color: string;
  start: number; // position on the timeline, in seconds
  duration: number; // length occupied on the timeline, in seconds
  trimIn: number; // in-point inside the source media, in seconds (pre-speed)
  effects: ClipEffects;
  text?: TextStyle;
}

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  clips: Clip[];
  muted: boolean;
  hidden: boolean;
  locked: boolean;
}

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
}
