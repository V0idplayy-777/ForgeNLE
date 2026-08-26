import { Track } from "../../types";
import { useEditorStore } from "../../store/useEditorStore";
import ClipBlock from "./ClipBlock";
import { uid } from "../../lib/utils";
import { defaultEffects } from "../../types";

interface Props {
  track: Track;
  width: number;
  pxPerSec: number;
}

export default function TrackLane({ track, width, pxPerSec }: Props) {
  const mediaAssets = useEditorStore((s) => s.mediaAssets);
  const addClip = useEditorStore((s) => s.addClip);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const selectClip = useEditorStore((s) => s.selectClip);

  function onBackgroundDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-clip-id]")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const t = (e.clientX - rect.left) / pxPerSec;
    setCurrentTime(Math.max(0, t));
    selectClip(null);
  }

  function onDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes("application/x-media-id")) {
      e.preventDefault();
    }
  }

  function onDrop(e: React.DragEvent) {
    const mediaId = e.dataTransfer.getData("application/x-media-id");
    const asset = mediaAssets.find((m) => m.id === mediaId);
    if (!asset || track.locked) return;
    const compatible =
      (track.type === "video" && (asset.type === "video" || asset.type === "image")) ||
      (track.type === "audio" && asset.type === "audio");
    if (!compatible) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const start = Math.max(0, (e.clientX - rect.left) / pxPerSec);
    addClip(track.id, {
      id: uid("clip"),
      trackId: track.id,
      mediaId: asset.id,
      name: asset.name,
      color: track.type === "audio" ? "#10b981" : "#6366f1",
      start,
      duration: asset.duration,
      trimIn: 0,
      effects: defaultEffects(),
    });
  }

  return (
    <div
      data-track-id={track.id}
      className={`relative h-16 border-b border-neutral-800 ${track.locked ? "bg-neutral-900/60" : "bg-neutral-900/30"}`}
      style={{ width }}
      onMouseDown={onBackgroundDown}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {track.clips.map((clip) => (
        <ClipBlock key={clip.id} clip={clip} track={track} pxPerSec={pxPerSec} />
      ))}
    </div>
  );
}
