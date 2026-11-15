# CNC cabinets: from a cabinet to cut files

This guide takes you from an empty model to DXF files your CNC router can cut: frameless cabinets, a row of them, the base frame they stand on, and the parts too big for your router's bed. Each section is a how-to. The tables list every setting you can change to dial in what Sawhorse draws, with the value it starts at and when to change it.

It is written for a small shop with a 4 x 4 ft CNC router (a Shapeoko, an Onefinity, a 4x4 Avid), a CAM program (VCarve, Carbide Create, Fusion) and, for long parts, a track saw. The same steps work on a 4 x 8 router: just skip the 4 x 4 and track saw parts.

The reference behind every setting is in the [User guide](USER-GUIDE.md) (Cut list, Nesting, Plugins) and the plugin's own [README](../plugins/cabinet-generator/README.md). Lengths are given in inches with millimetres in brackets; a metric document starts at the millimetre values.

**Contents**
1. [Why this exists](#why-this-exists)
2. [Quick start: one cabinet to CNC files](#quick-start-one-cabinet-to-cnc-files)
3. [Set up your shop once](#set-up-your-shop-once)
4. [Make and edit a cabinet](#make-and-edit-a-cabinet)
5. [Edge banding](#edge-banding)
6. [Build a row of cabinets](#build-a-row-of-cabinets)
7. [Put a row on a base frame](#put-a-row-on-a-base-frame)
8. [End panels, fillers and appliance openings](#end-panels-fillers-and-appliance-openings)
9. [Nest the parts and save the CNC files](#nest-the-parts-and-save-the-cnc-files)
10. [Set up the CAM job](#set-up-the-cam-job)
11. [Job sheet and part labels](#job-sheet-and-part-labels)
12. [Feeds, speeds and your bits](#feeds-speeds-and-your-bits)
13. [Test cuts: prove the setup before the real sheet](#test-cuts-prove-the-setup-before-the-real-sheet)
14. [Parts too big for the bed: the track saw](#parts-too-big-for-the-bed-the-track-saw)
15. [Read the cut list by assembly](#read-the-cut-list-by-assembly)
16. [Shopping list and pricing](#shopping-list-and-pricing)
17. [Dialling in: what to change when something is off](#dialling-in-what-to-change-when-something-is-off)
18. [What is kept with the model](#what-is-kept-with-the-model)
19. [Limits](#limits)

## Why this exists

A CNC router cuts exactly what the file says. A dado drawn 3/4 in wide in 23/32 in plywood leaves a 1/32 in gap in every joint. Two parts nested closer than your bit fuse into one shape in the CAM program. A hinge cup drilled on the wrong face ruins a door. So every number that reaches the router comes from settings you control:
- the sheet's measured thickness;
- your bit's diameter;
- the clearance you want in a joint;
- the spacing between parts and the margin at the sheet's edge;
- Blum's own hardware tables.

Sawhorse checks two of them before it writes a file, and asks before it goes on:
- **Parts too close together.** The check reads the profile bit you choose in **CNC setup** ([Feeds, speeds and your bits](#feeds-speeds-and-your-bits)): it wants the bit's diameter plus 1/16 in between parts. With no profile bit chosen it assumes 1/4 in, and wants 5/16 in.
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

Before cutting real plywood, do [Set up your shop once](#set-up-your-shop-once): the defaults assume plywood that measures exactly 23/32 in and a 1/4 in bit. Then prove the setup on small pieces ([Test cuts](#test-cuts-prove-the-setup-before-the-real-sheet)): all four tests together use about a third of the plywood of one Base (9.9 of 30.1 sq ft).

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

To find your clearance, cut the **joint ladders** ([Test cuts](#joint-ladders)): five dados a step apart in a strip of the real sheet, and **Set Joint clearance** to the one the plywood slides into by hand.

### 4. Space the parts for the bit

In the Nesting section, **CNC spacing** sets:
- **Saw** to **Tightest (CNC)**;
- **Kerf** (the gap between parts) to 3/8 in (10 mm);
- **Trim** (the margin at every sheet edge) to 1/2 in (12 mm).

That suits a 1/4 in (6 mm) bit. With a wider bit, type a **Kerf** larger than the bit: the gap must be wider than the bit, or the CAM program sees two neighbouring parts as one shape and cuts around the pair. Choose that bit as your **Profile bit** in **CNC setup** too, so the check before saving measures the gap against it. Kerf goes up to 1/2 in and trim up to 4 in. So a 1/2 in bit cannot be spaced, though the cabinet panel accepts one: use a bit of 3/8 in or less.

The gap and the margin do a second job. A dado or groove that runs out of a part's edge is drawn a little past that edge, into the gap, so the bit cuts its end square ([Leave the dados that cross the outline as they are](#3-leave-the-dados-that-cross-the-outline-as-they-are)). With no gap between the parts (a Kerf of 0.5 mm or less) or no margin (Trim 0) that cannot be done, and those dados are left with round corners at their ends.

These settings are saved with the model, so set them in each new model (or start new models from one that has them).

### 5. Tell Sawhorse your machine and bits

In the Nesting section, click **CNC setup…**. Pick your machine and router under **Machine**, check your bits under **Tools** (type the shank and flute length of any bit that says unknown), and pick your **Profile bit**: the spacing check before saving reads it. This is kept on this device, not in the model, so you do it once. [Feeds, speeds and your bits](#feeds-speeds-and-your-bits) says what each tab holds.

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
| Joinery | Blind dados | | **Butt joints** for screws only. **Dowels** or **Confirmat screws** in place of the dados ([Joinery: dowels and Confirmat screws](#joinery-dowels-and-confirmat-screws)). |
| Confirmat length | 50 mm | 50 or 70 mm | With Confirmat screws: the lengths Häfele lists for its self-countersinking connector (264.44.190, 264.44.194). |
| Dado depth | 1/4 / 6 | at most half the stock | |
| Dado stop | 1/2 / 12 | at least 1/8 in (3 mm) | How far short of the front the dado stops, so it never shows. |
| Top | Full panel (**Two stretchers** after a base preset) | | **Two stretchers** (front and rear) for a countertop or a sink. |
| Stretcher width | 4 / 100 | at least 2 in (50 mm), two narrower than the depth in front of the back | |
| Back | In a groove | | **Between the sides**, or **None**. |
| Groove depth | 5/16 / 8 | at most half the stock | Must differ from the dado depth, so each gets its own DXF layer and toolpath. |
| Back inset | 1/2 / 12 | 0, or enough to leave 3 mm of wood behind the groove; under a third of the depth | The groove's distance from the rear edge. At 0 the groove is a rabbet along the rear edge of the sides, top and bottom. With nailers, an inset that leaves a sliver under 3 mm between the back's groove and the nailers' dados is refused, and the message gives the values that work. |
| Rear nailers | None (**Top and bottom** after Wall cabinet, **Top** after Tall pantry) | | **Top**, or **Top and bottom**, with **Nailer height** (3 in, 75 mm). Needs the back in a groove, or no back. |
| Line boring | Around each shelf | | With adjustable shelves. **Full height** drills the pin rows the height of the shelves' space on Blum Process 32's grid ([Full-height line boring](#full-height-line-boring)). |

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
| Jig | Holes a 3-axis router cannot drill, in a rail's end: dowel holes or Confirmat pilots, with each one's distance from the rail's front edge, for a doweling jig. |
| Change bit | A groove or a hole smaller than your **Bit diameter**: its layer needs a smaller bit. |
| Check | A warning. Act on it before you cut: the row says what to change. |
| Not drilled | Left out of the files, with the reason (inset hinge plates and runner screws). |
| Edge band | A banded part: which edges, the band, its finished size and its cut size ([Edge banding](#edge-banding)). |

**9 · Test cuts** makes small pieces that prove the setup before the real sheet: a machine check, joint ladders, a mini drawer and a mini door ([Test cuts](#test-cuts-prove-the-setup-before-the-real-sheet)).

**10 · Edge banding** bands the edges that show: doors and drawer fronts all round, the carcass's front edges, the adjustable shelves' front edges. It starts off ([Edge banding](#edge-banding)).

**11 · Ends, fillers and openings** puts a finished end panel or a filler on either side, an appliance opening beside it, a skin on its toe kick, and checks a sink and an over-the-range microwave. Nothing is on to start ([End panels, fillers and appliance openings](#end-panels-fillers-and-appliance-openings)).

### Joinery: dowels and Confirmat screws

**5 · Construction > Joinery** has four choices: **Blind dados** (the default), **Butt joints**, **Dowels** and **Confirmat screws**. Dowels and Confirmat screws join the top (or the two stretchers), the bottom and each fixed shelf to the sides, and turn the blind dados off: the rails are plain boxes the inside width long, with no tongues and no notches. The back's groove, the nailers and everything else are as before. The sources, quoted with their addresses, are in [docs/research/joinery-sources.md](research/joinery-sources.md).

**Where the holes go.** Each joint's holes are laid out as Häfele's case-dowelling drawing places dowels (Häfele America catalogue, ch. 11, FC 11.124):
- one 37 mm from the joint's front edge and one 37 mm from its back edge (the rail's own edges: a fixed shelf behind an inset door starts further back, and its holes with it);
- at least 3 a joint up to 18 in (457.2 mm) deep, at least 4 up to 24 in (609.6 mm). Sawhorse drills exactly that many. Häfele gives no count past 24 in, so a deeper joint is refused rather than guessed;
- the ones between on the 32 mm grid counted from the front one, the grid points nearest to evenly spaced, each keeping 3 mm of wood to the back one. AWS says dowel joints are "often based on" 32 mm spacing: a description, not a rule. The 23 1/4 in base's bottom gets 37, 197, 389 and 553.6 mm; a 12 in wall cabinet's top and bottom 37, 165 and 267.8 mm.
- Stretchers narrower than 117 mm (4.607 in) are made at least 117 mm (4-5/8 in) wide with dowels or Confirmat; the cut list says when they were widened. Any other joint too shallow for its count is refused with the least depth.

| | Dowels | Confirmat screws |
|---|---|---|
| In the sides (router) | 8 mm, 11 mm deep, inner face: `DRILL_D8MM_11MM` | 7 mm, through: `DRILL_D7MM_THRU`. No countersink is cut: the screw is Häfele's self-countersinking connector ("Countersink is not necessary as the nibs countersink hole") |
| In each rail's two ends (jig) | 8 mm, 25 mm deep, centred in the thickness | 5 mm pilot, centred in the thickness, as deep as the screw maker's instructions give |
| Where the numbers come from | The depths are **Häfele's for its 8 mm permanent assembly dowel** (UK catalogue 2023, p. 7.96), one product: 11 mm into the side, 25 mm into the edge. No maker's depth table for a plain 8 mm wood dowel was found. | Häfele America FC 11.161: Ø5 drill hole, Ø7 through hole, Ø10 head. **The pilot's depth, the distance from the edges and the spacing were not found in any maker's document.** The screws go where Häfele's dowels go, and the panel and the rows say: "Häfele's dowel layout; no confirmat spacing was found in a maker's document". |
| Least stock | 14 mm (11 mm deep with 3 mm of wood behind). Häfele gives its assembly dowel "for minimum wood thickness 18 mm": thinner stock builds, with a **Check** row quoting it. | 13 mm: the 7 mm through hole in the side is centred in the thickness, so flush with the side's end it needs 3 mm of wood each side (the 5 mm pilot needs 11 mm) |
| Shopping list, on each rail | "Dowel, 8 x 35 mm or shorter (the holes are 11 mm in the side and 25 mm in the edge, 36 mm together)", two joints' worth, in words | Häfele self-countersinking Confirmat connector, 7 x 50 mm **264.44.190** or 7 x 70 mm **264.44.194** (pointed tip, Pozi drive size 3, zinc-plated), two joints' worth. Häfele supplies them in 1000s. |

**The rails' end holes are for a jig.** A 3-axis router cannot drill into a panel's edge, so **8 · Cuts and holes** lists them as **Jig** rows: for each rail, how many holes in each end and their distances from its front edge, in millimetres and, in an inch document, inches. With edge banding on, the row also gives the distances from the blank's front edge as cut, before banding, for drilling before the band goes on. Line the jig up from the rail's front edge, the edge the side's holes are measured from too.

**Checks it makes.** Every joint hole keeps the planner's 3 mm of wood to the side's edges, the back's groove, the toe-kick notch and every other hole. The joint holes are placed first; hinge plates, runner screws and shelf pins are placed after and keep their wood to them (a pin that would not is left out, and the pin row says how many were). With edge banding on, the side's holes are the band's thickness nearer the raw edge on the blank, like every other cut.

**What to know before you use them.**
- A Confirmat's head is on the side's outer face. In a run of cabinets it is hidden; on an exposed end it shows. Sawhorse has no finished-end option.
- The face holes are drilled from the face the router cuts, the side's inner face, so nothing needs a second setup. Pocket each circle with an end mill smaller than the hole, as the other holes ([the layer table](#2-give-each-layer-its-toolpath)); the job sheet gives hole layers the 1/8 in end mill to start. For `DRILL_D7MM_THRU`, check the bit's flutes reach through the sheet, as for the pull holes.
- **Test cuts:** there is no dado ladder; the panel says a ladder proves a dado's clearance and does not apply to dowel or Confirmat holes.
- **Stock:** Confirmat needs stock at least 13 mm thick; 1/2 in (12.7 mm) is refused.
- **Back inset:** with dowels or Confirmat screws and a grooved back, a back inset of roughly 25 to 36 mm is refused, because the rear hole lands in the back's groove. 12 mm and 45 mm build.
- **Dowel hole fit:** the dowel hole is drawn at 8.0 mm, the dowel's own size, as Häfele's hole is. A plain 8 mm dowel in a milled 8 mm hole is a tight fit: check the fit on a test cut before the job.
- **Nailers:** with dowels or Confirmat screws, the nailers are butted between the sides and Sawhorse drills nothing for them: fasten them yourself.

### Full-height line boring

**5 · Construction > Line boring** (shown with adjustable shelves) is **Around each shelf** to start: five pin holes around each shelf's place, as before. **Full height** drills the two pin rows the height of the shelves' space on the 32 mm grid:
- **The rule (Blum Process 32):** Blum's Universal Boring Pattern (drawing BUS0126, 2004) bores a 775 mm (30 1/2 in) side with its first hole 56.5 mm below the top end and its last 46.5 mm above the bottom end: 22 holes, 672 mm apart end to end.
- **Generalised by Sawhorse** (Blum draws one height): the lowest hole is 46.5 mm above the bottom of the box (the side's bottom end with no toe kick, the top of the toe-kick notch with one), as Blum measures its hinge-plate holes from the bottom of the side; then one every 32 mm up to the highest that is at least 56.5 mm below the side's top end. A 775 mm side with no toe kick gives Blum's 22 holes exactly, and that is a test.
- Of those, a hole is drilled where it keeps 3 mm of wood to the rails' faces (the bottom, the top, a fixed shelf) and is clear of the hinge plates, runner screws and joint holes, the same checks as around each shelf: the pin row in **8 · Cuts and holes** says how many were left out. In a drawer-over-door cabinet the rows stop in the door's space, below the drawers.
- The holes are the same 5 mm x 10 mm holes on the same rows (37 mm from the front, the rear row on the same 32 mm grid). No maker gives a line-bore depth: 10 mm is the planner's, from shelf-pin lengths.
- Many holes make the model slower to build: a tall pantry with full-height rows took about 1 s to import into the kernel against 0.2 s around each shelf (measured once, in Node, on one machine).

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

## Edge banding

Laminate-faced plywood and MDF show their core at every cut edge, and a band covers it. Turn banding on in the cabinet panel's **10 · Edge banding** group with **Band the edges**. It starts off: until you tick it, every part is cut at its finished size, exactly as before.

### The rule: blank plus band is the size you designed

- You design the cabinet at its finished sizes, as before.
- Each banded edge's blank is cut short by that band's thickness, so the part comes out at its designed size with the band on. A 23 7/8 x 30 3/8 in door banded all round with a 1 mm band is cut 23.796 x 30.296 in (606.4 x 771.5 mm finished, 604.4 x 769.5 mm cut).
- Every cut stays where it is in the finished part: holes, dados, grooves, notches, hinge cups, plate holes, runner screws, shelf pins and pull holes. Blum gives the cup's boring distance from the door's edge, and the plates and runner screws 37 mm from the side's front edge. With a band on, that edge is the band's face. So on the blank, each cut is the band's thickness nearer the raw edge.
- This is geometry, not a convention. No edgeband or machine maker's rule for taking the band off the cut size was found. What the trade software read says: OptiCut deducts the edging thickness "when working in net dimensions"; Mozaik's help says to set the band to 0 mm when the edgebander pre-mills it, "to ensure Mozaik is not deducting anything for the edging thickness"; Promob's worked example subtracts a 1 mm band per side (and adds an offset); Microvellum offers pre-mill modes that remove or add the band thickness. The sources, quoted, are in [research/edge-banding-sources.md](research/edge-banding-sources.md).
- **The model shows the blanks.** A banded edge stands a band's thickness short of where the finished part's edge will be, so you see a gap that size at banded edges (between a door's edge and its neighbour's, for example, the gap looks a band wider on each side), and a size measured in the model is the cut size. **10 · Edge banding** gives the finished sizes.

Cut the parts on the router, band them, then fit the hardware.

### Measure your band

Type the thickness your band measures, not the one on its label. Measure it as you measured the plywood ([Measure your plywood](#1-measure-your-plywood)): calipers across a piece of the band, in a few places, and take the average. REHAU makes its 1 mm band to +-0.1 mm. In the band's **Thickness**, pick **Measured: type it** and type the number.

Each 0.1 mm the band is thicker than typed makes the part 0.1 mm larger on every banded edge, and moves each hinge cup 0.1 mm further from the door's finished edge. To check, band a test door ([Mini door](#mini-door)) and measure it across its bands: it should be the door's finished size.

### The fields

| Field | Starts at | Limits | Notes |
|---|---|---|---|
| **Band the edges** | Off | | Off, every other field here is ignored. |
| **Bands** | One band | 1 to 3 | One band for each kind of part at most. |
| **Thickness** | Band 1: 1 mm. Band 2: 3 mm. Band 3: 2 mm. | 0.018 in (0.457 mm), 1, 2 or 3 mm, REHAU's stock sizes (REHAU gives the thin band in inches only); or **Measured: type it**, 0.1 to 6.35 mm (1/4 in) | The 0.1 to 6.35 mm range is Sawhorse's limit, not a sourced rule: thicker than 1/4 in is solid-wood edging, not a band. |
| **Name or colour** | Empty | 40 characters | Goes on the shopping list: "Edge banding, 1 mm x 15/16 in, White PVC". |
| **Width** | 15/16 in (23 mm in a metric document) | More than 0, at most 4 in; at least as wide as the stock it covers | REHAU stocks 15/16 in; Ostermann's standard widths include 23 mm, and it cuts edging to any width up to 100 mm. The width only names the band. "At least as wide as the stock" is Sawhorse's rule, not a sourced one: a narrower band leaves the edge bare. |
| **Doors and drawer fronts, all four edges** | Band 1 | | **No banding**, or a band of the list. |
| **Front edges of the sides, top, bottom, fixed shelves and front stretcher** | Band 1 | | |
| **Adjustable shelves, front edge** | Band 1 | | |
| **Edgebander pre-mill** | 0 | 0 to 3 mm | Edgebanders only (below). Iron-on banding: 0. |
| **Waste per banded side** | 1 in (25.4 mm) | 0 to 12 in | Microvellum's default, not a standard: its edgeband report adds 1 in per banded side, then 5%. Each part carries the 1 in a side; the 5% is the shopping list's banding overage, added once to the total. |

### Which edges, and why

- **The carcass and the shelves.** The AWS standard (2009) defines a frameless cabinet as one "where the front edge of the cabinet body components are edgebanded", and counts the "visible front edges of stretchers, ends, divisions, tops, bottoms, shelves, and nailers" as exposed. It counts "the three non-visible edges of adjustable shelves" as concealed. So the starting choice bands the front edges of the sides, the top, the bottom, the fixed shelves and the front stretcher, and the front edge of each adjustable shelf.
- **Doors and drawer fronts.** These are banded all round. One owner's spec (the University of Maryland's casework section) asks for banding "on all exposed edges", 3 mm PVC on doors and drawer fronts and 1 mm elsewhere. That is one spec, not a standard. To follow it: **Bands** > **Two bands**, Band 2 at 3 mm, and **Doors and drawer fronts** > Band 2. A 3 mm band on doors needs a **Boring distance** of at least 6 mm (below).
- **Never banded:** the rear stretcher, the back, the toe kick, the nailers, the drawer boxes and the bin frame. AWS counts nailers' visible front edges as exposed, but the nailers here sit behind the back at the rear edge: no front edge of theirs shows. The others do not show either, or they sit in a joint.
- **Finished ends:** an applied end panel (**11 · Ends, fillers and openings**) takes the band the carcass front edges take, on its front edge, or its front and bottom, or front, bottom and top ([below](#end-panels-fillers-and-appliance-openings)).
- A band goes only on an edge that shows. No edge the panel offers can be banded into a joint: every one is a front edge, or a front's edge, that nothing sits against. The planner also checks each banded edge against every other part (and refuses a band that would sit in a dado or groove, or against another part); today that check never fires, and it guards part kinds added later.
- **Notches at an end.** A side's front edge ends at its toe kick notch, and a fixed rail's at its tongues, which are notched to clear the dado's stop. On an edgebander the band runs across such a notch; trim it off by hand at the notch's inside corner. The band counted for the part is the edge's whole run, notch and all, plus the waste per side. **10 · Edge banding** and **8 · Cuts and holes** say so for each such part.

### What it refuses, and what to change

A band leaves the wood behind it thinner by the band's thickness. The planner keeps its 3 mm of wood to every raw edge, as it already does to every finished one. Each refusal says the value to type.

| Refused | Why | Change |
|---|---|---|
| A blind dado's stop | The sides' dados stop **Dado stop** from the finished front edge; under the band (after any pre-mill) there is that much less wood in front of them. | **Dado stop** at least the band plus 3 mm, or a thinner band on the carcass. |
| A hinge cup | The cup's edge is the **Boring distance** from the door's finished edge, so the band's thickness less from its raw edge. | **Boring distance** at least the band plus 3 mm: 6 mm for a 3 mm band; the starting 5 mm takes up to 2 mm. Over 4 mm, no boring distance Blum gives (3 to 7 mm) works. |
| A pull hole | The same, to the hole's edge. | **From the edge** at least the band plus 3 mm plus the hole's radius. |
| A finger notch in a banded drawer front | An edgebander runs the band straight across the notch. | Another **Pull**, or **No banding** on doors and drawer fronts. |
| A band narrower than its stock | It cannot cover the edge. | A wider band. |
| A band where it would change a joint | A groove or rabbet running out of the edge, a notch in its middle, a hole bored into it, or another part against it. None of these arises with the edges the panel offers; the checks guard part kinds added later. | Do not band that edge. |

### Where it shows

- **10 · Edge banding** lists each banded part: how many, which edges, which band, its finished size, its cut size, and the band each piece takes with waste. **8 · Cuts and holes** has the same, as **Edge band** rows.
- **The CNC files** draw the cut sizes, the blanks. Every hole and pocket is where the finished part needs it.
- **The model** shows the blanks too (above): measuring in it gives the cut sizes.
- **The Cut list** lists a banded part at its cut size, as it is drawn, with a note: "edge banding 1 mm x 15/16 in, 2.858 m a piece". The note under the list then opens "Sizes as drawn" instead of "Finished sizes" and says so. The Cut list gives neither the finished size nor which edges: **10 · Edge banding** does.
- **The Shopping list** lists each band by the metre: every banded edge's whole run plus the waste per banded side, rounded up to the millimetre per piece, times the pieces. Its banding overage starts at 5%, Microvellum's default (not a standard), added once to the total. Type a **roll** length to buy whole rolls (REHAU sells 600 ft (182.88 m) coils under 0.8 mm, 400 ft (121.92 m) of 2 mm and 300 ft (91.44 m) of 3 mm).

### With an edgebander

An edgebander's jointing cutter (pre-mill) takes a little off each edge before the band goes on, to clean up the saw's or the router's cut: 0 to 3 mm on Felder's and SCM's machines. Type what yours takes in **Edgebander pre-mill**. Each banded edge's blank is cut that much larger, so after the pre-mill and the band the part is its designed size. With a 1 mm band and a 1 mm pre-mill the blank is the finished size; with a pre-mill larger than the band the blank is larger than the finished part. The 3 mm of wood is kept to the edge as it is after the pre-mill. Iron-on banding takes no pre-mill: leave it at 0.

### Test cuts

The mini drawer and the mini door are banded as your cabinet is (the same planner), and say so. Measure the mini drawer's side length, the machine's scale check, before banding: the row gives the side's blank as cut, a band shorter than your cabinet's depth (less any pre-mill). Then band them, and measure across the bands and fit the hardware. The mini door's rows give the cup's centre, and the plates' 37 mm line, from the banded edge and from the blank's edge as cut (the band less any pre-mill). The machine check and the joint ladders are never banded: they test the machine and the joints, and have no edge that shows.

## Build a row of cabinets

A row is cabinets side by side: turned the same way, each against the last one's side, backs in line, on one floor. Wall cabinets line up by their tops instead. Sawhorse finds rows from where the cabinets stand, so a row survives rebuilds, moves and saves.

### Add cabinets to a row

1. Make the first cabinet.
2. Click empty space.
3. In **Place**, choose where the next one goes, relative to the last cabinet made or edited:
   - **Right of …, at its row's end** (the default);
   - **Left of …, at its row's start**;
   - **Around the corner, right of …'s row** or **left of …'s row**: turned a quarter, its back on the next wall. **Corner filler** (3 in, 75 mm) is the gap from the corner cabinet's carcass front to the new cabinet's side, so doors and pulls clear. The new cabinet's own filler or end panel on that side is counted too. After a corner, Place carries on down the new wall.
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
| Toe-kick skin | None | A strip in front of each front rail, as long and as tall, in the row's first cabinet's **Carcass**, **Door** or **Back plywood** (its thickness from that cabinet's **4 · Materials**). A setback no more than the skin's thickness is refused; KCMA's least toe space (3 in (76 mm) high, 2 in (51 mm) deep once skinned) is warned of. |

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

## End panels, fillers and appliance openings

A row is rarely just boxes. A finished end covers the side that shows, a filler gives the doors room at a wall, and a dishwasher or a range needs a gap. The cabinet panel's **11 · Ends, fillers and openings** group puts each beside a cabinet, and the row makes room for it. Nothing is on to start: a cabinet that uses none of it is built, kept and cut exactly as before, to the byte.

Every number here comes from a maker's or a standard's document, quoted with its address in [research/row-features-sources.md](research/row-features-sources.md), or is labelled as Sawhorse's own. Appliances differ between models: each preset names its maker and model family, and the panel says to check your appliance's installation guide.

### What stands beside a cabinet

Each side (**Left side**, **Right side**) takes one of these. The row counts its width, so the next cabinet stands past it, and a change moves the cabinets right of it as a wider cabinet does (one on the left moves the cabinet itself, and those right of it).

| Choice | What it is | Its width in the row |
|---|---|---|
| **Nothing** | The side as it is. | 0 |
| **Finished end panel** | A panel of its own on the side's outer face, its grain up. | The stock's thickness |
| **Filler** | A strip beside the side, its face flush with the carcass front. | **Filler width** |
| **Scribe filler** | A filler cut wider by the **Scribe allowance** on its wall side, to scribe to the wall by hand. | **Filler width** (what it ends at once scribed) |

**End panels**

| Field | Starts at | Notes |
|---|---|---|
| End panel stock | Carcass plywood | Or **Door plywood** (for a laminate face that matches the doors). The thickness is the cabinet's **Carcass, doors** stock. Fillers use the same stock. |
| Panel bottom | To the floor, over the toe kick | Or **Flush with the cabinet's bottom** (the toe kick's top). No source picks one. Shown for a cabinet with a toe kick. |
| Panel front | Flush with the door faces | Decor's installation guide: applied end panels are "usually flush with the door face". Or **Flush with the carcass front**. Inset fronts and open shelves have no door face to be flush with. |
| Panel edges banded | Front edge | With **10 · Edge banding** on, in the band the carcass front edges take: the front edge (AWS counts the "visible front edges of ... ends" as exposed), or front and bottom (a wall cabinet's bottom edge shows), or front, bottom and top. Cut short by the band, as every banded part. |
| Scribe allowance | 0 | Your setting, not a standard: the panel is cut this much deeper at its back edge, to scribe to the wall. The AWS standard allows scribes up to 1-1/2 in (38.1 mm) wide at wall-to-wall installations; wider is warned of. |

Fasten it with screws from inside the cabinet: Decor's guide uses 1-1/8 in screws. It is not drilled, since no source gives a hole pattern. On a base frame the cabinet has no toe kick, so the panel stops at the cabinet's bottom: set the frame's showing end back (**Ends**) so the toe space turns the corner.

**Fillers**

| Field | Starts at | Notes |
|---|---|---|
| Filler width | 3 in (50 mm) | Starting values, not a standard. 3 in is a width KraftMaid sells (BF3), and the filler it ships with each blind corner base. 50 mm is IKEA's planning guide's least filler between a cabinet and a wall; IKEA's Canadian checklist says 1 in. No general table of filler widths was found. |

A filler is as tall as the cabinet's box, above the toe kick (KraftMaid's base fillers have "No toe kick"), or the cabinet's full height without one. Screw through the cabinet's side into its edge (IKEA), fixed before the cabinet goes in (Decor). Nothing is drilled, and fillers are not banded: their face shows, and their edges are against the cabinet and the wall.

**A scribe filler** is cut wider than it ends up, by the **Scribe allowance**, on the side away from the cabinet. Hold it against the wall, trace the wall onto it with a small block and a pencil (IKEA's method), and cut to the line. The row counts the width it ends at; the model shows it as cut, past the row's end by the allowance.

### Toe-kick skins

A skin is a strip in front of the toe kick, in the stock you pick: **Carcass**, **Door** (laminate to match the doors) or **Back plywood** (thinner). No maker's source for applied skins was found.
- **On a cabinet with a toe kick** (**Toe-kick skin** in **11 · Ends, fillers and openings**): as tall as the kick, under the cabinet and its fillers, and under an end panel that is flush with the box's bottom. It stops at an end panel to the floor.
- **On a base frame** (**Toe-kick skin** in **Rows and base frames**): one strip in front of each ladder's front rail, as long and as tall, in the row's first cabinet's stock.

KCMA A161.1 asks a toe kick to be at least 3 in (76 mm) high and 2 in (51 mm) deep. Those are checks, made only when a toe-kick skin is on: a lower kick, or less depth once the skin is in front of it, is warned of, never refused. A bare toe kick is not checked. A skin as thick as the setback, or thicker, would stand in front of the cabinets, and is refused. Glue and pin or screw the skin on from behind, and scribe it to the floor as needed (Decor: "Scribe the toe kick as needed").

### Appliance openings

**Left of it** and **Right of it** put an opening beside the cabinet, past its end panel or filler: space in the row where no cabinet goes. Nothing is cut and no appliance is drawn. A base frame stops at an opening, so each side of it is its own ladder. Picking a preset sets the opening's width; change it to what your appliance asks.

| Preset | Starts at | Checked | Source |
|---|---|---|---|
| Dishwasher, GE built-in | 24 in | At least 24 in wide; 34-1/4 to 34-3/4 in under the countertop (GE's Figure A: 34-1/2 in, plus or minus 1/4 in) | GE installation instructions 31-31546 |
| Dishwasher, Bosch | 24 in (610 mm) | At least 24 in (610 mm) wide, 33-7/8 in (860 mm) high | Bosch 9002059336 |
| Dishwasher, Bosch fully integrated | 600 mm (23 5/8 in) | 600 to 616 mm wide, 813 to 870 mm high | Bosch 9001450387 |
| Range, freestanding 30 in | 30 in | At least 30 in wide; a cabinet of the plugin's over it at most 13 in deep | Frigidaire FFEF3003U |
| Range, slide-in 30 in | 30 in | 29-15/16 to 30-1/16 in wide; over it at most 13 in deep (GE's JS760 manual allows 16 in: the makers disagree) | Frigidaire FGDS3065P |
| Refrigerator | No width: type it | Nothing: the panel shows GE's and Whirlpool's clearances, which disagree, and Monogram's note that frameless cabinets may need fillers beside a fridge | GE 49-60792, Whirlpool W10768947A, Monogram 49-60314 |
| Another opening | No width: type it | Nothing | Your appliance's guide |

A metric document reads the millimetres where the maker prints them (Bosch's 610 and 860 mm) and converts the rest. The **height under the countertop** is the top of the cabinets beside the opening above the floor (the lower one, if they differ), since the countertop is not modelled. GE's 24 in depth is shown, not checked. The floor is the model's ground.

**Over-the-range microwave.** A microwave over a range hangs under a wall cabinet in the wall row, not in a gap. Tick **An over-the-range microwave hangs under it** on that wall cabinet (no toe kick). GE's installation guide asks for the space between the cabinets to be 30 in wide: a narrower cabinet over it is warned of, and a wider one is warned of too, the warning naming the Filler Panel Kit GE says may be used where the space is wider. The cabinet over it is checked at most 13 in deep for a standard installation, and 66 in or more from the floor to the microwave's top, against the cabinet's bottom. GE's 30 in from the cooking surface is in the panel's text only.

### Sinks

Type the sink's width in **Sink width**, or tick **Farmhouse (apron-front) sink**. Kohler's spec sheets give the narrowest base cabinet:

| Sink | Base at least | Kohler |
|---|---|---|
| 24 to 25 in | 27 in (686 mm) | Vault K-3894, K-3822-4; Staccato K-3362-4 |
| 32 to 33 in | 36 in | K-3145-4, K-3346-4, K-3672, and others |
| 35 in | 36 in, and 36 in "may require cabinet modifications" | Strive K-5283 |
| Farmhouse | 36 in (914 mm) | Whitehaven K-6489, K-6488 |

A narrower cabinet is warned of. A sink of another width has no rule here, and the panel says so: check your sink's own spec sheet.

### Where it shows

- **The model**: end panels, fillers and skins are parts of the cabinet, beside it; an opening is the gap.
- **8 · Cuts and holes**: a **Hand** row for each part (how it is fastened, the scribe), an **Edge band** row for a banded end panel, and a **Check** row for each opening and each warning.
- **11 · Ends, fillers and openings > Checks**: the cabinet's own checks, and, once it is made, those that read the cabinets beside and over its openings.
- **Rows and base frames**: the row's layout, left to right (each cabinet, end panel, filler and opening, where it starts and how wide), and every check of the row.
- **The Cut list, the CNC files and the shopping list**: each part, at its size and with its grain; a banded end panel's band by the metre.

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
- **The spacing check reads your profile bit.** Choose it in **CNC setup** > **Tools** (**Profile bit**). The check passes when Kerf is the bit's diameter plus 1/16 in or more: 5/16 in for a 1/4 in bit, 3/16 in for a 1/8 in bit. With no profile bit chosen it assumes 1/4 in and says so. It does not read the cabinet panel's **Bit diameter**, which sizes the joints. For a bit wider than 5/16 in, CNC spacing's 3/8 in gap is not enough: the question says what Kerf to type, and does not offer **Use CNC spacing**. Kerf goes up to 1/2 in, so a bit wider than 7/16 in cannot be spaced at all: the question says so and names the largest bit that can.

- **Check the assigned cutters before export.** In **CNC setup > Tools**, tick **I own this bit**, enter each bit's shank and cutting length, and enter the collet sizes you have checked, in millimetres. Starter entries alone do not count as owned; changing a router clears its collet confirmations, and editing a bit clears its ownership confirmation. **Job sheet** assigns a bit to pockets, narrow grooves, holes and cutouts; profiles use the **Profile bit**. Before saving DXF or CNC files, Sawhorse warns for missing or unconfirmed tools, insufficient reach (including 0.5 mm breakthrough on through cuts), unsuitable diameters and unconfirmed collets. It uses the job sheet's measured narrowest places and narrow-groove fallback; approximate outlines still need CAM review. **Open CNC setup...** goes to these settings. You can explicitly save after reviewing the warning. This is a geometry and inventory check; DXF has no G-code or toolpaths to validate.
- **A part drawn at a thickness its sheet is not** (more than 0.1 mm apart) is asked about when the file holds machined cuts: a pocket, a hole, a cutout or a notch somewhere. The line reads, for a cabinet drawn at 3/4 in on 23/32 in plywood: "drawn 3/4 in thick but nested on 4 x 4 sheet, 3/4 (23/32 in), a sheet 1/32 in thinner: joints and depths sized to the drawing (a dado's width, a tongue's length, a hole's depth) will not fit this sheet. Set the design to the sheet's measured thickness, or the sheet's thickness to what you will cut". Take it seriously, and fix it before you save. A file of plain rectangles has nothing sized to the thickness and is not asked about.

**Tool details in layer names.** CNC files now append the assigned tool name and diameter to every cutting layer, for example `DRILL_D4.76MM_THRU__POCKET_WITH_MY_1_8_INCH_END_MILL_D3P175MM`. The first diameter is the required hole; the second is the cutter. `POCKET_WITH` explicitly means to pocket the circle, not drill with that cutter. An unset tool says `TOOL_UNSET`; an unconfirmed tool says `OWNERSHIP_UNCONFIRMED`. The job sheet and cut order use the same names and the same captured shop settings as the DXF. Name a bit with its actual library/catalog number in Tools to carry that identity into CAM; a generic starter row does not establish a particular Carbide tool or its reach. Existing CAM layer-selection templates must be updated, or turn off **CNC setup > Job sheet > Tool details in CNC layer names**. The combined **DXF** and **DXF R12** exports retain their original layer names.

You get one DXF for each sheet the router cuts (and for each board, when the model has solid-lumber parts such as a lumber base frame), ready for one CAM job per sheet:
- millimetres, with the sheet's lower-left corner at 0,0;
- each part labelled with its tag and name;
- each file named for its sheet's number, the cabinets and parts on it, its stock and what the router does. The name starts with the model's file name (Untitled until it is saved). The Quick start's Base in a model saved as `Kitchen.shz` gives four files, the second of them `Kitchen 02 sheet 1 of 2 - Base 1 Left side, Right side - 4 x 4 sheet, 3-4 (Cabinet plywood) - profile, pockets, drills CNC.dxf`.

A sheet has one number wherever it is named. `02` is its number in the whole nesting: the label inside the file says the same ("2. Sheet 1 of 2 - 4 x 4 sheet, 3/4 - Cabinet plywood"), and so does the PDF. `sheet 1 of 2` is its place among the sheets of its stock and material, as its diagram is titled in the Nesting section. A board's file says `board`. Characters a file system refuses are taken out of the name (the "/" in 3/4 becomes "-"), and a very long name is cut short.

After the DXFs, **CNC files** saves one more file: the **job sheets** for every router sheet, as text, named for the model and the day (`Kitchen job sheets 2026-11-15.txt`). Save it with the DXFs. It names each sheet by its DXF's default name. Cancelling it leaves the DXFs saved, and the status line says so. [Job sheet and part labels](#job-sheet-and-part-labels) says what is on it.

The status line then says how far apart the parts are (use a bit narrower than that) and whether the sheet has a margin.

The other exports in the Nesting section:
- **SVG**: a 1:1 drawing per sheet, to print or project.
- **DXF**: every sheet in one file, a layer per sheet.
- **DXF R12**: the same with old-style polylines.
- **PDF**: a booklet with what to buy and a page per sheet with its cut sequence; after each router sheet's page, its job sheet; at the end, the part labels.

## Set up the CAM job

The DXF holds shapes, not toolpaths. Each kind of cut is on its own layer, so you give each layer one toolpath. Go through these seven steps for every sheet.

Step by step in your CAM program: [Carbide Create](CAM-CARBIDE-CREATE.md) and [VCarve](CAM-VCARVE.md). Each guide says where these steps are done in that program, and which of its statements to check on your screen.

**Templates and layer names.** A layer's name holds its depth (`POCKET_6.35MM`), so a CAM template's toolpaths pick up only the layer names they were made with. A metric document, a new dado or groove depth, another drawer-box stock or another pull hole makes a new name that no template toolpath takes, so a depth meant for another layer is never applied without you seeing it. After every import, check that every layer except `STOCK` and `LABELS` has a toolpath. The guides list the names the starting cabinets produce.

### 1. Check the scale

The file is in millimetres and says so in its header, but not every CAM program reads that header. Choose millimetres if the program asks. Then measure the outer rectangle on the `STOCK` layer. It is your sheet, so for a 48 x 48 in sheet it must measure 1219.2 x 1219.2 mm, and for a metric document's 1220 x 1220 sheet, 1220 x 1220 mm. If it is 25.4 times too big or too small, the program has the units wrong: fix the import before you make a toolpath.

The sheet's lower-left corner is at 0,0. Set the job's X and Y zero at that corner of the real sheet, with the sheet square to the machine. The inner rectangle on `STOCK` is the trim line: every part's outline lies inside it.

### 2. Give each layer its toolpath

| Layer | What is on it | Toolpath |
|---|---|---|
| `PROFILE_THRU` | Each part's outline (its real outline when notched, such as a side with a toe kick) | Outside profile, through the sheet, with tabs unless a vacuum table holds every part ([Hold the parts down](#6-hold-the-parts-down)). |
| `POCKET_6.35MM`, `POCKET_7.94MM`, `POCKET_5.95MM`, … | Dados, grooves and rabbets, one layer per depth (the number is the depth in mm) | Pocket to that depth, with a bit narrower than the groove. **8 · Cuts and holes** lists each groove narrower than your bit under **Change bit**. With the starting sizes in inches, `POCKET_6.35MM` is the dados, 0.727 in wide, for the 1/4 in bit; `POCKET_7.94MM` (the back's groove) and `POCKET_5.95MM` (the drawer bottoms' grooves) are 0.227 in wide and need a 1/8 in bit. In a metric document the dados and the drawer bottoms' grooves are both 6 mm deep, so both are on `POCKET_6MM` (in different files), and the back's groove is on `POCKET_8MM`. Those grooves are 6.2 mm wide: a 6 mm bit just fits, a 1/4 in (6.35 mm) bit does not. |
| `DRILL_D35MM_13MM` | Hinge cups: 35 mm across, 13 mm deep | Pocket the circle to 13 mm with your end mill. Never put a Forstner or hinge-boring bit in a router: it is made for a drill press's speed ([the warnings](#the-warnings)). |
| `DRILL_D5MM_11.5MM`, `DRILL_D5MM_13MM`, `DRILL_D5MM_10MM`, `DRILL_D6MM_10MM` | Hinge-plate (5 x 11.5), runner-screw (5 x 13), shelf-pin (5 x 10) and drawer rear hook (6 x 10) holes | Pocket each circle to its depth with an end mill smaller than the hole (1/8 in or 3 mm). A 1/4 in end mill cannot make a 5 or 6 mm hole. Check that the small bit's flutes are at least as long as the hole is deep. Use a drill bit of the hole's size only if your spindle has a collet for its shank and a speed slow enough for drilling. |
| `DRILL_D4.76MM_THRU` (a 3/16 in pull hole), `DRILL_D5MM_THRU` | Pull holes | The same, through the sheet. If the small bit's flutes are shorter than the sheet is thick, bore as deep as they reach and finish the hole with a hand drill. |
| `DRILL_D8MM_11MM`, `DRILL_D7MM_THRU` | With **Joinery** Dowels: the dowel holes in the sides (8 x 11). With Confirmat screws: the screws' holes through the sides (7 mm) | Pocket each circle with an end mill smaller than the hole, to 11 mm or through the sheet ([Joinery](#joinery-dowels-and-confirmat-screws)). |
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

The [test cuts](#test-cuts-prove-the-setup-before-the-real-sheet) check the machine, the fit and the hardware. Before the first full sheet, check the job too:
1. In the CAM program, toolpath one small part of the real file. A base cabinet's rear stretcher (4 x 23 in in the 24 in Base) has an outline and a groove.
2. Cut it from an offcut of the same plywood, set up as you will set up the sheet.
3. Measure it: the length and width against the Cut list, the groove's width and depth against **8 · Cuts and holes**.
4. Bore one 5 mm hole in the offcut and try a shelf pin in it.

If a size is off, look at the CAM job first: the scale, the bit's real diameter, and where Z is zeroed.

## Job sheet and part labels

A DXF holds shapes and layer names. The job sheet is the rest of what goes into the CAM job for one router sheet, printed to tick off: usually two or three pages a sheet. Every number on it comes from somewhere you can check: the sizes from the nesting and the parts' measured cuts, the feeds from **CNC setup** with their confidence, the rules from this guide and the [CAM guides](CAM-CARBIDE-CREATE.md). Where Sawhorse does not know something, the sheet says so.

### Where to find it

- **In the Nesting section:** each router sheet's caption has a **Job sheet** link. It opens the sheet's job sheet under its caption, with a box to tick for each cut layer, and is worked out again when the nesting or CNC setup changes. The ticks are for that screen only, and start again when the nesting is worked out again.
- **After the CNC files:** once every DXF is saved, **CNC files** saves one text file with every router sheet's job sheet, named for the model and the day (`Kitchen job sheets 2026-11-15.txt`). It names each sheet by the default name **CNC files** gives its DXF, and says so: if you saved a DXF under another name, find its sheet by the label inside the file, which the job sheet prints too. Cancelling this file leaves the DXFs as they are, and the status line says which were saved.
- **In the PDF:** after each router sheet's page, then the part labels at the end. The job sheet and label pages are on the label paper set in **CNC setup > Job sheet** (letter or A4); the rest of the booklet stays letter.

The track saw's sheets are not router sheets: they have no DXF and no job sheet. Each job sheet names them and points to their cut sequence and the hand work list.

### What is on it

- **The sheet**, named exactly as its DXF's default file name and its label inside the file ("2. Sheet 1 of 2 - 4 x 4 sheet, 3/4 - Cabinet plywood"); its stock and the material its feeds are read for ([below](#material)).
- **The thickness to type into the CAM job.** Measure the sheet with calipers and type what you measure. The stock's thickness on the sheet is only what was entered in **Stock…**, not a measurement.
- **XY zero:** the sheet's lower-left corner is 0,0, and the outer `STOCK` rectangle's size in millimetres, to measure after import ([Check the scale](#1-check-the-scale)). **Z zero:** on the top of the sheet ([Set the depths from the top of the sheet](#4-set-the-depths-from-the-top-of-the-sheet)).
- **The file's own layers, in its order, and no others.** Each cut layer has a box to tick: this is the printed form of the CAM guides' safety rule, every layer except `STOCK` and `LABELS` must have a toolpath. `STOCK` and `LABELS` are listed as reference, with no box. The DXF's layer table also always has layer `0`, empty: the sheet says it needs no toolpath. For each cut layer:
  - the toolpath (outside profile, inside profile for a cutout, pocket, or pocket the circle) and its depth: the number in the layer's name, or through: the measured thickness plus about 0.5 mm (0.02 in);
  - the bit, from CNC setup ([below](#which-bit-each-layer-gets)), or **CHOOSE A BIT** when none is set;
  - the narrowest shape on that layer in this sheet, measured from the parts, and whether the bit is narrower than it;
  - the dial and RPM, the chipload, the feed, the ramp and the depth per pass (for a compression bit, the first pass too), as **CNC setup > Feeds** works them out for that bit, the layer and the sheet's material, each with its confidence and sources;
  - every warning CNC setup gives for that bit and layer, as **Stop** or **Check**.
- **The cut order and the tool changes:** drills and pockets first, cutouts next, profiles last ([Give each layer its toolpath](#2-give-each-layer-its-toolpath)). Within that order, the layers that share a bit are cut together, and the bits are put in the order with the fewest changes; the sheet says how many bits and how many changes. `FLIP_` layers come last, as a second setup; when the second setup also changes the bit, it says both. Every cut layer is in the order: a layer with no bit is a numbered step reading **CHOOSE A BIT**, counted as a bit of its own (the count says how many are still to choose). A step whose bit does not fit a layer says **DOES NOT FIT** and names the layer.
- **The parts, smallest first**, each with its size, which face is up ([below](#which-face-is-up)) and its grain. Parts as narrow as the hold-down width or narrower are marked **Hold down** ([below](#hold-down)).
- **`FLIP_` notes:** which parts have cuts in the other face, and that a `FLIP_` shape is drawn where its cut is when you look down through the part from the face that is up.
- **The compression bit's first pass**, whenever a layer is cut with a compression bit: it must be deeper than the bit's up-cut section, with the depth for that bit when its up-cut length is known.

### Which bit each layer gets

Set in **CNC setup > Job sheet**:

| Layer | Bit | Starts as |
|---|---|---|
| `PROFILE_THRU` | the **Profile bit** (CNC setup > Tools) | none chosen: the job sheet says **CHOOSE A BIT** |
| `CUTOUT_THRU` | **Cutouts** | the profile bit |
| `POCKET_…` | **Pockets** | the 1/4 in down-cut |
| a `POCKET_…` layer with a shape narrower than the pocket bit | **Narrow grooves** | the 1/8 in end mill |
| `DRILL_…` | **Holes** | the 1/8 in end mill |

These follow the research's starting rows: a compression bit to profile, a down-cut for dados and pockets, a 1/8 in end mill for 5 mm and 6 mm holes and fine features ([The starting values](#feeds)).

**A bit must be narrower than the narrowest shape on its layer in that sheet.** Sawhorse measures each shape from the part:
- a groove's width, an L of two dados at its narrower arm, a hole's diameter, an opening's narrowest place;
- a pocket as the file draws it, so a dado that runs out of its part is measured past the edge, into the gap ([Leave the dados that cross the outline as they are](#3-leave-the-dados-that-cross-the-outline-as-they-are));
- for the outlines, the gap between parts (Kerf), and a notch only across the way it is closed. A notch open on two sides (an outline corner, as on a stretcher or a bottom) puts no limit on the bit: only its inside corner keeps the bit's radius. A slot open on one side, in the middle of an edge, limits the bit to its width.

A deeper pocket that crosses a shape, an opening, and the waste outside a notched part are cut anyway, so they do not count as narrow places. A shape with slanted edges is measured across its outline and says so: check its narrowest place on the drawing. A bit exactly as wide as a shape does not fit: it could cut it only as a slot along its centre line (an on-line toolpath), and the sheet says that too.

When a pocket layer's shape is narrower than the pocket bit, the job sheet says so, names the shape, and cuts the layer with the narrow-groove bit if that fits. In a metric document the back's groove and the drawer bottoms' grooves are 6.2 mm wide: a 1/4 in (6.35 mm) bit does not fit, and the sheet says it.

**When the bit does not fit, or none is set,** the sheet names the largest bit in your library that does fit and whose flutes reach the layer's depth (for a through cut, the sheet's thickness plus 0.5 mm), of the layer's own type first: a compression bit for a profile or cutout in a faced sheet, a down-cut for pockets, an end mill for holes and narrow grooves. A bit of another type is named as such. A bit whose cutting length is not typed is never said to reach: the sheet names it as one that would fit if its flutes reach that deep. When no bit is suitable, it says so. When the bit set for a layer fits and a larger one in your library fits too, the sheet says so (fewer passes); it never changes the bit for you.

### Material

The feeds on each sheet are read for its material, set in **CNC setup > Job sheet**: one for every sheet, and one for each of the nesting's router stocks if you want ("4 x 4 sheet, 1/4": Baltic birch). It starts as laminate-faced Baltic birch, the most cautious of the materials, so the warnings for a laminate face show until you set it. Each job sheet prints its material and where it was set.

### Which face is up

Read from each part's measured cuts, not from its name. Sawhorse draws each part with the face its cuts are in facing up ([Know which face is up](#5-know-which-face-is-up)), and the job sheet and the label say that face by its cuts:
- a part with 35 mm hinge cups: its back is up (a door's show face is down);
- a part with dados, grooves or blind holes: the face they are in, named by them ("the face with its dados or grooves and its 5 mm holes"). On a carcass part that is the inside face; on a drawer back the runner's rear hook holes are in its rear face, the outside of the drawer box. The sheet does not guess which: it names the cuts;
- a part with no blind cuts (only holes through it, or none): either face. If its outline is notched, turned over it is its mirror image;
- a part with cuts in both faces: the face with the most cuts first, then turn it over for the `FLIP_` layers;
- a part whose cuts could not be measured: not known. Check the model.

### Hold-down

The width under which a part is marked **Hold down** is **CNC setup > Job sheet > Hold-down width**. Left empty, it is 5 in (125 mm in a metric document): Sawhorse's own default, not a standard. No source found gives a width; [Hold the parts down](#6-hold-the-parts-down) names 3 in nailers, 4 in stretchers and drawer sides as the parts that need it most, and 5 in takes all three, the 4 9/16 in drawer sides of the Base · drawer over 2 doors among them. A part as wide as the width is marked too. Change it to suit how you hold sheets down.

### Part labels

The PDF's last pages are one label per part on the router's sheets, sheet by sheet. Each has:
- the part's tag and name;
- its sheet's number ("2. Sheet 1 of 2") and its cabinet, in that order, so a long cabinet name is what is cut short, never the number;
- its size (width × length × thickness);
- its grain in words with the side it runs along ("Grain along the length (the 34 1/2 in side)"), and an arrow;
- which face was up on the router;
- **Banding:** the bands the part carries, when the Cabinet generator banded it ("1 mm x 15/16 in", from the cut list), or a line to write on. The label does not say which edges: the cabinet's **10 · Edge banding** group lists them (doors and drawer fronts all round, the other parts at the front). With the Cut list not of the model as it is, every label has the line.

The first page of the PDF says which pages the labels are on.

**CNC setup > Job sheet** sets the paper (letter or A4), the label size (4 × 2 in, the default; 4 × 3 1/3 in; or 105 × 74 mm) and cut lines round each label for plain paper. The labels are laid out edge to edge in a grid centred on the page: 4 × 2 in labels are 2 across and 5 down on letter. Sawhorse names no label product and has no source for any maker's layout, so print one page on plain paper and hold it against your label sheet before printing on labels. On plain paper, cut along the lines and tape each label to its part.

## Feeds, speeds and your bits

**CNC setup…**, in the Nesting section beside **Stock…**, gives you a place to start: a dial setting, a feed and a depth per pass for your bit in your material. Treat each value as a starting point, never the answer:
- the bit makers' own charts disagree with each other: the research found them 3 to 5 times apart for a 1/4 in compression bit, and the panel works out the spread for your bit and material;
- every one of those charts is written for an industrial machine at 18,000 RPM;
- Carbide 3D publishes no feeds and speeds for the Shapeoko 5 Pro on the web, and no maximum feed.

The number that suits your bit, your sheet and your machine comes from a test cut in scrap ([Find your number](#find-your-number)).

Every built-in number shows where it comes from and how far to trust it. Click or tap the small label beside it (or Tab to it and press Enter) for the document, the page and the address. The labels mean:
- **high**: a maker's chart, manual, or spec page;
- **medium**: a maker's blog, Carbide 3D staff on the forum, or a reseller;
- **low**: forums and the community e-book.

The sources, with every row a number comes from, are in [the research](research/feeds-speeds-sources.md). Where it found nothing, Sawhorse says it does not know rather than fill in a number.

CNC setup is kept on this device, not in the model. Changing it does not mark the model changed, and a model from another shop does not bring that shop's bits.

### Machine

The built-in machine is the **Shapeoko 5 Pro 4×4**. **Custom** takes your own name, travel, the feed to warn above, and the largest shank your router takes.

| Figure | Value | Source | Confidence |
|---|---|---|---|
| Travel, X and Y | 1237 x 1237 mm (48.70 in) | Carbide 3D, Shapeoko 5 Pro Specs | high |
| Travel, Z | 155 mm (140 mm with Sweepy Pro) | the same page | high |
| Shank, Carbide Compact Router | up to 1/4 in; collets 1/8 and 1/4 in | Carbide 3D, CNC Spindle Comparison; Compact Router docs | high |
| Maximum feed | Not published by Carbide. A forum post gives 200 IPM as delivered (275 IPM firmware maximum) | Carbide 3D community forum | low |

Sawhorse warns when a feed is over 200 IPM on the Shapeoko. It is a warning, not a limit: the figure is a forum user's, not Carbide's.

**Router** is the **Carbide Compact Router**, the **Makita RT0701C**, the **DeWalt DWP611**, or **Another router or spindle**, whose RPM you type. The dial tables, as their makers give them:

| Dial | Compact Router, Carbide's shop page | Compact Router, Carbide staff chart 2020 | Makita RT0701C | DeWalt DWP611 |
|---|---|---|---|---|
| 1 | 11,000 | 10,000 | 10,000 | 16,000 |
| 2 | 13,500 | 14,000 | 12,000 | 18,200 |
| 3 | 18,250 | 18,000 | 17,000 | 20,400 |
| 4 | 24,500 | 23,000 | 22,000 | 22,600 |
| 5 | 29,250 | 27,000 | 27,000 | 24,800 |
| 6 | 31,000 | 32,000 | 30,000 | 27,000 |

The staff chart also gives half steps: 1.5 is 12,000, 2.5 is 16,000, 3.5 is 20,500, 4.5 is 25,000, and 5.5 is 29,500. What to know about these tables:
- **Carbide's two tables disagree at every dial**, most at dial 5: 2,250 RPM apart. The shop page's own dial 1 (11,000) and dial 6 (31,000) are outside the 12,000–30,000 range the same page states. Carbide staff call the speeds "an estimate/guideline only" that varies from batch to batch and with mains frequency. **Read the dial from** picks the table Sawhorse uses (the shop page to start). A tachometer gives your router's own speeds.
- **Makita:** the manual's text lists the six speeds out of order. The pairing above is the only one that rises with the dial, and it matches the RT0700C manual.
- **DeWalt:** which uses go with which settings was lost in the text the research could read. Its collet sizes were not found: check the manual.

### Tools

Your bits, each editable. Sawhorse starts you with three:

| Bit | Filled in | Left for you to type |
|---|---|---|
| **Amana 46170, 1/4 in compression** | 1/4 in cutting diameter, 2 flutes, 1/4 in shank, flutes 0.875 in long, up-cut part 0.2756 in ± 0.010 in (7 mm) from the tip: Amana's drawing of that bit | nothing |
| **1/4 in down-cut** | 1/4 in, 2 flutes: the research's row for a bit like Carbide 3D's #251 | its shank and flute length (not found); count its flutes |
| **1/8 in end mill** | 1/8 in, 2 flutes: the research's row for a bit like Carbide 3D's #102 | the same |

The compression bit is that one Amana bit. Other compression bits have other up-cut lengths. If yours is not a 46170, type its own: the maker's drawing gives it, or measure from the tip to where the flutes change direction.

Each bit has a name, a type (up-cut, down-cut, compression, end mill or O-flute), a **Maker** (Amana Tool, Onsrud, Freud, or unknown: the chipload is then checked against that maker's own figures), a cutting diameter, flutes, a shank, a cutting length, and for a compression bit its up-cut length and tolerance. A size left empty is unknown, and Sawhorse then says what it cannot check: a collet for an unknown shank, a hole deeper than unknown flutes. A size you type over loses its source label, since it is now yours. **Built-in bits** puts the three back, after asking: bits you added or changed are lost.

**Profile bit** is the bit you cut the outlines with. The spacing check before **CNC files** saves reads its diameter ([Save the CNC files](#save-the-cnc-files)). With none chosen, it assumes 1/4 in. Each job sheet gives the outlines this bit, and the other layers the bits set in **Job sheet** ([Which bit each layer gets](#which-bit-each-layer-gets)).

### Feeds

Choose a **Bit**, a **Material** and a **Cut**:
- **Materials:** raw MDF, melamine / TFL on MDF, HPL on MDF, Baltic birch, and laminate-faced Baltic birch. Laminate-faced Baltic birch reads Amana's and Freud's plywood rows, as the research's starting values do, but Onsrud's row for it is its Laminated Plywood sheet (.015–.017 in/tooth for a 1/4 in compression bit), not the Hard Plywood sheet plain Baltic birch reads (.014–.016); the research could not tell whether that sheet means laminate-faced plywood.
- **Cuts:** a profile through the sheet, a pocket or dado, or a hole pocketed with an end mill. For a hole, pick its layer (`DRILL_D35MM_13MM`, `DRILL_D5MM_10MM` and the others from [the layer table](#2-give-each-layer-its-toolpath)).
- **Optional:** the sheet's thickness, the pocket's depth, your depth per pass, a compression bit's first pass, a dial of your own, and **Check a feed** to check a feed from Carbide Create. With a compression bit and no first pass typed, your depth per pass is the first pass, and must be deeper than the up-cut part.

It shows:
- **Chipload:** the starting value, where it comes from and which rule of the research chose it, then each maker's figure for this bit and material, with the lowest and highest and how far apart they are. Amana's Spektra rows are shown for every compression bit but count only for a bit named Spektra (or an Amana 467xx).
- **Speed:** the dial and its RPM. **Automatic** picks the dial nearest the research's speed for this job, then turns it down while the feed would be over the machine's warning. Pick a dial yourself and the feed follows it. On the Compact Router the panel also shows what Carbide's other table says at that dial, and a dial outside the range the maker states (the shop page's dial 1 and 6) is noted.
- **Feed** = RPM × flutes × chipload, in IPM and mm/min (Amana, Onsrud, Freud). A pass deeper than the bit's diameter takes 25% off the feed, and one deeper than twice the diameter takes 50% off (the same three charts). Under the feed, each of its inputs (the chipload, the dial, any of those cuts) is listed with its source, or as yours, and the feed's confidence is the lowest of them: the 1/8 in end mill's feed is low, because its chipload is.
- **Plunge and ramp:** ramp at the feed ÷ flutes (Amana; high). ToolsToday says many users plunge or ramp at about half the feed (medium). The Shapeoko e-book says a straight plunge at 30–40% of the feed (low). A forum user ramps in at about 20° (low). No bit maker's ramp angle was found.
- **Depth per pass**, with its confidence. For a compression bit, the first pass first. The community's half-diameter rule is for later passes, never for a compression bit's first pass.
- **Stepover**, for pockets and holes: roughing 40–100% of the diameter, finishing 5–10% (the e-book; low). No bit maker's stepover was found.

The Shapeoko figures for depth per pass, stepover and ramp are all community advice, low confidence: no bit maker and no Carbide 3D page gives them. The panel says so under the results.

**The starting values.** On the Compact Router, reading Carbide's shop-page table:

| Job | Bit | Chipload (in/tooth) | Dial, RPM | Feed, IPM | Ramp, IPM | Depth per pass |
|---|---|---|---|---|---|---|
| Profile Baltic birch, plain or laminate-faced | 1/4 in 2-flute compression | .0031 (Amana) | 3, 18,250 | 113 | 57 | First pass deeper than 0.2856 in (the 46170's up-cut part and its tolerance), at 85 IPM; then at most 1/4 in |
| Profile raw MDF, or melamine / TFL on MDF | the same | .0061 (Amana) | 2, 13,500 | 165 | 82 | The same |
| Profile HPL on MDF | the same | .0043: Amana's .0061 × 0.70, Rennie's HPL against MDF (derived) | 2, 13,500 | 115 | 58 | The same |
| Dados and pockets in Baltic birch | 1/4 in 2-flute down-cut | .0050 (Amana) | 2, 13,500 | 135 | 68 | About 1/8 in (low) |
| Dados and pockets in MDF or laminate on MDF | the same | .0060 (Amana) | 2, 13,500 | 162 | 81 | About 1/8 in (low) |
| Small parts, 5 and 6 mm holes | 1/8 in 2-flute end mill | .002 (the e-book; low) | 3, 18,250 | 73 | 37 | About 1/16 in (low) |

How the research chose them:
- **The chipload is the lowest bit maker's figure** for the bit and material, which is Amana's in every row. That is already 2 to 5 times below Onsrud's. Going lower makes the bit rub: Freud, ToolsToday and Carbide 3D's blog all say too small a chip heats and dulls the edge.
- **Two rows are exceptions.** HPL is derived, as the table says. The 1/8 in end mill starts below every bit maker's figure (Amana's .0040, Freud's .003), from the e-book's range for a light machine. The panel marks that row below the makers on purpose.
- **The light machine is allowed for in the depth per pass**, not in the chipload.
- **On another router**, Automatic takes the dial nearest the same RPM. On a Makita, the Baltic birch row is dial 3, 17,000 RPM: 17,000 × 2 × .0031 = 105 IPM.
- **For a bit with no row**, the panel says which rule it follows:
  - a 1/8 in bit starts at half of Amana's printed figure (§8b, "on a light machine, start at half of it"), but never under the 0.001 in/tooth rubbing floor the research keeps to (§8a). A 1/8 in down-cut in Baltic birch: half of Amana's .0040 is .002, 73 IPM at dial 3.
  - any other bit starts at the lowest bit maker's figure (§8a, rule 1). A 1/4 in end mill in Baltic birch: Amana's .0050.
  - it runs at the dial §8a uses for its nearest row (the same diameter and material, the same type, else an up-cut, down-cut or end mill row for the others): the 1/4 in end mill at dial 2, 135 IPM. With no near row, near 18,000 RPM, the charts' own speed (§8b).

### The warnings

Each warning says **Stop** (do not cut like this) or **Check** (look before you cut), with its source.

| Warning | When | Why |
|---|---|---|
| Compression first pass (Stop) | A compression bit's first pass (with none typed, your depth per pass), or the whole cut (the pocket's depth, the sheet's thickness, the hole's depth), is not deeper than its up-cut length plus its tolerance | The up-cut part lifts the top face and it chips. A 1/4 in dado is shallower than the 46170's 0.2756 in up-cut part: cut dados with the down-cut bit. For a sheet no thicker than the up-cut part, the down-cut keeps the top face but can chip the bottom face: cut it on a flat spoilboard. |
| Pocket depth needed (Check) | A compression bit in a pocket, with no pocket depth typed | Sawhorse cannot judge the up-cut rule without it. Dados shallower than the up-cut part want the down-cut bit. |
| Feed over the machine's warning (Check) | Over 200 IPM on the Shapeoko (low confidence), or over the figure you typed for a custom machine; also a compression bit's first pass on its own | Turn the dial down: the feed drops and the chipload stays the same. |
| Chipload under the makers' (Check) | Under the lowest bit maker's figure for this bit and material (lowered with the feed for a deep pass) | The bit rubs, heats the edge and dulls. Where the starting value itself is under it (HPL, the 1/8 in end mill), the warning gives that row's own reason and confidence. |
| Rubbing (Stop or Check) | Under 0.001 in/tooth, the commonly cited minimum (low), for the cut or a compression bit's first pass. The same source says it may drop to 0.0005 for 1/8 in and smaller bits, so for those it is a Check down to 0.0005 and a Stop below. | The bit rubs instead of cutting: it heats, dulls, and wood can burn. |
| Chipload over the makers' (Check) | Over the bit's own maker's figure for this material (the 46170 is Amana's: .0031 in Baltic birch), or for a bit of unknown make, over the most conservative maker's highest figure, named | The bit can break or the cut tear. Onsrud's figures run far higher, but for Onsrud's own bits. |
| Collet (Stop) | The shank is larger than the router takes (1/4 in on the Compact Router), or no listed collet is its size (a 6 mm shank in a 1/4 in collet) | A bit in the wrong collet can slip or fly out. An unknown shank, a router whose collets were not found, or a router whose RPM you typed (with no shank limit typed in a Custom machine), is a Check. |
| Hole size (Stop) | The bit is not smaller than the hole | Only a bit smaller than the hole can pocket it. A 1/4 in bit cannot make a 5 or 6 mm hole: use the 1/8 in end mill. |
| Hole depth (Stop) | The flutes are shorter than the hole is deep (for a hole through the sheet, the sheet's thickness) | Past its flutes the bit's shank rubs. An unknown flute length, or an unknown thickness for a through hole, is a Check. |
| Forstner or hinge-boring bit (Stop) | A bit whose name says Forstner, hinge, cup or 35 mm | Amana's 35 mm hinge-boring bit is rated 8,000 RPM at most and "Not to be used in … hand held routers"; Würth runs a Forstner over 35 mm at 900 rpm in MDF. The Compact Router's slowest dial is 10,000 or 11,000 RPM. Pocket the 35 mm cups with an end mill: the panel says so for that layer. |
| Up-cut on a laminate face (Stop) | An up-cut bit in melamine, HPL or laminate-faced Baltic birch. An end mill there is a Check: it chips the same way if it is an up-cut spiral. | The research: never on a laminate top face. An up-cut bit lifts the face and chips it. Use a down-cut or a compression bit for a finished face. |
| Down-cut through a laminate face (Check) | A down-cut bit cutting a profile or cutout through melamine, HPL or laminate-faced Baltic birch | It pushes the skin off the bottom face, where nothing supports it. Cut through-profiles in a faced sheet with a compression bit, on a flat spoilboard. |
| Too deep (Stop) | A pass deeper than 3 × the bit's diameter | No chart goes that deep. |

### Find your number

The scrap test at the foot of **Feeds**, each step with who says it:
1. **Start low:** at the low end of the maker's figure (Freud, Rennie).
2. **Start shallow** (Freud, the e-book). A compression bit's first pass must still be deeper than its up-cut part.
3. **Cut scrap of the same sheet**, at the same thickness, held down the same way (ToolsToday).
4. **Hold the RPM and change the feed** in steps with Carbide Motion's feed override, one thing at a time (the e-book, ToolsToday).
5. **Judge each step:** chips, not dust (except in MDF); a clean edge, with no burn, fuzz, chatter marks or tear-out; the bit at most slightly warm; no chatter (the e-book, ToolsToday).
6. **Back off and write it down:** go back from the first step that chatters or spoils the edge, and record the last good feed for that bit, material and machine (ToolsToday).
7. **Only then cut deeper**, with 25% off the feed past 1 × the diameter and 50% off past 2 × (Amana, Onsrud, Freud).

### What Sawhorse does not know

The research looked and found no source it could open for these, so Sawhorse gives no number:
- the Shapeoko 5 Pro's maximum feed and rapid rate from Carbide 3D (the 200 IPM is a forum figure);
- the values in Carbide Create's tool library, which is not published on the web;
- any chipload for an O-flute in wood, MDF or laminate;
- chiploads from Whiteside, Vortex, CMT, Kyocera SGS or Precise Bits;
- a 6 mm bit's chipload from a bit maker: only Rennie, a reseller, gives one, so Sawhorse lists it but gives no starting value;
- bits other than 1/8 in, 1/4 in and 6 mm: Sawhorse carries only those chart rows;
- the up-cut length of a short (mortise) compression bit, the kind for shallow dados;
- the cutting lengths of Carbide 3D's #201, #251 and #102;
- the DeWalt DWP611's collet sizes, and which of its dial settings goes with which use;
- a VFD spindle's speeds, or a derating for one;
- a bit maker's ramp angle, stepover, or ratio of end mill to hole for wood;
- a percentage by which to derate a bit maker's chart for a hobby machine;
- an HPL chipload from Onsrud or Amana (the HPL factor is Rennie's alone).

## Test cuts: prove the setup before the real sheet

One wrong number in the setup costs a whole cabinet: a dado 0.1 mm tight in every joint, runner holes 3 mm off, a machine that cuts 0.3% short. Each of these shows on a small piece as plainly as on a cabinet. The cabinet panel's **9 · Test cuts** makes four such pieces from the settings you will cut with.

A test proves something only if it is made the way the cabinet is made, so:
- the **mini drawer** and the **mini door** are cabinets, planned by the generator from your settings. Only what makes them smaller is changed: the width, the height (and the door's depth), one drawer or one door, no toe kick, no nailers, two stretchers for a top where they fit. The mini drawer keeps your cabinet's runner and depth, so its runner holes, its box and its hook holes are your cabinet's, coordinate for coordinate.
- the **machine check** and the **joint ladders** are coupons: each dado is sized by the rule the cabinet's dados are (the stock plus **Joint clearance**), as deep as the cabinet's, and reaches the DXF on the same layers.
- a test the generator would refuse is refused, with its message.

### What each one costs, against a cabinet

For a Base · door and shelf and a Drawer base · 3 drawers with the starting sizes in an inch document (metric sizes in brackets). "Plywood" is the area of the parts, before the waste between them; a 4 x 4 sheet is 16 sq ft.

| Test | Size | Parts | Plywood | Against a cabinet | Proves |
|---|---|---|---|---|---|
| Machine check | 4 x 4 in (100 x 100 mm) | 1 | 0.11 sq ft | 0.4% of a Base (30.1 sq ft) | the machine's travel, its squareness, the bit's real diameter, Z zero |
| Joint ladders | 7.44 x 4.16 in, and two 4.94 x 4.16 in (188.5 x 103 and 128.5 x 103 mm) | 3 | 0.50 sq ft | 1.7% of a Base | the joint clearance in the sheets you will cut |
| Mini drawer | 10 x 4 3/4 x 23 1/4 in (250 x 120 x 560 mm) | 12 | 6.0 sq ft | 14% of a Drawer base (42.1 sq ft) | the runner's holes, the box's size, the rear hooks, the locking devices |
| Mini door | 12 x 10 x 5 in (300 x 260 x 130 mm) | 7 | 3.3 sq ft | 11% of a Base | the hinge cups and plates, the reveal, the shelf pins |

All four come to 9.9 sq ft of parts: under two thirds of one 4 x 4 sheet, against 30 sq ft for one Base and 42 for one Drawer base. The sizes follow your settings (the mini drawer is as deep as your cabinet), and the panel says each test's own figure against the cabinet it is showing.

### The order that saves the most

1. **The machine check, on scrap MDF.** Nothing else is worth cutting until the machine moves true, the bit is the size the CAM program thinks and Z is zeroed where the depths are measured from.
2. **The mini door and the mini drawer, in cheap MDF, for function.** Where the hinge cups, plates, runner screws and hook holes go does not depend on the sheet. Buy the hardware first: two hinges and plates, four shelf pins, the runner pair and its locking devices.
   - The tests are drawn at the thicknesses in **4 · Materials**, and MDF is rarely the thickness of your plywood (the panel starts at 23/32 in, 0.719 in, for "3/4" plywood): measure it. Cut from thicker MDF as drawn, the dados are too tight. So, with no cabinet selected, type the MDF's measured thicknesses, add the tests, then type your plywood's back before the next cabinet. Or cut these two from plywood offcuts.
3. **Then only the joint ladders, in the real sheet goods.** Sheet thickness varies by sheet and by lot, and the clearance is the one number that must be found in the sheets you will cut. The strip left after breaking a sheet down for the bed is free test material.
4. **Cut the ladders again when a new lot of plywood arrives.**

### Add a test, and cut only the tests

1. Open **9 · Test cuts** and pick the test. The panel says what it proves, the stock to cut it from, what to measure with the value expected and what to change when it is off, then lists its cuts (for the mini drawer and door, the generator's own rows from **8 · Cuts and holes**) and how much plywood it is against the cabinet the panel shows.
2. Click **Add the … to the model**. The test goes beside the model as its own assembly, named like **Test cuts · Mini drawer**, on the tag **Test cuts**, in one undo step. Its parts are on the cabinet's materials (Cabinet plywood, Drawer box plywood and so on), so they nest on the same sheets. The selection stays where it was, so the panel keeps the cabinet it was showing.

A test nests with everything else in the model. To choose:
- **One test alone** (the joint ladders for the real sheets, say): hide the cabinets, the base frames and the other tests (select them in the Outliner, right-click, **Hide**), then tick **Visible only** at the top of the Cut list. Nesting and **CNC files** then take only what is shown. Show the rest again afterwards.
- **A test cut from MDF:** its parts are on the cabinet's plywood materials, so they nest on your plywood sheets. In **Stock…** add your MDF sheet at its measured thickness, then select the test's rows in the Cut list (**By assembly** puts them under the test's name), right-click, **Stock / material…**, and pick the MDF sheet.
- **Only the cabinets:** in the Tags pane, click the eye of **Test cuts**, and tick **Visible only**.

With **Visible only** off, hidden parts are nested too. A test is not rebuilt when the settings change: delete it and add it again.

### Machine check

A 4 in (100 mm) square of carcass stock, cut out by its outside profile, with a slot one bit wide and 2 in (50 mm) long, cut in one pass, 1/8 in (3 mm) deep, and a 1 1/4 in (30 mm) square pocket 1/4 in (6 mm) deep. Cut it from any flat scrap at least 5 x 5 in (130 x 130 mm). It is drawn in Cabinet plywood at the carcass thickness, so it nests on that sheet: type the scrap's measured thickness as the CAM job's.

The slot is on a pocket layer of its own (`POCKET_3.18MM`, `POCKET_3MM` in a metric document). Pocket it with your bit: being exactly one bit wide, it is one pass. If the CAM program makes no toolpath for a shape as wide as the tool, cut this slot as a profile on its centre line. That is for the slot only: never cut a joint ladder that way, since every dado would come out one bit wide and the pick would mean nothing.

Measure in this order:

| Measure | Expected | If it is off |
|---|---|---|
| The slot's width, with calipers | the **Bit diameter**: 0.250 in (6.35 mm); 6 mm in a metric document | The slot is your bit's real cutting width, runout included. Type it as the CAM tool's diameter and as **7 · CNC** > **Bit diameter**, then cut the square again before you judge it. |
| The square, the side along X and the side along Y (mark which ran along X before you unclamp it) | 4.000 in (101.6 mm); 100 mm | For gross errors only. 25.4 times too big or too small: the CAM program's units. Several millimetres off: the CAM job's units or scale, or the machine (its belts or drive); check them with your machine maker's support documents (Carbide 3D's for a Shapeoko). An outside profile cut with a tool diameter typed larger than the bit's comes out larger by the difference, so settle the slot first. A small difference at 100 mm is measurement and the bit's deflection, not scale: do not change the machine's calibration from it. |
| Both diagonals | 5.657 in (143.68 mm); 141.42 mm; the two equal | Unequal by clearly more than you can measure: the axes are not square. Each 0.1 mm between the diagonals is 0.033 in (0.85 mm) out of square across a 4 ft sheet (0.86 mm at 100 mm): square the machine as its maker's documents say. |
| The pocket's depth, with a depth gauge from the top face | 0.250 in (6.35 mm); 6 mm | Z zero. Zero Z on the top of the stock for pockets, or, with Z zeroed on the bed, type the stock's measured thickness in the CAM job: a depth off by x means a thickness off by x. |
| The slot's depth | 0.125 in (3.18 mm); 3 mm | As the pocket. |

**The scale on a long cut.** A 100 mm part cannot show a scale error smaller than you can measure on it. To check the scale, measure a cut of 500 mm or more against the file: the mini drawer's sides are your cabinet's depth (23 1/4 in, 590.55 mm, with the starting sizes), and its measurement table lists their length.

The squareness figure is geometry: the difference between the diagonals of a square, divided by a diagonal, is how far out of square the axes are per unit of length.

### Joint ladders

One coupon per joint whose stock differs:

| Coupon | Cut from | Tried with | Dados | Made when |
|---|---|---|---|---|
| Dado ladder | the carcass sheet | an offcut of the same sheet | the carcass stock plus each step, **Dado depth** deep | **Joinery** is Blind dados. With Dowels or Confirmat screws the panel says a ladder proves a dado's clearance and does not apply to their holes. |
| Back groove ladder | the carcass sheet | a piece of the back plywood | the back stock plus each step, **Groove depth** deep | **Back** is In a groove and the back's inset from the rear edge is not 0: **Back inset**, or with **Rear nailers** at least the nailer's thickness plus the clearance, so never 0 (at 0 the groove is a rabbet: nothing to fit) |
| Drawer bottom ladder | the drawer box sheet | a piece of the back plywood | the back stock plus each step, half the box stock deep, at most 1/4 in, as the drawer's groove | always |

Each has five dados at five clearances a step apart: one under **Joint clearance** and three over it, 0.004 in apart in an inch document (0.004, 0.008, 0.012, 0.016, 0.020 in at the starting 0.008) and 0.1 mm apart in a metric one (0.1 to 0.5 mm at the starting 0.2), moved to stay within the panel's 0 to 1 mm. The panel lists every dado's clearance and width.

The labels are on the LABELS layer, which is not cut, so the wood names each dado: the dados run 2 in (50 mm) in from the coupon's rear edge and stop behind a strip, and in front of dado *k* are *k* round dimples, 1 mm wider than the bit and 2 mm deep. Dado 3 is the one with three dimples whichever way the coupon lies. The dimples are on a drill layer of their own (`DRILL_D7.35MM_2MM` with a 1/4 in bit, `DRILL_D7MM_2MM` with a 6 mm one): drill them with the same bit, or pocket them. Where a dado would be as wide as a dimple, the dimples are made a little wider than the widest dado instead.

**The bit for each ladder.** A dado narrower than **Bit diameter** cannot be cut with that bit, as **8 · Cuts and holes** says for the cabinet's own grooves (**Change bit**). With the starting inch sizes the back groove and drawer bottom ladders' dados are 0.223 to 0.239 in wide, under a 1/4 in bit. The panel names each such ladder and the bit it needs ("narrower than 0.223 in (dado 1): 1/8 in (3 mm) is"). Cut their pocket layers with that smaller end mill, its diameter typed in the CAM program, as pockets.

1. Cut the ladders from the real sheets, as the cabinets will be cut.
2. Slide the mating stock into each dado. Under **Which dado fits**, pick for each ladder the dado it goes into with hand pressure: no mallet, no wobble.
3. When the ladders agree, click **Set Joint clearance to …**. With a cabinet selected it goes to that cabinet, rebuilt with it in one undo step; with none, to new cabinets. Cabinets already made keep their own: select each and set it in **7 · CNC**. A cabinet that is not rebuilt from the panel (made by an older version, scaled by hand), or whose rebuild the generator refuses at that clearance, keeps its build, and the message says so and why.

**A dado that fit is a width.** Each pick names a dado by the width it was cut at, and the clearance is that width less the mating stock as **4 · Materials** says now. Measure a sheet again and retype it, and the clearance follows: a dado cut 23/32 + 0.012 = 0.731 in wide that fits is a clearance of 0.006 in over a carcass retyped as 0.725 in. The panel says when a stock has changed since the ladders were cut. A clearance under 0 or over 1 mm is held to the panel's limit and said as a warning: measure the sheet again.

What else the ladders say:
- **They disagree** (the dado ladder fits at 0.012 in, the back's at 0.008): one clearance serves every dado and groove, so the difference is in the stock. Measure the sheets again, type what they measure in **4 · Materials**, and cut the ladders again. The two back-plywood ladders try the same stock in grooves of the same widths, so they should agree; when only those two disagree, the panel points at the two jobs' groove toolpaths (the bit, its diameter in the CAM program, Z zero), not the stock.
- **All too tight** or **All loose**: the sheet is thicker or thinner than you typed by more than the steps reach. Measure it again and cut the ladder again.
- **Every dado wider (or narrower) than listed by the same amount**: the bit is not the size the CAM program thinks (the machine check's slot).

The last ladders added are kept in the document as cut (each dado's width and the mating stock then), with the assembly they were added as. A pick names the dado that was cut even after the clearance or the stock has changed; the panel says when the ladders in the model were cut at other steps than Add would make now. Undo the Add or delete the ladders, and the picks no longer name them: the panel says no ladders were added and names the dados Add would make.

### Mini drawer

One drawer with your cabinet's runner (with **Length** on Automatic, the one your cabinet's inside depth takes), depth, catalogue, stock, clearance, front and pulls, in the narrowest and shortest opening the generator accepts: Blum's locking devices need 170 mm inside the box, and the box at least 60 mm tall. A cabinet with no drawers is planned with a drawer to find the runner. Blum sizes the box from the opening (inside, the opening less 42 mm), so a narrow box tests the same fit. For a Drawer base with the starting inch sizes it is 10 x 4 3/4 x 23 1/4 in on a 563H5330B (21 in) runner; in millimetres 250 x 120 x 560 on a 560H5200B (520 mm).

| Measure | Expected | If it is off |
|---|---|---|
| The runner | the part number the panel names, your cabinet's | Buy that one: another length has other screw holes and another box. |
| The drawer box's outside width | as the panel says (the opening less 42 mm, plus two sides) | Tight or loose on the runners: measure the drawer box stock again (**4 · Materials**). |
| The box's length | the runner's length (Blum Inc.), or the runner less 10 mm (Blum Europe) | The CAM job's scale (the machine check). |
| The box's height | the opening less Blum's deduction (21 mm for TANDEM 563H), rounded down | |
| Each side's length (a long cut: the machine's scale) | your cabinet's depth | Off by more than you can measure: the CAM job's units or scale, or the machine (its belts or drive); check them with your machine maker's support documents. |
| The runner screw holes and rear hook holes | the rows the panel lists, from **8 · Cuts and holes** | X and Y zero, or the scale (the machine check). With inset fronts the runner screw holes are listed and not drilled: place the runners by Blum's inset setback, by hand. |
| The drawer in its runners | runs in and out freely, closes fully, the front's gaps even | Fit the locking devices and adjust them as Blum's instructions say. |

### Mini door

One door with your front type (overlay or inset), gap, boring distance, hinge inset (**From top, bottom**), pull and hinge side (a pair's left door), and one adjustable shelf on pins. It is 12 in (300 mm) wide, or your cabinet's width if that is less, so a hand and a screwdriver reach the plates; then as short and as shallow as the generator accepts with two rows of pins, so the shelf sits on four. For a Base · door and shelf with the starting sizes it is 12 x 10 x 5 in (300 x 260 x 130 mm).

| Measure | Expected | If it is off |
|---|---|---|
| Each hinge cup's centre from the door's hinge edge | 17.5 mm plus the **Boring distance**: 22.5 mm at 5 mm | The door turned or mirrored in the CAM program, or X and Y zero. |
| The cups' depth | 13 mm | Z zero or the CAM job's thickness (the machine check). |
| The cups' centres from the door's ends | **From top, bottom**, unless **8 · Cuts and holes** says one moved to clear a rail | Off at both ends the same way: the door turned end for end. |
| The mounting plate holes (overlay) | 5 mm, 11.5 mm deep, 32 mm apart, 37 mm from the side's front edge. With inset fronts they are listed and not drilled: place the plates by Blum's inset tables | X and Y zero. |
| The gap round the closed door | where the planned door's edge is: overlay, half the reveal gap at each edge of the cabinet, or more where the hinge cannot reach that far over the side (the panel gives the planned figure); inset, half the gap all round | Even but wrong (overlay): the boring distance; the Overlay row says which matches. Uneven: the hinges' adjusting screws. |
| The shelf pins | a 5 mm pin pushes in by hand and the shelf sits flat on four | The end mill that bores the 5 mm holes is not the size the CAM program thinks. |

The test door is made tall enough that no hinge cup is moved off its place to clear the other (a cup moved on the test door but not on yours would prove nothing); only when no height it tries (up to 4 ft over the shortest, or your cabinet's height) does that is a moved cup accepted, and the panel's cuts list then says which moved and why. On a door this short the top and bottom hinges are closer together than the door is wide, and **8 · Cuts and holes** marks it **Check**, as Blum asks for more.

The panel's cuts list for the mini drawer and door is the generator's own, with its last column: what is drilled, and what is listed and not drilled (inset hinge plates and runner screws), and why. What a test proves and what to measure follow what is drilled.

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

## Shopping list and pricing

**Shopping list ›**, beside **Nesting ›** at the bottom of the Cut list, opens what to buy for the whole model, with your prices.

### What it lists

| Group | Where the numbers come from |
|---|---|
| **Sheet goods** | The nesting: the sheets it lays the parts out on, one row per stock and material. The track saw's 4 x 8 sheets are marked **track saw**. Parts the nesting puts on no stock are not in the list; a line says how many. |
| **Solid lumber** | The nesting's boards, with their board feet (on the nominal thickness, as the yard sells them). |
| **Edge banding** | What each part carries by the metre: the Cabinet generator adds it to each part it bands ([Edge banding](#edge-banding)), with its waste. With none, the group says so. |
| **Hardware** | What each part carries, times how many of that part there are. Items with a part number are added up by part number; the rest by their words. |
| **Tools** | A drilling template and its tool set: one each, however many cabinets need them. Shown only when a part asks for one. |

The hardware rides on the parts, in the model. So a copied cabinet doubles its hardware and a deleted one takes it away. Exploding a part (a door component) moves its hardware onto its solid, and the status line says so; nothing bought is dropped. A part you untick in the cut list (left out of the totals) still brings its hardware while **Count hardware on parts left out of the cut list** is ticked (the default: a missing hinge is worse than a spare), and a line names those parts. With **Visible only**, hidden parts and their hardware are left out. A copy scaled or mirrored by hand keeps the original's hardware: a line names it ("scaled copy: hardware counted as the original's; check the hinge count").

While a change is being nested again, the sheet and board rows are greyed and say so; if the nesting fails, the reason is shown above the list even though the older sheets stay on screen. The list's **CSV** is off until the cut list and the nesting are both of the model as it is, so a file never mixes hardware from one moment with sheets from another. The nesting is worked out only while the Nesting or Shopping list section is open, three quarters of a second after the last change when only the Shopping list is (a run of edits is nested once).

### The hardware the Cabinet generator puts on each part

Part numbers are only those printed in Blum's catalogues. Anything Blum does not number is named in words.

| Part | Each copy carries |
|---|---|
| A door | Its hinges, the planner's own count from Blum's chart (the "N hinges" row): CLIP top BLUMOTION 110° screw-on, **71B3550** for an overlay door, **71B3750** for an inset one. **6 · Hardware** > **Hinges** > **Self-closing** names **71T3550** / **71T3750** instead; the holes are the same. One mounting plate per hinge: where the plate's holes are drilled (overlay doors, holes on) and the Overlay row settles on a 0 mm plate, **173L8100** (Blum Inc.) or **175L8100** (Blum Europe), with pre-mounted system screws; otherwise (an inset door, holes drilled by hand, another plate height) the plate is named in words. Two screws per hinge, cup to door: **606N** (#6 x 5/8 in, Blum Inc.) or **609.1700** (3.5 x 17 mm, Blum Europe). A pull and its two screws, when the door has a pull. |
| A drawer front | The runner pair (the length the planner picked, e.g. **563H5330B**). Blum Inc.: a right and a left locking device (**T51.1901 R** and **L** for TANDEM, **T51.7601 R** and **L** for MOVENTO), four **606N** screws for them, and one **662.1150.HG** system screw per drilled runner hole. Blum Europe: **T51.1700.04** or **T51.7601**, ordered left and right, and the screws in words, as Blum's instructions give (Blum names a 14.5 mm system screw for the 560H but no hole depth for it, and the holes here are 13 mm deep). A pull and its two screws, when the front has one (not a finger notch). A trash pull-out's bins, in words with the sizes from the maker's drawing (no order number). Once, on the Tools list: the drilling template (**T65.1600.01** with drill bits **DB-2.5mm** and **DB-6mm**, or **T65.1000.02** in Europe) and tool set **T65.9000**. |
| A loose shelf | Four 5 mm shelf pins (Blum sells none: buy the ones that fit a 5 x 10 mm hole). |
| A top, bottom, stretcher or fixed shelf (Dowels or Confirmat screws) | Both its joints' fasteners: 8 mm dowels in words, or Häfele's self-countersinking Confirmat connector **264.44.190** (7 x 50) or **264.44.194** (7 x 70) ([Joinery](#joinery-dowels-and-confirmat-screws)). |
| A banded part (banding on) | Its band by the metre, with waste: "Edge banding, 1 mm x 15/16 in", one item per band it takes. |

The hardware is listed whether or not **Drill hinge, runner and pull holes** is on: a door needs its hinges either way. With inset fronts or holes off, the plates and the runner screws are named in words, because their holes are not drilled here.

### Prices

Every price field starts empty. Sawhorse ships no prices.

- Type what you pay in a row's field, the way your browser's language writes numbers: in US English "1,250.50", in German "1.234,50". A number that could be read two ways ("1,25" in US English: 1.25 or 125?) is refused with how to write it, never guessed. Sheets are priced per sheet, lumber per board foot of the boards you buy, hardware per piece or pair.
- A row with no price says **price not set**. It is left out of the total, never counted as 0. Under the totals, a line names every row the total leaves out.
- **pack** (hardware) is how many pieces or pairs come in a pack; the price is then per pack. **roll** (banding) is the metres in a roll. Empty: sold singly, or by the metre. Blum gives no pack sizes, so none is filled in.
- **Prices in** is the currency (a three-letter code: USD, CAD, EUR). It starts from your browser's region when that is a common one; empty writes plain numbers. Money is written the way your browser's language writes it.

**Overage.** Each group has an overage percentage, added to what the parts need before rounding up, so it buys more only when it reaches past the next whole sheet, pair or pack (10% on 24 pins in packs of 50 is still one pack). It starts at 0% for sheet goods (the nesting's sheet count is exact; add overage for spares or mistakes), 20% for lumber, 5% for banding (Microvellum's default, not a standard: its edgeband report adds 1 in per banded side, which the Cabinet generator's parts carry, then 5%) and 0% for hardware. These are assumptions, not facts: set your own. Tools have no overage.

**Rounding.** What you buy is rounded up to what can be bought: whole sheets and boards, whole pairs, whole packs, whole rolls. Banding by the metre is rounded up to the next centimetre. A row says what it needs and what to buy ("Needs 3 sheets · buy 4 sheets (10% over; 3 sheets without)").

**Totals.** Two tiles: the total with the overage, and without it. Both count priced rows only. Each row's cost is rounded to the cent and the totals add those, so a saved list adds up.

**Labour you saved (for fun).** Hours times an hourly rate. It is not in the total.

### Where the prices are kept

Prices, pack sizes, overage, currency and the labour line are your shop's, not the model's. They are kept on this device (the browser's storage) by stock and material, part number or item, so the same prices serve every model. Typing a price never changes the model: no undo step, no unsaved mark. A private window, or cleared site data, forgets them.

### Files

- **CSV** (in the list's header) saves every row (a cell that a spreadsheet would run as a formula, such as a name starting with "=", is written with a leading ' so it shows as text; every CSV Sawhorse writes does this): group, item, part number, material, needed, overage, to buy with and without it, unit price, price per, cost with and without overage, the parts it rides on, and notes. Then the total, the rows it leaves out, and the labour line. Money is written as plain numbers; the header names the currency.
- With the Shopping list open, the Nesting **PDF** booklet has a shopping list page after its summary.

## Dialling in: what to change when something is off

| What you see | What to change |
|---|---|
| Joints too tight, parts need a mallet | Cut the [joint ladders](#joint-ladders) in that sheet and **Set Joint clearance** to the dado that fits. Re-measure the plywood first: **4 · Materials**. |
| Joints sloppy | The same: the joint ladders, or re-measure the plywood. |
| A part the wrong size, or holes in the wrong place | The [machine check](#machine-check): the machine's travel, the bit's diameter in the CAM program, and Z zero. |
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
| A banded part too big or too small with its band on | The band is not the thickness typed: measure it with calipers and type it (**10 · Edge banding** > **Thickness** > **Measured: type it**). With an edgebander, check **Edgebander pre-mill** against what yours takes off. |
| A hinge cup too near or too far from a banded door's edge | The same: the cup is placed from the finished edge, so a band thicker than typed moves the edge, not the cup. |
| The base frame splits into short ladders | Raise **Longest piece** for a bigger bed, or use **long rails on the track saw**. |
| The base frame does not match the row | Select it and click **Fit to the row again**. |

## What is kept with the model

- The Cabinet generator keeps each cabinet's and base frame's settings inside the `.shz`, so you can select one next week and edit it.
- Settings are kept as what differs from a fixed baseline, so a big kitchen fits in the 64 KB a plugin may keep in a model. Settings for cabinets you deleted or replaced are dropped first when room runs short; settings for cabinets still in the model are never dropped. If the store is still full, the cabinet is made anyway and a warning says it will not be editable as a cabinet.
- Settings saved by earlier versions of the plugin still load.
- A model can come from anyone, so everything read back is checked before it is used. An entry that does not make sense is ignored.
- The stock library, the nesting settings (kerf, trim, CNC spacing, the track saw) and per-part grain are saved with the model too.
- The cabinet panel's last settings are kept for the next cabinet. The **By assembly** choice is kept on this device.
- **CNC setup** (your machine, router and bits, and the profile bit) is kept on this device, not in the model.
- The clearances of the last joint ladders added are kept in the model, so the ladders' picks name the dados that were cut.
- The hardware each part takes (its `bom`, [format.md](format.md#part-attributes-cut-list)) is saved on the part in the model, so the shopping list counts copies and deletions. It is not in the plugin's 64 KB store, where it could be dropped.
- Shopping list prices are kept on this device, not in the model.
- A cabinet's end panels, fillers, openings, skin, sink and microwave settings are kept with its other settings; a cabinet that uses none of them stores nothing for them. A base frame's skin is kept with the frame.
- A cabinet's edge banding settings are kept with its other settings. Each banded part's band, by the metre, is in its `bom` in the model, as the hardware is.

## Limits

- No walls or room outline. A corner is a dead corner with a filler; there is no blind-corner cabinet.
- Appliance openings are space: no appliance is drawn, and a fridge's or a range's own size is not known. The countertop is not modelled: a dishwasher's height is checked against the tops of the cabinets beside it.
- End panels, fillers and skins are not drilled for their screws, and a scribe is cut by hand.
- Hand work is a list, not a drawing.
- The track saw's sheet is 4 x 8 (1220 x 2440 mm).
- Only System 32 screw holes are drilled. Blum's chipboard-only holes and the locking devices' pilot holes are listed for drilling by hand.
- With inset fronts, hinge plates and runner screws are listed, not drilled.
- Adjustable shelves get a band of pin holes around each shelf (five holes) to start; **Full height** follows Blum's 775 mm drawing, generalised by Sawhorse to other heights.
- Dowels and Confirmat screws: the rails' end holes are listed for a jig, never cut. The dowel depths are one Häfele product's; Confirmat spacing and pilot depth were not found in a maker's document. Joints deeper than 24 in are refused (Häfele gives no dowel count past it).
- A base frame's dado clearance is fixed at 0.008 in (0.2 mm): it has no field.
- A dado that runs out of a part is cut square only when the parts have a gap between them and the sheet has a margin.
- Feeds and speeds are starting points from published charts, for 1/8 in and 1/4 in bits (and a reseller's 6 mm row), in MDF, laminate on MDF and Baltic birch. One machine is built in, the Shapeoko 5 Pro 4×4; another is typed in as **Custom**.
- A test cut is not rebuilt when the settings change, and is not edited as a cabinet: delete it and add it again. Nesting only the tests, or only the cabinets, takes hiding the others and **Visible only**.
- The shopping list names no screw part numbers for Blum Europe's runners and locking devices (the pages read give none for the holes drilled here).
- Edge banding: drawer boxes are never banded; fillers and skins are not banded; a finger notch cannot be banded. The Cut list lists a banded part at its cut size and does not say which edges are banded or the finished size: the cabinet panel does. Part labels name the bands a part carries, not which edges.
- Hardware is put on parts, never on a whole cabinet: a cabinet is an assembly, and the cut list counts its parts.
