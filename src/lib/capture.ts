// ─────────────────────────────────────────────────────────────────────────────
// Forge NLE — screen & camera capture.
//
// Gaming editors capture their own footage. This records the display (system
// tab/window) or the webcam via MediaRecorder and hands back a File that flows
// through the normal import pipeline — nothing leaves the device.
// ─────────────────────────────────────────────────────────────────────────────

export interface CaptureSession {
  kind: "screen" | "camera";
  stream: MediaStream;
  stop: () => Promise<File>;
}

export class CaptureError extends Error {}

function pickVideoMime(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

function finish(stream: MediaStream, rec: MediaRecorder, chunks: Blob[]): Promise<File> {
  return new Promise((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const mime = rec.mimeType || "video/webm";
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const file = new File(chunks, `Capture ${stamp}.${ext}`, { type: mime });
      resolve(file);
    };
    rec.stop();
  });
}

/** Records the display (or a tab/window). Audio is included when available. */
export async function startScreenCapture(): Promise<CaptureSession> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new CaptureError("Screen capture isn't supported in this browser (or the preview frame blocks it — open Forge in its own tab).");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 60 },
      audio: { echoCancellation: false, noiseSuppression: false } as MediaTrackConstraints,
    });
  } catch {
    throw new CaptureError("Screen capture was cancelled or blocked by the browser.");
  }
  return beginSession("screen", stream);
}

/** Records the webcam + microphone. */
export async function startCameraCapture(): Promise<CaptureSession> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CaptureError("Camera capture isn't supported in this browser.");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch {
    throw new CaptureError("Camera/mic access was denied or unavailable.");
  }
  return beginSession("camera", stream);
}

function beginSession(kind: "screen" | "camera", stream: MediaStream): CaptureSession {
  const mime = pickVideoMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12_000_000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  // Timeslice keeps chunks flowing so long sessions don't buffer in RAM.
  rec.start(1000);
  // If the user hits the browser's "stop sharing" bar, end cleanly.
  stream.getVideoTracks()[0]?.addEventListener("ended", () => {
    if (rec.state !== "inactive") rec.stop();
  });

  return {
    kind,
    stream,
    stop: () => finish(stream, rec, chunks),
  };
}
