import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/useEditorStore";
import { getProjectDuration } from "../lib/utils";

export function usePlaybackClock() {
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const shuttleRate = useEditorStore((s) => s.shuttleRate);
  const rafRef = useRef<number | undefined>(undefined);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying && shuttleRate === 0) return;
    lastRef.current = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      const state = useEditorStore.getState();
      const duration = getProjectDuration(state.tracks);
      const rate = state.shuttleRate !== 0 ? state.shuttleRate : 1;
      let next = state.currentTime + dt * rate;
      if (next >= duration) {
        next = duration;
        state.setCurrentTime(next);
        state.setIsPlaying(false);
        state.setShuttleRate(0);
        return;
      }
      if (next <= 0) {
        next = 0;
        state.setCurrentTime(next);
        state.setIsPlaying(false);
        state.setShuttleRate(0);
        return;
      }
      state.setCurrentTime(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, shuttleRate]);
}
