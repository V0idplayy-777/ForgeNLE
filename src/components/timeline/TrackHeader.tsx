import { useState } from "react";
import { Track } from "../../types";
import { useEditorStore } from "../../store/useEditorStore";
import { Eye, EyeOff, Lock, Unlock, Volume2, VolumeX, Trash2, Film, Music4, ChevronUp, ChevronDown, Headphones } from "lucide-react";
import { cn } from "../../utils/cn";

export const TRACK_HEIGHTS = { s: 36, m: 56, l: 88 } as const;

export default function TrackHeader({ track, index, total }: { track: Track; index: number; total: number }) {
  const toggleTrackProp = useEditorStore((s) => s.toggleTrackProp);
  const renameTrack = useEditorStore((s) => s.renameTrack);
  const removeTrack = useEditorStore((s) => s.removeTrack);
  const setTrackVolume = useEditorStore((s) => s.setTrackVolume);
  const setTrackHeight = useEditorStore((s) => s.setTrackHeight);
  const moveTrack = useEditorStore((s) => s.moveTrack);
  const tracks = useEditorStore((s) => s.tracks);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(track.name);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const isVideo = track.type === "video";
  const Icon = isVideo ? Film : Music4;
  const h = TRACK_HEIGHTS[track.height];
  const canUp = index > 0 && tracks[index - 1].type === track.type;
  const canDown = index < total - 1 && tracks[index + 1].type === track.type;

  return (
    <div
      className={cn(
        "sticky left-0 z-20 flex w-[176px] shrink-0 select-none items-stretch border-b border-r border-white/5 bg-[#141417]",
        track.locked && "bg-[#111113]"
      )}
      style={{ height: h }}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className={cn("w-1 shrink-0", isVideo ? "bg-indigo-500/80" : "bg-emerald-500/80", (track.hidden || track.muted) && "opacity-30")} />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon size={11} className="shrink-0 text-neutral-500" />
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                setEditing(false);
                renameTrack(track.id, name.trim() || track.name);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setName(track.name);
                  setEditing(false);
                }
              }}
              className="w-full min-w-0 rounded bg-neutral-800 px-1 text-[11px] text-white outline-none"
            />
          ) : (
            <span onDoubleClick={() => setEditing(true)} className="truncate text-[11px] font-semibold text-neutral-200" title="Double-click to rename">
              {track.name}
            </span>
          )}
          {track.height !== "s" && (
            <div className="ml-auto flex items-center">
              <button
                onClick={() => setTrackHeight(track.id, track.height === "l" ? "m" : "s")}
                className="rounded p-0.5 text-neutral-600 hover:text-white"
                title="Shrink track"
              >
                <ChevronUp size={10} />
              </button>
              <button
                onClick={() => setTrackHeight(track.id, track.height === "m" ? "l" : "l")}
                className="rounded p-0.5 text-neutral-600 hover:text-white disabled:opacity-20"
                disabled={track.height === "l"}
                title="Grow track"
              >
                <ChevronDown size={10} />
              </button>
            </div>
          )}
          {track.height === "s" && (
            <button onClick={() => setTrackHeight(track.id, "m")} className="ml-auto rounded p-0.5 text-neutral-600 hover:text-white" title="Grow track">
              <ChevronDown size={10} />
            </button>
          )}
        </div>
        {track.height !== "s" && (
          <div className="flex items-center gap-0.5">
            {isVideo && (
              <Tog active={!track.hidden} onClick={() => toggleTrackProp(track.id, "hidden")} on={<Eye size={11} />} off={<EyeOff size={11} />} title="Toggle visibility" />
            )}
            <Tog active={!track.muted} onClick={() => toggleTrackProp(track.id, "muted")} on={<Volume2 size={11} />} off={<VolumeX size={11} />} title="Mute" />
            <button
              onClick={() => toggleTrackProp(track.id, "solo")}
              className={cn("rounded px-1 py-0.5 text-[9px] font-bold", track.solo ? "bg-amber-500 text-black" : "text-neutral-500 hover:text-white")}
              title="Solo"
            >
              S
            </button>
            <Tog active={!track.locked} onClick={() => toggleTrackProp(track.id, "locked")} on={<Unlock size={11} />} off={<Lock size={11} />} title="Lock" />
            {track.height === "l" && (
              <div className="ml-1 flex flex-1 items-center gap-1" title={`Track volume ${track.volume}%`}>
                <Headphones size={10} className="text-neutral-600" />
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={track.volume}
                  onChange={(e) => setTrackVolume(track.id, Number(e.target.value))}
                  className="fx-slider h-3 w-full"
                  style={{ ["--pct" as any]: `${track.volume / 2}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {menu && (
        <div className="fixed inset-0 z-[200]" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}>
          <div className="absolute min-w-[170px] rounded-lg border border-white/10 bg-[#1c1c20] py-1 text-xs shadow-2xl" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
            <Item label="Rename" onClick={() => { setEditing(true); setMenu(null); }} />
            <Item label="Move up" disabled={!canUp} onClick={() => { moveTrack(track.id, -1); setMenu(null); }} />
            <Item label="Move down" disabled={!canDown} onClick={() => { moveTrack(track.id, 1); setMenu(null); }} />
            <div className="my-1 h-px bg-white/5" />
            <Item label={`Volume: ${track.volume}%`} onClick={() => { const v = prompt("Track volume (%)", String(track.volume)); if (v !== null) setTrackVolume(track.id, Number(v)); setMenu(null); }} />
            <div className="my-1 h-px bg-white/5" />
            <Item label="Delete track" danger icon={<Trash2 size={11} />} onClick={() => { if (!track.clips.length || confirm(`Delete ${track.name} and its ${track.clips.length} clip(s)?`)) removeTrack(track.id); setMenu(null); }} />
          </div>
        </div>
      )}
    </div>
  );
}

function Tog({ active, onClick, on, off, title }: { active: boolean; onClick: () => void; on: React.ReactNode; off: React.ReactNode; title: string }) {
  return (
    <button onClick={onClick} title={title} className={cn("rounded p-0.5", active ? "text-neutral-500 hover:text-white" : "bg-red-500/15 text-red-400")}>
      {active ? on : off}
    </button>
  );
}

function Item({ label, onClick, danger, disabled, icon }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-neutral-200 hover:bg-white/5 disabled:opacity-30", danger && "text-red-400 hover:bg-red-500/10")}
    >
      {icon}
      {label}
    </button>
  );
}
