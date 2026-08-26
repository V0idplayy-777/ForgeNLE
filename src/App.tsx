import { useState } from "react";
import TopBar from "./components/TopBar";
import MediaBin from "./components/panels/MediaBin";
import PropertiesPanel from "./components/panels/PropertiesPanel";
import PreviewPlayer from "./components/preview/PreviewPlayer";
import Timeline from "./components/timeline/Timeline";
import ExportModal from "./components/panels/ExportModal";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

export default function App() {
  useKeyboardShortcuts();
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-950 text-neutral-100">
      <TopBar onExport={() => setExportOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <div className="flex w-64 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/40">
          <div className="flex items-center border-b border-neutral-800 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Media Library
          </div>
          <div className="min-h-0 flex-1">
            <MediaBin />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <PreviewPlayer />
          <Timeline />
        </div>

        <div className="w-72 shrink-0 border-l border-neutral-800 bg-neutral-900/40">
          <div className="flex items-center border-b border-neutral-800 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Properties
          </div>
          <div className="h-[calc(100%-33px)]">
            <PropertiesPanel />
          </div>
        </div>
      </div>

      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}
    </div>
  );
}
