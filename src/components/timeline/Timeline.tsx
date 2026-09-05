import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useEditorStore } from "../../store/useEditorStore";
import { getProjectDuration, formatTimecode } from "../../lib/utils";
import Ruler from "./Ruler";
import TrackHeader, { TRACK_HEIGHTS } from "./TrackHeader";
import TrackLane from "./TrackLane";
import { TimelineContext } from "./timelineContext";
import {
  Plus,
  Scissors,
  Trash2,
  Magnet,
  ZoomIn,
  ZoomOut,
  MousePointer2,
  Slice,
  Hand,
  Link2,
  Flag,
  Maximize,
  Rows3,
  Bookmark,
  Split,
  Undo2,
  Redo2,
  ChevronsLeftRight,
  SeparatorVertical,
  MoveHorizontal,
  Music2,
} from "lucide-react";
import { IconBtn } from "../ui/controls";
import { cn } from "../../utils/cn";

const HEADER_W = 176;

export default function Timeline() {
  const tracks = useEditorStore((s) => s.tracks);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const currentTime = useEditorStore((s) => s.currentTime);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const snapping = useEditorStore((s) => s.snapping);
  const toggleSnapping = useEditorStore((s) => s.toggleSnapping);
  const rippleMode = useEditorStore((s) => s.rippleMode);
  const toggleRipple = useEditorStore((s) => s.toggleRipple);
  const addTrack = useEditorStore((s) => s.addTrack);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const splitAtTime = useEditorStore((s) => s.splitAtTime);
  const removeClips = useEditorStore((s) => s.removeClips);
  const linkClips = useEditorStore((s) => s.linkClips);
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const addMarker = useEditorStore((s) => s.addMarker);
  const fps = useEditorStore((s) => s.settings.fps);
  const selectClips = useEditorStore((s) => s.selectClips);
  const selectClip = useEditorStore((s) => s.selectClip);
  const inPoint = useEditorStore((s) => s.inPoint);
  const outPoint = useEditorStore((s) => s.outPoint);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.past.length > 0 || s.pending !== null);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const beatGridOn = useEditorStore((s) => s.beatGridOn);
  const toggleBeatGrid = useEditorStore((s) => s.toggleBeatGrid);
  const beatGridAssetId = useEditorStore((s) => s.beatGridAssetId);
  const setBeatGridAsset = useEditorStore((s) => s.setBeatGridAsset);
  const beatAssets = useEditorStore(useShallow((s) => s.mediaAssets.filter((m) => m.beats && m.beats.times.length > 0)));

  const scrollRef = useRef<HTMLDivElement>(null);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [viewportW, setViewportW] = useState(1000);
  const wasPlayingRef = useRef(false);

  const duration = getProjectDuration(tracks);
  const contentWidth = Math.max(duration * zoom + viewportW * 0.6, viewportW - HEADER_W + 200);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the playhead in view while playing
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isPlaying) return;
    const x = currentTime * zoom;
    const visL = el.scrollLeft;
    const visR = el.scrollLeft + el.clientWidth - HEADER_W;
    if (x > visR - 40 || x < visL) el.scrollLeft = Math.max(0, x - 80);
  }, [currentTime, isPlaying, zoom]);

  const clientXToTime = useCallback(
    (x: number) => {
      const el = scrollRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return (x - rect.left - HEADER_W + el.scrollLeft) / zoom;
    },
    [zoom]
  );

  const zoomToFit = useCallback(() => {
    const el = scrollRef.current;
    if (!el || duration <= 0) return;
    setZoom(((el.clientWidth - HEADER_W - 40) / duration) | 0);
    el.scrollLeft = 0;
  }, [duration, setZoom]);

  // Expose to keyboard shortcuts
  useEffect(() => {
    (window as any).__forgeZoomFit = zoomToFit;
  }, [zoomToFit]);

  // Wheel: ctrl/cmd + wheel zooms around cursor; shift + wheel scrolls horizontally
  function onWheel(e: React.WheelEvent) {
    const el = scrollRef.current;
    if (!el) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - HEADER_W + el.scrollLeft;
      const tAtMouse = mouseX / zoom;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nz = Math.min(800, Math.max(4, zoom * factor));
      setZoom(nz);
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, tAtMouse * nz - (e.clientX - rect.left - HEADER_W));
      });
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // native horizontal scroll works
    }
  }

  // Background pointer down: seek + start marquee selection
  function onBackgroundPointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-clip-id]") || target.closest("[data-track-header]")) return;
    if (e.button !== 0) return;
    // Stop native text selection / drag from cancelling the pointer sequence.
    e.preventDefault();
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    const startX = e.clientX - rect.left + el.scrollLeft;
    const startY = e.clientY - rect.top + el.scrollTop;
    if (startX < HEADER_W) return;

    if (tool === "hand") {
      const sl = el.scrollLeft;
      const sx = e.clientX;
      const move = (ev: PointerEvent) => (el.scrollLeft = sl - (ev.clientX - sx));
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }

    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (!additive) selectClip(null);
    const t = Math.max(0, (startX - HEADER_W) / zoom);
    setIsPlaying(false);
    if (tool === "razor") {
      splitAtTime(Math.round(t * fps) / fps);
      return;
    }
    setCurrentTime(Math.round(t * fps) / fps);
    let dragging = false;
    const startSel = additive ? [...useEditorStore.getState().selectedClipIds] : [];
    const move = (ev: PointerEvent) => {
      const x = ev.clientX - rect.left + el.scrollLeft;
      const y = ev.clientY - rect.top + el.scrollTop;
      if (!dragging && Math.hypot(x - startX, y - startY) < 4) return;
      dragging = true;
      const box = { x1: Math.min(startX, x), y1: Math.min(startY, y), x2: Math.max(startX, x), y2: Math.max(startY, y) };
      setMarquee(box);
      // hit test
      const t1 = (box.x1 - HEADER_W) / zoom;
      const t2 = (box.x2 - HEADER_W) / zoom;
      let yCursor = 32; // ruler height
      const ids: string[] = [...startSel];
      for (const tr of useEditorStore.getState().tracks) {
        const h = TRACK_HEIGHTS[tr.height];
        const top = yCursor;
        const bottom = yCursor + h;
        yCursor = bottom;
        if (bottom < box.y1 || top > box.y2 || tr.locked) continue;
        for (const c of tr.clips) {
          if (c.start < t2 && c.start + c.duration > t1 && !ids.includes(c.id)) ids.push(c.id);
        }
      }
      selectClips(ids);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setMarquee(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const ctx = useMemo(() => ({ pxPerSec: zoom, fps, setSnapLine, clientXToTime, headerWidth: HEADER_W }), [zoom, fps, clientXToTime]);
  const totalTrackHeight = tracks.reduce((n, t) => n + TRACK_HEIGHTS[t.height], 0);
  const canLink = selectedClipIds.length > 1;

  // Beat grid: map the chosen asset's source-relative beats onto timeline time.
  const beatLines = useMemo(() => {
    if (!beatGridOn) return [];
    const asset = beatAssets.find((a) => a.id === beatGridAssetId) ?? beatAssets[0];
    if (!asset?.beats) return [];
    const out: { t: number; strength: number }[] = [];
    for (const track of tracks) {
      for (const c of track.clips) {
        if (c.mediaId !== asset.id) continue;
        for (let i = 0; i < asset.beats.times.length; i++) {
          const b = asset.beats.times[i];
          const local = (b - c.trimIn) / (c.speed || 1);
          if (local < 0 || local >= c.duration) continue;
          out.push({ t: c.start + local, strength: asset.beats.strengths[i] ?? 0.5 });
        }
      }
    }
    if (out.length > 900) {
      out.sort((a, b) => b.strength - a.strength);
      const kept = out.slice(0, 900);
      kept.sort((a, b) => a.t - b.t);
      return kept;
    }
    return out.sort((a, b) => a.t - b.t);
  }, [beatGridOn, beatAssets, beatGridAssetId, tracks]);

  return (
    <TimelineContext.Provider value={ctx}>
      <div className="flex min-h-0 flex-1 flex-col border-t border-white/5 bg-[#0e0e10]">
        {/* Toolbar */}
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-white/5 bg-[#131316] px-2">
          <div className="flex items-center rounded-md border border-white/5 bg-white/[0.03] p-0.5">
            <ToolBtn active={tool === "select"} onClick={() => setTool("select")} title="Select (V)">
              <MousePointer2 size={14} />
            </ToolBtn>
            <ToolBtn active={tool === "razor"} onClick={() => setTool("razor")} title="Razor (C)">
              <Slice size={14} />
            </ToolBtn>
            <ToolBtn active={tool === "ripple"} onClick={() => setTool("ripple")} title="Ripple edit (B) — trim an edge and close/open the gap after it">
              <ChevronsLeftRight size={14} />
            </ToolBtn>
            <ToolBtn active={tool === "roll"} onClick={() => setTool("roll")} title="Rolling edit (⇧N) — move the cut between two clips">
              <SeparatorVertical size={14} />
            </ToolBtn>
            <ToolBtn active={tool === "slip"} onClick={() => setTool("slip")} title="Slip (Y) — drag to change which part of the media plays">
              <MoveHorizontal size={14} />
            </ToolBtn>
            <ToolBtn active={tool === "hand"} onClick={() => setTool("hand")} title="Hand (H)">
              <Hand size={14} />
            </ToolBtn>
          </div>
          <div className="mx-1 h-5 w-px bg-white/10" />
          <IconBtn title="Undo (⌘Z)" onClick={undo} disabled={!canUndo}>
            <Undo2 size={14} />
          </IconBtn>
          <IconBtn title="Redo (⌘⇧Z)" onClick={redo} disabled={!canRedo}>
            <Redo2 size={14} />
          </IconBtn>
          <div className="mx-1 h-5 w-px bg-white/10" />
          <IconBtn title="Split at playhead (S)" onClick={() => splitAtTime(currentTime, selectedClipIds.length ? selectedClipIds : undefined)}>
            <Scissors size={14} />
          </IconBtn>
          <IconBtn title="Delete (⌫)" disabled={!selectedClipIds.length} onClick={() => removeClips(selectedClipIds, false)} danger>
            <Trash2 size={14} />
          </IconBtn>
          <IconBtn title="Link selected (⌘L)" disabled={!canLink} onClick={() => linkClips(selectedClipIds)}>
            <Link2 size={14} />
          </IconBtn>
          <IconBtn title="Add marker (M)" onClick={() => addMarker()}>
            <Bookmark size={14} />
          </IconBtn>
          <div className="mx-1 h-5 w-px bg-white/10" />
          <IconBtn title="Snapping (N)" active={snapping} onClick={toggleSnapping}>
            <Magnet size={14} />
          </IconBtn>
          <IconBtn title="Ripple edit mode (R) — deleting closes gaps" active={rippleMode} onClick={toggleRipple}>
            <Split size={14} />
          </IconBtn>
          <IconBtn title="Beat grid — draw the music's detected beats over the timeline (detect beats in Inspector → Audio first)" active={beatGridOn} onClick={toggleBeatGrid}>
            <Music2 size={14} />
          </IconBtn>
          {beatGridOn && beatAssets.length > 1 && (
            <select
              value={beatGridAssetId ?? beatAssets[0]?.id ?? ""}
              onChange={(e) => setBeatGridAsset(e.target.value)}
              className="h-6 max-w-[130px] rounded border border-white/10 bg-[#1c1c20] px-1 text-[10px] text-neutral-300 outline-none"
              title="Beat grid source"
            >
              {beatAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <div className="mx-1 h-5 w-px bg-white/10" />
          <button className="toolbar-btn" onClick={() => addTrack("video")} title="Add video track">
            <Plus size={11} /> Video
          </button>
          <button className="toolbar-btn" onClick={() => addTrack("audio")} title="Add audio track">
            <Plus size={11} /> Audio
          </button>

          <div className="ml-auto flex items-center gap-1">
            {selectedClipIds.length > 0 && (
              <span className="mr-2 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">
                {selectedClipIds.length} selected
              </span>
            )}
            {inPoint !== null && outPoint !== null && (
              <span className="mr-2 flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400" title="In/Out range">
                <Flag size={9} /> {formatTimecode(outPoint - inPoint, fps).slice(3)}
              </span>
            )}
            <IconBtn title="Zoom to fit (⇧Z)" onClick={zoomToFit}>
              <Maximize size={13} />
            </IconBtn>
            <IconBtn title="Zoom out (-)" onClick={() => setZoom(zoom / 1.3)}>
              <ZoomOut size={14} />
            </IconBtn>
            <input
              type="range"
              min={0}
              max={100}
              value={zoomToSlider(zoom)}
              onChange={(e) => setZoom(sliderToZoom(Number(e.target.value)))}
              className="fx-slider w-24"
              style={{ ["--pct" as any]: `${zoomToSlider(zoom)}%` }}
            />
            <IconBtn title="Zoom in (+)" onClick={() => setZoom(zoom * 1.3)}>
              <ZoomIn size={14} />
            </IconBtn>
          </div>
        </div>

        {/* Tracks */}
        <div className="relative min-h-0 flex-1 select-none overflow-auto overscroll-none" ref={scrollRef} onWheel={onWheel} onPointerDown={onBackgroundPointerDown}>
          <div style={{ width: HEADER_W + contentWidth, position: "relative", minHeight: "100%" }}>
            {/* Ruler row */}
            <div className="sticky top-0 z-30 flex">
              <div
                data-track-header
                className="sticky left-0 z-40 flex h-8 w-[176px] shrink-0 items-center justify-between border-b border-r border-white/5 bg-[#141417] px-2 text-[10px] text-neutral-500"
              >
                <span className="flex items-center gap-1">
                  <Rows3 size={11} /> {tracks.length} tracks
                </span>
                <span className="font-mono">{duration > 0 ? formatTimecode(duration, fps).slice(3, 8) : "--:--"}</span>
              </div>
              <Ruler
                pxPerSec={zoom}
                width={contentWidth}
                fps={fps}
                onScrubStart={() => {
                  wasPlayingRef.current = useEditorStore.getState().isPlaying;
                }}
                onScrubEnd={() => {
                  if (wasPlayingRef.current) setIsPlaying(true);
                }}
              />
            </div>

            {tracks.map((track, i) => (
              <div className="flex" key={track.id}>
                <div data-track-header>
                  <TrackHeader track={track} index={i} total={tracks.length} />
                </div>
                <TrackLane track={track} width={contentWidth} height={TRACK_HEIGHTS[track.height]} />
              </div>
            ))}

            {tracks.length === 0 && (
              <div className="flex h-40 items-center justify-center text-xs text-neutral-600">No tracks — add a video or audio track above.</div>
            )}

            {/* Beat grid overlay */}
            {beatLines.length > 0 && (
              <div className="pointer-events-none absolute z-[15] overflow-hidden" style={{ top: 32, left: HEADER_W, width: contentWidth, height: totalTrackHeight }}>
                {beatLines.map((b, i) => (
                  <div
                    key={i}
                    className="absolute top-0 w-px"
                    style={{
                      left: b.t * zoom,
                      height: "100%",
                      background: b.strength > 0.72 ? "rgba(244,114,182,0.4)" : "rgba(244,114,182,0.16)",
                    }}
                  />
                ))}
              </div>
            )}

            {/* In/Out shading over tracks */}
            {inPoint !== null && outPoint !== null && outPoint > inPoint && (
              <>
                <div className="pointer-events-none absolute top-8 z-20 bg-black/40" style={{ left: HEADER_W, width: inPoint * zoom, height: totalTrackHeight }} />
                <div className="pointer-events-none absolute top-8 z-20 bg-black/40" style={{ left: HEADER_W + outPoint * zoom, width: Math.max(0, contentWidth - outPoint * zoom), height: totalTrackHeight }} />
              </>
            )}

            {/* Snap guide */}
            {snapLine !== null && (
              <div className="pointer-events-none absolute top-8 z-40 w-px bg-amber-300 shadow-[0_0_6px_#fcd34d]" style={{ left: HEADER_W + snapLine * zoom, height: totalTrackHeight }} />
            )}

            {/* Marquee */}
            {marquee && (
              <div
                className="pointer-events-none absolute z-50 rounded-sm border border-indigo-400 bg-indigo-400/10"
                style={{ left: marquee.x1, top: marquee.y1, width: marquee.x2 - marquee.x1, height: marquee.y2 - marquee.y1 }}
              />
            )}

            {/* Playhead */}
            <div className="pointer-events-none absolute top-0 z-50 w-px bg-red-500" style={{ left: HEADER_W + currentTime * zoom, height: 32 + totalTrackHeight }}>
              <div className="absolute -left-[6px] top-0 h-0 w-0 border-l-[6px] border-r-[6px] border-t-[9px] border-l-transparent border-r-transparent border-t-red-500" />
              <div className="absolute -left-[5px] top-[9px] h-2 w-[11px] bg-red-500" style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />
            </div>
          </div>
        </div>
      </div>
    </TimelineContext.Provider>
  );
}

function ToolBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn("flex h-6 w-7 items-center justify-center rounded transition-colors", active ? "bg-indigo-500 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-white")}
    >
      {children}
    </button>
  );
}

// logarithmic zoom slider mapping 4..800 px/s
function zoomToSlider(z: number) {
  return ((Math.log(z) - Math.log(4)) / (Math.log(800) - Math.log(4))) * 100;
}
function sliderToZoom(v: number) {
  return Math.exp(Math.log(4) + (v / 100) * (Math.log(800) - Math.log(4)));
}
