import { useState } from "react";
import { Track } from "../../types";
import { useEditorStore } from "../../store/useEditorStore";
import ClipBlock from "./ClipBlock";
import { useTimeline } from "./timelineContext";
import { cn } from "../../utils/cn";

interface Props {
  track: Track;
  width: number;
  height: number;
}

export default function TrackLane({ track, width, height }: Props) {
  const { pxPerSec, fps } = useTimeline();
  const mediaAssets = useEditorStore((s) => s.mediaAssets);
  const addMediaToTimeline = useEditorStore((s) => s.addMediaToTimeline);
  const tool = useEditorStore((s) => s.tool);
  const closeGapAt = useEditorStore((s) => s.closeGapAt);
  const [dropX, setDropX] = useState<number | null>(null);

  function onDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("application/x-media-id") || track.locked) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const rect = e.currentTarget.getBoundingClientRect();
    setDropX(Math.max(0, e.clientX - rect.left));
  }

  function onDrop(e: React.DragEvent) {
    setDropX(null);
    const mediaId = e.dataTransfer.getData("application/x-media-id");
    const asset = mediaAssets.find((m) => m.id === mediaId);
    if (!asset || track.locked) return;
    const compatible = (track.type === "video" && asset.type !== "audio") || (track.type === "audio" && asset.type !== "image");
    if (!compatible) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = Math.max(0, (e.clientX - rect.left) / pxPerSec);
    const s = useEditorStore.getState();
    // snap drop to nearby clip edges
    let start = Math.round(raw * fps) / fps;
    if (s.snapping) {
      const thr = 8 / pxPerSec;
      const pts = [0, s.currentTime, ...track.clips.flatMap((c) => [c.start, c.start + c.duration])];
      for (const p of pts) if (Math.abs(p - raw) < thr) start = p;
    }
    addMediaToTimeline(asset.id, { trackId: track.id, start });
  }

  return (
    <div
      data-track-id={track.id}
      className={cn(
        "relative border-b border-white/5",
        track.locked ? "bg-[repeating-linear-gradient(135deg,transparent_0_8px,rgba(255,255,255,0.025)_8px_16px)]" : "",
        tool === "razor" && "cursor-[crosshair]"
      )}
      style={{ width, height }}
      onDragOver={onDragOver}
      onDragLeave={() => setDropX(null)}
      onDrop={onDrop}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-clip-id]")) return;
        const rect = e.currentTarget.getBoundingClientRect();
        closeGapAt(track.id, (e.clientX - rect.left) / pxPerSec);
      }}
    >
      {track.clips.map((clip) => (
        <ClipBlock key={clip.id} clip={clip} track={track} height={height} />
      ))}
      {dropX !== null && <div className="pointer-events-none absolute bottom-0 top-0 z-30 w-0.5 bg-indigo-400 shadow-[0_0_8px_#818cf8]" style={{ left: dropX }} />}
    </div>
  );
}
