import { useRef, useState } from "react";
import { useEditorStore } from "../store/useEditorStore";
import { Undo2, Redo2, Type, FilePlus2, Download, Keyboard, Accessibility, Save, FolderOpen, ChevronDown, Check, Cloud, PanelLeft, PanelRight, Square, Bookmark } from "lucide-react";
import { IconBtn, Kbd } from "./ui/controls";
import { SHORTCUTS } from "../hooks/useKeyboardShortcuts";
import { exportProjectFile, importProjectFile, resetEverything, saveNow } from "../lib/project";
import { modKey } from "../lib/utils";
import { cn } from "../utils/cn";

interface Props {
  onExport: () => void;
  onAccessibility: () => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (v: boolean) => void;
}

export default function TopBar({ onExport, onAccessibility, shortcutsOpen, setShortcutsOpen }: Props) {
  const projectName = useEditorStore((s) => s.projectName);
  const setProjectName = useEditorStore((s) => s.setProjectName);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.past.length > 0 || s.pending !== null);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const dirty = useEditorStore((s) => s.dirty);
  const addTextClip = useEditorStore((s) => s.addTextClip);
  const addSolidClip = useEditorStore((s) => s.addSolidClip);
  const addMarker = useEditorStore((s) => s.addMarker);
  const leftOpen = useEditorStore((s) => s.leftPanelOpen);
  const rightOpen = useEditorStore((s) => s.rightPanelOpen);
  const toggleLeft = useEditorStore((s) => s.toggleLeftPanel);
  const toggleRight = useEditorStore((s) => s.toggleRightPanel);
  const notify = useEditorStore((s) => s.notify);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(projectName);
  const [fileMenu, setFileMenu] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const mod = modKey();
  const groups = Array.from(new Set(SHORTCUTS.map((s) => s.group)));

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/5 bg-[#131316] px-3">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-black text-white shadow-lg shadow-indigo-500/30">F</div>
        <span className="hidden text-[13px] font-bold tracking-tight text-white md:inline">Forge</span>
      </div>

      {/* File menu */}
      <div className="relative">
        <button onClick={() => setFileMenu((v) => !v)} className={cn("flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-neutral-300 hover:bg-white/5 hover:text-white", fileMenu && "bg-white/5 text-white")}>
          File <ChevronDown size={11} />
        </button>
        {fileMenu && (
          <>
            <div className="fixed inset-0 z-[150]" onClick={() => setFileMenu(false)} />
            <div className="absolute left-0 top-8 z-[160] w-60 rounded-lg border border-white/10 bg-[#1c1c20] py-1 text-xs shadow-2xl">
              <MenuItem icon={<FilePlus2 size={12} />} label="New project" onClick={() => { if (confirm("Start a new project? The current one is autosaved but will be replaced.")) { useEditorStore.getState().newProject(); saveNow(); } setFileMenu(false); }} />
              <MenuItem icon={<FolderOpen size={12} />} label="Open project file…" onClick={() => { fileInput.current?.click(); setFileMenu(false); }} />
              <MenuItem icon={<Save size={12} />} label="Save" kbd={`${mod}S`} onClick={() => { saveNow(); notify("Project saved in this browser", "success"); setFileMenu(false); }} />
              <MenuItem icon={<Download size={12} />} label="Download project file (.forge.json)" onClick={() => { exportProjectFile(); setFileMenu(false); }} />
              <div className="my-1 h-px bg-white/5" />
              <MenuItem icon={<Download size={12} />} label="Export video…" kbd={`${mod}E`} onClick={() => { onExport(); setFileMenu(false); }} />
              <div className="my-1 h-px bg-white/5" />
              <MenuItem icon={<Cloud size={12} />} label="Clear local storage & reset" danger onClick={async () => { if (confirm("This deletes the autosaved project and all cached media in this browser. Continue?")) await resetEverything(); setFileMenu(false); }} />
            </div>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              await importProjectFile(f);
              notify(`Opened ${f.name}`, "success");
            } catch (err: any) {
              notify(err?.message || "Could not open project", "error");
            }
          }}
        />
      </div>

      <div className="h-5 w-px bg-white/10" />

      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            setEditing(false);
            setProjectName(name.trim() || "Untitled Project");
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-7 rounded-md border border-indigo-500 bg-neutral-900 px-2 text-xs text-white outline-none"
        />
      ) : (
        <button
          onClick={() => {
            setName(projectName);
            setEditing(true);
          }}
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-neutral-200 hover:bg-white/5"
          title="Rename project"
        >
          {projectName}
          <span className={cn("flex items-center gap-1 text-[10px]", dirty ? "text-neutral-500" : "text-emerald-500/80")} title={dirty ? "Unsaved changes (autosaves shortly)" : "All changes saved locally"}>
            {dirty ? "•" : <Check size={10} />}
          </span>
        </button>
      )}

      <div className="mx-1 h-5 w-px bg-white/10" />
      <IconBtn onClick={undo} disabled={!canUndo} title={`Undo (${mod}Z)`}>
        <Undo2 size={14} />
      </IconBtn>
      <IconBtn onClick={redo} disabled={!canRedo} title={`Redo (${mod}⇧Z)`}>
        <Redo2 size={14} />
      </IconBtn>
      <div className="mx-1 h-5 w-px bg-white/10" />
      <button className="toolbar-btn" onClick={() => addTextClip()} title="Add a title at the playhead">
        <Type size={12} /> Text
      </button>
      <button className="toolbar-btn" onClick={() => addSolidClip({ color: "#000000" }, "Solid")} title="Add a solid color layer">
        <Square size={12} /> Solid
      </button>
      <button className="toolbar-btn" onClick={() => addMarker()} title="Add marker (M)">
        <Bookmark size={12} /> Marker
      </button>

      <div className="ml-auto flex items-center gap-1">
        <IconBtn onClick={toggleLeft} active={leftOpen} title="Toggle library panel">
          <PanelLeft size={14} />
        </IconBtn>
        <IconBtn onClick={toggleRight} active={rightOpen} title="Toggle inspector">
          <PanelRight size={14} />
        </IconBtn>
        <div className="relative">
          <IconBtn onClick={() => setShortcutsOpen(!shortcutsOpen)} active={shortcutsOpen} title="Keyboard shortcuts (?)">
            <Keyboard size={14} />
          </IconBtn>
          {shortcutsOpen && (
            <>
              <div className="fixed inset-0 z-[150]" onClick={() => setShortcutsOpen(false)} />
              <div className="absolute right-0 top-9 z-[160] max-h-[80vh] w-[560px] overflow-y-auto rounded-xl border border-white/10 bg-[#1c1c20] p-4 shadow-2xl">
                <h3 className="mb-3 text-xs font-semibold text-white">Keyboard shortcuts</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {groups.map((g) => (
                    <div key={g}>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{g}</div>
                      <div className="space-y-1">
                        {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                          <div key={s.keys} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-neutral-400">{s.label}</span>
                            <Kbd>{s.keys.replace(/Mod/g, mod)}</Kbd>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <IconBtn onClick={onAccessibility} title="Accessibility settings">
          <Accessibility size={14} />
        </IconBtn>
        <button
          className="ml-1 flex h-8 items-center gap-1.5 rounded-md bg-indigo-500 px-3 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition-colors hover:bg-indigo-400"
          onClick={onExport}
          title={`Export (${mod}E)`}
        >
          <Download size={13} /> Export
        </button>
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, kbd, danger }: { icon: React.ReactNode; label: string; onClick: () => void; kbd?: string; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-neutral-200 hover:bg-white/5", danger && "text-red-400 hover:bg-red-500/10")}>
      <span className="text-neutral-500">{icon}</span>
      <span className="flex-1">{label}</span>
      {kbd && <span className="font-mono text-[10px] text-neutral-600">{kbd}</span>}
    </button>
  );
}
