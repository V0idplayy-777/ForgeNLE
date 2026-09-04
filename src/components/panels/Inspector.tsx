import { useEditorStore, RightTab, useSelectedClip } from "../../store/useEditorStore";
import { AnimProp, BLEND_MODES, Clip, Track, TextAnim, defaultChromaKey, defaultCrop, defaultEffects, defaultMask, defaultTextStyle, defaultTransform } from "../../types";
import { Section, Row, SliderRow, NumberField, Select, Toggle, Segmented, ColorField, Btn, Empty } from "../ui/controls";
import { FONTS, LOOKS, TRANSITIONS, WEIGHT_LABELS, applyLook, fontWeightsFor, transitionName } from "../../lib/presets";
import { evaluateClip, hasKeyframes, keyframeAt } from "../../lib/keyframes";
import { formatTimecode, clamp } from "../../lib/utils";
import { SlidersHorizontal, Palette, Volume2, Diamond, PanelRightClose, AlignLeft, AlignCenter, AlignRight, Italic, CaseUpper, Link2, Trash2, MousePointerClick, Info, Music4, Scissors, Copy, Pipette, Layers, Activity } from "lucide-react";
import { cn } from "../../utils/cn";
import ProjectSettingsPanel from "./ProjectSettingsPanel";
import KeyframeEditor from "./KeyframeEditor";
import { useState } from "react";
import { analyseBeats, decodeForAnalysis, thinBeats, BeatAnalysis } from "../../lib/beats";

const TABS: { id: RightTab; label: string; icon: React.ReactNode }[] = [
  { id: "inspector", label: "Inspector", icon: <SlidersHorizontal size={14} /> },
  { id: "color", label: "Color", icon: <Palette size={14} /> },
  { id: "audio", label: "Audio", icon: <Volume2 size={14} /> },
  { id: "keyframes", label: "Keyframes", icon: <Diamond size={14} /> },
];

export default function Inspector() {
  const tab = useEditorStore((s) => s.rightTab);
  const setTab = useEditorStore((s) => s.setRightTab);
  const toggle = useEditorStore((s) => s.toggleRightPanel);
  const found = useSelectedClip();
  const multi = useEditorStore((s) => s.selectedClipIds.length);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#121214]">
      <div className="flex h-9 shrink-0 items-center border-b border-white/5 px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex h-full flex-1 items-center justify-center gap-1.5 border-b-2 text-[11px] font-medium transition-colors",
              tab === t.id ? "border-indigo-500 text-white" : "border-transparent text-neutral-500 hover:text-neutral-200"
            )}
            title={t.label}
          >
            {t.icon}
            <span className="hidden xl:inline">{t.label}</span>
          </button>
        ))}
        <button onClick={toggle} className="ml-1 flex h-7 w-7 items-center justify-center rounded text-neutral-600 hover:text-white" title="Hide panel">
          <PanelRightClose size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!found ? (
          <div className="flex h-full flex-col">
            {tab === "inspector" ? (
              <ProjectSettingsPanel />
            ) : (
              <Empty icon={<MousePointerClick size={28} strokeWidth={1.25} />} title={multi > 1 ? `${multi} clips selected` : "Nothing selected"} hint="Select a clip on the timeline to edit its properties." />
            )}
          </div>
        ) : tab === "inspector" ? (
          <ClipInspector clip={found.clip} track={found.track} />
        ) : tab === "color" ? (
          <ColorPanel clip={found.clip} track={found.track} />
        ) : tab === "audio" ? (
          <AudioPanel clip={found.clip} track={found.track} />
        ) : (
          <KeyframeEditor clip={found.clip} track={found.track} />
        )}
      </div>
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

function ClipHeader({ clip, track }: { clip: Clip; track: Track }) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const commitHistory = useEditorStore((s) => s.commitHistory);
  const fps = useEditorStore((s) => s.settings.fps);
  const asset = useEditorStore((s) => (clip.mediaId ? s.mediaAssets.find((m) => m.id === clip.mediaId) : undefined));
  const multi = useEditorStore((s) => s.selectedClipIds.length);
  const removeClips = useEditorStore((s) => s.removeClips);
  const duplicateClips = useEditorStore((s) => s.duplicateClips);
  const splitAtTime = useEditorStore((s) => s.splitAtTime);
  const currentTime = useEditorStore((s) => s.currentTime);
  return (
    <div className="border-b border-white/5 px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: clip.color }} />
        <input
          value={clip.name}
          onChange={(e) => updateClip(clip.id, { name: e.target.value }, false)}
          onBlur={commitHistory}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full min-w-0 rounded bg-transparent px-1 text-[13px] font-semibold text-white outline-none hover:bg-white/5 focus:bg-white/5"
        />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
        <Stat label="Start" value={formatTimecode(clip.start, fps).slice(3)} />
        <Stat label="Duration" value={formatTimecode(clip.duration, fps).slice(3)} />
        <Stat label="End" value={formatTimecode(clip.start + clip.duration, fps).slice(3)} />
      </div>
      {asset && (
        <div className="mt-1.5 flex items-center gap-1 truncate text-[10px] text-neutral-500">
          <Info size={10} /> {asset.name}
          {asset.width ? ` · ${asset.width}×${asset.height}` : ""} · {track.name}
        </div>
      )}
      {clip.kind === "adjustment" && (
        <div className="mt-1.5 flex items-start gap-1.5 rounded bg-purple-500/10 px-2 py-1.5 text-[10px] text-purple-200">
          <Layers size={11} className="mt-px shrink-0" />
          <span>Adjustment layer — its Color grade, mask and opacity apply to every layer beneath it on the timeline.</span>
        </div>
      )}
      {multi > 1 && <div className="mt-1.5 rounded bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-300">{multi} clips selected — edits apply to the primary clip.</div>}
      <div className="mt-2 flex gap-1">
        <Btn variant="ghost" onClick={() => splitAtTime(currentTime, [clip.id])} title="Split at playhead (S)">
          <Scissors size={12} /> Split
        </Btn>
        <Btn variant="ghost" onClick={() => duplicateClips([clip.id])} title="Duplicate">
          <Copy size={12} /> Duplicate
        </Btn>
        <Btn variant="ghost" onClick={() => removeClips([clip.id])} title="Delete" className="ml-auto text-red-400 hover:bg-red-500/10 hover:text-red-300">
          <Trash2 size={12} />
        </Btn>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-white/[0.03] px-2 py-1">
      <div className="text-neutral-500">{label}</div>
      <div className="font-mono text-neutral-200">{value}</div>
    </div>
  );
}

// ── Keyframe helpers ────────────────────────────────────────────────────────

function useKf(clip: Clip) {
  const currentTime = useEditorStore((s) => s.currentTime);
  const toggleKeyframe = useEditorStore((s) => s.toggleKeyframe);
  const setKeyframeValue = useEditorStore((s) => s.setKeyframeValue);
  const local = clamp(currentTime - clip.start, 0, clip.duration);
  const anim = evaluateClip(clip, local);
  return {
    local,
    anim,
    kfProps: (prop: AnimProp) => ({
      active: !!keyframeAt(clip.keyframes, prop, local),
      has: hasKeyframes(clip, prop),
      onToggle: () => toggleKeyframe(clip.id, prop),
    }),
    /** Returns a setter that writes to a keyframe when the property is animated, else to the base value. */
    setter: (prop: AnimProp, base: (v: number) => void) => (v: number) => {
      if (hasKeyframes(clip, prop)) setKeyframeValue(clip.id, prop, v);
      else base(v);
    },
    value: (prop: AnimProp, base: number) => (hasKeyframes(clip, prop) ? anim[prop] : base),
  };
}

// ── Inspector tab ───────────────────────────────────────────────────────────

function ClipInspector({ clip, track }: { clip: Clip; track: Track }) {
  const s = useEditorStore;
  const updateClip = s((x) => x.updateClip);
  const updateClipTransform = s((x) => x.updateClipTransform);
  const updateClipCrop = s((x) => x.updateClipCrop);
  const updateClipEffects = s((x) => x.updateClipEffects);
  const setClipSpeed = s((x) => x.setClipSpeed);
  const setClipTransition = s((x) => x.setClipTransition);
  const setClipBlendMode = s((x) => x.setClipBlendMode);
  const commitHistory = s((x) => x.commitHistory);
  const unlinkClips = s((x) => x.unlinkClips);
  const detachAudio = s((x) => x.detachAudio);
  const settings = s((x) => x.settings);
  const asset = s((x) => (clip.mediaId ? x.mediaAssets.find((m) => m.id === clip.mediaId) : undefined));
  const kf = useKf(clip);
  const isVideoTrack = track.type === "video";
  const isMedia = clip.kind === "media";
  const canSpeed = isMedia && asset?.type !== "image";

  return (
    <div className="text-xs">
      <ClipHeader clip={clip} track={track} />

      {clip.kind === "text" && <TextSection clip={clip} />}
      {clip.kind === "solid" && <SolidSection clip={clip} />}

      {isVideoTrack && (
        <Section title="Transform" onReset={() => { updateClipTransform(clip.id, defaultTransform(), true); }}>
          <SliderRow label="Position X" value={kf.value("x", clip.transform.x)} min={-settings.width} max={settings.width} step={1} unit="px" defaultValue={0} onChange={kf.setter("x", (v) => updateClipTransform(clip.id, { x: v }))} onCommit={commitHistory} keyframe={kf.kfProps("x")} />
          <SliderRow label="Position Y" value={kf.value("y", clip.transform.y)} min={-settings.height} max={settings.height} step={1} unit="px" defaultValue={0} onChange={kf.setter("y", (v) => updateClipTransform(clip.id, { y: v }))} onCommit={commitHistory} keyframe={kf.kfProps("y")} />
          <SliderRow label="Scale" value={Math.round(kf.value("scale", clip.transform.scale) * 100)} min={1} max={400} step={1} unit="%" defaultValue={100} onChange={kf.setter("scale", (v) => updateClipTransform(clip.id, { scale: v / 100 }))} onCommit={commitHistory} keyframe={{ ...kf.kfProps("scale"), onToggle: () => s.getState().toggleKeyframe(clip.id, "scale") }} />
          <SliderRow label="Rotation" value={kf.value("rotation", clip.transform.rotation)} min={-180} max={180} step={0.5} unit="°" defaultValue={0} onChange={kf.setter("rotation", (v) => updateClipTransform(clip.id, { rotation: v }))} onCommit={commitHistory} keyframe={kf.kfProps("rotation")} />
          <SliderRow label="Opacity" value={kf.value("opacity", clip.effects.opacity)} min={0} max={100} step={1} unit="%" defaultValue={100} onChange={kf.setter("opacity", (v) => updateClipEffects(clip.id, { opacity: v }))} onCommit={commitHistory} keyframe={kf.kfProps("opacity")} />
          {isMedia && (
            <>
              <Row label="Fit">
                <Segmented value={clip.fit} onChange={(v) => updateClip(clip.id, { fit: v })} options={[{ value: "contain", label: "Fit" }, { value: "cover", label: "Fill" }, { value: "stretch", label: "Stretch" }, { value: "none", label: "1:1" }]} size="xs" className="w-full" />
              </Row>
              <SliderRow label="Corners" value={clip.cornerRadius} min={0} max={Math.min(settings.width, settings.height) / 2} step={1} unit="px" defaultValue={0} onChange={(v) => updateClip(clip.id, { cornerRadius: v }, false)} onCommit={commitHistory} />
            </>
          )}
          <Row label="Blend">
            <Select value={clip.blendMode} onChange={(v) => setClipBlendMode(clip.id, v)} options={BLEND_MODES} />
          </Row>
          <div className="mt-1 grid grid-cols-3 gap-1">
            <Btn variant="ghost" onClick={() => updateClipTransform(clip.id, { x: 0, y: 0 }, true)}>Center</Btn>
            <Btn variant="ghost" onClick={() => updateClip(clip.id, { fit: "cover", transform: { ...clip.transform, scale: 1, x: 0, y: 0 } })}>Fill frame</Btn>
            <Btn variant="ghost" onClick={() => updateClipTransform(clip.id, { rotation: 0, scale: 1 }, true)}>Reset size</Btn>
          </div>
        </Section>
      )}

      {isVideoTrack && isMedia && (
        <Section title="Crop" defaultOpen={false} onReset={() => updateClipCrop(clip.id, defaultCrop(), true)}>
          <SliderRow label="Left" value={clip.crop.left} min={0} max={95} step={0.5} unit="%" defaultValue={0} onChange={(v) => updateClipCrop(clip.id, { left: Math.min(v, 99 - clip.crop.right) })} onCommit={commitHistory} />
          <SliderRow label="Right" value={clip.crop.right} min={0} max={95} step={0.5} unit="%" defaultValue={0} onChange={(v) => updateClipCrop(clip.id, { right: Math.min(v, 99 - clip.crop.left) })} onCommit={commitHistory} />
          <SliderRow label="Top" value={clip.crop.top} min={0} max={95} step={0.5} unit="%" defaultValue={0} onChange={(v) => updateClipCrop(clip.id, { top: Math.min(v, 99 - clip.crop.bottom) })} onCommit={commitHistory} />
          <SliderRow label="Bottom" value={clip.crop.bottom} min={0} max={95} step={0.5} unit="%" defaultValue={0} onChange={(v) => updateClipCrop(clip.id, { bottom: Math.min(v, 99 - clip.crop.top) })} onCommit={commitHistory} />
        </Section>
      )}

      {isVideoTrack && isMedia && <ChromaKeySection clip={clip} />}
      {isVideoTrack && <MaskSection clip={clip} />}

      <Section title="Timing">
        {canSpeed && (
          <>
            <Row label="Speed">
              <NumberField value={clip.speed} min={0.1} max={8} step={0.05} precision={2} unit="×" onChange={(v) => setClipSpeed(clip.id, v)} />
              <Segmented
                value={String(clip.speed) as any}
                onChange={(v) => setClipSpeed(clip.id, Number(v))}
                options={[{ value: "0.5", label: "½×" }, { value: "1", label: "1×" }, { value: "2", label: "2×" }, { value: "4", label: "4×" }]}
                size="xs"
                className="w-[130px]"
              />
            </Row>
            <Row label="Source in">
              <NumberField value={clip.trimIn} min={0} max={Math.max(0, (asset?.duration ?? 0) - 0.1)} step={0.01} precision={2} unit="s" onChange={(v) => updateClip(clip.id, { trimIn: v }, false)} onCommit={commitHistory} />
            </Row>
          </>
        )}
        <Row label="Duration">
          <NumberField
            value={clip.duration}
            min={0.05}
            max={canSpeed && asset ? (asset.duration - clip.trimIn) / clip.speed : 3600}
            step={0.05}
            precision={2}
            unit="s"
            onChange={(v) => updateClip(clip.id, { duration: v }, false)}
            onCommit={() => {
              commitHistory();
              s.getState().resolveOverlaps([clip.id]);
            }}
          />
        </Row>
        {isVideoTrack && (
          <>
            <SliderRow label="Fade in" value={clip.effects.fadeIn} min={0} max={Math.min(5, clip.duration)} step={0.05} unit="s" defaultValue={0} onChange={(v) => updateClipEffects(clip.id, { fadeIn: v })} onCommit={commitHistory} />
            <SliderRow label="Fade out" value={clip.effects.fadeOut} min={0} max={Math.min(5, clip.duration)} step={0.05} unit="s" defaultValue={0} onChange={(v) => updateClipEffects(clip.id, { fadeOut: v })} onCommit={commitHistory} />
          </>
        )}
        {clip.linkGroup && (
          <Row label="Linked">
            <span className="flex items-center gap-1 text-[10px] text-neutral-400"><Link2 size={10} /> moves with partner</span>
            <Btn variant="ghost" onClick={() => unlinkClips([clip.id])} className="ml-auto">Unlink</Btn>
          </Row>
        )}
        {isVideoTrack && isMedia && asset?.type === "video" && !clip.audioDetached && (
          <Btn variant="default" onClick={() => detachAudio(clip.id)} className="mt-1 w-full"><Music4 size={12} /> Detach audio to track</Btn>
        )}
      </Section>

      {isVideoTrack && (
        <Section title="Transition In">
          <Row label="Type">
            <Select
              value={clip.transitionIn?.type ?? "none"}
              onChange={(v) => setClipTransition(clip.id, v === "none" ? undefined : { type: v, duration: clip.transitionIn?.duration ?? 0.6 })}
              options={[{ value: "none" as const, label: "None" }, ...TRANSITIONS.map((t) => ({ value: t.type, label: t.name, group: t.group }))]}
            />
          </Row>
          {clip.transitionIn && clip.transitionIn.type !== "none" && (
            <SliderRow
              label="Duration"
              value={clip.transitionIn.duration}
              min={0.1}
              max={Math.min(4, clip.duration)}
              step={0.05}
              unit="s"
              onChange={(v) => updateClip(clip.id, { transitionIn: { type: clip.transitionIn!.type, duration: v } }, false)}
              onCommit={commitHistory}
            />
          )}
          <p className="mt-1 text-[10px] text-neutral-600">{clip.transitionIn?.type ? `${transitionName(clip.transitionIn.type)} blends from the previous clip on ${track.name}.` : "Blends from the previous clip on the same track."}</p>
        </Section>
      )}
    </div>
  );
}

// ── Text ────────────────────────────────────────────────────────────────────

const TEXT_ANIMS: { value: TextAnim; label: string }[] = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "slide-up", label: "Slide Up" },
  { value: "slide-down", label: "Slide Down" },
  { value: "slide-left", label: "Slide Left" },
  { value: "slide-right", label: "Slide Right" },
  { value: "scale", label: "Scale" },
  { value: "pop", label: "Pop" },
  { value: "blur", label: "Blur" },
  { value: "typewriter", label: "Typewriter" },
  { value: "reveal", label: "Reveal" },
];

function TextSection({ clip }: { clip: Clip }) {
  const updateClipText = useEditorStore((s) => s.updateClipText);
  const commitHistory = useEditorStore((s) => s.commitHistory);
  const t = clip.text ?? defaultTextStyle();
  const set = (patch: Partial<typeof t>, rec = false) => updateClipText(clip.id, patch, rec);
  const weights = fontWeightsFor(t.fontFamily);
  return (
    <>
      <Section title="Text" onReset={() => updateClipText(clip.id, { ...defaultTextStyle(), content: t.content }, true)}>
        <textarea
          value={t.content}
          onChange={(e) => set({ content: e.target.value })}
          onBlur={commitHistory}
          onKeyDown={(e) => e.stopPropagation()}
          rows={3}
          className="mb-2 w-full resize-y rounded-md border border-white/5 bg-white/[0.04] px-2 py-1.5 text-[12px] text-white outline-none focus:border-indigo-500"
          placeholder="Type your text…"
        />
        <Row label="Font">
          <Select value={t.fontFamily} onChange={(v) => { const w = fontWeightsFor(v); set({ fontFamily: v, fontWeight: w.includes(t.fontWeight) ? t.fontWeight : w[w.length - 1] }, true); }} options={FONTS.map((f) => ({ value: f.family, label: f.label, group: f.category === "sans" ? "Sans" : f.category === "serif" ? "Serif" : f.category === "display" ? "Display" : "Mono" }))} />
        </Row>
        <Row label="Weight">
          <Select value={String(t.fontWeight)} onChange={(v) => set({ fontWeight: Number(v) }, true)} options={weights.map((w) => ({ value: String(w), label: WEIGHT_LABELS[w] ?? String(w) }))} />
          <button onClick={() => set({ italic: !t.italic }, true)} className={cn("flex h-6 w-7 shrink-0 items-center justify-center rounded border", t.italic ? "border-indigo-500 bg-indigo-500/20 text-white" : "border-white/5 text-neutral-400 hover:text-white")} title="Italic"><Italic size={12} /></button>
          <button onClick={() => set({ uppercase: !t.uppercase }, true)} className={cn("flex h-6 w-7 shrink-0 items-center justify-center rounded border", t.uppercase ? "border-indigo-500 bg-indigo-500/20 text-white" : "border-white/5 text-neutral-400 hover:text-white")} title="Uppercase"><CaseUpper size={13} /></button>
        </Row>
        <SliderRow label="Size" value={t.fontSize} min={8} max={400} step={1} unit="px" defaultValue={96} onChange={(v) => set({ fontSize: v })} onCommit={commitHistory} />
        <Row label="Align">
          <Segmented value={t.align} onChange={(v) => set({ align: v }, true)} options={[{ value: "left", label: <AlignLeft size={12} /> }, { value: "center", label: <AlignCenter size={12} /> }, { value: "right", label: <AlignRight size={12} /> }]} size="xs" className="w-full" />
        </Row>
        <Row label="Color">
          <ColorField value={t.color} onChange={(v) => set({ color: v })} onCommit={commitHistory} />
        </Row>
        <SliderRow label="Tracking" value={t.letterSpacing} min={-20} max={80} step={0.5} unit="px" defaultValue={0} onChange={(v) => set({ letterSpacing: v })} onCommit={commitHistory} />
        <SliderRow label="Leading" value={t.lineHeight} min={0.7} max={2.5} step={0.05} precision={2} defaultValue={1.15} onChange={(v) => set({ lineHeight: v })} onCommit={commitHistory} />
        <SliderRow label="Max width" value={t.maxWidth} min={10} max={100} step={1} unit="%" defaultValue={80} onChange={(v) => set({ maxWidth: v })} onCommit={commitHistory} />
      </Section>

      <Section title="Text Style" defaultOpen={false}>
        <SliderRow label="Stroke" value={t.strokeWidth} min={0} max={40} step={0.5} unit="px" defaultValue={0} onChange={(v) => set({ strokeWidth: v })} onCommit={commitHistory} />
        {t.strokeWidth > 0 && (
          <Row label="Stroke color">
            <ColorField value={t.strokeColor} onChange={(v) => set({ strokeColor: v })} onCommit={commitHistory} />
          </Row>
        )}
        <Row label="Shadow">
          <Toggle checked={t.shadow} onChange={(v) => set({ shadow: v }, true)} />
        </Row>
        {t.shadow && (
          <>
            <Row label="Shadow color">
              <ColorField value={t.shadowColor} onChange={(v) => set({ shadowColor: v })} onCommit={commitHistory} allowAlpha />
            </Row>
            <SliderRow label="Blur" value={t.shadowBlur} min={0} max={80} step={1} unit="px" defaultValue={24} onChange={(v) => set({ shadowBlur: v })} onCommit={commitHistory} />
            <SliderRow label="Offset X" value={t.shadowX} min={-60} max={60} step={1} unit="px" defaultValue={0} onChange={(v) => set({ shadowX: v })} onCommit={commitHistory} />
            <SliderRow label="Offset Y" value={t.shadowY} min={-60} max={60} step={1} unit="px" defaultValue={6} onChange={(v) => set({ shadowY: v })} onCommit={commitHistory} />
          </>
        )}
        <Row label="Background">
          <Toggle checked={t.boxEnabled} onChange={(v) => set({ boxEnabled: v }, true)} />
        </Row>
        {t.boxEnabled && (
          <>
            <Row label="Box color">
              <ColorField value={t.boxColor} onChange={(v) => set({ boxColor: v })} onCommit={commitHistory} allowAlpha />
            </Row>
            <SliderRow label="Pad X" value={t.boxPaddingX} min={0} max={200} step={1} unit="px" defaultValue={36} onChange={(v) => set({ boxPaddingX: v })} onCommit={commitHistory} />
            <SliderRow label="Pad Y" value={t.boxPaddingY} min={0} max={200} step={1} unit="px" defaultValue={20} onChange={(v) => set({ boxPaddingY: v })} onCommit={commitHistory} />
            <SliderRow label="Radius" value={t.boxRadius} min={0} max={200} step={1} unit="px" defaultValue={12} onChange={(v) => set({ boxRadius: v })} onCommit={commitHistory} />
          </>
        )}
      </Section>

      <Section title="Text Animation">
        <Row label="In">
          <Select value={t.animIn} onChange={(v) => set({ animIn: v }, true)} options={TEXT_ANIMS} />
          <NumberField value={t.animInDuration} min={0.05} max={5} step={0.05} precision={2} unit="s" onChange={(v) => set({ animInDuration: v })} onCommit={commitHistory} className="w-[64px] shrink-0" />
        </Row>
        <Row label="Out">
          <Select value={t.animOut} onChange={(v) => set({ animOut: v }, true)} options={TEXT_ANIMS.filter((a) => a.value !== "typewriter")} />
          <NumberField value={t.animOutDuration} min={0.05} max={5} step={0.05} precision={2} unit="s" onChange={(v) => set({ animOutDuration: v })} onCommit={commitHistory} className="w-[64px] shrink-0" />
        </Row>
      </Section>
    </>
  );
}

// ── Solid ───────────────────────────────────────────────────────────────────

function SolidSection({ clip }: { clip: Clip }) {
  const updateClipSolid = useEditorStore((s) => s.updateClipSolid);
  const commitHistory = useEditorStore((s) => s.commitHistory);
  const sd = clip.solid!;
  const set = (patch: Partial<typeof sd>, rec = false) => updateClipSolid(clip.id, patch, rec);
  return (
    <Section title="Shape">
      <Row label="Shape">
        <Segmented value={sd.shape} onChange={(v) => set({ shape: v }, true)} options={[{ value: "rectangle", label: "Rectangle" }, { value: "ellipse", label: "Ellipse" }]} size="xs" className="w-full" />
      </Row>
      <Row label="Fill">
        <Segmented value={sd.gradient ? "gradient" : "solid"} onChange={(v) => set({ gradient: v === "gradient" ? sd.gradient ?? { from: sd.color, to: "#000000", angle: 180 } : undefined }, true)} options={[{ value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }]} size="xs" className="w-full" />
      </Row>
      {sd.gradient ? (
        <>
          <Row label="From"><ColorField value={sd.gradient.from} onChange={(v) => set({ gradient: { ...sd.gradient!, from: v } })} onCommit={commitHistory} allowAlpha /></Row>
          <Row label="To"><ColorField value={sd.gradient.to} onChange={(v) => set({ gradient: { ...sd.gradient!, to: v } })} onCommit={commitHistory} allowAlpha /></Row>
          <SliderRow label="Angle" value={sd.gradient.angle} min={0} max={360} step={1} unit="°" defaultValue={180} onChange={(v) => set({ gradient: { ...sd.gradient!, angle: v } })} onCommit={commitHistory} />
        </>
      ) : (
        <Row label="Color"><ColorField value={sd.color} onChange={(v) => set({ color: v })} onCommit={commitHistory} allowAlpha /></Row>
      )}
      <SliderRow label="Width" value={sd.width} min={0.5} max={200} step={0.5} unit="%" defaultValue={100} onChange={(v) => set({ width: v })} onCommit={commitHistory} />
      <SliderRow label="Height" value={sd.height} min={0.5} max={200} step={0.5} unit="%" defaultValue={100} onChange={(v) => set({ height: v })} onCommit={commitHistory} />
      {sd.shape === "rectangle" && <SliderRow label="Radius" value={sd.cornerRadius} min={0} max={500} step={1} unit="px" defaultValue={0} onChange={(v) => set({ cornerRadius: v })} onCommit={commitHistory} />}
    </Section>
  );
}

// ── Chroma key ──────────────────────────────────────────────────────────────

function ChromaKeySection({ clip }: { clip: Clip }) {
  const updateClipChromaKey = useEditorStore((s) => s.updateClipChromaKey);
  const commitHistory = useEditorStore((s) => s.commitHistory);
  const notify = useEditorStore((s) => s.notify);
  const key = clip.chromaKey ?? defaultChromaKey();
  const set = (p: Partial<typeof key>) => updateClipChromaKey(clip.id, p);

  /** Samples the key colour from the centre of the preview canvas (or wherever the user last clicked). */
  function pickFromPreview() {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-preview-stage] canvas");
    if (!canvas) return;
    notify("Click a point on the preview to sample the key colour", "info");
    const onClick = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - r.left) / r.width) * canvas.width);
      const y = Math.floor(((e.clientY - r.top) / r.height) * canvas.height);
      try {
        const d = canvas.getContext("2d")!.getImageData(x, y, 1, 1).data;
        const hex = "#" + [d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, "0")).join("");
        updateClipChromaKey(clip.id, { color: hex, enabled: true }, true);
        notify(`Key colour set to ${hex}`, "success");
      } catch {
        notify("Couldn't read the preview pixel", "error");
      }
      e.stopPropagation();
      e.preventDefault();
      canvas.removeEventListener("click", onClick, true);
    };
    canvas.addEventListener("click", onClick, true);
  }

  return (
    <Section
      title="Chroma key"
      defaultOpen={key.enabled}
      right={<Toggle checked={key.enabled} onChange={(v) => updateClipChromaKey(clip.id, { enabled: v }, true)} />}
      onReset={() => updateClipChromaKey(clip.id, { ...defaultChromaKey(), enabled: key.enabled }, true)}
    >
      <Row label="Key colour">
        <ColorField value={key.color} onChange={(v) => set({ color: v })} onCommit={commitHistory} />
        <Btn variant="ghost" onClick={pickFromPreview} title="Sample from preview">
          <Pipette size={12} />
        </Btn>
      </Row>
      <div className="mb-2 grid grid-cols-3 gap-1">
        {[
          ["Green", "#00ff00"],
          ["Blue", "#0000ff"],
          ["White", "#ffffff"],
        ].map(([label, hex]) => (
          <Btn key={hex} variant="ghost" onClick={() => updateClipChromaKey(clip.id, { color: hex, enabled: true }, true)}>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-white/20" style={{ background: hex }} /> {label}
          </Btn>
        ))}
      </div>
      <SliderRow label="Similarity" value={key.similarity} min={0} max={100} step={1} unit="%" defaultValue={32} onChange={(v) => set({ similarity: v })} onCommit={commitHistory} />
      <SliderRow label="Smoothness" value={key.smoothness} min={0} max={100} step={1} unit="%" defaultValue={12} onChange={(v) => set({ smoothness: v })} onCommit={commitHistory} />
      <SliderRow label="Spill" value={key.spill} min={0} max={100} step={1} unit="%" defaultValue={50} onChange={(v) => set({ spill: v })} onCommit={commitHistory} />
      {!key.enabled && <p className="text-[10px] text-neutral-500">Removes a green/blue screen so layers beneath show through. Enable, then tune Similarity until the backdrop disappears.</p>}
    </Section>
  );
}

// ── Mask ────────────────────────────────────────────────────────────────────

function MaskSection({ clip }: { clip: Clip }) {
  const updateClipMask = useEditorStore((s) => s.updateClipMask);
  const commitHistory = useEditorStore((s) => s.commitHistory);
  const settings = useEditorStore((s) => s.settings);
  const mask = clip.mask ?? defaultMask();
  const set = (p: Partial<typeof mask>) => updateClipMask(clip.id, p);
  const active = mask.shape !== "none";
  return (
    <Section title="Mask" defaultOpen={active || clip.kind === "adjustment"} onReset={() => updateClipMask(clip.id, defaultMask(), true)}>
      <Row label="Shape">
        <Segmented
          value={mask.shape}
          onChange={(v) => updateClipMask(clip.id, { shape: v }, true)}
          options={[
            { value: "none", label: "Off" },
            { value: "rectangle", label: "Rectangle" },
            { value: "ellipse", label: "Ellipse" },
          ]}
          size="xs"
          className="w-full"
        />
      </Row>
      {active && (
        <>
          <SliderRow label="Center X" value={mask.x} min={-100} max={100} step={0.5} unit="%" defaultValue={0} onChange={(v) => set({ x: v })} onCommit={commitHistory} />
          <SliderRow label="Center Y" value={mask.y} min={-100} max={100} step={0.5} unit="%" defaultValue={0} onChange={(v) => set({ y: v })} onCommit={commitHistory} />
          <SliderRow label="Width" value={mask.width} min={1} max={200} step={0.5} unit="%" defaultValue={60} onChange={(v) => set({ width: v })} onCommit={commitHistory} />
          <SliderRow label="Height" value={mask.height} min={1} max={200} step={0.5} unit="%" defaultValue={60} onChange={(v) => set({ height: v })} onCommit={commitHistory} />
          <SliderRow label="Rotation" value={mask.rotation} min={-180} max={180} step={0.5} unit="°" defaultValue={0} onChange={(v) => set({ rotation: v })} onCommit={commitHistory} />
          <SliderRow label="Feather" value={mask.feather} min={0} max={Math.round(Math.min(settings.width, settings.height) / 4)} step={1} unit="px" defaultValue={0} onChange={(v) => set({ feather: v })} onCommit={commitHistory} />
          {mask.shape === "rectangle" && <SliderRow label="Corners" value={mask.cornerRadius} min={0} max={Math.round(Math.min(settings.width, settings.height) / 2)} step={1} unit="px" defaultValue={0} onChange={(v) => set({ cornerRadius: v })} onCommit={commitHistory} />}
          <Row label="Invert">
            <Toggle checked={mask.invert} onChange={(v) => updateClipMask(clip.id, { invert: v }, true)} label="Show outside the shape instead" />
          </Row>
          <div className="mt-1 grid grid-cols-3 gap-1">
            <Btn variant="ghost" onClick={() => updateClipMask(clip.id, { shape: "ellipse", x: 0, y: 0, width: 40, height: 70, feather: 120 }, true)}>Spotlight</Btn>
            <Btn variant="ghost" onClick={() => updateClipMask(clip.id, { shape: "rectangle", x: 0, y: 0, width: 100, height: 75, feather: 0, cornerRadius: 0 }, true)}>Letterbox</Btn>
            <Btn variant="ghost" onClick={() => updateClipMask(clip.id, { shape: "rectangle", x: 0, y: 0, width: 50, height: 100, feather: 0 }, true)}>Split</Btn>
          </div>
        </>
      )}
      {!active && <p className="text-[10px] text-neutral-500">Reveal only part of this layer — vignettes, split screens, spotlight grades. The mask follows the clip's transform and keyframes.</p>}
    </Section>
  );
}

// ── Color tab ───────────────────────────────────────────────────────────────

function ColorPanel({ clip, track }: { clip: Clip; track: Track }) {
  const updateClipEffects = useEditorStore((s) => s.updateClipEffects);
  const updateClip = useEditorStore((s) => s.updateClip);
  const commitHistory = useEditorStore((s) => s.commitHistory);
  const fx = clip.effects;
  const set = (p: Partial<typeof fx>) => updateClipEffects(clip.id, p);
  if (track.type !== "video") return <Empty icon={<Palette size={28} strokeWidth={1.25} />} title="Audio clips have no color controls" />;
  return (
    <div className="text-xs">
      <ClipHeader clip={clip} track={track} />
      {clip.kind === "adjustment" && <MaskSection clip={clip} />}
      <Section title="Look">
        <div className="grid grid-cols-4 gap-1.5">
          {LOOKS.map((l) => (
            <button
              key={l.id}
              onClick={() => updateClip(clip.id, { effects: applyLook(clip.effects, l) })}
              className={cn("flex flex-col items-center gap-1 rounded-md border p-1 text-[9px]", (fx.lookId ?? "none") === l.id ? "border-indigo-500 bg-indigo-500/10 text-white" : "border-white/5 text-neutral-400 hover:border-white/20 hover:text-white")}
              title={l.description}
            >
              <span className="h-6 w-full rounded" style={{ background: `linear-gradient(135deg, ${l.swatch[0]}, ${l.swatch[1]})` }} />
              <span className="truncate w-full text-center">{l.name}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Basic" onReset={() => updateClipEffects(clip.id, { ...defaultEffects(), opacity: fx.opacity, fadeIn: fx.fadeIn, fadeOut: fx.fadeOut }, true)}>
        <SliderRow label="Exposure" value={fx.exposure} min={-100} max={100} step={1} defaultValue={0} onChange={(v) => set({ exposure: v })} onCommit={commitHistory} />
        <SliderRow label="Brightness" value={fx.brightness} min={0} max={200} step={1} unit="%" defaultValue={100} onChange={(v) => set({ brightness: v })} onCommit={commitHistory} />
        <SliderRow label="Contrast" value={fx.contrast} min={0} max={200} step={1} unit="%" defaultValue={100} onChange={(v) => set({ contrast: v })} onCommit={commitHistory} />
        <SliderRow label="Saturation" value={fx.saturation} min={0} max={200} step={1} unit="%" defaultValue={100} onChange={(v) => set({ saturation: v })} onCommit={commitHistory} />
        <SliderRow label="Temperature" value={fx.temperature} min={-100} max={100} step={1} defaultValue={0} onChange={(v) => set({ temperature: v })} onCommit={commitHistory} />
        <SliderRow label="Tint" value={fx.tint} min={-100} max={100} step={1} defaultValue={0} onChange={(v) => set({ tint: v })} onCommit={commitHistory} />
        <SliderRow label="Hue" value={fx.hue} min={-180} max={180} step={1} unit="°" defaultValue={0} onChange={(v) => set({ hue: v })} onCommit={commitHistory} />
      </Section>
      <Section title="Effects">
        <SliderRow label="Vignette" value={fx.vignette} min={0} max={100} step={1} unit="%" defaultValue={0} onChange={(v) => set({ vignette: v })} onCommit={commitHistory} />
        <SliderRow label="Blur" value={fx.blur} min={0} max={40} step={0.5} unit="px" defaultValue={0} onChange={(v) => set({ blur: v })} onCommit={commitHistory} />
        <SliderRow label="Grayscale" value={fx.grayscale} min={0} max={100} step={1} unit="%" defaultValue={0} onChange={(v) => set({ grayscale: v })} onCommit={commitHistory} />
        <SliderRow label="Sepia" value={fx.sepia} min={0} max={100} step={1} unit="%" defaultValue={0} onChange={(v) => set({ sepia: v })} onCommit={commitHistory} />
        <SliderRow label="Invert" value={fx.invert} min={0} max={100} step={1} unit="%" defaultValue={0} onChange={(v) => set({ invert: v })} onCommit={commitHistory} />
      </Section>
    </div>
  );
}

// ── Audio tab ───────────────────────────────────────────────────────────────

function AudioPanel({ clip, track }: { clip: Clip; track: Track }) {
  const updateClipAudio = useEditorStore((s) => s.updateClipAudio);
  const commitHistory = useEditorStore((s) => s.commitHistory);
  const setTrackVolume = useEditorStore((s) => s.setTrackVolume);
  const asset = useEditorStore((s) => (clip.mediaId ? s.mediaAssets.find((m) => m.id === clip.mediaId) : undefined));
  const kf = useKf(clip);
  const a = clip.audio;
  const set = (p: Partial<typeof a>) => updateClipAudio(clip.id, p);
  const producesAudio = clip.kind === "media" && asset && asset.type !== "image" && (track.type === "audio" || (!clip.audioDetached && asset.hasAudio !== false));
  if (!producesAudio)
    return (
      <div className="text-xs">
        <ClipHeader clip={clip} track={track} />
        <Empty icon={<Volume2 size={28} strokeWidth={1.25} />} title="This clip has no audio" hint={clip.audioDetached ? "Its audio lives on a linked clip on an audio track." : undefined} />
      </div>
    );
  const db = a.volume <= 0 ? "-∞" : (20 * Math.log10(a.volume / 100)).toFixed(1);
  return (
    <div className="text-xs">
      <ClipHeader clip={clip} track={track} />
      <Section title="Level">
        <SliderRow label="Volume" value={Math.round(kf.value("volume", a.volume))} min={0} max={200} step={1} unit="%" defaultValue={100} onChange={kf.setter("volume", (v) => set({ volume: v }))} onCommit={commitHistory} keyframe={kf.kfProps("volume")} />
        <div className="-mt-1 mb-2 pl-[84px] font-mono text-[10px] text-neutral-500">{db} dB</div>
        <SliderRow label="Pan" value={a.pan} min={-100} max={100} step={1} defaultValue={0} onChange={(v) => set({ pan: v })} onCommit={commitHistory} />
        <Row label="Mute">
          <Toggle checked={a.muted} onChange={(v) => updateClipAudio(clip.id, { muted: v }, true)} />
        </Row>
        <Row label="Pitch">
          <Toggle checked={a.preservesPitch} onChange={(v) => updateClipAudio(clip.id, { preservesPitch: v }, true)} label="Preserve pitch when speed changes" />
        </Row>
      </Section>
      <Section title="Fades">
        <SliderRow label="Fade in" value={a.fadeIn} min={0} max={Math.min(10, clip.duration)} step={0.05} unit="s" defaultValue={0} onChange={(v) => set({ fadeIn: v })} onCommit={commitHistory} />
        <SliderRow label="Fade out" value={a.fadeOut} min={0} max={Math.min(10, clip.duration)} step={0.05} unit="s" defaultValue={0} onChange={(v) => set({ fadeOut: v })} onCommit={commitHistory} />
      </Section>
      <BeatSyncSection clip={clip} assetId={asset.id} assetUrl={asset.url} cached={asset.beats} />
      <Section title={`Track · ${track.name}`}>
        <SliderRow label="Track vol" value={track.volume} min={0} max={200} step={1} unit="%" defaultValue={100} onChange={(v) => setTrackVolume(track.id, v)} />
      </Section>
    </div>
  );
}

// ── Beat sync ───────────────────────────────────────────────────────────────

function BeatSyncSection({ clip, assetId, assetUrl, cached }: { clip: Clip; assetId: string; assetUrl: string; cached?: { times: number[]; strengths: number[]; bpm: number } }) {
  const patchMedia = useEditorStore((s) => s.patchMedia);
  const addMarkers = useEditorStore((s) => s.addMarkers);
  const removeMarkersByTag = useEditorStore((s) => s.removeMarkersByTag);
  const splitAtTimes = useEditorStore((s) => s.splitAtTimes);
  const notify = useEditorStore((s) => s.notify);
  const tracks = useEditorStore((s) => s.tracks);
  const markerCount = useEditorStore((s) => s.markers.filter((m) => m.tag === `beats:${clip.id}`).length);
  const [busy, setBusy] = useState<number | null>(null);
  const [sensitivity, setSensitivity] = useState(50);
  const [every, setEvery] = useState<"1" | "2" | "4" | "8">("1");
  const analysis: BeatAnalysis | null = cached ? { beats: cached.times, strengths: cached.strengths, bpm: cached.bpm, duration: 0 } : null;

  async function analyse() {
    setBusy(0);
    try {
      const buf = await decodeForAnalysis(assetUrl);
      // Yield so the progress UI paints before the heavy loop.
      await new Promise((r) => setTimeout(r, 20));
      const res = analyseBeats(buf, { sensitivity: sensitivity / 100, onProgress: (r) => setBusy(r) });
      patchMedia(assetId, { beats: { times: res.beats, strengths: res.strengths, bpm: res.bpm } });
      notify(`Found ${res.beats.length} beats${res.bpm ? ` · ~${res.bpm} BPM` : ""}`, "success");
    } catch (e) {
      notify(`Beat analysis failed: ${(e as Error).message}`, "error");
    } finally {
      setBusy(null);
    }
  }

  /** Beat times (source seconds) → timeline seconds through this clip's trim & speed, clipped to the clip. */
  function timelineBeats(): number[] {
    if (!analysis) return [];
    const list = thinBeats(analysis, Number(every));
    const out: number[] = [];
    for (const b of list) {
      const t = clip.start + (b - clip.trimIn) / clip.speed;
      if (t > clip.start + 0.02 && t < clip.start + clip.duration - 0.02) out.push(t);
    }
    return out;
  }

  function placeMarkers() {
    const times = timelineBeats();
    if (!times.length) return notify("No beats inside this clip's range", "error");
    addMarkers(times.map((t, i) => ({ time: t, label: `Beat ${i + 1}`, color: "#f472b6" })), `beats:${clip.id}`);
    notify(`${times.length} beat markers added`, "success");
  }

  function cutVideoToBeats() {
    const times = timelineBeats();
    if (!times.length) return notify("No beats inside this clip's range", "error");
    const videoTrackIds = tracks.filter((t) => t.type === "video" && !t.locked).map((t) => t.id);
    if (!videoTrackIds.length) return notify("No unlocked video tracks", "error");
    splitAtTimes(times, videoTrackIds);
    notify(`Video cut at ${times.length} beats — swap or delete segments to build the montage`, "success");
  }

  return (
    <Section title="Beat sync">
      {!analysis ? (
        <>
          <SliderRow label="Sensitivity" value={sensitivity} min={0} max={100} step={1} unit="%" defaultValue={50} onChange={setSensitivity} />
          <Btn onClick={analyse} disabled={busy !== null} className="w-full">
            <Activity size={12} /> {busy === null ? "Detect beats" : `Analysing… ${Math.round((busy ?? 0) * 100)}%`}
          </Btn>
          <p className="mt-1.5 text-[10px] text-neutral-500">Finds kicks, snares and transients in this clip so you can drop markers and cut picture to the music.</p>
        </>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between rounded bg-white/[0.04] px-2 py-1.5">
            <span className="text-[11px] text-neutral-300">
              <span className="font-semibold text-white">{analysis.beats.length}</span> beats
              {analysis.bpm ? <span className="text-neutral-500"> · ~{analysis.bpm} BPM</span> : null}
            </span>
            <button className="text-[10px] text-neutral-500 hover:text-white" onClick={() => patchMedia(assetId, { beats: undefined })}>
              Re-analyse
            </button>
          </div>
          <Row label="Every">
            <Segmented value={every} onChange={setEvery} options={[{ value: "1", label: "beat" }, { value: "2", label: "2" }, { value: "4", label: "4" }, { value: "8", label: "8" }]} size="xs" className="w-full" />
          </Row>
          <div className="grid grid-cols-2 gap-1">
            <Btn variant="ghost" onClick={placeMarkers}>Add markers</Btn>
            <Btn variant="ghost" onClick={cutVideoToBeats}>Cut video to beats</Btn>
          </div>
          {markerCount > 0 && (
            <button className="mt-1.5 text-[10px] text-neutral-500 hover:text-red-300" onClick={() => removeMarkersByTag(`beats:${clip.id}`)}>
              Remove {markerCount} beat markers
            </button>
          )}
          <p className="mt-1.5 text-[10px] text-neutral-500">Markers snap while dragging, so clips land exactly on the beat. "Cut video" slices every unlocked video track at each beat.</p>
        </>
      )}
    </Section>
  );
}

export { ClipHeader };
