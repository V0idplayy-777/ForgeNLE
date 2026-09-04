import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useEditorStore } from "../../store/useEditorStore";
import { getPreviewEngine } from "../../lib/playbackEngine";
import { drawScope, sampleCanvas, ScopeKind } from "../../lib/scopes";
import { cn } from "../../utils/cn";

const SCOPES: { id: ScopeKind; label: string }[] = [
  { id: "waveform", label: "Waveform" },
  { id: "parade", label: "RGB Parade" },
  { id: "vectorscope", label: "Vectorscope" },
  { id: "histogram", label: "Histogram" },
];

/**
 * Video scopes + audio meters. Samples the live preview canvas (so it reflects
 * exactly what the renderer produced, including grades/LUT-like looks) at ~15 Hz.
 */
export default function ScopesPanel({ sourceRef }: { sourceRef: React.RefObject<HTMLCanvasElement | null> }) {
  const scope = useEditorStore((s) => s.scope);
  const setScope = useEditorStore((s) => s.setScope);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!scope) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 66) return; // ~15 Hz
      last = now;
      const src = sourceRef.current;
      const dst = canvasRef.current;
      if (!src || !dst) return;
      if (!scratchRef.current) scratchRef.current = document.createElement("canvas");
      const img = sampleCanvas(src, scratchRef.current, scope === "vectorscope" ? 120 : 160);
      if (!img) return;
      const rect = dst.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (dst.width !== w || dst.height !== h) {
        dst.width = w;
        dst.height = h;
      }
      const ctx = dst.getContext("2d");
      if (!ctx) return;
      drawScope(scope, ctx, img, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scope, sourceRef]);

  if (!scope) return null;

  return (
    <div className="flex h-[150px] shrink-0 items-stretch gap-2 border-t border-white/5 bg-[#0e0e10] px-3 py-2" data-scopes>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className={cn(
                "h-5 rounded px-2 text-[10px] font-medium transition-colors",
                scope === s.id ? "bg-white/10 text-white" : "text-neutral-500 hover:bg-white/5 hover:text-neutral-200"
              )}
            >
              {s.label}
            </button>
          ))}
          <button onClick={() => setScope(null)} className="ml-auto rounded p-0.5 text-neutral-500 hover:bg-white/10 hover:text-white" title="Close scopes">
            <X size={12} />
          </button>
        </div>
        <canvas ref={canvasRef} className="min-h-0 w-full flex-1 rounded border border-white/5" />
      </div>
      <AudioMeters />
    </div>
  );
}

// ── Audio meters ────────────────────────────────────────────────────────────

const MIN_DB = -60;

function toDb(v: number) {
  return v <= 0 ? MIN_DB : Math.max(MIN_DB, 20 * Math.log10(v));
}

function AudioMeters() {
  const [levels, setLevels] = useState<{ peak: [number, number]; hold: [number, number] }>({ peak: [MIN_DB, MIN_DB], hold: [MIN_DB, MIN_DB] });
  const holdRef = useRef<[number, number]>([MIN_DB, MIN_DB]);
  const holdTime = useRef<[number, number]>([0, 0]);
  const clipRef = useRef(false);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 50) return;
      last = now;
      const m = getPreviewEngine().meterLevels();
      const isPlaying = useEditorStore.getState().isPlaying;
      const peakDb: [number, number] = m && isPlaying ? [toDb(m.peak[0]), toDb(m.peak[1])] : [MIN_DB, MIN_DB];
      if (m && (m.peak[0] >= 0.999 || m.peak[1] >= 0.999)) clipRef.current = true;
      for (let c = 0; c < 2; c++) {
        if (peakDb[c] >= holdRef.current[c] || now - holdTime.current[c] > 1500) {
          holdRef.current[c] = peakDb[c];
          holdTime.current[c] = now;
        }
      }
      setLevels({ peak: peakDb, hold: [...holdRef.current] as [number, number] });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const ticks = [0, -6, -12, -18, -24, -36, -48];
  return (
    <div className="flex w-[92px] shrink-0 select-none flex-col gap-1" data-audio-meters>
      <div className="flex items-center justify-between text-[10px] text-neutral-500">
        <span>dBFS</span>
        <button
          className={cn("rounded px-1 font-mono text-[9px]", clipRef.current ? "bg-red-500 text-white" : "bg-white/5 text-neutral-600")}
          onClick={() => (clipRef.current = false)}
          title="Clip indicator (click to reset)"
        >
          CLIP
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 gap-1 rounded border border-white/5 bg-[#0a0a0c] p-1">
        {[0, 1].map((c) => (
          <Meter key={c} db={levels.peak[c]} hold={levels.hold[c]} />
        ))}
        <div className="pointer-events-none relative flex-1 text-[8px] font-mono text-neutral-600">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0" style={{ top: `${((0 - t) / (0 - MIN_DB)) * 100}%`, transform: "translateY(-50%)" }}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Meter({ db, hold }: { db: number; hold: number }) {
  const pct = ((db - MIN_DB) / (0 - MIN_DB)) * 100;
  const holdPct = ((hold - MIN_DB) / (0 - MIN_DB)) * 100;
  return (
    <div className="relative w-4 overflow-hidden rounded-sm bg-white/[0.04]">
      <div
        className="absolute bottom-0 left-0 right-0 transition-[height] duration-75"
        style={{
          height: `${Math.max(0, Math.min(100, pct))}%`,
          background: "linear-gradient(180deg, #ef4444 0%, #ef4444 8%, #f59e0b 8%, #f59e0b 30%, #22c55e 30%, #22c55e 100%)",
        }}
      />
      {hold > MIN_DB && <div className="absolute left-0 right-0 h-px bg-white/80" style={{ bottom: `${Math.max(0, Math.min(100, holdPct))}%` }} />}
    </div>
  );
}
