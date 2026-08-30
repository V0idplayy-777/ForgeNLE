import { useRef, useState } from "react";
import { Clip, MediaAsset, Track } from "../../types";
import { useEditorStore } from "../../store/useEditorStore";
import { clamp, findSnapTargets, snapValue } from "../../lib/utils";
import { Scissors, Trash2, Copy, Music4, Type as TypeIcon, Film } from "lucide-react";

function Waveform({ asset, clip }: { asset: MediaAsset; clip: Clip }) {
  const wf = asset.waveform;
  if (!wf || !asset.duration) return null;
  const total = wf.length;
  const startFrac = clip.trimIn / asset.duration;
  const endFrac = (clip.trimIn + clip.duration * clip.effects.speed) / asset.duration;
  const startIdx = clamp(Math.floor(startFrac * total), 0, total - 1);
  const endIdx = clamp(Math.ceil(endFrac * total), startIdx + 1, total);
  const slice = wf.slice(startIdx, endIdx);
  const maxBars = 120;
  const step = Math.max(1, Math.floor(slice.length / maxBars));
  const bars: number[] = [];
  for (let i = 0; i < slice.length; i += step) bars.push(slice[i]);
  return (
    <div className="absolute inset-0 flex items-center gap-px overflow-hidden px-0.5 opacity-80">
      {bars.map((v, i) => (
        <div key={i} style={{ height: `${Math.max(8, v * 90)}%`, flex: 1 }} className="rounded-sm bg-white/80" />
      ))}
    </div>
  );
}

interface Props {
  clip: Clip;
  track: Track;
  pxPerSec: number;
}

const MIN_DURATION = 0.15;

export default function ClipBlock({ clip, track, pxPerSec }: Props) {
  const tracks = useEditorStore((s) => s.tracks);
  const mediaAssets = useEditorStore((s) => s.mediaAssets);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const selectClip = useEditorStore((s) => s.selectClip);
  const updateClip = useEditorStore((s) => s.updateClip);
  const moveClip = useEditorStore((s) => s.moveClip);
  const removeClip = useEditorStore((s) => s.removeClip);
  const removeClips = useEditorStore((s) => s.removeClips);
  const duplicateClip = useEditorStore((s) => s.duplicateClip);
  const splitClipAtTime = useEditorStore((s) => s.splitClipAtTime);
  const commitHistory = useEditorStore((s) => s.commitHistory);
  const currentTime = useEditorStore((s) => s.currentTime);
  const snapping = useEditorStore((s) => s.snapping);

  const asset = mediaAssets.find((m) => m.id === clip.mediaId);
  const selected = selectedClipIds.includes(clip.id);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{
    mode: "move" | "left" | "right";
    startX: number;
    startClientY: number;
    origStart: number;
    origDuration: number;
    origTrimIn: number;
  } | null>(null);

  const snapThreshold = 8 / pxPerSec;

  function beginDrag(mode: "move" | "left" | "right", e: React.PointerEvent) {
    if (track.locked) return;
    e.stopPropagation();
    if (!selectedClipIds.includes(clip.id)) selectClip(clip.id, e.shiftKey);
    dragState.current = {
      mode,
      startX: e.clientX,
      startClientY: e.clientY,
      origStart: clip.start,
      origDuration: clip.duration,
      origTrimIn: clip.trimIn,
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function onMove(e: PointerEvent) {
    const ds = dragState.current;
    if (!ds) return;
    const dx = (e.clientX - ds.startX) / pxPerSec;
    const targets = snapping ? [...findSnapTargets(tracks, clip.id), currentTime] : [];

    if (ds.mode === "move") {
      let newStart = Math.max(0, ds.origStart + dx);
      if (snapping) {
        newStart = snapValue(newStart, targets, snapThreshold);
        const endSnapped = snapValue(newStart + ds.origDuration, targets, snapThreshold);
        if (endSnapped !== newStart + ds.origDuration) newStart = endSnapped - ds.origDuration;
      }
      newStart = Math.max(0, newStart);

      // detect vertical track change
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const laneEl = el?.closest("[data-track-id]") as HTMLElement | null;
      const targetTrackId = laneEl?.getAttribute("data-track-id");
      const targetTrack = targetTrackId ? tracks.find((t) => t.id === targetTrackId) : null;

      if (targetTrack && targetTrack.type === track.type && targetTrack.id !== clip.trackId && !targetTrack.locked) {
        moveClip(clip.id, targetTrack.id, newStart);
      } else {
        updateClip(clip.id, { start: newStart }, false);
      }
    } else if (ds.mode === "left") {
      const maxTrimBack = ds.origTrimIn; // can't go before 0 in source
      let newStart = ds.origStart + dx;
      newStart = clamp(newStart, ds.origStart - maxTrimBack / clip.effects.speed, ds.origStart + ds.origDuration - MIN_DURATION);
      if (snapping) newStart = snapValue(newStart, targets, snapThreshold);
      newStart = clamp(newStart, ds.origStart - maxTrimBack / clip.effects.speed, ds.origStart + ds.origDuration - MIN_DURATION);
      newStart = Math.max(0, newStart);
      const deltaStart = newStart - ds.origStart;
      const newDuration = ds.origDuration - deltaStart;
      const newTrimIn = ds.origTrimIn + deltaStart * clip.effects.speed;
      updateClip(clip.id, { start: newStart, duration: newDuration, trimIn: newTrimIn }, false);
    } else if (ds.mode === "right") {
      let newDuration = ds.origDuration + dx;
      const maxDuration = asset ? (asset.duration - ds.origTrimIn) / clip.effects.speed : Infinity;
      newDuration = clamp(newDuration, MIN_DURATION, maxDuration);
      if (snapping) {
        const snappedEnd = snapValue(ds.origStart + newDuration, targets, snapThreshold);
        newDuration = clamp(snappedEnd - ds.origStart, MIN_DURATION, maxDuration);
      }
      updateClip(clip.id, { duration: newDuration }, false);
    }
  }

  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    dragState.current = null;
    commitHistory();
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    selectClip(clip.id);
    setMenu({ x: e.clientX, y: e.clientY });
  }

  const left = clip.start * pxPerSec;
  const width = Math.max(clip.duration * pxPerSec, 4);

  const Icon = track.type === "audio" ? Music4 : track.type === "text" ? TypeIcon : Film;

  return (
    <div
      data-clip-id={clip.id}
      onPointerDown={(e) => beginDrag("move", e)}
      onContextMenu={onContextMenu}
      className={`group absolute top-1 bottom-1 overflow-hidden rounded-md border shadow-sm ${
        selected ? "border-white ring-2 ring-indigo-400" : "border-black/30"
      }`}
      style={{
        left,
        width,
        background: `linear-gradient(180deg, ${clip.color}dd, ${clip.color}99)`,
      }}
    >
      {track.type === "audio" && asset?.waveform ? (
        <Waveform asset={asset} clip={clip} />
      ) : (
        asset?.thumbnail && (
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage: `url(${asset.thumbnail})`,
              backgroundRepeat: "repeat-x",
              backgroundSize: "auto 100%",
            }}
          />
        )
      )}
      <div className="relative flex h-full items-center gap-1 px-2 text-[11px] font-medium text-white">
        <Icon size={11} className="shrink-0 opacity-80" />
        <span className="truncate">{clip.name}</span>
      </div>
      {(clip.effects.fadeIn > 0 || clip.effects.fadeOut > 0) && (
        <div className="pointer-events-none absolute inset-0">
          {clip.effects.fadeIn > 0 && (
            <div
              className="absolute left-0 top-0 h-full bg-black/40"
              style={{ width: clip.effects.fadeIn * pxPerSec, clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
            />
          )}
          {clip.effects.fadeOut > 0 && (
            <div
              className="absolute right-0 top-0 h-full bg-black/40"
              style={{ width: clip.effects.fadeOut * pxPerSec, clipPath: "polygon(100% 0, 100% 100%, 0 0)" }}
            />
          )}
        </div>
      )}
      {!track.locked && (
        <>
          <div
            onPointerDown={(e) => beginDrag("left", e)}
            className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-white/0 hover:bg-white/40"
          />
          <div
            onPointerDown={(e) => beginDrag("right", e)}
            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-white/0 hover:bg-white/40"
          />
        </>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          removeClip(clip.id);
        }}
        className="absolute right-1 top-1 hidden rounded bg-black/50 p-0.5 text-white/80 hover:text-white group-hover:block"
        title="Delete clip"
      >
        <Trash2 size={11} />
      </button>

      {menu && (
        <ClipContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onDelete={() => (selectedClipIds.length > 1 ? removeClips(selectedClipIds) : removeClip(clip.id))}
          onDuplicate={() => duplicateClip(clip.id)}
          onSplit={() => splitClipAtTime(clip.id, currentTime)}
        />
      )}
    </div>
  );
}

function ClipContextMenu({
  x,
  y,
  onClose,
  onDelete,
  onDuplicate,
  onSplit,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSplit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div
        className="absolute min-w-[160px] rounded-md border border-neutral-700 bg-neutral-850 bg-neutral-800 py-1 text-xs shadow-xl"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem icon={<Scissors size={12} />} label="Split at playhead" onClick={() => { onSplit(); onClose(); }} />
        <MenuItem icon={<Copy size={12} />} label="Duplicate" onClick={() => { onDuplicate(); onClose(); }} />
        <MenuItem icon={<Trash2 size={12} />} label="Delete" onClick={() => { onDelete(); onClose(); }} danger />
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-neutral-700 ${danger ? "text-red-400" : "text-neutral-200"}`}
    >
      {icon}
      {label}
    </button>
  );
}
