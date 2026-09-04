import { useEditorStore } from "../../store/useEditorStore";
import { RESOLUTION_PRESETS } from "../../types";
import { Section, Row, NumberField, Select, ColorField, Segmented } from "../ui/controls";
import { formatDuration, getProjectDuration } from "../../lib/utils";
import { Clapperboard } from "lucide-react";

export default function ProjectSettingsPanel() {
  const settings = useEditorStore((s) => s.settings);
  const updateSettings = useEditorStore((s) => s.updateSettings);
  const projectName = useEditorStore((s) => s.projectName);
  const setProjectName = useEditorStore((s) => s.setProjectName);
  const duration = useEditorStore((s) => getProjectDuration(s.tracks));
  const clipCount = useEditorStore((s) => s.tracks.reduce((n, t) => n + t.clips.length, 0));
  const assetCount = useEditorStore((s) => s.mediaAssets.length);
  const presetLabel = RESOLUTION_PRESETS.find((p) => p.width === settings.width && p.height === settings.height)?.label ?? "custom";

  return (
    <div className="text-xs">
      <div className="border-b border-white/5 px-3 py-3">
        <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          <Clapperboard size={12} /> Project
        </div>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full rounded bg-transparent px-1 text-[13px] font-semibold text-white outline-none hover:bg-white/5 focus:bg-white/5"
        />
        <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
          <div className="rounded bg-white/[0.03] px-2 py-1"><div className="text-neutral-500">Length</div><div className="font-mono text-neutral-200">{formatDuration(duration)}</div></div>
          <div className="rounded bg-white/[0.03] px-2 py-1"><div className="text-neutral-500">Clips</div><div className="font-mono text-neutral-200">{clipCount}</div></div>
          <div className="rounded bg-white/[0.03] px-2 py-1"><div className="text-neutral-500">Media</div><div className="font-mono text-neutral-200">{assetCount}</div></div>
        </div>
      </div>
      <Section title="Format">
        <Row label="Preset">
          <Select
            value={presetLabel}
            onChange={(v) => {
              const p = RESOLUTION_PRESETS.find((x) => x.label === v);
              if (p) updateSettings({ width: p.width, height: p.height });
            }}
            options={[{ value: "custom", label: "Custom" }, ...RESOLUTION_PRESETS.map((p) => ({ value: p.label, label: p.label, group: p.group }))]}
          />
        </Row>
        <Row label="Size">
          <NumberField value={settings.width} min={16} max={7680} step={2} onChange={(v) => updateSettings({ width: Math.round(v / 2) * 2 })} />
          <span className="text-neutral-600">×</span>
          <NumberField value={settings.height} min={16} max={4320} step={2} onChange={(v) => updateSettings({ height: Math.round(v / 2) * 2 })} />
        </Row>
        <Row label="Frame rate">
          <Segmented value={String(settings.fps) as any} onChange={(v) => updateSettings({ fps: Number(v) })} options={[{ value: "24", label: "24" }, { value: "25", label: "25" }, { value: "30", label: "30" }, { value: "50", label: "50" }, { value: "60", label: "60" }]} size="xs" className="w-full" />
        </Row>
        <Row label="Background">
          <ColorField value={settings.background} onChange={(v) => updateSettings({ background: v })} />
        </Row>
        <p className="mt-2 text-[10px] leading-relaxed text-neutral-600">
          Changing the format re-frames the composition. Clip transforms are in project pixels, so re-check positions after switching aspect ratio.
        </p>
      </Section>
      <Section title="Tips" defaultOpen={false}>
        <ul className="list-disc space-y-1 pl-4 text-[10px] leading-relaxed text-neutral-500">
          <li>Drag media to the timeline; video clips get linked audio automatically.</li>
          <li>Hold <b>Alt</b> while dragging to temporarily disable snapping.</li>
          <li>Drag on-canvas handles to position, scale and rotate a clip.</li>
          <li>Set in/out points with <b>I</b>/<b>O</b> to export a section.</li>
          <li>Ctrl/⌘ + scroll zooms the timeline at the cursor.</li>
        </ul>
      </Section>
    </div>
  );
}
