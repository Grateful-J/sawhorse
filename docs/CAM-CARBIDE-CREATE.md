# Carbide Create: cutting Sawhorse's CNC files

This guide takes the DXF files that **CNC files** saves ([CNC cabinets](CNC-CABINETS.md#save-the-cnc-files)) through Carbide Create and Carbide Motion to a Shapeoko. It is written for Carbide Create V7 and later (Core or Pro), on a Mac or on Windows. Read [Set up the CAM job](CNC-CABINETS.md#set-up-the-cam-job) first: it says what each layer is, where Z is zeroed, which face is up and why some dados run past their part's edge. This guide says where those things are done in Carbide Create.

**Where every statement comes from.** Every program behaviour, menu name, build number and limit below comes from [the research report](research/cam-programs-sources.md) (2026-11-14), at the confidence it gives. The report's section is given in brackets, as (§ 1b).
- A statement with no mark comes from Carbide's own guides, product pages or blog.
- **Check on your screen** marks a statement that comes only from a Carbide staff member's post or personal docs, a line in Carbide's changelog, or a user forum. It says what to look for before you trust it.
- **Not known** marks something the report looked for and did not find. It does not mean Carbide Create cannot do it.
- Statements about Sawhorse's files come from its code (`src/nesting/dxf.ts`, `src/nesting/machine.ts`) and its tests.

This guide gives no feeds, speeds or depths per pass. Those are in **CNC setup** > **Feeds** ([Feeds, speeds and your bits](CNC-CABINETS.md#feeds-speeds-and-your-bits)).

A wrong click in a CAM program can ruin a sheet. Before the first full sheet, toolpath and cut one small part from an offcut ([Cut one small part first](CNC-CABINETS.md#7-cut-one-small-part-first)).

**Contents**
1. [The builds you need](#the-builds-you-need)
2. [Core or Pro](#core-or-pro)
3. [Templates and layer names: the safety rule](#templates-and-layer-names-the-safety-rule)
4. [Make the template once](#make-the-template-once)
5. [Each sheet](#each-sheet)
6. [Hold the parts down](#hold-the-parts-down)
7. [Holes and pockets](#holes-and-pockets)
8. [FLIP_ layers: cuts in the other face](#flip_-layers-cuts-in-the-other-face)
9. [Save the G-code](#save-the-g-code)
10. [The LABELS layer](#the-labels-layer)
11. [Comparison fixtures: Carbide's G-code for a test DXF](#comparison-fixtures-carbides-g-code-for-a-test-dxf)

## The builds you need

On 2026-11-14 the current builds were Carbide Create 876 (stable, 2026-10-12) and 881 (beta), and Carbide Motion 667 (stable, 2026-08-01) and 704 (beta) (Versions in scope). The download page is titled "Download Carbide Create V8".

| What this guide uses | Needs | Source |
|---|---|---|
| Toolpaths linked to a layer, recalculated when the layer's contents change, with depths that can be expressions in the stock thickness `t` | Carbide Create V7 or later, Core or Pro | Carbide's V7 blog (§ 0.2, § 3) |
| DXF layers kept as layers of the same name: the import option **Insert layers from File** | Carbide Create build 839 or later | Carbide staff posts, Feb and Jun 2026 (§ 0.2, § 1b). **Check on your screen.** Before build 839, Carbide Create put the whole DXF on one layer, and no template can work. |
| The **Cutout** toolpath with a **Breakthrough** value | Build 843 or later; build 855 fixed its start-depth and breakthrough fields | Changelog (§ 4). **Check on your screen.** Build 855's note says "Existing files may need the values reset": a template made before 855 needs those two values typed again. |
| Saving the G-code to a file from Carbide Motion | Carbide Motion 565 or later | Carbide Motion product page and the V7 blog (§ 8b) |
| **Send to Carbide Motion** | Carbide Create beta build 878 or later and Carbide Motion 702 or later | Changelog (§ 3). On 2026-11-14 both were beta builds only: stable Carbide Motion 667 is older than 702. This guide does not need it. |

So the stable builds of 2026-11-14, Carbide Create 876 and Carbide Motion 667, have everything this guide uses.

## Core or Pro

Sawhorse's files work in Core: "SVG and DXF import" is in both (§ 1b). These differences matter for cutting them:

| Feature | Core | Pro | Source |
|---|---|---|---|
| DXF import | yes | yes | Carbide's Core vs Pro page |
| Toolpaths linked to layers | yes | yes | V7 blog |
| Ramped entry for contours and pockets | no | yes | Core vs Pro page |
| Climb or conventional for contours | no | yes | A Carbide staff member's own docs. **Check on your screen.** |
| Climb or conventional for pockets | no | yes, from build 859 | Changelog. **Check on your screen.** |
| Stock to Leave | no | yes | A Carbide staff member's own docs. **Check on your screen.** |
| Offset or raster pocket type | no | yes | The same docs. **Check on your screen.** |
| Save standard G-code from Carbide Create | no: Core keeps the G-code in the `.c2d` file for Carbide Motion | yes | Core vs Pro page, Pro page (§ 8b) |
| Nesting | no | yes, "a work in progress" (build 840) | Changelog (§ 10). Sawhorse nests the parts already: you do not need it. |

A forum thread adds that Core has no climb or conventional setting at all (§ 4; the report saw it in search results only). **Check on your screen.**

## Templates and layer names: the safety rule

Sawhorse puts the depth of every pocket and hole in its layer's name: `POCKET_6.35MM` is a pocket 6.35 mm deep, `DRILL_D5MM_10MM` a 5 mm hole 10 mm deep. A template's toolpath is linked to one layer name, so a template knows only the layers it was built with.

A new layer name appears whenever a depth or a hole size changes:
- **A metric document.** Its dados and grooves are 6 and 8 mm deep (`POCKET_6MM`, `POCKET_8MM`), not 1/4 and 5/16 in (`POCKET_6.35MM`, `POCKET_7.94MM`), and its pull holes are 5 mm (`DRILL_D5MM_THRU`), not 3/16 in (`DRILL_D4.76MM_THRU`).
- **A new joint depth:** **5 · Construction** > **Dado depth** or **Groove depth**, or a base frame's **Dado depth**.
- **A new drawer-box stock.** A drawer bottom's groove is half the box's thickness deep, and at most 1/4 in. Boxes of 15/32 in plywood give `POCKET_5.95MM`; boxes of 1/2 in give `POCKET_6.35MM`.
- **A new pull hole:** **3 · Fronts and pulls** > **Pull hole**.
- **A cut in a part's other face:** `FLIP_` in front of the name ([below](#flip_-layers-cuts-in-the-other-face)).

No template toolpath picks up a new name. That is on purpose: a depth meant for another layer is never applied to it without you seeing it. The price is one check after every import:

**After every import, every layer except `STOCK` and `LABELS` must have a toolpath.** A layer with shapes and no toolpath is a cut that will not be made. Make its toolpath, at the depth in its name, before you save the G-code.

Two more things the names do not tell you:
- **The sheet's thickness is in no name.** The through cuts (`PROFILE_THRU`, `CUTOUT_THRU`, the `_THRU` holes) take their depth from the job's stock thickness. Type each sheet's measured thickness in its job.
- **One name can need two bits.** A name gives the depth, not the width. In a metric document the dados (18.2 mm wide) and the drawer bottoms' grooves (6.2 mm wide) are both on `POCKET_6MM`, in different files. A bit wider than a groove cannot cut it: check that every shape on the layer gets a path.

**The layers the starting cabinets produce.** Each **Start from** cabinet, with a new cabinet's settings, through **Use 4 × 4 plywood**, **CNC spacing**, **Track saw what won't fit** and **CNC files**:

| Layer | What is on it | Inch document | Metric document | Starting cabinets that have it |
|---|---|---|---|---|
| `PROFILE_THRU` | Part outlines | yes | yes | all |
| `CUTOUT_THRU` | Openings through a part | yes | yes | Trash pull-out |
| `POCKET_6.35MM` | Dados | yes | | all but the Tall pantry |
| `POCKET_7.94MM` | The back's groove | yes | | all |
| `POCKET_5.95MM` | Drawer bottoms' grooves | yes | | Drawer base, Base · drawer over 2 doors, Trash pull-out |
| `POCKET_6MM` | Dados and drawer bottoms' grooves | | yes | all but the Tall pantry |
| `POCKET_8MM` | The back's groove | | yes | all |
| `DRILL_D35MM_13MM` | Hinge cups | yes | yes | Base · door and shelf, Sink base, Base · drawer over 2 doors, Wall cabinet |
| `DRILL_D5MM_11.5MM` | Hinge-plate holes | yes | yes | the same four |
| `DRILL_D5MM_13MM` | Runner screw holes | yes | yes | Drawer base, Base · drawer over 2 doors, Trash pull-out |
| `DRILL_D6MM_10MM` | Drawer backs' rear hook holes | yes | yes | the same three |
| `DRILL_D5MM_10MM` | Shelf-pin holes | yes | yes | Base · door and shelf, Base · drawer over 2 doors, Wall cabinet, Open shelves |
| `DRILL_D4.76MM_THRU` | Pull holes, 3/16 in | yes | | every cabinet with doors or drawers, not the Tall pantry |
| `DRILL_D5MM_THRU` | Pull holes, 5 mm | | yes | the same |
| `STOCK`, `LABELS` | The sheet and its trim line; the tags | yes | yes | all: no toolpath |

So an inch template needs 11 toolpaths, a metric template 10. No starting cabinet has a `FLIP_` layer. The Tall pantry's router sheets have only outlines and the back's groove: its sides, door and back go to the track saw. Sawhorse's test `src/nesting/cam-layers.wasm.test.ts` makes these files and fails when a name changes, so this table is updated with the code. A base frame, a cabinet with other settings, or a mix of cabinets can add names. The table is a starting point, not a promise: the check above is the rule.

**Use the files CNC files saves.** The Nesting section's **DXF** and **DXF R12** buttons write every sheet into one file, with the outlines on a layer per sheet (`SHEET-01`), and **DXF R12** writes the point in a name as a P (`POCKET_6P35MM`). A template built from **CNC files** does not match those names.

## Make the template once

The template is a `.c2d` file with the stock set to your sheet and one toolpath linked to each layer. You open it for every sheet, so its toolpaths are made once. Carbide's V7 blog describes this use: "make template files that contain known-good machining processes where you only have to add vectors to the correct layer" (§ 3).

Do not try to make a `.c2d` any other way: its format is not published and has changed in V7 and V8 (§ 7).

1. **Start a new design** in Carbide Create.
2. **Set up the stock.** Type the sheet's width and height (1219.2 x 1219.2 mm for a 48 x 48 in sheet, 1220 x 1220 mm for a metric document's), and its measured thickness. Work in millimetres, as the files are. **Not known:** Carbide's job setup lesson is a video and its text lists no fields (§ 2). Check on your screen for the units, the size, the thickness, where the origin is (Sawhorse's files put the sheet's lower-left corner at 0,0) and where Z zero is. A forum thread mentions a top or bottom "zero height" setting, and users disagree on whether it changes the depths (§ 2). Sawhorse's depths are measured down from the top of the sheet, so choose the top.
3. **Import one of your CNC files** with the import option **Insert layers from File** (build 839 or later). Pick a file with as many of the layers you cut as you can: each layer of the file becomes a layer of that name (§ 1b). **Check on your screen:** the option is described in a staff post, not in Carbide's guides. Read every layer name in the list against the file's: the dot in `POCKET_6.35MM` must still be there. The report found nothing on whether names with a dot survive import (§ 1a).
4. **Add the layers the file did not have** (a Drawer base's file has no hinge cups): import another file the same way, or type the name exactly as in the [layer table](#templates-and-layer-names-the-safety-rule), capitals, underscores and dot included.
5. **Make one toolpath per layer, linked to the layer, not to the shapes you selected.** **Not known:** where the link is set in the toolpath's form; the V7 blog says toolpaths "can now link to a layer instead of individual vectors" and does not show the control. Check on your screen. Use this table:

   | Layer | Toolpath | Depth | Bit |
   |---|---|---|---|
   | `PROFILE_THRU` | **Cutout**, cutting outside the outlines ([Hold the parts down](#hold-the-parts-down)) | through: the stock thickness and a **Breakthrough** | your profile bit |
   | `CUTOUT_THRU` | Contour, **Inside/Left** | through: `t` plus a little | your profile bit, if it fits the opening |
   | each `POCKET_…` | Pocket | the number in the name, in mm | narrower than the groove: **8 · Cuts and holes** lists those that need a smaller bit under **Change bit** |
   | `DRILL_D35MM_13MM` | Pocket | 13 mm | an end mill smaller than 35 mm |
   | `DRILL_D5MM_…`, `DRILL_D6MM_10MM` | Pocket | the number after the diameter | an end mill smaller than the hole: 1/8 in or 3 mm |
   | `DRILL_D4.76MM_THRU`, `DRILL_D5MM_THRU` | Pocket | through: `t` plus a little | the same |
   | `STOCK`, `LABELS` | none | | |

   - **Pocket depths are fixed numbers.** Type the depth in the layer's name. Do not write a pocket's depth as an expression in `t` (the blog's example is `t/2`): Sawhorse's pocket depths do not change with the sheet.
   - **Through depths follow the sheet.** [Set the depths from the top of the sheet](CNC-CABINETS.md#4-set-the-depths-from-the-top-of-the-sheet) says to cut the measured thickness plus about 0.5 mm (0.02 in). The blog's example of a depth is `t+.01in`. **Check on your screen** that the field takes `t+0.5mm` in a millimetre design; if it does not, type the number and change it in each sheet's job.
   - **The Contour offset names** (Inside/Left, No Offset, Outside/Right) come from a staff member's own docs (§ 4). **Check on your screen.** **Not known:** the Cutout toolpath's offset choices. The report found only its Breakthrough value. If it cannot cut outside the outlines, use a Contour with **Outside/Right** on `PROFILE_THRU` instead.
   - **Hold-down and the compression bit:** see [Hold the parts down](#hold-the-parts-down).
6. **Put the toolpaths in cutting order.** Carbide Create runs them in list order, and you drag them to change it (§ 6; build 876 made the drop target clearer). Drills and pockets first, `CUTOUT_THRU` next, `PROFILE_THRU` last ([Give each layer its toolpath](CNC-CABINETS.md#2-give-each-layer-its-toolpath)).
7. **Delete the shapes, keep the layers and the toolpaths.** Select all the imported shapes and delete them. **Not known:** whether Carbide Create keeps an empty layer, and whether a toolpath keeps its link to one. Check on your screen that every layer and every toolpath is still there and still linked. If a layer is gone, type its name again and link its toolpath to it.
8. **Save** the file under a name you will not overwrite, such as `Sawhorse 4x4 inch template.c2d`. Make one template per document unit: an inch document's names and a metric document's names are not the same.

## Each sheet

Do this for every DXF, every time. Print the sheet's **job sheet** first: **CNC files** saves every sheet's job sheet in one text file after the DXFs, each named by its DXF, and the PDF has it too ([Job sheet and part labels](CNC-CABINETS.md#job-sheet-and-part-labels)). It gives the thickness to measure, a box to tick for each of the file's layers with its bit, depth and starting feeds, and the cut order.

1. **Open the template**, then save it at once under the sheet's name (the DXF's name with `.c2d`), so the template stays empty.
2. **Set the stock thickness** to this sheet's measured thickness. A carcass sheet, a drawer-box sheet and a back sheet are not the same thickness.
3. **Import the DXF with Insert layers from File.** **Check on your screen** that the shapes landed in the template's layers of the same name, and not in new layers beside them. The report found one user whose imported shapes went into his existing layer of the same name, which points to matching by name; it did not find this stated (§ 1b).
4. **Check the scale.** Measure the outer rectangle on `STOCK`: 1219.2 x 1219.2 mm for a 48 x 48 in sheet, 1220 x 1220 mm for a 1220 x 1220 sheet. If it is 25.4 times too big or too small, stop and fix the import. A user reported in 2022 that Carbide Create read every DXF as inches whatever the design's units, and build 810 says "Tweak DXF import scaling" (§ 1b). Sawhorse writes millimetres in the file's header (`$INSUNITS` 4), but the report found nothing on whether Carbide Create reads it. **Not known:** how today's build reads a DXF's units, so measure every time. **Check on your screen** where Carbide Create shows a selected shape's size.
5. **Check the position.** The `STOCK` rectangle's lower-left corner must be on the design's origin, the stock's lower-left corner.
6. **Check for open shapes.** Since build 760 the Info panel counts open vectors and offers to select, join and close them (§ 1b; Carbide's blog). Sawhorse writes every outline and pocket as a closed polyline and every hole as a circle, so the count should be 0. If it is not, do not join or close them by guesswork: find out which shape it is.
7. **Check every layer has a toolpath** ([the safety rule](#templates-and-layer-names-the-safety-rule)). Go down the layer list, and tick each layer on the job sheet as it gets one. Every layer except `STOCK` and `LABELS` must have a toolpath linked to it. A layer the template did not know has none: make one, at the depth in its name. A template toolpath whose layer is empty on this sheet cuts nothing.
8. **Recalculate.** The V7 blog says a linked toolpath "will recalculate any time the contents of that layer change". **Check on your screen** that each toolpath now shows paths over its layer's shapes, and over every one of them: a shape narrower than the bit gets no path.
9. **Check the dados that run past the outline.** Some pockets cross `PROFILE_THRU` on purpose ([Leave the dados that cross the outline as they are](CNC-CABINETS.md#3-leave-the-dados-that-cross-the-outline-as-they-are)). Their paths must run past the part's edge into the gap. Do not trim those shapes. **Not known:** how Carbide Create pockets a shape that crosses another layer's outline (§ 5). It is a closed shape on its own layer.
10. **Add the hold-down** the template cannot hold: tabs, if you use them ([Hold the parts down](#hold-the-parts-down)).
11. **Check the order**: drills and pockets, then `CUTOUT_THRU`, then `PROFILE_THRU`. The job sheet's cut order groups the layers that share a bit within that, and counts the bit changes.
12. **Save.** The G-code is kept in the `.c2d` (§ 8b). Then [save the G-code](#save-the-g-code).

## Hold the parts down

**DXF parts arrive without tabs.** Since V7, "Tabs are now a part of the vectors, not contour toolpaths... If you copy the vector, you copy the tabs too" (§ 4). A DXF's shapes have none, so nothing holds a part once the profile's last pass frees it. Pick one of these for every sheet. [Hold the parts down](CNC-CABINETS.md#6-hold-the-parts-down) says which parts need it most and where screws can go.

**1. A skin under the parts: the Cutout toolpath's negative Breakthrough.**
- The **Cutout** toolpath (build 843 or later; build 855 or later for its fields) has a **Breakthrough** value. A staff member's own docs say negative values "will be subtracted from the Stock Thickness and leave that dimension as an uncut 'onion skin'" (§ 4). Forum threads the report saw only in search results say the same, with staff saying the reference is the bottom of the material. **Check on your screen.** Before a sheet, cut a test from an offcut and look: the skin must be there, and as thick as you typed.
- The changelog does not mark the Cutout toolpath as Pro, so it appears to be in Core. **Check on your screen.**
- The skin is measured from the stock thickness you typed. A sheet thicker than typed leaves a thicker skin, and a thinner one is cut through. Type the measured thickness.
- This guide gives no skin thickness. Find one on an offcut of the same plywood.
- **Removing the skin.** **Not known:** a Carbide way to remove it. The report's suggestion, a second contour from the skin's depth to the bottom, is its own inference and is not documented (§ 4). The other way is to take the sheet off the machine and cut the parts free by hand.
- [Set the depths from the top of the sheet](CNC-CABINETS.md#4-set-the-depths-from-the-top-of-the-sheet) says to cut through into the spoilboard so no skin is left. A skin is the exception: whichever pass frees the parts in the end goes through by the same 0.5 mm.

**2. Tabs.** Add them to every part outline after each import. The Cutout toolpath has tab fields of its own (the changelog fixes their width in builds 844, 851 and 855; § 4). **Not known:** whether the Cutout toolpath puts tabs on imported outlines by itself, and what count or spacing options it has. After recalculating, check on your screen that every part's path shows its tabs. A part without them is free at the last pass.

**3. A vacuum table, or screws and clamps in the waste,** as [Hold the parts down](CNC-CABINETS.md#6-hold-the-parts-down) says.

**What only Pro does here:** ramped entry ("Ramped entry for contours and pockets", Core vs Pro page), climb or conventional cutting for contours (a staff member's docs; **check on your screen**), and Stock to Leave, which a roughing pass that leaves a little for a finishing pass needs (the same docs; **check on your screen**).

**A compression bit.** A bit reseller's guide, quoted in Sawhorse's feeds research, says: "Compression bits fail when the first pass is too shallow … take the first pass deeper than the upcut tip (usually about one bit diameter)". So a compression bit's first pass must be deeper than its up-cut section. Everything else about passes and feeds is in **CNC setup** > **Feeds**.

## Holes and pockets

**Pocket the 35 mm and 5 mm circles.** Sawhorse draws each hole as a circle at its true diameter, on a layer for its size and depth. Pocket each circle with an end mill smaller than it, to the depth in the layer's name, as [Give each layer its toolpath](CNC-CABINETS.md#2-give-each-layer-its-toolpath) says. A 1/4 in end mill cannot make a 5 or 6 mm hole.

**A Drill toolpath is not the answer for these holes on a trim router.** Carbide Create's Drill toolpaths "plunge the tool at the center of the selected geometry", with Full Depth, Peck and Peck with Full Retract, and square, ball or V end mills can be used (a staff member's docs, § 5; **check on your screen**). A plunge makes a hole the size of the bit, whatever the circle's size: a 1/8 in end mill plunged into a 5 mm circle makes a 1/8 in hole. Use a Drill toolpath only with a bit of the hole's own diameter, and only as [Give each layer its toolpath](CNC-CABINETS.md#2-give-each-layer-its-toolpath) allows.

**Islands.** In a Carbide Create pocket, "If there is nested geometry, then the pocketing algorithm will alternate between cutting and not cutting, leaving islands" (a staff member's docs, § 5; **check on your screen**). So a shape inside another on one pocket layer is left standing. Sawhorse's layers do not hold nested shapes:
- Each pocket is one closed outline, the outer edge of the floor of one cut. A pocket's own inner edges are not written (`src/nesting/machine.ts`).
- A hole in the floor of a pocket is on its own `DRILL_` layer, not on the pocket's.
- Parts never overlap, and a dado drawn past its part's edge stops short of the middle of the gap, so it never meets the next part's (`src/nesting/dxf.ts`).
- The test `src/nesting/cam-layers.wasm.test.ts` checks every starting cabinet's files, in inches and in millimetres: no shape on a cut layer lies inside, or overlaps, another shape on the same layer.

Link each pocket toolpath to one layer. **Not known:** whether a Carbide Create toolpath can link to two layers. Do not try: the outlines on `PROFILE_THRU` surround the shapes on every other layer.

**Overlapping shapes.** **Not known:** how either program pockets shapes on one layer that overlap (§ 5, "What I could not verify" 9). The starting cabinets' files have none, as above. Build 808 says "Better handling of imported DXF/SVG files with duplicated/overlapping segments" (§ 1b).

## FLIP_ layers: cuts in the other face

A `FLIP_` layer (`FLIP_POCKET_6.35MM`, `FLIP_DRILL_D5MM_10MM`) holds cuts in the face that is down while the rest of the part is cut. No starting cabinet has one ([the layer table](#templates-and-layer-names-the-safety-rule)); the status line names the parts that do.

Sawhorse draws a `FLIP_` shape where its cut is when you look down through the part from the face that is up (`src/nesting/machine.ts`). After you turn the part over, those cuts are at the mirror image of that place.

**No two-sided job was found in Carbide Create.** The report found no built-in two-sided feature in Carbide's own pages (**not known**, § 9). Carbide staff on the forum (Jan and Feb 2025) give this workaround. **Check on your screen** before you rely on it:
1. Duplicate the geometry and mirror it with **Mirror Vertical** (staff first wrote Horizontal and corrected it to Vertical). Check on your screen which way **Mirror Vertical** turns the shapes: it must match the way you turn the part over.
2. "Use the same corner for both operations": zero on the same corner of the stock for the second side as for the first.
3. Cut centred dowel holes on side 1 to register side 2. Staff add that a centred setup "doubles any alignment error".
4. Another Carbide staff member suggests cutting a flip frame, so that side 1 defines the dimensions.

Build 879 (beta) adds a **Flip Model** command that "turns the 3D model over so the back of the part can be machined... Optionally flips the selected vectors too" (§ 9). It is about the 3D model. **Not known:** whether it helps with DXF shapes.

Try a flip on scrap before a real part. A flip mirrored the wrong way puts the cut on the wrong edge.

## Save the G-code

**Carbide Create Core with Carbide Motion.** In V7 and later, "the G-code is saved into the Carbide Create design file", and Carbide Motion "loads files directly from Carbide Create" (§ 8b). Core needs no post-processor choice.
1. Save the sheet's `.c2d` in Carbide Create.
2. Open that `.c2d` in Carbide Motion.
3. To keep the G-code as a file of its own as well: Carbide Motion 565 and later "adds a button to save the G-code to an external file" (§ 8b). **Not known:** the button's label. Check on your screen.

**Send to Carbide Motion** (Carbide Create beta 878, Carbide Motion 702 or later) is a beta feature on 2026-11-14 ([The builds you need](#the-builds-you-need)).

**Carbide Create Pro.** Pro saves standard G-code itself, for any machine ("Save Standard G-code"; Carbide's Pro page, § 8b, § 8e). It uses a post-processor file that is "loaded and evaluated each time you save G-code" (§ 8e). Carbide publishes a base post, `custom-shapeoko.post`, which writes millimetres with three decimals and the `.nc` extension, and moves in straight lines only, no arcs (§ 8d). **Not known:** whether Core's built-in G-code is the same as that post's output.

**There is no command-line or batch export.** The report found none (§ 8e). Each sheet is opened and saved by hand.

## The LABELS layer

- **It may be dropped.** In Feb 2026 Carbide staff said imported text is something "we still do not support" (§ 1b). Sawhorse's `LABELS` layer is text: each part's tag and name, and the sheet's title. Expect it to be missing. **Check on your screen.**
- Nothing is cut from it. Give it no toolpath, and hide or delete it. Name the parts from the PDF's page for the sheet, or from the Nesting section's diagram.
- The sheet's title is drawn above the sheet, starting at its left edge (`src/nesting/dxf.ts`). If Carbide Create keeps it, it lies outside the stock, above it; nothing in the file lies left of or below 0,0.
- Keep `STOCK` for measuring ([Each sheet](#each-sheet), step 4), with no toolpath.

## Comparison fixtures: Carbide's G-code for a test DXF

Sawhorse's own G-code is to be compared with Carbide's on small test pieces. These steps save Carbide's G-code for one DXF, with what made it. The report suggests this route; it has not been tried end to end (§ 8d).

**These files stay on your computer and are never committed.** They are Carbide's output made on your machine with your settings, not Sawhorse's. The repository ignores a `cam-fixtures/` folder at its top for them; or keep them in a folder outside the repository. Never `git add -f` them.

1. **Make the test piece's DXF.** In Sawhorse, model or generate the small piece, nest it and click **CNC files**.
2. **Name it.** Make the folder `cam-fixtures/` at the top of the repository. Copy the DXF into it under a short name with no spaces, such as `stretcher-groove.dxf`. That name, without `.dxf`, is the fixture's name. Every file below starts with it.
3. **Make the job.** Open your template in Carbide Create and save it at once as `cam-fixtures/stretcher-groove.c2d`. Do every step of [Each sheet](#each-sheet) with that DXF, then save.
4. **Save Carbide's G-code.** Open `stretcher-groove.c2d` in Carbide Motion. Use its button to save the G-code to a file (Carbide Motion 565 or later; **check on your screen** for the label). Save it in `cam-fixtures/` as `stretcher-groove.cc<Create build>-cm<Motion build>`, with the extension Carbide Motion offers: for example `stretcher-groove.cc876-cm667.nc`. **Not known:** the extension Carbide Motion gives; keep the one it offers.
5. **Write down what made it,** in `cam-fixtures/stretcher-groove.txt`:
   - the Carbide Create and Carbide Motion builds, and Core or Pro (**check on your screen** where each program shows its build);
   - the stock size and the thickness you typed, the units, and where Z zero is;
   - each toolpath in order: its layer, its type, the bit, the depth, the Breakthrough or tabs, and any other value you changed from the template.
6. **With Pro**, you can save standard G-code from Carbide Create instead. Name it the same way with `pro` in place of the Carbide Motion build (`stretcher-groove.cc876-pro.nc`) and say so in the `.txt`. It is not known to be the same as Core's (§ 8d), so compare like with like.

Carbide also runs a web page that extracts the G-code from a `.c2d` ("drop your C2D file (From Carbide Create V7 or higher)"), for original machine owners. The page said it would be removed in Aug. 2026 and was still up on 2026-11-14 (§ 8d). It sends your file to Carbide. The steps above do not need it.
