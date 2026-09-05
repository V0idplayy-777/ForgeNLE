import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useEditorStore } from "../../store/useEditorStore";
import { Btn, ColorField, Kbd, Row, Section, Segmented, SliderRow, Toggle } from "../ui/controls";
import { FACECAM_PRESETS, FacecamPresetId, ZoomCutMode } from "../../lib/gaming";
import { SFX_DEFS, SfxId, ensureSfxAsset, previewSfx, sfxDef } from "../../lib/sfx";
import { Zap, ZoomIn, Rewind, Clapperboard, Video, Type, Volume2, EyeOff, Play, Plus, Music, Smile, Tornado, Repeat, Crosshair } from "lucide-react";

// ── helpers ─────────────────────────────────────────────────────────────────

function useVideoSelection() {
  return useEditorStore(
    useShallow((s) => s.selectedClipIds.filter((id) => s.tracks.some((t) => t.type === "video" && t.clips.some((c) => c.id === id))))
  );
}

/** Makes sure an SFX asset exists in the media bin and returns its id. */
async function ensureBinned(id: SfxId, duration?: number): Promise<string> {
  const st = useEditorStore.getState();
  // bleep renders at the requested length; the rest are fixed one-shots
  const key = id === "bleep" ? `sfx-bleep-${Math.round((duration ?? 1) * 1000)}` : `sfx-${id}`;
  const existing = st.mediaAssets.find((m) => m.id === key);
  if (existing) return existing.id;
  const asset = await ensureSfxAsset(id, duration);
  useEditorStore.getState().addMedia([asset]);
  return asset.id;
}

// ── panel ───────────────────────────────────────────────────────────────────

export default function GamingPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/5 px-3 py-2">
        <p className="text-[10px] leading-relaxed text-neutral-500">
          One-click chaos for gaming edits. Park the playhead, select clips, and smash the button. Everything lands as normal clips and keyframes — tweak
          afterwards.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto text-xs">
        <ImpactSection />
        <EmojiBlitzSection />
        <ZoomCutsSection />
        <ReplaySection />
        <BoomerangSection />
        <PunchFocusSection />
        <MontageSection />
        <BeatPunchSection />
        <FacecamSection />
        <BurstSection />
        <SfxSection />
        <CensorSection />
      </div>
    </div>
  );
}

// ── 1 · Impact hit ──────────────────────────────────────────────────────────

function ImpactSection() {
  const [freeze, setFreeze] = useState(0.12);
  const [shake, setShake] = useState(100);
  const [zoom, setZoom] = useState(24);
  const [flash, setFlash] = useState(true);
  const [withSfx, setWithSfx] = useState(true);
  const [busy, setBusy] = useState(false);

  async function run() {
    const st = useEditorStore.getState();
    setBusy(true);
    try {
      let sfxAssetId: string | undefined;
      if (withSfx) sfxAssetId = await ensureBinned("impact");
      st.impactAtPlayhead({ freeze, shake: shake / 100, zoom: zoom / 100, flash, sfxAssetId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="💥 Impact hit">
      <p className="mb-2 text-[10px] leading-relaxed text-neutral-500">
        Freeze-frame hit-stop, white flash, shake and punch-zoom at the playhead. For kills, dunks and jumpscares.
      </p>
      <SliderRow label="Hit-stop" value={Math.round(freeze * 1000)} min={0} max={400} step={10} unit="ms" defaultValue={120} onChange={(v) => setFreeze(v / 1000)} />
      <SliderRow label="Shake" value={shake} min={10} max={250} step={5} unit="%" defaultValue={100} onChange={setShake} />
      <SliderRow label="Zoom" value={zoom} min={0} max={60} step={1} unit="%" defaultValue={24} onChange={setZoom} />
      <div className="mb-2 flex items-center gap-4">
        <Toggle checked={flash} onChange={setFlash} label="Flash" />
        <Toggle checked={withSfx} onChange={setWithSfx} label="Impact SFX" />
      </div>
      <Btn variant="primary" className="w-full" onClick={run} disabled={busy}>
        <Zap size={12} /> {busy ? "Hitting…" : "Impact at playhead"} <Kbd>G</Kbd>
      </Btn>
    </Section>
  );
}

// ── 1b · Emoji blitz + MAX CHAOS ────────────────────────────────────────────

function EmojiBlitzSection() {
  const [text, setText] = useState("😱 🔥 💀 😂 👀 🤯");
  const [count, setCount] = useState(6);
  const [size, setSize] = useState(150);
  const [withSfx, setWithSfx] = useState(true);
  const [busy, setBusy] = useState(false);

  async function blitz() {
    const st = useEditorStore.getState();
    setBusy(true);
    try {
      let sfxAssetId: string | undefined;
      if (withSfx) sfxAssetId = await ensureBinned("pop");
      const emojis = text.split(/[\s,]+/).map((e) => e.trim()).filter(Boolean);
      st.emojiBlitz(emojis, { count, size, sfxAssetId });
    } finally {
      setBusy(false);
    }
  }

  async function chaos() {
    setBusy(true);
    try {
      await useEditorStore.getState().maxChaos();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="⚡ Emoji blitz">
      <p className="mb-2 text-[10px] leading-relaxed text-neutral-500">
        Scatters pop-in emojis around the playhead with optional machine-gun pops. The internet's favourite reaction pack, zero downloads.
      </p>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="😱 🔥 💀 😂"
        className="mb-2 w-full rounded-md border border-white/5 bg-white/[0.04] px-2 py-1.5 text-[15px] leading-normal text-white outline-none focus:border-indigo-500"
      />
      <SliderRow label="Count" value={count} min={1} max={14} step={1} unit="" defaultValue={6} onChange={setCount} />
      <SliderRow label="Size" value={size} min={60} max={320} step={10} unit="px" defaultValue={150} onChange={setSize} />
      <div className="mb-2">
        <Toggle checked={withSfx} onChange={setWithSfx} label="Pop SFX every other emoji" />
      </div>
      <Btn variant="default" className="w-full" onClick={blitz} disabled={busy}>
        <Smile size={12} /> Blitz emojis <Kbd>E</Kbd>
      </Btn>
      <Btn variant="primary" className="mt-1.5 w-full bg-gradient-to-r from-red-500 to-orange-500" onClick={chaos} disabled={busy} title="Impact + vine boom + emoji storm">
        <Tornado size={12} /> MAX CHAOS
      </Btn>
    </Section>
  );
}

// ── 1c · Boomerang ──────────────────────────────────────────────────────────

function BoomerangSection() {
  const [seconds, setSeconds] = useState(2);
  return (
    <Section title="↩️ Boomerang" defaultOpen={false}>
      <p className="mb-2 text-[10px] leading-relaxed text-neutral-500">
        Loops the last few seconds forward-backward-right-after-the-playhead. Perfect for anything that deserves watching twice. Reverse audio is muted.
      </p>
      <SliderRow label="Length" value={seconds} min={0.5} max={8} step={0.25} unit="s" defaultValue={2} onChange={setSeconds} />
      <Btn variant="default" className="w-full" onClick={() => useEditorStore.getState().boomerang({ seconds })}>
        <Repeat size={12} /> Boomerang last {seconds}s
      </Btn>
    </Section>
  );
}

// ── 1d · Punch focus (click-to-zoom) ────────────────────────────────────────

function PunchFocusSection() {
  const armed = useEditorStore((s) => s.focusPickArmed);
  const arm = useEditorStore((s) => s.armFocusPick);
  const [zoom, setZoom] = useState(70);
  const [ramp, setRamp] = useState(0.35);
  return (
    <Section title="🎯 Punch focus" defaultOpen={false}>
      <p className="mb-2 text-[10px] leading-relaxed text-neutral-500">
        Arm it, then click anything in the preview — the clip whip-zooms so that exact spot lands centre-frame. The meme circle-and-zoom, in two clicks.
      </p>
      <SliderRow label="Zoom" value={zoom} min={10} max={200} step={5} unit="%" defaultValue={70} onChange={setZoom} />
      <SliderRow label="Whip time" value={Math.round(ramp * 100)} min={8} max={120} step={2} unit="cs" defaultValue={35} onChange={(v) => setRamp(v / 100)} />
      <Btn
        variant={armed ? "primary" : "default"}
        className={armed ? "w-full bg-red-500 hover:bg-red-400" : "w-full"}
        onClick={() => arm(!armed, { zoom, ramp })}
      >
        <Crosshair size={12} /> {armed ? "Click a spot in the preview…" : "Arm pick, then click preview"}
      </Btn>
    </Section>
  );
}

// ── 2 · Zoom cuts ───────────────────────────────────────────────────────────

function ZoomCutsSection() {
  const sel = useVideoSelection();
  const [interval, setInterval] = useState(1.5);
  const [amount, setAmount] = useState(12);
  const [mode, setMode] = useState<ZoomCutMode>("alternate");
  return (
    <Section title="🔍 Auto zoom cuts" defaultOpen={false}>
      <p className="mb-2 text-[10px] leading-relaxed text-neutral-500">
        Punch in and out across the selected clip{sel.length > 1 ? "s" : ""} — the talking-head energy every commentary video needs. ({sel.length} selected)
      </p>
      <SliderRow label="Every" value={interval} min={0.4} max={5} step={0.1} unit="s" defaultValue={1.5} onChange={setInterval} />
      <SliderRow label="Punch" value={amount} min={3} max={40} step={1} unit="%" defaultValue={12} onChange={setAmount} />
      <Row label="Style">
        <Segmented
          value={mode}
          onChange={setMode}
          size="xs"
          className="w-full"
          options={[
            { value: "alternate", label: "Alternate" },
            { value: "ramp-in", label: "Ramp in" },
            { value: "random", label: "Random" },
          ]}
        />
      </Row>
      <Btn variant="default" className="w-full" onClick={() => useEditorStore.getState().applyZoomCuts(sel, { interval, amount, mode })}>
        <ZoomIn size={12} /> Apply zoom cuts
      </Btn>
    </Section>
  );
}

// ── 3 · Instant replay ──────────────────────────────────────────────────────

function ReplaySection() {
  const [seconds, setSeconds] = useState(3);
  const [speed, setSpeed] = useState(0.3);
  const [label, setLabel] = useState(true);
  return (
    <Section title="⏪ Instant replay">
      <p className="mb-2 text-[10px] leading-relaxed text-neutral-500">
        Replays the last few seconds in slow-mo right after the playhead, zoomed in with a REPLAY tag. Music keeps playing.
      </p>
      <SliderRow label="Length" value={seconds} min={0.5} max={10} step={0.5} unit="s" defaultValue={3} onChange={setSeconds} />
      <SliderRow label="Speed" value={Math.round(speed * 100)} min={10} max={100} step={5} unit="%" defaultValue={30} onChange={(v) => setSpeed(v / 100)} />
      <div className="mb-2">
        <Toggle checked={label} onChange={setLabel} label="REPLAY label" />
      </div>
      <Btn variant="default" className="w-full" onClick={() => useEditorStore.getState().instantReplay({ seconds, speed, label })}>
        <Rewind size={12} /> Replay last {seconds}s <Kbd>⇧G</Kbd>
      </Btn>
    </Section>
  );
}

// ── 4 · Marker montage ──────────────────────────────────────────────────────

function MontageSection() {
  const count = useEditorStore((s) => s.markers.length);
  const [pre, setPre] = useState(1.5);
  const [post, setPost] = useState(1.5);
  const [gap, setGap] = useState(0);
  const [punch, setPunch] = useState(true);
  return (
    <Section title="🎬 Marker montage" defaultOpen={false}>
      <p className="mb-2 text-[10px] leading-relaxed text-neutral-500">
        Record for hours, tap <Kbd>M</Kbd> on every kill, then condense the timeline to just those moments. ({count} marker{count === 1 ? "" : "s"})
      </p>
      <SliderRow label="Pre-roll" value={pre} min={0} max={10} step={0.25} unit="s" defaultValue={1.5} onChange={setPre} />
      <SliderRow label="Post-roll" value={post} min={0} max={10} step={0.25} unit="s" defaultValue={1.5} onChange={setPost} />
      <SliderRow label="Gap" value={gap} min={0} max={2} step={0.1} unit="s" defaultValue={0} onChange={setGap} />
      <div className="mb-2">
        <Toggle checked={punch} onChange={setPunch} label="Punch-in on every moment" />
      </div>
      <Btn variant="default" className="w-full" onClick={() => useEditorStore.getState().montageFromMarkers({ pre, post, gap, punch })}>
        <Clapperboard size={12} /> Build montage
      </Btn>
    </Section>
  );
}

// ── 5 · Beat punch ──────────────────────────────────────────────────────────

function BeatPunchSection() {
  const sel = useVideoSelection();
  const [amount, setAmount] = useState(10);
  return (
    <Section title="🥁 Beat punch" defaultOpen={false}>
      <p className="mb-2 text-[10px] leading-relaxed text-neutral-500">
        Pops the zoom on every marker inside the selected clips — cut to the music, then make it pump. ({sel.length} selected)
      </p>
      <SliderRow label="Pop" value={amount} min={2} max={30} step={1} unit="%" defaultValue={10} onChange={setAmount} />
      <Btn variant="default" className="w-full" onClick={() => useEditorStore.getState().punchToBeats(sel, { amount })}>
        <Music size={12} /> Punch to markers
      </Btn>
    </Section>
  );
}

// ── 6 · Facecam ─────────────────────────────────────────────────────────────

function FacecamSection() {
  const sel = useVideoSelection();
  const [preset, setPreset] = useState<FacecamPresetId>("circle-br");
  const [size, setSize] = useState(26);
  const [border, setBorder] = useState(6);
  const [color, setColor] = useState("#ffffff");
  return (
    <Section title="📹 Facecam kit" defaultOpen={false}>
      <p className="mb-2 text-[10px] leading-relaxed text-neutral-500">Drops the selected clip into a corner cam with a border ring. ({sel.length} selected)</p>
      <div className="mb-2 grid grid-cols-2 gap-1">
        {FACECAM_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            title={p.hint}
            className={`rounded-md border px-2 py-1.5 text-left text-[10px] transition-colors ${
              preset === p.id ? "border-indigo-500 bg-indigo-500/15 text-white" : "border-white/5 bg-white/[0.03] text-neutral-400 hover:text-white"
            }`}
          >
            <div className="font-medium">{p.name}</div>
            <div className="truncate text-[9px] opacity-70">{p.hint}</div>
          </button>
        ))}
      </div>
      {preset !== "side-right" && <SliderRow label="Size" value={size} min={15} max={45} step={1} unit="%" defaultValue={26} onChange={setSize} />}
      {preset !== "side-right" && <SliderRow label="Border" value={border} min={0} max={20} step={1} unit="px" defaultValue={6} onChange={setBorder} />}
      {preset !== "side-right" && border > 0 && (
        <Row label="Color">
          <ColorField value={color} onChange={setColor} />
        </Row>
      )}
      <Btn
        variant="default"
        className="w-full"
        onClick={() => useEditorStore.getState().applyFacecam(sel, preset, { size: size / 100, border, borderColor: color })}
      >
        <Video size={12} /> Place facecam
      </Btn>
    </Section>
  );
}

// ── 7 · Caption burst ───────────────────────────────────────────────────────

function BurstSection() {
  const [text, setText] = useState("WAIT WHAT?!\nNO WAY\nHE DID WHAT");
  const [dur, setDur] = useState(0.7);
  const [gap, setGap] = useState(0.08);
  const n = text.split("\n").filter((l) => l.trim()).length;
  return (
    <Section title="💬 Caption burst" defaultOpen={false}>
      <p className="mb-2 text-[10px] leading-relaxed text-neutral-500">One meme caption per line, fired back-to-back from the playhead with rotating styles.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        rows={3}
        placeholder={"ONE\nCAPTION\nPER LINE"}
        className="mb-2 w-full resize-y rounded-md border border-white/5 bg-white/[0.04] px-2 py-1.5 text-[12px] font-bold uppercase text-white outline-none focus:border-indigo-500"
      />
      <SliderRow label="Each" value={dur} min={0.2} max={3} step={0.05} unit="s" defaultValue={0.7} onChange={setDur} />
      <SliderRow label="Gap" value={gap} min={0} max={1} step={0.02} unit="s" defaultValue={0.08} onChange={setGap} />
      <Btn variant="default" className="w-full" onClick={() => useEditorStore.getState().captionBurst(text.split("\n"), { duration: dur, gap })}>
        <Type size={12} /> Fire {n} caption{n === 1 ? "" : "s"}
      </Btn>
    </Section>
  );
}

// ── 8 · SFX kit ─────────────────────────────────────────────────────────────

function SfxSection() {
  const [busy, setBusy] = useState<SfxId | null>(null);
  async function add(id: SfxId) {
    const st = useEditorStore.getState();
    setBusy(id);
    try {
      const assetId = await ensureBinned(id);
      st.addSfxClip(assetId);
      st.notify(`🔊 ${sfxDef(id).name} added at playhead`, "success");
    } finally {
      setBusy(null);
    }
  }
  return (
    <Section title="🔊 SFX kit">
      <p className="mb-2 text-[10px] leading-relaxed text-neutral-500">Synthesized in-app — no downloads, no copyright strikes. Adds at the playhead.</p>
      <div className="grid grid-cols-1 gap-1">
        {SFX_DEFS.filter((d) => d.id !== "bleep").map((d) => (
          <div key={d.id} className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1">
            <span className="text-sm">{d.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium text-neutral-200">{d.name}</div>
              <div className="truncate text-[9px] text-neutral-600">{d.hint}</div>
            </div>
            <button
              onClick={() => previewSfx(d.id)}
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-white/10 hover:text-white"
              title={`Preview ${d.name}`}
            >
              <Play size={12} />
            </button>
            <Btn variant="default" size="xs" onClick={() => add(d.id)} disabled={busy !== null} title={`Add ${d.name} at playhead`}>
              <Plus size={11} /> {busy === d.id ? "…" : "Add"}
            </Btn>
          </div>
        ))}
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-[10px] text-neutral-600">
        <Volume2 size={10} /> Bleep lives in the censor box below.
      </p>
    </Section>
  );
}

// ── 9 · Censor ──────────────────────────────────────────────────────────────

function CensorSection() {
  const [dur, setDur] = useState(1);
  const [shape, setShape] = useState<"ellipse" | "rectangle">("ellipse");
  const [busy, setBusy] = useState(false);
  async function run() {
    const st = useEditorStore.getState();
    setBusy(true);
    try {
      const assetId = await ensureBinned("bleep", dur);
      st.censorAtPlayhead(assetId, { duration: dur, shape });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title="🤐 Censor box" defaultOpen={false}>
      <p className="mb-2 text-[10px] leading-relaxed text-neutral-500">Bleep tone plus a blurred box over chat, names or sus moments. Reposition the box in Inspector → Mask.</p>
      <SliderRow label="Length" value={dur} min={0.2} max={10} step={0.1} unit="s" defaultValue={1} onChange={setDur} />
      <Row label="Shape">
        <Segmented
          value={shape}
          onChange={setShape}
          size="xs"
          className="w-full"
          options={[
            { value: "ellipse", label: "Ellipse" },
            { value: "rectangle", label: "Box" },
          ]}
        />
      </Row>
      <Btn variant="default" className="w-full" onClick={run} disabled={busy}>
        <EyeOff size={12} /> {busy ? "Censoring…" : `Censor ${dur.toFixed(1)}s`}
      </Btn>
    </Section>
  );
}
