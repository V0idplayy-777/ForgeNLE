import { useMemo, useRef } from "react";
import { useEditorStore } from "../../store/useEditorStore";
import { formatTimecode } from "../../lib/utils";
import { Marker } from "../../types";

interface Props {
  pxPerSec: number;
  width: number;
  fps: number;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}

export default function Ruler({ pxPerSec, width, fps, onScrubStart, onScrubEnd }: Props) {
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const markers = useEditorStore((s) => s.markers);
  const inPoint = useEditorStore((s) => s.inPoint);
  const outPoint = useEditorStore((s) => s.outPoint);
  const setInPoint = useEditorStore((s) => s.setInPoint);
  const setOutPoint = useEditorStore((s) => s.setOutPoint);
  const updateMarker = useEditorStore((s) => s.updateMarker);
  const removeMarker = useEditorStore((s) => s.removeMarker);
  const commitHistory = useEditorStore((s) => s.commitHistory);
  const ref = useRef<HTMLDivElement>(null);

  const { major, minor, showFrames } = useMemo(() => {
    const target = 90;
    const secondsPerTarget = target / pxPerSec;
    const frame = 1 / fps;
    const options = [frame, frame * 2, frame * 5, frame * 10, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];
    const major = options.find((o) => o >= secondsPerTarget) || 1800;
    let minor = major / 5;
    if (major === 1) minor = 0.5;
    if (major === 0.5) minor = 0.1;
    if (major < 0.5) minor = frame;
    return { major, minor, showFrames: major < 1 };
  }, [pxPerSec, fps]);

  const ticks = useMemo(() => {
    const out: { t: number; major: boolean }[] = [];
    const total = width / pxPerSec;
    const count = Math.ceil(total / minor) + 1;
    if (count > 4000) return out;
    for (let i = 0; i < count; i++) {
      const t = i * minor;
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      out.push({ t, major: isMajor });
    }
    return out;
  }, [width, pxPerSec, minor, major]);

  function timeFromEvent(e: PointerEvent | React.PointerEvent) {
    const rect = ref.current!.getBoundingClientRect();
    return Math.max(0, (e.clientX - rect.left) / pxPerSec);
  }

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("[data-marker]")) return;
    e.preventDefault();
    setIsPlaying(false);
    onScrubStart();
    const snap = (t: number) => (e.altKey ? t : Math.round(t * fps) / fps);
    setCurrentTime(snap(timeFromEvent(e)));
    const move = (ev: PointerEvent) => setCurrentTime(snap(timeFromEvent(ev)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onScrubEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function dragRange(kind: "in" | "out", e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const t = Math.round(timeFromEvent(ev) * fps) / fps;
      kind === "in" ? setInPoint(t) : setOutPoint(t);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function dragMarker(m: Marker, e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (e.button === 2) return;
    const move = (ev: PointerEvent) => updateMarker(m.id, { time: Math.round(timeFromEvent(ev) * fps) / fps });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      commitHistory();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div ref={ref} className="relative h-8 shrink-0 cursor-col-resize select-none overflow-hidden bg-[#111114]" style={{ width }} onPointerDown={onPointerDown}>
      {/* in/out range */}
      {inPoint !== null && outPoint !== null && outPoint > inPoint && (
        <div className="absolute bottom-0 top-0 bg-indigo-500/15" style={{ left: inPoint * pxPerSec, width: (outPoint - inPoint) * pxPerSec }} />
      )}
      {ticks.map(({ t, major: isMajor }) => (
        <div key={t} className="absolute bottom-0" style={{ left: t * pxPerSec }}>
          <div className={isMajor ? "h-3 w-px bg-neutral-500" : "h-1.5 w-px bg-neutral-700"} />
          {isMajor && (
            <span className="absolute bottom-3.5 left-1 whitespace-nowrap font-mono text-[9px] tabular-nums text-neutral-500">
              {showFrames ? formatTimecode(t, fps).slice(3) : formatTimecode(t, fps).slice(3, 8)}
            </span>
          )}
        </div>
      ))}
      {/* markers */}
      {markers.map((m) => (
        <div
          key={m.id}
          data-marker
          className="group absolute top-0 z-10 -translate-x-1/2 cursor-ew-resize"
          style={{ left: m.time * pxPerSec }}
          onPointerDown={(e) => dragMarker(m, e)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            const label = prompt("Marker label", m.label);
            if (label !== null) updateMarker(m.id, { label });
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            removeMarker(m.id);
          }}
          title={`${m.label} · double-click to rename · right-click to delete`}
        >
          <div className="h-3 w-3 rotate-45 rounded-[2px] border border-black/40" style={{ background: m.color, marginTop: 2 }} />
          <div className="pointer-events-none absolute left-3 top-0 hidden whitespace-nowrap rounded bg-black/80 px-1 text-[9px] text-white group-hover:block">{m.label}</div>
        </div>
      ))}
      {/* in / out handles */}
      {inPoint !== null && (
        <div data-marker className="absolute top-0 z-10 h-full w-2 cursor-ew-resize" style={{ left: inPoint * pxPerSec }} onPointerDown={(e) => dragRange("in", e)} title="In point">
          <div className="h-full w-0.5 bg-indigo-400" />
          <div className="absolute left-0 top-0 h-2 w-2 bg-indigo-400" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
        </div>
      )}
      {outPoint !== null && (
        <div data-marker className="absolute top-0 z-10 h-full w-2 -translate-x-full cursor-ew-resize" style={{ left: outPoint * pxPerSec }} onPointerDown={(e) => dragRange("out", e)} title="Out point">
          <div className="ml-auto h-full w-0.5 bg-indigo-400" />
          <div className="absolute right-0 top-0 h-2 w-2 bg-indigo-400" style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%)" }} />
        </div>
      )}
    </div>
  );
}
