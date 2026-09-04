// ─────────────────────────────────────────────────────────────────────────────
// Beat / onset detection for music-driven editing.
//
// Spectral-flux onset detection on a decoded AudioBuffer:
//   1. Mono mixdown → short frames (~23ms) with a Hann window.
//   2. Per-frame log-energy in a few perceptual bands (kick / snare / hats).
//   3. Positive spectral flux between frames → onset strength envelope.
//   4. Adaptive threshold (moving median + mean) + local peak picking.
//   5. Tempo estimate by autocorrelating the envelope in the 60–200 BPM range.
// ─────────────────────────────────────────────────────────────────────────────

export interface BeatAnalysis {
  /** Onset/beat times in seconds from the start of the source audio. */
  beats: number[];
  /** Estimated tempo in BPM (0 if unknown). */
  bpm: number;
  /** Per-beat strength 0..1 (same length as `beats`). */
  strengths: number[];
  duration: number;
}

const FRAME = 1024;
const HOP = 512;

function hann(n: number) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/** Tiny radix-2 FFT (real input) returning magnitude spectrum for bins 0..n/2. */
function magnitudeSpectrum(re: Float32Array, out: Float32Array) {
  const n = re.length;
  const im = new Float32Array(n);
  // bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const t = re[i];
      re[i] = re[j];
      re[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  for (let k = 0; k <= n / 2; k++) out[k] = Math.hypot(re[k], im[k]);
}

export async function decodeForAnalysis(url: string): Promise<AudioBuffer> {
  const resp = await fetch(url);
  const buf = await resp.arrayBuffer();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(buf.slice(0));
  } finally {
    ctx.close().catch(() => {});
  }
}

export interface BeatOptions {
  /** 0..1 — higher = fewer, stronger beats. */
  sensitivity?: number;
  /** Minimum spacing between detected beats in seconds. */
  minGap?: number;
  onProgress?: (ratio: number) => void;
}

export function analyseBeats(buffer: AudioBuffer, opts: BeatOptions = {}): BeatAnalysis {
  const sensitivity = opts.sensitivity ?? 0.5;
  const minGap = opts.minGap ?? 0.18;
  const sr = buffer.sampleRate;
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  // mono mixdown
  const mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i] / ch;
  }
  const window = hann(FRAME);
  const frames = Math.max(0, Math.floor((len - FRAME) / HOP));
  const bins = FRAME / 2 + 1;
  const re = new Float32Array(FRAME);
  const mag = new Float32Array(bins);
  const prev = new Float32Array(bins);
  const flux = new Float32Array(frames);
  // Emphasise low end (kick) and mid (snare) a bit — they carry the beat.
  const weight = new Float32Array(bins);
  for (let k = 0; k < bins; k++) {
    const hz = (k * sr) / FRAME;
    weight[k] = hz < 150 ? 2.2 : hz < 400 ? 1.4 : hz < 5000 ? 1 : 0.6;
  }
  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    for (let i = 0; i < FRAME; i++) re[i] = mono[off + i] * window[i];
    magnitudeSpectrum(re, mag);
    let sum = 0;
    for (let k = 1; k < bins; k++) {
      const cur = Math.log1p(mag[k] * 10);
      const d = cur - prev[k];
      if (d > 0) sum += d * weight[k];
      prev[k] = cur;
    }
    flux[f] = sum;
    if (opts.onProgress && f % 2000 === 0) opts.onProgress(f / frames);
  }

  // Normalise
  let max = 0;
  for (let i = 0; i < frames; i++) if (flux[i] > max) max = flux[i];
  if (max > 0) for (let i = 0; i < frames; i++) flux[i] /= max;

  // Adaptive threshold: mean + k * std over a sliding window (±~0.7 s)
  const win = Math.round((0.7 * sr) / HOP);
  const thr = new Float32Array(frames);
  const k = 0.6 + sensitivity * 1.6; // 0.6 .. 2.2
  for (let i = 0; i < frames; i++) {
    const a = Math.max(0, i - win);
    const b = Math.min(frames - 1, i + win);
    let m = 0;
    for (let j = a; j <= b; j++) m += flux[j];
    m /= b - a + 1;
    let v = 0;
    for (let j = a; j <= b; j++) v += (flux[j] - m) * (flux[j] - m);
    v = Math.sqrt(v / (b - a + 1));
    thr[i] = m + k * v + 0.02;
  }

  // Peak picking
  const gapFrames = Math.round((minGap * sr) / HOP);
  const beats: number[] = [];
  const strengths: number[] = [];
  let lastPeak = -Infinity;
  for (let i = 1; i < frames - 1; i++) {
    if (flux[i] > thr[i] && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1] && i - lastPeak >= gapFrames) {
      beats.push(((i * HOP + FRAME / 2) / sr));
      strengths.push(flux[i]);
      lastPeak = i;
    }
  }

  // Tempo via autocorrelation of the onset envelope
  let bpm = 0;
  if (frames > 0) {
    const minLag = Math.round((60 / 200) * (sr / HOP));
    const maxLag = Math.round((60 / 60) * (sr / HOP));
    let best = 0;
    let bestLag = 0;
    for (let lag = minLag; lag <= maxLag && lag < frames; lag++) {
      let acc = 0;
      for (let i = 0; i + lag < frames; i++) acc += flux[i] * flux[i + lag];
      // slight bias toward faster tempi to resolve half/double ambiguities like most trackers
      acc *= 1 + 0.15 * (1 - (lag - minLag) / (maxLag - minLag));
      if (acc > best) {
        best = acc;
        bestLag = lag;
      }
    }
    if (bestLag > 0) bpm = Math.round((60 * sr) / (bestLag * HOP));
  }
  opts.onProgress?.(1);
  return { beats, bpm, strengths, duration: buffer.duration };
}

/**
 * Downsample a beat list to roughly one cut every `every` beats, keeping the
 * strongest beat in each group — useful for "cut every 2 / 4 beats".
 */
export function thinBeats(a: BeatAnalysis, every: number): number[] {
  if (every <= 1) return a.beats;
  const out: number[] = [];
  for (let i = 0; i < a.beats.length; i += every) {
    let bi = i;
    for (let j = i; j < Math.min(a.beats.length, i + every); j++) if (a.strengths[j] > a.strengths[bi]) bi = j;
    out.push(a.beats[bi]);
  }
  return out;
}

// ── Loudness / ducking analysis ─────────────────────────────────────────────

export interface LoudnessInfo {
  /** Sample peak, linear 0..1 */
  peak: number;
  /** Overall RMS, linear */
  rms: number;
  peakDb: number;
  rmsDb: number;
}

export function measureLoudness(buffer: AudioBuffer, startSec = 0, endSec = buffer.duration): LoudnessInfo {
  const sr = buffer.sampleRate;
  const s0 = Math.max(0, Math.floor(startSec * sr));
  const s1 = Math.min(buffer.length, Math.ceil(endSec * sr));
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = s0; i < s1; i++) {
      const v = d[i];
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      sum += v * v;
      n++;
    }
  }
  const rms = n ? Math.sqrt(sum / n) : 0;
  const db = (x: number) => (x <= 0 ? -Infinity : 20 * Math.log10(x));
  return { peak, rms, peakDb: db(peak), rmsDb: db(rms) };
}

/**
 * Short-time RMS envelope (mono) in dBFS at `hop` seconds. Used to find where
 * a voice-over is speaking so music can be ducked underneath it.
 */
export function rmsEnvelope(buffer: AudioBuffer, hop = 0.05): { times: number[]; db: number[] } {
  const sr = buffer.sampleRate;
  const hopN = Math.max(1, Math.floor(hop * sr));
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const times: number[] = [];
  const db: number[] = [];
  for (let s = 0; s + hopN <= buffer.length; s += hopN) {
    let sum = 0;
    for (const d of chans) for (let i = s; i < s + hopN; i++) sum += d[i] * d[i];
    const r = Math.sqrt(sum / (hopN * chans.length));
    times.push(s / sr);
    db.push(r <= 0 ? -100 : 20 * Math.log10(r));
  }
  return { times, db };
}

/**
 * Turn an envelope into speech regions: contiguous spans above `thresholdDb`,
 * with gaps shorter than `holdSec` bridged and spans shorter than `minSec` dropped.
 */
export function speechRegions(env: { times: number[]; db: number[] }, thresholdDb = -35, holdSec = 0.4, minSec = 0.15): [number, number][] {
  const out: [number, number][] = [];
  let start: number | null = null;
  let lastLoud = -Infinity;
  for (let i = 0; i < env.times.length; i++) {
    const t = env.times[i];
    if (env.db[i] >= thresholdDb) {
      if (start === null) start = t;
      lastLoud = t;
    } else if (start !== null && t - lastLoud > holdSec) {
      if (lastLoud - start >= minSec) out.push([start, lastLoud]);
      start = null;
    }
  }
  if (start !== null && lastLoud - start >= minSec) out.push([start, lastLoud]);
  return out;
}
