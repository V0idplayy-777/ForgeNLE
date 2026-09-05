import { useState, useEffect, useCallback, useRef } from "react";
import TopBar from "./components/TopBar";
import LibraryPanel from "./components/panels/LibraryPanel";
import Inspector from "./components/panels/Inspector";
import PreviewPlayer from "./components/preview/PreviewPlayer";
import Timeline from "./components/timeline/Timeline";
import ExportModal from "./components/panels/ExportModal";
import AccessibilityPanel from "./components/panels/AccessibilityPanel";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useEditorStore } from "./store/useEditorStore";
import { restoreLastProject, saveNow, startAutosave } from "./lib/project";
import { ingestFiles } from "./components/panels/MediaBin";
import { cn } from "./utils/cn";
import { CheckCircle2, AlertCircle, Info, UploadCloud } from "lucide-react";

const LEFT_MIN = 260;
const LEFT_MAX = 560;
const RIGHT_MIN = 280;
const RIGHT_MAX = 560;
const TL_MIN = 160;

export default function App() {
  const [exportOpen, setExportOpen] = useState(false);
  const [a11yOpen, setA11yOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [leftW, setLeftW] = useState(() => Number(localStorage.getItem("forge:leftW")) || 340);
  const [rightW, setRightW] = useState(() => Number(localStorage.getItem("forge:rightW")) || 340);
  const [tlH, setTlH] = useState(() => Number(localStorage.getItem("forge:tlH")) || 300);
  const [fileDrag, setFileDrag] = useState(false);
  const dragDepth = useRef(0);

  const highContrast = useEditorStore((s) => s.highContrast);
  const reduceMotion = useEditorStore((s) => s.reduceMotion);
  const largeUI = useEditorStore((s) => s.largeUI);
  const leftOpen = useEditorStore((s) => s.leftPanelOpen);
  const rightOpen = useEditorStore((s) => s.rightPanelOpen);
  const toast = useEditorStore((s) => s.toast);
  const notify = useEditorStore((s) => s.notify);

  useKeyboardShortcuts({
    onExport: () => setExportOpen(true),
    onSave: () => {
      saveNow();
      notify("Project saved in this browser", "success");
    },
    onToggleShortcuts: () => setShortcutsOpen((v) => !v),
    onZoomFit: () => (window as any).__forgeZoomFit?.(),
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("high-contrast", highContrast);
    root.classList.toggle("reduce-motion", reduceMotion);
    root.classList.toggle("large-ui", largeUI);
  }, [highContrast, reduceMotion, largeUI]);

  // Restore + autosave
  useEffect(() => {
    let stop: (() => void) | undefined;
    restoreLastProject()
      .then((ok) => {
        if (ok) notify("Restored your last session", "info");
      })
      .catch(() => {})
      .finally(() => {
        setRestoring(false);
        stop = startAutosave();
      });
    return () => stop?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => localStorage.setItem("forge:leftW", String(leftW)), [leftW]);
  useEffect(() => localStorage.setItem("forge:rightW", String(rightW)), [rightW]);
  useEffect(() => localStorage.setItem("forge:tlH", String(tlH)), [tlH]);

  // Warn before leaving with unsaved edits during export
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (useEditorStore.getState().isExporting) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const startResize = useCallback((kind: "left" | "right" | "tl", e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const l0 = leftW;
    const r0 = rightW;
    const t0 = tlH;
    document.body.style.cursor = kind === "tl" ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent) => {
      if (kind === "left") setLeftW(Math.min(LEFT_MAX, Math.max(LEFT_MIN, l0 + (ev.clientX - startX))));
      else if (kind === "right") setRightW(Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, r0 - (ev.clientX - startX))));
      else setTlH(Math.min(window.innerHeight * 0.7, Math.max(TL_MIN, t0 - (ev.clientY - startY))));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [leftW, rightW, tlH]);

  // Global file drop (anywhere) → import
  function onDragEnter(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    dragDepth.current++;
    setFileDrag(true);
  }
  function onDragLeave(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setFileDrag(false);
  }
  function onDrop(e: React.DragEvent) {
    dragDepth.current = 0;
    setFileDrag(false);
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    ingestFiles(e.dataTransfer.files);
  }

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-[#0b0b0d] text-neutral-100"
      role="application"
      aria-label="Forge video editor"
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <TopBar onExport={() => setExportOpen(true)} onAccessibility={() => setA11yOpen(true)} shortcutsOpen={shortcutsOpen} setShortcutsOpen={setShortcutsOpen} />

      <div className="flex min-h-0 flex-1">
        {leftOpen && (
          <>
            <div className="flex shrink-0 flex-col border-r border-white/5" style={{ width: leftW }}>
              <LibraryPanel />
            </div>
            <Resizer onPointerDown={(e) => startResize("left", e)} />
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <PreviewPlayer />
          <div className="relative h-1.5 shrink-0 cursor-row-resize bg-[#0e0e10] hover:bg-indigo-500/40" onPointerDown={(e) => startResize("tl", e)}>
            <div className="absolute left-1/2 top-1/2 h-0.5 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10" />
          </div>
          <div className="flex shrink-0 flex-col" style={{ height: tlH }}>
            <Timeline />
          </div>
        </div>

        {rightOpen && (
          <>
            <Resizer onPointerDown={(e) => startResize("right", e)} />
            <div className="shrink-0 border-l border-white/5" style={{ width: rightW }}>
              <Inspector />
            </div>
          </>
        )}
      </div>

      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}
      {a11yOpen && <AccessibilityPanel onClose={() => setA11yOpen(false)} />}

      {fileDrag && (
        <div className="pointer-events-none fixed inset-0 z-[400] flex items-center justify-center bg-indigo-950/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-indigo-400 bg-[#0e0e10]/90 px-10 py-8 text-indigo-200">
            <UploadCloud size={32} />
            <div className="text-sm font-semibold">Drop to import media</div>
          </div>
        </div>
      )}

      {restoring && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[#0b0b0d]">
          <div className="flex items-center gap-3 text-sm text-neutral-400">
            <div className="h-7 w-7 animate-pulse rounded-md bg-gradient-to-br from-indigo-500 to-violet-600" /> Loading Forge…
          </div>
        </div>
      )}

      {toast && (
        <div
          key={toast.id}
          className={cn(
            "toast-in fixed bottom-4 left-1/2 z-[450] flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-2xl",
            toast.kind === "success" && "border-emerald-500/30 bg-emerald-950/90 text-emerald-200",
            toast.kind === "error" && "border-red-500/30 bg-red-950/90 text-red-200",
            toast.kind === "info" && "border-white/10 bg-[#1c1c20] text-neutral-200"
          )}
        >
          {toast.kind === "success" ? <CheckCircle2 size={14} /> : toast.kind === "error" ? <AlertCircle size={14} /> : <Info size={14} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function Resizer({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return <div className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-indigo-500/40 active:bg-indigo-500/60" onPointerDown={onPointerDown} />;
}
