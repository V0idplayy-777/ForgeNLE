// ─────────────────────────────────────────────────────────────────────────────
// Forge NLE — synthesized SFX kit.
//
// Gaming edits live on whooshes, impacts and bleeps. Rather than shipping audio
// files, every effect here is rendered with raw DSP into a WAV blob, so the kit
// works offline, needs no licensing, and persists like any other media asset.
// ─────────────────────────────────────────────────────────────────────────────

import { MediaAsset } from "../types";
import { uid } from "./utils";
import { saveMediaBlob } from "./storage";

export type SfxId = "whoosh" | "impact" | "pop" | "riser" | "bleep" | "airhorn" | "vine-boom" | "scratch" | "trombone" | "chaching" | "dun-dun-dun";

export interface SfxDef {
  id: SfxId;
  name: string;
  hint: string;
  /** Default length in seconds (bleep can be re-rendered at any length). */
  duration: number;
  icon: string;
}

export const SFX_DEFS: SfxDef[] = [
  { id: "whoosh", name: "Whoosh", hint: "Transitions, whip-pans, punch-ins", duration: 0.5, icon: "💨" },
  { id: "impact", name: "Impact Hit", hint: "Kills, explosions, hit-markers", duration: 0.6, icon: "💥" },
  { id: "pop", name: "Pop", hint: "Captions, kills confirms, UI", duration: 0.16, icon: "🫧" },
  { id: "riser", name: "Riser", hint: "Build-up before a drop or clutch", duration: 0.9, icon: "📈" },
  { id: "bleep", name: "Bleep", hint: "Censor tone (renders at any length)", duration: 1.0, icon: "🤐" },
  { id: "airhorn", name: "Airhorn", hint: "Meme victories and jumpscares", duration: 0.8, icon: "📯" },
  { id: "vine-boom", name: "Vine Boom", hint: "Dramatic zoom on a sus moment", duration: 0.9, icon: "🔊" },
  { id: "scratch", name: "Record Scratch", hint: "\"Yep, that's me\" freeze-frame", duration: 0.7, icon: "📀" },
  { id: "trombone", name: "Sad Trombone", hint: "Fails, Ls and unfortunate events", duration: 1.7, icon: "🎷" },
  { id: "chaching", name: "Cha-Ching", hint: "Wins, loot, sponsor segments", duration: 0.8, icon: "🪙" },
  { id: "dun-dun-dun", name: "Dun Dun Dunnn", hint: "Dramatic reveal sting", duration: 1.6, icon: "🎭" },
];

const SR = 44100;

function noiseBuffer(n: number): Float32Array {
  const out = new Float32Array(n);
  let seed = 0x12345678;
  for (let i = 0; i < n; i++) {
    // deterministic LCG so renders are stable
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    out[i] = (seed >>> 8) / 0x7fffff - 1;
  }
  return out;
}

/** One-pole lowpass with a per-sample cutoff sweep (cutoffs in Hz). */
function sweepLowpass(x: Float32Array, fromHz: number, toHz: number): Float32Array {
  const out = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    const t = x.length <= 1 ? 0 : i / (x.length - 1);
    const fc = fromHz + (toHz - fromHz) * t;
    const alpha = 1 - Math.exp((-2 * Math.PI * Math.min(18000, Math.max(40, fc))) / SR);
    y += alpha * (x[i] - y);
    out[i] = y;
  }
  return out;
}

function normalize(x: Float32Array, peak = 0.89): Float32Array {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m < 1e-6) return x;
  const g = peak / m;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

function fadeEnds(x: Float32Array, ms = 5) {
  const n = Math.floor((ms / 1000) * SR);
  for (let i = 0; i < Math.min(n, x.length); i++) {
    const g = i / n;
    x[i] *= g;
    x[x.length - 1 - i] *= g;
  }
}

export function renderSfx(id: SfxId, duration: number): Float32Array {
  const n = Math.max(1, Math.floor(duration * SR));
  const out = new Float32Array(n);
  if (id === "whoosh") {
    const nz = sweepLowpass(noiseBuffer(n), 500, 6500);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const env = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 1.4;
      out[i] = nz[i] * env * 2.2;
    }
  } else if (id === "impact") {
    const nz = sweepLowpass(noiseBuffer(n), 3000, 300);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const f = 38 + 130 * Math.exp(-t * 9);
      phase += (2 * Math.PI * f) / SR;
      const body = Math.sin(phase) * Math.exp(-t * 7);
      const snap = nz[i] * Math.exp(-t * 26) * 1.4;
      out[i] = body * 1.1 + snap;
    }
  } else if (id === "pop") {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const f = 480 + 620 * t;
      phase += (2 * Math.PI * f) / SR;
      out[i] = Math.sin(phase) * Math.exp(-t * 9) + (Math.random() - 0.5) * Math.exp(-t * 60) * 0.8;
    }
  } else if (id === "riser") {
    const nz = sweepLowpass(noiseBuffer(n), 300, 9000);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const f = 170 + 1250 * t * t;
      phase += (2 * Math.PI * f) / SR;
      const env = t ** 2.2;
      out[i] = (Math.sin(phase) * 0.5 + nz[i] * 1.6) * env;
    }
    // tiny down-chirp tail so it doesn't end dead
    const tail = Math.floor(n * 0.06);
    for (let i = 0; i < tail; i++) {
      const k = n - tail + i;
      out[k] *= 1 - i / tail;
    }
  } else if (id === "bleep") {
    for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * 1000 * i) / SR) * 0.55;
    fadeEnds(out, 8);
    return normalize(out);
  } else if (id === "airhorn") {
    // detuned saw stack + drive = obnoxious meme blast
    const freqs = [392, 494.2, 587.3, 196.5];
    const phases = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const t = i / n;
      let v = 0;
      for (let h = 0; h < freqs.length; h++) {
        phases[h] += (2 * Math.PI * freqs[h]) / SR;
        const p = (phases[h] % (2 * Math.PI)) / (2 * Math.PI);
        v += (p * 2 - 1) * (h === 3 ? 0.35 : 0.55);
      }
      const trem = 0.92 + 0.08 * Math.sin((2 * Math.PI * 28 * i) / SR);
      const env = Math.min(1, t / 0.03) * Math.min(1, (1 - t) / 0.12);
      out[i] = Math.tanh(v * 0.9) * trem * env;
    }
  } else if (id === "vine-boom") {
    // big detuned sub drop with a distorted thud and a soft noise slap
    const nz = sweepLowpass(noiseBuffer(n), 900, 120);
    let p1 = 0;
    let p2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const f1 = 82 * Math.pow(0.55, t * 1.6); // slides down to ~45 Hz
      p1 += (2 * Math.PI * f1) / SR;
      p2 += (2 * Math.PI * f1 * 1.007) / SR;
      const env = Math.min(1, t / 0.012) * Math.exp(-t * 5.2);
      const sub = (Math.sin(p1) + Math.sin(p2)) * 0.6;
      const driven = Math.tanh(sub * 2.4) * 0.7 + sub * 0.5;
      const slap = nz[i] * Math.exp(-t * 34) * 1.5;
      out[i] = driven * env + slap;
    }
  } else if (id === "scratch") {
    // wobbling band-passed noise — record speeding up and slowing back down
    const nz = noiseBuffer(n);
    let lp = 0;
    let lp2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      // cutoff wobbles like vinyl pitch: up-down-up
      const wobble = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4.2 * t - Math.PI / 2);
      const fc = 900 + 7200 * Math.pow(wobble, 1.5);
      const alpha = 1 - Math.exp((-2 * Math.PI * fc) / SR);
      lp += alpha * (nz[i] - lp);
      const alpha2 = 1 - Math.exp((-2 * Math.PI * fc * 2.2) / SR);
      lp2 += alpha2 * (lp - lp2);
      const env = Math.sin(Math.PI * Math.min(1, t * 1.06)) ** 0.8;
      out[i] = (lp2 * 3.2 + nz[i] * 0.12) * env;
    }
  } else if (id === "trombone") {
    // four descending wah notes, the last one drooping with vibrato
    const notes = [233.1, 207.7, 185.0, 174.6]; // Bb3 A3 F#3 A3-ish
    const noteDur = [0.28, 0.28, 0.28, 0.82];
    let idx = 0;
    let localT = 0;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      while (idx < notes.length - 1 && localT > noteDur[idx]) {
        localT -= noteDur[idx];
        idx++;
      }
      let f = notes[idx];
      const inNote = localT / noteDur[idx];
      if (idx === notes.length - 1) {
        f *= 1 - 0.06 * inNote; // droop
        f *= 1 + 0.02 * Math.sin(2 * Math.PI * 5.5 * localT) * Math.min(1, inNote * 2); // vibrato
      }
      phase += (2 * Math.PI * f) / SR;
      // muffled brass: saw through a mild lowpass feel (few harmonics)
      let v = 0;
      for (let h = 1; h <= 6; h++) v += Math.sin(phase * h) / h;
      const env = Math.min(1, localT / 0.02) * Math.min(1, Math.max(0, (1 - inNote) / 0.15));
      out[i] = Math.tanh(v * 0.75) * env * (idx === notes.length - 1 ? 0.9 : 0.75);
      localT += 1 / SR;
    }
  } else if (id === "chaching") {
    // coin clack + two bright bell dings
    const nz = sweepLowpass(noiseBuffer(n), 6000, 2500);
    const dings = [
      { at: 0.02, f: 2489, g: 0.8 },
      { at: 0.11, f: 3322, g: 0.9 },
      { at: 0.2, f: 4978, g: 0.7 },
    ];
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let v = nz[i] * Math.exp(-t * 60) * 1.1;
      for (const d of dings) {
        const dt = t - d.at;
        if (dt < 0) continue;
        v += (Math.sin(2 * Math.PI * d.f * dt) + 0.4 * Math.sin(2 * Math.PI * d.f * 2.76 * dt)) * Math.exp(-dt * 9) * d.g;
      }
      out[i] = v;
    }
  } else if (id === "dun-dun-dun") {
    // three dramatic stabs, last one lower with a pitch fall
    const stab = 0.34;
    const gap = 0.46;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let hit = -1;
      let lt = 0;
      if (t < stab) {
        hit = 0;
        lt = t;
      } else if (t >= gap && t < gap + stab) {
        hit = 1;
        lt = t - gap;
      } else if (t >= gap * 2) {
        hit = 2;
        lt = t - gap * 2;
      }
      if (hit < 0) {
        out[i] = 0;
        continue;
      }
      const f = (hit === 2 ? 146.8 : 196.0) * (hit === 2 ? 1 - Math.min(0.12, lt * 0.12) : 1);
      phase += (2 * Math.PI * f) / SR;
      let v = 0;
      for (let h = 1; h <= 5; h++) v += Math.sin(phase * h + (h % 2 ? 0 : Math.PI / 2)) / h;
      const env = Math.min(1, lt / 0.008) * (hit === 2 ? Math.exp(-lt * 2.6) : Math.exp(-lt * 8));
      out[i] = Math.tanh(v * 1.15) * env * (hit === 2 ? 1 : 0.85);
    }
  }
  fadeEnds(out, 4);
  return normalize(out);
}

function encodeWav(x: Float32Array): Blob {
  const n = x.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const wstr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  wstr(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  wstr(8, "WAVE");
  wstr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, SR, true);
  v.setUint32(28, SR * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  wstr(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, x[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

function peaksOf(x: Float32Array, buckets = 120): number[] {
  const out: number[] = [];
  const block = Math.max(1, Math.floor(x.length / buckets));
  let max = 0;
  for (let i = 0; i < buckets; i++) {
    let m = 0;
    const start = i * block;
    for (let j = 0; j < block && start + j < x.length; j++) m = Math.max(m, Math.abs(x[start + j]));
    out.push(m);
    max = Math.max(max, m);
  }
  return out.map((p) => (max > 0 ? Math.min(1, p / max) : 0));
}

// ── Asset cache ─────────────────────────────────────────────────────────────

const assetCache = new Map<string, MediaAsset>();

export function sfxDef(id: SfxId): SfxDef {
  return SFX_DEFS.find((d) => d.id === id)!;
}

/**
 * Renders (or reuses) a media asset for an SFX. `duration` only matters for
 * `bleep`, which is re-rendered at the requested length for censor boxes.
 */
export async function ensureSfxAsset(id: SfxId, duration?: number): Promise<MediaAsset> {
  const def = sfxDef(id);
  const dur = id === "bleep" ? Math.max(0.1, duration ?? def.duration) : def.duration;
  const key = id === "bleep" ? `sfx-bleep-${Math.round(dur * 1000)}` : `sfx-${id}`;
  const hit = assetCache.get(key);
  if (hit && hit.duration >= dur - 0.001) return hit;

  const samples = renderSfx(id, dur);
  const blob = encodeWav(samples);
  const url = URL.createObjectURL(blob);
  const asset: MediaAsset = {
    id: key,
    name: `SFX · ${def.name}${id === "bleep" && duration ? ` ${dur.toFixed(1)}s` : ""}.wav`,
    type: "audio",
    url,
    duration: samples.length / SR,
    hasAudio: true,
    waveform: peaksOf(samples),
    size: blob.size,
  };
  assetCache.set(key, asset);
  // Persist under a stable asset id so session restore keeps working.
  void saveMediaBlob(key, blob).catch(() => undefined);
  return asset;
}

/** Fire-and-forget preview of an SFX through a plain audio element. */
let previewEl: HTMLAudioElement | null = null;
export async function previewSfx(id: SfxId): Promise<void> {
  const asset = await ensureSfxAsset(id);
  try {
    previewEl?.pause();
    if (!previewEl) previewEl = new Audio();
    previewEl.src = asset.url;
    previewEl.currentTime = 0;
    await previewEl.play();
  } catch {
    /* autoplay policy — user gesture required, button clicks count */
  }
}

export function sfxUid(): string {
  return uid("sfx");
}
