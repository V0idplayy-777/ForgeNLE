import { useEffect, useRef } from "react";
import { Clip, MediaAsset, Track } from "../../types";
import { useEditorStore } from "../../store/useEditorStore";
import { clamp, cssFilterString, fadeOpacity } from "../../lib/utils";

interface Props {
  clip: Clip;
  track: Track;
  asset?: MediaAsset;
  zIndex: number;
}

export default function ClipMediaLayer({ clip, track, asset, zIndex }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const currentTime = useEditorStore((s) => s.currentTime);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);

  const active = currentTime >= clip.start && currentTime < clip.start + clip.duration;
  const localTime = clip.trimIn + (currentTime - clip.start) * clip.effects.speed;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !asset || asset.type !== "video") return;
    if (!active) {
      if (!el.paused) el.pause();
      return;
    }
    el.playbackRate = clamp(clip.effects.speed, 0.1, 16);
    el.volume = track.muted ? 0 : clamp(clip.effects.volume / 100, 0, 1);
    const drift = Math.abs(el.currentTime - localTime);
    if (isPlaying) {
      if (drift > 0.25 || el.paused) {
        try {
          el.currentTime = localTime;
        } catch {}
        el.play().catch(() => {});
      }
    } else {
      if (drift > 0.03) {
        try {
          el.currentTime = localTime;
        } catch {}
      }
      if (!el.paused) el.pause();
    }
  }, [active, isPlaying, currentTime, clip.effects.speed, clip.effects.volume, track.muted, localTime, asset]);

  if (!asset) return null;

  const opacity = fadeOpacity(clip, currentTime);
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: active ? "block" : "none",
    filter: cssFilterString(clip.effects),
    opacity,
    zIndex,
    outline: selectedClipId === clip.id ? "2px solid #6366f1" : "none",
  };

  if (asset.type === "video") {
    return (
      <video
        ref={videoRef}
        src={asset.url}
        muted={track.muted}
        playsInline
        preload="auto"
        style={baseStyle}
      />
    );
  }
  if (asset.type === "image") {
    return <img src={asset.url} style={baseStyle} draggable={false} />;
  }
  return null;
}
