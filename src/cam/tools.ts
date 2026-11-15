// The tool library: the user's bits, each editable. Lengths are in metres. A field the
// research gave (the seeded bits) names its source in `from`; a field the user types loses
// it. A field nobody knows is null, and the calculator says so instead of guessing.
import { BIT_TYPES, MAKERS, type BitType, type MakerId } from "./chipload";
import { metres, type Sourced } from "./data";
import type { SourceId } from "./sources";

export type ToolField = "diameter" | "flutes" | "shank" | "cuttingLength" | "upcut" | "upcutTol";

export interface Tool {
  /** Explicitly checked by the owner; catalog entries alone are not inventory. */
  confirmedOwned?: boolean;
  id: string;
  name: string;
  type: BitType;
  /** Cutting diameter. */
  diameter: number | null;
  flutes: number | null;
  shank: number | null;
  /** How deep the flutes reach (the deepest the bit can cut). */
  cuttingLength: number | null;
  /** Compression bits: the up-cut section's length from the tip, and its tolerance. */
  upcut: number | null;
  upcutTol: number | null;
  /** Whose bit it is, when it is a maker whose chart is carried: the chipload is checked
   * against that maker's own figures (null or absent: unknown). */
  maker?: MakerId | null;
  /** The source of each field the research gave. */
  from?: Partial<Record<ToolField, SourceId>>;
  /** What the seed says about the bit (shown under it). */
  note?: string;
}

interface SeedTool {
  id: string;
  name: string;
  type: BitType;
  maker: MakerId | null;
  note: string;
  fields: Partial<Record<ToolField, Sourced>>;
}

/** The user's three bits, from the research. The compression bit is a specific one (Amana
 * 46170, whose drawing gives every size); the other two are the report's §8a rows, whose
 * shank and flute length were not found, so those are left for the user to measure. */
export const SEED_TOOLS: SeedTool[] = [
  {
    id: "seed-compression",
    name: "Amana 46170, 1/4 in compression",
    type: "compression",
    maker: "amana",
    note: "Sizes from Amana's drawing of the 46170. Other compression bits have other up-cut lengths: if yours is not a 46170, type its own.",
    fields: {
      diameter: { value: 0.25, unit: "in", src: "amana-a5" },
      flutes: { value: 2, unit: "count", src: "amana-a1", note: "Amana A1 lists the 46170 among its 2-flute 1/4\" tools" },
      shank: { value: 0.25, unit: "in", src: "amana-a5" },
      cuttingLength: { value: 0.875, unit: "in", src: "amana-a5" },
      upcut: { value: 0.2756, unit: "in", src: "amana-a5", note: "0.2756\" ± 0.010\" (7 mm) from the tip" },
      upcutTol: { value: 0.01, unit: "in", src: "amana-a5" },
    },
  },
  {
    id: "seed-downcut",
    name: "1/4 in down-cut",
    type: "downcut",
    maker: null,
    note: "The research's row for a 1/4 in 2-flute down-cut (such as Carbide 3D's #251). Its shank and flute length were not found: measure your bit and type them, and count its flutes.",
    fields: {
      diameter: { value: 0.25, unit: "in", src: "report8a", note: "§8a: 1/4\" 2-flute down-cut (e.g. Carbide #251)" },
      flutes: { value: 2, unit: "count", src: "report8a", confidence: "low", note: "§8a's row assumes 2 flutes: count yours" },
    },
  },
  {
    id: "seed-endmill",
    name: "1/8 in end mill",
    type: "endmill",
    maker: null,
    note: "The research's row for a 1/8 in 2-flute flat end mill (such as Carbide 3D's #102). Its shank and flute length were not found: measure your bit and type them, and count its flutes.",
    fields: {
      diameter: { value: 0.125, unit: "in", src: "report8a", note: "§8a: 1/8\" 2-flute flat end mill (e.g. Carbide #102)" },
      flutes: { value: 2, unit: "count", src: "report8a", confidence: "low", note: "§8a's row assumes 2 flutes: count yours" },
    },
  },
];

const LENGTHS: ToolField[] = ["diameter", "shank", "cuttingLength", "upcut", "upcutTol"];

/** The seeded bits as tools. */
export function seedTools(): Tool[] {
  return SEED_TOOLS.map((s) => {
    const t: Tool = { confirmedOwned: false, id: s.id, name: s.name, type: s.type, maker: s.maker, diameter: null, flutes: null, shank: null, cuttingLength: null, upcut: null, upcutTol: null, from: {}, note: s.note };
    for (const [k, v] of Object.entries(s.fields) as [ToolField, Sourced][]) {
      t[k] = LENGTHS.includes(k) ? metres(v) : v.value;
      t.from![k] = v.src;
    }
    return t;
  });
}

/** The seeded field behind a tool's field (for its note and confidence), if it is still the
 * seed's value. */
export function seedField(t: Tool, f: ToolField): Sourced | null {
  if (!t.from?.[f]) return null;
  return SEED_TOOLS.find((s) => s.id === t.id)?.fields[f] ?? null;
}

const isLen = (v: unknown, zero = false) => v === null || (typeof v === "number" && Number.isFinite(v) && (zero ? v >= 0 : v > 0) && v < 1);

/** A tool read back from storage, or null when it does not make sense or breaks the limits
 * a tool typed in the dialog must keep (`toolProblem`). */
export function readTool(x: unknown): Tool | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id || typeof o.name !== "string") return null;
  if (!BIT_TYPES.some((b) => b.id === o.type)) return null;
  for (const k of LENGTHS) if (!isLen(o[k] ?? null, k === "upcutTol")) return null;
  const fl = o.flutes ?? null;
  if (fl !== null && !(typeof fl === "number" && Number.isInteger(fl) && fl >= 1 && fl <= 8)) return null;
  const t: Tool = {
    confirmedOwned: o.confirmedOwned === true,
    id: o.id,
    name: o.name.slice(0, 80),
    type: o.type as BitType,
    maker: MAKERS.some((m) => m.id === o.maker) ? (o.maker as MakerId) : null,
    diameter: (o.diameter as number | null) ?? null,
    flutes: fl as number | null,
    shank: (o.shank as number | null) ?? null,
    cuttingLength: (o.cuttingLength as number | null) ?? null,
    upcut: (o.upcut as number | null) ?? null,
    upcutTol: (o.upcutTol as number | null) ?? null,
    from: {},
    ...(typeof o.note === "string" ? { note: o.note.slice(0, 400) } : {}),
  };
  if (toolProblem(t)) return null;
  // A seed's source survives only on the seed's own field, with the seed's own source, while
  // the field still holds the seed's value.
  const seed = seedTools().find((s) => s.id === t.id);
  if (seed && o.from && typeof o.from === "object") {
    for (const [k, v] of Object.entries(o.from as Record<string, unknown>)) {
      const f = k as ToolField;
      if (seed.from?.[f] === v && seed[f] !== null && Math.abs((t[f] ?? NaN) - seed[f]!) <= 1e-12) t.from![f] = v as SourceId;
    }
  }
  return t;
}

/** Why a tool cannot be saved as typed, or null. */
export function toolProblem(t: Tool): string | null {
  if (!t.name.trim()) return "Give the bit a name.";
  if (t.diameter === null) return "Type the bit's cutting diameter.";
  if (t.diameter <= 0 || t.diameter > 0.0254) return "Cutting diameter: more than 0 and at most 1 in (25.4 mm).";
  if (t.flutes !== null && !(Number.isInteger(t.flutes) && t.flutes >= 1 && t.flutes <= 8)) return "Flutes: a whole number from 1 to 8.";
  if (t.shank !== null && (t.shank <= 0 || t.shank > 0.0254)) return "Shank: more than 0 and at most 1 in (25.4 mm).";
  if (t.cuttingLength !== null && (t.cuttingLength <= 0 || t.cuttingLength > 0.1)) return "Cutting length: more than 0 and at most 100 mm (3.94 in).";
  if (t.upcut !== null && t.cuttingLength !== null && t.upcut > t.cuttingLength) return "The up-cut length cannot be longer than the cutting length.";
  if (t.upcutTol !== null && (t.upcutTol < 0 || t.upcutTol > 0.005)) return "Up-cut tolerance: 0 to 5 mm.";
  return null;
}
