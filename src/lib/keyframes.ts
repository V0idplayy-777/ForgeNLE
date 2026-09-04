import { AnimProp, Clip, Easing, Keyframe, KeyframeMap } from "../types";
import { clamp, lerp, uid } from "./utils";

export function ease(t: number, easing: Easing): number {
  t = clamp(t, 0, 1);
  switch (easing) {
    case "ease-in":
      return t * t * t;
    case "ease-out":
      return 1 - Math.pow(1 - t, 3);
    case "ease-in-out":
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    default:
      return t;
  }
}

/** Base (non-animated) value of a property on a clip. */
export function baseValue(clip: Clip, prop: AnimProp): number {
  switch (prop) {
    case "x":
      return clip.transform.x;
    case "y":
      return clip.transform.y;
    case "scale":
      return clip.transform.scale;
    case "rotation":
      return clip.transform.rotation;
    case "opacity":
      return clip.effects.opacity;
    case "volume":
      return clip.audio.volume;
  }
}

export function evaluateKeyframes(kfs: Keyframe[] | undefined, local: number, fallback: number): number {
  if (!kfs || kfs.length === 0) return fallback;
  if (kfs.length === 1) return kfs[0].value;
  const sorted = kfs; // stored sorted
  if (local <= sorted[0].time) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (local >= last.time) return last.value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (local >= a.time && local <= b.time) {
      const span = b.time - a.time;
      const t = span <= 0 ? 1 : (local - a.time) / span;
      return lerp(a.value, b.value, ease(t, a.easing));
    }
  }
  return fallback;
}

export interface AnimatedValues {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  volume: number;
}

export function evaluateClip(clip: Clip, local: number): AnimatedValues {
  const k = clip.keyframes || {};
  return {
    x: evaluateKeyframes(k.x, local, clip.transform.x),
    y: evaluateKeyframes(k.y, local, clip.transform.y),
    scale: evaluateKeyframes(k.scale, local, clip.transform.scale),
    rotation: evaluateKeyframes(k.rotation, local, clip.transform.rotation),
    opacity: evaluateKeyframes(k.opacity, local, clip.effects.opacity),
    volume: evaluateKeyframes(k.volume, local, clip.audio.volume),
  };
}

export function hasKeyframes(clip: Clip, prop?: AnimProp): boolean {
  const k = clip.keyframes || {};
  if (prop) return !!(k[prop] && k[prop]!.length);
  return Object.values(k).some((arr) => arr && arr.length > 0);
}

export function sortKeyframes(kfs: Keyframe[]) {
  return [...kfs].sort((a, b) => a.time - b.time);
}

/** Insert or update a keyframe at `time` (local seconds). */
export function upsertKeyframe(map: KeyframeMap, prop: AnimProp, time: number, value: number, easing: Easing = "ease-in-out"): KeyframeMap {
  const list = map[prop] ? [...map[prop]!] : [];
  const existing = list.find((k) => Math.abs(k.time - time) < 0.02);
  if (existing) {
    existing.value = value;
  } else {
    list.push({ id: uid("kf"), time, value, easing });
  }
  return { ...map, [prop]: sortKeyframes(list) };
}

export function removeKeyframeAt(map: KeyframeMap, prop: AnimProp, time: number): KeyframeMap {
  const list = (map[prop] || []).filter((k) => Math.abs(k.time - time) >= 0.02);
  const next = { ...map };
  if (list.length) next[prop] = list;
  else delete next[prop];
  return next;
}

export function keyframeAt(map: KeyframeMap, prop: AnimProp, time: number): Keyframe | undefined {
  return (map[prop] || []).find((k) => Math.abs(k.time - time) < 0.02);
}

export function allKeyframeTimes(map: KeyframeMap): number[] {
  const set = new Set<number>();
  for (const arr of Object.values(map)) for (const k of arr || []) set.add(Math.round(k.time * 1000) / 1000);
  return Array.from(set).sort((a, b) => a - b);
}

/** Shift all keyframes by `delta` seconds and drop those outside [0, duration]. */
export function shiftKeyframes(map: KeyframeMap, delta: number, duration: number): KeyframeMap {
  const out: KeyframeMap = {};
  for (const [prop, arr] of Object.entries(map) as [AnimProp, Keyframe[]][]) {
    const moved = (arr || []).map((k) => ({ ...k, time: k.time + delta })).filter((k) => k.time >= -0.001 && k.time <= duration + 0.001);
    if (moved.length) out[prop] = moved;
  }
  return out;
}

export function scaleKeyframes(map: KeyframeMap, factor: number): KeyframeMap {
  const out: KeyframeMap = {};
  for (const [prop, arr] of Object.entries(map) as [AnimProp, Keyframe[]][]) {
    if (arr && arr.length) out[prop] = arr.map((k) => ({ ...k, time: k.time * factor }));
  }
  return out;
}
