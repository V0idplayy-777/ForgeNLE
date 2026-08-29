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
    if (isPlaying) {
      try {
        el.currentTime = localTime;
      } catch {}
      el.play().catch(() => {});
    } else {
      try {
        el.currentTime = localTime;
      } catch {}
      if (!el.paused) el.pause();
    }
  }, [active, isPlaying, clip.effects.speed, clip.effects.volume, track.muted, asset]);

  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((state, previousState) => {
      if (state.isPlaying || state.currentTime === previousState.currentTime) return;
      const el = audioRef.current;
      if (!el || !asset) return;
      const activeNow = state.currentTime >= clip.start && state.currentTime < clip.start + clip.duration;
      if (!activeNow) {
        if (!el.paused) el.pause();
        return;
      }
      const nextLocalTime = clip.trimIn + (state.currentTime - clip.start) * clip.effects.speed;
      if (Math.abs(el.currentTime - nextLocalTime) > 0.03) {
        try {
          el.currentTime = nextLocalTime;
        } catch {}
      }
    });
    return unsubscribe;
  }, [asset, clip.start, clip.duration, clip.trimIn, clip.effects.speed]);

  if (!asset) return null;
  return <audio ref={audioRef} src={asset.url} preload="auto" />;
}
