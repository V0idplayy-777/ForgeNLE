import { useEditorStore } from "../../store/useEditorStore";
import { defaultEffects, defaultTextStyle } from "../../types";
import { formatTimecode } from "../../lib/utils";
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, RotateCcw, Sliders } from "lucide-react";

const FONTS = ["Inter, sans-serif", "Georgia, serif", "'Courier New', monospace", "'Poppins', sans-serif", "'Times New Roman', serif", "Impact, sans-serif"];

export default function PropertiesPanel() {
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const tracks = useEditorStore((s) => s.tracks);
  const mediaAssets = useEditorStore((s) => s.mediaAssets);
  const updateClip = useEditorStore((s) => s.updateClip);
  const updateClipEffects = useEditorStore((s) => s.updateClipEffects);
  const commitHistory = useEditorStore((s) => s.commitHistory);

  const clip = tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId);
  const track = tracks.find((t) => t.clips.some((c) => c.id === selectedClipId));
  const asset = clip ? mediaAssets.find((m) => m.id === clip.mediaId) : undefined;

  if (!clip || !track) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-neutral-600">
        <Sliders size={22} className="text-neutral-700" />
        <p>Select a clip on the timeline to edit its properties, effects and text.</p>
      </div>
    );
  }

  const fx = clip.effects;

  function setFx(patch: Partial<typeof fx>) {
    updateClipEffects(clip!.id, patch);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto text-xs">
      <div className="border-b border-neutral-800 p-3">
        <input
          value={clip.name}
          onChange={(e) => updateClip(clip.id, { name: e.target.value }, false)}
          onBlur={commitHistory}
          className="w-full rounded bg-neutral-800 px-2 py-1 text-[12px] font-semibold text-white outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-neutral-500">
          <div>Start: {formatTimecode(clip.start)}</div>
          <div>Duration: {formatTimecode(clip.duration)}</div>
          {asset && <div className="col-span-2">Source: {asset.name}</div>}
        </div>
      </div>

      {clip.text && (
        <Section title="Text">
          <textarea
            value={clip.text.content}
            onChange={(e) => updateClip(clip.id, { text: { ...clip.text!, content: e.target.value } }, false)}
            onBlur={commitHistory}
            rows={2}
            className="w-full resize-none rounded bg-neutral-800 px-2 py-1 text-white outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={clip.text.color}
              onChange={(e) => updateClip(clip.id, { text: { ...clip.text!, color: e.target.value } }, false)}
              className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent"
            />
            <select
              value={clip.text.fontFamily}
              onChange={(e) => updateClip(clip.id, { text: { ...clip.text!, fontFamily: e.target.value } })}
              className="flex-1 rounded bg-neutral-800 px-1 py-1 text-white outline-none"
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {f.split(",")[0].replace(/'/g, "")}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex items-center gap-1">
            <ToggleIconBtn active={clip.text.bold} onClick={() => updateClip(clip.id, { text: { ...clip.text!, bold: !clip.text!.bold } })}>
              <Bold size={12} />
            </ToggleIconBtn>
            <ToggleIconBtn active={clip.text.italic} onClick={() => updateClip(clip.id, { text: { ...clip.text!, italic: !clip.text!.italic } })}>
              <Italic size={12} />
            </ToggleIconBtn>
            <ToggleIconBtn active={clip.text.align === "left"} onClick={() => updateClip(clip.id, { text: { ...clip.text!, align: "left" } })}>
              <AlignLeft size={12} />
            </ToggleIconBtn>
            <ToggleIconBtn active={clip.text.align === "center"} onClick={() => updateClip(clip.id, { text: { ...clip.text!, align: "center" } })}>
              <AlignCenter size={12} />
            </ToggleIconBtn>
            <ToggleIconBtn active={clip.text.align === "right"} onClick={() => updateClip(clip.id, { text: { ...clip.text!, align: "right" } })}>
              <AlignRight size={12} />
            </ToggleIconBtn>
            <ToggleIconBtn active={clip.text.outline} onClick={() => updateClip(clip.id, { text: { ...clip.text!, outline: !clip.text!.outline } })}>
              Shadow
            </ToggleIconBtn>
          </div>
          <Slider label="Font size" value={clip.text.fontSize} min={10} max={160} step={1} onChange={(v) => updateClip(clip.id, { text: { ...clip.text!, fontSize: v } }, false)} onCommit={commitHistory} />
          <div className="mt-2 flex items-center gap-2">
            <span className="w-16 text-neutral-500">Background</span>
            <button
              onClick={() =>
                updateClip(clip.id, {
                  text: { ...clip.text!, background: clip.text!.background === "transparent" ? "rgba(0,0,0,0.55)" : "transparent" },
                })
              }
              className="rounded bg-neutral-800 px-2 py-1 text-[10px] text-neutral-300 hover:text-white"
            >
              {clip.text.background === "transparent" ? "Add box" : "Remove box"}
            </button>
          </div>
          <Slider label="Position X" value={clip.text.x} min={0} max={100} step={1} onChange={(v) => updateClip(clip.id, { text: { ...clip.text!, x: v } }, false)} onCommit={commitHistory} />
          <Slider label="Position Y" value={clip.text.y} min={0} max={100} step={1} onChange={(v) => updateClip(clip.id, { text: { ...clip.text!, y: v } }, false)} onCommit={commitHistory} />
          <button
            onClick={() => updateClip(clip.id, { text: defaultTextStyle() })}
            className="mt-2 flex items-center gap-1 text-[10px] text-neutral-500 hover:text-white"
          >
            <RotateCcw size={10} /> Reset text style
          </button>
        </Section>
      )}

      <Section title="Timing & Audio">
        <Slider label="Speed" value={fx.speed} min={0.25} max={4} step={0.05} unit="x" onChange={(v) => setFx({ speed: v })} />
        <Slider label="Volume" value={fx.volume} min={0} max={200} step={1} unit="%" onChange={(v) => setFx({ volume: v })} />
        <Slider label="Fade in" value={fx.fadeIn} min={0} max={Math.min(5, clip.duration / 2)} step={0.05} unit="s" onChange={(v) => setFx({ fadeIn: v })} />
        <Slider label="Fade out" value={fx.fadeOut} min={0} max={Math.min(5, clip.duration / 2)} step={0.05} unit="s" onChange={(v) => setFx({ fadeOut: v })} />
      </Section>

      <Section title="Color & Effects">
        <Slider label="Brightness" value={fx.brightness} min={0} max={200} step={1} unit="%" onChange={(v) => setFx({ brightness: v })} />
        <Slider label="Contrast" value={fx.contrast} min={0} max={200} step={1} unit="%" onChange={(v) => setFx({ contrast: v })} />
        <Slider label="Saturation" value={fx.saturation} min={0} max={200} step={1} unit="%" onChange={(v) => setFx({ saturation: v })} />
        <Slider label="Hue" value={fx.hue} min={0} max={360} step={1} unit="°" onChange={(v) => setFx({ hue: v })} />
        <Slider label="Blur" value={fx.blur} min={0} max={20} step={0.5} unit="px" onChange={(v) => setFx({ blur: v })} />
        <Slider label="Grayscale" value={fx.grayscale} min={0} max={100} step={1} unit="%" onChange={(v) => setFx({ grayscale: v })} />
        <Slider label="Sepia" value={fx.sepia} min={0} max={100} step={1} unit="%" onChange={(v) => setFx({ sepia: v })} />
        <Slider label="Invert" value={fx.invert} min={0} max={100} step={1} unit="%" onChange={(v) => setFx({ invert: v })} />
        <Slider label="Opacity" value={fx.opacity} min={0} max={100} step={1} unit="%" onChange={(v) => setFx({ opacity: v })} />
        <button
          onClick={() => setFx(defaultEffects())}
          className="mt-1 flex items-center gap-1 text-[10px] text-neutral-500 hover:text-white"
        >
          <RotateCcw size={10} /> Reset effects
        </button>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-neutral-800 p-3">
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{title}</h3>
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
  onCommit?: () => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="w-20 shrink-0 text-neutral-500">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
        className="flex-1 accent-indigo-500"
      />
      <span className="w-12 shrink-0 text-right font-mono text-[10px] text-neutral-400">
        {Math.round(value * 100) / 100}
        {unit}
      </span>
    </div>
  );
}

function ToggleIconBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-1.5 py-1 text-[10px] ${active ? "bg-indigo-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"}`}
    >
      {children}
    </button>
  );
}
