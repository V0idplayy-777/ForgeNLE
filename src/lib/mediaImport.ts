import { MediaAsset, MediaType } from "../types";
import { uid } from "./utils";
import { saveMediaBlob } from "./storage";

function detectType(file: File): MediaType | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (["mp4", "mov", "webm", "mkv", "m4v", "avi"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"].includes(ext)) return "audio";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"].includes(ext)) return "image";
  return null;
}

export interface ImportProgress {
  index: number;
  total: number;
  name: string;
}

export async function importFiles(files: FileList | File[], onProgress?: (p: ImportProgress) => void): Promise<MediaAsset[]> {
  const list = Array.from(files);
  const results: MediaAsset[] = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    const type = detectType(file);
    if (!type) continue;
    onProgress?.({ index: i, total: list.length, name: file.name });
    const url = URL.createObjectURL(file);
    const id = uid("media");
    try {
      if (type === "video") {
        const { duration, width, height, thumbnail, hasAudio } = await probeVideo(url);
        results.push({ id, name: file.name, type, url, duration, width, height, thumbnail, hasAudio, size: file.size });
      } else if (type === "audio") {
        const duration = await probeAudio(url);
        results.push({ id, name: file.name, type, url, duration, hasAudio: true, size: file.size });
      } else if (type === "image") {
        const { width, height } = await probeImage(url);
        results.push({ id, name: file.name, type, url, duration: 5, width, height, thumbnail: url, size: file.size });
      }
      // Persist for session restore (fire and forget)
      void saveMediaBlob(id, file);
    } catch (e) {
      console.error("Failed to import", file.name, e);
      URL.revokeObjectURL(url);
    }
  }
  return results;
}

/** Re-probe an asset restored from storage. */
export async function probeRestored(asset: Omit<MediaAsset, "url">, blob: Blob): Promise<MediaAsset> {
  const url = URL.createObjectURL(blob);
  if (asset.type === "image") return { ...asset, url, thumbnail: url, missing: false };
  if (asset.type === "video") {
    try {
      const probed = await probeVideo(url);
      return { ...asset, url, ...probed, missing: false };
    } catch {
      return { ...asset, url, missing: false };
    }
  }
  return { ...asset, url, missing: false };
}

function probeVideo(url: string): Promise<{ duration: number; width: number; height: number; thumbnail: string; hasAudio: boolean }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    let settled = false;
    const finish = (thumbnail: string) => {
      if (settled) return;
      settled = true;
      const v = video as HTMLVideoElement & { mozHasAudio?: boolean; webkitAudioDecodedByteCount?: number; audioTracks?: { length: number } };
      const hasAudio =
        v.mozHasAudio === true ||
        (typeof v.webkitAudioDecodedByteCount === "number" && v.webkitAudioDecodedByteCount > 0) ||
        (v.audioTracks ? v.audioTracks.length > 0 : true);
      resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight, thumbnail, hasAudio });
      video.removeAttribute("src");
      video.load();
    };
    let resolvingDuration = false;
    const seekForThumb = () => {
      const seekTo = Math.min(1, Math.max(0.05, video.duration * 0.1));
      try {
        video.currentTime = seekTo;
      } catch {
        finish("");
      }
    };
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration)) {
        // WebM files produced by MediaRecorder (screen/cam recordings) report Infinity
        // until the element has been seeked past the end. Do that first, then probe.
        resolvingDuration = true;
        video.currentTime = 1e101;
        return;
      }
      seekForThumb();
    };
    video.onseeked = () => {
      if (resolvingDuration) {
        resolvingDuration = false;
        seekForThumb();
        return;
      }
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 240;
        canvas.height = Math.round((video.videoHeight / video.videoWidth) * 240) || 135;
        const ctx = canvas.getContext("2d");
        let thumbnail = "";
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnail = canvas.toDataURL("image/jpeg", 0.72);
        }
        finish(thumbnail);
      } catch {
        finish("");
      }
    };
    video.onerror = () => {
      if (!settled) reject(new Error("Failed to load video"));
    };
    setTimeout(() => {
      if (!settled && video.duration) finish("");
    }, 8000);
  });
}

function probeAudio(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    audio.src = url;
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) {
        resolve(audio.duration);
        return;
      }
      // MediaRecorder output: force the duration to be computed by seeking to the end.
      audio.onseeked = () => resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
      audio.currentTime = 1e101;
    };
    audio.onerror = () => reject(new Error("Failed to load audio"));
  });
}

function probeImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

/** Generates N evenly spaced thumbnails for a video, used as a timeline filmstrip. */
export async function generateFilmstrip(url: string, duration: number, count = 24, height = 56): Promise<string[]> {
  const frames: string[] = [];
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("load"));
    setTimeout(() => reject(new Error("timeout")), 8000);
  }).catch(() => undefined);
  if (!video.videoWidth) return frames;
  const canvas = document.createElement("canvas");
  const w = Math.max(16, Math.round((video.videoWidth / video.videoHeight) * height));
  canvas.width = w;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return frames;
  const n = Math.max(1, Math.min(count, Math.ceil(duration * 2)));
  for (let i = 0; i < n; i++) {
    const t = Math.min(duration - 0.05, (i + 0.5) * (duration / n));
    const ok = await new Promise<boolean>((resolve) => {
      const done = () => {
        video.removeEventListener("seeked", done);
        resolve(true);
      };
      video.addEventListener("seeked", done);
      try {
        video.currentTime = Math.max(0, t);
      } catch {
        resolve(false);
      }
      setTimeout(() => resolve(false), 1500);
    });
    if (!ok) break;
    try {
      ctx.drawImage(video, 0, 0, w, height);
      frames.push(canvas.toDataURL("image/jpeg", 0.6));
    } catch {
      break;
    }
  }
  video.removeAttribute("src");
  video.load();
  return frames;
}
