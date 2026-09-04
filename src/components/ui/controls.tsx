import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Diamond, RotateCcw } from "lucide-react";
import { cn } from "../../utils/cn";

// ── Section ─────────────────────────────────────────────────────────────────

export function Section({
  title,
  children,
  defaultOpen = true,
  right,
  onReset,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/5">
      <div className="flex items-center gap-1 px-3 py-2">
        <button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-1.5 text-left">
          {open ? <ChevronDown size={12} className="text-neutral-500" /> : <ChevronRight size={12} className="text-neutral-500" />}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300">{title}</span>
        </button>
        {right}
        {onReset && (
          <button onClick={onReset} className="rounded p-1 text-neutral-600 hover:bg-white/5 hover:text-white" title="Reset">
            <RotateCcw size={11} />
          </button>
        )}
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

// ── Row (label + control) ───────────────────────────────────────────────────

export function Row({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-1.5 flex min-h-[26px] items-center gap-2", className)}>
      <div className="w-[76px] shrink-0 truncate text-[11px] text-neutral-400">{label}</div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
    </div>
  );
}

// ── Numeric scrubber ────────────────────────────────────────────────────────

export function NumberField({
  value,
  onChange,
  onCommit,
  min = -Infinity,
  max = Infinity,
  step = 1,
  precision,
  unit,
  className,
  sensitivity = 1,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  unit?: string;
  className?: string;
  sensitivity?: number;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null);
  const prec = precision ?? (step < 1 ? Math.min(3, Math.ceil(-Math.log10(step))) : 0);
  const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(prec) : "0");

  function onPointerDown(e: React.PointerEvent) {
    if (disabled || editing) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, v: value, moved: false };
  }
  function onPointerCancel() {
    drag.current = null;
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    if (Math.abs(dx) > 2) drag.current.moved = true;
    if (!drag.current.moved) return;
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const next = clampNum(drag.current.v + dx * step * sensitivity * mult, min, max);
    onChange(roundTo(next, prec));
  }
  function onPointerUp() {
    if (!drag.current) return;
    const moved = drag.current.moved;
    drag.current = null;
    if (moved) onCommit?.();
    else {
      setText(fmt(value));
      setEditing(true);
    }
  }
  function commitText() {
    setEditing(false);
    const expr = text.replace(/[^0-9+\-*/.() ]/g, "");
    let v = Number.NaN;
    try {
      // eslint-disable-next-line no-new-func
      v = Number(Function(`"use strict";return (${expr || "NaN"})`)());
    } catch {}
    if (Number.isFinite(v)) {
      onChange(roundTo(clampNum(v, min, max), prec));
      onCommit?.();
    }
  }
  return editing ? (
    <input
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commitText}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitText();
        if (e.key === "Escape") setEditing(false);
        e.stopPropagation();
      }}
      className={cn("h-6 w-full min-w-0 rounded border border-indigo-500 bg-neutral-900 px-1.5 text-right font-mono text-[11px] text-white outline-none", className)}
    />
  ) : (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={cn(
        "flex h-6 w-full min-w-0 cursor-ew-resize select-none items-center justify-end rounded border border-white/5 bg-white/[0.04] px-1.5 font-mono text-[11px] text-neutral-200 hover:border-white/10 hover:bg-white/[0.07]",
        disabled && "cursor-not-allowed opacity-40",
        className
      )}
      title="Drag to scrub · click to type"
    >
      <span className="truncate">{fmt(value)}</span>
      {unit && <span className="ml-0.5 text-neutral-500">{unit}</span>}
    </div>
  );
}

function clampNum(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
function roundTo(v: number, p: number) {
  const m = Math.pow(10, p);
  return Math.round(v * m) / m;
}

// ── Slider with numeric field ───────────────────────────────────────────────

export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  onCommit,
  defaultValue,
  keyframe,
  precision,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  onCommit?: () => void;
  defaultValue?: number;
  keyframe?: { active: boolean; has: boolean; onToggle: () => void };
  precision?: number;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <div
        className="w-[76px] shrink-0 cursor-default truncate text-[11px] text-neutral-400"
        onDoubleClick={() => {
          if (defaultValue !== undefined) {
            onChange(defaultValue);
            onCommit?.();
          }
        }}
        title={defaultValue !== undefined ? "Double-click to reset" : undefined}
      >
        {label}
      </div>
      <div className="relative flex h-6 flex-1 items-center">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
          className="fx-slider w-full"
          style={{ ["--pct" as any]: `${pct}%` }}
        />
      </div>
      <NumberField value={value} onChange={onChange} onCommit={onCommit} min={min} max={max} step={step} unit={unit} precision={precision} className="w-[64px] shrink-0" />
      {keyframe && <KeyframeButton {...keyframe} />}
    </div>
  );
}

export function KeyframeButton({ active, has, onToggle }: { active: boolean; has: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors",
        active ? "text-amber-400" : has ? "text-amber-400/50 hover:text-amber-400" : "text-neutral-600 hover:text-neutral-300"
      )}
      title={active ? "Remove keyframe at playhead" : "Add keyframe at playhead"}
    >
      <Diamond size={11} fill={active ? "currentColor" : "none"} />
    </button>
  );
}

// ── Select ──────────────────────────────────────────────────────────────────

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; group?: string }[];
  className?: string;
}) {
  const groups = Array.from(new Set(options.map((o) => o.group).filter(Boolean))) as string[];
  const render = (o: { value: T; label: string }) => (
    <option key={o.value} value={o.value}>
      {o.label}
    </option>
  );
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn("h-6 w-full min-w-0 rounded border border-white/5 bg-white/[0.04] px-1.5 text-[11px] text-neutral-200 outline-none hover:bg-white/[0.07] focus:border-indigo-500", className)}
    >
      {groups.length
        ? [
            ...options.filter((o) => !o.group).map(render),
            ...groups.map((g) => (
              <optgroup key={g} label={g}>
                {options.filter((o) => o.group === g).map(render)}
              </optgroup>
            )),
          ]
        : options.map(render)}
    </select>
  );
}

// ── Toggle / segmented ──────────────────────────────────────────────────────

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2"
      role="switch"
      aria-checked={checked}
    >
      <span className={cn("relative h-4 w-7 rounded-full transition-colors", checked ? "bg-indigo-500" : "bg-neutral-700")}>
        <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", checked ? "left-3.5" : "left-0.5")} />
      </span>
      {label && <span className="text-[11px] text-neutral-300">{label}</span>}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "sm",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  className?: string;
  size?: "sm" | "xs";
}) {
  return (
    <div className={cn("flex rounded-md border border-white/5 bg-white/[0.03] p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex flex-1 items-center justify-center rounded transition-colors",
            size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]",
            value === o.value ? "bg-indigo-500/90 text-white shadow" : "text-neutral-400 hover:bg-white/5 hover:text-white"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Color ───────────────────────────────────────────────────────────────────

export function ColorField({ value, onChange, onCommit, allowAlpha }: { value: string; onChange: (v: string) => void; onCommit?: () => void; allowAlpha?: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const hex = toHex(value);
  const alpha = parseAlpha(value);
  return (
    <div className="flex w-full items-center gap-1.5">
      <label className="relative h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded border border-white/10" style={{ background: checker() }}>
        <span className="absolute inset-0" style={{ background: value }} />
        <input
          type="color"
          value={hex}
          onChange={(e) => {
            const v = allowAlpha && alpha < 1 ? hexWithAlpha(e.target.value, alpha) : e.target.value;
            onChange(v);
          }}
          onBlur={onCommit}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (isColor(text)) onChange(text);
          else setText(value);
          onCommit?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          e.stopPropagation();
        }}
        className="h-6 w-full min-w-0 rounded border border-white/5 bg-white/[0.04] px-1.5 font-mono text-[11px] text-neutral-200 outline-none focus:border-indigo-500"
      />
      {allowAlpha && (
        <NumberField
          value={Math.round(alpha * 100)}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={(a) => onChange(hexWithAlpha(hex, a / 100))}
          onCommit={onCommit}
          className="w-[60px] shrink-0"
        />
      )}
    </div>
  );
}

function checker() {
  return "repeating-conic-gradient(#555 0 25%, #333 0 50%) 0 0 / 8px 8px";
}
export function toHex(color: string): string {
  if (/^#([0-9a-f]{6})$/i.test(color)) return color;
  if (/^#([0-9a-f]{3})$/i.test(color)) return "#" + color.slice(1).split("").map((c) => c + c).join("");
  if (/^#([0-9a-f]{8})$/i.test(color)) return color.slice(0, 7);
  const m = color.match(/rgba?\(\s*(\d+)[, ]+(\d+)[, ]+(\d+)/i);
  if (m) return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  return "#ffffff";
}
export function parseAlpha(color: string): number {
  const m = color.match(/rgba\(\s*\d+[, ]+\d+[, ]+\d+[,/ ]+([\d.]+)\s*\)/i);
  if (m) return Number(m[1]);
  if (/^#([0-9a-f]{8})$/i.test(color)) return parseInt(color.slice(7, 9), 16) / 255;
  return 1;
}
export function hexWithAlpha(hex: string, alpha: number) {
  const h = toHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return alpha >= 1 ? `#${h}` : `rgba(${r},${g},${b},${Math.round(alpha * 100) / 100})`;
}
function isColor(s: string) {
  if (typeof CSS !== "undefined" && CSS.supports) return CSS.supports("color", s);
  return /^#|^rgb/.test(s);
}

// ── Buttons ─────────────────────────────────────────────────────────────────

export function IconBtn({
  onClick,
  title,
  active,
  children,
  className,
  disabled,
  danger,
}: {
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400",
        active && "bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 hover:text-indigo-200",
        danger && "hover:bg-red-500/10 hover:text-red-400",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Btn({
  onClick,
  children,
  variant = "default",
  className,
  disabled,
  title,
  size = "sm",
}: {
  onClick?: () => void;
  children: React.ReactNode;
  variant?: "default" | "primary" | "ghost" | "danger";
  className?: string;
  disabled?: boolean;
  title?: string;
  size?: "xs" | "sm" | "md";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        size === "xs" ? "h-6 px-2 text-[10px]" : size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-9 px-4 text-xs",
        variant === "default" && "border border-white/10 bg-white/[0.05] text-neutral-200 hover:bg-white/[0.1]",
        variant === "primary" && "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-400",
        variant === "ghost" && "text-neutral-400 hover:bg-white/5 hover:text-white",
        variant === "danger" && "border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-neutral-300">{children}</kbd>;
}

// ── Modal shell ─────────────────────────────────────────────────────────────

export function Modal({ title, onClose, children, width = 480, footer }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; width?: number; footer?: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="flex max-h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141416] shadow-2xl"
        style={{ width, maxWidth: "100%" }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-neutral-500 hover:bg-white/5 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-white/5 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

export function Empty({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="text-neutral-700">{icon}</div>
      <div className="text-xs font-medium text-neutral-400">{title}</div>
      {hint && <div className="text-[11px] leading-relaxed text-neutral-600">{hint}</div>}
    </div>
  );
}
