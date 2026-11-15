// The Shopping list section of the Cut list pane: what to buy (sheets and boards from the
// nesting, hardware and banding from the parts), each row with the shop's own price, an
// overage per category, the totals with and without it, what they leave out, and the labour
// saved (for fun). Prices are kept on this device (`cutlist/shop-store.ts`), never in the
// model, so typing one changes nothing in the document. Laid out as a list, not a table: the
// pane is 360 px wide to begin with.
import { useEffect, useMemo, useState } from "react";
import type { CutList, Nesting } from "../kernel/types";
import { amountText, BANDING_PLACEHOLDER, boughtText, checkText, DEFAULT_OVERAGE, knownUnit, MAX_OVERAGE, moneyText, priceList, ROUNDING_NOTE, SHEET_OVERAGE_NOTE, SHOP_CATEGORIES, shoppingList, UNKNOWN_UNIT_NOTE, validCurrency, type PricedRow, type ShopCategory, type ShopPrefs } from "../cutlist/shopping";
import { MAX_PRICE } from "../cutlist/shop-store";

export interface ShoppingSectionProps {
  list: CutList | null;
  nesting: Nesting | null;
  /** The nesting is being worked out again (the rows are of the last one). */
  busy?: boolean;
  /** Why the latest nesting could not be worked out: said even with an older one on screen. */
  problem?: string | null;
  /** The nesting on screen is not of the model as it is now (an edit since, or the last one
   * failed): its sheets and boards are marked as such. */
  stale?: boolean;
  /** Why the list cannot be saved now (its sheets would be of another model state); the CSV
   * button is off and says so. */
  csvBlocked?: string | null;
  prefs: ShopPrefs;
  onPrefs: (p: ShopPrefs) => void;
  /** Save the list as CSV; without it there is no button. */
  onCsv?: () => void;
  /** How money and numbers are written (default: the browser's). */
  locale?: string;
}

/** The group (thousands) and decimal separators of a locale ("," and "." in en-US). */
export function separators(locale?: string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  return { group: parts.find((p) => p.type === "group")?.value ?? ",", decimal: parts.find((p) => p.type === "decimal")?.value ?? "." };
}

/** A typed amount: its value (null: empty), or why it cannot be read. */
export type Parsed = { ok: true; value: number | null } | { ok: false; error: string };

const SPACES = /[\s\u00a0\u202f]/g;
const escape = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A number as typed, read the locale's way: in en-US "1,250" is 1250 and "1,250.50" 1250.5; in
 * de-DE "1.234,50" is 1234.5. A currency sign and spaces are ignored. What the locale cannot
 * read without guessing ("1,25" in en-US: 1.25 or 125?, a decimal point in de-DE, a minus) is
 * refused with a message saying how to write it, never guessed.
 */
export function parseAmount(text: string, locale?: string): Parsed {
  const { group, decimal } = separators(locale);
  const g = group.replace(SPACES, "");
  const how = `write decimals with "${decimal}"${g ? ` and "${g}" only between thousands (1${g}250${decimal}50)` : ""}`;
  const raw = text.trim();
  if (!raw) return { ok: true, value: null };
  if (/[-\u2212]/.test(raw)) return { ok: false, error: "A price is 0 or more" };
  // Spaces (some locales group with them) and a currency sign or code go.
  const t = raw.replace(SPACES, "").replace(/^[^\d.,'’]+|[^\d.,'’]+$/g, "");
  if (!t || !/\d/.test(t)) return { ok: false, error: `Not a number: ${how}` };
  const allowed = new RegExp(`^[\\d${escape(decimal)}${g ? escape(g) : ""}]+$`);
  if (!allowed.test(t)) return { ok: false, error: `Not sure what "${raw}" is here: ${how}` };
  const pieces = t.split(decimal);
  if (pieces.length > 2) return { ok: false, error: `Not sure what "${raw}" is here: ${how}` };
  const [whole, frac = ""] = pieces;
  if (g && frac.includes(g)) return { ok: false, error: `Not sure what "${raw}" is here: ${how}` };
  let digits = whole;
  if (g && whole.includes(g)) {
    // Thousands separators only where thousands are: 1,250 and 12,345,678, never 1,25.
    if (!new RegExp(`^\\d{1,3}(${escape(g)}\\d{3})+$`).test(whole)) return { ok: false, error: `Not sure what "${raw}" is here: ${how}` };
    digits = whole.split(g).join("");
  }
  if (!digits && !frac) return { ok: false, error: `Not a number: ${how}` };
  return { ok: true, value: Number(`${digits || "0"}.${frac || "0"}`) };
}

/** A number as the locale writes it, without thousands separators ("4,25" in de-DE), so what is
 * shown reads back as itself. */
export function amountShown(v: number | null, locale?: string): string {
  return v === null ? "" : new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 6 }).format(v);
}

/** A number field that commits as it is typed (empty clears it), and shows why instead of
 * committing what it cannot read. */
function AmountField({ label, value, max, whole, onCommit, size = 7, locale }: { label: string; value: number | null; max: number; whole?: boolean; onCommit: (v: number | null) => void; size?: number; locale?: string }) {
  const shown = amountShown(value, locale);
  const [text, setText] = useState(shown);
  const [err, setErr] = useState<string | null>(null);
  // From outside (another field, a reload): show it, unless it is what is being typed.
  useEffect(() => {
    const p = parseAmount(text, locale);
    if (!p.ok || p.value !== value) setText(shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  const change = (t: string) => {
    setText(t);
    const p = parseAmount(t, locale);
    if (!p.ok) return setErr(p.error);
    const v = p.value;
    if (v !== null && (v < 0 || v > max || (whole && !Number.isInteger(v)))) {
      setErr(whole ? `A whole number up to ${max}` : `A number from 0 to ${max}`);
      return;
    }
    setErr(null);
    if (v !== value) onCommit(v);
  };
  return (
    <>
      <input
        aria-label={label}
        title={err ?? label}
        aria-invalid={!!err}
        className={err ? "err" : undefined}
        inputMode="decimal"
        value={text}
        size={size}
        placeholder="—"
        onChange={(e) => change(e.currentTarget.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            setText(shown);
            setErr(null);
          }
        }}
      />
      {err ? (
        <small className="amount-err" role="alert">
          {err}
        </small>
      ) : null}
    </>
  );
}

const EMPTY: Record<ShopCategory, string> = {
  sheet: "No sheet goods.",
  lumber: "No solid lumber.",
  banding: BANDING_PLACEHOLDER,
  hardware: "No hardware. A part carries hardware when it says so: the Cabinet generator puts hinges on each door, runners on each drawer front and pins on each loose shelf.",
  tools: "",
};

export function ShoppingSection(p: ShoppingSectionProps) {
  const { prefs } = p;
  const shop = useMemo(() => shoppingList(p.list, p.nesting, { countLeftOut: prefs.countLeftOut }), [p.list, p.nesting, prefs.countLeftOut]);
  const priced = useMemo(() => priceList(shop, prefs), [shop, prefs]);
  const money = (n: number) => moneyText(n, prefs.currency, p.locale);
  const set = (patch: Partial<ShopPrefs>) => p.onPrefs({ ...prefs, ...patch });
  const setPrice = (key: string, v: number | null) => {
    const prices = { ...prefs.prices };
    if (v === null) delete prices[key];
    else prices[key] = v;
    set({ prices });
  };
  const setPack = (key: string, v: number | null) => {
    const packs = { ...prefs.packs };
    if (v === null || v === 0) delete packs[key];
    else packs[key] = v;
    set({ packs });
  };
  const [currency, setCurrency] = useState(prefs.currency ?? "");
  useEffect(() => setCurrency(prefs.currency ?? ""), [prefs.currency]);
  const currencyOk = currency.trim() === "" || validCurrency(currency.trim().toUpperCase()) !== null;
  const waiting = !shop.nested ? (p.problem ? null : "Working out the nesting for the sheets and boards…") : null;
  const stale = shop.nested && (p.stale || !!p.problem);

  const row = (r: PricedRow) => {
    const packable = r.unit !== "sheet" && r.unit !== "board" && knownUnit(r.unit);
    const over = r.buyOver.count !== r.buy.count || r.buyOver.amount !== r.buy.amount;
    return (
      <li key={r.key} data-shop-row={r.key} data-unpriced={r.cost === null ? "true" : undefined} data-stale={stale && (r.category === "sheet" || r.category === "lumber") ? "true" : undefined}>
        <div className="shop-name">
          <span className="name">{r.name}</span>
          {r.sku ? <code title="Part number">{r.sku}</code> : null}
          {r.material ? <small>{r.material}</small> : null}
          {r.saw ? <span className="via saw">track saw</span> : null}
          {knownUnit(r.unit) ? null : <small className="warn">{UNKNOWN_UNIT_NOTE}</small>}
        </div>
        <div className="shop-qty" data-testid="shop-qty">
          Needs {amountText(r.need, r.unit)}
          {r.unit === "board" ? ` (${(r.need * (r.boardFeet ?? 0)).toFixed(1)} bd ft)` : ""} · buy <b>{boughtText(r, r.buyOver)}</b>
          {over ? ` (${r.overage}% over; ${boughtText(r, r.buy)} without)` : ""}
        </div>
        <div className="shop-price">
          <AmountField locale={p.locale} label={`Price per ${r.per}: ${r.name}`} value={r.price} max={MAX_PRICE} onCommit={(v) => setPrice(r.key, v)} />
          <span className="per">per {r.per}</span>
          {packable ? (
            <label className="pack" title={r.unit === "m" ? "Metres in a roll (empty: priced by the metre)" : `${r.unit === "pair" ? "Pairs" : "Pieces"} in a pack (empty: sold singly)`}>
              <span>{r.unit === "m" ? "roll" : "pack"}</span>
              <AmountField locale={p.locale} label={`${r.unit === "m" ? "Roll length (m)" : "Pack size"}: ${r.name}`} value={r.pack} max={MAX_PRICE} whole={r.unit !== "m"} size={4} onCommit={(v) => setPack(r.key, v)} />
            </label>
          ) : null}
          <b className="cost" data-testid="shop-cost">
            {r.costOver === null ? "price not set" : money(r.costOver)}
          </b>
        </div>
        {r.parts?.length ? <small className="on">On {r.parts.map((x) => `${x.name} (${amountText(x.qty, r.unit)})`).join(", ")}</small> : null}
      </li>
    );
  };

  return (
    <section className="shopping" aria-label="Shopping list" data-testid="shopping">
      <header className="nest-head">
        <h4>Shopping list</h4>
        {p.onCsv ? (
          <button type="button" className="btn" onClick={p.onCsv} disabled={!priced.rows.length || !!p.csvBlocked} title={p.csvBlocked ?? "Save the shopping list, with your prices, as a spreadsheet (CSV)"}>
            CSV
          </button>
        ) : null}
      </header>
      <div className="cut-controls shop-controls">
        <label className={currencyOk ? undefined : "err"} title="The currency your prices are in (a three-letter code: USD, CAD, EUR, GBP…); empty: plain numbers">
          <span>Prices in</span>
          <input
            aria-label="Currency"
            value={currency}
            size={4}
            maxLength={3}
            placeholder="—"
            onChange={(e) => {
              const t = e.currentTarget.value.toUpperCase();
              setCurrency(t);
              if (t === "") set({ currency: null });
              else if (validCurrency(t)) set({ currency: t });
            }}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>
      </div>
      <p className="note">Your prices, not the model's: kept on this device for your shop (by stock, part number or item), so typing one changes nothing in the model.</p>
      {p.problem ? (
        <p className="note err" data-testid="shop-problem">
          {p.problem}
          {shop.nested ? " The sheets and boards below are of the model before that." : ""}
        </p>
      ) : null}
      {waiting ? <p className="note">{waiting}</p> : null}
      {stale && !p.problem ? (
        <p className="note" data-testid="shop-stale">
          The sheets and boards are from before the last change: they are being worked out again.
        </p>
      ) : null}
      {shop.unplaced ? (
        <p className="nest-unplaced" role="alert" data-testid="shop-unplaced">
          {shop.unplaced} {shop.unplaced === 1 ? "part is" : "parts are"} on no stock, so not in the sheets and boards here. Nesting says why.
        </p>
      ) : null}
      <div className={p.busy ? "nest-body busy" : "nest-body"} aria-busy={p.busy}>
        {SHOP_CATEGORIES.map((c) => {
          const rows = priced.rows.filter((r) => r.category === c.id);
          const fromNesting = c.id === "sheet" || c.id === "lumber";
          // Tools are bought once, with no overage; shown only when a part asks for one.
          if (c.id === "tools" && !rows.length) return null;
          return (
            <div key={c.id} className="shop-cat" data-category={c.id}>
              <div className="shop-cat-head">
                <b>{c.label}</b>
                {c.id === "tools" ? (
                  <small>one each, however many cabinets</small>
                ) : (
                  <label title={`Added to what the parts need before rounding up. Starts at ${DEFAULT_OVERAGE[c.id]}%: an assumption; set your own.`}>
                    <span>Overage</span>
                    <AmountField locale={p.locale} label={`${c.label} overage (%)`} value={prefs.overage[c.id]} max={MAX_OVERAGE} size={3} onCommit={(v) => v !== null && set({ overage: { ...prefs.overage, [c.id]: v } })} />
                    <span>%</span>
                  </label>
                )}
              </div>
              {c.id === "sheet" && DEFAULT_OVERAGE.sheet === 0 ? <small className="on">{SHEET_OVERAGE_NOTE}</small> : null}
              {rows.length ? <ul className="shop-rows">{rows.map(row)}</ul> : <p className="note">{fromNesting && !shop.nested ? (waiting ?? "No nesting to read.") : EMPTY[c.id]}</p>}
            </div>
          );
        })}
      </div>
      <div className="shop-total" data-testid="shop-total">
        <div>
          <b>{money(priced.totalOver)}</b> <span>with overage</span>
        </div>
        <div>
          <b>{money(priced.total)}</b> <span>without</span>
        </div>
      </div>
      {priced.unpriced.length ? (
        <p className="note warn" data-testid="shop-unpriced">
          {priced.unpriced.length === priced.rows.length
            ? "No prices yet, so the total is of nothing: enter what you pay for each row."
            : `The total leaves out ${priced.unpriced.length} row${priced.unpriced.length === 1 ? "" : "s"} with no price: ${priced.unpriced.map((r) => r.name).join(", ")}.`}
        </p>
      ) : priced.rows.length ? (
        <p className="note">Every row is priced.</p>
      ) : null}
      {shop.check.length ? (
        <div className="note warn" data-testid="shop-check">
          {shop.check.map((c) => (
            <div key={`${c.name}|${c.why}`}>{checkText(c)}</div>
          ))}
        </div>
      ) : null}
      <label className="check shop-leftout" title="A part unticked in the cut list (left out of its totals) still needs its hinges and runners, unless you say otherwise: a missing hinge is worse than a spare.">
        <input type="checkbox" checked={prefs.countLeftOut} onChange={(e) => set({ countLeftOut: e.currentTarget.checked })} aria-label="Count hardware on parts left out of the cut list" />
        <span>Count hardware on parts left out of the cut list</span>
      </label>
      {shop.excluded ? (
        <p className="note" data-testid="shop-leftout">
          {shop.excluded} {shop.excluded === 1 ? "part is" : "parts are"} left out of the totals (unticked in the cut list): {shop.excluded === 1 ? "its" : "their"} wood is not here.
          {shop.leftOutCounted.length ? ` Hardware counted all the same, on ${shop.leftOutCounted.join(", ")}.` : prefs.countLeftOut ? "" : " Nor is their hardware."}
        </p>
      ) : null}
      <div className="shop-labour" data-testid="shop-labour">
        <b>Labour you saved</b> <small>(for fun)</small>
        <div className="shop-price">
          <AmountField locale={p.locale} label="Hours" value={prefs.labour.hours} max={100_000} size={4} onCommit={(hours) => set({ labour: { ...prefs.labour, hours } })} />
          <span className="per">hours ×</span>
          <AmountField locale={p.locale} label="Hourly rate" value={prefs.labour.rate} max={MAX_PRICE} size={5} onCommit={(rate) => set({ labour: { ...prefs.labour, rate } })} />
          <span className="per">per hour</span>
          <b className="cost">{priced.labour === null ? "—" : money(priced.labour)}</b>
        </div>
      </div>
      <p className="note" data-testid="shop-assumptions">
        Overage starts at {DEFAULT_OVERAGE.sheet}% for sheet goods ({SHEET_OVERAGE_NOTE.replace(/\.$/, "")}), {DEFAULT_OVERAGE.lumber}% for lumber, {DEFAULT_OVERAGE.banding}% for banding and {DEFAULT_OVERAGE.hardware}% for hardware: assumptions, not facts; set your own. {ROUNDING_NOTE} Sheets are priced per sheet, lumber per board foot of the boards bought, hardware per piece or pair (or per pack once you set a pack size). Sheets and boards are the nesting's; hardware is what each part carries, times how many of it there are.
      </p>
    </section>
  );
}
