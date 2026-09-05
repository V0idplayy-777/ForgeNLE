// ─────────────────────────────────────────────────────────────────────────────
// Forge NLE — YouTube chapter export.
//
// Markers double as chapter points: tap M while scrubbing, then copy a ready
// to paste chapter list (0:00 Intro …) for the video description.
// ─────────────────────────────────────────────────────────────────────────────

import { Marker } from "../types";

/** 0:00 / 12:34 / 1:02:45 — YouTube's accepted chapter formats. */
export function chapterTime(t: number): string {
  const total = Math.max(0, Math.floor(t));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export interface ChapterListResult {
  text: string;
  chapters: { time: number; label: string }[];
  /** YouTube needs 3+ chapters, the first at 0:00, each 10s+ apart. */
  warnings: string[];
}

/**
 * Builds a YouTube-description chapter list from markers. Adds a "Start"
 * chapter at 0:00 when the first marker isn't at zero, de-duplicates times
 * and sorts chronologically.
 */
export function buildChapters(markers: Marker[]): ChapterListResult {
  const warnings: string[] = [];
  const sorted = [...markers].sort((a, b) => a.time - b.time);
  const chapters: { time: number; label: string }[] = [];

  if (!sorted.length || sorted[0].time > 0.5) {
    chapters.push({ time: 0, label: sorted.length ? sorted[0].label : "Start" });
    warnings.push('Added a "0:00" chapter — YouTube requires the first one to start at zero.');
  }
  let last = -Infinity;
  for (const m of sorted) {
    if (m.time - last < 1) {
      warnings.push(`Merged "${m.label}" — chapters must be at distinct times.`);
      continue;
    }
    chapters.push({ time: Math.floor(m.time), label: m.label });
    last = m.time;
  }

  if (chapters.length < 3) warnings.push("YouTube only shows chapters with 3 or more entries.");
  for (let i = 1; i < chapters.length; i++) {
    if (chapters[i].time - chapters[i - 1].time < 10) {
      warnings.push("Chapters must each be at least 10 seconds long.");
      break;
    }
  }

  const text = chapters.map((c) => `${chapterTime(c.time)} ${c.label}`).join("\n");
  return { text, chapters, warnings };
}
