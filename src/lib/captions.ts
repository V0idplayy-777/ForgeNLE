// ─────────────────────────────────────────────────────────────────────────────
// Forge NLE — subtitle parsing.
//
// Caylus-style edits live on captions. Rather than typing every line, creators
// can drop an .srt / .vtt export from their transcription tool and Forge turns
// each cue into a styled text clip on a dedicated track.
// ─────────────────────────────────────────────────────────────────────────────

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

function parseTimestamp(raw: string): number | null {
  const m = raw.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/);
  if (!m) return null;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2]);
  const s = Number(m[3]);
  const ms = Number(m[4].padEnd(3, "0"));
  return h * 3600 + min * 60 + s + ms / 1000;
}

/**
 * Parses SRT and WebVTT subtitle text. Tolerates CRLF, BOMs, missing cue
 * indices and multi-line cues. Returns cues sorted by start time.
 */
export function parseSubtitles(source: string): CaptionCue[] {
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const cues: CaptionCue[] = [];
  let i = 0;
  const timeLine = /^(\s*)(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})(.*)$/;

  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(timeLine);
    if (!m) {
      i++;
      continue;
    }
    const start = parseTimestamp(`${m[2] ? m[2] + ":" : ""}${m[3]}:${m[4]},${m[5]}`);
    const end = parseTimestamp(`${m[6] ? m[6] + ":" : ""}${m[7]}:${m[8]},${m[9]}`);
    i++;
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !timeLine.test(lines[i])) {
      body.push(lines[i].trim());
      i++;
    }
    if (start === null || end === null) continue;
    const cleaned = body
      .join("\n")
      // strip basic HTML/vtt tags (<i>, <c.xxx>, </...>, {...\} ssa tags)
      .replace(/<\/?[a-zA-Z][^>]*>/g, "")
      .replace(/\{\\[^}]*\}/g, "")
      .trim();
    if (!cleaned || end <= start) continue;
    cues.push({ start, end, text: cleaned });
  }
  return cues.sort((a, b) => a.start - b.start);
}

export function subtitleFileNameOk(name: string): boolean {
  return /\.(srt|vtt)$/i.test(name);
}
