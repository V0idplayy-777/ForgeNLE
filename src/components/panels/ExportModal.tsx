import { useState } from "react";
import { useEditorStore } from "../../store/useEditorStore";
import { exportProject } from "../../lib/exportEngine";
import { getProjectDuration, formatDuration } from "../../lib/utils";
import { X, Download, Loader2 } from "lucide-react";

const PRESETS = [
  { label: "1080p (1920x1080)", width: 1920, height: 1080 },
  { label: "720p (1280x720)", width: 1280, height: 720 },
  { label: "Square (1080x1080)", width: 1080, height: 1080 },
  { label: "Vertical (1080x1920)", width: 1080, height: 1920 },
];

export default function ExportModal({ onClose }: { onClose: () => void }) {
  const tracks = useEditorStore((s) => s.tracks);
  const mediaAssets = useEditorStore((s) => s.mediaAssets);
  const isExporting = useEditorStore((s) => s.isExporting);
  const exportProgress = useEditorStore((s) => s.exportProgress);
  const setExporting = useEditorStore((s) => s.setExporting);
  const setExportProgress = useEditorStore((s) => s.setExportProgress);
  const projectName = useEditorStore((s) => s.projectName);

  const [preset, setPreset] = useState(PRESETS[1]);
  const [fps, setFps] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [doneUrl, setDoneUrl] = useState<string | null>(null);

  const duration = getProjectDuration(tracks);

  async function handleExport() {
    setError(null);
    setDoneUrl(null);
    setExporting(true);
    try {
      const blob = await exportProject(tracks, mediaAssets, {
        width: preset.width,
        height: preset.height,
        fps,
        onProgress: (r) => setExportProgress(r),
      });
      const url = URL.createObjectURL(blob);
      setDoneUrl(url);
    } catch (e: any) {
      setError(e?.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[420px] rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Export Video</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {!isExporting && !doneUrl && (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-[11px] text-neutral-500">Resolution</label>
              <select
                value={preset.label}
                onChange={(e) => setPreset(PRESETS.find((p) => p.label === e.target.value)!)}
                className="w-full rounded bg-neutral-800 px-2 py-1.5 text-xs text-white outline-none"
              >
                {PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-[11px] text-neutral-500">Frame rate</label>
              <select
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="w-full rounded bg-neutral-800 px-2 py-1.5 text-xs text-white outline-none"
              >
                <option value={24}>24 fps</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </div>
            <p className="mb-4 text-[11px] text-neutral-500">
              Timeline duration: <span className="text-neutral-300">{formatDuration(duration)}</span>. Export
              renders in real time and downloads as a .webm file.
            </p>
            {error && <p className="mb-3 text-[11px] text-red-400">{error}</p>}
            <button
              onClick={handleExport}
              disabled={duration <= 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={14} /> Start Export
            </button>
          </>
        )}

        {isExporting && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="animate-spin text-indigo-400" size={28} />
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{ width: `${Math.round(exportProgress * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-neutral-400">Rendering… {Math.round(exportProgress * 100)}%</p>
          </div>
        )}

        {doneUrl && (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-xs text-emerald-400">Export complete!</p>
            <a
              href={doneUrl}
              download={`${projectName.replace(/\s+/g, "_")}.webm`}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              <Download size={14} /> Download video
            </a>
            <button onClick={() => setDoneUrl(null)} className="text-[11px] text-neutral-500 hover:text-white">
              Export again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
