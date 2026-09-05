import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useEditorStore, useSelectedClip } from "../../store/useEditorStore";
import { COMPOSE_LAYOUTS, ComposeLayoutId, MOTION_PRESETS, MotionPresetId } from "../../lib/motion";
import { Btn, SliderRow } from "../ui/controls";
import { cn } from "../../utils/cn";
import { Move3d, Grid2x2, Eraser } from "lucide-react";

/** Selected ids that live on video tracks (motion/compose targets). */
function useVideoSelection() {
  return useEditorStore(
    useShallow((s) => s.selectedClipIds.filter((id) => s.tracks.some((t) => t.type === "video" && t.clips.some((c) => c.id === id))))
  );
}

export default function MotionLibrary() {
  const sel = useSelectedClip();
  const selectedIds = useVideoSelection();
  const [strength, setStrength] = useState(100);
  const [gap, setGap] = useState(0.8);

  const groups = Array.from(new Set(MOTION_PRESETS.map((p) => p.group)));

  function applyMotion(id: MotionPresetId) {
    const s = useEditorStore.getState();
    const targets = s.selectedClipIds.length ? s.selectedClipIds : sel ? [sel.clip.id] : [];
    if (!targets.length) {
      s.notify("Select a clip on a video track first", "error");
      return;
    }
    s.applyMotionPreset(targets, id, strength / 100);
    const def = MOTION_PRESETS.find((p) => p.id === id);
    s.notify(`${def?.name ?? "Motion"} applied to ${targets.length} clip${targets.length > 1 ? "s" : ""} — tweak it in the Keyframes tab`, "success");
  }

  function applyCompose(id: ComposeLayoutId) {
    const s = useEditorStore.getState();
    const targets = s.selectedClipIds;
    if (targets.length < 1) {
      s.notify("Select the clips you want in the composition", "error");
      return;
    }
    s.applyComposeLayout(targets, id, { gap });
    const def = COMPOSE_LAYOUTS.find((l) => l.id === id);
    const count = Math.min(targets.length, def?.slots ?? targets.length);
    s.notify(`${def?.name}: arranged ${count} clip${count > 1 ? "s" : ""} (order = topmost track first)`, "success");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/5 px-3 py-2">
        <p className="text-[10px] leading-relaxed text-neutral-500">
          One-click <b className="text-neutral-300">keyframed camera moves</b> and <b className="text-neutral-300">split-screen layouts</b> for the selected clips. Everything lands as editable keyframes.
        </p>
      </div>
      {selectedIds.length === 0 && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[10px] text-amber-300">Select a clip on the timeline to apply.</div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {/* ── Camera moves ── */}
        <div className="mb-1 flex items-center gap-2 px-1">
          <Move3d size={11} className="text-neutral-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Camera moves</span>
          <span className="ml-auto text-[9px] text-neutral-600">{selectedIds.length || (sel ? 1 : 0)} selected</span>
        </div>
        <div className="mb-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2 pt-1">
          <SliderRow label="Strength" value={strength} min={30} max={200} step={5} unit="%" defaultValue={100} onChange={setStrength} />
        </div>
        {groups.map((g) => (
          <div key={g} className="mb-2">
            <div className="mb-1 px-1 text-[9px] font-medium uppercase tracking-wider text-neutral-600">{g}</div>
            <div className="grid grid-cols-3 gap-1.5">
              {MOTION_PRESETS.filter((p) => p.group === g).map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyMotion(p.id)}
                  className="group flex flex-col overflow-hidden rounded-lg border border-white/5 bg-white/[0.03] text-left transition-colors hover:border-indigo-500/60"
                  title={p.hint}
                >
                  <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br from-neutral-800 to-neutral-900">
                    <div className="mp-dot">
                      <div className={cn("mp-box", p.previewClass)} />
                    </div>
                  </div>
                  <div className="truncate px-1 py-1 text-[10px] text-neutral-300">{p.name}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
        <Btn
          variant="ghost"
          className="mb-4 w-full"
          disabled={!selectedIds.length && !sel}
          onClick={() => {
            const s = useEditorStore.getState();
            const targets = s.selectedClipIds.length ? s.selectedClipIds : sel ? [sel.clip.id] : [];
            s.clearMotion(targets);
            s.notify("Motion keyframes cleared", "info");
          }}
        >
          <Eraser size={12} /> Clear motion keyframes
        </Btn>

        {/* ── Compose ── */}
        <div className="mb-1 flex items-center gap-2 px-1">
          <Grid2x2 size={11} className="text-neutral-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Compose</span>
        </div>
        <p className="mb-1.5 px-1 text-[10px] leading-relaxed text-neutral-600">
          Arrange the selected clips into a layout — great for gameplay + facecam. Clips fill their pane exactly (cover-cropped). Order = topmost track first.
        </p>
        <div className="mb-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2 pt-1">
          <SliderRow label="Gap" value={gap} min={0} max={4} step={0.2} unit="%" defaultValue={0.8} onChange={setGap} />
        </div>
        <div className="mb-2 grid grid-cols-2 gap-1.5">
          {COMPOSE_LAYOUTS.map((l) => (
            <button
              key={l.id}
              onClick={() => applyCompose(l.id)}
              className="group flex flex-col overflow-hidden rounded-lg border border-white/5 bg-white/[0.03] text-left transition-colors hover:border-indigo-500/60"
              title={l.hint}
            >
              <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900 p-2.5">
                <ComposePreview id={l.id} />
              </div>
              <div className="px-1.5 py-1">
                <div className="truncate text-[10px] text-neutral-300">{l.name}</div>
                <div className="truncate text-[9px] text-neutral-600">{l.hint}</div>
              </div>
            </button>
          ))}
        </div>
        <Btn
          variant="ghost"
          className="mb-4 w-full"
          disabled={!selectedIds.length && !sel}
          onClick={() => {
            const s = useEditorStore.getState();
            const targets = s.selectedClipIds.length ? s.selectedClipIds : sel ? [sel.clip.id] : [];
            s.resetCompose(targets);
            s.notify("Transform, fit and crop reset to full frame", "info");
          }}
        >
          <Eraser size={12} /> Reset layout (full frame)
        </Btn>
      </div>
    </div>
  );
}

function ComposePreview({ id }: { id: ComposeLayoutId }) {
  const cell = "rounded-[2px] bg-indigo-400/70";
  const box = "flex h-full w-full gap-[2px]";
  switch (id) {
    case "side-by-side":
      return (
        <div className={cn(box, "flex-row")}>
          <div className={cn(cell, "flex-1")} />
          <div className={cn(cell, "flex-1")} />
        </div>
      );
    case "stacked":
      return (
        <div className={cn(box, "flex-col")}>
          <div className={cn(cell, "flex-1")} />
          <div className={cn(cell, "flex-1")} />
        </div>
      );
    case "grid-2x2":
      return (
        <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-[2px]">
          <div className={cell} />
          <div className={cell} />
          <div className={cell} />
          <div className={cell} />
        </div>
      );
    case "pip":
      return (
        <div className="relative h-full w-full">
          <div className={cn(cell, "h-full w-full")} />
          <div className="absolute bottom-[8%] right-[8%] h-[28%] w-[30%] rounded-[3px] bg-amber-400/80" />
        </div>
      );
    case "triptych":
      return (
        <div className={cn(box, "flex-row")}>
          <div className={cn(cell, "flex-1")} />
          <div className={cn(cell, "flex-1")} />
          <div className={cn(cell, "flex-1")} />
        </div>
      );
    case "spotlight":
      return (
        <div className={cn(box, "flex-row")}>
          <div className={cn(cell, "w-[62%]")} />
          <div className="flex flex-1 flex-col gap-[2px]">
            <div className={cn(cell, "flex-1")} />
            <div className={cn(cell, "flex-1")} />
          </div>
        </div>
      );
  }
}
