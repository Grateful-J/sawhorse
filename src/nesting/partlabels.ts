// Printable part labels: one per part on a router sheet, from its job sheet (src/nesting/
// jobsheet.ts). Each carries the part's tag and name, its cabinet, its sheet's number, its size,
// a grain arrow when it has grain, which face was up on the router, and a line for edge banding
// (a hook: Sawhorse does not know banding yet, so the line is left to write on).
//
// The labels are laid out edge to edge in a grid centred on the page, on letter or A4 paper, at
// a size CNC setup keeps (src/cam/jobs.ts). No label product is named: Sawhorse found no source
// for any maker's sheet layout, so print one page on plain paper and hold it against a label
// sheet before printing on labels.
import type { Grain } from "../kernel/types";
import { fit, LETTER, type PdfDoc, textWidth, type PdfPage } from "../cutlist/pdf";
import { labelSizeOf, type JobPrefs, type LabelPaper, type LabelSize } from "../cam/jobs";
import type { JobSheet } from "./jobsheet";

export const A4: [number, number] = [595.28, 841.89];

export function paperSize(p: LabelPaper): [number, number] {
  return p === "a4" ? A4 : LETTER;
}

export interface PartLabel {
  tag: string;
  name: string;
  cabinet: string | null;
  /** "2. Sheet 1 of 2", as the DXF's label and the job sheet say it. */
  sheet: string;
  size: string;
  grain: Grain;
  /** "Grain along the length (the 350 mm side)". */
  grainText: string;
  faceUp: string;
  /** Edge banding (null: a line to write on). */
  banding: string | null;
}

/** One label per part on each sheet, sheet by sheet, in the order of each job sheet's parts. */
export function partLabels(sheets: JobSheet[]): PartLabel[] {
  return sheets.flatMap((js) => js.parts.map((p) => ({ tag: p.tag, name: p.name, cabinet: p.cabinet, sheet: js.number, size: p.size, grain: p.grain, grainText: p.grainText, faceUp: p.faceUp, banding: p.banding })));
}

export interface LabelGrid {
  page: [number, number];
  size: LabelSize;
  columns: number;
  rows: number;
  /** The grid's lower-left corner on the page. */
  left: number;
  bottom: number;
}

/** As many labels of the size as fit the paper, edge to edge, the grid centred. */
export function labelGrid(prefs: JobPrefs): LabelGrid {
  const page = paperSize(prefs.labels.paper);
  const size = labelSizeOf(prefs);
  const columns = Math.max(1, Math.floor(page[0] / size.w + 1e-6));
  const rows = Math.max(1, Math.floor(page[1] / size.h + 1e-6));
  return { page, size, columns, rows, left: (page[0] - columns * size.w) / 2, bottom: (page[1] - rows * size.h) / 2 };
}

/** Where label `k` goes: its page, and its lower-left corner. Row by row from the top left. */
export function labelAt(g: LabelGrid, k: number): { page: number; x: number; y: number } {
  const per = g.columns * g.rows;
  const i = k % per;
  const col = i % g.columns;
  const row = Math.floor(i / g.columns);
  return { page: Math.floor(k / per), x: g.left + col * g.size.w, y: g.bottom + (g.rows - 1 - row) * g.size.h };
}

/** Lines that wrap at `width` points (Helvetica at `size`), at most `max` of them. */
function wrap(s: string, size: number, width: number, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size) > width && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  if (out.length > max) return [...out.slice(0, max - 1), fit(out.slice(max - 1).join(" "), size, width)];
  return out;
}

/** One label drawn with its lower-left corner at (x, y). */
function drawLabel(p: PdfPage, l: PartLabel, x: number, y: number, w: number, h: number, outline: boolean) {
  if (outline) p.rect(x, y, w, h, { stroke: 0.82, width: 0.3 });
  const pad = Math.min(12, w * 0.05);
  const inner = w - 2 * pad;
  let top = y + h - pad - 10;
  p.text(x + pad, top, fit(`${l.tag}  ${l.name}`, 12, inner, true), 12, { bold: true });
  top -= 14;
  // The sheet's number first: a long cabinet name is what is cut short, never the number.
  p.text(x + pad, top, fit([l.sheet, l.cabinet].filter(Boolean).join(" · "), 9, inner), 9);
  top -= 12;
  p.text(x + pad, top, fit(l.size, 9, inner), 9);
  top -= 12;
  // The rest of the label, above the bottom line, for which face was up.
  // Room above the grain and banding lines.
  const room = Math.max(1, Math.floor((top - (y + pad + 24)) / 9.5));
  for (const line of wrap(`Up on the CNC: ${l.faceUp}`, 7.5, inner, Math.min(3, room))) {
    p.text(x + pad, top, line, 7.5, { gray: 0.2 });
    top -= 9.5;
  }
  const base = y + pad;
  p.text(x + pad, base, l.banding ? fit(`Banding: ${l.banding}`, 7.5, inner) : "Banding: ______________", 7.5, { gray: 0.25 });
  // The grain in words, with the side it runs along, and an arrow beside them.
  const gy = base + 10;
  p.text(x + pad, gy, fit(l.grainText, 7, inner - 50), 7, { gray: 0.25 });
  if (l.grain === "length") p.arrow(x + w - pad - 40, gy + 2, x + w - pad, gy + 2, 0.8, 4);
  else if (l.grain === "width") p.arrow(x + w - pad - 6, gy - 4, x + w - pad - 6, gy + 14, 0.8, 4);
}

/** The labels on pages of their own, added to `doc`. Returns the first and last page
 * numbers (1-based), or null when there are no labels. */
export function labelPages(doc: PdfDoc, labels: PartLabel[], prefs: JobPrefs): { first: number; last: number } | null {
  if (!labels.length) return null;
  const g = labelGrid(prefs);
  const start = doc.pages.length;
  labels.forEach((l, k) => {
    const at = labelAt(g, k);
    while (doc.pages.length <= start + at.page) doc.page(g.page);
    drawLabel(doc.pages[start + at.page], l, at.x, at.y, g.size.w, g.size.h, prefs.labels.outlines);
  });
  return { first: start + 1, last: doc.pages.length };
}
