import { useState } from "react";
import { useEditorStore, LeftTab, useSelectedClip } from "../../store/useEditorStore";
import MediaBin from "./MediaBin";
import MotionLibrary from "./MotionLibrary";
import { ELEMENTS, LOOKS, TEXT_PRESETS, TRANSITIONS, applyLook, buildTextStyle, buildTextTransform, TextPreset } from "../../lib/presets";
import { FolderOpen, Type, Shapes, ArrowLeftRight, Palette, PanelLeftClose, Sparkles, Move3d } from "lucide-react";
import { cn } from "../../utils/cn";
import { TransitionType, defaultEffects } from "../../types";

const TABS: { id: LeftTab; label: string; icon: React.ReactNode }[] = [
  { id: "media", label: "Media", icon: <FolderOpen size={15} /> },
  { id: "text", label: "Text", icon: <Type size={15} /> },
  { id: "elements", label: "Elements", icon: <Shapes size={15} /> },
  { id: "transitions", label: "Transitions", icon: <ArrowLeftRight size={15} /> },
  { id: "looks", label: "Looks", icon: <Palette size={15} /> },
  { id: "motion", label: "Motion", icon: <Move3d size={15} /> },
];

export default function LibraryPanel() {
  const tab = useEditorStore((s) => s.leftTab);
  const setTab = useEditorStore((s) => s.setLeftTab);
  const toggle = useEditorStore((s) => s.toggleLeftPanel);
  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[52px] shrink-0 flex-col items-center gap-0.5 border-r border-white/5 bg-[#0f0f11] py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            title={t.label}
            className={cn(
              "flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[9px] transition-colors",
              tab === t.id ? "bg-white/[0.07] text-white" : "text-neutral-500 hover:bg-white/5 hover:text-neutral-200"
            )}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
        <button onClick={toggle} className="mt-auto flex h-8 w-8 items-center justify-center rounded text-neutral-600 hover:text-white" title="Hide panel">
          <PanelLeftClose size={14} />
        </button>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#121214]">
        <div className="flex h-9 shrink-0 items-center border-b border-white/5 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{TABS.find((t) => t.id === tab)?.label}</div>
        <div className="min-h-0 flex-1">
          {tab === "media" && <MediaBin />}
          {tab === "text" && <TextLibrary />}
          {tab === "elements" && <ElementsLibrary />}
          {tab === "transitions" && <TransitionsLibrary />}
          {tab === "looks" && <LooksLibrary />}
          {tab === "motion" && <MotionLibrary />}
        </div>
      </div>
    </div>
  );
}

// ── Text ────────────────────────────────────────────────────────────────────

function TextLibrary() {
  const addTextClip = useEditorStore((s) => s.addTextClip);
  const [cat, setCat] = useState<"All" | TextPreset["category"]>("All");
  const cats: ("All" | TextPreset["category"])[] = ["All", "Titles", "Lower Thirds", "Captions", "Social", "Emphasis"];
  const list = TEXT_PRESETS.filter((p) => cat === "All" || p.category === cat);
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-white/5 px-2 py-1.5">
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={cn("rounded px-2 py-0.5 text-[10px] font-medium", cat === c ? "bg-white/10 text-white" : "text-neutral-500 hover:text-white")}>
            {c}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <button
          onClick={() => addTextClip()}
          className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 py-2.5 text-[11px] text-neutral-300 hover:border-indigo-400 hover:text-white"
        >
          <Type size={13} /> Add plain text
        </button>
        <div className="grid grid-cols-2 gap-2">
          {list.map((p) => (
            <button
              key={p.id}
              onClick={() => addTextClip(buildTextStyle(p), buildTextTransform(p), p.duration ?? 4, p.name)}
              className="group flex flex-col overflow-hidden rounded-lg border border-white/5 bg-white/[0.03] text-left transition-colors hover:border-indigo-500/60"
              title={`Add "${p.name}" at playhead`}
            >
              <div className="flex aspect-video items-center justify-center overflow-hidden px-2" style={{ background: p.preview.bg }}>
                <span
                  className="truncate text-center leading-tight"
                  style={{
                    color: p.preview.fg,
                    fontFamily: `"${p.preview.font}", Inter, sans-serif`,
                    fontWeight: p.preview.weight,
                    fontSize: p.preview.size,
                    fontStyle: p.preview.italic ? "italic" : "normal",
                    background: p.preview.box,
                    padding: p.preview.box ? "3px 8px" : 0,
                    borderRadius: p.preview.box ? 4 : 0,
                  }}
                >
                  {p.preview.sample}
                </span>
              </div>
              <div className="flex items-center justify-between px-1.5 py-1">
                <span className="truncate text-[10px] text-neutral-300">{p.name}</span>
                <span className="text-[9px] text-neutral-600">{p.category}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Elements ────────────────────────────────────────────────────────────────

function ElementsLibrary() {
  const addSolidClip = useEditorStore((s) => s.addSolidClip);
  const groups = Array.from(new Set(ELEMENTS.map((e) => e.group ?? "Basics")));
  return (
    <div className="h-full overflow-y-auto p-2">
      <p className="mb-2 px-1 text-[10px] leading-relaxed text-neutral-500">
        Solids, gradients and shapes. Use them as backgrounds, overlays (try blend modes) or design accents. <b className="text-neutral-300">Overlays</b> are punch-in flashes, accent bars and outlines for high-energy edits.
      </p>
      {groups.map((g) => (
        <div key={g} className="mb-3">
          <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{g}</div>
          <div className="grid grid-cols-3 gap-2">
            {ELEMENTS.filter((el) => (el.group ?? "Basics") === g).map((el) => (
              <button
                key={el.id}
                onClick={() => {
                  const s = useEditorStore.getState();
                  if (el.id === "letterbox") {
                    // Two bars top/bottom
                    const barH = ((1 - (s.settings.width / 2.39) / s.settings.height) / 2) * 100;
                    const off = (s.settings.height / 2) * (1 - barH / 100);
                    addSolidClip({ color: "#000", width: 100, height: barH }, "Letterbox top", { transform: { x: 0, y: -off, scale: 1, rotation: 0 } });
                    addSolidClip({ color: "#000", width: 100, height: barH }, "Letterbox bottom", { transform: { x: 0, y: off, scale: 1, rotation: 0 } });
                    return;
                  }
                  if (el.id === "accent-bars") {
                    // Accent strip top + bottom (gameplay-style frame)
                    const off = (s.settings.height / 2) * (1 - el.height / 100);
                    addSolidClip({ color: el.color, width: 100, height: el.height, cornerRadius: 0 }, "Accent bar top", { transform: { x: 0, y: -off, scale: 1, rotation: 0 } });
                    addSolidClip({ color: el.color, width: 100, height: el.height, cornerRadius: 0 }, "Accent bar bottom", { transform: { x: 0, y: off, scale: 1, rotation: 0 } });
                    return;
                  }
                  const solid: Parameters<typeof addSolidClip>[0] = {
                    color: el.color,
                    gradient: el.gradient,
                    shape: el.shape,
                    width: el.width,
                    height: el.height,
                    cornerRadius: el.cornerRadius,
                    strokeWidth: el.strokeWidth,
                    strokeColor: el.strokeColor,
                  };
                  if (el.id === "ring") {
                    // keep it a true circle regardless of frame aspect
                    solid.height = (el.width * s.settings.width) / s.settings.height;
                  }
                  addSolidClip(solid, el.name, {
                    ...(el.duration !== undefined ? { duration: el.duration } : {}),
                    ...(el.opacity !== undefined || el.fadeIn !== undefined || el.fadeOut !== undefined
                      ? { effects: { ...defaultEffects(), opacity: el.opacity ?? 100, fadeIn: el.fadeIn ?? 0, fadeOut: el.fadeOut ?? 0 } }
                      : {}),
                  });
                }}
                className="group flex flex-col overflow-hidden rounded-lg border border-white/5 bg-white/[0.03] text-left hover:border-indigo-500/60"
                title={`Add ${el.name} at playhead`}
              >
                <div className="relative flex aspect-square items-center justify-center bg-[repeating-conic-gradient(#2a2a2e_0_25%,#1b1b1f_0_50%)] bg-[length:12px_12px] p-2">
                  {el.id === "letterbox" ? (
                    <div className="relative h-full w-full bg-neutral-700">
                      <div className="absolute inset-x-0 top-0 h-[18%] bg-black" />
                      <div className="absolute inset-x-0 bottom-0 h-[18%] bg-black" />
                    </div>
                  ) : el.id === "accent-bars" ? (
                    <div className="relative h-full w-full bg-neutral-700">
                      <div className="absolute inset-x-0 top-0 h-[12%] bg-red-500" />
                      <div className="absolute inset-x-0 bottom-0 h-[12%] bg-red-500" />
                    </div>
                  ) : el.strokeWidth ? (
                    <div
                      style={{
                        width: "58%",
                        height: "58%",
                        borderRadius: "50%",
                        border: `${Math.max(2, el.strokeWidth / 3)}px solid ${el.strokeColor ?? "#fff"}`,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: `${Math.max(12, Math.min(100, el.width))}%`,
                        height: `${Math.max(12, Math.min(100, el.height))}%`,
                        background: el.gradient ? `linear-gradient(${el.gradient.angle}deg, ${el.gradient.from}, ${el.gradient.to})` : el.color,
                        borderRadius: el.shape === "ellipse" ? "50%" : Math.min(el.cornerRadius / 4, 20),
                        opacity: el.opacity !== undefined && el.duration !== undefined ? Math.max(0.35, el.opacity / 100) : el.opacity !== undefined ? el.opacity / 100 : 1,
                        boxShadow: "0 0 0 1px rgba(255,255,255,0.1)",
                      }}
                    />
                  )}
                </div>
                <div className="truncate px-1.5 py-1 text-[10px] text-neutral-300">{el.name}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Transitions ─────────────────────────────────────────────────────────────

function TransitionsLibrary() {
  const sel = useSelectedClip();
  const setClipTransition = useEditorStore((s) => s.setClipTransition);
  const notify = useEditorStore((s) => s.notify);
  const selectedIds = useEditorStore((s) => s.selectedClipIds);
  const [dur, setDur] = useState(0.6);
  const groups = Array.from(new Set(TRANSITIONS.map((t) => t.group)));
  const eligible = sel && sel.track.type === "video";

  function apply(type: TransitionType) {
    const s = useEditorStore.getState();
    const targets = s.selectedClipIds.length ? s.selectedClipIds : sel ? [sel.clip.id] : [];
    const videoTargets = targets.filter((id) => s.tracks.some((t) => t.type === "video" && t.clips.some((c) => c.id === id)));
    if (!videoTargets.length) {
      notify("Select a clip on a video track first", "error");
      return;
    }
    for (const id of videoTargets) setClipTransition(id, { type, duration: dur });
    notify(`Applied ${TRANSITIONS.find((t) => t.type === type)?.name} to ${videoTargets.length} clip${videoTargets.length > 1 ? "s" : ""}`, "success");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/5 px-3 py-2">
        <p className="text-[10px] leading-relaxed text-neutral-500">
          Transitions play at the <b className="text-neutral-300">start</b> of the selected clip and blend from whatever precedes it on the same track.
        </p>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-neutral-400">
          <span>Duration</span>
          <input type="range" min={0.1} max={3} step={0.05} value={dur} onChange={(e) => setDur(Number(e.target.value))} className="fx-slider flex-1" style={{ ["--pct" as any]: `${((dur - 0.1) / 2.9) * 100}%` }} />
          <span className="w-8 font-mono text-neutral-200">{dur.toFixed(2)}s</span>
        </div>
      </div>
      {!eligible && selectedIds.length === 0 && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[10px] text-amber-300">Select a video clip on the timeline to apply.</div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <button
          onClick={() => sel && setClipTransition(sel.clip.id, undefined)}
          disabled={!eligible}
          className="mb-2 w-full rounded-md border border-white/10 py-1.5 text-[10px] text-neutral-400 hover:text-white disabled:opacity-40"
        >
          Remove transition from selected
        </button>
        {groups.map((g) => (
          <div key={g} className="mb-3">
            <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{g}</div>
            <div className="grid grid-cols-2 gap-2">
              {TRANSITIONS.filter((t) => t.group === g).map((t) => (
                <button
                  key={t.type}
                  onClick={() => apply(t.type)}
                  className={cn(
                    "group flex flex-col overflow-hidden rounded-lg border bg-white/[0.03] text-left transition-colors hover:border-indigo-500/60",
                    sel?.clip.transitionIn?.type === t.type ? "border-indigo-500" : "border-white/5"
                  )}
                >
                  <TransitionPreview type={t.type} />
                  <div className="truncate px-1.5 py-1 text-[10px] text-neutral-300">{t.name}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransitionPreview({ type }: { type: TransitionType }) {
  const cls = `tp tp-${type}`;
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-sky-600 to-indigo-800">
      <div className={cn("absolute inset-0 bg-gradient-to-br from-rose-500 to-amber-500", cls)} />
    </div>
  );
}

// ── Looks ───────────────────────────────────────────────────────────────────

function LooksLibrary() {
  const sel = useSelectedClip();
  const selectedIds = useEditorStore((s) => s.selectedClipIds);
  const updateClips = useEditorStore((s) => s.updateClips);
  const notify = useEditorStore((s) => s.notify);
  const active = sel?.clip.effects.lookId ?? "none";
  const previewSrc = useEditorStore((s) => {
    const a = sel?.clip.mediaId ? s.mediaAssets.find((m) => m.id === sel.clip.mediaId) : undefined;
    return a?.thumbnail;
  });

  function apply(lookId: string) {
    const look = LOOKS.find((l) => l.id === lookId)!;
    const ids = selectedIds.length ? selectedIds : sel ? [sel.clip.id] : [];
    if (!ids.length) {
      notify("Select a clip first", "error");
      return;
    }
    updateClips(ids, (c) => ({ effects: applyLook(c.effects, look) }));
    notify(`Applied "${look.name}"`, "success");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/5 px-3 py-2 text-[10px] leading-relaxed text-neutral-500">
        One-click color grades. Fine-tune afterwards in the <b className="text-neutral-300">Color</b> tab of the inspector.
      </div>
      {!sel && <div className="border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[10px] text-amber-300">Select a clip on the timeline to apply a look.</div>}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {LOOKS.map((l) => (
            <button
              key={l.id}
              onClick={() => apply(l.id)}
              className={cn("group flex flex-col overflow-hidden rounded-lg border bg-white/[0.03] text-left transition-colors hover:border-indigo-500/60", active === l.id ? "border-indigo-500" : "border-white/5")}
              title={l.description}
            >
              <div className="relative aspect-video w-full overflow-hidden" style={{ background: `linear-gradient(135deg, ${l.swatch[0]}, ${l.swatch[1]})` }}>
                {previewSrc ? (
                  <img src={previewSrc} alt="" className="h-full w-full object-cover" style={{ filter: lookFilter(l.effects) }} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white/60">
                    <Sparkles size={16} />
                  </div>
                )}
                {l.effects.vignette ? <div className="pointer-events-none absolute inset-0" style={{ boxShadow: `inset 0 0 ${l.effects.vignette}px rgba(0,0,0,${l.effects.vignette / 100})` }} /> : null}
              </div>
              <div className="px-1.5 py-1">
                <div className="truncate text-[10px] text-neutral-200">{l.name}</div>
                <div className="truncate text-[9px] text-neutral-600">{l.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function lookFilter(fx: Partial<import("../../types").ClipEffects>) {
  const parts: string[] = [];
  const b = (fx.brightness ?? 100) * Math.pow(2, (fx.exposure ?? 0) / 100);
  if (b !== 100) parts.push(`brightness(${b}%)`);
  if (fx.contrast && fx.contrast !== 100) parts.push(`contrast(${fx.contrast}%)`);
  if (fx.saturation && fx.saturation !== 100) parts.push(`saturate(${fx.saturation}%)`);
  if (fx.sepia) parts.push(`sepia(${fx.sepia}%)`);
  if (fx.grayscale) parts.push(`grayscale(${fx.grayscale}%)`);
  if (fx.hue) parts.push(`hue-rotate(${fx.hue}deg)`);
  if (fx.temperature) parts.push(`sepia(${Math.abs(fx.temperature) / 4}%) hue-rotate(${fx.temperature > 0 ? -8 : 170}deg) saturate(${100 + Math.abs(fx.temperature) / 3}%)`);
  return parts.join(" ") || "none";
}
