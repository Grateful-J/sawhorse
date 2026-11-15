// CNC setup (the Nesting section's CNC setup… button): your machine and router, your bits,
// and feeds and speeds for one bit, material and cut. Shop data, kept on this device
// (src/cam/store.ts), never in the model: changing it does not mark the document changed.
// Every built-in number shows its source and how far to trust it.
import { useEffect, useMemo, useState } from "react";
import { BIT_TYPES, MAKERS, MATERIALS, figureCounts, type BitType, type ChartFigure, type MakerId, type MaterialId } from "../cam/chipload";
import { COMMUNITY, M_PER_IN, ROUTERS, SHAPEOKO_5_PRO_4X4, confidenceOf, tableGap, type DialTable, type Router, type Sourced } from "../cam/data";
import { PLUNGE, bothUnits, chiploadText, ipmToMmMin, mmMinToIpm, type FeedInput, type FeedsOptions, type FeedsResult } from "../cam/feeds";
import { HOLE_LAYERS, OPERATIONS, holeOf, type Operation } from "../cam/layers";
import { SCRAP_TEST } from "../cam/scrap";
import { feedsFor, machineOf, routerOf, tableOf, toolById } from "../cam/shop";
import { HOLD_DOWN_DEFAULT, JOB_KINDS, LABEL_SIZES, type JobKind, type JobPrefs, type LabelPaper } from "../cam/jobs";
import { SOURCES, type Confidence, type Source, type SourceId } from "../cam/sources";
import { CUSTOM_MACHINE, CUSTOM_ROUTER, defaultShop, loadShop, saveShop, type Shop } from "../cam/store";
import { seedField, seedTools, toolProblem, type Tool, type ToolField } from "../cam/tools";
import { askYesNo } from "../io/files";
import { parseLength, type UnitSystem } from "../lib/units";

export type CncTab = "machine" | "tools" | "feeds" | "jobs";

export interface CncSetupDialogProps {
  units: UnitSystem;
  onClose: () => void;
  /** The shop to start from (default: the one kept on this device). */
  initial?: Shop;
  /** Keep a change (default: on this device). */
  onShop?: (s: Shop) => void;
  tab?: CncTab;
}

const isMetric = (u: UnitSystem) => u === "mm" || u === "cm" || u === "m";
const num = (v: number, digits = 0) => v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** A length as typed in a field: decimal inches, or millimetres. */
function fieldText(m: number | null, metric: boolean): string {
  if (m === null) return "";
  if (metric) return `${Number((m * 1000).toFixed(3))} mm`;
  return `${Number((m / M_PER_IN).toFixed(4))} in`;
}

/** A sourced number as the panel says it. */
function sourcedText(s: Sourced, metric: boolean): string {
  switch (s.unit) {
    case "mm":
      return bothUnits(s.value / 1000, metric, 2);
    case "in":
      return bothUnits(s.value * M_PER_IN, metric, s.value < 0.1 ? 3 : 2);
    case "rpm":
      return `${num(s.value)} RPM`;
    case "ipm":
      return metric ? `${num(ipmToMmMin(s.value))} mm/min (${num(s.value)} IPM)` : `${num(s.value)} IPM (${num(ipmToMmMin(s.value))} mm/min)`;
    default:
      return String(s.value);
  }
}

/** Where a number comes from: its confidence and maker, which open (click, tap, or Enter
 * on the focused label) to the document, the place in it and its address. Not a link: the
 * desktop app's window must never navigate away. */
function Src({ id, conf }: { id: SourceId; conf?: Confidence }) {
  const s = SOURCES[id] as Source;
  const c = conf ?? s.confidence;
  return (
    <details className="cam-src" data-conf={c} data-src={id}>
      <summary aria-label={`Source: ${s.maker}, ${c} confidence`}>
        {c} · {s.maker}
      </summary>
      <span className="cam-src-doc">
        {s.maker}, {s.document}. {s.where}. <span className="cam-src-url">{s.url}</span> (research {s.report})
      </span>
    </details>
  );
}

/** A feed's inputs, each with its source (or "yours"), and the confidence of the lot. */
function Inputs({ from, conf }: { from: FeedInput[]; conf: Confidence | null }) {
  return (
    <small>
      {from.map((f, i) => (
        <span key={i}>
          {f.what} {f.src ? <Src id={f.src} conf={f.confidence ?? undefined} /> : <span className="cam-yours">yours</span>}
          {i < from.length - 1 ? "; " : ". "}
        </span>
      ))}
      {conf ? <b className="cam-conf" data-conf={conf}>{conf} confidence (the lowest of its inputs)</b> : null}
    </small>
  );
}

function SrcOf({ s }: { s: Sourced }) {
  return <Src id={s.src} conf={confidenceOf(s)} />;
}

/** A length typed in the document's units: committed on Enter or on leaving the field. */
function LenInput({ label, value, units, onCommit, placeholder, field }: { label: string; value: number | null; units: UnitSystem; onCommit: (m: number | null) => void; placeholder?: string; field?: string }) {
  const metric = isMetric(units);
  const shown = fieldText(value, metric);
  const [text, setText] = useState(shown);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setText(shown), [shown]);
  const commit = (t: string) => {
    if (t.trim() === shown) return setErr(null);
    if (!t.trim()) {
      setErr(null);
      return onCommit(null);
    }
    const r = parseLength(t, units);
    if (!r.ok) return setErr(r.error);
    if (r.metres <= 0) return setErr(`${label}: more than 0.`);
    setErr(null);
    onCommit(r.metres);
  };
  return (
    <label className={err ? "err" : undefined} title={err ?? `${label} (type a length: 0.25 in, 6.35 mm)`}>
      <span>{label}</span>
      <input aria-label={label} data-field={field} value={text} placeholder={placeholder} size={9} onChange={(e) => setText(e.currentTarget.value)} onBlur={(e) => commit(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget.value)} />
      {err ? <small className="note err">{err}</small> : null}
    </label>
  );
}

/** A number typed in a field (RPM, IPM, flutes): committed on Enter or on leaving it. */
function NumInput({ label, value, onCommit, placeholder, field, integer }: { label: string; value: number | null; onCommit: (v: number | null) => void; placeholder?: string; field?: string; integer?: boolean }) {
  const shown = value === null ? "" : String(Number(value.toFixed(3)));
  const [text, setText] = useState(shown);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setText(shown), [shown]);
  const commit = (t: string) => {
    if (t.trim() === shown) return setErr(null);
    if (!t.trim()) {
      setErr(null);
      return onCommit(null);
    }
    const v = Number(t.replace(/,/g, ""));
    if (!Number.isFinite(v) || v <= 0 || (integer && !Number.isInteger(v))) return setErr(`${label}: ${integer ? "a whole number" : "a number"} more than 0.`);
    setErr(null);
    onCommit(v);
  };
  return (
    <label className={err ? "err" : undefined} title={err ?? label}>
      <span>{label}</span>
      <input aria-label={label} data-field={field} value={text} placeholder={placeholder} size={8} inputMode="decimal" onChange={(e) => setText(e.currentTarget.value)} onBlur={(e) => commit(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget.value)} />
      {err ? <small className="note err">{err}</small> : null}
    </label>
  );
}

// ---------------------------------------------------------------------------------------
// Machine

function DialTables({ router }: { router: Router }) {
  const [a, b] = router.tables;
  const dials = [...new Set(router.tables.flatMap((t) => t.steps.map((s) => s.dial)))].sort((x, y) => x - y);
  const at = (t: DialTable | undefined, d: number) => t?.steps.find((s) => s.dial === d) ?? null;
  const gap = a && b ? tableGap(a, b) : null;
  return (
    <>
      <table className="cam-table" aria-label={`${router.name} dial table`}>
        <thead>
          <tr>
            <th>Dial</th>
            {router.tables.map((t) => (
              <th key={t.id}>
                {t.label} <Src id={t.steps[0].rpm.src} />
              </th>
            ))}
            {b ? <th>Difference</th> : null}
          </tr>
        </thead>
        <tbody>
          {dials.map((d) => {
            const x = at(a, d);
            const y = at(b, d);
            return (
              <tr key={d}>
                <td>{d}</td>
                {router.tables.map((t) => {
                  const s = at(t, d);
                  return <td key={t.id}>{s ? `${num(s.rpm.value)} RPM` : "—"}</td>;
                })}
                {b ? <td>{x && y ? `${num(Math.abs(x.rpm.value - y.rpm.value))} RPM` : "—"}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {gap && gap.rpm ? (
        <p className="note" data-testid="dial-gap">
          Carbide's two tables differ most at dial {gap.dial}: {num(gap.rpm)} RPM. Sawhorse reads the one you pick below; a tachometer gives your router's own.
        </p>
      ) : null}
    </>
  );
}

function MachineTab({ shop, set, units }: { shop: Shop; set: (s: Shop) => void; units: UnitSystem }) {
  const metric = isMetric(units);
  const m = SHAPEOKO_5_PRO_4X4;
  const r = routerOf(shop);
  const custom = shop.machine === CUSTOM_MACHINE;
  const c = shop.custom;
  const setC = (patch: Partial<Shop["custom"]>) => set({ ...shop, custom: { ...c, ...patch } });
  return (
    <div role="tabpanel" aria-label="Machine" className="cam-panel">
      <label>
        <span>Machine</span>
        <select aria-label="Machine" value={shop.machine} onChange={(e) => set({ ...shop, machine: e.currentTarget.value })}>
          <option value={m.id}>{m.name}</option>
          <option value={CUSTOM_MACHINE}>Custom: type your machine's figures</option>
        </select>
      </label>
      {custom ? (
        <div className="cam-form">
          <label>
            <span>Name</span>
            <input aria-label="Machine name" value={c.name} onChange={(e) => setC({ name: e.currentTarget.value })} />
          </label>
          <LenInput label="Travel X" value={c.travelX} units={units} onCommit={(v) => setC({ travelX: v })} placeholder="unknown" />
          <LenInput label="Travel Y" value={c.travelY} units={units} onCommit={(v) => setC({ travelY: v })} placeholder="unknown" />
          <LenInput label="Travel Z" value={c.travelZ} units={units} onCommit={(v) => setC({ travelZ: v })} placeholder="unknown" />
          <NumInput
            label={metric ? "Warn above feed (mm/min)" : "Warn above feed (IPM)"}
            value={c.feedWarnIpm === null ? null : metric ? ipmToMmMin(c.feedWarnIpm) : c.feedWarnIpm}
            onCommit={(v) => setC({ feedWarnIpm: v === null ? null : metric ? mmMinToIpm(v) : v })}
            placeholder="none"
            field="feed-warn"
          />
          <LenInput label="Largest shank" value={c.maxShank} units={units} onCommit={(v) => setC({ maxShank: v })} placeholder="the router's" />
        </div>
      ) : (
        <>
          <table className="cam-table" aria-label="Machine figures">
            <tbody>
              {(
                [
                  ["Travel X", m.travelX],
                  ["Travel Y", m.travelY],
                  ["Travel Z", m.travelZ],
                  ...m.extra.map((x) => [x.label, x.value] as const),
                ] as const
              ).map(([label, s]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{sourcedText(s, metric)}</td>
                  <td>
                    <SrcOf s={s} />
                  </td>
                </tr>
              ))}
              <tr data-testid="feed-warn">
                <td>Maximum feed</td>
                <td>Not published by Carbide; forum figure {sourcedText(m.feedWarn, metric)}. Sawhorse warns above it.</td>
                <td>
                  <SrcOf s={m.feedWarn} />
                </td>
              </tr>
            </tbody>
          </table>
          <ul className="cam-notes">
            {m.notes.map((n) => (
              <li key={n.text}>
                {n.text} <Src id={n.src} />
              </li>
            ))}
          </ul>
        </>
      )}
      <h5>Router</h5>
      <label>
        <span>Router</span>
        <select
          aria-label="Router"
          value={shop.router}
          onChange={(e) => {
            const id = e.currentTarget.value;
            const nr = ROUTERS.find((x) => x.id === id);
            set({ ...shop, router: id, table: nr?.tables[0].id ?? "" });
          }}
        >
          {ROUTERS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
          <option value={CUSTOM_ROUTER}>Another router or spindle: type its RPM</option>
        </select>
      </label>
      {r ? (
        <>
          {r.tables.length > 1 ? (
            <label>
              <span>Read the dial from</span>
              <select aria-label="Dial table" value={shop.table} onChange={(e) => set({ ...shop, table: e.currentTarget.value })}>
                {r.tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <DialTables router={r} />
          <table className="cam-table" aria-label="Router figures">
            <tbody>
              {r.range ? (
                <tr>
                  <td>Speed range</td>
                  <td>
                    {num(r.range.low.value)}–{num(r.range.high.value)} RPM
                  </td>
                  <td>
                    <SrcOf s={r.range.low} />
                  </td>
                </tr>
              ) : null}
              <tr data-testid="shank-limit">
                <td>Shank</td>
                <td>{r.maxShank ? `Up to ${sourcedText(r.maxShank, metric)}${r.collets ? `; collets ${r.collets.map((x) => `${x.value} in`).join(" and ")}` : ""}` : "Not found: check the manual"}</td>
                <td>{r.maxShank ? <SrcOf s={r.maxShank} /> : null}</td>
              </tr>
            </tbody>
          </table>
          <ul className="cam-notes">
            {r.notes.map((n) => (
              <li key={n.text}>
                {n.text} <Src id={n.src} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="cam-form">
          <NumInput label="RPM" value={shop.rpm} onCommit={(v) => set({ ...shop, rpm: v })} placeholder="type it" field="rpm" />
          <p className="note">Sawhorse knows no dial table for this router: type the speed you run it at. A tachometer gives the real one.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Tools

type Draft = { id: string | null; name: string; type: BitType; maker: MakerId | ""; flutes: string } & Record<Exclude<ToolField, "flutes">, string>;
const LEN_FIELDS: { key: Exclude<ToolField, "flutes">; label: string }[] = [
  { key: "diameter", label: "Cutting diameter" },
  { key: "shank", label: "Shank" },
  { key: "cuttingLength", label: "Cutting length" },
  { key: "upcut", label: "Up-cut length" },
  { key: "upcutTol", label: "Up-cut tolerance (±)" },
];

function draftOf(t: Tool | null, metric: boolean): Draft {
  return {
    id: t?.id ?? null,
    name: t?.name ?? "",
    type: t?.type ?? "downcut",
    maker: t?.maker ?? "",
    flutes: t?.flutes === null || t?.flutes === undefined ? "" : String(t.flutes),
    diameter: fieldText(t?.diameter ?? null, metric),
    shank: fieldText(t?.shank ?? null, metric),
    cuttingLength: fieldText(t?.cuttingLength ?? null, metric),
    upcut: fieldText(t?.upcut ?? null, metric),
    upcutTol: fieldText(t?.upcutTol ?? null, metric),
  };
}

function toolLine(t: Tool, metric: boolean): string {
  const type = BIT_TYPES.find((b) => b.id === t.type)!.label;
  const len = (m: number | null) => (m === null ? "unknown" : bothUnits(m, metric, 4));
  const bits = [type, `cuts ${len(t.diameter)}`, `${t.flutes ?? "unknown"} flutes`, `shank ${len(t.shank)}`, `flutes ${len(t.cuttingLength)} long`];
  if (t.type === "compression") bits.push(`up-cut ${len(t.upcut)}${t.upcutTol ? ` ± ${bothUnits(t.upcutTol, metric, 3)}` : ""}`);
  return bits.join(" · ");
}

function ToolsTab({ shop, set, units }: { shop: Shop; set: (s: Shop) => void; units: UnitSystem }) {
  const metric = isMetric(units);
  const [draft, setDraft] = useState<Draft>(() => draftOf(null, metric));
  const [err, setErr] = useState<string | null>(null);
  const editing = draft.id ? toolById(shop, draft.id) : null;
  const start = useMemo(() => (editing ? draftOf(editing, metric) : null), [editing, metric]);
  const save = () => {
    const out: Partial<Record<ToolField, number | null>> = {};
    for (const f of LEN_FIELDS) {
      const t = draft[f.key].trim();
      if (!t) out[f.key] = null;
      else if (start && t === start[f.key] && editing) out[f.key] = editing[f.key];
      else {
        const r = parseLength(t, units);
        if (!r.ok) return setErr(`${f.label}: ${r.error}`);
        out[f.key] = r.metres;
      }
    }
    const fl = draft.flutes.trim() ? Number(draft.flutes) : null;
    if (fl !== null && !Number.isFinite(fl)) return setErr("Flutes: a whole number from 1 to 8.");
    // A field typed over loses its source; one left as it was keeps it.
    const from: Tool["from"] = {};
    if (editing?.from) {
      for (const [k, v] of Object.entries(editing.from) as [ToolField, SourceId][]) {
        const same = k === "flutes" ? fl === editing.flutes : out[k as Exclude<ToolField, "flutes">] === editing[k];
        if (same) from[k] = v;
      }
    }
    const t: Tool = {
      id: draft.id ?? `tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: draft.name.trim(),
      type: draft.type,
      maker: draft.maker || null,
      diameter: out.diameter ?? null,
      flutes: fl,
      shank: out.shank ?? null,
      cuttingLength: out.cuttingLength ?? null,
      upcut: draft.type === "compression" ? (out.upcut ?? null) : null,
      upcutTol: draft.type === "compression" ? (out.upcutTol ?? null) : null,
      from,
      ...(editing?.note ? { note: editing.note } : {}),
    };
    const why = toolProblem(t);
    if (why) return setErr(why);
    setErr(null);
    const tools = draft.id ? shop.tools.map((x) => (x.id === t.id ? t : x)) : [...shop.tools, t];
    set({ ...shop, tools, feeds: { ...shop.feeds, tool: shop.feeds.tool ?? t.id } });
    setDraft(draftOf(null, metric));
  };
  const remove = (id: string) => {
    const tools = shop.tools.filter((x) => x.id !== id);
    const jobTools = Object.fromEntries(Object.entries(shop.jobs.tools).map(([k, v]) => [k, v === id ? null : v])) as JobPrefs["tools"];
    set({ ...shop, tools, profileTool: shop.profileTool === id ? null : shop.profileTool, feeds: { ...shop.feeds, tool: shop.feeds.tool === id ? (tools[0]?.id ?? null) : shop.feeds.tool }, jobs: { ...shop.jobs, tools: jobTools } });
    if (draft.id === id) setDraft(draftOf(null, metric));
  };
  const seedNote = (f: ToolField) => {
    if (!editing) return null;
    const s = seedField(editing, f);
    return s ? (
      <small className="cam-from">
        {s.note ? `${s.note}. ` : ""}
        <SrcOf s={s} />
      </small>
    ) : null;
  };
  return (
    <div role="tabpanel" aria-label="Tools" className="cam-panel">
      <table className="cam-table cam-tools" aria-label="Bits">
        <thead>
          <tr>
            <th>Bit</th>
            <th title="The bit you cut the profiles with: the spacing check before the CNC files are saved reads its diameter">Profile bit</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shop.tools.map((t) => (
            <tr key={t.id} data-tool={t.id} className={draft.id === t.id ? "sel" : undefined}>
              <td>
                {t.name}
                <small>{toolLine(t, metric)}</small>
                {t.note ? <small className="cam-from">{t.note}</small> : null}
              </td>
              <td>
                <input type="radio" name="profile-bit" aria-label={`Profile bit: ${t.name}`} checked={shop.profileTool === t.id} onChange={() => set({ ...shop, profileTool: t.id })} disabled={t.diameter === null} />
              </td>
              <td className="act">
                <button type="button" className="linkish" onClick={() => (setDraft(draftOf(t, metric)), setErr(null))} aria-label={`Edit ${t.name}`}>
                  Edit
                </button>
                <button type="button" className="linkish" onClick={() => remove(t.id)} aria-label={`Delete ${t.name}`}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td>
              None chosen
              <small>The spacing check assumes a 1/4 in (6.35 mm) bit.</small>
            </td>
            <td>
              <input type="radio" name="profile-bit" aria-label="Profile bit: none" checked={shop.profileTool === null} onChange={() => set({ ...shop, profileTool: null })} />
            </td>
            <td />
          </tr>
        </tbody>
      </table>
      <h5>{editing ? `Edit ${editing.name}` : "Add a bit"}</h5>
      <div className="cam-form">
        <label>
          <span>Name</span>
          <input aria-label="Bit name" value={draft.name} size={24} onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })} />
        </label>
        <label>
          <span>Type</span>
          <select aria-label="Bit type" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.currentTarget.value as BitType })}>
            {BIT_TYPES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Maker</span>
          <select aria-label="Maker" value={draft.maker} onChange={(e) => setDraft({ ...draft, maker: e.currentTarget.value as MakerId | "" })} title="A bit by a maker whose chart Sawhorse carries is checked against that maker's own figures">
            <option value="">Unknown or another</option>
            {MAKERS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {LEN_FIELDS.filter((f) => draft.type === "compression" || (f.key !== "upcut" && f.key !== "upcutTol")).map((f) => (
          <label key={f.key}>
            <span>{f.label}</span>
            <input aria-label={f.label} data-field={f.key} value={draft[f.key]} placeholder="unknown" size={10} onChange={(e) => setDraft({ ...draft, [f.key]: e.currentTarget.value })} onKeyDown={(e) => e.key === "Enter" && save()} />
            {seedNote(f.key)}
          </label>
        ))}
        <label>
          <span>Flutes</span>
          <input aria-label="Flutes" data-field="flutes" value={draft.flutes} placeholder="unknown" size={4} onChange={(e) => setDraft({ ...draft, flutes: e.currentTarget.value })} onKeyDown={(e) => e.key === "Enter" && save()} />
          {seedNote("flutes")}
        </label>
      </div>
      {draft.type === "compression" ? <p className="note">The up-cut length is measured from the tip to where the flutes change direction. Every compression bit has its own: the maker's drawing gives it.</p> : null}
      {err ? (
        <p className="note err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="btnrow">
        <button type="button" className="btn primary" onClick={save}>
          {editing ? "Save bit" : "Add bit"}
        </button>
        {editing ? (
          <button type="button" className="btn" onClick={() => (setDraft(draftOf(null, metric)), setErr(null))}>
            Cancel edit
          </button>
        ) : null}
        <button
          type="button"
          className="btn"
          title="Put back the three bits the research gives (Amana 46170 compression, 1/4 in down-cut, 1/8 in end mill); bits you added are removed"
          onClick={async () => {
            if (!(await askYesNo("Replace your bits with the three built-in ones? Bits you added or changed are lost."))) return;
            const tools = seedTools();
            set({ ...shop, tools, profileTool: null, feeds: { ...shop.feeds, tool: tools[0].id } });
            setDraft(draftOf(null, metric));
          }}
        >
          Built-in bits
        </button>
      </div>
      <p className="note">Your bits are kept on this device, not in the model. A size left empty is unknown: Sawhorse then says what it cannot check, rather than guess.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Feeds

function figureRange(f: ChartFigure): string {
  const r = f.min === f.max ? `${f.min}` : `${f.min}–${f.max}`;
  return `${r} ${f.unit}`;
}

function holeLabel(layer: string): string {
  const h = holeOf(layer)!;
  return `${Number((h.diameter * 1000).toFixed(2))} mm × ${h.depth === null ? "through" : `${Number((h.depth * 1000).toFixed(2))} mm deep`} (${layer})`;
}

function FeedsTab({ shop, set, units }: { shop: Shop; set: (s: Shop) => void; units: UnitSystem }) {
  const metric = isMetric(units);
  const tool = toolById(shop, shop.feeds.tool) ?? shop.tools[0] ?? null;
  const material = shop.feeds.material;
  const op = shop.feeds.op;
  const [dial, setDial] = useState<number | null>(null);
  const [depth, setDepth] = useState<number | null>(null);
  const [firstPass, setFirstPass] = useState<number | null>(null);
  const [cutDepth, setCutDepth] = useState<number | null>(null);
  const [thickness, setThickness] = useState<number | null>(null);
  const [hole, setHole] = useState<string>(HOLE_LAYERS[3]);
  const [feed, setFeed] = useState<number | null>(null);
  const machine = machineOf(shop);
  const r = routerOf(shop);
  const table = tableOf(shop);
  const setFeeds = (patch: Partial<Shop["feeds"]>) => set({ ...shop, feeds: { ...shop.feeds, ...patch } });
  const opts: FeedsOptions = { dial, depth, firstPass, cutDepth: op === "pocket" ? cutDepth : null, thickness, hole: op === "hole" ? holeOf(hole) : null, feedIpm: feed, metric };
  const res: FeedsResult | null = tool ? feedsFor(tool, material, op, opts, shop) : null;
  const ipm = (v: number) => (metric ? `${num(ipmToMmMin(v))} mm/min (${num(v)} IPM)` : `${num(v)} IPM (${num(ipmToMmMin(v))} mm/min)`);
  const len = (m: number, d = 4) => bothUnits(m, metric, d);
  const other = r && r.tables.length > 1 && res?.dial ? r.tables.find((t) => t.id !== table?.id)?.steps.find((s) => s.dial === res.dial!.dial) : null;
  if (!tool) {
    return (
      <div role="tabpanel" aria-label="Feeds" className="cam-panel">
        <p className="note">Add a bit in Tools first.</p>
      </div>
    );
  }
  return (
    <div role="tabpanel" aria-label="Feeds" className="cam-panel">
      <p className="note" data-testid="feeds-on">
        On the {machine.name}, {r ? `${r.name}${r.tables.length > 1 && table ? ` (${table.label})` : ""}` : `your router at ${shop.rpm ? `${num(shop.rpm)} RPM` : "an RPM you have not typed"}`}. Change them in Machine.
      </p>
      <div className="cam-form">
        <label>
          <span>Bit</span>
          <select aria-label="Bit" value={tool.id} onChange={(e) => setFeeds({ tool: e.currentTarget.value })}>
            {shop.tools.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Material</span>
          <select aria-label="Material" value={material} onChange={(e) => setFeeds({ material: e.currentTarget.value as MaterialId })}>
            {MATERIALS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Cut</span>
          <select aria-label="Cut" value={op} onChange={(e) => setFeeds({ op: e.currentTarget.value as Operation })}>
            {OPERATIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {table ? (
          <label>
            <span>Dial</span>
            <select aria-label="Dial" value={dial === null ? "" : String(dial)} onChange={(e) => setDial(e.currentTarget.value === "" ? null : Number(e.currentTarget.value))}>
              <option value="">Automatic{res?.autoDial && res.dial ? ` (dial ${res.dial.dial})` : ""}</option>
              {table.steps.map((s) => (
                <option key={s.dial} value={String(s.dial)}>
                  {s.dial} · {num(s.rpm.value)} RPM
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {op === "hole" ? (
          <label>
            <span>Hole</span>
            <select aria-label="Hole" value={hole} onChange={(e) => setHole(e.currentTarget.value)}>
              {HOLE_LAYERS.map((l) => (
                <option key={l} value={l}>
                  {holeLabel(l)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {op === "pocket" ? <LenInput label="Pocket depth" value={cutDepth} units={units} onCommit={setCutDepth} placeholder="optional" field="cut-depth" /> : null}
        <LenInput label="Sheet thickness" value={thickness} units={units} onCommit={setThickness} placeholder="optional" field="thickness" />
        <LenInput label="Depth per pass" value={depth} units={units} onCommit={setDepth} placeholder={res?.depth.recommended ? fieldText(res.depth.recommended, metric) : "optional"} field="depth" />
        {tool.type === "compression" ? <LenInput label="First pass" value={firstPass} units={units} onCommit={setFirstPass} placeholder="optional" field="first-pass" /> : null}
        <NumInput
          label={metric ? "Check a feed (mm/min)" : "Check a feed (IPM)"}
          value={feed === null ? null : metric ? ipmToMmMin(feed) : feed}
          onCommit={(v) => setFeed(v === null ? null : metric ? mmMinToIpm(v) : v)}
          placeholder="optional"
          field="check-feed"
        />
      </div>
      {res ? (
        <>
          {res.warnings.length ? (
            <ul className="cam-warnings" role="alert" data-testid="feeds-warnings">
              {res.warnings.map((w, i) => (
                <li key={`${w.id}-${i}`} data-warning={w.id} data-level={w.level}>
                  <b>{w.level === "stop" ? "Stop" : "Check"}</b> {w.text} {w.src.map((s) => <Src key={s} id={s} />)}
                </li>
              ))}
            </ul>
          ) : null}
          <dl className="cam-result" data-testid="feeds-result">
            <dt>Chipload</dt>
            <dd data-testid="chipload">
              {res.start ? (
                <>
                  Start at <b>{chiploadText(res.start.chipload, metric)}</b> <SrcOf s={res.start.from} />
                  <small>
                    {res.start.why} {res.start.from.note ? `${res.start.from.note}.` : ""}
                  </small>
                </>
              ) : (
                <>Sawhorse has no starting value for this bit and material.</>
              )}
              {res.makerRange ? (
                <small data-testid="maker-range">
                  The bit makers disagree: for this bit and material their figures run from {chiploadText(res.makerRange.min, metric)} to {chiploadText(res.makerRange.max, metric)}, {res.makerRange.spread.toFixed(1)} times apart. Their charts assume industrial machines at 18,000 RPM; the scrap test below finds yours.
                </small>
              ) : null}
              {res.figures.length ? (
                <table className="cam-table cam-figures" aria-label="Each maker's figure">
                  <thead>
                    <tr>
                      <th>Who</th>
                      <th>Chart row</th>
                      <th>Chipload</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.figures.map((f, i) => (
                      <tr key={`${f.src}-${i}`} data-src={f.src}>
                        <td>{(SOURCES[f.src] as Source).maker}</td>
                        <td>
                          {f.bit}
                          {f.flutes ? `, ${f.flutes} flute${f.flutes === 1 ? "" : "s"}` : ""}, {f.dia} {f.diaUnit}, {f.column}
                          {f.note ? <small>{f.note}</small> : null}
                          {f.only && !figureCounts(f, tool.name) ? <small>Not counted: only for {f.only.label}.</small> : null}
                        </td>
                        <td>{figureRange(f)}</td>
                        <td>
                          <Src id={f.src} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </dd>
            <dt>Speed</dt>
            <dd data-testid="speed">
              {res.dial && table ? (
                <>
                  Dial <b>{res.dial.dial}</b>: {num(res.dial.rpm.value)} RPM on {table.label}
                  {res.autoDial ? " (picked: the dial nearest the research's speed for this job, turned down if the feed would pass the machine's limit)" : ""} <SrcOf s={res.dial.rpm} />
                  {other ? <small>Carbide's other table says {num(other.rpm.value)} RPM at this dial.</small> : null}
                </>
              ) : res.rpm ? (
                <>{num(res.rpm)} RPM, as you typed it.</>
              ) : (
                <>No RPM yet.</>
              )}
            </dd>
            <dt>Feed</dt>
            <dd data-testid="feed">
              {res.feedIpm !== null ? (
                <>
                  <b>{ipm(res.feedIpm)}</b>
                  <small>
                    {feed !== null
                      ? res.chipload !== null
                        ? `Your feed gives ${chiploadText(res.chipload, metric)}: feed ÷ (RPM × flutes).`
                        : "Your feed, as typed."
                      : `= ${num(res.rpm!)} RPM × ${tool.flutes} flutes × ${chiploadText(res.chipload!, metric)}${res.depthFactor !== null && res.depthFactor < 1 ? ` (the start × ${res.depthFactor} for a pass deeper than the bit's diameter)` : ""}.`}
                  </small>
                  <Inputs from={res.feedFrom} conf={res.feedConfidence} />
                </>
              ) : (
                <>Not worked out: see above.</>
              )}
            </dd>
            <dt>Plunge and ramp</dt>
            <dd data-testid="ramp">
              {res.rampIpm !== null ? (
                <>
                  Ramp at <b>{ipm(res.rampIpm)}</b>: the feed ÷ {tool.flutes} flute{tool.flutes === 1 ? "" : "s"}
                  <Inputs from={res.rampFrom} conf={res.feedConfidence} />
                </>
              ) : (
                <>No ramp feed without a feed.</>
              )}
              <small>
                ToolsToday: many users run a ramp or plunge at about {PLUNGE.half.value * 100}% of the feed <SrcOf s={PLUNGE.half} />. The Shapeoko e-book: a straight plunge at {PLUNGE.low.value}–{PLUNGE.high.value}% of the feed <SrcOf s={PLUNGE.low} />. Ramp in at about {PLUNGE.ramp.value}° rather than plunging <SrcOf s={PLUNGE.ramp} />. No bit maker's ramp angle was found.
              </small>
            </dd>
            <dt>Depth per pass</dt>
            <dd data-testid="depth">
              {res.firstPass ? (
                <>
                  First pass: <b>deeper than {len(res.firstPass.deeperThan)}</b>, this bit's up-cut part{tool.upcutTol ? " and its tolerance" : ""}, or the top face chips
                  {res.firstPass.feedIpm !== null ? `, at ${ipm(res.firstPass.feedIpm)}${res.firstPass.deeperThan > (tool.diameter ?? Infinity) ? " (deeper than the bit's diameter: 25% off the feed)" : ""}` : ""} <Src id="crs-melamine" /> <Src id="amana-charts" />
                  <br />
                </>
              ) : null}
              {res.depth.recommended !== null ? (
                <>
                  {res.firstPass ? "Later passes" : "Each pass"}: <b>{res.depth.rule === "half" ? "about" : "at most"} {len(res.depth.recommended, 4)}</b>{" "}
                  {res.depth.rule === "half" ? (
                    <>
                      (half the bit's diameter, a Shapeoko community rule) <SrcOf s={COMMUNITY.halfD} />
                    </>
                  ) : (
                    <>
                      (1 × the bit's diameter, the charts' basis) <Src id="amana-charts" />
                    </>
                  )}
                </>
              ) : (
                "Type the bit's cutting diameter."
              )}
              <small>
                The bit makers' charts are for a pass 1 × the diameter deep; past that take 25% off the feed, past 2 × take 50% off <Src id="amana-charts" />. For later passes, the Shapeoko community uses about half the diameter <SrcOf s={COMMUNITY.halfD} />, and says to reduce the makers' depths on a Shapeoko, giving no percentage <Src id="atoz" />.
                {tool.type === "compression" ? " That half-diameter rule is never for a compression bit's first pass, which must be deeper than its up-cut part." : ""}
              </small>
            </dd>
            {op !== "profile" ? (
              <>
                <dt>Stepover</dt>
                <dd data-testid="stepover">
                  Roughing {COMMUNITY.stepoverRoughLow.value}–{COMMUNITY.stepoverRoughHigh.value}% of the diameter, finishing {COMMUNITY.stepoverFinishLow.value}–{COMMUNITY.stepoverFinishHigh.value}% <SrcOf s={COMMUNITY.stepoverRoughLow} />
                  <small>No bit maker's stepover was found.</small>
                </dd>
              </>
            ) : null}
          </dl>
          <p className="note cam-low" data-testid="low-confidence">
            The Shapeoko figures for depth per pass, stepover and ramp are community advice (low confidence): no bit maker and no Carbide 3D page gives them. So is the 200 IPM limit. Treat every value here as a starting point, and find the real one with the scrap test.
          </p>
          {res.notes.length ? (
            <ul className="cam-notes">
              {res.notes.map((n) => (
                <li key={n.text}>
                  {n.text} {n.src.map((s) => <Src key={s} id={s} />)}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <section className="cam-scrap" data-testid="find-your-number" aria-label="Find your number">
        <h5>Find your number</h5>
        <ol>
          {SCRAP_TEST.map((s) => (
            <li key={s.title}>
              <b>{s.title}.</b> {s.text}
              <small>
                {s.says.map((x, i) => (
                  <span key={i}>
                    {(SOURCES[x.src] as Source).maker}: {x.words} <Src id={x.src} />{" "}
                  </span>
                ))}
              </small>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Job sheet

function JobsTab({ shop, set, units }: { shop: Shop; set: (s: Shop) => void; units: UnitSystem }) {
  const metric = isMetric(units);
  const j = shop.jobs;
  const setJ = (patch: Partial<JobPrefs>) => set({ ...shop, jobs: { ...j, ...patch } });
  const setTool = (k: JobKind, v: string) => setJ({ tools: { ...j.tools, [k]: v === "" ? null : v } });
  const profile = toolById(shop, shop.profileTool);
  return (
    <div role="tabpanel" aria-label="Job sheet" className="cam-panel">
      <p className="note">
        Each router sheet's job sheet (the Nesting section's Job sheet, the PDF, and the text file CNC files saves beside each DXF) gives every layer a bit from here, and checks that the bit is narrower than the narrowest shape on that layer in that sheet. Profiles take the Profile bit (Tools): {profile ? profile.name : "none is chosen"}.
      </p>
      <div className="cam-form">
        {JOB_KINDS.map((k) => (
          <label key={k.id} title={k.title}>
            <span>{k.label}</span>
            <select aria-label={`Bit for ${k.label}`} data-field={`job-${k.id}`} value={j.tools[k.id] ?? ""} onChange={(e) => setTool(k.id, e.currentTarget.value)}>
              <option value="">{k.id === "cutout" ? "The profile bit" : "None"}</option>
              {shop.tools.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          <span>Material</span>
          <select aria-label="Job sheet material" value={j.material} onChange={(e) => setJ({ material: e.currentTarget.value as MaterialId })}>
            {MATERIALS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <LenInput label="Hold-down width" value={j.holdDown} units={units} onCommit={(v) => setJ({ holdDown: v })} placeholder={metric ? `${HOLD_DOWN_DEFAULT.metric * 1000} mm` : "4 in"} field="hold-down" />
      </div>
      <p className="note" data-testid="hold-down-note">
        Parts this wide or narrower are flagged for hold-down. Left empty it is Sawhorse's default, {metric ? "100 mm" : "4 in"}: not a standard, since none was found. The docs name 3 in nailers and 4 in stretchers as the parts that need hold-down most.
      </p>
      <h5>Part labels</h5>
      <div className="cam-form">
        <label>
          <span>Paper</span>
          <select aria-label="Label paper" value={j.labels.paper} onChange={(e) => setJ({ labels: { ...j.labels, paper: e.currentTarget.value as LabelPaper } })}>
            <option value="letter">Letter</option>
            <option value="a4">A4</option>
          </select>
        </label>
        <label>
          <span>Label size</span>
          <select aria-label="Label size" value={j.labels.size} onChange={(e) => setJ({ labels: { ...j.labels, size: e.currentTarget.value } })}>
            {LABEL_SIZES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" aria-label="Cut lines" checked={j.labels.outlines} onChange={(e) => setJ({ labels: { ...j.labels, outlines: e.currentTarget.checked } })} />
          <span>Cut lines round each label (for plain paper)</span>
        </label>
      </div>
      <p className="note">The PDF lays the labels out edge to edge in a grid centred on the page. Sawhorse names no label product: print one page on plain paper and hold it against your label sheet before printing on labels.</p>
    </div>
  );
}

export function CncSetupDialog(p: CncSetupDialogProps) {
  const [shop, setShop] = useState<Shop>(() => p.initial ?? loadShop());
  const [tab, setTab] = useState<CncTab>(p.tab ?? "feeds");
  const keep = p.onShop ?? saveShop;
  const set = (s: Shop) => {
    setShop(s);
    keep(s);
  };
  const tabs: [CncTab, string][] = [
    ["machine", "Machine"],
    ["tools", "Tools"],
    ["feeds", "Feeds"],
    ["jobs", "Job sheet"],
  ];
  return (
    <section
      className="name-dialog stock-dialog cam-dialog"
      role="dialog"
      aria-label="CNC setup"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") p.onClose();
      }}
    >
      <header>
        <b>CNC setup</b>
        <small> your machine, your bits, and where to start the feeds and speeds</small>
      </header>
      <div className="tabs cam-tabs" role="tablist" aria-label="CNC setup">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-tab={id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "machine" ? <MachineTab shop={shop} set={set} units={p.units} /> : tab === "tools" ? <ToolsTab shop={shop} set={set} units={p.units} /> : tab === "jobs" ? <JobsTab shop={shop} set={set} units={p.units} /> : <FeedsTab shop={shop} set={set} units={p.units} />}
      <div className="btnrow">
        <button type="button" className="btn" onClick={p.onClose}>
          Done
        </button>
        <button
          type="button"
          className="btn"
          title="Back to the Shapeoko 5 Pro 4x4, the Compact Router and the three built-in bits"
          onClick={async () => {
            if (await askYesNo("Go back to the built-in machine, router and three bits? Your bits and settings here are lost.")) set(defaultShop());
          }}
        >
          Built-in shop
        </button>
      </div>
      <p className="note">
        Kept on this device, not in the model. Hover a source for its document and address; all of them are listed in docs/research/feeds-speeds-sources.md.
      </p>
    </section>
  );
}
