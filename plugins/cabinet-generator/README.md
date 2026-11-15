# Cabinet generator

A sample Sawhorse plugin (plugin API 1). It builds a frameless (European-style) cabinet for a CNC router from its sizes. Every part is a named component on a plywood material, so the Outliner shows the parts, the Cut list nests them as sheet goods, and the Nesting section's **CNC files** writes their dados and holes, a file per sheet named for the cabinet and the parts on it.

## Use it

The step-by-step guide, from a cabinet to the CAM job (shop setup, rows, base frames, the track saw, and what to change when a joint is too tight), is [CNC cabinets](../../docs/CNC-CABINETS.md). What follows is the plugin's own reference.

1. Open the Plugins pane (the puzzle-piece tab at the end of the side panel) and click **Enable…** beside Cabinet generator. The dialog lists what it asks for: read the model, change the model, add a panel and a command, keep settings.
2. The **Cabinet** section appears at the top of the pane, laid out like a cabinet shop's order form: **Start from**, **Name**, then eight numbered groups. Each group shows one line on what is in it while closed ("24 × 34 1/2 × 23 1/4 · 4 toe kick"); click one to open it (the one that was open closes). A field shows only when it applies.
   - **Start from** fills in a cabinet: Base · door and shelf; Drawer base · 3 drawers; Sink base · 2 doors, open top; Base · drawer over 2 doors; Trash pull-out · one 50 qt bin; Wall cabinet · doors, nailers; Tall pantry · needs sheets over 4 ft; or Open shelves · no doors. Each is a clean start: a Base picked after a Tall pantry is the same Base as one picked first. It sets the style, the usual sizes, the toe kick, the shelves, the top and the name. It puts the door pull's place, the drawer pull, the rear nailers, the bins, the number of drawers, **Doors** and **From top, bottom** back to a new cabinet's unless the preset has its own (Base · door and shelf sets its hinges 3 in, 80 mm, from the door's ends, and a metric wall cabinet 50 mm, so they are farther apart than the door is wide, as Blum asks). It keeps everything else: your stock and grain, joinery, back, hardware and CNC settings. Base cabinets are 23 1/4 in deep (24 in with the door, the frameless standard, and a side and a top share a 4 x 4 sheet) with two stretchers for a top; in millimetres they are 870 tall with the toe kick (a 720 carcass on a plinth) and 560 deep.
   - **1 · Size:** width, height (with the toe kick) and depth (the box), and the toe kick: notched into the sides, its height and setback, or none.
   - **2 · Layout:** the style (doors and shelves, drawers, drawers over a door, trash pull-out, open shelves); shelves and whether they are adjustable (on pins) or fixed (in dados); drawers and their heights (all equal, or a short top drawer and the rest equal); single or double doors and the hinge side; the bins.
   - **3 · Fronts and pulls:** full overlay or inset, the reveal gap, and where the door and drawer pulls go.
   - **4 · Materials:** the measured thickness of each sheet.
   - **5 · Construction:** blind dados or butt joints, a full top or two stretchers, the back (in a groove, between the sides, or none) and rear nailers.
   - **6 · Hardware:** drill the hinge, runner and pull holes or not; Blum TANDEM or MOVENTO runners from Blum Inc.'s catalogue (inch lengths) or Blum's European one (mm lengths), and their length; the hinges' inset and boring distance.
   - **7 · CNC:** the bit's diameter and the joint clearance.
   - **8 · Cuts and holes:** every cut and hole, and how it is made.
   - **Generate cabinet**, with what it will add and one line on what it comes to: parts, thicknesses, holes, and the runner's part number.
3. **Editing a cabinet.** The new cabinet is selected, and the panel now edits it: every change rebuilds it in place, one undo step each, with no button to press. Select any cabinet the generator made (a click, a click in the Outliner, or a double-click into it) and the panel shows that cabinet's own settings, kept in the document by cabinet. Click empty space and the panel is back to a new cabinet, numbered on (Base 2); **Add another like this** makes a copy of the one being edited, placed as **Place** says (against it, to start).

4. **A row of cabinets.** Each new cabinet goes against the last one made or edited (**Place**, under Name): right of it at its row's end (to start), left of it at the row's start, **around the corner** right or left (turned a quarter, its back on the next wall, its side a **corner filler** in front of the corner cabinet's carcass, 3 in or 75 mm to start, for the doors and pulls to clear; a filler strip covers the gap), or apart, beside the model. After a corner, Place carries on down the new wall. Pick Base, Generate, click empty space, pick Drawer base, Generate: the drawer base stands against the base, backs in line.
   - A **row** is cabinets side by side: turned the same way, each against the last one's side, backs in line, on one floor (or, for wall cabinets, tops level). It is found from where they stand, so it survives rebuilds, moves and saves.
   - A cabinet made **wider or narrower** moves the cabinets right of it in its row along with its side, in the same undo step. One made **deeper or shallower** keeps its back where it was, on the wall.
5. **Rows and base frames**, the plugin's second panel. Select a cabinet: it names the row ("Row of 3: Base 1, Drawer base 2, Sink base 3 · 78 long, 23 1/4 deep"). Select two or more and **Line up the selected cabinets**: the longest row among them stays where it is, and the others butt against its ends in the order they stand, turned its way, backs in line, on its floor. Move a cabinet roughly into place with Move, then line it up.
6. **A base frame for a row.** With a cabinet of the row selected, the panel plans the frame the row stands on, and its **cut list** (part, quantity, length, width, thickness, then what to do) shows before you make it. **Put the row on a base frame** is one undo step:
   - each cabinet with a toe kick is rebuilt without it, its box the kick shorter, where it stands (the panel says so, and where the tops end up: 34 1/2 in on a 4 in frame);
   - every cabinet is lifted onto the frame's top;
   - the frame goes under them, a component named Base frame 1, selected, so the panel edits it: each change rebuilds it in place (a taller frame lifts the row with it). **Fit to the row again** when the row has changed under it (a wider cabinet, one more).

## The base frame

A ladder: a **front rail** set back for the toes (the toe setback, 3 in or 75 mm to start), a **back rail** at the cabinets' backs (or a **back inset** in from them, for a wall that is not flat), and **sleepers** between them.

| Field | Starts at | |
|---|---|---|
| Height | 4 in (100 mm) | The toe space. Height plus each box is where its top ends up. |
| Toe setback | 3 in (75 mm) | The front rail behind the carcass front. |
| Back inset | 0 | The back rail in from the cabinets' backs. |
| Ends | against walls or cabinets | A showing end is set back like the front, so the toe space turns the corner. |
| Stock | plywood strips, 23/32 in (18 mm) | Strips on Cabinet plywood nest with the carcass on the same sheets; **Lumber** (1 1/2 in, 38 mm, 8 ft) is its own material, counted in board feet. **Thickness** starts at 23/32 in (18 mm) or what you typed last, and does not follow the cabinets' Materials: type your measured thickness. Changing Stock sets it again, to the carcass thickness of the row's first cabinet for plywood. |
| Sleepers | in dados in the rails, 1/4 in (6 mm) deep | Each a dado across the rail's inside face, open top and bottom, the stock plus 0.008 in (0.2 mm) wide (fixed: the frame has no clearance field, and the cabinet's Joint clearance does not reach it); the sleeper's tongue 0.5 mm short so the shoulders close, and the ladder comes out square. Or butted between the rails, glued and screwed. |
| Sleepers at most | 16 in (400 mm) on centre | One at each end of a ladder, one centred under each joint between cabinets (under both sides), and more between. |
| Longest piece | 47 in (1190 mm) | A 4 x 4 sheet less the CNC preset's trim. A longer row is split into **ladders**, each under whole cabinets where it can (a cabinet longer than a piece is split evenly), set side by side and screwed together through their end sleepers. |

**Seeing it first.** Before it is made the panel draws the frame from above, dimensioned: each ladder lettered with its length, the depth rail to rail, each sleeper's centre from its ladder's left end (a table lists every one, for laying it out). **Show it in the model** turns on the plugin's **Base frame** tool: the frame drawn where it will go, each cabinet dashed where it will stand on it (its toe kick off), each ladder labelled; it follows the settings as you change them, and a click makes it. With a frame selected, the tool shows it as its settings now make it.

**Long rails.** Stock **Plywood strips, long rails on the track saw** keeps a ladder in one piece up to 95 in (2420 mm), what a 4 x 8 takes inside the track saw's trim, with butted sleepers: turn on Nesting's **Track saw what won't fit** and the rails go to a 4 x 8 on the saw while the sleepers stay on the CNC. With dados on, a rail too long for the bed has its dados listed as hand work.

The frame follows the shallowest cabinet when depths differ, backs in line. Level it on the floor with shims under the sleepers, screw it down, then set the cabinets on it and screw down through their bottoms; the cut list's last rows say so. The parts are **Base front rail**, **Base back rail** and **Base sleeper** in the Cut list too, so Nesting and **CNC files** cut them with the cabinets: a 78 in row's frame fits one 4 x 4 sheet.

## The details

**Stock, measured.** Four thicknesses, and every joint is cut to them, so measure your sheets:

| Field | Starts at | Used for | Material |
|---|---|---|---|
| Carcass, doors | 23/32 in ("3/4" ply) | sides, top, bottom, shelves, toe kick, doors | Cabinet plywood, Door plywood |
| Drawer faces | 23/32 in, the doors' stock, so a drawer over a door is flush with it | drawer fronts | Drawer front plywood |
| Drawer boxes | 15/32 in | drawer sides, sub-fronts, backs | Drawer box plywood |
| Back, bottoms | 7/32 in ("1/4" ply) | the back, drawer bottoms | Back plywood |

For a 4 x 4 bed, Nesting > Stock... > **Use 4 x 4 plywood** adds 4 x 4 sheets in 3/4, 1/2 and 1/4 and nests every sheet good on them, so each material finds its thickness by itself. Or give a material its own sheet in Stock...: it must be the material's thickness. The plugin defines a material only when the model does not have it, so the sheet you picked is kept when you generate again. The CNC export warns about any part drawn at a thickness its sheet is not.

**Shelves.** **Adjustable** shelves (the default) are loose, 1/32 in short of each side, on 5 mm pins: holes 10 mm deep in rows 37 mm from the front and on the 32 mm grid toward the back, five around each shelf's place (+-64 mm), any that would meet a hinge plate, a runner screw or a joint left out. Each shelf rests on the nearest pin height where all four of its pins are drilled, clear of every hinge plate and above the shelf below; a cabinet with no such height for a shelf is refused. The holes need stock at least 13 mm thick (3 mm of wood behind each), hardware on or off. Only a band is drilled, not the full height: many holes in one face make the model slow to build. **Fixed** shelves sit in blind dados like the top and bottom.

**Top.** A full panel, or two stretchers (the base presets' choice): front and rear, 4 in (100 mm) wide to start, the front one notched like a top, the rear one carrying the back's groove, open between them for a sink.

**Base and back.**
- **Base:** a toe kick (4 x 3 in to start, with the sides notched for it), or none, for a row of cabinets set on a base you build.
- **Rear nailers:** none, top, or top and bottom, the cabinet stock and a height you set (3 in to start), at the rear edge and behind the back (in dados with blind dados on), to screw the cabinet to the wall through. The back moves in to clear them. With no back, shelves stop at the nailers.
- **Back:** sits in grooves in the sides, the top and the bottom, 1/2 in in from the rear edge. The grooves are 5/16 in deep, and the back plus the fit wide. The top and bottom run to the rear edge to carry the groove; fixed shelves stop at the back. A back inset of 0 makes the grooves rabbets along the rear edge; any other inset must leave 3 mm of wood behind the groove, and with nailers the groove and the nailers' dados must not leave a sliver under 3 mm between them. The back can also sit between the sides at the rear, as before. With blind dados, the back's groove must be a different depth from the dados, so each gets its own layer (and bit) in the DXF.

**Fronts.**
- **Doors:** automatic (a pair over 24 in), one or two. One door hinges on the side you pick, and its pull goes on the other edge.
- **Full overlay** (default): the fronts tile the cabinet's face with the gap you set between them (1/8 in) and half of it at the edges.
- **Inset:** fronts sit inside the opening, with half the gap all round. Shelves behind an inset door start the carcass thickness plus 3 mm back from the cabinet's front (0.837 in with 23/32 in stock, 21 mm with 18 mm), so the door and its bumpers close in front of them: the shelf is that much shallower, and a fixed shelf's dados start that much further back. The pin rows do not move (the front row is 37 mm from the cabinet's front). Open shelves and shelves behind overlay doors run to the front. A cabinet too shallow to leave a shelf behind the door is refused.
- A door wider than 24 in is a pair.

**Joinery and bit.**
- **Blind dados:** each side gets a groove for the top, the bottom and each fixed shelf. The groove is a dado depth deep (1/4 in), the stock plus the **Joint clearance** wide (0.008 in), and stops short of the front by the distance you set (1/2 in).
- **Rails:** each rail's tongue is 0.5 mm shorter than its groove, so the shoulders close. Its front corners are notched the stop plus one **bit diameter** deep, so the round end the router leaves in the groove never meets the rail's square shoulder.
- **Narrow grooves:** a groove narrower than the bit (the back and drawer-bottom grooves, about 7/32 in) is listed, to cut with a smaller bit on its own layer.

**Trash pull-out.** One full-height drawer front on Blum runners. The box is a low tray (6 in sides to start); its sub-front and back run full height as uprights, and a bin frame spans between them, in a dado in the sub-front and with a tongue through a slot in the back (a dado there would be in the face opposite the hook holes, a second setup), with a cutout for each bin to hang in by its rim: one, two side by side, or two front to back.
- **Bins** are Rev-A-Shelf's, sized from their customer drawings: 27 qt (RV-1024: rim 10.96 x 10.96 in, 17.75 tall, opening 10.10 x 10.10), 35 qt (RV-35: rim 14.21 x 10.46, 17.85 tall, opening 13.16 x 9.56) and 50 qt (RV-50: rim 14.75 x 10.67, 21.75 tall, opening 13.59 x 9.80). Each cutout is the drawing's minimum opening plus 1/32 in a side; the frame's top is the rim's drop below the rim (1.80, 1.63, 1.75 in), with the bin 1/4 in off the tray floor. Two bins keep their rims 1/8 in apart; every cutout keeps 3/4 in of wood to the frame's edges; a bin turns its long side front to back when that is what fits. **Other: measure it** takes your own cutout and frame height (Knape & Vogt's 35 qt is 9 3/16 in deep at the rim, not Rev-A-Shelf's 10.46), and says the largest cutout the cabinet takes.
- **What fits:** one bin, any of the three, from a 15 in cabinet; two side by side from 26 in (any of the three, with the starting stock and depth). Two front to back need more than the 20 in between a 21 in (533 mm) runner box's uprights (two 35 qt rims are 20.92 in): Rev-A-Shelf's own doubles ride 22 in slides. They fit a deeper cabinet on Blum's European 600 mm runners. The Trash preset is one 50 qt in an 18 in cabinet.
- The cutouts go on CUTOUT_THRU in the DXF.

**Drawer runners.** Drawers are sized for Blum runners from Blum's own tables, in two catalogues (in `RUNNERS` and `RUNNERS_EU` in `cabinet.js`): **Blum Inc.** (US, inch lengths: TANDEM plus BLUMOTION 563H, 2021 catalog pp. 11-15; MOVENTO 763H, 2026 catalog pp. 9-13), the default in inch documents, and **Blum Europe** (mm lengths: TANDEM 560H, TD-127/3; MOVENTO 760H, TD-132/1), the default in metric ones.

| | 563H (US) | 763H (US) | 560H (Europe) | 760H (Europe) |
|---|---|---|---|---|
| Lengths | 229 to 533 mm (9 to 21 in) | 305 to 533 mm (12 to 21 in) | 250 to 600 mm | 250 to 600 mm |
| Least inside depth | Blum's table (557 for 533) | Blum's table | length + 3 | length + 3 |
| Box length | the runner's | the runner's | runner - 10 | runner - 10 |
| Inside of the box | opening - 42 | opening - 42 | opening - 42 | opening - 42 |
| Box height | opening - 21 | opening - 23 | opening - 21.5 | opening - 22.5 |
| Box bottom above the opening | 14 | 16 | 14.5 (drawer bottom's underside 27.5) | 15.5 (28.5) |
| Runner screws above the opening | 37 | 38 | 37 | 38 |
| Runner screws from the front | 37, A, B | 37, A, B, or 3 less each with a 1/2 in or thinner box (no T59.K010M) | 37, 69, then 133 to 325 by length | 37, 69, then 197 to 293 by length |
| Box sides | 12 to 16 | 12 to 16 | 11 to 16 | up to 16 |

Only the System 32 screw holes are drilled; Blum's chipboard-only holes (4 x 15 mm screws) are listed, not drilled. **Runner length** is the longest the inside depth allows, or the one you pick. A 560 mm metric box with a 12 mm back inset has 542 mm inside: a 520 mm 560H or 760H.

**Drawer heights.** A drawer cabinet's fronts are all one height (an overlay front covers the top or the bottom, so the top and bottom boxes are a thickness shorter). Drawers over a door are each **Drawer face height** tall (6 in, 150 mm to start), stacked from the top, with the door under them and the shelves behind it.

**Drawer box construction.**
- The bottom slides in from the back, in grooves 13 mm up in the sides and the sub-front.
- The box back sits on the bottom, so the runner passes under it: there is no runner notch to cut (Blum's "no notching" option). The bottom must be 6 mm (1/4 in) or thinner, or the rear hook hole breaks out of the back's bottom edge.
- The bottom is 1/32 in short of the grooves' bottoms on each edge, and runs to the back of the box, where it is screwed up into the back.

**Hardware.** Tick **Drill hinge, runner and pull holes** to drill what a flat-bed router can.
- **Hinges:** a Blum CLIP top cup, 35 mm and 13 mm deep, in each door's back face. Its centre is 17.5 mm plus the **boring distance** (3 to 7 mm, 5 to start) from the hinge edge. The table says what overlay that gives on a 0 mm plate (Blum: 11 + boring distance, 16 mm at 5) against what the door covers (the side less half the gap), and the boring distance that matches. Hinges sit in from the door's top and bottom by the distance you set (**From top, bottom**, 3 1/2 in or 100 mm to start). A door gets two hinges to 900 mm tall, then three, four (over 1600) and five (over 2000), and never fewer than Blum's weight bands ask for (2 under 15 lb, 3 to 30, 4 to 45, 5 to 60; the door's plywood at 600 kg/m3); Blum's European chart adds one on a door over 600 mm wide, used with that catalogue. The table says how many and why, and warns when the top and bottom hinges are closer together than the door is wide. Each mounting plate gets two 5 mm holes 11.5 mm deep, 32 mm apart, 37 mm back, for plates with pre-mounted system screws (173L8100, 175L8100; the 173L6100 family takes wood screws instead). A hinge that would sit on a fixed shelf, the bottom, the top or a stretcher slides along the door (overlay or inset), and the table says by how much and what it cleared. Sides thicker than a CLIP top can cover (11 mm plus the boring distance plus the side screw's 2 mm) get a door cut to what the hinge reaches, and the table says how much of the side shows.
- **Door pull:** two through holes on the opening edge.
  - Vertical or horizontal.
  - Measured from the top (base cabinets) or the bottom (wall cabinets).
  - Placed by how far the nearer hole is from that end, how far the holes are from the opening edge, and their spacing.
  - A pull that would hit a hinge cup is refused, and so is one whose screw head would land on a side, the bottom, the top, a stretcher or a fixed shelf behind an overlay front (drawer pulls too); the message says how far from the edge to keep it.
- **Drawer pull:**
  - two through holes, centred or a set distance down from the top, at the spacing you set; or
  - **no pull:** a finger notch in the front's top edge, its width and depth yours to set. The sub-front behind it is cut 25 mm lower, so fingers reach behind the front. The notch needs no hardware ticked.
- **Pull hole** is 3/16 in to start (5 mm in a metric document), 12 mm at most.
- **Runner screws:** 5 mm x 13 mm holes in both sides, for Blum system screws.
- **Rear hook holes:** 6 mm x 10 mm in the rear face of each drawer back, 7 mm from each end (the sides' inside faces) and 24 mm above the bottom of the box (Blum: 11 above the 13 mm notch line). The table says how thin the wood is under each and at its floor (about 2 mm with the starting sizes).
- **Locking devices**, drilled by hand: with Blum Inc. runners, T51.1901 (TANDEM) or T51.7601 (MOVENTO), each needing two 2.5 mm pilot holes 10 mm deep at 75 degrees, with the T65.1600.01 template; with Blum Europe runners, T51.1700.04 (TANDEM 560H) or T51.7601 (MOVENTO 760H), placed with Blum's T65.1000.02 drilling template (TD-127/3 and TD-132/1, p. 3 and p. 5).
- 5 and 6 mm holes are smaller than a 1/4 in bit: the table lists them under **Change bit**, and dados narrower than the bit too. Bore each circle with a 1/8 in or 3 mm end mill; a drill bit of the hole's size works only in a spindle that has a collet for its shank and a speed slow enough for drilling ([CNC cabinets](../../docs/CNC-CABINETS.md#2-give-each-layer-its-toolpath)).

The table lists every cut and how it is made. With inset fronts, the hinge plates and runner screws are listed but not drilled: they are left to Blum's inset tables.

**Changing it.** Select the cabinet, or double-click into it, and change anything: it is rebuilt in place, where it stands (moved or turned), one undo step ("Update cabinet") per change. A cabinet open for editing is rebuilt from inside: new parts in, old ones out, the same cabinet. The whole cabinet is one undo step ("Generate cabinet") when it is made.

**Grain.** Each part's grain is set as it is made, so nesting knows which parts may turn: doors vertical (or across), drawer faces across (or vertical), sides vertical (or free when they never show), shelves along their span (where plywood is stiffest), and the inside parts (bottom, top or stretchers, back, toe kick, nailers, drawer boxes and bottoms, bin frame) **free to turn**, so the nester can rotate them to save plywood, or along their length if you ask (Materials > Grain). A grain set by hand in the Cut list or under a Nesting diagram is replaced when the cabinet is rebuilt.

**Square on assembly.** The bottom in its dados and the back in its grooves hold the box square; with stretchers for a top, those two do the work (the stretchers sit in the sides' top rabbet, stopped at the front, but add little on their own). Glue it up with the back in place and check the diagonals (equal within 1/32 in, 1 mm) before the glue sets; Cuts and holes says the same.

The last sizes are kept for next time (the plugin's own store), and which cabinet it made is kept in the document (saved inside the `.shz`). Sizes saved by an older version still load:
- a centred pull stays centred;
- an "undermount" pull (a hole in a front's bottom edge, which no router can drill) becomes no pull;
- a toe kick of 0 becomes no toe kick.

## How it is built

`main.js` is the two panels and the Base frame tool. `cabinet.js` plans the parts and holds the Blum tables. `row.js` finds rows, places cabinets against each other, plans the base frame and lays out its drawing. `keep.js` keeps each cabinet's settings in the document as what differs from `baseline.js` (the defaults frozen as they were at 1.7.0), within the 64 KB a plugin's document store holds: entries for cabinets no longer in the model go oldest first, and anything read from a document is checked before it is used. `mesh.js` builds a closed mesh for a box with grooves, notches, and blind or through holes. The cabinet is one `model.batch(...)` holding one import, so dados and holes are the same undo step as the boxes. Plain JavaScript with `// @ts-check`, checked against `packages/plugin-api/index.d.ts` by `npm run plugin:check`. Read it next to `docs/PLUGINS.md`.

## Licence

MIT (see `LICENSE`). Author: Sawhorse.
