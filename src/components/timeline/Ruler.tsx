import { useMemo } from "react";
import { formatTimecode } from "../../lib/utils";

interface Props {
  pxPerSec: number;
  duration: number;
  onSeek: (t: number) => void;
}

export default function Ruler({ pxPerSec, duration, onSeek }: Props) {
  const width = Math.max(duration * pxPerSec + 400, 1000);

  const step = useMemo(() => {
    // choose a "nice" tick interval in seconds based on zoom
    const target = 80; // px between major ticks
    const secondsPerTarget = target / pxPerSec;
    const options = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    return options.find((o) => o >= secondsPerTarget) || 600;
  }, [pxPerSec]);

  const ticks = [];
  for (let t = 0; t <= duration + step * 6; t += step) {
    ticks.push(t);
  }

  function seekFromClientX(clientX: number, rect: DOMRect) {
    const t = (clientX - rect.left) / pxPerSec;
    onSeek(Math.max(0, t));
  }

  function handleDown(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    seekFromClientX(e.clientX, rect);
    const onMove = (ev: MouseEvent) => seekFromClientX(ev.clientX, rect);
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className="relative h-7 cursor-pointer select-none border-b border-neutral-800 bg-neutral-900"
      style={{ width }}
      onMouseDown={handleDown}
    >
      {ticks.map((t) => (
        <div
          key={t}
          className="absolute top-0 h-full border-l border-neutral-700 text-[10px] text-neutral-500"
          style={{ left: t * pxPerSec }}
        >
          <span className="ml-1">{formatTimecode(t).replace(/:\d\d$/, "")}</span>
        </div>
      ))}
    </div>
  );
}
