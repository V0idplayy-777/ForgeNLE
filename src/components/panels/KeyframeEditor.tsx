import { useEditorStore } from "../../store/useEditorStore";
import { ANIM_PROPS, AnimProp, Clip, Easing, Track } from "../../types";
import { Section, Empty, Btn, Select, KeyframeButton } from "../ui/controls";
import { evaluateClip, hasKeyframes, keyframeAt } from "../../lib/keyframes";
import { clamp, formatTimecode } from "../../lib/utils";
import { Diamond, Trash2 } from "lucide-react";
import { ClipHeader } from "./Inspector";
import { cn } from "../../utils/cn";

const LABELS: Record<AnimProp, string> = { x: "Position X", y: "Position Y", scale: "Scale", rotation: "Rotation", opacity: "Opacity", volume: "Volume" };
const EASINGS: { value: Easing; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "ease-in", label: "Ease In" },
  { value: "ease-out", label: "Ease Out" },
  { value: "ease-in-out", label: "Ease In-Out" },
];

export default function KeyframeEditor({ clip, track }: { clip: Clip; track: Track }) {
  const currentTime = useEditorStore((s) => s.currentTime);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const fps = useEditorStore((s) => s.settings.fps);
  const toggleKeyframe = useEditorStore((s) => s.toggleKeyframe);
  const removeKeyframe = useEditorStore((s) => s.removeKeyframe);
  const clearKeyframes = useEditorStore((s) => s.clearKeyframes);
  const setKeyframeEasing = useEditorStore((s) => s.setKeyframeEasing);
  const local = clamp(currentTime - clip.start, 0, clip.duration);
  const anim = evaluateClip(clip, local);
  const props = track.type === "audio" ? (["volume"] as AnimProp[]) : ANIM_PROPS.filter((p) => p !== "volume" || clip.kind === "media");
  const any = hasKeyframes(clip);

  return (
    <div className="text-xs">
      <ClipHeader clip={clip} track={track} />
      <Section title="Animate" right={any ? <Btn variant="ghost" onClick={() => clearKeyframes(clip.id)} className="h-6 text-[10px] text-red-400">Clear all</Btn> : undefined}>
        <p className="mb-2 text-[10px] leading-relaxed text-neutral-500">
          Move the playhead, press the ◇ next to a property to add a keyframe, then change the value at a different time. Values interpolate between keyframes.
        </p>
        <div className="space-y-1">
          {props.map((p) => {
            const kfs = clip.keyframes[p] ?? [];
            const active = !!keyframeAt(clip.keyframes, p, local);
            return (
              <div key={p} className="rounded-md border border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <KeyframeButton active={active} has={kfs.length > 0} onToggle={() => toggleKeyframe(clip.id, p)} />
                  <span className="w-20 text-[11px] text-neutral-300">{LABELS[p]}</span>
                  <span className="ml-auto font-mono text-[10px] text-neutral-400">{formatVal(p, anim[p])}</span>
                  {kfs.length > 0 && (
                    <button onClick={() => clearKeyframes(clip.id, p)} className="rounded p-0.5 text-neutral-600 hover:text-red-400" title="Remove all keyframes for this property">
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
                {kfs.length > 0 && (
                  <div className="border-t border-white/5 px-2 py-1.5">
                    {/* Mini timeline */}
                    <div className="relative mb-1.5 h-4 rounded bg-white/[0.04]">
                      <div className="absolute top-0 h-full w-px bg-red-500" style={{ left: `${(local / clip.duration) * 100}%` }} />
                      {kfs.map((k) => (
                        <button
                          key={k.id}
                          onClick={() => setCurrentTime(clip.start + k.time)}
                          className={cn("absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-black/50", Math.abs(k.time - local) < 0.02 ? "bg-white" : "bg-amber-400 hover:bg-amber-300")}
                          style={{ left: `${(k.time / clip.duration) * 100}%` }}
                          title={`${formatTimecode(clip.start + k.time, fps)} → ${formatVal(p, k.value)}`}
                        />
                      ))}
                    </div>
                    <div className="max-h-32 space-y-0.5 overflow-y-auto">
                      {kfs.map((k) => (
                        <div key={k.id} className={cn("flex items-center gap-1.5 rounded px-1 py-0.5 text-[10px]", Math.abs(k.time - local) < 0.02 && "bg-white/5")}>
                          <button onClick={() => setCurrentTime(clip.start + k.time)} className="font-mono text-neutral-400 hover:text-white">
                            {formatTimecode(clip.start + k.time, fps).slice(3)}
                          </button>
                          <span className="font-mono text-neutral-200">{formatVal(p, k.value)}</span>
                          <Select value={k.easing} onChange={(v) => setKeyframeEasing(clip.id, p, k.time, v)} options={EASINGS} className="ml-auto h-5 w-[92px] text-[10px]" />
                          <button onClick={() => removeKeyframe(clip.id, p, k.time)} className="rounded p-0.5 text-neutral-600 hover:text-red-400" title="Delete keyframe">
                            <Trash2 size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>
      <Section title="Quick animations" defaultOpen>
        <div className="grid grid-cols-2 gap-1.5">
          <Btn onClick={() => preset(clip, "zoom-in")}>Slow zoom in</Btn>
          <Btn onClick={() => preset(clip, "zoom-out")}>Slow zoom out</Btn>
          <Btn onClick={() => preset(clip, "pan-left")}>Pan left</Btn>
          <Btn onClick={() => preset(clip, "pan-right")}>Pan right</Btn>
          <Btn onClick={() => preset(clip, "fade-in-out")}>Fade in & out</Btn>
          <Btn onClick={() => preset(clip, "spin")}>Spin 360°</Btn>
        </div>
        <p className="mt-2 text-[10px] text-neutral-600">Presets replace existing keyframes on the affected properties.</p>
      </Section>
      {!any && <div className="p-3"><Empty icon={<Diamond size={22} strokeWidth={1.25} />} title="No keyframes yet" /></div>}
    </div>
  );
}

function formatVal(p: AnimProp, v: number) {
  switch (p) {
    case "scale":
      return `${Math.round(v * 100)}%`;
    case "rotation":
      return `${v.toFixed(1)}°`;
    case "opacity":
    case "volume":
      return `${Math.round(v)}%`;
    default:
      return `${Math.round(v)}px`;
  }
}

function preset(clip: Clip, kind: string) {
  const s = useEditorStore.getState();
  const d = clip.duration;
  const mk = (value: number, time: number, easing: Easing = "ease-in-out") => ({ id: `kf_${Math.random().toString(36).slice(2, 9)}`, time, value, easing });
  let patch: Clip["keyframes"] = { ...clip.keyframes };
  const W = s.settings.width;
  switch (kind) {
    case "zoom-in":
      patch = { ...patch, scale: [mk(clip.transform.scale, 0, "linear"), mk(clip.transform.scale * 1.15, d, "linear")] };
      break;
    case "zoom-out":
      patch = { ...patch, scale: [mk(clip.transform.scale * 1.15, 0, "linear"), mk(clip.transform.scale, d, "linear")] };
      break;
    case "pan-left":
      patch = { ...patch, x: [mk(W * 0.05, 0, "linear"), mk(-W * 0.05, d, "linear")], scale: [mk(Math.max(clip.transform.scale, 1.12), 0, "linear")] };
      break;
    case "pan-right":
      patch = { ...patch, x: [mk(-W * 0.05, 0, "linear"), mk(W * 0.05, d, "linear")], scale: [mk(Math.max(clip.transform.scale, 1.12), 0, "linear")] };
      break;
    case "fade-in-out": {
      const f = Math.min(1, d / 3);
      patch = { ...patch, opacity: [mk(0, 0, "ease-out"), mk(100, f, "ease-out"), mk(100, d - f, "ease-in"), mk(0, d, "ease-in")] };
      break;
    }
    case "spin":
      patch = { ...patch, rotation: [mk(0, 0, "ease-in-out"), mk(360, d, "ease-in-out")] };
      break;
  }
  s.updateClip(clip.id, { keyframes: patch });
}
