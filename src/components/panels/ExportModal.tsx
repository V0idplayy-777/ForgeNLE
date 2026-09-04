import { useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "../../store/useEditorStore";
import { canExportMp4, exportProject, ExportResult } from "../../lib/exportEngine";
import { getProjectDuration, formatDuration, downloadBlob, safeFilename, formatBytes } from "../../lib/utils";
import { Download, Loader2, CheckCircle2, AlertTriangle, Film, X } from "lucide-react";
import { Modal, Row, Select, Segmented, Toggle, Btn, NumberField } from "../ui/controls";

const QUALITY = [
  { id: "draft", label: "Draft", mult: 0.35, desc: "Small file, quick share" },
  { id: "good", label: "Good", mult: 0.7, desc: "Balanced" },
  { id: "high", label: "High", mult: 1.0, desc: "Recommended" },
  { id: "max", label: "Max", mult: 1.8, desc: "Archival quality" },
] as const;

function baseBitrate(w: number, h: number, fps: number) {
  // ~0.1 bits per pixel per frame for H.264 at "high"
  const bpp = 0.1;
  return Math.round(w * h * fps * bpp);
}

export default function ExportModal({ onClose }: { onClose: () => void }) {
  const tracks = useEditorStore((s) => s.tracks);
  const mediaAssets = useEditorStore((s) => s.mediaAssets);
  const settings = useEditorStore((s) => s.settings);
  const isExporting = useEditorStore((s) => s.isExporting);
  const exportProgress = useEditorStore((s) => s.exportProgress);
  const setExporting = useEditorStore((s) => s.setExporting);
  const setExportProgress = useEditorStore((s) => s.setExportProgress);
  const projectName = useEditorStore((s) => s.projectName);
  const inPoint = useEditorStore((s) => s.inPoint);
  const outPoint = useEditorStore((s) => s.outPoint);
  const notify = useEditorStore((s) => s.notify);

  const [scale, setScale] = useState<"1" | "0.75" | "0.5" | "2">("1");
  const [fps, setFps] = useState(settings.fps);
  const [quality, setQuality] = useState<(typeof QUALITY)[number]["id"]>("high");
  const [container, setContainer] = useState<"mp4" | "webm">("mp4");
  const [includeAudio, setIncludeAudio] = useState(true);
  const [useRange, setUseRange] = useState(inPoint !== null && outPoint !== null);
  const [customBitrate, setCustomBitrate] = useState<number | null>(null);
  const [mp4Ok, setMp4Ok] = useState<boolean | null>(null);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const duration = getProjectDuration(tracks);
  const range: [number, number] | undefined = useRange && inPoint !== null && outPoint !== null ? [inPoint, outPoint] : undefined;
  const exportSeconds = range ? range[1] - range[0] : duration;
  const width = Math.round((settings.width * Number(scale)) / 2) * 2;
  const height = Math.round((settings.height * Number(scale)) / 2) * 2;
  const bitrate = customBitrate ?? Math.round(baseBitrate(width, height, fps) * QUALITY.find((q) => q.id === quality)!.mult);
  const estSize = ((bitrate + (includeAudio ? 192_000 : 0)) / 8) * exportSeconds;

  useEffect(() => {
    let alive = true;
    canExportMp4(width, height, fps, bitrate).then((ok) => {
      if (!alive) return;
      setMp4Ok(ok);
      if (!ok) setContainer("webm");
    });
    return () => {
      alive = false;
    };
  }, [width, height, fps, bitrate]);

  const fileName = useMemo(() => `${safeFilename(projectName)}-${height}p.${result?.extension ?? container}`, [projectName, height, container, result]);

  async function handleExport() {
    setError(null);
    setResult(null);
    setExporting(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const wasPlaying = useEditorStore.getState().isPlaying;
    useEditorStore.getState().setIsPlaying(false);
    try {
      const res = await exportProject(
        { tracks, assets: mediaAssets, settings },
        {
          width,
          height,
          fps,
          bitrate,
          audioBitrate: 192_000,
          container,
          range,
          includeAudio,
          signal: ctrl.signal,
          onProgress: (r, st) => {
            setExportProgress(r);
            setStage(st);
          },
        }
      );
      setResult(res);
      notify("Export complete", "success");
    } catch (e: any) {
      if (e?.name === "AbortError") setError("Export cancelled.");
      else setError(e?.message || "Export failed.");
    } finally {
      setExporting(false);
      abortRef.current = null;
      void wasPlaying;
    }
  }

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <Film size={15} className="text-indigo-400" /> Export
        </span>
      }
      onClose={() => {
        if (isExporting) abortRef.current?.abort();
        onClose();
      }}
      width={520}
      footer={
        result ? (
          <>
            <Btn variant="ghost" onClick={() => setResult(null)}>Export again</Btn>
            <Btn variant="primary" size="md" onClick={() => downloadBlob(result.blob, fileName)}>
              <Download size={14} /> Download {fileName}
            </Btn>
          </>
        ) : isExporting ? (
          <Btn variant="danger" onClick={() => abortRef.current?.abort()}>
            <X size={13} /> Cancel
          </Btn>
        ) : (
          <>
            <Btn variant="ghost" onClick={onClose}>Close</Btn>
            <Btn variant="primary" size="md" onClick={handleExport} disabled={exportSeconds <= 0}>
              <Download size={14} /> Export {container.toUpperCase()}
            </Btn>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 size={36} className="text-emerald-400" />
          <div className="text-sm font-semibold text-white">Ready to download</div>
          <div className="text-[11px] text-neutral-400">
            {width}×{height} · {fps} fps · {formatDuration(result.seconds)} · {formatBytes(result.blob.size)} · {result.extension.toUpperCase()}
          </div>
          <video src={URL.createObjectURL(result.blob)} controls className="mt-2 max-h-56 w-full rounded-lg border border-white/10 bg-black" />
        </div>
      ) : isExporting ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="animate-spin text-indigo-400" size={28} />
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 transition-[width] duration-150" style={{ width: `${Math.round(exportProgress * 100)}%` }} />
          </div>
          <p className="text-[11px] text-neutral-400">
            {Math.round(exportProgress * 100)}% · {stage}
          </p>
          <p className="text-[10px] text-neutral-600">Keep this tab in the foreground for the fastest render.</p>
        </div>
      ) : (
        <div className="text-xs">
          <Row label="Format">
            <Segmented
              value={container}
              onChange={setContainer}
              options={[
                { value: "mp4", label: mp4Ok === false ? "MP4 (unavailable)" : "MP4 · H.264", title: "Frame-accurate render, widest compatibility" },
                { value: "webm", label: "WebM · VP9", title: "Real-time recording fallback" },
              ]}
              className="w-full"
            />
          </Row>
          {container === "mp4" && mp4Ok === false && (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-2 text-[10px] text-amber-300">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> This browser can't encode H.264 at {width}×{height}. Use WebM or a Chromium-based browser.
            </div>
          )}
          {container === "webm" && (
            <p className="mb-2 text-[10px] text-neutral-500">WebM records the preview in real time (export takes as long as the video). MP4 renders offline and is frame-accurate.</p>
          )}
          <Row label="Resolution">
            <Select
              value={scale}
              onChange={setScale}
              options={[
                { value: "2", label: `${settings.width * 2}×${settings.height * 2} (2×)` },
                { value: "1", label: `${settings.width}×${settings.height} (project)` },
                { value: "0.75", label: `${Math.round(settings.width * 0.75)}×${Math.round(settings.height * 0.75)}` },
                { value: "0.5", label: `${settings.width / 2}×${settings.height / 2} (half)` },
              ]}
            />
          </Row>
          <Row label="Frame rate">
            <Segmented value={String(fps) as any} onChange={(v) => setFps(Number(v))} options={[24, 25, 30, 50, 60].map((f) => ({ value: String(f), label: String(f) }))} size="xs" className="w-full" />
          </Row>
          <Row label="Quality">
            <Segmented value={quality} onChange={(v) => { setQuality(v); setCustomBitrate(null); }} options={QUALITY.map((q) => ({ value: q.id, label: q.label, title: q.desc }))} size="xs" className="w-full" />
          </Row>
          <Row label="Bitrate">
            <NumberField value={Math.round(bitrate / 1_000_000 * 10) / 10} min={0.5} max={200} step={0.5} precision={1} unit="Mbps" onChange={(v) => setCustomBitrate(Math.round(v * 1_000_000))} className="w-[90px]" />
            <span className="text-[10px] text-neutral-500">≈ {formatBytes(estSize)}</span>
          </Row>
          <Row label="Audio">
            <Toggle checked={includeAudio} onChange={setIncludeAudio} label="Include audio (AAC 192 kbps)" />
          </Row>
          <Row label="Range">
            <Toggle checked={useRange} onChange={setUseRange} label={inPoint !== null && outPoint !== null ? `In → Out (${formatDuration(outPoint - inPoint)})` : "Set In/Out points (I / O) to export a section"} />
          </Row>
          <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.03] p-3 text-[11px] text-neutral-400">
            <div className="flex justify-between"><span>Output</span><span className="font-mono text-neutral-200">{width}×{height} @ {fps}fps</span></div>
            <div className="flex justify-between"><span>Duration</span><span className="font-mono text-neutral-200">{formatDuration(exportSeconds)} ({Math.round(exportSeconds * fps)} frames)</span></div>
            <div className="flex justify-between"><span>File name</span><span className="truncate font-mono text-neutral-200">{fileName}</span></div>
          </div>
          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/10 p-2 text-[11px] text-red-300">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
