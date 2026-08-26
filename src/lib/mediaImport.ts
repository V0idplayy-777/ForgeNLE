import { MediaAsset, MediaType } from "../types";
import { uid } from "./utils";

function detectType(file: File): MediaType | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

export async function importFiles(files: FileList | File[]): Promise<MediaAsset[]> {
  const list = Array.from(files);
  const results: MediaAsset[] = [];
  for (const file of list) {
    const type = detectType(file);
    if (!type) continue;
    const url = URL.createObjectURL(file);
    try {
      if (type === "video") {
        const { duration, width, height, thumbnail } = await probeVideo(url);
        results.push({ id: uid("media"), name: file.name, type, url, duration, width, height, thumbnail });
      } else if (type === "audio") {
        const duration = await probeAudio(url);
        results.push({ id: uid("media"), name: file.name, type, url, duration });
      } else if (type === "image") {
        const { width, height } = await probeImage(url);
        results.push({ id: uid("media"), name: file.name, type, url, duration: 5, width, height, thumbnail: url });
      }
    } catch (e) {
      console.error("Failed to import", file.name, e);
    }
  }
  return results;
}

function probeVideo(url: string): Promise<{ duration: number; width: number; height: number; thumbnail: string }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = url;
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const seekTo = Math.min(1, Math.max(0.1, video.duration * 0.1));
      video.currentTime = seekTo;
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = Math.round((video.videoHeight / video.videoWidth) * 160) || 90;
        const ctx = canvas.getContext("2d");
        let thumbnail = "";
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnail = canvas.toDataURL("image/jpeg", 0.7);
        }
        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
          thumbnail,
        });
      } catch (e) {
        resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight, thumbnail: "" });
      }
    };
    video.onerror = () => reject(new Error("Failed to load video"));
  });
}

function probeAudio(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    audio.src = url;
    audio.preload = "metadata";
    audio.onloadedmetadata = () => resolve(audio.duration);
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
