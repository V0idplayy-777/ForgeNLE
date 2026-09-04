import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useEditorStore } from "../../store/useEditorStore";
import { usePlaybackClock } from "../../hooks/usePlaybackClock";
import { getPreviewEngine } from "../../lib/playbackEngine";
import { getClipBounds, isClipActive, renderFrame } from "../../lib/renderer";
import { clamp, findClip, formatTimecode, getProjectDuration } from "../../lib/utils";
import { warmFonts } from "../../lib/presets";
import { Clip } from "../../types";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronFirst,
  ChevronLast,
  Maximize2,
  Repeat,
  Volume2,
  VolumeX,
  Grid3X3,
  Crosshair,
  MonitorPlay,
  Camera,
} from "lucide-react";
import { IconBtn } from "../ui/controls";
import { cn } from "../../utils/cn";
import { exportStill } from "../../lib/exportEngine";
import { downloadBlob, safeFilename } from "../../lib/utils";

const QUALITY_SCALE = { full: 1, half: 0.5, quarter: 0.25 } as const;

export default function PreviewPlayer() {
  const engine = useMemo(() => getPreviewEngine(), []);
  usePlaybackClock(() => {
    const ctx = engine.audioContext;
    return ctx && ctx.state === "running" ? ctx.currentTime : null;
  });

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stageSize, setStageSize] = useState({ w: 640, h: 360 });
  const [volumeOpen, setVolumeOpen] = useState(false);

  const settings = useEditorStore((s) => s.settings);
  const currentTime = useEditorStore((s) => s.currentTime);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const selectClip = useEditorStore((s) => s.selectClip);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const loopPlayback = useEditorStore((s) => s.loopPlayback);
  const toggleLoop = useEditorStore((s) => s.toggleLoop);
  const masterVolume = useEditorStore((s) => s.masterVolume);
  const masterMuted = useEditorStore((s) => s.masterMuted);
  const setMasterVolume = useEditorStore((s) => s.setMasterVolume);
  const toggleMasterMute = useEditorStore((s) => s.toggleMasterMute);
  const showSafeZones = useEditorStore((s) => s.showSafeZones);
  const toggleSafeZones = useEditorStore((s) => s.toggleSafeZones);
  const showGrid = useEditorStore((s) => s.showGrid);
  const toggleGrid = useEditorStore((s) => s.toggleGrid);
  const previewQuality = useEditorStore((s) => s.previewQuality);
  const setPreviewQuality = useEditorStore((s) => s.setPreviewQuality);
  const jumpToEdit = useEditorStore((s) => s.jumpToEdit);
  const inPoint = useEditorStore((s) => s.inPoint);
  const outPoint = useEditorStore((s) => s.outPoint);
  const tracksLen = useEditorStore((s) => s.tracks.length);
  const duration = useEditorStore((s) => getProjectDuration(s.tracks));
  const notify = useEditorStore((s) => s.notify);

  useEffect(() => {
    warmFonts();
  }, []);

  // Fit the frame inside the stage box.
  useEffect(() => {
    const el = stageRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const padW = rect.width - 32;
      const padH = rect.height - 32;
      const ar = settings.width / settings.height;
      let w = padW;
      let h = w / ar;
      if (h > padH) {
        h = padH;
        w = h * ar;
      }
      setStageSize({ w: Math.max(160, Math.floor(w)), h: Math.max(90, Math.floor(h)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [settings.width, settings.height]);

  // Render loop — one draw per animation frame while anything changes.
  const dirty = useRef(true);
  useEffect(() => {
    const unsub = useEditorStore.subscribe(() => {
      dirty.current = true;
    });
    return unsub;
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastPlaying = false;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const s = useEditorStore.getState();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const playing = s.isPlaying;
      const scale = QUALITY_SCALE[s.previewQuality] * (window.devicePixelRatio > 1 ? 1.25 : 1);
      const targetW = Math.min(s.settings.width, Math.round(stageSize.w * scale * 2));
      const targetH = Math.round(targetW * (s.settings.height / s.settings.width));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        dirty.current = true;
      }
      const rate = s.shuttleRate !== 0 ? s.shuttleRate : 1;
      engine.sync({ tracks: s.tracks, assets: s.mediaAssets, masterVolume: s.masterVolume, masterMuted: s.masterMuted }, s.currentTime, playing, rate);
      if (playing !== lastPlaying) {
        lastPlaying = playing;
        if (!playing) engine.pauseAll();
      }
      // While media is still loading we keep redrawing so frames appear once ready.
      if (!dirty.current && !playing && !hasPendingMedia(s.tracks, s.currentTime)) return;
      dirty.current = false;
      const ctx = canvas.getContext("2d", { alpha: false })!;
      renderFrame(ctx, { settings: s.settings, tracks: s.tracks, assets: s.mediaAssets, getSource: (c) => engine.getSource(c, s.mediaAssets) }, s.currentTime);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine, stageSize.w]);

  // Prune pool when clips are removed
  useEffect(() => {
    const unsub = useEditorStore.subscribe((s, prev) => {
      if (s.tracks !== prev.tracks) {
        const ids = new Set(s.tracks.flatMap((t) => t.clips.map((c) => c.id)));
        engine.prune(ids);
      }
    });
    return unsub;
  }, [engine]);

  // Unlock audio on first play
  const handleTogglePlay = useCallback(() => {
    engine.ensureAudio();
    togglePlay();
  }, [engine, togglePlay]);

  useEffect(() => {
    const unlock = () => engine.ensureAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [engine]);

  async function snapshot() {
    const s = useEditorStore.getState();
    try {
      const blob = await exportStill({ tracks: s.tracks, assets: s.mediaAssets, settings: s.settings }, s.currentTime, s.settings.width, s.settings.height);
      downloadBlob(blob, `${safeFilename(s.projectName)}-${formatTimecode(s.currentTime, s.settings.fps).replace(/:/g, "-")}.png`);
      notify("Frame saved as PNG", "success");
    } catch (e: any) {
      notify(e?.message || "Could not export frame", "error");
    }
  }

  const fps = settings.fps;
  const frameScale = stageSize.w / settings.width;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0b0b0d]">
      {/* Stage */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div
          data-preview-stage
          ref={stageRef}
          className="relative overflow-hidden rounded-md bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_30px_80px_-20px_rgba(0,0,0,0.8)]"
          style={{ width: stageSize.w, height: stageSize.h }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "CANVAS") {
              // Hit test top-most clip under pointer
              const hit = hitTest(e, stageRef.current!, frameScale);
              selectClip(hit);
            }
          }}
        >
          <canvas ref={canvasRef} className="h-full w-full" style={{ imageRendering: "auto" }} />
          {showGrid && <GridOverlay />}
          {showSafeZones && <SafeZones />}
          {selectedClipId && <TransformGizmo clipId={selectedClipId} frameScale={frameScale} stageRef={stageRef} />}
          {tracksLen > 0 && duration === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-600">
              <MonitorPlay size={28} strokeWidth={1.25} />
              <span className="text-[11px] uppercase tracking-[0.2em]">Drop media on the timeline</span>
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 text-[10px] text-neutral-500">
          <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono">
            {settings.width}×{settings.height} · {fps}fps
          </span>
        </div>
      </div>

      {/* Transport */}
      <div className="flex h-11 shrink-0 items-center gap-1 border-t border-white/5 bg-[#101012] px-3">
        <TimecodeInput value={currentTime} fps={fps} onChange={(t) => setCurrentTime(clamp(t, 0, Math.max(duration, t)))} />
        <div className="mx-1 h-4 w-px bg-white/10" />
        <IconBtn title="Go to start (Home)" onClick={() => setCurrentTime(inPoint ?? 0)}>
          <ChevronFirst size={16} />
        </IconBtn>
        <IconBtn title="Previous edit (↑)" onClick={() => jumpToEdit(-1)}>
          <SkipBack size={14} />
        </IconBtn>
        <button
          type="button"
          className="mx-1 flex h-8 w-8 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 active:scale-95"
          title="Play / Pause (Space)"
          onClick={handleTogglePlay}
        >
          {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
        </button>
        <IconBtn title="Next edit (↓)" onClick={() => jumpToEdit(1)}>
          <SkipForward size={14} />
        </IconBtn>
        <IconBtn title="Go to end (End)" onClick={() => setCurrentTime(outPoint ?? duration)}>
          <ChevronLast size={16} />
        </IconBtn>
        <IconBtn title="Loop playback" active={loopPlayback} onClick={toggleLoop}>
          <Repeat size={14} />
        </IconBtn>
        <span className="ml-2 font-mono text-[11px] text-neutral-500">{formatTimecode(duration, fps)}</span>

        <div className="ml-auto flex items-center gap-1">
          <div className="relative" onMouseEnter={() => setVolumeOpen(true)} onMouseLeave={() => setVolumeOpen(false)}>
            <IconBtn title={masterMuted ? "Unmute" : "Mute"} onClick={toggleMasterMute} active={false}>
              {masterMuted || masterVolume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </IconBtn>
            {volumeOpen && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 rounded-lg border border-white/10 bg-[#1a1a1e] p-2 shadow-xl">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={masterMuted ? 0 : masterVolume}
                  onChange={(e) => setMasterVolume(Number(e.target.value))}
                  className="fx-slider h-24 w-24"
                  style={{ writingMode: "vertical-lr", direction: "rtl", ["--pct" as any]: `${masterMuted ? 0 : masterVolume}%` }}
                />
              </div>
            )}
          </div>
          <select
            value={previewQuality}
            onChange={(e) => setPreviewQuality(e.target.value as any)}
            className="h-6 rounded border border-white/5 bg-white/[0.04] px-1 text-[10px] text-neutral-300 outline-none"
            title="Preview quality"
          >
            <option value="full">Full</option>
            <option value="half">1/2</option>
            <option value="quarter">1/4</option>
          </select>
          <IconBtn title="Rule of thirds grid" active={showGrid} onClick={toggleGrid}>
            <Grid3X3 size={14} />
          </IconBtn>
          <IconBtn title="Safe zones" active={showSafeZones} onClick={toggleSafeZones}>
            <Crosshair size={14} />
          </IconBtn>
          <IconBtn title="Save current frame as PNG" onClick={snapshot}>
            <Camera size={14} />
          </IconBtn>
          <IconBtn
            title="Fullscreen (F)"
            onClick={() => {
              const el = stageRef.current;
              if (!el) return;
              if (document.fullscreenElement) document.exitFullscreen();
              else el.requestFullscreen?.();
            }}
          >
            <Maximize2 size={14} />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

function hasPendingMedia(tracks: ReturnType<typeof useEditorStore.getState>["tracks"], t: number) {
  const engine = getPreviewEngine();
  const assets = useEditorStore.getState().mediaAssets;
  for (const tr of tracks) {
    if (tr.type !== "video" || tr.hidden) continue;
    for (const c of tr.clips) {
      if (c.kind !== "media" || !isClipActive(c, t)) continue;
      if (!engine.getSource(c, assets)) return true;
    }
  }
  return false;
}

function hitTest(e: React.PointerEvent, stage: HTMLDivElement, frameScale: number): string | null {
  const s = useEditorStore.getState();
  const rect = stage.getBoundingClientRect();
  const px = (e.clientX - rect.left) / frameScale;
  const py = (e.clientY - rect.top) / frameScale;
  const engine = getPreviewEngine();
  for (const track of s.tracks) {
    if (track.type !== "video" || track.hidden || track.locked) continue;
    for (const clip of [...track.clips].reverse()) {
      if (!isClipActive(clip, s.currentTime) || clip.kind === "adjustment") continue;
      const b = getClipBounds(clip, s.currentTime, s.settings, clip.kind === "media" ? engine.getSource(clip, s.mediaAssets) : null);
      if (!b) continue;
      // inverse transform point
      const rad = (-b.rotation * Math.PI) / 180;
      const dx = px - b.cx;
      const dy = py - b.cy;
      const lx = (dx * Math.cos(rad) - dy * Math.sin(rad)) / b.scale;
      const ly = (dx * Math.sin(rad) + dy * Math.cos(rad)) / b.scale;
      if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return clip.id;
    }
  }
  return null;
}

// ── Overlays ────────────────────────────────────────────────────────────────

function GridOverlay() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      {[33.333, 66.666].map((v) => (
        <g key={v} stroke="rgba(255,255,255,0.35)" strokeWidth={0.15} vectorEffect="non-scaling-stroke">
          <line x1={v} y1={0} x2={v} y2={100} />
          <line x1={0} y1={v} x2={100} y2={v} />
        </g>
      ))}
    </svg>
  );
}

function SafeZones() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-[5%] rounded-sm border border-dashed border-amber-400/50" title="Action safe" />
      <div className="absolute inset-[10%] rounded-sm border border-dashed border-emerald-400/50" title="Title safe" />
      <div className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-white/50" />
      <div className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 bg-white/50" />
    </div>
  );
}

// ── Transform gizmo ─────────────────────────────────────────────────────────

function TransformGizmo({ clipId, frameScale, stageRef }: { clipId: string; frameScale: number; stageRef: React.RefObject<HTMLDivElement | null> }) {
  const found = useEditorStore(useShallow((s) => findClip(s.tracks, clipId)));
  const currentTime = useEditorStore((s) => s.currentTime);
  const settings = useEditorStore((s) => s.settings);
  const updateClipTransform = useEditorStore((s) => s.updateClipTransform);
  const setKeyframeValue = useEditorStore((s) => s.setKeyframeValue);
  const commitHistory = useEditorStore((s) => s.commitHistory);
  const [, force] = useState(0);
  useEffect(() => {
    // re-measure when media becomes ready
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  if (!found || found.track.type !== "video" || found.track.locked || found.clip.kind === "adjustment" || !isClipActive(found.clip, currentTime)) return null;
  const clip = found.clip;
  const engine = getPreviewEngine();
  const b = getClipBounds(clip, currentTime, settings, clip.kind === "media" ? engine.getSource(clip, useEditorStore.getState().mediaAssets) : null);
  if (!b) return null;

  const cx = b.cx * frameScale;
  const cy = b.cy * frameScale;
  const w = b.w * b.scale * frameScale;
  const h = b.h * b.scale * frameScale;

  const applyTransform = (patch: Partial<Clip["transform"]>) => {
    const k = clip.keyframes;
    const animated = (p: "x" | "y" | "scale" | "rotation") => k[p] && k[p]!.length > 0;
    const plain: Partial<Clip["transform"]> = {};
    for (const [key, v] of Object.entries(patch) as [keyof Clip["transform"], number][]) {
      if (animated(key)) setKeyframeValue(clip.id, key, v);
      else plain[key] = v;
    }
    if (Object.keys(plain).length) updateClipTransform(clip.id, plain);
  };

  function startMove(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const ox = b!.cx - settings.width / 2;
    const oy = b!.cy - settings.height / 2;
    // account for crop offset: keep delta-based
    const t0 = { x: clip.transform.x, y: clip.transform.y };
    const move = (ev: PointerEvent) => {
      let dx = (ev.clientX - startX) / frameScale;
      let dy = (ev.clientY - startY) / frameScale;
      if (ev.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
      let nx = t0.x + dx;
      let ny = t0.y + dy;
      // snap to center
      if (!ev.altKey) {
        if (Math.abs(ox + dx) < 8) nx = t0.x - ox;
        if (Math.abs(oy + dy) < 8) ny = t0.y - oy;
      }
      applyTransform({ x: Math.round(nx), y: Math.round(ny) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      commitHistory();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startScale(e: React.PointerEvent, corner: [number, number]) {
    e.stopPropagation();
    e.preventDefault();
    const rect = stageRef.current!.getBoundingClientRect();
    const centerX = rect.left + cx;
    const centerY = rect.top + cy;
    const d0 = Math.hypot(e.clientX - centerX, e.clientY - centerY);
    const s0 = b!.scale;
    const move = (ev: PointerEvent) => {
      const d = Math.hypot(ev.clientX - centerX, ev.clientY - centerY);
      const ns = clamp((s0 * d) / Math.max(1, d0), 0.01, 20);
      applyTransform({ scale: Math.round(ns * 1000) / 1000 });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      commitHistory();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    void corner;
  }

  function startRotate(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    const rect = stageRef.current!.getBoundingClientRect();
    const centerX = rect.left + cx;
    const centerY = rect.top + cy;
    const a0 = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    const r0 = b!.rotation;
    const move = (ev: PointerEvent) => {
      const a = Math.atan2(ev.clientY - centerY, ev.clientX - centerX);
      let deg = r0 + ((a - a0) * 180) / Math.PI;
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      else if (Math.abs(deg % 90) < 3) deg = Math.round(deg / 90) * 90;
      applyTransform({ rotation: Math.round(deg * 10) / 10 });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      commitHistory();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const handle = "absolute h-2.5 w-2.5 rounded-sm border border-indigo-500 bg-white shadow";
  return (
    <div
      className="absolute"
      style={{ left: cx, top: cy, width: w, height: h, transform: `translate(-50%,-50%) rotate(${b.rotation}deg)` }}
    >
      <div className="absolute inset-0 cursor-move border border-indigo-400/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" onPointerDown={startMove} />
      <div className={cn(handle, "-left-1.5 -top-1.5 cursor-nwse-resize")} onPointerDown={(e) => startScale(e, [-1, -1])} />
      <div className={cn(handle, "-right-1.5 -top-1.5 cursor-nesw-resize")} onPointerDown={(e) => startScale(e, [1, -1])} />
      <div className={cn(handle, "-bottom-1.5 -left-1.5 cursor-nesw-resize")} onPointerDown={(e) => startScale(e, [-1, 1])} />
      <div className={cn(handle, "-bottom-1.5 -right-1.5 cursor-nwse-resize")} onPointerDown={(e) => startScale(e, [1, 1])} />
      <div className="absolute left-1/2 -top-7 h-5 w-px -translate-x-1/2 bg-indigo-400/80" />
      <div
        className="absolute left-1/2 -top-9 h-3 w-3 -translate-x-1/2 cursor-grab rounded-full border border-indigo-500 bg-white shadow active:cursor-grabbing"
        onPointerDown={startRotate}
        title="Rotate (Shift = 15° steps)"
      />
    </div>
  );
}

// ── Timecode input ──────────────────────────────────────────────────────────

function TimecodeInput({ value, fps, onChange }: { value: number; fps: number; onChange: (t: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  if (!editing)
    return (
      <button
        className="rounded px-1.5 py-0.5 font-mono text-[12px] tabular-nums text-white hover:bg-white/5"
        onClick={() => {
          setText(formatTimecode(value, fps));
          setEditing(true);
        }}
        title="Click to type a timecode"
      >
        {formatTimecode(value, fps)}
      </button>
    );
  return (
    <input
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          const t = parseTimecode(text, fps);
          if (t !== null) onChange(t);
          setEditing(false);
        }
        if (e.key === "Escape") setEditing(false);
      }}
      onBlur={() => setEditing(false)}
      className="w-[104px] rounded border border-indigo-500 bg-neutral-900 px-1.5 py-0.5 font-mono text-[12px] text-white outline-none"
    />
  );
}

function parseTimecode(s: string, fps: number): number | null {
  const parts = s.trim().split(/[:;.]/).map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  while (parts.length < 4) parts.unshift(0);
  const [h, m, sec, f] = parts.slice(-4);
  return h * 3600 + m * 60 + sec + f / fps;
}
