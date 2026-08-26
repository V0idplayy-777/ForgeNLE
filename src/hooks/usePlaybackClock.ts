import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/useEditorStore";
import { getProjectDuration } from "../lib/utils";

export function usePlaybackClock() {
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const rafRef = useRef<number | undefined>(undefined);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying) return;
    lastRef.current = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      const state = useEditorStore.getState();
      const duration = getProjectDuration(state.tracks);
      let next = state.currentTime + dt;
      if (next >= duration) {
        next = duration;
        state.setCurrentTime(next);
        state.setIsPlaying(false);
        return;
      }
      state.setCurrentTime(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);
}
