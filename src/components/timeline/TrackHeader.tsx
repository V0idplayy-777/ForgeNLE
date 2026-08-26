import { useState } from "react";
import { Track } from "../../types";
import { useEditorStore } from "../../store/useEditorStore";
import { Eye, EyeOff, Lock, Unlock, Volume2, VolumeX, Trash2, Film, Music4, Type as TypeIcon } from "lucide-react";

export default function TrackHeader({ track }: { track: Track }) {
  const toggleTrackProp = useEditorStore((s) => s.toggleTrackProp);
  const renameTrack = useEditorStore((s) => s.renameTrack);
  const removeTrack = useEditorStore((s) => s.removeTrack);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(track.name);

  const Icon = track.type === "audio" ? Music4 : track.type === "text" ? TypeIcon : Film;
  const accent = track.type === "audio" ? "bg-emerald-500" : track.type === "text" ? "bg-amber-500" : "bg-indigo-500";

  return (
    <div className="sticky left-0 z-20 flex h-16 w-40 shrink-0 items-center gap-2 border-r border-neutral-800 bg-neutral-900 px-2">
      <div className={`h-8 w-1 rounded-full ${accent}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1 min-w-0">
          <Icon size={11} className="shrink-0 text-neutral-500" />
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                setEditing(false);
                renameTrack(track.id, name || track.name);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="w-full min-w-0 rounded bg-neutral-800 px-1 text-[11px] text-white outline-none"
            />
          ) : (
            <span
              onDoubleClick={() => setEditing(true)}
              className="truncate text-[11px] font-medium text-neutral-200"
              title="Double-click to rename"
            >
              {track.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <IconToggle
            active={!track.hidden}
            onClick={() => toggleTrackProp(track.id, "hidden")}
            onIcon={<Eye size={11} />}
            offIcon={<EyeOff size={11} />}
            title="Show/Hide"
          />
          <IconToggle
            active={!track.muted}
            onClick={() => toggleTrackProp(track.id, "muted")}
            onIcon={<Volume2 size={11} />}
            offIcon={<VolumeX size={11} />}
            title="Mute/Unmute"
          />
          <IconToggle
            active={!track.locked}
            onClick={() => toggleTrackProp(track.id, "locked")}
            onIcon={<Unlock size={11} />}
            offIcon={<Lock size={11} />}
            title="Lock/Unlock"
          />
          <button
            onClick={() => removeTrack(track.id)}
            className="ml-auto rounded p-0.5 text-neutral-600 hover:bg-red-500/20 hover:text-red-400"
            title="Delete track"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

function IconToggle({
  active,
  onClick,
  onIcon,
  offIcon,
  title,
}: {
  active: boolean;
  onClick: () => void;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded p-0.5 ${active ? "text-neutral-400 hover:text-white" : "text-red-400"}`}
    >
      {active ? onIcon : offIcon}
    </button>
  );
}
