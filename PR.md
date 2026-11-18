# CNC cabinets: cabinets cut on a 4 x 4 router, rows and base frames, and CNC plus track saw

Branch `feat/cnc-cabinets` → `main`

## What changed, and why

Sawhorse could draw cabinets and nest a cut list, but it could not take a cabinet to a CNC router. A small shop with a 4 x 4 router needs files it can cut as they are. That means dados cut to the plywood's measured thickness, Blum hinge and runner holes on the right face, parts spaced wider than the bit, and mirrored parts that come out mirrored. It also needs a quick way to lay out a run of cabinets and the base they stand on, and a plan for parts too big for the bed. A wrong DXF wastes a sheet, so every number that reaches the router is tested through the real WASM kernel, not only in unit tests.

**The cabinet generator** (sample plugin, `plugins/cabinet-generator`, now 1.8.1):
- frameless cabinets with blind dados, grooved backs, stretchers, adjustable shelves on 5 mm pins, Blum CLIP top hinges and TANDEM / MOVENTO runners (US and European catalogues), graduated drawers, a Rev-A-Shelf trash pull-out, and nailers;
- an order-form panel that edits the selected cabinet live, one undo step per change;
- rows: place against the last cabinet, around corners, and **Line up**;
- base frames: ladders of plywood strips under a row, drawn and dimensioned before they are made, previewed in the model, and made in one undo step.

**Nesting and the cut list** (app and kernel):
- a CNC DXF per sheet with a layer per operation;
- a CNC router preset;
- **Use 4 x 4 plywood**;
- an export check that stops parts too close for the bit;
- **CNC plus track saw**: parts too big for the router's sheet go to 4 x 8 sheets on a track saw, and the cuts on them are listed as hand work (kernel `NestSettings.overflow`, `StockPiece.saw`);
- the cut list **By assembly**.

**Fixes found while testing:**
- **Plugin storage overflow.** The plugin's 64 KB document store filled after about 40 edits and orphaned the cabinet being edited. Settings are now compact, pruned, and validated when read.
- **Edited cabinet renamed.** A sync during a rebuild renamed the edited cabinet as the next new one.
- **Stale Nesting settings.** One Nesting settings change could undo the one just before it.
- **Lost typing.** Typing in the panel during a rebuild was thrown away.
- **"Made" too early.** "Made …" was announced before the new cabinet was selected.

**Fixes from a critical review before this PR** (each with a test that fails on the code before it):
- **Could ruin a part:**
  - An inset door's hinge cup could land on a fixed shelf, so its plate could not be mounted.
  - Shelf-pin holes went through thin stock with hardware holes off.
  - A pull's screw could land on the carcass behind an overlay front.
  - The track saw's hand work told the reader to measure from the wrong edge, so a pantry side came out as its mirror image.
  - A non-rectangular pocket was listed as the box around it.
  - A dado that runs out of a part was left with round ends.
  - A cabinet at an angle lost its cuts.
  - Files could be saved from a nesting older than the model.
- **Assembled badly or refused good cabinets:**
  - Holes dropped silently when a cut elsewhere lined up with them (a 1 1/2 in kick setback lost the front pin row).
  - A loose shelf sat on a hinge plate.
  - A back inset of 0 overlapped the top and bottom.
  - Thick sides got overlay advice no hinge could follow.
  - Three presets started with a warning (Base and Wall now set their hinge inset; the drawer-over-door base is a pair).
  - Lower bounds were missing, and the validator refused values its messages allowed.
  - Blum Europe rows named the US parts.
  - Metric documents got inch sheets.
- **Panel and rows:**
  - Double-clicks made two cabinets or frames.
  - Undo inside an open cabinet was re-applied by the next edit.
  - A cabinet made inside an open one was deleted by the next edit.
  - Typed edits went to the wrong cabinet or were lost.
  - A copy was built over.
  - Older cabinets were rebuilt from a new cabinet's settings.
  - A short row crashed the base frame planner.
  - Any plugin panel button now acts once per press.

**Performance:**
- **Plugin.** One model read per selection: 169 → 110 plugin calls for twelve selections.
- **Cut list by assembly.** No longer quadratic in the model's size.
- **Hand work.** Measured once per nesting.
- **Stock library.** Read without working out a nesting.

**Docs:**
- New `docs/CNC-CABINETS.md`: a step-by-step guide with every setting's default and limits, the CAM layer setup, and a "what to change when it's off" table.
- The User guide, plugin README and CHANGELOG are updated.

**Compatibility:**
- **Files and hashes.** The new kernel settings are absent until set, so every existing file, golden and nesting hash is unchanged.
- **Plugin storage.** Cabinet settings saved by older versions of the plugin still load.
- **Plugin API.** Unchanged.
- **WASM.** Rebuild the kernel (`npm run wasm`): it has a new `stock_library` export.

## Tests

### How to run them

The shell here has `NODE_ENV=production`, which breaks React's test build, so every JavaScript test command sets `NODE_ENV=test`.

```sh
npm run wasm                                   # build the kernel first (the WASM tests need it)
cd crates && cargo test --workspace            # Rust: kernel, file format, WASM API
cargo clippy --workspace --all-targets
npm run golden:wasm                            # WASM output matches the native goldens
NODE_ENV=test npx vitest run                   # unit and through-the-kernel tests
NODE_ENV=test REQUIRE_KERNEL=1 npx playwright test   # end to end in Chromium
npm run plugin:check                           # plugins type-check against the plugin API
```

### Results (run on 2026-11-14, macOS, on the tree committed as `ec62a4e`)

| Suite | Result |
|---|---|
| Rust `cargo test --workspace` | **657 passed**, 0 failed, 3 ignored (on-demand runs already on `main`: `long_fuzz`, and two timing tests) |
| `cargo clippy --workspace --all-targets` | clean |
| `npm run golden:wasm` | WASM matches the native goldens |
| Vitest | **1,340 passed**, 0 failed, 2 skipped (101 files, 1 skipped) |
| Playwright, 205 tests | **187 passed**, 1 failed (`window-title`, fails on `main` too, see below), 10 skipped on their own conditions (listed below). In the full run the 7 timed tests (`chromium-timed`: model limits) are skipped because their project depends on every `chromium` test passing, so the `window-title` failure stops them; run alone (`--project=chromium-timed --no-deps`), **all 7 pass**. |
| `npm run plugin:check` | 3 plugins clean |
| `npx tsc -b` | clean |

### Tests built on this branch

#### Rust (kernel and WASM API)

| Test | What it proves | Result |
|---|---|---|
| `kernel/tests/nesting.rs` `what_does_not_fit_the_router_goes_to_the_saw` | The bookshelf on a 4 x 4 router: its 71 1/4 in sides and back go to the saw's 4 x 8, laid out guillotine with the saw's kerf and trim. Everything else stays on the 4 x 4 with the router's spacing. The setting round-trips through serde, enters the hash only when set, and a bad saw is refused. | pass |
| `nesting.rs` `the_saw_takes_what_the_router_cannot_and_nothing_else` | Edge cases. A part a hair too long for the router goes to the saw; one too big for the saw stays on no stock, named against the router's sheet; a part that fits stays on the router. Without a saw, the long part is on no stock, as before. A material whose default stock is a 4 x 8 goes to the saw only when one is set. A library with a bad saw (trim over 4 in, a NaN sheet size) is refused. | pass |
| `nesting.rs` `every_nesting_keeps_its_invariants` (property test, extended) | It now draws a router-plus-saw setting a third of the time. Each run checks every nesting invariant: no overlaps, kerf respected, every part placed or reported, the hash is deterministic, and both algorithms place the same parts. The saw's sheets must use its kerf and trim, be guillotine, and only exist when a saw is set. | 256 cases in CI; **5,000 cases passed locally** |
| `kernel/src/testing.rs` `check_nesting_of` | The invariant checker now knows the saw's sheets (the rules above). It is used by every nesting test. | used throughout |
| `wasm-api` `the_stock_library_reads_without_a_nesting` | The new `stock_library` export returns the same library and settings the nesting reports, the track saw included. After a refused bad saw, the library is unchanged. | pass |
| `kernel/tests/sequences.rs` | Only gained the new settings field (no behaviour change). | pass |

#### Vitest: unit and component tests

| File | Tests | What it covers |
|---|---|---|
| `src/plugins/cabinet.test.ts` | 56 | Cabinet geometry: dados cut to the stock plus clearance, the blind dado stop and rail notches cleared for the bit, Blum hinge counts, cup and plate positions, runner tables (US and EU), drawer box sizes, pull and notch rules, trash bins, every validation message. |
| `src/plugins/cabinet-mesh.test.ts` | 10 | Closed meshes with grooves, notches and blind and through holes, and a hole on a face that another cut splits. |
| `src/plugins/cabinet-assembly.test.ts` | 18 | Every preset in both unit systems and every option variant built as solids: no two parts share any volume, every part is closed. A part moved 0.2 mm into its neighbour is caught. |
| `src/plugins/parts.test.ts` | 20 | Part naming, grain per part, the flat import the batch makes. |
| `src/plugins/row.test.ts` | 20 | Rows found from where cabinets stand; placing right, left and around corners; Line up; ladders split at joints; sleeper positions; the layout (5 and 4 sleepers on a 24/18/36 row, end sleepers flush, none over 16 in apart); preview boxes and edges; the dimensioned drawing (lengths, depth, sleeper centres, everything in bounds); long rails on the track saw (one 78 in ladder); metric (100 mm plinth, 1190 mm ladders, a 2100 mm row split 600/600/900); lumber. |
| `src/plugins/keep.test.ts` | 14 | What the plugin keeps in the document. Every preset round-trips exactly in both units. Only the settings that differ from the baseline are kept, values included. Legacy whole-settings entries load; junk is refused or normalised. Frames are validated (wrong shape, NaN, Infinity, strings and singular matrices refused). Pruning drops the oldest dead entries and never a live one. 60 cabinets x 10 edits fit the budget. The frozen baseline is pinned by checksum. |
| `src/nesting/mixed.test.ts` | 18 | The router's and saw's shares; the bit-spacing check counts only the router's sheets; notes; hand work lines (pockets, grouped holes, the other face, cutouts, notched outlines, a turned part measured along its own length, router parts and plain parts left out); labels on titles, tiles and the footer; the track saw switch (adds only missing 4 x 8s, keeps a saw already set, turns off, metric defaults). |
| `src/nesting/cnc.test.ts` | 17 | CNC notes, thickness mismatches, file names, the spacing problem. |
| `src/nesting/machine.test.ts` | 17 | Measured DXF cuts parsed back with `dxf-parser`: layers by operation, true circles, the FLIP_ layers, clipping to the blank. |
| `src/nesting/exportGuard.test.ts`, `settingsQueue.test.ts`, `measure.test.ts` | 14, 8, 3 | A save refused from a nesting older than the model; two quick settings changes both land; a part with missing solids is named. |
| `src/components/NestingSection.test.tsx` | 23 | The track saw offer and switch, saw kerf and trim fields, CNC/Track saw badges, the hand work list. Every settings field sends its change as a patch. |
| `src/components/cutlistGroups.test.tsx`, `src/lib/assembly.test.ts` | 9, 4 | `groupRows`: a shared part split by its pieces with its share of quantity and board feet; visible-only; loose parts last; the pane's headings, order, switch and per-assembly selection. |
| `src/components/NestProblemDialog.test.tsx`, `PluginPanel.test.tsx`, `src/lib/units.test.ts`, `src/io/save.test.ts` | 4, 5, 80, 20 | The problems dialog before export; plugin length fields keep exact values; unit parsing; the hand work `.txt` file type saves like every other type. |

#### Vitest, through the real WASM kernel

| Test (`src/nesting/cabinet-cnc.wasm.test.ts`, `sheetset.wasm.test.ts`) | What it proves |
|---|---|
| Drawer-over-door base and drawer base | Generated with the defaults, nested on 4 x 4 with CNC spacing, measured, a DXF per sheet: every Blum hole is a circle at its true size and depth on the face the router cuts, and nothing is left out. |
| Sink base, trash pull-out, base with an adjustable shelf | Stretchers, pin holes, and nothing cut from both faces. |
| A row's base frame | Rails fit a 4 x 4, there is a dado for every sleeper, cut from one face, and nothing is left out. |
| Mixed: a tall pantry and a base on 4 x 4 | The 84 in parts go to the saw's 4 x 8 (guillotine, 1/8 in kerf, 1/4 in trim), everything else stays on the 4 x 4. The router's files have no spacing or thickness problems. The pantry side's hand work is exactly 3 pockets, 10 hinge-plate holes 37 mm in, 40 shelf-pin holes and its toe-kick notch. Turning the saw off restores the nesting and its hash. |
| The generator's batch | Parts are imported flat with each one's grain set, wrapped in one cabinet, and rebuilt from inside it. |
| Use 4 x 4 plywood | Adds 3/4, 1/2 and 1/4 sheets, nests a part on one, and undoes in one step. |

#### Playwright, end to end (`e2e/cabinet-edits.spec.ts`, new)

Thirteen tests covering the panel findings, each failing on a build of the commit before the fixes: double-clicks on Generate, Line up and the base frame; undo inside an open cabinet; a stray part named in Rows; a cabinet from an older version; a new cabinet inside an open one; typed edits across a click; a quick second base frame edit; a short row; a refused edit; a Move+Ctrl copy; a scaled cabinet. Passed with `--repeat-each=3`.

#### Playwright, end to end (`e2e/plugins-samples.spec.ts`)

| Test | What it drives |
|---|---|
| The selected cabinet changes as its settings do | Live edits in place, one undo each; empty space starts a new one. |
| New cabinets stand in a row; the row goes on a base frame | Rows built by Place; the frame's cut list; toe kicks off. |
| A wider cabinet moves its row along; Line up; a corner | Plus, added here: a cabinet made 12 in deep keeps its back on the wall and stays in its row. |
| Mixed CNC and track saw | Through the UI: a pantry on 4 x 4, the offer button, badges, the hand work list, **CNC files** downloaded (one DXF per router sheet, no saw parts in them, the hand work `.txt` with 5 mm holes), one undo turns it off. |
| Base frame drawn, previewed and made | The PNG drawing and the sleeper table; the preview tool adds nothing until a click makes the frame; the Cut list by assembly shows four headings; long rails on the track saw become one 78 in ladder. |
| 45 changes keep the cabinet editable; save and reopen | 45 width edits in a row (the old store overflowed at about 40); a row on its frame saves and reopens as one; a wider cabinet makes the frame say the row changed; **Fit to the row again** fits it to 54 in. |

The existing `e2e/nesting.spec.ts` (bookshelf nesting, SVG, DXF and PDF exports, CNC spacing, the Stock dialog) also passes.

### Making the tests accurate

- **Assertions that could not fail were replaced.** Three were found. The ladder test compared each sleeper count to itself. The storage test checked the packed keys against a filter of themselves. The pantry hand-work test asked only for "more than 0". Each now asserts real values. Each was checked by breaking the code on purpose (one setting dropped from `pack`; sleepers spaced 20 in apart): the old assertions still passed, the new ones fail.
- **Expected values come from real output.** The hand-work numbers come from the kernel's own output for the default pantry, and were checked by hand: 37 mm = 1 29/64 in to the hinge plates; five hinges on a door over 2000 mm = 10 plate holes.
- **Races are found by repetition.** The cabinet and row e2e tests were run with `--repeat-each 2` and `3`. That is how the sync race and the out-of-order "Made …" message were found; both were fixed, and the repeats pass (28/28).
- **The performance numbers are measured, not estimated.** Plugin calls were counted host-side on 12 cabinets on a base frame, before and after; the instrumentation was removed.
- **Bugs the tests turned up and this branch fixes:**
  - the 64 KB storage overflow (45-edits test);
  - the sync race that renamed an edited cabinet (repeat runs);
  - CNC spacing then the track saw putting the old kerf back (mixed e2e);
  - lost typing during a rebuild (45-edits test);
  - the "Made …" message before selection (repeat runs).

## What is remaining

- **A geometry and hardware review, a panel and storage review, a CNC export review and a docs audit were done and their findings fixed (above).** A security review was not: run `/security-review` or `/code-review` before merging. Areas it was asked to look at:
  - untrusted plugin data read from `.shz` files;
  - async races between sync and rebuilds;
  - validation of the deserialised saw settings;
  - file names built from the document title.
- **One e2e test fails, on `main` too:** `e2e/window-title.spec.ts` "a title the shell cannot set is never mentioned…". It expects one title call and gets two. It fails the same way on `main` (checked in a clean worktree), so it is not caused by this branch, but it is not fixed here.
- **Skipped tests (10, none from this branch):** each skips itself because something it needs is not here:
  - `corpus.spec.ts`: no SketchUp corpus downloaded (`npm run corpus:skp`);
  - `private-fixtures.spec.ts` (8 tests): `SAWHORSE_PRIVATE_FIXTURES` is not set (private .skp files);
  - one `sheets.spec.ts` test that runs only on Windows and Linux.

  Until `window-title` is fixed, a full run also skips the 7 timed tests (they pass on their own, above). CI will show that too.
- **Coverage gaps (known, not tested):**
  - Only one end-to-end test switches to a metric document (an inch cabinet edited there keeps its drawer boxes). Metric cabinets, base frames and the 1220 x 2440 saw sheet are otherwise covered by unit and through-the-kernel tests.
  - The preview tool's overlay geometry is not asserted. The e2e test checks its status text and that it adds nothing to the model; the drawing's geometry is unit-tested; the PNG is checked only for being a real image.
  - The CNC DXFs are parsed back and checked by layer, circle and size, but they have **not been opened in a CAM program or cut on a machine** as part of this PR.
  - The desktop (Tauri) app was not run. The hand work `.txt` save is covered by the save tests' file-type checks, and the browser download is covered end to end.
  - The 5,000-case property run was local only; CI runs 256.
  - The performance figures are one measurement on one machine. There is no benchmark in CI, and By assembly was not timed on a very large model.
- **Known and left as they are:**
  - An inset door at a boring distance of 7 mm is accepted, though Blum's inset table has no value there; an inset door's reveal to the side is not checked against Blum's inset table.
  - A pull over a loose shelf is allowed (the shelf can move).
  - A copy of a base frame is not treated as that frame, and a Move+Ctrl copy keeps its cabinet's name.
  - The plugin cannot see changes made to its own parts (a push/pull, a material), sketch strokes inside a cabinet, or what was added to a cabinet kept by an older version.
  - `PANEL_GAP` is 1/32 in in metric documents too; drawer fronts of a different stock from the doors are not flush with them.
- **Not in this PR (by design):**
  - no walls or room outline;
  - corners are dead corners with a filler (no blind-corner cabinet);
  - hand work is a list, not a drawing;
  - the saw's sheet is fixed at 4 x 8.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
