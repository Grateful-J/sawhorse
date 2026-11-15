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

Sawhorse checks two of them before it writes a file, and asks before it goes on:
- **Parts too close together.** The check assumes a 1/4 in bit: it wants at least 5/16 in between parts. Sawhorse does not know the bit in your router, so with a wider bit check **Kerf** yourself.
- **A part drawn at a thickness its sheet is not**, in a file that has dados, holes or notches in it.

On a 4 x 4 bed, two more problems come up: a run of cabinets needs a base, and some parts (a pantry side, a long rail) do not fit the bed at all. The row tools and base frames handle the first. Mixed CNC and track saw nesting handles the second: it sends only those parts to a 4 x 8 on the track saw, and lists the cuts on them you make by hand.

## Quick start: one cabinet to CNC files

1. **Turn the plugin on.** Open the **Plugins** pane (the puzzle-piece tab at the end of the right panel). Click **Enable…** beside **Cabinet generator**, read what it asks for, and click **Enable**. Its **Cabinet** panel appears in the pane.
2. **Pick a cabinet.** In **Start from**, choose **Base · door and shelf**. Type a **Name** if you like ("Sink base 1"): it names the cabinet and its CNC files.
3. **Make it.** Click **Generate cabinet**. The cabinet appears in the model, selected, and the panel now edits it.
4. **Read the shop sheet.** Open **8 · Cuts and holes** and read every row before you cut anything. A row marked **Check** is a warning to act on before you cut. No **Start from** choice has one as it starts; one can appear when you change sizes ([what to change](#dialling-in-what-to-change-when-something-is-off)).
5. **Tell Sawhorse your sheets.** Open the **Cut list** tab, click **Nesting ›** at the bottom, click **Stock…**, then **Use 4 × 4 plywood (3/4, 1/2, 1/4)** and **Done**. In a metric document the button reads **Use 4 × 4 plywood (18, 12, 6 mm)**.
6. **Space the parts for your bit.** Back in the Nesting section, click **CNC spacing**.
7. **Save the files.** Click **CNC files**. You get one DXF per sheet, in millimetres, with the sheet's lower-left corner at 0,0. This Base is four sheets, so four files: the door, two sheets of carcass parts, and the back.
8. **Cut.** Open each file in your CAM program and give each layer its toolpath ([Set up the CAM job](#set-up-the-cam-job)). Cut one small part first ([Cut one small part first](#7-cut-one-small-part-first)).

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

Each must be more than 0 and at most 2 in. These limits are tighter, and a thickness outside them is refused:
- **Carcass, doors:** at least 16 mm (0.63 in) while **Drill hinge, runner and pull holes** is on: the hinge cups and the system screw holes are 13 mm deep, and 3 mm of wood must stay behind them. The door's limit applies only when there is a door, the carcass's only when runner screws are drilled.
- **Carcass with adjustable shelves:** at least 13 mm, whether hardware holes are on or off. The shelf-pin holes are 10 mm deep and leave 3 mm behind. Thinner stock takes fixed shelves.
- **Drawer faces:** at least 3/8 in (10 mm) in a cabinet with drawers: the drawer box's screws hold the front.
- **Drawer boxes:** 11.5 to 16.2 mm with Blum Inc.'s runners, 11 to 16.2 mm with Blum Europe's. That takes 15/32, 1/2 and 5/8 in plywood (12, 15 and 16 mm). Boxes of 3/4 in or 18 mm plywood are refused.
- **Back, bottoms:** at least 3/32 in (2.5 mm). In a cabinet with drawers and hardware holes on, at most 6.8 mm (0.268 in) at the starting joint clearance. Use 1/4 in (6 mm) or thinner: under a thicker bottom, the runner's rear hook hole would break out of the drawer back's bottom edge.

### 2. Tell Nesting which sheets you buy

In the Cut list, open **Nesting ›** and click **Stock…**:
- **Use 4 × 4 plywood** adds the three sheets a cabinet is cut from and makes every sheet good nest on them. It is one undo step.

  | Document | The button | Sheets it adds | Named like |
  |---|---|---|---|
  | Inches | **Use 4 × 4 plywood (3/4, 1/2, 1/4)** | 48 x 48 in at 23/32, 15/32 and 7/32 in | "4 x 4 sheet, 3/4" |
  | Metric | **Use 4 × 4 plywood (18, 12, 6 mm)** | 1220 x 1220 mm at 18, 12 and 6 mm | "1220 x 1220 sheet, 18 mm" |

  These are the thicknesses a new cabinet starts at in each unit system, so each cabinet part finds the sheet of its own thickness. A sheet of that size you already have is kept as it is: it counts as the same sheet when its thickness is within 1.5 mm, measured or nominal.
- Those are the usual thicknesses; your sheets may measure differently. **Edit** each sheet and type its **actual** thickness, the same number you typed in the cabinet panel. A part is matched to a sheet within 1/16 in, but its dados are cut to the cabinet panel's number, and **CNC files** asks before saving when the two differ by more than 0.1 mm.
- **Nest sheet goods on** picks the footprint: your 4 x 4, or 4 x 8 for a bigger router. It never falls back to a larger sheet on its own. To send the parts that do not fit to a track saw, see [Parts too big for the bed](#parts-too-big-for-the-bed-the-track-saw).

### 3. Enter your bit and joint clearance

In the cabinet panel's **7 · CNC** group:

| Field | Starts at | Limits | What it does | Change it when |
|---|---|---|---|---|
| **Bit diameter** | 1/4 in (6 mm) | 1/8 in (3 mm) to 1/2 in | The end mill you cut the dados and profiles with. Rail corners are notched the dado stop plus one bit diameter deep, so the round end the bit leaves in a blind dado never meets a square shoulder. Dados, grooves and holes narrower than the bit are listed in **8 · Cuts and holes** as **Change bit**, to cut with a smaller tool. | You use a different bit. |
| **Joint clearance** | 0.008 in (0.2 mm) | 0 to 1 mm (0.04 in) | Added to every dado and groove over the stock's thickness. | Test joints are too tight (raise it) or sloppy (lower it). |

To find your clearance, cut one test dado in a scrap, then try the plywood in it. A part that needs a mallet wants about 0.004 in (0.1 mm) more. One that wobbles wants less.

### 4. Space the parts for the bit

In the Nesting section, **CNC spacing** sets:
- **Saw** to **Tightest (CNC)**;
- **Kerf** (the gap between parts) to 3/8 in (10 mm);
- **Trim** (the margin at every sheet edge) to 1/2 in (12 mm).

That suits a 1/4 in (6 mm) bit. With a wider bit, type a **Kerf** larger than the bit: the gap must be wider than the bit, or the CAM program sees two neighbouring parts as one shape and cuts around the pair. Kerf goes up to 1/2 in and trim up to 4 in. So a 1/2 in bit cannot be spaced, though the cabinet panel accepts one: use a bit of 3/8 in or less.

The gap and the margin do a second job. A dado or groove that runs out of a part's edge is drawn a little past that edge, into the gap, so the bit cuts its end square ([Leave the dados that cross the outline as they are](#3-leave-the-dados-that-cross-the-outline-as-they-are)). With no gap between the parts (a Kerf of 0.5 mm or less) or no margin (Trim 0) that cannot be done, and those dados are left with round corners at their ends.

These settings are saved with the model, so set them in each new model (or start new models from one that has them).

## Make and edit a cabinet

### Choose a starting cabinet

**Start from** is a clean start: a Base picked after a Tall pantry is the same Base as one picked first.

It sets:
- the style, the width, height and depth, the number of shelves and the name (the name keeps its number: "Base 3" becomes "Sink base 3");
- the **Toe kick**: notched into the sides, or none for a wall cabinet;
- the **Top**: two stretchers for the five base cabinets, a full panel for the wall cabinet, the pantry and the open shelves.

It puts these back to a new cabinet's, unless the preset has its own:
- the number of drawers (3);
- the door pull's **Measure from** (Top) and distance (2 1/2 in, 64 mm). The wall cabinet and the pantry measure from the bottom, the pantry 30 in (760 mm) up;
- the drawer **Pull** (Centred). The trash pull-out's is **Near the top**;
- **Rear nailers** (None). The wall cabinet has top and bottom nailers, the pantry a top one;
- the trash **Bins** and **Bin**;
- **Doors** (Automatic). Base · drawer over 2 doors has a pair;
- **From top, bottom** (3 1/2 in, 100 mm). Base · door and shelf sets 3 in (80 mm), and the wall cabinet 50 mm in a metric document, so the hinges are farther apart than the door is wide, as Blum asks.

It keeps everything else you have set: the thicknesses and the grain, the joinery and the back, the hardware, the bit and the joint clearance, and also **Mounting**, the reveal gap, the shelf type, **Hinge side**, the pull's direction, spacing and hole, and the kick's height and setback.

| Preset | What you get |
|---|---|
| Base · door and shelf | 24 x 34 1/2 x 23 1/4 in (600 x 870 x 560 mm), a door, one adjustable shelf, two stretchers for a top, a 4 x 3 in toe kick |
| Drawer base · 3 drawers | Three drawers on Blum runners |
| Sink base · 2 doors, open top | Two doors, stretchers, no shelf |
| Base · drawer over 2 doors | A drawer front 6 in (150 mm) tall over a pair of doors |
| Trash pull-out · one 50 qt bin | A full-height pull-out with a bin frame cut for one Rev-A-Shelf 50 qt bin |
| Wall cabinet · doors, nailers | Doors, shelves and rear nailers to screw it to the wall |
| Tall pantry · needs sheets over 4 ft | Doors and shelves, 84 in tall: its sides, its door and its back need a sheet over 4 ft (see the track saw) |
| Open shelves · no doors | No doors |

A base cabinet is 23 1/4 in deep: 24 in with its door, the frameless standard, and its side and top share one 4 x 4 sheet.

### The groups, and what each one dials in

Click a group's title to open it; a closed group shows a one-line summary. Fields appear only when they apply. The **Starts at** columns give a new cabinet's values; **Start from** changes the ones listed above.

**1 · Size**

| Field | Starts at (in / mm) | Notes |
|---|---|---|
| Width, Height, Depth | 24 / 600, 34 1/2 / 870, 23 1/4 / 560 | Height includes the toe kick. Depth is the box, without the door. |
| Toe kick | Notched into the sides | **None (on a separate base)** for a cabinet that will sit on a base frame. A base frame takes the kick off for you, so you can leave it on. |
| Kick height, Kick setback | 4 / 100, 3 / 75 | The height is at least 1 in (25 mm). The setback must leave the side standing. |

**2 · Layout:** the **Style** (doors and shelves, drawers, drawers over a door, trash pull-out, open shelves), then:
- **Shelves** (0 to 20) and **Shelf type**: **Adjustable, on 5 mm pins** (loose shelves, 1/32 in short of each side) or **Fixed, in dados**.
- **Drawers** (up to 8) and **Drawer heights**: **All equal**, or **Short top drawer, rest equal** with its **Top face height** (at least 3 in, 76 mm). In drawers over a door, **Drawer face height** is each front's height (at least 3 in).
- **Doors**: **Automatic** (a pair over 24 in), **Single** or **Double**, and the **Hinge side** of a single door. A single door is at most 36 in (914 mm) wide.
- A loose shelf rests on the nearest pin height where all four of its pins are drilled, clear of every hinge plate and above the shelf below it. A cabinet with no such height for a shelf is refused: fewer shelves, or fixed ones.
- For a trash pull-out, **Bins** (two front to back, two side by side, or one), **Bin** (Rev-A-Shelf 27, 35 or 50 qt, or **Other: measure it**) and **Tray side height**.

**3 · Fronts and pulls**

| Field | Starts at | Notes |
|---|---|---|
| Mounting | Full overlay | **Inset** puts the fronts inside the opening. With inset, hinge plates and runner screws are listed, not drilled. An inset door's hinge never lands on a fixed shelf, the bottom, the top or a stretcher. Behind an inset door, each shelf starts the carcass thickness plus 3 mm back from the cabinet's front (0.837 in with 23/32 in plywood, 21 mm with 18 mm), so the door and its bumpers close in front of it. The shelf is that much shallower, and a fixed shelf's dados start that much further back. The pin rows do not move: the front row stays 37 mm from the cabinet's front. A cabinet too shallow to leave a shelf behind the door is refused. |
| Reveal gap | 1/8 in (3 mm) | Between fronts, with half of it at the outer edges. At most 1/2 in, and at least Blum's minimum reveal for the door's thickness and boring distance (the message names it). |
| Door **Pull** | Vertical | Vertical, horizontal or none, on the edge away from the hinges. |
| Measure from | Top (base cabinets) | **Bottom** for wall cabinets. |
| From the top/bottom, From the edge, Hole spacing | 2 1/2 in, 1 1/2 in, 3 in (64, 38, 96 mm) | A pull that would land on a hinge cup is refused, and so is one whose screw head would land on a side, the bottom, the top, a stretcher or a fixed shelf behind an overlay front: the message says how far from the edge to keep it. |
| Drawer **Pull** | Centred | **Near the top** (with **From the top**), **Finger notch** (with **Notch width** and **Notch depth**: the sub-front behind it is cut 25 mm lower for your fingers), or none. |
| Pull hole | 3/16 in (5 mm) | Up to 12 mm. 3/16 in suits US 8-32 pull screws. |

**4 · Materials:** the thicknesses (above), then **Grain**: **Doors** (vertical or across), **Drawer faces** (across or vertical), **Sides** (vertical, or **Free to turn** when they never show), and **Inside parts** (**Free to turn**, or **Along their length**). A part that is free to turn lets the nester rotate it to save plywood. A grain you set by hand in the Cut list is replaced when the cabinet is rebuilt.

**5 · Construction**

| Field | Starts at (in / mm) | Limits | Notes |
|---|---|---|---|
| Joinery | Blind dados | | **Butt joints** for screws only. |
| Dado depth | 1/4 / 6 | at most half the stock | |
| Dado stop | 1/2 / 12 | at least 1/8 in (3 mm) | How far short of the front the dado stops, so it never shows. |
| Top | Full panel (**Two stretchers** after a base preset) | | **Two stretchers** (front and rear) for a countertop or a sink. |
| Stretcher width | 4 / 100 | at least 2 in (50 mm), two narrower than the depth in front of the back | |
| Back | In a groove | | **Between the sides**, or **None**. |
| Groove depth | 5/16 / 8 | at most half the stock | Must differ from the dado depth, so each gets its own DXF layer and toolpath. |
| Back inset | 1/2 / 12 | 0, or enough to leave 3 mm of wood behind the groove; under a third of the depth | The groove's distance from the rear edge. At 0 the groove is a rabbet along the rear edge of the sides, top and bottom. With nailers, an inset that leaves a sliver under 3 mm between the back's groove and the nailers' dados is refused, and the message gives the values that work. |
| Rear nailers | None (**Top and bottom** after Wall cabinet, **Top** after Tall pantry) | | **Top**, or **Top and bottom**, with **Nailer height** (3 in, 75 mm). Needs the back in a groove, or no back. |

**6 · Hardware**
- **Drill hinge, runner and pull holes** (on): the router drills 35 x 13 mm hinge cups, the plates' 5 mm system-screw holes, the runners' screw holes, the rear hook holes in each drawer back, and the pull holes. Turn it off to drill by hand or with a jig.
- **Runners**: Blum **TANDEM** or **MOVENTO**. **Catalogue**: **Blum Inc. (US, inch lengths)** or **Blum Europe (mm lengths)**. **Length**: **Automatic: longest that fits**, or a length you pick.
- **From top, bottom** (3 1/2 in, 100 mm; 3 in, 80 mm, for Base · door and shelf): each hinge's distance from the door's end. Blum's charts set how many hinges by door height and weight. One so large that two cups do not fit on the door, or so small that the cup runs off its end, is refused with the value to type. A hinge that would land on a shelf, rail or stretcher is moved, and the row says how far and what it cleared.
- **Boring distance** (5 mm, 3 to 7 mm, in steps of 0.5 mm): the cup's edge to the door's edge. **8 · Cuts and holes** compares the overlay it gives with what your door covers, and says what to do about the difference. With the starting sizes it reads "Bore at 5.7 mm to match, or take up 0.7 mm with the hinge's side screw" (5.5 and 0.5 mm in a metric document). The list has no 5.7: pick 5.5 and the row reads "Matched", or stay at 5 and adjust the hinge. The side screw adjusts about 2 mm either way, and the row never asks for more. With sides thicker than a CLIP top can cover (11 mm plus the boring distance plus 2 mm), the door is cut to cover what the hinge reaches, and the row says how much of the side shows.

**8 · Cuts and holes** is the shop sheet: every cut and hole, its size and depth, and how it is made. Read it before you cut. The last column, **How**, says what each row asks of you:

| How | What it means |
|---|---|
| CNC, CNC (pocket), CNC (profile), CNC (inside profile) | In the CNC files: a hole, a dado or groove, an outline, an opening through a part. |
| Hardware | What to buy and fit: the runners, how many hinges, and the overlay they give. |
| Hand | Yours to do: the locking devices' pilot holes, drilled with Blum's template, and the glue-up. |
| Change bit | A groove or a hole smaller than your **Bit diameter**: its layer needs a smaller bit. |
| Check | A warning. Act on it before you cut: the row says what to change. |
| Not drilled | Left out of the files, with the reason (inset hinge plates and runner screws). |

### Edit a cabinet

- **Change the one you just made:** it is selected and the panel edits it. Every change rebuilds it in place, with one undo step (Ctrl+Z) per change and no button to press.
- **Edit an older one:** click it (or click it in the Outliner, or double-click into it). The panel shows that cabinet's own settings.
- **Start a new one:** click empty space. The panel goes back to a new cabinet, numbered on (Base 2).
- **Copy one:** **Add another like this** makes a copy of the cabinet being edited, placed as **Place** says, and named on (it skips a name already in use). A copy made with **Move** and Ctrl is that cabinet too: select it to edit it, and only that copy is rebuilt. It keeps the original's name until you change it.
- **Undo** (Ctrl+Z) puts the cabinet back, and the panel shows it as it is after the undo, also inside an open cabinet.
- **Typed a change, then clicked another cabinet?** The change goes to the cabinet you typed it for, and the panel then shows the one you clicked.
- A cabinet keeps its hidden state and its tag when it is rebuilt, and keeps its own units when you switch the document between inches and millimetres.
- A double-click on a button counts once: **Generate cabinet** double-clicked makes one cabinet.

If a setting cannot be built (a dado deeper than half the stock, a pull on a hinge cup, a drawer too short for its runner), the note under the button says why and the button is greyed out. A cabinet being edited is left as it was: the note ends "The cabinet keeps its last good build."

Some cabinets are not rebuilt by a change, and the panel says why and what to do:
- **Made by an older version of the plugin** (before it kept each cabinet's settings): the panel shows a new cabinet's settings, which are not this cabinet's. Set them to what it should be, then press **Replace it with these settings**.
- **Scaled or mirrored by hand:** its parts no longer match its settings. Undo that, or delete it and make it again.
- **Holding something the plugin did not make** (a group, a component, or a solid you drew into it): rebuilding would delete it. Move it out first, or press **Rebuild it anyway**.
- **A part of it open for editing:** "Leave the part (Esc) to change the cabinet."
- **Its width, while it is open:** "Close the cabinet (Esc) to change its width: the cabinets right of it move with it."
- **A new cabinet or base frame while a cabinet or frame is open:** leave it first (Esc). A new one is never made inside another.

When a change is refused, the panel goes back to what the cabinet is.

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
| Thickness | 23/32 / 18, or what you typed last | Type your plywood's measured thickness here too: it does not follow the cabinets' **4 · Materials**. Changing **Stock** sets it again: to the carcass thickness of the row's first cabinet for plywood, to 1 1/2 in (38 mm) for lumber. |
| Sleepers | In dados in the rails | Each dado runs across the rail's inside face, the stock plus 0.008 in (0.2 mm) wide. That clearance is fixed: the frame has no field for it, and the cabinet panel's **Joint clearance** does not reach it. The sleeper's tongue is 0.5 mm short so its shoulders close, and the ladder comes out square. **Butted between the rails** for glue and screws. |
| Dado depth | 1/4 / 6 | At most half the stock. |
| Sleepers at most | 16 / 400 | Centre to centre. Must be more than two thicknesses. |
| Longest piece | 47 / 1190 | A 4 x 4 less the CNC trim. Longer rows split into ladders, under whole cabinets where they can. |

The setback and back inset must leave at least 2 in between the rails for the sleepers. A row too short for a ladder once its showing ends are set back is refused ("The ends' setback leaves too short a ladder under this row: set the ends back less, or let fewer ends show."), and so is a cabinet too narrow for a ladder of its own ("make the longest piece longer").

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

Change the frame's settings to rebuild it in place: a taller frame lifts the row with it. If the row changes underneath it (a wider cabinet, one more cabinet), the panel says **The row has changed since this frame was made**: select the frame and click **Fit to the row again**. The frame is numbered after the frames in the model (Base frame 2), and keeps its hidden state and tag when rebuilt. A frame holding something the plugin did not make is not rebuilt by a change; **Fit to the row again** rebuilds it anyway. A cabinet that was scaled or mirrored by hand, or holds something the plugin did not make, is not rebuilt without its toe kick: the panel names it.

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
4. Count the sheets before you buy. Each of the cabinet's materials nests on sheets of its own: carcass, doors, drawer faces, drawer boxes and backs never share a sheet, even at the same thickness. With the starting sizes, one Base · door and shelf takes four 4 x 4 sheets (the door alone on one, two of carcass parts, one for the back), and one Drawer base takes six. A second cabinet's parts share those sheets where they fit, material by material.

### Save the CNC files

Click **CNC files**. If something is wrong, Sawhorse asks first in **The nesting has problems**:
- **The parts are too close for the bit**: click **Use CNC spacing**, or set **Kerf** larger than your bit. **Save the CNC files anyway** writes them as they are.
- **Parts on no stock** or the wrong stock: fix them in **Stock…** first.

Two things to know about these questions:
- **The spacing check assumes a 1/4 in bit.** It passes when Kerf is 5/16 in or more. It does not read the cabinet panel's **Bit diameter** and does not know the bit in your router: with a wider bit, make Kerf larger than the bit yourself.
- **Check cutter sizes in CAM:** before saving DXF or CNC files, Sawhorse flags pockets whose bounding box or holes whose diameter is at or below an assumed 1/4 in (6.35 mm) bit. It names the part and layer; use an appropriate smaller cutter or matching drill in CAM and check for empty toolpaths. The check does not know which tools you will actually select, and a pocket that is not flagged may still be too narrow or otherwise impossible to machine. DXF contains geometry, not G-code: inspect and simulate the CAM program's toolpaths and generated code before cutting.
- **A part drawn at a thickness its sheet is not** (more than 0.1 mm apart) is asked about when the file holds machined cuts: a pocket, a hole, a cutout or a notch somewhere. The line reads, for a cabinet drawn at 3/4 in on 23/32 in plywood: "drawn 3/4 in thick but nested on 4 x 4 sheet, 3/4 (23/32 in), a sheet 1/32 in thinner: joints and depths sized to the drawing (a dado's width, a tongue's length, a hole's depth) will not fit this sheet. Set the design to the sheet's measured thickness, or the sheet's thickness to what you will cut". Take it seriously, and fix it before you save. A file of plain rectangles has nothing sized to the thickness and is not asked about.

You get one DXF for each sheet the router cuts (and for each board, when the model has solid-lumber parts such as a lumber base frame), ready for one CAM job per sheet:
- millimetres, with the sheet's lower-left corner at 0,0;
- each part labelled with its tag and name;
- each file named for its sheet's number, the cabinets and parts on it, its stock and what the router does. The name starts with the model's file name (Untitled until it is saved). The Quick start's Base in a model saved as `Kitchen.shz` gives four files, the second of them `Kitchen 02 sheet 1 of 2 - Base 1 Left side, Right side - 4 x 4 sheet, 3-4 (Cabinet plywood) - profile, pockets, drills CNC.dxf`.

A sheet has one number wherever it is named. `02` is its number in the whole nesting: the label inside the file says the same ("2. Sheet 1 of 2 - 4 x 4 sheet, 3/4 - Cabinet plywood"), and so does the PDF. `sheet 1 of 2` is its place among the sheets of its stock and material, as its diagram is titled in the Nesting section. A board's file says `board`. Characters a file system refuses are taken out of the name (the "/" in 3/4 becomes "-"), and a very long name is cut short.

The status line then says how far apart the parts are (use a bit narrower than that) and whether the sheet has a margin.

The other exports in the Nesting section:
- **SVG**: a 1:1 drawing per sheet, to print or project.
- **DXF**: every sheet in one file, a layer per sheet.
- **DXF R12**: the same with old-style polylines.
- **PDF**: a booklet with what to buy and a page per sheet with its cut sequence.

## Set up the CAM job

The DXF holds shapes, not toolpaths. Each kind of cut is on its own layer, so you give each layer one toolpath. Go through these seven steps for every sheet.

### 1. Check the scale

The file is in millimetres and says so in its header, but not every CAM program reads that header. Choose millimetres if the program asks. Then measure the outer rectangle on the `STOCK` layer. It is your sheet, so for a 48 x 48 in sheet it must measure 1219.2 x 1219.2 mm, and for a metric document's 1220 x 1220 sheet, 1220 x 1220 mm. If it is 25.4 times too big or too small, the program has the units wrong: fix the import before you make a toolpath.

The sheet's lower-left corner is at 0,0. Set the job's X and Y zero at that corner of the real sheet, with the sheet square to the machine. The inner rectangle on `STOCK` is the trim line: every part's outline lies inside it.

### 2. Give each layer its toolpath

| Layer | What is on it | Toolpath |
|---|---|---|
| `PROFILE_THRU` | Each part's outline (its real outline when notched, such as a side with a toe kick) | Outside profile, through the sheet, with tabs unless a vacuum table holds every part ([Hold the parts down](#6-hold-the-parts-down)). |
| `POCKET_6.35MM`, `POCKET_7.94MM`, `POCKET_5.95MM`, … | Dados, grooves and rabbets, one layer per depth (the number is the depth in mm) | Pocket to that depth, with a bit narrower than the groove. **8 · Cuts and holes** lists each groove narrower than your bit under **Change bit**. With the starting sizes in inches, `POCKET_6.35MM` is the dados, 0.727 in wide, for the 1/4 in bit; `POCKET_7.94MM` (the back's groove) and `POCKET_5.95MM` (the drawer bottoms' grooves) are 0.227 in wide and need a 1/8 in bit. In a metric document the dados and the drawer bottoms' grooves are both 6 mm deep, so both are on `POCKET_6MM` (in different files), and the back's groove is on `POCKET_8MM`. Those grooves are 6.2 mm wide: a 6 mm bit just fits, a 1/4 in (6.35 mm) bit does not. |
| `DRILL_D35MM_13MM` | Hinge cups: 35 mm across, 13 mm deep | Pocket the circle to 13 mm with your end mill. Never put a Forstner bit in a router: it is made for a drill press's speed. |
| `DRILL_D5MM_11.5MM`, `DRILL_D5MM_13MM`, `DRILL_D5MM_10MM`, `DRILL_D6MM_10MM` | Hinge-plate (5 x 11.5), runner-screw (5 x 13), shelf-pin (5 x 10) and drawer rear hook (6 x 10) holes | Pocket each circle to its depth with an end mill smaller than the hole (1/8 in or 3 mm). A 1/4 in end mill cannot make a 5 or 6 mm hole. Check that the small bit's flutes are at least as long as the hole is deep. Use a drill bit of the hole's size only if your spindle has a collet for its shank and a speed slow enough for drilling. |
| `DRILL_D4.76MM_THRU` (a 3/16 in pull hole), `DRILL_D5MM_THRU` | Pull holes | The same, through the sheet. If the small bit's flutes are shorter than the sheet is thick, bore as deep as they reach and finish the hole with a hand drill. |
| `CUTOUT_THRU` | Openings through a part (the trash bins' cutouts) | Inside profile, through. |
| `FLIP_…` | Cuts in the other face of a part | A second setup after the part is turned over. The status line names those parts. |
| `STOCK`, `LABELS` | The sheet's outline and trim line; the tags | Reference only: do not cut. |

Layer numbers are millimetres rounded to 0.01. **DXF R12** writes the point as a P (`POCKET_6P35MM`), since R12 layer names cannot hold a dot.

Cut in this order: drills and pockets first, cutouts next, profiles last, so the parts stay held down while their inside cuts are made.

### 3. Leave the dados that cross the outline as they are

Some pockets cross `PROFILE_THRU` on purpose. A pocket toolpath keeps the bit inside the shape it is given. A dado drawn exactly to its part's edge would be left with round corners there, and the part that slides into it would not seat. So a dado or groove that runs out of its part is drawn past the edge, into the gap between parts: a side's dados at its rear edge, the back's groove in the bottom at both of its ends, a base frame rail's dados at its top and bottom edges. The bit's centre then passes the edge, and the end is cut square.

- **How far:** just under half the gap between parts, and never more than the margin at the sheet's edge. With **CNC spacing** that is 4.5 mm (0.178 in) in an inch document and 4.75 mm in a metric one.
- **Where it lands:** in the waste between parts. It never reaches the next part.
- **What to do in the CAM program:** pocket these shapes as they are drawn. Do not trim them back to the part's outline, and do not join them to it.
- **What it needs:** a gap between parts and a margin at the sheet's edge ([Space the parts for the bit](#4-space-the-parts-for-the-bit)). With a Kerf of 0.5 mm or less, or a Trim of 0, the pockets stop at the edge and their ends come out round: square them with a chisel, or click **CNC spacing** and save again.
- Only an end on the part's edge is moved. A blind dado's stopped end is as before, and the rail's notch clears its round corner.

**DXF** and **DXF R12** draw these pockets the same way.

### 4. Set the depths from the top of the sheet

- Every pocket and hole depth, in the layer names and in **8 · Cuts and holes**, is measured down from the face that is up. Zero Z on the top of the sheet for those toolpaths.
- If your job zeroes Z on the machine bed instead, type the sheet's measured thickness into the CAM job. A sheet thicker or thinner than the job's thickness makes every dado that much too deep or too shallow, and a rail's tongue is only 0.5 mm shorter than its dado is deep: a shallow dado holds the joint open.
- For `PROFILE_THRU`, `CUTOUT_THRU` and the `_THRU` holes, cut the sheet's measured thickness plus a little (about 0.5 mm, 0.02 in), into a spoilboard, so no skin is left under the part.

### 5. Know which face is up

Each part is drawn as seen from above, with the face its cuts are in facing up. A left side and a right side come out as mirror images, and both are cut face up. That means:
- carcass parts lie inside face up: their dados, grooves and holes are in their inside faces;
- doors lie back face up: the hinge cups are in the back, so the show face is against the spoilboard;
- drawer faces have no blind cuts (their pull holes go through), so either face can be up.

With plywood that has one good face, lay the door sheets good face down, and choose the carcass sheets' face by which one you want inside the cabinet. Cuts in a part's other face are on `FLIP_` layers.

### 6. Hold the parts down

- The last pass of a profile frees the part. Give every profile tabs, or hold every part with a vacuum table. Narrow parts need it most: 3 in nailers, 4 in stretchers, the toe kick, drawer sides.
- Put screws and clamps only where nothing is cut. The bit runs half its width outside every outline, and a dado that runs out of a part is cut just under half the gap past its edge.
- **CNC spacing** leaves a 1/2 in (12 mm) margin at the sheet's edges. If that is too narrow for your screws, raise **Trim** (up to 4 in).

### 7. Cut one small part first

A test dado ([Enter your bit and joint clearance](#3-enter-your-bit-and-joint-clearance)) checks the fit, not the job. Before the first full sheet:
1. In the CAM program, toolpath one small part of the real file. A base cabinet's rear stretcher (4 x 23 in in the 24 in Base) has an outline and a groove.
2. Cut it from an offcut of the same plywood, set up as you will set up the sheet.
3. Measure it: the length and width against the Cut list, the groove's width and depth against **8 · Cuts and holes**.
4. Bore one 5 mm hole in the offcut and try a shelf pin in it.

If a size is off, look at the CAM job first: the scale, the bit's real diameter, and where Z is zeroed.

## Parts too big for the bed: the track saw

Four of a Tall pantry's parts do not fit a 4 x 4 router: its two 84 in (2100 mm) sides, its door (79 7/8 in, 1997 mm) and its back (79 1/8 in, 1978 mm). Without the track saw, they are listed under **Parts on no stock** as larger than your sheet. With it, they go to 4 x 8 sheets you break down on a track saw, and everything else stays on the router. The pantry takes three 4 x 8 sheets, one for each material: the door, the two sides, the back.

### Turn it on

The track saw needs a router sheet size, so first set **Stock…** > **Nest sheet goods on** to your 4 x 4 (or click **Use 4 × 4 plywood**). Then either:
- tick **Track saw what won't fit**, next to Kerf and Trim; or
- click **Cut them on the track saw** under the parts on no stock.

Sawhorse adds any 4 x 8 plywood the library lacks (3/4, 1/2 and 1/4; in a metric document 1220 x 2440 mm sheets at 18, 12 and 6 mm) and turns the saw on, in one undo step. A 4 x 8 you already have within 1.5 mm of one of those thicknesses is kept and no second one is added. Untick the box to turn it off.

### Dial it in

| Field | Starts at | What it does |
|---|---|---|
| **Saw kerf** | 1/8 in (3 mm) | Your blade's width. Type 3/32 for a thin-kerf blade. |
| **Saw trim** | 1/4 in (6 mm) | Taken off each edge of a 4 x 8 first, so the first cuts square the factory edges. A 4 x 8 then takes parts up to 95 1/2 x 47 1/2 in. |

The saw's sheets are laid out in straight cuts from edge to edge, as a track saw cuts, and use the saw's kerf and trim. The router's sheets keep the router's spacing. Only parts the router's sheet cannot take go to the saw.

That holds when you have given a material its own 4 x 4 sheet in **Stock…**, or a part names one: a part too large for that sheet still goes to the saw. It goes only to a 4 x 8 of exactly the same actual thickness and the same grain as the 4 x 4 you chose, so plywood is never swapped for MDF. If you typed a measured thickness into that 4 x 4, **Edit** the 4 x 8 and type the same number. With no such 4 x 8 in the library, the part stays under **Parts on no stock**. A sheet of a third size (a 5 x 5, say) that a material or a part names is used as you said: it keeps the Nesting section's own Saw, Kerf and Trim, and is not the saw's.

### Read the result

- Each diagram is labelled **CNC** or **Track saw**. The titles, the PDF and the footer say which, and the footer gives the saw's settings.
- **CNC files** writes only the router's sheets. Each keeps its number in the whole nesting, so the files can skip numbers: the pantry's are 03 and 04, and sheets 1, 2 and 5 are the saw's. The status line says how many sheets are for the saw.
- Cut the saw's sheets from their diagrams: the cut sequence under each says what to set the saw's guide to.

### Hand work on the saw's parts

A part on the saw can still have dados, grooves, holes and notches. The Tall pantry has three such parts:
- the **Door**: five hinge cups and two pull holes;
- the **Left side** and the **Right side**: the bottom's and the top's dados, the top nailer's dado, the back's groove, shelf-pin holes, the toe-kick notch, and on the hinge side the hinge plates' holes.

The back goes to the saw too, as a plain rectangle with nothing to do by hand.

The Nesting section lists those parts ("3 track saw parts have cuts to do by hand"); hover one for its cuts. **CNC files** also saves `<title> track saw hand work.txt`, one entry per part.

For example, the Tall pantry's door and left side, with the starting sizes in inches (the hole lists are cut short here):

```
1 Door (Sheet 1 of 1 · 4 x 8 sheet, 3/4 · Door plywood)
  - 5 holes 35 mm × 13 mm deep at (3 1/2, 57/64), (21 23/32, 57/64), (39 15/16, 57/64), (58 5/32, 57/64), (76 3/8, 57/64)
  - 2 holes 4.76 mm (3/16 in) through at (46 7/8, 22 3/8), (49 7/8, 22 3/8)

2 Left side (Sheet 1 of 1 · 4 x 8 sheet, 3/4 · Cabinet plywood)
  - Pocket 79 13/64 × 15/64, 5/16 deep: 4 13/32 to 83 39/64 from end A, 22 19/64 to 22 17/32 from edge B
  - Pocket 47/64 × 22 3/4, 1/4 deep: 4 to 4 47/64 from end A, 1/2 to 23 1/4 from edge B
  - Pocket, 1/4 deep, in 2 rectangles that join: 23/32 × 22 3/4 at 83 9/32 to 84 from end A, 1/2 to 23 1/4 from edge B; 3 × 23/32 at 80 9/32 to 83 9/32 from end A, 22 17/32 to 23 1/4 from edge B
  - 10 holes 5 mm × 11.5 mm deep at (6 15/16, 1 29/64), (8 3/16, 1 29/64), (25 5/32, 1 29/64), ...
  - 40 holes 5 mm × 10 mm deep at (17 35/64, 1 29/64), (17 35/64, 20 23/64), ...
  - Notch through, 4 × 3, cut out of the outline: 0 to 4 from end A, 0 to 3 from edge B
```

**How to read a position.** The rule is the same for every part. The saved file gives it in full:

```
How to read a position
  Lay the part with the face you will cut up and its length running left to right.
  End A is its left end. Edge B is its far edge, the one away from you.
  A position is (A, B): along the length from end A, then across the width from edge B.
  A plain rectangle has no end A yet: any way round with its length left to right gives
  the same part. After the first cut, keep that end and that edge for the rest.
  In the sheet's diagram end A is the part's left end and edge B its top edge. For a part
  drawn turned (its length down the sheet), end A is its top end and edge B its right edge.
  A cut marked (other face) is in the face underneath, at the position given as seen
  through the part: roll the part over toward you (end A stays at your left) and measure
  B from the edge now nearest you.
```

The Nesting section says the same in one line: "Positions are (A, B): lay the part with the face to cut up and its length left to right; A is along the length from its left end, B across the width from its far edge (the one away from you). To the nearest 1/64 in."

Measure B from the far edge, never from the near one: measured from the near edge, the part comes out as its mirror image, and a pantry hinged on the wrong side.

**The left side, line by line.** Lay the side with the face that will be its inside up and its length left to right. The notch line (the last one) places it: once the toe-kick notch is cut, it is at your left and on the far edge, so end A is the bottom of the side and edge B its front.

| Line | What it is |
|---|---|
| Pocket 79 13/64 × 15/64, 5/16 deep | The back's groove: 79 13/64 in long and 15/64 in wide, near the rear edge. |
| Pocket 47/64 × 22 3/4, 1/4 deep | The bottom's blind dado, 4 in up from the bottom end. It starts 1/2 in from the front edge and runs out of the rear edge at 23 1/4. |
| Pocket, 1/4 deep, in 2 rectangles that join | The top's dado and the top nailer's dado, which meet in an L. Rout the two rectangles the line gives: a 23/32 in strip across the top end (83 9/32 to 84 from A), and a strip 3 in long and 23/32 in wide along the rear edge below it (80 9/32 to 83 9/32 from A). Do not rout the box around them. |
| 10 holes 5 mm × 11.5 mm deep | The hinge plates' holes, 1 29/64 in (37 mm) from the front edge. |
| 40 holes 5 mm × 10 mm deep | The shelf-pin holes, in a front row and a rear row. |
| Notch through, 4 × 3 | The toe kick: 4 in along the length, 3 in across, cut out of the corner at end A and edge B. |

The right side's list is the left's mirror image: its notch is at 80 to 84 from end A.

**What else the list tells you:**
- Like holes are grouped: one line per size and depth, every centre listed, sorted along the part.
- A width and the two edges it lies between always agree: 4 to 4 47/64 is 47/64 wide.
- Lengths are in the document's units, to the nearest 1/64 in (0.001 in in decimal inches, 0.01 mm in a metric document). Hole sizes are always in millimetres, as Blum gives them. A hole that is not a round metric size is written both ways: "4.76 mm (3/16 in)".
- A pocket that is not a rectangle is listed as the rectangles it is made of ("in 2 rectangles that join"), never as the box around it. One with a slanted edge is listed by its corners.
- "Notch through … cut out of the outline" is a notch in the part's outline, with its size and place.
- "(other face)" is a cut in the face underneath: the file's header says how to turn the part.
- A part the diagram draws with its length down the sheet is marked "(drawn turned)" in the file. Its list reads the same: lay it with its length left to right.

**Tools.** Cut the pockets with a router and a guide. Drill the 5 mm holes with a shelf-pin jig or a drill press. Bore the 35 mm hinge cups with a Forstner bit in a drill press, or with a hinge-boring jig. Cut the notch with a jigsaw or a handsaw after the saw.

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
| Doors cover too much or too little of the sides | **6 · Hardware** > **Boring distance**: the Overlay row in **8 · Cuts and holes** names the distance that would match. Pick the nearest in the list (it goes in 0.5 mm steps); the hinge's side screw takes up the rest. |
| A row marked **Check** in **8 · Cuts and holes** | A warning to act on before you cut. For hinges closer together than the door is wide: **From top, bottom** down, or **Doors** > **Double**. |
| A dado's end is round where it runs out of a part | The parts had no gap (**Kerf**) or the sheet no margin (**Trim**) when the files were saved: click **CNC spacing** and save them again, or square the end with a chisel. Also check that the CAM program did not trim the pocket back to the outline. |
| A base frame's sleepers are tight or loose in their dados | The frame's clearance is fixed at 0.008 in (0.2 mm). Check that its **Thickness** is your plywood's measured thickness. If the fit is still wrong, use **Butted between the rails**. |
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
- A base frame's dado clearance is fixed at 0.008 in (0.2 mm): it has no field.
- A dado that runs out of a part is cut square only when the parts have a gap between them and the sheet has a margin.
