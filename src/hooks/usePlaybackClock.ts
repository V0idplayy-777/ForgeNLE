import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/useEditorStore";
import { getProjectDuration } from "../lib/utils";

/**
 * Drives `currentTime` while playing. Uses the AudioContext clock when
 * available for drift-free timing, falling back to performance.now().
 */
export function usePlaybackClock(getAudioTime?: () => number | null) {
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const shuttleRate = useEditorStore((s) => s.shuttleRate);
  const rafRef = useRef<number | undefined>(undefined);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    const active = isPlaying || shuttleRate !== 0;
    if (!active) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
      return;
    }
    const clockNow = () => {
      const a = getAudioTime?.();
      return a !== null && a !== undefined ? a * 1000 : performance.now();
    };
    lastRef.current = clockNow();

    const tick = () => {
      const now = clockNow();
      const dt = Math.min(0.25, Math.max(0, (now - lastRef.current) / 1000));
      lastRef.current = now;
      const state = useEditorStore.getState();
      const duration = getProjectDuration(state.tracks);
      if (duration <= 0) {
        state.setIsPlaying(false);
        return;
      }
      const rate = state.shuttleRate !== 0 ? state.shuttleRate : 1;
      const end = state.outPoint !== null && state.outPoint > (state.inPoint ?? 0) ? Math.min(state.outPoint, duration) : duration;
      const begin = state.inPoint !== null && state.inPoint < end ? state.inPoint : 0;
      let next = state.currentTime + dt * rate;
      if (next >= end) {
        if (state.loopPlayback && rate > 0) {
          next = begin + (next - end);
        } else {
          state.setCurrentTime(end);
          state.setIsPlaying(false);
          return;
        }
      }
      if (next <= 0 && rate < 0) {
        state.setCurrentTime(0);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, shuttleRate]);
}
