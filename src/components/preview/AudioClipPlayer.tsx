import { useEffect, useRef } from "react";
import { Clip, MediaAsset, Track } from "../../types";
import { useEditorStore } from "../../store/useEditorStore";
import { clamp } from "../../lib/utils";

interface Props {
  clip: Clip;
  track: Track;
  asset?: MediaAsset;
}

export default function AudioClipPlayer({ clip, track, asset }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTime = useEditorStore((s) => s.currentTime);
  const isPlaying = useEditorStore((s) => s.isPlaying);

  const active = currentTime >= clip.start && currentTime < clip.start + clip.duration;
  const localTime = clip.trimIn + (currentTime - clip.start) * clip.effects.speed;

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !asset) return;
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
  return <audio ref={audioRef} src={asset.url} preload="auto" />;
}
