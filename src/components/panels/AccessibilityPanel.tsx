import { useEditorStore } from "../../store/useEditorStore";
import { Accessibility, Contrast, Type, Zap } from "lucide-react";

export default function AccessibilityPanel({ onClose }: { onClose: () => void }) {
  const highContrast = useEditorStore((s) => s.highContrast);
  const reduceMotion = useEditorStore((s) => s.reduceMotion);
  const largeUI = useEditorStore((s) => s.largeUI);
  const toggleHighContrast = useEditorStore((s) => s.toggleHighContrast);
  const toggleReduceMotion = useEditorStore((s) => s.toggleReduceMotion);
  const toggleLargeUI = useEditorStore((s) => s.toggleLargeUI);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Accessibility settings"
    >
      <div className="w-[360px] rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Accessibility size={16} /> Accessibility
          </h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="space-y-3">
          <button
            onClick={toggleHighContrast}
            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-xs ${
              highContrast
                ? "border-indigo-500 bg-indigo-600/20 text-white"
                : "border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:bg-neutral-800"
            }`}
            aria-pressed={highContrast}
          >
            <Contrast size={16} />
            <div>
              <div className="font-medium">High contrast</div>
              <div className="text-[10px] text-neutral-500">Stronger borders and text contrast</div>
            </div>
          </button>
          <button
            onClick={toggleReduceMotion}
            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-xs ${
              reduceMotion
                ? "border-indigo-500 bg-indigo-600/20 text-white"
                : "border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:bg-neutral-800"
            }`}
            aria-pressed={reduceMotion}
          >
            <Zap size={16} />
            <div>
              <div className="font-medium">Reduce motion</div>
              <div className="text-[10px] text-neutral-500">Disable non-essential animations</div>
            </div>
          </button>
          <button
            onClick={toggleLargeUI}
            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-xs ${
              largeUI
                ? "border-indigo-500 bg-indigo-600/20 text-white"
                : "border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:bg-neutral-800"
            }`}
            aria-pressed={largeUI}
          >
            <Type size={16} />
            <div>
              <div className="font-medium">Larger UI</div>
              <div className="text-[10px] text-neutral-500">Increase text and control sizes</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
