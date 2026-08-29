import { useState } from "react";
import { useEditorStore, newTextClipDefaults } from "../store/useEditorStore";
import { Undo2, Redo2, Type, FilePlus2, Download, Clapperboard, Keyboard, Accessibility } from "lucide-react";

const SHORTCUTS: [string, string][] = [
  ["Space", "Play / Pause"],
  ["S", "Split clip at playhead"],
  ["Delete", "Delete selected clip"],
  ["Ctrl/Cmd + D", "Duplicate selected clip"],
  ["Ctrl/Cmd + Z", "Undo"],
  ["Ctrl/Cmd + Shift + Z", "Redo"],
  ["← / →", "Nudge playhead 1 frame"],
  ["Shift + ← / →", "Nudge playhead 5s"],
  ["+ / -", "Zoom timeline in/out"],
  ["Esc", "Deselect clip"],
  ["Ctrl/Cmd + Shit + Q + Q", "Commit Tax Evasion"],
  ["J / K / L", "Shuttle reverse / pause / forward"],
  ["F", "Toggle fullscreen preview"],
];

export default function TopBar({ onExport, onAccessibility }: { onExport: () => void; onAccessibility: () => void }) {
  const projectName = useEditorStore((s) => s.projectName);
  const setProjectName = useEditorStore((s) => s.setProjectName);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const past = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);
  const newProject = useEditorStore((s) => s.newProject);
  const tracks = useEditorStore((s) => s.tracks);
  const addTrack = useEditorStore((s) => s.addTrack);
  const addClip = useEditorStore((s) => s.addClip);
  const currentTime = useEditorStore((s) => s.currentTime);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(projectName);
  const [showShortcuts, setShowShortcuts] = useState(false);

  function addTitleClip() {
    let textTrack = tracks.find((t) => t.type === "text" && !t.locked);
    const trackId = textTrack ? textTrack.id : addTrack("text");
    addClip(trackId, newTextClipDefaults(trackId, currentTime));
  }

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-4">
      <div className="flex items-center gap-2 text-indigo-400">
        <Clapperboard size={20} />
        <span className="hidden text-sm font-bold tracking-tight text-white sm:inline">Forge NLE</span>
      </div>
      <div className="h-5 w-px bg-neutral-800" />
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            setEditing(false);
            setProjectName(name || "Untitled Project");
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="rounded bg-neutral-800 px-2 py-1 text-xs text-white outline-none"
        />
      ) : (
        <button onClick={() => setEditing(true)} className="text-xs text-neutral-300 hover:text-white">
          {projectName}
        </button>
      )}

      <div className="mx-1 h-5 w-px bg-neutral-800" />
      <button className="toolbar-btn" onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)">
        <Undo2 size={13} />
      </button>
      <button className="toolbar-btn" onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Shift+Z)">
        <Redo2 size={13} />
      </button>
      <button className="toolbar-btn" onClick={addTitleClip} title="Add text/title clip">
        <Type size={13} /> Add Text
      </button>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative">
          <button className="toolbar-btn" onClick={() => setShowShortcuts((v) => !v)} title="Keyboard shortcuts">
            <Keyboard size={13} />
          </button>
          {showShortcuts && (
            <>
              <div className="fixed inset-0 z-[150]" onClick={() => setShowShortcuts(false)} />
              <div className="absolute right-0 top-8 z-[160] w-64 rounded-lg border border-neutral-700 bg-neutral-850 bg-neutral-800 p-3 shadow-2xl">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  Keyboard Shortcuts
                </h3>
                <div className="space-y-1.5">
                  {SHORTCUTS.map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between text-[11px]">
                      <span className="text-neutral-400">{desc}</span>
                      <kbd className="rounded bg-neutral-700 px-1.5 py-0.5 font-mono text-[10px] text-neutral-200">{key}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <button className="toolbar-btn" onClick={() => confirm("Start a new project? Unsaved work will be lost.") && newProject()}>
          <FilePlus2 size={13} /> New
        </button>

                <button className="toolbar-btn" onClick={onAccessibility} title="Accessibility settings">
          <Accessibility size={13} />
        </button>
        
        <button
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
          onClick={onExport}
        >
          <Download size={13} /> Export
        </button>
      </div>
    </div>
  );
}
