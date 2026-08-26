import { useRef } from "react";
import { useEditorStore } from "../../store/useEditorStore";
import { usePlaybackClock } from "../../hooks/usePlaybackClock";
import ClipMediaLayer from "./ClipMediaLayer";
import AudioClipPlayer from "./AudioClipPlayer";
import TextLayer from "./TextLayer";
import { formatTimecode, getProjectDuration } from "../../lib/utils";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
  Maximize2,
} from "lucide-react";

export default function PreviewPlayer() {
  usePlaybackClock();
  const stageRef = useRef<HTMLDivElement>(null);
  const tracks = useEditorStore((s) => s.tracks);
  const mediaAssets = useEditorStore((s) => s.mediaAssets);
  const currentTime = useEditorStore((s) => s.currentTime);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const selectClip = useEditorStore((s) => s.selectClip);

  const duration = getProjectDuration(tracks);
  const videoTracksTop = [...tracks].filter((t) => t.type !== "text" && !t.hidden);
  const textTracks = tracks.filter((t) => t.type === "text" && !t.hidden);

  function assetFor(id?: string) {
    return mediaAssets.find((m) => m.id === id);
  }

  function nudge(delta: number) {
    setCurrentTime(Math.min(duration, Math.max(0, currentTime + delta)));
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-neutral-950">
      <div
        className="relative mx-auto my-3 flex aspect-video w-full max-w-4xl items-center justify-center overflow-hidden rounded-lg border border-neutral-800 bg-black shadow-2xl"
        ref={stageRef}
        onPointerDown={() => selectClip(null)}
      >
        {tracks.length === 0 && (
          <div className="text-sm text-neutral-600">Import media to begin editing</div>
        )}
        {videoTracksTop.map((track, ti) =>
          track.clips.map((clip) => {
            const asset = assetFor(clip.mediaId);
            if (track.type === "video") {
              return (
                <ClipMediaLayer key={clip.id} clip={clip} track={track} asset={asset} zIndex={ti + 1} />
              );
            }
            if (track.type === "audio") {
              return <AudioClipPlayer key={clip.id} clip={clip} track={track} asset={asset} />;
            }
            return null;
          })
        )}
        {textTracks.map((track, ti) =>
          track.clips.map((clip) => (
            <TextLayer key={clip.id} clip={clip} zIndex={100 + ti} stageRef={stageRef} />
          ))
        )}
        {duration === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-neutral-700">
            <span className="text-xs uppercase tracking-widest">Empty Timeline</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-1 border-t border-neutral-800 bg-neutral-900/60 px-4 py-2">
        <span className="mr-3 w-24 text-center font-mono text-xs text-neutral-400">
          {formatTimecode(currentTime)}
        </span>
        <button className="control-btn" title="Go to start" onClick={() => setCurrentTime(0)}>
          <SkipBack size={16} />
        </button>
        <button className="control-btn" title="Back 1s" onClick={() => nudge(-1)}>
          <Rewind size={16} />
        </button>
        <button
          className="control-btn !bg-indigo-600 !text-white hover:!bg-indigo-500"
          title="Play/Pause (Space)"
          onClick={togglePlay}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button className="control-btn" title="Forward 1s" onClick={() => nudge(1)}>
          <FastForward size={16} />
        </button>
        <button className="control-btn" title="Go to end" onClick={() => setCurrentTime(duration)}>
          <SkipForward size={16} />
        </button>
        <span className="ml-3 w-24 text-center font-mono text-xs text-neutral-600">
          / {formatTimecode(duration)}
        </span>
        <button className="control-btn ml-4" title="Fullscreen preview" onClick={() => stageRef.current?.requestFullscreen?.()}>
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
}
