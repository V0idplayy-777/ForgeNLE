// ─────────────────────────────────────────────────────────────────────────────
// Microphone capture for voiceovers. Wraps getUserMedia + MediaRecorder with
// live level metering, and hands back a ready-to-import audio blob.
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordResult {
  blob: Blob;
  mimeType: string;
  /** Seconds from start() to stop() (wall clock). */
  seconds: number;
}

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""];

export function pickAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of MIME_CANDIDATES) {
    if (!m) return m;
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {}
  }
  return "";
}

export function extensionForMime(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";
  return "webm";
}

export async function listMicrophones(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  } catch {
    return [];
  }
}

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private meterBuf: Float32Array | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private stopped = false;

  get recording() {
    return !!this.recorder && this.recorder.state === "recording" && !this.stopped;
  }

  /** Must be called from a user gesture. */
  async start(deviceId?: string): Promise<void> {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Audio recording is not supported in this browser");
    }
    const audio: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (deviceId) {
      audio.deviceId = { exact: deviceId };
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio });
    this.stopped = false;
    this.chunks = [];

    // metering graph (never connected to output — monitoring would feed back)
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctx();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.meterBuf = new Float32Array(this.analyser.fftSize);
      src.connect(this.analyser);
    } catch {
      this.analyser = null;
    }

    const mimeType = pickAudioMime();
    this.recorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType, audioBitsPerSecond: 192_000 })
      : new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.startedAt = performance.now();
    this.recorder.start(250);
  }

  /** Peak level 0..1 of the most recent analyser window. */
  level(): number {
    if (!this.analyser || !this.meterBuf) return 0;
    this.analyser.getFloatTimeDomainData(this.meterBuf as any);
    let peak = 0;
    for (let i = 0; i < this.meterBuf.length; i++) {
      const v = Math.abs(this.meterBuf[i]);
      if (v > peak) peak = v;
    }
    return Math.min(1, peak);
  }

  elapsed(): number {
    return (performance.now() - this.startedAt) / 1000;
  }

  /** Stops capture and resolves once the blob is assembled. */
  async stop(): Promise<RecordResult | null> {
    const rec = this.recorder;
    if (!rec || this.stopped) {
      this.cleanup();
      return null;
    }
    this.stopped = true;
    const seconds = this.elapsed();
    const done = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });
    try {
      if (rec.state !== "inactive") rec.stop();
    } catch {}
    await done;
    const mimeType = rec.mimeType || pickAudioMime() || "audio/webm";
    const blob = new Blob(this.chunks, { type: mimeType });
    this.cleanup();
    if (!blob.size) return null;
    return { blob, mimeType, seconds };
  }

  /** Abort without saving. */
  cancel() {
    this.stopped = true;
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    } catch {}
    this.cleanup();
  }

  private cleanup() {
    this.recorder = null;
    this.analyser = null;
    this.meterBuf = null;
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
    } catch {}
    this.stream = null;
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
