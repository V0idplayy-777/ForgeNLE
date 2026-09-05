import { useRef, useState } from "react";
import { useEditorStore } from "../../store/useEditorStore";
import { generateFilmstrip, importFiles } from "../../lib/mediaImport";
import { computeWaveform } from "../../lib/waveform";
import { formatBytes, formatDuration } from "../../lib/utils";
import { CaptureError, CaptureSession, startCameraCapture, startScreenCapture } from "../../lib/capture";
import { UploadCloud, Film, Music4, Image as ImageIcon, Plus, Trash2, Search, LayoutGrid, List, AlertTriangle, MonitorUp, Camera } from "lucide-react";
import { cn } from "../../utils/cn";
import { Empty } from "../ui/controls";

export async function ingestFiles(files: FileList | File[] | null, onBusy?: (b: boolean, label?: string) => void) {
  if (!files || files.length === 0) return;
  const s = useEditorStore.getState();
  onBusy?.(true, "Importing…");
  try {
    const assets = await importFiles(files, (p) => onBusy?.(true, `Importing ${p.index + 1}/${p.total}: ${p.name}`));
    if (!assets.length) {
      s.notify("No supported media found in those files", "error");
      return;
    }
    s.addMedia(assets);
    s.notify(`Imported ${assets.length} file${assets.length > 1 ? "s" : ""}`, "success");
    // Background analysis
    for (const asset of assets) {
      if (asset.type === "video" || asset.type === "audio") {
        computeWaveform(asset.url).then((wf) => {
          if (wf) useEditorStore.getState().patchMedia(asset.id, { waveform: wf });
        });
      }
      if (asset.type === "video") {
        generateFilmstrip(asset.url, asset.duration).then((frames) => {
          if (frames.length) useEditorStore.getState().patchMedia(asset.id, { filmstrip: frames });
        });
      }
    }
  } finally {
    onBusy?.(false);
  }
}

export default function MediaBin() {
  const mediaAssets = useEditorStore((s) => s.mediaAssets);
  const removeMedia = useEditorStore((s) => s.removeMedia);
  const addMediaToTimeline = useEditorStore((s) => s.addMediaToTimeline);
  const tracks = useEditorStore((s) => s.tracks);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "video" | "audio" | "image">("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const inputRef = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState<"screen" | "camera" | null>(null);
  const sessionRef = useRef<CaptureSession | null>(null);
  const notify = useEditorStore((s) => s.notify);

  async function startCapture(kind: "screen" | "camera") {
    if (recording) {
      const session = sessionRef.current;
      sessionRef.current = null;
      setRecording(null);
      if (session) {
        setBusy("Finishing capture…");
        try {
          const file = await session.stop();
          await ingestFiles([file], (b, l) => setBusy(b ? l ?? "Importing…" : null));
        } catch {
          notify("Capture could not be saved", "error");
        } finally {
          setBusy(null);
        }
      }
      return;
    }
    try {
      const session = kind === "screen" ? await startScreenCapture() : await startCameraCapture();
      sessionRef.current = session;
      setRecording(kind);
      notify(kind === "screen" ? "🔴 Recording your screen — click the camera again to stop & import" : "🔴 Recording your camera — click again to stop & import", "info");
    } catch (e) {
      notify(e instanceof CaptureError ? e.message : "Capture failed to start", "error");
    }
  }

  const usage = new Map<string, number>();
  for (const t of tracks) for (const c of t.clips) if (c.mediaId) usage.set(c.mediaId, (usage.get(c.mediaId) ?? 0) + 1);

  const visible = mediaAssets.filter((a) => (filter === "all" || a.type === filter) && a.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(false);
        ingestFiles(e.dataTransfer.files, (b, l) => setBusy(b ? l ?? "Importing…" : null));
      }}
    >
      <div className="flex items-center gap-1.5 border-b border-white/5 p-2">
        <div className="flex h-7 flex-1 items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.04] px-2">
          <Search size={12} className="text-neutral-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search media"
            className="w-full min-w-0 bg-transparent text-[11px] text-white outline-none placeholder:text-neutral-600"
          />
        </div>
        <button onClick={() => setView(view === "grid" ? "list" : "grid")} className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-white/5 hover:text-white" title="Toggle view">
          {view === "grid" ? <List size={13} /> : <LayoutGrid size={13} />}
        </button>
        <button
          onClick={() => startCapture("screen")}
          className={cn(
            "flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors",
            recording === "screen" ? "animate-pulse border-red-500 bg-red-500/20 text-red-300" : "border-white/10 bg-white/[0.05] text-neutral-300 hover:text-white"
          )}
          title={recording === "screen" ? "Stop & import the screen recording" : "Record your screen straight into the bin"}
        >
          <MonitorUp size={12} /> {recording === "screen" ? "Stop" : "Screen"}
        </button>
        <button
          onClick={() => startCapture("camera")}
          className={cn(
            "flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors",
            recording === "camera" ? "animate-pulse border-red-500 bg-red-500/20 text-red-300" : "border-white/10 bg-white/[0.05] text-neutral-300 hover:text-white"
          )}
          title={recording === "camera" ? "Stop & import the camera recording" : "Record your webcam (with mic) straight into the bin"}
        >
          <Camera size={12} /> {recording === "camera" ? "Stop" : "Cam"}
        </button>
        <button onClick={() => inputRef.current?.click()} className="flex h-7 items-center gap-1 rounded-md bg-indigo-500 px-2 text-[11px] font-semibold text-white hover:bg-indigo-400" title="Import media">
          <Plus size={12} /> Import
        </button>
        <input ref={inputRef} type="file" multiple accept="video/*,audio/*,image/*" className="hidden" onChange={(e) => { ingestFiles(e.target.files, (b, l) => setBusy(b ? l ?? "Importing…" : null)); e.target.value = ""; }} />
      </div>

      <div className="flex items-center gap-1 border-b border-white/5 px-2 py-1.5">
        {(["all", "video", "audio", "image"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn("rounded px-2 py-0.5 text-[10px] font-medium capitalize", filter === f ? "bg-white/10 text-white" : "text-neutral-500 hover:text-white")}
          >
            {f === "all" ? `All (${mediaAssets.length})` : f}
          </button>
        ))}
      </div>

      {busy && <div className="border-b border-indigo-500/20 bg-indigo-500/10 px-3 py-1.5 text-[10px] text-indigo-300">{busy}</div>}

      <div className={cn("relative min-h-0 flex-1 overflow-y-auto p-2", dragOver && "bg-indigo-500/10")}>
        {dragOver && (
          <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-indigo-400 bg-[#0e0e10]/80 text-xs font-medium text-indigo-300">
            Drop to import
          </div>
        )}
        {mediaAssets.length === 0 ? (
          <button onClick={() => inputRef.current?.click()} className="h-full w-full">
            <Empty icon={<UploadCloud size={32} strokeWidth={1.25} />} title="Import media to get started" hint="Drag & drop video, audio or images here — or click to browse. Everything stays on your device." />
          </button>
        ) : visible.length === 0 ? (
          <Empty icon={<Search size={24} strokeWidth={1.25} />} title="No matches" />
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-2">
            {visible.map((asset) => (
              <AssetCard key={asset.id} asset={asset} uses={usage.get(asset.id) ?? 0} onAdd={() => addMediaToTimeline(asset.id)} onRemove={() => removeMedia(asset.id)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {visible.map((asset) => (
              <AssetRow key={asset.id} asset={asset} uses={usage.get(asset.id) ?? 0} onAdd={() => addMediaToTimeline(asset.id)} onRemove={() => removeMedia(asset.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function typeIcon(type: string, size = 10) {
  return type === "video" ? <Film size={size} /> : type === "audio" ? <Music4 size={size} /> : <ImageIcon size={size} />;
}

function onDragStart(e: React.DragEvent, id: string) {
  e.dataTransfer.setData("application/x-media-id", id);
  e.dataTransfer.effectAllowed = "copy";
}

function AssetCard({ asset, uses, onAdd, onRemove }: { asset: any; uses: number; onAdd: () => void; onRemove: () => void }) {
  return (
    <div
      draggable={!asset.missing}
      onDragStart={(e) => onDragStart(e, asset.id)}
      onDoubleClick={onAdd}
      className={cn("group relative flex cursor-grab flex-col overflow-hidden rounded-lg border border-white/5 bg-white/[0.03] transition-colors hover:border-indigo-500/60 hover:bg-white/[0.05] active:cursor-grabbing", asset.missing && "border-red-500/40")}
      title="Drag to timeline · double-click to add at playhead"
    >
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-black">
        {asset.thumbnail ? (
          <img src={asset.thumbnail} className="h-full w-full object-cover" draggable={false} alt="" />
        ) : asset.type === "audio" ? (
          <AudioThumb waveform={asset.waveform} />
        ) : (
          <ImageIcon className="text-neutral-700" size={20} />
        )}
        {asset.missing && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-950/70 text-red-300">
            <AlertTriangle size={16} />
          </div>
        )}
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 font-mono text-[9px] text-neutral-200">{formatDuration(asset.duration)}</span>
        <span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-black/70 px-1 py-0.5 text-[9px] text-neutral-300">
          {typeIcon(asset.type)}
          {asset.width ? `${asset.width}×${asset.height}` : ""}
        </span>
        {uses > 0 && <span className="absolute bottom-1 left-1 rounded bg-indigo-500/80 px-1 text-[9px] font-semibold text-white">{uses}×</span>}
        <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
          <button onClick={(e) => { e.stopPropagation(); onAdd(); }} className="rounded bg-indigo-500 p-1 text-white hover:bg-indigo-400" title="Add at playhead">
            <Plus size={11} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); if (!uses || confirm(`Remove "${asset.name}" and its ${uses} clip(s) from the timeline?`)) onRemove(); }} className="rounded bg-black/70 p-1 text-neutral-300 hover:bg-red-500 hover:text-white" title="Remove">
            <Trash2 size={11} />
          </button>
        </div>
      </div>
      <div className="truncate px-1.5 py-1 text-[10px] text-neutral-300" title={asset.name}>{asset.name}</div>
    </div>
  );
}

function AssetRow({ asset, uses, onAdd, onRemove }: { asset: any; uses: number; onAdd: () => void; onRemove: () => void }) {
  return (
    <div
      draggable={!asset.missing}
      onDragStart={(e) => onDragStart(e, asset.id)}
      onDoubleClick={onAdd}
      className="group flex cursor-grab items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/5 active:cursor-grabbing"
    >
      <div className="flex h-8 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-black">
        {asset.thumbnail ? <img src={asset.thumbnail} className="h-full w-full object-cover" draggable={false} alt="" /> : <span className="text-neutral-600">{typeIcon(asset.type, 14)}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] text-neutral-200">{asset.name}</div>
        <div className="flex gap-2 text-[9px] text-neutral-500">
          <span>{formatDuration(asset.duration)}</span>
          {asset.width && <span>{asset.width}×{asset.height}</span>}
          <span>{formatBytes(asset.size)}</span>
          {uses > 0 && <span className="text-indigo-400">{uses}× used</span>}
        </div>
      </div>
      <button onClick={onAdd} className="hidden rounded p-1 text-neutral-400 hover:bg-indigo-500 hover:text-white group-hover:block" title="Add at playhead">
        <Plus size={12} />
      </button>
      <button onClick={() => { if (!uses || confirm(`Remove "${asset.name}"?`)) onRemove(); }} className="hidden rounded p-1 text-neutral-400 hover:bg-red-500 hover:text-white group-hover:block" title="Remove">
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function AudioThumb({ waveform }: { waveform?: number[] }) {
  if (!waveform) return <Music4 className="text-emerald-500" size={20} />;
  const step = Math.max(1, Math.floor(waveform.length / 48));
  const bars = waveform.filter((_, i) => i % step === 0).slice(0, 48);
  return (
    <div className="flex h-full w-full items-center gap-px px-2">
      {bars.map((v, i) => (
        <div key={i} className="flex-1 rounded-full bg-emerald-400/80" style={{ height: `${Math.max(6, v * 80)}%` }} />
      ))}
    </div>
  );
}
