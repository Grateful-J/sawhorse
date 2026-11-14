# CNC cabinets: from a cabinet to cut files

This guide takes you from an empty model to DXF files your CNC router can cut: frameless cabinets, a row of them, the base frame they stand on, and the parts too big for your router's bed. Each section is a how-to. The tables list every setting you can change to dial in what Sawhorse draws, with the value it starts at and when to change it.

It is written for a small shop with a 4 x 4 ft CNC router (a Shapeoko, an Onefinity, a 4x4 Avid), a CAM program (VCarve, Carbide Create, Fusion) and, for long parts, a track saw. The same steps work on a 4 x 8 router: just skip the 4 x 4 and track saw parts.

The reference behind every setting is in the [User guide](USER-GUIDE.md) (Cut list, Nesting, Plugins) and the plugin's own [README](../plugins/cabinet-generator/README.md). Lengths are given in inches with millimetres in brackets; a metric document starts at the millimetre values.

**Contents**
1. [Why this exists](#why-this-exists)
2. [Quick start: one cabinet to CNC files](#quick-start-one-cabinet-to-cnc-files)
3. [Set up your shop once](#set-up-your-shop-once)
4. [Make and edit a cabinet](#make-and-edit-a-cabinet)
5. [Build a row of cabinets](#build-a-row-of-cabinets)
6. [Put a row on a base frame](#put-a-row-on-a-base-frame)
7. [Nest the parts and save the CNC files](#nest-the-parts-and-save-the-cnc-files)
8. [Set up the CAM job](#set-up-the-cam-job)
9. [Parts too big for the bed: the track saw](#parts-too-big-for-the-bed-the-track-saw)
10. [Read the cut list by assembly](#read-the-cut-list-by-assembly)
11. [Dialling in: what to change when something is off](#dialling-in-what-to-change-when-something-is-off)
12. [What is kept with the model](#what-is-kept-with-the-model)
13. [Limits](#limits)

## Why this exists

A CNC router cuts exactly what the file says. A dado drawn 3/4 in wide in 23/32 in plywood leaves a 1/32 in gap in every joint. Two parts nested closer than your bit fuse into one shape in the CAM program. A hinge cup drilled on the wrong face ruins a door. So every number that reaches the router comes from settings you control:
- the sheet's measured thickness;
- your bit's diameter;
- the clearance you want in a joint;
- the spacing between parts and the margin at the sheet's edge;
- Blum's own hardware tables.

Sawhorse checks them before it writes a file: it stops an export whose parts are too close for the bit, and it names any part drawn at a thickness its sheet is not.

On a 4 x 4 bed, two more problems come up: a run of cabinets needs a base, and some parts (a pantry side, a long rail) do not fit the bed at all. The row tools and base frames handle the first. Mixed CNC and track saw nesting handles the second: it sends only those parts to a 4 x 8 on the track saw, and lists the cuts on them you make by hand.

## Quick start: one cabinet to CNC files

1. **Turn the plugin on.** Open the **Plugins** pane (the puzzle-piece tab at the end of the right panel). Click **Enable…** beside **Cabinet generator**, read what it asks for, and click **Enable**. Its **Cabinet** panel appears in the pane.
2. **Pick a cabinet.** In **Start from**, choose **Base (door and shelf)**. Type a **Name** if you like ("Sink base 1"): it names the cabinet and its CNC files.
3. **Make it.** Click **Generate cabinet**. The cabinet appears in the model, selected, and the panel now edits it.
4. **Tell Sawhorse your sheets.** Open the **Cut list** tab, click **Nesting ›** at the bottom, click **Stock…**, then **Use 4 x 4 plywood (3/4, 1/2, 1/4)** and **Done**.
5. **Space the parts for your bit.** Back in the Nesting section, click **CNC spacing**.
6. **Save the files.** Click **CNC files**. You get one DXF per sheet, in millimetres, with the sheet's lower-left corner at 0,0.
7. **Cut.** Open each file in your CAM program and give each layer its toolpath ([Set up the CAM job](#set-up-the-cam-job)).

Before cutting real plywood, do [Set up your shop once](#set-up-your-shop-once): the defaults assume plywood that measures exactly 23/32 in and a 1/4 in bit.

## Set up your shop once

Do this once per shop. The cabinet settings are remembered for the next cabinet (the plugin's own store), and the stock library and nesting settings are saved with each model.

### 1. Measure your plywood

Every dado, groove and rabbet is cut to the thickness you type, not the thickness the yard sells. Measure a few sheets with calipers, take the average, and type it in the cabinet panel's **4 · Materials** group:

| Field | Starts at | Used for |
|---|---|---|
| **Carcass, doors** (or **Carcass**) | 23/32 in (18 mm) | sides, top, bottom, shelves, stretchers, toe kick, nailers, doors |
| **Drawer faces** | 23/32 in (18 mm) | drawer fronts. Keep it the same as the doors so a drawer over a door is flush with it. |
| **Drawer boxes** | 15/32 in (12 mm) | drawer sides, sub-fronts and backs |
| **Back, bottoms** (or **Back**) | 7/32 in (6 mm) | the back and the drawer bottoms. Must be thinner than the carcass. |

Each must be more than 0 and at most 2 in.

### 2. Tell Nesting which sheets you buy

In the Cut list, open **Nesting ›** and click **Stock…**:
- **Use 4 x 4 plywood (3/4, 1/2, 1/4)** adds 4 x 4 sheets at 23/32, 15/32 and 7/32 in and makes every sheet good nest on 4 x 4. It is one undo step, and any sheets you already have are kept. Each cabinet part then finds the sheet of its own thickness.
- If your plywood measures differently, **Edit** each 4 x 4 sheet and type its **actual** thickness, the same number you typed in the cabinet panel. A part is matched to a sheet within 1/16 in, but its dados are cut to the cabinet panel's number.
- **Nest sheet goods on** picks the footprint: your 4 x 4, or 4 x 8 for a bigger router. It never falls back to a larger sheet on its own. To send the parts that do not fit to a track saw, see [Parts too big for the bed](#parts-too-big-for-the-bed-the-track-saw).

### 3. Enter your bit and joint clearance

In the cabinet panel's **7 · CNC** group:

| Field | Starts at | Limits | What it does | Change it when |
|---|---|---|---|---|
| **Bit diameter** | 1/4 in (6 mm) | more than 0, up to 1/2 in | The end mill you cut the dados and profiles with. Rail corners are notched the dado stop plus one bit diameter deep, so the round end the bit leaves in a blind dado never meets a square shoulder. Grooves and holes narrower than the bit are listed in **8 · Cuts and holes**, to cut with a smaller tool. | You use a different bit. |
| **Joint clearance** | 0.008 in (0.2 mm) | 0 to 1 mm (0.04 in) | Added to every dado and groove over the stock's thickness. | Test joints are too tight (raise it) or sloppy (lower it). |

To find your clearance, cut one test dado in a scrap, then try the plywood in it. A part that needs a mallet wants about 0.004 in (0.1 mm) more. One that wobbles wants less.

### 4. Space the parts for the bit

In the Nesting section, **CNC spacing** sets:
- **Saw** to **Tightest (CNC)**;
- **Kerf** (the gap between parts) to 3/8 in (10 mm);
- **Trim** (the margin at every sheet edge) to 1/2 in (12 mm).

That suits a 1/4 in (6 mm) bit. With a wider bit, type a **Kerf** larger than the bit: the gap must be wider than the bit, or the CAM program sees two neighbouring parts as one shape and cuts around the pair. Kerf goes up to 1/2 in and trim up to 4 in. These settings are saved with the model, so set them in each new model (or start new models from one that has them).

## Make and edit a cabinet

### Choose a starting cabinet

**Start from** sets the style, the usual sizes, the top and the name. It keeps your stock, joints, hardware and CNC settings.

| Preset | What you get |
|---|---|
| Base (door and shelf) | 24 x 34 1/2 x 23 1/4 in (600 x 870 x 560 mm), a door, one adjustable shelf, two stretchers for a top, a 4 x 3 in toe kick |
| Drawer base (3 drawers) | Three drawers on Blum runners |
| Sink base (2 doors, open top) | Two doors, stretchers, no shelf |
| Base (drawer over door) | A drawer front 6 in (150 mm) tall over a door |
| Trash pull-out (2 bins) | A full-height pull-out with a bin frame cut for Rev-A-Shelf bins |
| Wall cabinet (doors, nailers) | Doors, shelves and rear nailers to screw it to the wall |
| Tall pantry | Doors and shelves, 84 in tall: its sides need a sheet over 4 ft (see the track saw) |
| Open shelves | No doors |

A base cabinet is 23 1/4 in deep: 24 in with its door, the frameless standard, and its side and top share one 4 x 4 sheet.

### The groups, and what each one dials in

Click a group's title to open it; a closed group shows a one-line summary. Fields appear only when they apply.

**1 · Size**

| Field | Starts at (in / mm) | Notes |
|---|---|---|
| Width, Height, Depth | 24 / 600, 34 1/2 / 870, 23 1/4 / 560 | Height includes the toe kick. Depth is the box, without the door. |
| Toe kick | Notched into the sides | **None (on a separate base)** for a cabinet that will sit on a base frame. A base frame takes the kick off for you, so you can leave it on. |
| Kick height, Kick setback | 4 / 100, 3 / 75 | The setback must leave the side standing. |

**2 · Layout:** the **Style** (doors and shelves, drawers, drawers over a door, trash pull-out, open shelves), then:
- **Shelves** (0 to 20) and **Shelf type**: **Adjustable, on 5 mm pins** (loose shelves, 1/32 in short of each side) or **Fixed, in dados**.
- **Drawers** (up to 8) and **Drawer heights**: **All equal**, or **Short top drawer, rest equal** with its **Top face height** (at least 3 in, 76 mm). In drawers over a door, **Drawer face height** is each front's height (at least 3 in).
- **Doors**: **Automatic** (a pair over 24 in), **Single** or **Double**, and the **Hinge side** of a single door.
- For a trash pull-out, **Bins** (two front to back, two side by side, or one), **Bin** (Rev-A-Shelf 27, 35 or 50 qt, or **Other: measure it**) and **Tray side height**.

**3 · Fronts and pulls**

| Field | Starts at | Notes |
|---|---|---|
| Mounting | Full overlay | **Inset** puts the fronts inside the opening. With inset, hinge plates and runner screws are listed, not drilled. |
| Reveal gap | 1/8 in (3 mm) | Between fronts, with half of it at the outer edges. 0 to 1/2 in. |
| Door **Pull** | Vertical | Vertical, horizontal or none, on the edge away from the hinges. |
| Measure from | Top (base cabinets) | **Bottom** for wall cabinets. |
| From the top/bottom, From the edge, Hole spacing | 2 1/2 in, 1 1/2 in, 3 in (64, 38, 96 mm) | A pull that would land on a hinge cup is refused. |
| Drawer **Pull** | Centred | **Near the top** (with **From the top**), **Finger notch** (with **Notch width** and **Notch depth**: the sub-front behind it is cut 25 mm lower for your fingers), or none. |
| Pull hole | 3/16 in (5 mm) | Up to 12 mm. 3/16 in suits US 8-32 pull screws. |

**4 · Materials:** the thicknesses (above), then **Grain**: **Doors** (vertical or across), **Drawer faces** (across or vertical), **Sides** (vertical, or **Free to turn** when they never show), and **Inside parts** (**Free to turn**, or **Along their length**). A part that is free to turn lets the nester rotate it to save plywood. A grain you set by hand in the Cut list is replaced when the cabinet is rebuilt.

**5 · Construction**

| Field | Starts at (in / mm) | Limits | Notes |
|---|---|---|---|
| Joinery | Blind dados | | **Butt joints** for screws only. |
| Dado depth | 1/4 / 6 | at most half the stock | |
| Dado stop | 1/2 / 12 | more than 0 | How far short of the front the dado stops, so it never shows. |
| Top | Full panel | | **Two stretchers** (front and rear) for a countertop or a sink. |
| Stretcher width | 4 / 100 | at least 2 in, two narrower than the depth | |
| Back | In a groove | | **Between the sides**, or **None**. |
| Groove depth | 5/16 / 8 | at most half the stock | Must differ from the dado depth, so each gets its own DXF layer and toolpath. |
| Back inset | 1/2 / 12 | under a third of the depth | The groove's distance from the rear edge. |
| Rear nailers | None | | **Top**, or **Top and bottom**, with **Nailer height** (3 in, 75 mm). Needs the back in a groove, or no back. |

**6 · Hardware**
- **Drill hinge, runner and pull holes** (on): the router drills 35 x 13 mm hinge cups, the plates' 5 mm system-screw holes, the runners' screw holes, the rear hook holes in each drawer back, and the pull holes. Turn it off to drill by hand or with a jig.
- **Runners**: Blum **TANDEM** or **MOVENTO**. **Catalogue**: **Blum Inc. (US, inch lengths)** or **Blum Europe (mm lengths)**. **Length**: **Automatic: longest that fits**, or a length you pick.
- **From top, bottom** (3 1/2 in, 100 mm): each hinge's distance from the door's end. Blum's charts set how many hinges by door height and weight.
- **Boring distance** (5 mm, 3 to 7 mm): the cup's edge to the door's edge. **8 · Cuts and holes** compares the overlay it gives with what your door covers, and names the distance that matches.

**8 · Cuts and holes** is the shop sheet: every cut and hole, its size and depth, and how it is made. It also lists what the router cannot do: the locking devices' pilot holes, drilled by hand with Blum's template, and any groove or hole smaller than your bit.

### Edit a cabinet

- **Change the one you just made:** it is selected and the panel edits it. Every change rebuilds it in place, with one undo step (Ctrl+Z) per change and no button to press.
- **Edit an older one:** click it (or click it in the Outliner, or double-click into it). The panel shows that cabinet's own settings.
- **Start a new one:** click empty space. The panel goes back to a new cabinet, numbered on (Base 2).
- **Copy one:** **Add another like this** makes a copy of the cabinet being edited, placed as **Place** says.

If a setting cannot be built (a dado deeper than half the stock, a pull on a hinge cup, a drawer too short for its runner), a warning in the status line says why, and the cabinet is left as it was.

## Build a row of cabinets

A row is cabinets side by side: turned the same way, each against the last one's side, backs in line, on one floor. Wall cabinets line up by their tops instead. Sawhorse finds rows from where the cabinets stand, so a row survives rebuilds, moves and saves.

### Add cabinets to a row

1. Make the first cabinet.
2. Click empty space.
3. In **Place**, choose where the next one goes, relative to the last cabinet made or edited:
   - **Right of …, at its row's end** (the default);
   - **Left of …, at its row's start**;
   - **Around the corner, right of …'s row** or **left of …'s row**: turned a quarter, its back on the next wall. **Corner filler** (3 in, 75 mm) is the gap from the corner cabinet's carcass front to the new cabinet's side, so doors and pulls clear. After a corner, Place carries on down the new wall.
   - **Apart, beside the model**.
4. Pick the next cabinet in **Start from** and click **Generate cabinet**.

Widening or narrowing a cabinet moves the cabinets right of it along, in the same undo step. Making one deeper or shallower keeps its back where it was, on the wall.

### Line up cabinets placed by hand

1. Move the cabinets roughly into place with Move.
2. Select two or more (Shift+click).
3. In the **Rows and base frames** panel, click **Line up the selected cabinets**.

The longest row among them stays where it is. The others butt against its ends in the order they stand, turned its way, backs in line, on its floor. It is one undo step.

## Put a row on a base frame

A base frame is a ladder the row stands on, in place of each cabinet's toe kick. It is easier to level once than to shim each cabinet, and a 4 x 4 router can cut it. It has a **front rail** set back for your toes, a **back rail** at the cabinets' backs, and **sleepers** between them: one at each end, one centred under every joint between cabinets, and more so none is farther apart than you set. A row longer than one piece of plywood is split into several **ladders**, set side by side and screwed together through their end sleepers.

### Plan it

Select any cabinet in the row. The **Rows and base frames** panel names the row ("Row of 3: Base 1, Drawer base 2, Sink base 3 · 78 long, 23 1/4 deep") and shows the frame's settings:

| Field | Starts at (in / mm) | What it dials in |
|---|---|---|
| Height | 4 / 100 | The toe space. The cabinets' tops end up at the frame's height plus each box (34 1/2 in on a 4 in frame). |
| Toe setback | 3 / 75 | The front rail behind the cabinets' fronts. |
| Back inset | 0 | The back rail in from the cabinets' backs, for a wall that is not flat. |
| Ends | Against walls or cabinets | **Left end shows**, **Right end shows** or **Both ends show**: that end is set back like the front, so the toe space turns the corner. |
| Stock | Plywood strips (CNC) | **Plywood strips, long rails on the track saw**, or **Lumber** (1 1/2 in, 38 mm, its own material, counted in board feet). Plywood strips use the carcass's plywood and nest on the same sheets. |
| Thickness | the row's carcass stock | |
| Sleepers | In dados in the rails | Each dado runs across the rail's inside face, the stock plus 0.008 in (0.2 mm) wide. The sleeper's tongue is 0.5 mm short so its shoulders close, and the ladder comes out square. **Butted between the rails** for glue and screws. |
| Dado depth | 1/4 / 6 | At most half the stock. |
| Sleepers at most | 16 / 400 | Centre to centre. Must be more than two thicknesses. |
| Longest piece | 47 / 1190 | A 4 x 4 less the CNC trim. Longer rows split into ladders, under whole cabinets where they can. |

The setback and back inset must leave at least 2 in between the rails for the sleepers.

### See it before you make it

The panel draws the frame from above and shows:
- **The drawing**, dimensioned: each ladder lettered (A, B, …) with its length, the depth rail to rail, and each sleeper's centre measured from its ladder's left end.
- **The layout table**: every sleeper centre, ladder by ladder. Use it to mark out a frame you assemble by hand.
- **The cut list**: part, quantity, length, width and thickness, then the steps to put it together.

To see it in the model, click **Show it in the model**. The plugin's **Base frame** tool draws the frame where it will go, and each cabinet dashed where it will stand on it (its toe kick already off). Each ladder is labelled with its length and sleeper count. Change a setting in the panel and the preview follows. Press Esc or pick another tool to leave without making anything.

### Make it

Click **Put the row on a base frame**, or click in the model while the Base frame tool is showing it. In one undo step:
- each cabinet with a toe kick is rebuilt without it (its box the kick shorter);
- every cabinet is lifted onto the frame;
- the frame (Base frame 1) goes under them, selected, so the panel edits it.

Change the frame's settings to rebuild it in place: a taller frame lifts the row with it. If the row changes underneath it (a wider cabinet, one more cabinet), the panel says **The row has changed since this frame was made**: select the frame and click **Fit to the row again**.

To install it, level the frame on the floor with shims under the sleepers and screw it down, then set the cabinets on it and screw down through their bottoms. The last rows of the cut list say the same.

### Rows longer than the bed

On a 4 x 4 bed, a 78 in row becomes ladders of 42 and 36 in (split at a joint between cabinets). To keep each rail in one piece instead:
1. Set **Stock** to **Plywood strips, long rails on the track saw**. A ladder can then be up to 95 in (2420 mm), what a 4 x 8 takes inside the track saw's trim, and the sleepers are butted.
2. In Nesting, turn on **Track saw what won't fit** ([below](#parts-too-big-for-the-bed-the-track-saw)). The long rails go to a 4 x 8 on the saw; the sleepers stay on the CNC.

The panel says when a rail is longer than a 4 x 4 bed takes. If you keep dados on with long rails, those dados are listed as hand work.

## Nest the parts and save the CNC files

### Nest

1. Open the **Cut list** tab and click **Nesting ›**.
2. Check the tiles (sheets, boards, yield) and the **Parts on no stock** list. Nothing is ever dropped silently: each part that has no stock says why (too large, no sheet of that thickness, grain).
3. Hover a part in a diagram to light it up in the model; click it to select it. Under a diagram you can set a part's grain (**Along its length**, **Across its width**, **Free to turn**).

### Save the CNC files

Click **CNC files**. If something is wrong, Sawhorse asks first in **The nesting has problems**:
- **The parts are too close for the bit**: click **Use CNC spacing**, or set **Kerf** larger than your bit. **Save the CNC files anyway** writes them as they are.
- **Parts on no stock** or the wrong stock: fix them in **Stock…** first.

You get one DXF per router sheet, ready for one CAM job per sheet:
- millimetres, with the sheet's lower-left corner at 0,0;
- each part labelled with its tag and name;
- each file named for its sheet, the cabinets and parts on it, its stock and what the router does, for example `Kitchen sheet 05 of 06 - Sink base Left side, Right side - 3-4in 4x4 (Cabinet plywood) - profile, pockets, drills CNC.dxf`.

The status line then says how far apart the parts are (use a bit narrower than that), whether the sheet has a margin, and any part drawn at a thickness its sheet is not. Take that last one seriously: its dados are cut to the drawing, not the sheet.

The other exports in the Nesting section:
- **SVG**: a 1:1 drawing per sheet, to print or project.
- **DXF**: every sheet in one file, a layer per sheet.
- **DXF R12**: the same with old-style polylines.
- **PDF**: a booklet with what to buy and a page per sheet with its cut sequence.

## Set up the CAM job

The DXF holds shapes, not toolpaths. Each kind of cut is on its own layer, so you give each layer one toolpath:

| Layer | What is on it | Toolpath |
|---|---|---|
| `PROFILE_THRU` | Each part's outline (its real outline when notched, such as a side with a toe kick) | Outside profile, through the sheet. Add tabs or use a vacuum table. |
| `POCKET_6.35MM`, `POCKET_7.94MM`, … | Dados, grooves and rabbets, one layer per depth (the number is the depth in mm) | Pocket to that depth. |
| `DRILL_D35MM_13MM` | Hinge cups: 35 mm across, 13 mm deep | Pocket, or a 35 mm Forstner bit if your machine drills. |
| `DRILL_D5MM_11.5MM`, `DRILL_D5MM_13MM`, `DRILL_D5MM_10MM`, `DRILL_D6MM_10MM` | Hinge-plate (5 x 11.5), runner-screw (5 x 13), shelf-pin (5 x 10) and drawer rear hook (6 x 10) holes | Drill with a bit of that size. 5 and 6 mm holes are smaller than a 1/4 in end mill. |
| `DRILL_D4.76MM_THRU` (a 3/16 in pull hole), `DRILL_D5MM_THRU` | Pull holes | Drill through. |
| `CUTOUT_THRU` | Openings through a part (the trash bins' cutouts) | Inside profile, through. |
| `FLIP_…` | Cuts in the other face of a part | A second setup after the part is turned over. The status line names those parts. |
| `STOCK`, `LABELS` | The sheet's outline and trim line; the tags | Reference only: do not cut. |

Layer numbers are millimetres rounded to 0.01. **DXF R12** writes the point as a P (`POCKET_6P35MM`), since R12 layer names cannot hold a dot.

Cut in this order: drills and pockets first, cutouts next, profiles last, so the parts stay held down while their inside cuts are made.

Each part is drawn as seen from above, with the face its cuts are in facing up. A left side and a right side come out as mirror images, and both are cut face up.

## Parts too big for the bed: the track saw

A tall pantry's 84 in sides do not fit a 4 x 4 router. Without the track saw, they are listed under **Parts on no stock** as larger than your sheet. With it, they go to 4 x 8 sheets you break down on a track saw, and everything else stays on the router.

### Turn it on

The track saw needs a router sheet size, so first set **Stock…** > **Nest sheet goods on** to your 4 x 4 (or click **Use 4 x 4 plywood**). Then either:
- tick **Track saw what won't fit**, next to Kerf and Trim; or
- click **Cut them on the track saw** under the parts on no stock.

Sawhorse adds any 4 x 8 plywood the library lacks (3/4, 1/2 and 1/4) and turns the saw on, in one undo step. Untick the box to turn it off.

### Dial it in

| Field | Starts at | What it does |
|---|---|---|
| **Saw kerf** | 1/8 in (3 mm) | Your blade's width. Type 3/32 for a thin-kerf blade. |
| **Saw trim** | 1/4 in (6 mm) | Taken off each edge of a 4 x 8 first, so the first cuts square the factory edges. A 4 x 8 then takes parts up to 95 1/2 x 47 1/2 in. |

The saw's sheets are laid out in straight cuts from edge to edge, as a track saw cuts, and use the saw's kerf and trim. The router's sheets keep the router's spacing. Only parts the router's sheet cannot take go to the saw.

### Read the result

- Each diagram is labelled **CNC** or **Track saw**. The titles, the PDF and the footer say which, and the footer gives the saw's settings.
- **CNC files** writes only the router's sheets, numbered among themselves. The status line says how many sheets are for the saw.
- Cut the saw's sheets from their diagrams: the cut sequence under each says what to set the saw's guide to.

### Hand work on the saw's parts

A part on the saw can still have dados, grooves and holes: an 84 in pantry side has its shelf-pin holes, hinge plates and back groove. The Nesting section lists those parts under the diagrams ("1 track saw part has cuts to do by hand"); hover one for its cuts. **CNC files** also saves `<title> track saw hand work.txt`, one entry per part:

For example, the Tall pantry's left side, with the default settings (the 40 shelf-pin holes are cut short here):

```
2 Left side (Sheet 1 of 1 · 4 x 8 sheet, 3/4)
  - Pocket 79 13/64 × 15/64, 5/16 deep: 4 13/32 to 83 19/32 from end A, 22 19/64 to 22 17/32 from edge B
  - Pocket 47/64 × 22 3/4, 1/4 deep: 4 to 4 23/32 from end A, 1/2 to 23 1/4 from edge B
  - Pocket 3 23/32 × 22 3/4, 1/4 deep: 80 9/32 to 84 from end A, 1/2 to 23 1/4 from edge B
  - 10 holes 5 mm × 11.5 mm deep at (6 15/16, 1 29/64), (8 3/16, 1 29/64), (25 5/32, 1 29/64), ...
  - 40 holes 5 mm × 10 mm deep at (17 35/64, 1 29/64), (17 35/64, 20 23/64), ...
  - Outline: not a rectangle (a notch): cut it to the drawing after the saw
```

Here the first pocket is the back's groove, the next two are the bottom's and the top's blind dados, the 10 holes are the hinge plates' (37 mm, 1 29/64 in, from the front edge), and the 40 are shelf pins. Like holes are grouped: one line per size and depth, every centre listed, sorted along the part.

To read the positions:
- Lay the part as it lies in its sheet's diagram, the face up there facing up.
- **End A** is its left end and **edge B** its bottom edge, so measure from the corner nearest the sheet's corner. A mirrored pair stays mirrored.
- Lengths are in the document's units; hole sizes are always in millimetres, as Blum gives them.
- "(other face)" means turn the part over first.
- **Outline: not a rectangle** means it has a notch (a toe kick): cut it to the drawing after the saw.

Cut the pockets with a router and a guide, and drill the holes with a shelf-pin jig or a drill press.

## Read the cut list by assembly

In the **Cut list**, tick **By assembly** to put a heading over each cabinet, base frame and other named group or component, with its parts under it and a count of pieces. A part used in two assemblies (a cleat in two cabinets) is listed under each with its share of the quantity and board feet. Parts in no assembly come last. Click a part under a heading to select that assembly's pieces in the model. The choice is remembered on this device.

## Dialling in: what to change when something is off

| What you see | What to change |
|---|---|
| Joints too tight, parts need a mallet | **7 · CNC** > **Joint clearance** up by 0.004 in (0.1 mm). Re-measure the plywood first: **4 · Materials**. |
| Joints sloppy | **Joint clearance** down, or re-measure the plywood. |
| "Drawn … thick but nested on …" in the status line | The cabinet's thickness and the sheet's actual thickness differ. Make **4 · Materials** and the sheet's **actual** thickness in **Stock…** the same measured number. |
| The CAM program cuts around two parts as one | **Kerf** is narrower than your bit: click **CNC spacing**, or type a kerf wider than the bit. |
| Parts at the very edge of the sheet | **Trim** is 0: click **CNC spacing**, or type a trim. |
| The round end of a dado shows against a rail | **Bit diameter** smaller than your real bit: type your bit. |
| A groove narrower than your bit (the back's, about 7/32 in) | Listed in **8 · Cuts and holes**: cut that layer with a smaller bit. |
| A dado shows at the cabinet's front | **Dado stop** up. |
| Doors cover too much or too little of the sides | **6 · Hardware** > **Boring distance**: **8 · Cuts and holes** names the one that matches your overlay. |
| "The … lands on a dado" / "runs into the …" | Move the hinges (**From top, bottom**), change the drawer sizes, or turn hardware holes off. |
| Back groove and dados on the same layer | Not allowed: make **Groove depth** different from **Dado depth**. |
| Too much plywood used | Set inside parts and hidden sides **Free to turn** (**4 · Materials** > Grain); try **Tightest (CNC)**. |
| A part on no stock as too large | Turn on **Track saw what won't fit**, or nest on a bigger sheet. |
| The base frame splits into short ladders | Raise **Longest piece** for a bigger bed, or use **long rails on the track saw**. |
| The base frame does not match the row | Select it and click **Fit to the row again**. |

## What is kept with the model

- The Cabinet generator keeps each cabinet's and base frame's settings inside the `.shz`, so you can select one next week and edit it.
- Settings are kept as what differs from a fixed baseline, so a big kitchen fits in the 64 KB a plugin may keep in a model. Settings for cabinets you deleted or replaced are dropped first when room runs short; settings for cabinets still in the model are never dropped. If the store is still full, the cabinet is made anyway and a warning says it will not be editable as a cabinet.
- Settings saved by earlier versions of the plugin still load.
- A model can come from anyone, so everything read back is checked before it is used. An entry that does not make sense is ignored.
- The stock library, the nesting settings (kerf, trim, CNC spacing, the track saw) and per-part grain are saved with the model too.
- The cabinet panel's last settings are kept for the next cabinet. The **By assembly** choice is kept on this device.

## Limits

- No walls or room outline. A corner is a dead corner with a filler; there is no blind-corner cabinet.
- Hand work is a list, not a drawing.
- The track saw's sheet is 4 x 8 (1220 x 2440 mm).
- Only System 32 screw holes are drilled. Blum's chipboard-only holes and the locking devices' pilot holes are listed for drilling by hand.
- With inset fronts, hinge plates and runner screws are listed, not drilled.
- Adjustable shelves get a band of pin holes around each shelf (five holes), not the full height.
