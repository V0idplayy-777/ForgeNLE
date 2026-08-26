import { useRef, useState } from "react";
import { useEditorStore } from "../../store/useEditorStore";
import { importFiles } from "../../lib/mediaImport";
import { computeWaveform } from "../../lib/waveform";
import { formatDuration, pickClipColor, uid } from "../../lib/utils";
import { defaultEffects } from "../../types";
import { UploadCloud, Film, Music4, Image as ImageIcon, PlusCircle, Trash2 } from "lucide-react";

export default function MediaBin() {
  const mediaAssets = useEditorStore((s) => s.mediaAssets);
  const addMedia = useEditorStore((s) => s.addMedia);
  const removeMedia = useEditorStore((s) => s.removeMedia);
  const setMediaWaveform = useEditorStore((s) => s.setMediaWaveform);
  const tracks = useEditorStore((s) => s.tracks);
  const addClip = useEditorStore((s) => s.addClip);
  const addTrack = useEditorStore((s) => s.addTrack);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const assets = await importFiles(files);
      addMedia(assets);
      for (const asset of assets) {
        if (asset.type === "video" || asset.type === "audio") {
          computeWaveform(asset.url).then((wf) => {
            if (wf) setMediaWaveform(asset.id, wf);
          });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function appendToTimeline(assetId: string) {
    const asset = mediaAssets.find((m) => m.id === assetId);
    if (!asset) return;
    const wantType = asset.type === "audio" ? "audio" : "video";
    let track = [...tracks].reverse().find((t) => t.type === wantType && !t.locked);
    let trackId = track?.id;
    if (!trackId) trackId = addTrack(wantType);
    const targetTrack = useEditorStore.getState().tracks.find((t) => t.id === trackId)!;
    const end = targetTrack.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
    addClip(trackId, {
      id: uid("clip"),
      trackId,
      mediaId: asset.id,
      name: asset.name,
      color: pickClipColor(),
      start: end,
      duration: asset.duration,
      trimIn: 0,
      effects: defaultEffects(),
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className={`m-2 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center text-xs transition-colors ${
          dragOver ? "border-indigo-400 bg-indigo-500/10" : "border-neutral-700 text-neutral-500"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <UploadCloud size={20} className="text-neutral-500" />
        <p>Drag media here, or</p>
        <button
          onClick={() => inputRef.current?.click()}
          className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-500"
        >
          Browse files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {busy && <p className="text-indigo-400">Importing…</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {mediaAssets.length === 0 && (
          <p className="px-2 py-6 text-center text-[11px] text-neutral-600">No media imported yet.</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {mediaAssets.map((asset) => (
            <div
              key={asset.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-media-id", asset.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onDoubleClick={() => appendToTimeline(asset.id)}
              className="group relative flex flex-col overflow-hidden rounded-md border border-neutral-800 bg-neutral-900 hover:border-indigo-500"
              title="Drag to timeline, or double-click to append"
            >
              <div className="relative flex h-16 items-center justify-center bg-neutral-950">
                {asset.thumbnail ? (
                  <img src={asset.thumbnail} className="h-full w-full object-cover opacity-90" draggable={false} />
                ) : asset.type === "audio" ? (
                  <Music4 className="text-emerald-500" size={20} />
                ) : (
                  <ImageIcon className="text-neutral-600" size={20} />
                )}
                <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[9px] text-neutral-300">
                  {formatDuration(asset.duration)}
                </span>
                <div className="absolute left-0.5 top-0.5 rounded bg-black/70 p-0.5 text-neutral-300">
                  {asset.type === "video" ? <Film size={10} /> : asset.type === "audio" ? <Music4 size={10} /> : <ImageIcon size={10} />}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    appendToTimeline(asset.id);
                  }}
                  className="absolute right-0.5 top-0.5 hidden rounded bg-indigo-600 p-0.5 text-white group-hover:block"
                  title="Add to timeline"
                >
                  <PlusCircle size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeMedia(asset.id);
                  }}
                  className="absolute right-0.5 bottom-0.5 hidden rounded bg-red-600/80 p-0.5 text-white group-hover:block"
                  title="Remove from library"
                >
                  <Trash2 size={10} />
                </button>
              </div>
              <div className="truncate px-1.5 py-1 text-[10px] text-neutral-300">{asset.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
