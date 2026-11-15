// The Nesting section of the Cut list pane (lane 9): the cut list's parts laid out on real
// stock by the kernel. Saw (table-saw guillotine or the tightest maxrects layout), kerf and
// trim, a Stock… button for the library; three tiles (sheets, boards, yield); anything no
// stock takes, with why; then one diagram per sheet or board, drawn to scale, each part
// labelled with its tag (hover: its name and size, and the part lights up in the model;
// click: select it), the cuts in order underneath; and the SVG, DXF and PDF exports.
import { useEffect, useMemo, useRef, useState } from "react";
import { onShop } from "../cam/shop";
import { bitName, LAYER_ZERO, narrowestText, orderSummary, stepBefore, stepText, type JobSheet } from "../nesting/jobsheet";
import type { Grain, NestAlgorithm, Nesting, NestSettings, Placement, StockPiece } from "../kernel/types";
import { parseLength, type UnitSystem } from "../lib/units";
import { diagram } from "../nesting/diagram";
import { handWorkLegend, KERF_MAX, nestProblems, type HandWork } from "../nesting/cnc";
import type { NestSettingsPatch } from "../nesting/settingsQueue";
import { ALGORITHMS, cutText, dims, fineU, glueText, JOINT_LOSS_DEFAULT, type Units, nestNote, nestSummary, pieceNumber, pieceYield, placedSize, reasonText, stripText } from "../nesting/format";

export interface NestingSectionProps {
  nesting: Nesting | null;
  /** Why there is no nesting (the kernel refused, or is not loaded). */
  problem?: string | null;
  /** Working it out again (the diagrams are of the last result). */
  busy?: boolean;
  rounding: Units;
  /** How typed kerf and trim are read (a bare number is in these units). */
  units: UnitSystem;
  /** New settings; `patch` is what changed (the rest may be a moment old: apply the patch to the
   * settings as they are now). The saw's fields are patched one by one too: `{ overflow: { kerf } }`. */
  onSettings: (s: NestSettings, patch?: NestSettingsPatch) => void;
  onStock: () => void;
  /** Open CNC setup: the machine, the bits, feeds and speeds (shop data, kept on this device). */
  onCncSetup?: () => void;
  /** The pointer is over a part's rectangle (null: over none). */
  onHover: (p: Placement | null) => void;
  onSelect: (p: Placement) => void;
  /** Set the grain of a nested part's row (one undo step): "none" lets the nester turn it. */
  onGrain?: (p: Placement, grain: Grain) => void;
  /** Save SVG drawings (one piece, or every piece); without it there are no file buttons. */
  onSvg?: (piece: StockPiece | null) => void;
  onDxf?: (flavour: "lwpolyline" | "r12") => void;
  /** One DXF per sheet for a CNC router: the sheet's corner at the origin, a layer per cut. */
  onCnc?: () => void;
  onPdf?: () => void;
  /** The tag of the part lit up from the model side (its rectangle shows it). */
  lit?: string | null;
  /** Mixed: turn the track saw on or off for what does not fit the CNC's sheet (one undo step). */
  onOverflow?: (on: boolean) => void;
  /** The track saw's parts with cuts a router would have made (measured), or null while unknown. */
  handWork?: HandWork[] | null;
  /** Said with that list when the saw's parts, or some of them, could not be measured. */
  handWorkNote?: string | null;
  /** Why no file can be saved from this nesting now (it is not of the model as it is: a new one
   * is being worked out, or could not be). The file buttons are off and say so. */
  blocked?: string | null;
  /** A router sheet's job sheet (its cuts measured; null when there is none to show). Without
   * it the sheets have no Job sheet button. */
  jobSheetOf?: (piece: StockPiece) => Promise<JobSheet | null>;
}

/** Kerf or trim typed in a field: committed on Enter, on leaving the field, or after a pause. */
function LengthField({ label, value, units, rounding, max, onCommit }: { label: string; value: number; units: UnitSystem; rounding: Units; max: number; onCommit: (m: number) => void }) {
  const shown = fineU(value, rounding);
  const [text, setText] = useState(shown);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setText(shown), [shown]);
  // Lane 30 (from the #33 review): a commit reads the value and the settings as they are
  // now, not as they were when the pause timer was set. The timer used to keep its render's:
  // Enter, then the pause, committed the same length twice, and a change from outside while
  // a typed length waited (a plugin, Redo) was undone in the other field when it fired.
  const now = useRef({ value, shown, units, rounding, max, label, onCommit });
  now.current = { value, shown, units, rounding, max, label, onCommit };
  const timer = useRef<number | null>(null);
  const stopTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const commit = (t: string) => {
    // Enter or leaving the field commits now; the pause has nothing left to do.
    stopTimer();
    const c = now.current;
    if (t.trim() === c.shown) return setErr(null);
    const r = parseLength(t, c.units);
    if (!r.ok) return setErr(r.error);
    if (r.metres < 0 || r.metres > c.max) return setErr(`${c.label}: 0 to ${fineU(c.max, c.rounding)}.`);
    setErr(null);
    if (Math.abs(r.metres - c.value) > 1e-9) c.onCommit(r.metres);
  };
  // A short pause after typing re-nests too.
  useEffect(() => {
    if (text === shown) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      commit(text);
    }, 700);
    return stopTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <label className={err ? "err" : undefined} title={err ?? `${label} (type a length: 1/8, 3/32, 3mm)`}>
      <span>{label}</span>
      <input
        aria-label={label}
        value={text}
        size={5}
        onChange={(e) => setText(e.currentTarget.value)}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit(e.currentTarget.value);
          if (e.key === "Escape") {
            setText(shown);
            setErr(null);
          }
        }}
      />
    </label>
  );
}

const TRIM_MAX = 4 * 0.0254;
const JOINT_LOSS_MAX = 0.5 * 0.0254;

/** A CNC router with a 1/4 in (6 mm) bit: the tightest layout, parts 3/8 in (10 mm) apart so
 * one part's cut never reaches the next, and a 1/2 in (12 mm) margin at every sheet edge for
 * the hold-downs and a sheet that is not quite square or full size. */
export function cncSettings(metric: boolean): Pick<NestSettings, "algorithm" | "kerf" | "trim"> {
  return metric ? { algorithm: "maxrects", kerf: 0.01, trim: 0.012 } : { algorithm: "maxrects", kerf: 0.375 * 0.0254, trim: 0.5 * 0.0254 };
}

function PieceDiagram({ piece, rounding, lit, onHover, onSelect }: { piece: StockPiece; rounding: Units; lit?: string | null; onHover: (p: Placement | null) => void; onSelect: (p: Placement) => void }) {
  const d = useMemo(() => diagram(piece), [piece]);
  const [over, setOver] = useState<string | null>(null);
  const S = 1000; // millimetres: friendlier numbers in the viewBox
  // The diagram is drawn the pane's width, so a tag about 10 px tall is 1/25 of the
  // stock's length (then smaller where a part is too small for it).
  const font = d.width * S * 0.04;
  return (
    <svg
      className="nest-diagram"
      viewBox={`0 0 ${d.width * S} ${d.height * S}`}
      role="img"
      aria-label={`${pieceNumber(piece)}: ${piece.placements.length} part${piece.placements.length === 1 ? "" : "s"}, ${pieceYield(piece, rounding)}`}
      onMouseLeave={() => {
        setOver(null);
        onHover(null);
      }}
    >
      <rect className="stock" x={0} y={0} width={d.width * S} height={d.height * S} />
      {d.usable ? <rect className="trim" x={d.usable.x * S} y={d.usable.y * S} width={d.usable.w * S} height={d.usable.h * S} /> : null}
      {d.parts.map((q) => {
        // #49: the model's part lights every strip of its glue-up ("4a" lights "4a.1", "4a.2").
        const on = over === q.p.tag || lit === q.p.tag || (!!q.p.strip && lit === q.p.tag.slice(0, q.p.tag.lastIndexOf(".")));
        const fs = Math.max(0, Math.min(font, (q.w * S * 0.9) / (q.p.tag.length * 0.62), q.h * S * 0.8));
        return (
          <g
            key={q.p.tag}
            className={`part${on ? " on" : ""}`}
            data-tag={q.p.tag}
            onMouseEnter={() => {
              setOver(q.p.tag);
              onHover(q.p);
            }}
            onClick={() => onSelect(q.p)}
          >
            <title>{`${q.p.tag} ${q.p.name}${stripText(q.p)}: ${dims(...placedSize(q.p), rounding)}${q.p.turned ? " (turned)" : ""}. Click to select it and set its grain.`}</title>
            <rect x={q.x * S} y={q.y * S} width={q.w * S} height={q.h * S} />
            {fs > font * 0.18 ? (
              <text x={(q.x + q.w / 2) * S} y={(q.y + q.h / 2) * S + fs * 0.35} fontSize={fs}>
                {q.p.tag}
              </text>
            ) : null}
          </g>
        );
      })}
      {d.cuts.map((c) => (
        <line key={c.c.n} className={`cut${c.c.trim ? " trimcut" : ""}`} x1={c.x1 * S} y1={c.y1 * S} x2={c.x2 * S} y2={c.y2 * S} />
      ))}
    </svg>
  );
}

/** A router sheet's job sheet, as CNC files writes it in the job sheets file: a box to tick for
 * each of the file's cut layers, its bit and feeds, the cut order, the parts. Worked out again
 * when the nesting or CNC setup changes. The ticks are for this screen only, and start again
 * with each nesting (the view is keyed by it). */
function JobSheetView({ piece, load }: { piece: StockPiece; load: (piece: StockPiece) => Promise<JobSheet | null> }) {
  const [js, setJs] = useState<JobSheet | null | undefined>(undefined);
  const [shopTick, setShopTick] = useState(0);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  useEffect(() => onShop(() => setShopTick((t) => t + 1)), []);
  useEffect(() => {
    let stale = false;
    load(piece).then(
      (r) => !stale && setJs(r),
      () => !stale && setJs(null),
    );
    return () => {
      stale = true;
    };
  }, [piece, load, shopTick]);
  if (js === undefined) return <p className="note" data-testid="job-sheet">Working out the job sheet…</p>;
  if (js === null) return <p className="note err" data-testid="job-sheet">No job sheet: this sheet is not one of the router's, or the nesting has changed.</p>;
  const cut = js.layers.filter((l) => l.cut);
  const done = cut.filter((l) => ticked.has(l.name)).length;
  const toggle = (name: string) =>
    setTicked((t) => {
      const next = new Set(t);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  return (
    <section className="job-sheet" data-testid="job-sheet" aria-label={`Job sheet: ${js.number}`}>
      <dl className="cam-result job-facts">
        <dt>DXF</dt>
        <dd data-testid="job-file">{js.file}</dd>
        <dt>In the file</dt>
        <dd>{js.label}</dd>
        <dt>Stock</dt>
        <dd>{js.stock}</dd>
        <dt>Material</dt>
        <dd data-testid="job-material">{js.material}</dd>
        <dt>Thickness</dt>
        <dd>{js.thickness}</dd>
        <dt>XY zero</dt>
        <dd>{js.datum}</dd>
        <dt>Z zero</dt>
        <dd>{js.zZero}</dd>
        <dt>Feeds</dt>
        <dd>{js.setup}</dd>
      </dl>
      {js.notes.length ? (
        <ul className="cam-warnings" role="alert">
          {js.notes.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : null}
      <h5>
        Layers: {done} of {cut.length} with a toolpath
      </h5>
      <p className="note">Every layer except STOCK and LABELS must have a toolpath. Tick each one in your CAM program's layer list as you give it one.</p>
      <ol className="job-layers">
        {js.layers.map((l) => (
          <li key={l.name} data-layer={l.name} data-cut={l.cut ? "true" : "false"} data-fits={l.fits === null ? undefined : String(l.fits)}>
            {l.cut ? (
              <label className="check">
                <input type="checkbox" checked={ticked.has(l.name)} onChange={() => toggle(l.name)} aria-label={`${l.name} has its toolpath`} />
                <b>{l.exportName ?? l.name}</b> <small>{`${l.shapes} shape${l.shapes === 1 ? "" : "s"}`}</small>
              </label>
            ) : (
              <div className="check">
                <b>{l.exportName ?? l.name}</b> <small>reference: no toolpath</small>
              </div>
            )}
            <div className="job-what">{l.toolpath}</div>
            {l.cut ? (
              <dl className="job-detail">
                {l.depth ? (
                  <>
                    <dt>Depth</dt>
                    <dd>{l.depth}</dd>
                  </>
                ) : null}
                <dt>Bit</dt>
                <dd data-testid="job-bit">{l.tool ? `${bitName(l.tool, js.metric)}: ${l.toolWhy}` : `CHOOSE A BIT: ${l.toolWhy}`}</dd>
                {l.narrowest ? (
                  <>
                    <dt>Narrowest</dt>
                    <dd>{narrowestText(l, js.metric)}</dd>
                  </>
                ) : null}
                {/* A div groups each dt with its dd: the only element a dl may hold besides them. */}
                {l.feeds.map((f) => (
                  <div key={f.label} className="job-feed">
                    <dt>{f.label}</dt>
                    <dd>
                      {f.value}
                      {f.conf ? <span className="cam-src" data-conf={f.conf} title={f.from}>{f.conf}</span> : null}
                      {f.from ? <small>{f.from}</small> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {l.fitNotes.length || l.warnings.length ? (
              <ul className="cam-warnings" data-testid="job-warnings">
                {l.fitNotes.map((t) => (
                  <li key={t} data-level="fit">
                    <b>Fit</b> {t}
                  </li>
                ))}
                {l.warnings.map((w, i) => (
                  <li key={`${w.id}-${i}`} data-warning={w.id} data-level={w.level}>
                    <b>{w.level === "stop" ? "Stop" : "Check"}</b> {w.text}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
      <h5 data-testid="job-order">Cut order: {orderSummary(js)}</h5>
      <p className="note">Drills and pockets first, cutouts next, profiles last, so the parts stay held down while their inside cuts are made. Layers that share a bit are cut together.</p>
      <ol className="job-order">
        {js.order.map((st, k) => (
          <li key={k} data-change={st.change ? "true" : undefined} data-choose={st.tool ? undefined : "true"} data-misfit={st.misfit.length ? "true" : undefined}>
            {stepBefore(st).map((b) => (
              <small key={b}>{b.replace(/^\w/, (c) => c.toUpperCase())}.</small>
            ))}
            {stepText(st, k, js.metric).replace(/^\d+\. /, "")}
          </li>
        ))}
      </ol>
      <h5>Parts, smallest first</h5>
      <p className="note">{js.holdDown}</p>
      <ul className="job-parts">
        {js.parts.map((q) => (
          <li key={q.tag} data-hold={q.holdDown ? "true" : undefined}>
            {q.holdDown ? <b className="job-hold">Hold down</b> : null} <span className="tag">{q.tag}</span> {q.name}
            {q.cabinet ? ` (${q.cabinet})` : ""}: {q.size}
            <small>Face up: {q.faceUp}</small>
            <small>{q.grainText}</small>
          </li>
        ))}
      </ul>
      {js.flip.length ? (
        <>
          <h5>FLIP_ layers</h5>
          {js.flip.map((t) => (
            <p key={t} className="note">
              {t}
            </p>
          ))}
        </>
      ) : null}
      {js.compression ? <p className="note job-compression">{js.compression}</p> : null}
      {js.saw ? <p className="note">{js.saw}</p> : null}
      <p className="note">{LAYER_ZERO}</p>
      <small className="note">CNC files saves every router sheet's job sheet in one text file after the DXFs, and the PDF has this one after the sheet's page, with the part labels at the end.</small>
    </section>
  );
}

/** "2 pockets, 12 holes" for a track saw part's hand work. */
export function handWorkCounts(w: HandWork): string {
  const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const bits = [w.pockets ? plural(w.pockets, "pocket", "pockets") : "", w.holes ? plural(w.holes, "hole", "holes") : "", w.cutouts ? plural(w.cutouts, "cutout", "cutouts") : "", w.shaped ? "a shaped outline" : ""].filter(Boolean);
  return bits.join(", ");
}

/** The grain choices for a nested part, as the nester reads them. */
const GRAIN_OPTIONS: [Grain, string][] = [
  ["length", "Along its length"],
  ["width", "Across its width"],
  ["none", "Free to turn"],
];

export function NestingSection(p: NestingSectionProps) {
  const n = p.nesting;
  // The part last clicked in a diagram: its grain can be set under that diagram.
  const [picked, setPicked] = useState<string | null>(null);
  // The router sheet whose job sheet is open (its number in the nesting), if any.
  const [jobFor, setJobFor] = useState<number | null>(null);
  const r = p.rounding;
  const s = n ? nestSummary(n, r) : null;
  const settings = n?.settings;
  const set = (patch: Partial<Omit<NestSettings, "overflow">>) => settings && p.onSettings({ ...settings, ...patch }, patch);
  const saw = settings?.overflow ?? null;
  // One of the saw's fields: only that field is sent, so Saw kerf then Saw trim both land.
  const setSaw = (patch: Partial<NonNullable<NestSettings["overflow"]>>) => settings && saw && p.onSettings({ ...settings, overflow: { ...saw, ...patch } }, { overflow: patch });
  // No file is saved from a nesting that is not of the model as it is.
  const off = !!p.blocked;
  const why = (title: string) => (p.blocked ? p.blocked.replace(/^Nothing was saved: /, "Not now: ") : title);
  // Parts the CNC's sheet cannot take, that the track saw could.
  const tooBig = n && settings?.sheetSize && !saw ? n.unplaced.filter((u) => u.sheet && (u.reason === "too_large" || u.reason === "grain" || u.reason === "no_stock")) : [];
  return (
    <section className="nesting" aria-label="Nesting" data-testid="nesting">
      <header className="nest-head">
        <h4>Nesting</h4>
        <button type="button" className="btn" onClick={p.onStock} disabled={!n} title="The sheets and boards parts are cut from, and which stock each material uses">
          Stock…
        </button>
        {p.onCncSetup ? (
          <button type="button" className="btn" onClick={p.onCncSetup} data-action="cnc-setup" title="Your CNC machine, router and bits, and feeds and speeds to start from. Kept on this device, not in the model.">
            CNC setup…
          </button>
        ) : null}
      </header>
      {settings ? (
        <div className="cut-controls nest-controls">
          <label title={ALGORITHMS.find((a) => a.id === settings.algorithm)?.title}>
            <span>Saw</span>
            <select aria-label="Nesting algorithm" value={settings.algorithm} onChange={(e) => set({ algorithm: e.currentTarget.value as NestAlgorithm })}>
              {ALGORITHMS.map((a) => (
                <option key={a.id} value={a.id} title={a.title}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <LengthField label="Kerf" value={settings.kerf} units={p.units} rounding={r} max={KERF_MAX} onCommit={(kerf) => set({ kerf })} />
          <LengthField label="Trim" value={settings.trim} units={p.units} rounding={r} max={TRIM_MAX} onCommit={(trim) => set({ trim })} />
          <LengthField label="Joint loss" value={settings.jointLoss ?? JOINT_LOSS_DEFAULT} units={p.units} rounding={r} max={JOINT_LOSS_MAX} onCommit={(jointLoss) => set({ jointLoss })} />
          <button
            type="button"
            className="btn"
            onClick={() => set(cncSettings(p.units === "mm" || p.units === "cm" || p.units === "m"))}
            title="Set up for a 1/4 in (6 mm) bit: tightest layout, parts 3/8 in (10 mm) apart, 1/2 in (12 mm) margin at the sheet edges. For a bigger bit, set Kerf larger than the bit."
          >
            CNC spacing
          </button>
          {settings.sheetSize && p.onOverflow ? (
            <label className="check" title="Parts too large for the CNC's sheet are cut on a track saw from 4 x 8 sheets, laid out in straight cuts with the saw's kerf and trim">
              <input type="checkbox" checked={!!saw} onChange={(e) => p.onOverflow?.(e.currentTarget.checked)} data-field="overflow" />
              <span>Track saw what won't fit</span>
            </label>
          ) : null}
          {saw ? (
            <>
              <LengthField label="Saw kerf" value={saw.kerf} units={p.units} rounding={r} max={KERF_MAX} onCommit={(kerf) => setSaw({ kerf })} />
              <LengthField label="Saw trim" value={saw.trim} units={p.units} rounding={r} max={TRIM_MAX} onCommit={(trim) => setSaw({ trim })} />
            </>
          ) : null}
        </div>
      ) : null}
      {p.problem ? (
        <p className="note err">
          {p.problem}
          {n ? " The diagrams below are of the model before that: no file is saved from them." : ""}
        </p>
      ) : null}
      {!n ? (
        p.problem ? null : <p className="note">Nesting the parts…</p>
      ) : (
        <div className={p.busy ? "nest-body busy" : "nest-body"} aria-busy={p.busy}>
          <div className="sum nest-sum">
            <div data-testid="tile-nest-sheets">
              <b>{s!.sheets}</b>
              <span>{s!.sheetsLabel}</span>
            </div>
            <div data-testid="tile-nest-boards">
              <b>{s!.boards}</b>
              <span>{s!.boardsLabel}</span>
            </div>
            <div data-testid="tile-nest-yield" className="wide">
              <b>{s!.yieldText}</b>
              <span>{s!.yieldLabel}</span>
            </div>
          </div>
          {n.unplaced.length ? (
            <div className="nest-unplaced" role="alert" data-testid="nest-unplaced">
              <b>
                {n.unplaced.length} part{n.unplaced.length === 1 ? "" : "s"} on no stock
              </b>
              <ul>
                {n.unplaced.map((u) => (
                  <li key={u.tag}>
                    <span className="tag">{u.tag}</span> {u.name}: {reasonText(u)}
                  </li>
                ))}
              </ul>
              {tooBig.length && p.onOverflow ? (
                <button type="button" className="btn" data-action="overflow" onClick={() => p.onOverflow?.(true)} title="Cut the parts the CNC's sheet cannot take on a track saw, from 4 x 8 sheets in straight cuts; the rest stays on the CNC">
                  Cut {tooBig.length === 1 ? "it" : "them"} on the track saw
                </button>
              ) : null}
            </div>
          ) : null}
          {p.handWork?.length || p.handWorkNote ? (
            <div className="nest-handwork" data-testid="nest-handwork">
              {p.handWork?.length ? (
                <>
                  <b>
                    {p.handWork.length} track saw part{p.handWork.length === 1 ? " has" : "s have"} cuts to do by hand
                  </b>
                  <ul>
                    {p.handWork.map((w) => (
                      <li key={w.tag} title={w.lines.join("\n")}>
                        <span className="tag">{w.tag}</span> {w.name}: {handWorkCounts(w)}
                      </li>
                    ))}
                  </ul>
                  <small data-testid="nest-handwork-legend">Hover a part for its cuts. {handWorkLegend(r)} CNC files saves the list beside the router's files.</small>
                </>
              ) : null}
              {p.handWorkNote ? (
                <p className="note err" role="alert" data-testid="nest-handwork-note">
                  {p.handWorkNote}
                </p>
              ) : null}
            </div>
          ) : null}
          {(() => {
            // Parts the nester moved off the sheet their material names (it is another thickness).
            const off = nestProblems(n, r, reasonText).filter((x) => x.kind === "material");
            return off.length ? (
              <div className="nest-unplaced" role="alert" data-testid="nest-off-sheet">
                <b>
                  {off.length} part{off.length === 1 ? "" : "s"} not on {off.length === 1 ? "its" : "their"} material's sheet
                </b>
                <ul>
                  {off.map((x) => (
                    <li key={x.tag}>
                      <span className="tag">{x.tag}</span> {x.name}: {x.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null;
          })()}
          {n.glue_ups?.length ? (
            <div className="nest-glued" data-testid="nest-glued">
              <b>
                {n.glue_ups.length} part{n.glue_ups.length === 1 ? "" : "s"} glued up for width
              </b>
              <ul>
                {n.glue_ups.map((g) => (
                  <li key={g.tag}>{glueText(g, r)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {n.pieces.length === 0 && !n.unplaced.length ? <p className="placeholder">No parts to nest yet: the cut list is empty.</p> : null}
          {n.pieces.map((piece) => (
            <figure key={piece.index} className="nest-piece" data-piece={piece.index} data-kind={piece.kind} data-saw={piece.saw ? "true" : undefined}>
              <figcaption>
                <b>{pieceNumber(piece)}</b> {saw ? <span className={`via${piece.saw ? " saw" : ""}`}>{piece.saw ? "Track saw" : "CNC"}</span> : null} <span className="stock">{piece.stock}</span>
                {piece.material ? <span className="mat"> · {piece.material}</span> : null}
                <small>
                  {pieceYield(piece, r)}
                  {piece.guillotine ? "" : " · not all straight cuts"}
                </small>
                {p.jobSheetOf && !piece.saw ? (
                  <button
                    type="button"
                    className="linkish"
                    data-action="job-sheet"
                    aria-expanded={jobFor === piece.index}
                    onClick={() => setJobFor(jobFor === piece.index ? null : piece.index)}
                    title="What to set in the CAM program for this sheet: each layer's toolpath, bit and feeds, the cut order, the parts and which face is up"
                  >
                    Job sheet
                  </button>
                ) : null}
              </figcaption>
              {p.jobSheetOf && jobFor === piece.index && !piece.saw ? <JobSheetView key={`${n.hash}:${piece.index}`} piece={piece} load={p.jobSheetOf} /> : null}
              <PieceDiagram
                piece={piece}
                rounding={r}
                lit={p.lit}
                onHover={p.onHover}
                onSelect={(q) => {
                  setPicked(q.tag);
                  p.onSelect(q);
                }}
              />
              {(() => {
                const q = p.onGrain ? piece.placements.find((x) => x.tag === picked) : undefined;
                return q ? (
                  <div className="nest-pick" data-testid="nest-pick">
                    <span>
                      <span className="tag">{q.tag}</span> {q.name}
                    </span>
                    <label>
                      Grain{" "}
                      <select value={q.grain} onChange={(e) => p.onGrain?.(q, e.currentTarget.value as Grain)} data-field="grain">
                        {GRAIN_OPTIONS.map(([g, label]) => (
                          <option key={g} value={g}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <small>Free to turn lets nesting rotate it to save sheet: for parts whose grain never shows. Every copy of the part follows.</small>
                  </div>
                ) : null;
              })()}
              <details>
                <summary>
                  {piece.cuts.length} cut{piece.cuts.length === 1 ? "" : "s"}, {piece.placements.length} part{piece.placements.length === 1 ? "" : "s"}
                  {p.onSvg ? (
                    <button
                      type="button"
                      className="linkish"
                      disabled={off}
                      onClick={(e) => {
                        e.preventDefault();
                        p.onSvg?.(piece);
                      }}
                      title={why("Save this piece's cutting diagram as an SVG drawing (1:1 in mm)")}
                    >
                      SVG
                    </button>
                  ) : null}
                </summary>
                <ol className="nest-cuts">
                  {piece.cuts.map((c) => (
                    <li key={c.n} value={c.n}>
                      {cutText(c, r)}
                    </li>
                  ))}
                </ol>
                <ul className="nest-parts">
                  {piece.placements.map((q) => (
                    <li key={q.tag}>
                      <span className="tag">{q.tag}</span> {q.name}
                      {stripText(q)} {dims(...placedSize(q), r)}
                      {q.turned ? " (turned)" : ""}
                    </li>
                  ))}
                </ul>
              </details>
            </figure>
          ))}
        </div>
      )}
      {p.onSvg && p.onDxf && p.onPdf ? (
        <div className="btnrow" data-blocked={off ? "true" : undefined}>
          <button type="button" className="btn" disabled={off || !n || !n.pieces.length} onClick={() => p.onSvg?.(null)} title={why("Save every piece's cutting diagram as an SVG drawing (one file each, 1:1 in mm)")}>
            SVG
          </button>
          <button type="button" className="btn" disabled={off || !n || !n.pieces.length} onClick={() => p.onDxf?.("lwpolyline")} title={why("Save the layouts as a DXF for CNC and laser: a polyline per part, a layer per sheet or board (mm)")}>
            DXF
          </button>
          <button type="button" className="btn" disabled={off || !n || !n.pieces.length} onClick={() => p.onDxf?.("r12")} title={why("The same DXF in strict R12 form (POLYLINE) for older CAM programs")}>
            DXF R12
          </button>
          {p.onCnc ? (
            <button
              type="button"
              className="btn"
              disabled={off || !n || !n.pieces.length}
              onClick={() => p.onCnc?.()}
              title={why("One DXF per sheet, origin at the sheet's lower-left corner. Layers: PROFILE_THRU (outlines), POCKET_<depth> (dados, grooves), DRILL_<size>_<depth> (holes), CUTOUT_THRU (openings).")}
            >
              CNC files
            </button>
          ) : null}
          <button type="button" className="btn" disabled={off || !n} onClick={() => p.onPdf?.()} title={why("Save a PDF booklet: what to buy, then a page per sheet or board with its diagram and cut sequence")}>
            PDF
          </button>
        </div>
      ) : null}
      {n ? (
        <p className="note" data-testid="nest-note">
          {nestNote(n, r)}
        </p>
      ) : null}
    </section>
  );
}
