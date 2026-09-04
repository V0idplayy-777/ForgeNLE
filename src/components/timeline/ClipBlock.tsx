import { memo, useMemo, useRef, useState } from "react";
import { Clip, MediaAsset, Track } from "../../types";
import { useEditorStore } from "../../store/useEditorStore";
import { clamp, findSnapTargets, snapValue, allClips } from "../../lib/utils";
import { allKeyframeTimes, hasKeyframes } from "../../lib/keyframes";
import { transitionName } from "../../lib/presets";
import { useTimeline } from "./timelineContext";
import { Scissors, Trash2, Copy, Music4, Type as TypeIcon, Film, Image as ImageIcon, Link2, Unlink2, Square, Diamond, Gauge, AlignStartVertical, Blend, Volume2, Palette, Layers, Snowflake, Rewind, ClipboardCopy, ClipboardPaste } from "lucide-react";
import { cn } from "../../utils/cn";
import { CLIP_COLOR_LABELS } from "../../lib/utils";

const MIN_DURATION = 0.05;

// ── Visual content ──────────────────────────────────────────────────────────

const Waveform = memo(function Waveform({ asset, clip, height }: { asset: MediaAsset; clip: Clip; height: number }) {
  const wf = asset.waveform;
  const pathD = useMemo(() => {
    if (!wf || !asset.duration) return "";
    const total = wf.length;
    const startFrac = clip.trimIn / asset.duration;
    const endFrac = Math.min(1, (clip.trimIn + clip.duration * clip.speed) / asset.duration);
    const startIdx = clamp(Math.floor(startFrac * total), 0, total - 1);
    const endIdx = clamp(Math.ceil(endFrac * total), startIdx + 1, total);
    const slice = wf.slice(startIdx, endIdx);
    const n = slice.length;
    if (!n) return "";
    const gain = clamp(clip.audio.volume / 100, 0, 2);
    let top = "";
    let bottom = "";
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1 || 1)) * 100;
      const v = clamp(slice[i] * gain, 0, 1) * 48;
      top += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${(50 - v).toFixed(2)} `;
      bottom = `L${x.toFixed(2)} ${(50 + v).toFixed(2)} ` + bottom;
    }
    return `${top}${bottom}Z`;
  }, [wf, asset.duration, clip.trimIn, clip.duration, clip.speed, clip.audio.volume]);
  if (!pathD) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }}>
      <path d={pathD} fill="rgba(255,255,255,0.55)" />
    </svg>
  );
});

const Filmstrip = memo(function Filmstrip({ asset, clip, pxPerSec, height }: { asset: MediaAsset; clip: Clip; pxPerSec: number; height: number }) {
  const frames = asset.filmstrip;
  if (!frames || !frames.length) {
    if (asset.thumbnail) {
      return <div className="absolute inset-0 opacity-50" style={{ backgroundImage: `url(${asset.thumbnail})`, backgroundRepeat: "repeat-x", backgroundSize: "auto 100%" }} />;
    }
    return null;
  }
  const frameW = Math.round(height * ((asset.width || 16) / (asset.height || 9)));
  const widthPx = clip.duration * pxPerSec;
  const count = Math.ceil(widthPx / frameW) + 1;
  const items: React.ReactNode[] = [];
  for (let i = 0; i < count && i < 400; i++) {
    const tl = clip.trimIn + ((i * frameW) / pxPerSec) * clip.speed;
    const idx = clamp(Math.floor((tl / asset.duration) * frames.length), 0, frames.length - 1);
    items.push(<img key={i} src={frames[idx]} draggable={false} className="h-full shrink-0 object-cover" style={{ width: frameW }} alt="" />);
  }
  return <div className="pointer-events-none absolute inset-0 flex overflow-hidden opacity-80">{items}</div>;
});

// ── Clip block ──────────────────────────────────────────────────────────────

type DragMode = "move" | "left" | "right" | "slip" | "roll" | "rippleL" | "rippleR";

interface Props {
  clip: Clip;
  track: Track;
  height: number;
}

export default function ClipBlock({ clip, track, height }: Props) {
  const { pxPerSec, fps, setSnapLine, clientXToTime } = useTimeline();
  const asset = useEditorStore((s) => (clip.mediaId ? s.mediaAssets.find((m) => m.id === clip.mediaId) : undefined));
  const selected = useEditorStore((s) => s.selectedClipIds.includes(clip.id));
  const tool = useEditorStore((s) => s.tool);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [colorMenu, setColorMenu] = useState(false);
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; moved: boolean; orig: Clip; origAll: Clip[]; lastTrackId: string; rollTarget?: string; rollOrigDur?: number } | null>(null);

  const left = clip.start * pxPerSec;
  const width = Math.max(clip.duration * pxPerSec, 3);
  const isAudioTrack = track.type === "audio";
  const Icon = clip.kind === "text" ? TypeIcon : clip.kind === "solid" ? Square : clip.kind === "adjustment" ? Layers : isAudioTrack ? Music4 : asset?.type === "image" ? ImageIcon : Film;
  const linked = !!clip.linkGroup;
  const kfTimes = useMemo(() => allKeyframeTimes(clip.keyframes), [clip.keyframes]);
  const missing = clip.kind === "media" && (!asset || asset.missing);

  // ── drag / trim ──
  function beginDrag(edge: "move" | "left" | "right", e: React.PointerEvent) {
    let mode: DragMode = edge;
    if (track.locked || e.button !== 0) return;
    e.stopPropagation();
    // Prevent text selection / native drag from hijacking the pointer sequence.
    e.preventDefault();
    const s = useEditorStore.getState();
    if (tool === "razor") {
      s.splitAtTime(Math.round(clientXToTime(e.clientX) * fps) / fps, [clip.id]);
      return;
    }
    if (tool === "hand") return;
    // Trim tools remap the drag mode.
    let rollTarget: string | undefined;
    if (tool === "slip") mode = "slip";
    else if (tool === "ripple") mode = mode === "left" ? "rippleL" : mode === "right" ? "rippleR" : "move";
    else if (tool === "roll") {
      if (mode === "right") rollTarget = clip.id;
      else if (mode === "left") rollTarget = track.clips.find((c) => c.id !== clip.id && Math.abs(c.start + c.duration - clip.start) <= 1 / fps + 1e-3)?.id;
      else return;
      if (!rollTarget) return;
      mode = "roll";
    }
    if (!s.selectedClipIds.includes(clip.id)) s.selectClip(clip.id, e.shiftKey || e.metaKey || e.ctrlKey);
    else if (e.shiftKey || e.metaKey || e.ctrlKey) {
      s.selectClip(clip.id, true);
      return;
    }
    const sel = new Set(useEditorStore.getState().selectedClipIds);
    // Linked partners always travel together.
    const all = allClips(s.tracks);
    const groups = new Set(all.filter((c) => sel.has(c.id) && c.linkGroup).map((c) => c.linkGroup!));
    for (const c of all) if (c.linkGroup && groups.has(c.linkGroup)) sel.add(c.id);
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      orig: clip,
      origAll: all.filter((c) => sel.has(c.id)),
      lastTrackId: track.id,
      rollTarget,
    };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function onMove(e: PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dxPx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dxPx) < 3 && Math.abs(e.clientY - d.startY) < 3) return;
    d.moved = true;
    const s = useEditorStore.getState();
    const dx = dxPx / pxPerSec;
    const threshold = 8 / pxPerSec;
    const selIds = d.origAll.map((c) => c.id);
    const snapOn = s.snapping !== e.altKey;
    const targets = snapOn ? findSnapTargets(s.tracks, s.markers, [s.currentTime], selIds) : [];

    if (d.mode === "slip") {
      // Slip: keep position & length, scrub the source underneath (drag right = earlier media, like Premiere).
      const o = d.orig;
      const want = Math.round(-dx * fps) / fps;
      const cur = allClips(s.tracks).find((c) => c.id === o.id);
      if (!cur) return;
      const applied = (cur.trimIn - o.trimIn) / (o.speed || 1);
      if (Math.abs(want - applied) > 1e-6) s.slipClip(o.id, (want - applied) * (o.speed || 1), false);
      return;
    }
    if (d.mode === "roll") {
      const targetId = d.rollTarget ?? d.orig.id;
      const tgt = allClips(s.tracks).find((c) => c.id === targetId);
      const tgtOrig = d.rollTarget && d.rollTarget !== d.orig.id ? tgt : d.orig;
      if (!tgt || !tgtOrig) return;
      // desired total delta vs what's actually applied (store clamps to media limits)
      const origDur = d.rollOrigDur ?? (d.rollOrigDur = tgt.duration);
      let want = dx;
      if (snapOn) {
        const r = snapValue(tgt.start + origDur + dx, targets, threshold);
        want = r.value - tgt.start - origDur;
        setSnapLine(r.snapped);
      }
      want = Math.round(want * fps) / fps;
      const applied = tgt.duration - origDur;
      if (Math.abs(want - applied) > 1e-6) s.rollEdit(targetId, want - applied, false);
      return;
    }
    if (d.mode === "rippleL" || d.mode === "rippleR") {
      const o = d.orig;
      const cur = allClips(s.tracks).find((c) => c.id === o.id);
      if (!cur) return;
      const side = d.mode === "rippleL" ? "start" : "end";
      let want = dx;
      if (snapOn) {
        const edge = side === "start" ? o.start : o.start + o.duration;
        const r = snapValue(edge + dx, targets, threshold);
        want = r.value - edge;
        setSnapLine(r.snapped);
      }
      want = Math.round(want * fps) / fps;
      const applied = side === "start" ? cur.start - o.start : cur.duration - o.duration;
      if (Math.abs(want - applied) > 1e-6) s.rippleTrim(o.id, side, want - applied, false);
      return;
    }
    if (d.mode === "move") {
      const minStart = Math.min(...d.origAll.map((c) => c.start));
      let delta = Math.max(dx, -minStart);
      let snapped: number | null = null;
      if (snapOn) {
        // snap either the start or end of the primary clip
        const sStart = snapValue(d.orig.start + delta, targets, threshold);
        const sEnd = snapValue(d.orig.start + d.orig.duration + delta, targets, threshold);
        if (sStart.snapped !== null) {
          delta = sStart.value - d.orig.start;
          snapped = sStart.snapped;
        } else if (sEnd.snapped !== null) {
          delta = sEnd.value - d.orig.start - d.orig.duration;
          snapped = sEnd.snapped;
        }
      }
      // frame quantize
      delta = Math.round(delta * fps) / fps;
      setSnapLine(snapped);

      // vertical track change (primary clip decides the track shift; companions follow if valid)
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const laneEl = el?.closest("[data-track-id]") as HTMLElement | null;
      const targetTrackId = laneEl?.getAttribute("data-track-id") || d.lastTrackId;
      d.lastTrackId = targetTrackId;
      const fromIdx = s.tracks.findIndex((t) => t.id === d.orig.trackId);
      const toIdx = s.tracks.findIndex((t) => t.id === targetTrackId);
      let shift = 0;
      if (toIdx >= 0 && fromIdx >= 0 && s.tracks[toIdx].type === s.tracks[fromIdx].type && !s.tracks[toIdx].locked) shift = toIdx - fromIdx;
      const placements = d.origAll.map((c) => {
        const fi = s.tracks.findIndex((t) => t.id === c.trackId);
        let ti = fi + shift;
        if (ti < 0 || ti >= s.tracks.length || s.tracks[ti].type !== s.tracks[fi].type || s.tracks[ti].locked) ti = fi;
        return { id: c.id, start: c.start + delta, trackId: s.tracks[ti].id };
      });
      s.placeClips(placements);
    } else if (d.mode === "left") {
      const o = d.orig;
      const maxBack = clip.kind === "media" && asset && asset.type !== "image" ? o.trimIn / o.speed : Infinity;
      let newStart = o.start + dx;
      newStart = clamp(newStart, o.start - maxBack, o.start + o.duration - MIN_DURATION);
      if (snapOn) {
        const r = snapValue(newStart, targets, threshold);
        newStart = r.value;
        setSnapLine(r.snapped);
      }
      newStart = clamp(Math.round(newStart * fps) / fps, Math.max(0, o.start - maxBack), o.start + o.duration - MIN_DURATION);
      const deltaStart = newStart - o.start;
      applyTrim(selIdsForTrim(d), (c) => {
        const co = d.origAll.find((x) => x.id === c.id) ?? c;
        const ns = co.start + deltaStart;
        const nd = co.duration - deltaStart;
        if (nd < MIN_DURATION) return {};
        return { start: ns, duration: nd, trimIn: Math.max(0, co.trimIn + deltaStart * co.speed) };
      });
    } else {
      const o = d.orig;
      let newDur = o.duration + dx;
      const maxDur = clip.kind === "media" && asset && asset.type !== "image" ? (asset.duration - o.trimIn) / o.speed : Infinity;
      newDur = clamp(newDur, MIN_DURATION, maxDur);
      if (snapOn) {
        const r = snapValue(o.start + newDur, targets, threshold);
        newDur = clamp(r.value - o.start, MIN_DURATION, maxDur);
        setSnapLine(r.snapped);
      }
      newDur = clamp(Math.round(newDur * fps) / fps, MIN_DURATION, maxDur);
      const deltaDur = newDur - o.duration;
      applyTrim(selIdsForTrim(d), (c) => {
        const co = d.origAll.find((x) => x.id === c.id) ?? c;
        const nd = co.duration + deltaDur;
        if (nd < MIN_DURATION) return {};
        return { duration: nd };
      });
    }
  }

  function selIdsForTrim(d: NonNullable<typeof dragRef.current>) {
    // trim linked partners + all selected clips together
    const s = useEditorStore.getState();
    const ids = new Set(d.origAll.map((c) => c.id));
    if (d.orig.linkGroup) for (const c of allClips(s.tracks)) if (c.linkGroup === d.orig.linkGroup) ids.add(c.id);
    return Array.from(ids);
  }

  function applyTrim(ids: string[], fn: (c: Clip) => Partial<Clip>) {
    useEditorStore.getState().updateClips(ids, fn, false);
  }

  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    const d = dragRef.current;
    dragRef.current = null;
    setSnapLine(null);
    const s = useEditorStore.getState();
    if (d?.moved) {
      if (d.mode === "move" || d.mode === "left" || d.mode === "right") s.resolveOverlaps(d.origAll.map((c) => c.id));
      s.commitHistory();
    }
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const s = useEditorStore.getState();
    if (!s.selectedClipIds.includes(clip.id)) s.selectClip(clip.id);
    setMenu({ x: e.clientX, y: e.clientY });
  }

  const tIn = clip.transitionIn;
  const fadeInW = (isAudioTrack ? clip.audio.fadeIn : clip.effects.fadeIn) * pxPerSec;
  const fadeOutW = (isAudioTrack ? clip.audio.fadeOut : clip.effects.fadeOut) * pxPerSec;
  const compact = height <= 36;

  return (
    <div
      data-clip-id={clip.id}
      onPointerDown={(e) => beginDrag("move", e)}
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={onContextMenu}
      onDoubleClick={(e) => {
        e.stopPropagation();
        useEditorStore.getState().setRightTab("inspector");
      }}
      className={cn(
        "group absolute top-[3px] bottom-[3px] select-none overflow-hidden rounded-[5px] transition-shadow",
        selected ? "z-10 shadow-[0_0_0_1.5px_#fff,0_0_0_3px_rgba(99,102,241,0.7)]" : "shadow-[0_0_0_1px_rgba(0,0,0,0.6)]",
        track.locked && "opacity-60",
        tool === "razor" && "cursor-[crosshair]",
        tool === "slip" && "cursor-ew-resize",
        missing && "outline outline-1 outline-red-500"
      )}
      style={{ left, width, background: isAudioTrack ? `linear-gradient(180deg, ${clip.color}55, ${clip.color}33)` : `linear-gradient(180deg, ${clip.color}cc, ${clip.color}88)` }}
    >
      {/* content */}
      {isAudioTrack && asset ? (
        <Waveform asset={asset} clip={clip} height={height - 6} />
      ) : clip.kind === "media" && asset?.type === "video" && !compact ? (
        <Filmstrip asset={asset} clip={clip} pxPerSec={pxPerSec} height={height - 6} />
      ) : clip.kind === "media" && asset?.type === "image" && !compact ? (
        <div className="absolute inset-0 opacity-60" style={{ backgroundImage: `url(${asset.thumbnail})`, backgroundRepeat: "repeat-x", backgroundSize: "auto 100%" }} />
      ) : clip.kind === "solid" && clip.solid ? (
        <div className="absolute inset-0 opacity-70" style={{ background: clip.solid.gradient ? `linear-gradient(${clip.solid.gradient.angle}deg, ${clip.solid.gradient.from}, ${clip.solid.gradient.to})` : clip.solid.color }} />
      ) : clip.kind === "adjustment" ? (
        <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(255,255,255,0.12)_6px_12px)]" />
      ) : null}

      {/* fades */}
      {fadeInW > 0 && <div className="pointer-events-none absolute left-0 top-0 h-full bg-black/45" style={{ width: fadeInW, clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />}
      {fadeOutW > 0 && <div className="pointer-events-none absolute right-0 top-0 h-full bg-black/45" style={{ width: fadeOutW, clipPath: "polygon(100% 0, 100% 100%, 0 0)" }} />}

      {/* transition in badge */}
      {tIn && tIn.type !== "none" && !isAudioTrack && (
        <div
          className="pointer-events-none absolute left-0 top-0 flex h-full items-center justify-center border-r border-white/40 bg-white/25 backdrop-blur-[1px]"
          style={{ width: Math.max(6, tIn.duration * pxPerSec) }}
          title={transitionName(tIn.type)}
        >
          {tIn.duration * pxPerSec > 40 && <span className="truncate px-1 text-[9px] font-semibold uppercase tracking-wide text-white drop-shadow">{transitionName(tIn.type)}</span>}
        </div>
      )}

      {/* label */}
      <div className={cn("relative flex items-center gap-1 px-1.5 text-white", compact ? "h-full" : "h-[18px]")}>
        <div className="flex min-w-0 items-center gap-1 rounded bg-black/35 px-1 py-px backdrop-blur-[2px]">
          <Icon size={10} className="shrink-0 opacity-90" />
          <span className="truncate text-[10px] font-medium leading-4">{clip.name}</span>
          {clip.freeze ? (
            <span className="shrink-0 font-mono text-[9px] text-sky-300">FREEZE</span>
          ) : clip.speedRamp && clip.speedRamp.length ? (
            <span className="shrink-0 font-mono text-[9px] text-amber-300">RAMP</span>
          ) : clip.speed !== 1 ? (
            <span className="shrink-0 font-mono text-[9px] text-amber-300">{clip.speed}×</span>
          ) : null}
          {clip.reverse && <span className="shrink-0 font-mono text-[9px] text-fuchsia-300">◀ REV</span>}
          {linked && <Link2 size={9} className="shrink-0 opacity-70" />}
          {hasKeyframes(clip) && <Diamond size={8} className="shrink-0 fill-amber-300 text-amber-300" />}
          {clip.blendMode !== "source-over" && <Blend size={9} className="shrink-0 opacity-80" />}
          {clip.audio.muted && isAudioTrack && <Volume2 size={9} className="shrink-0 text-red-300" />}
          {missing && <span className="text-[9px] font-semibold text-red-300">MISSING</span>}
        </div>
      </div>

      {/* keyframe markers */}
      {kfTimes.length > 0 && !compact && (
        <div className="pointer-events-none absolute bottom-1 left-0 right-0 h-2">
          {kfTimes.map((t) => (
            <div key={t} className="absolute h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-amber-300 shadow" style={{ left: t * pxPerSec }} />
          ))}
        </div>
      )}

      {/* trim handles */}
      {!track.locked && (tool === "select" || tool === "ripple" || tool === "roll") && (
        <>
          <div onPointerDown={(e) => beginDrag("left", e)} className="absolute left-0 top-0 z-10 h-full w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100">
            <div className="ml-0.5 mt-[25%] h-1/2 w-1 rounded-full bg-white/90" />
          </div>
          <div onPointerDown={(e) => beginDrag("right", e)} className="absolute right-0 top-0 z-10 h-full w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100">
            <div className="ml-0.5 mt-[25%] h-1/2 w-1 rounded-full bg-white/90" />
          </div>
        </>
      )}

      {menu && <ClipContextMenu clip={clip} track={track} x={menu.x} y={menu.y} onClose={() => { setMenu(null); setColorMenu(false); }} colorMenu={colorMenu} setColorMenu={setColorMenu} />}
    </div>
  );
}

// ── Context menu ────────────────────────────────────────────────────────────

function ClipContextMenu({ clip, track, x, y, onClose, colorMenu, setColorMenu }: { clip: Clip; track: Track; x: number; y: number; onClose: () => void; colorMenu: boolean; setColorMenu: (v: boolean) => void }) {
  const s = useEditorStore.getState();
  const sel = s.selectedClipIds.length ? s.selectedClipIds : [clip.id];
  const linkedCount = clip.linkGroup ? allClips(s.tracks).filter((c) => c.linkGroup === clip.linkGroup).length : 0;
  const canDetach = track.type === "video" && clip.kind === "media" && !clip.audioDetached && s.mediaAssets.find((m) => m.id === clip.mediaId)?.type === "video";
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const px = Math.min(x, vw - 230);
  const py = Math.min(y, vh - 380);
  return (
    <div className="fixed inset-0 z-[200]" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div className="absolute w-[215px] rounded-lg border border-white/10 bg-[#1c1c20] py-1 text-xs shadow-2xl" style={{ left: px, top: py }} onClick={(e) => e.stopPropagation()}>
        <MenuItem icon={<Scissors size={12} />} label="Split at playhead" kbd="S" onClick={run(() => s.splitAtTime(s.currentTime, sel))} />
        <MenuItem icon={<AlignStartVertical size={12} />} label="Align to playhead" onClick={run(() => s.alignClipsToPlayhead(sel))} />
        <MenuItem icon={<Copy size={12} />} label="Duplicate" kbd="⌘D" onClick={run(() => s.duplicateClips(sel))} />
        <div className="my-1 h-px bg-white/5" />
        <MenuItem icon={<Gauge size={12} />} label="Speed / duration…" onClick={run(() => { s.setRightTab("inspector"); })} />
        {clip.kind === "media" && track.type === "video" && !clip.freeze && (
          <>
            <MenuItem icon={<Snowflake size={12} />} label="Add freeze frame (2s)" kbd="⇧F" onClick={run(() => s.freezeFrameAtPlayhead(clip.id, 2))} />
            <MenuItem icon={<Rewind size={12} />} label={clip.reverse ? "Play forwards" : "Reverse clip"} onClick={run(() => s.setClipReverse(clip.id, !clip.reverse))} />
          </>
        )}
        <div className="my-1 h-px bg-white/5" />
        <MenuItem icon={<ClipboardCopy size={12} />} label="Copy attributes" kbd="⌥⌘C" onClick={run(() => s.copyAttributes(clip.id))} />
        {s.attributesClipboard && <MenuItem icon={<ClipboardPaste size={12} />} label="Paste attributes" kbd="⌥⌘V" onClick={run(() => s.pasteAttributes(sel))} />}
        {sel.length > 1 && <MenuItem icon={<Link2 size={12} />} label="Link clips" kbd="⌘L" onClick={run(() => s.linkClips(sel))} />}
        {linkedCount > 1 && <MenuItem icon={<Unlink2 size={12} />} label="Unlink" onClick={run(() => s.unlinkClips([clip.id]))} />}
        {canDetach && <MenuItem icon={<Music4 size={12} />} label="Detach audio" onClick={run(() => s.detachAudio(clip.id))} />}
        <div className="relative">
          <MenuItem icon={<Palette size={12} />} label="Label color" onClick={() => setColorMenu(!colorMenu)} right="›" />
          {colorMenu && (
            <div className="absolute left-full top-0 ml-1 grid w-[132px] grid-cols-4 gap-1 rounded-lg border border-white/10 bg-[#1c1c20] p-2 shadow-2xl">
              {CLIP_COLOR_LABELS.map((c) => (
                <button key={c.color} title={c.label} onClick={run(() => s.setClipColor(sel, c.color))} className="h-6 w-6 rounded-md border border-black/40 hover:scale-110" style={{ background: c.color }} />
              ))}
            </div>
          )}
        </div>
        <div className="my-1 h-px bg-white/5" />
        <MenuItem icon={<Trash2 size={12} />} label="Delete" kbd="⌫" onClick={run(() => s.removeClips(sel, false))} />
        <MenuItem icon={<Trash2 size={12} />} label="Ripple delete" kbd="⇧⌫" onClick={run(() => s.removeClips(sel, true))} danger />
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger, kbd, right }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; kbd?: string; right?: string }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-neutral-200 hover:bg-white/5", danger && "text-red-400 hover:bg-red-500/10")}>
      <span className="text-neutral-500">{icon}</span>
      <span className="flex-1">{label}</span>
      {kbd && <span className="font-mono text-[10px] text-neutral-600">{kbd}</span>}
      {right && <span className="text-neutral-500">{right}</span>}
    </button>
  );
}
