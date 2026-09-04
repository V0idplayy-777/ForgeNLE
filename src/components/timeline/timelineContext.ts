import { createContext, useContext } from "react";

export interface TimelineCtx {
  pxPerSec: number;
  fps: number;
  setSnapLine: (t: number | null) => void;
  /** Convert a clientX to timeline seconds (unclamped). */
  clientXToTime: (x: number) => number;
  headerWidth: number;
}

export const TimelineContext = createContext<TimelineCtx>({
  pxPerSec: 60,
  fps: 30,
  setSnapLine: () => {},
  clientXToTime: () => 0,
  headerWidth: 176,
});

export function useTimeline() {
  return useContext(TimelineContext);
}
