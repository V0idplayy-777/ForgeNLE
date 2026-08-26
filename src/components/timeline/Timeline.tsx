import { useRef } from "react";
import { useEditorStore } from "../../store/useEditorStore";
import Ruler from "./Ruler";
import TrackHeader from "./TrackHeader";
import TrackLane from "./TrackLane";
import { getProjectDuration } from "../../lib/utils";
import { ZoomIn, ZoomOut, Magnet, Plus, Scissors, Trash2, Copy } from "lucide-react";

export default function Timeline() {
  const tracks = useEditorStore((s) => s.tracks);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const currentTime = useEditorStore((s) => s.currentTime);
  const snapping = useEditorStore((s) => s.snapping);
  const toggleSnapping = useEditorStore((s) => s.toggleSnapping);
  const addTrack = useEditorStore((s) => s.addTrack);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const splitClipAtTime = useEditorStore((s) => s.splitClipAtTime);
  const removeClip = useEditorStore((s) => s.removeClip);
  const duplicateClip = useEditorStore((s) => s.duplicateClip);

  const scrollRef = useRef<HTMLDivElement>(null);
  const duration = getProjectDuration(tracks);
  const contentWidth = Math.max(duration * zoom + 400, 1000);
  const HEADER_W = 160;

  return (
    <div className="flex h-[300px] shrink-0 flex-col border-t border-neutral-800 bg-neutral-950">
      <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3 py-1.5">
        <button className="toolbar-btn" onClick={() => addTrack("video")}>
          <Plus size={12} /> Video
        </button>
        <button className="toolbar-btn" onClick={() => addTrack("audio")}>
          <Plus size={12} /> Audio
        </button>
        <button className="toolbar-btn" onClick={() => addTrack("text")}>
          <Plus size={12} /> Text
        </button>
        <div className="mx-2 h-4 w-px bg-neutral-700" />
        <button
          className="toolbar-btn"
          disabled={!selectedClipId}
          onClick={() => selectedClipId && splitClipAtTime(selectedClipId, currentTime)}
          title="Split clip at playhead (S)"
        >
          <Scissors size={12} /> Split
        </button>
        <button
          className="toolbar-btn"
          disabled={!selectedClipId}
          onClick={() => selectedClipId && duplicateClip(selectedClipId)}
        >
          <Copy size={12} /> Duplicate
        </button>
        <button
          className="toolbar-btn"
          disabled={!selectedClipId}
          onClick={() => selectedClipId && removeClip(selectedClipId)}
        >
          <Trash2 size={12} /> Delete
        </button>
        <div className="mx-2 h-4 w-px bg-neutral-700" />
        <button
          className={`toolbar-btn ${snapping ? "!bg-indigo-600 !text-white" : ""}`}
          onClick={toggleSnapping}
          title="Toggle snapping"
        >
          <Magnet size={12} /> Snap
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button className="control-btn" onClick={() => setZoom(zoom / 1.3)}>
            <ZoomOut size={14} />
          </button>
          <input
            type="range"
            min={10}
            max={400}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-24 accent-indigo-500"
          />
          <button className="control-btn" onClick={() => setZoom(zoom * 1.3)}>
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-auto" ref={scrollRef}>
        <div style={{ width: HEADER_W + contentWidth, position: "relative" }}>
          <div className="sticky top-0 z-30 flex">
            <div className="sticky left-0 z-40 flex h-7 w-40 shrink-0 items-center justify-center border-b border-r border-neutral-800 bg-neutral-900 text-[10px] text-neutral-600">
              {duration > 0 ? `${Math.round(duration)}s total` : "timeline"}
            </div>
            <Ruler pxPerSec={zoom} duration={duration} onSeek={setCurrentTime} />
          </div>

          {tracks.map((track) => (
            <div className="flex" key={track.id}>
              <TrackHeader track={track} />
              <TrackLane track={track} width={contentWidth} pxPerSec={zoom} />
            </div>
          ))}

          <div
            className="pointer-events-none absolute bottom-0 top-7 z-40 w-px bg-red-500"
            style={{ left: HEADER_W + currentTime * zoom }}
          >
            <div className="absolute -top-0 -left-1.5 h-2.5 w-2.5 rotate-45 bg-red-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
