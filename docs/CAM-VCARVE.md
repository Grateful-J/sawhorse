# VCarve: cutting Sawhorse's CNC files

This guide takes the DXF files that **CNC files** saves ([CNC cabinets](CNC-CABINETS.md#save-the-cnc-files)) through Vectric VCarve to a Shapeoko running Carbide Motion. It is written against VCarve Pro and VCarve Desktop 12.5, released 2026-09-22; on 2026-11-14 Vectric had published no V13 help. Read [Set up the CAM job](CNC-CABINETS.md#set-up-the-cam-job) first: it says what each layer is, where Z is zeroed, which face is up and why some dados run past their part's edge. This guide says where those things are done in VCarve.

**Where every statement comes from.** Every program behaviour, menu name, version number and limit below comes from [the research report](research/cam-programs-sources.md) (2026-11-14), at the confidence it gives. The report's section is given in brackets, as (§ 0.1).
- A statement with no mark comes from Vectric's own help (V12.5), its Compare page or its product pages.
- **Check on your screen** marks a statement that comes only from a staff post on a forum, from another company, from a user forum, or from the report's own inference. It says what to look for before you trust it.
- **Not known** marks something the report looked for and did not find. It does not mean VCarve cannot do it.
- Statements about Sawhorse's files come from its code (`src/nesting/dxf.ts`, `src/nesting/machine.ts`) and its tests.

This guide gives no feeds, speeds or depths per pass. Those are in **CNC setup** > **Feeds** ([Feeds, speeds and your bits](CNC-CABINETS.md#feeds-speeds-and-your-bits)).

A wrong click in a CAM program can ruin a sheet. Before the first full sheet, toolpath and cut one small part from an offcut ([Cut one small part first](CNC-CABINETS.md#7-cut-one-small-part-first)).

**Contents**
1. [Which edition, on a Mac](#which-edition-on-a-mac)
2. [Templates and layer names: the safety rule](#templates-and-layer-names-the-safety-rule)
3. [Set up the job](#set-up-the-job)
4. [Make the toolpath template once](#make-the-toolpath-template-once)
5. [Each sheet](#each-sheet)
6. [The Vector Selector: circles by diameter](#the-vector-selector-circles-by-diameter)
7. [Holes: pocket or Drilling toolpath](#holes-pocket-or-drilling-toolpath)
8. [Hold the parts down without tabs: the last pass](#hold-the-parts-down-without-tabs-the-last-pass)
9. [Double-sided jobs for the FLIP_ layers](#double-sided-jobs-for-the-flip_-layers)
10. [Choose the post-processor](#choose-the-post-processor)
11. [LABELS and STOCK](#labels-and-stock)
12. [Aside: the Advanced Machining Module](#aside-the-advanced-machining-module)

## Which edition, on a Mac

You are on a Mac and have not bought VCarve. This decides it:

| | VCarve Desktop | VCarve Pro | Vectric Spark | Carbide Create (what you have) |
|---|---|---|---|---|
| Runs on | Windows only. Vectric's FAQ mentions a Mac through Parallels, with "limited" support | Windows only | macOS | Mac and Windows |
| Job size without tiling | **25 in square** (its V12.5 help) or **24 x 24 in** (Vectric's Compare page and product text) | Unlimited | not listed | No limit found |
| A 4 x 4 sheet (48 x 48 in, 1220 x 1220 mm) in one job | **No**: about a quarter of the bed | Yes | not known | Yes |
| Toolpath templates (this guide's workflow) | No | Yes | not listed | Layer-linked toolpaths in a template `.c2d` ([its guide](CAM-CARBIDE-CREATE.md)) |
| Double-sided jobs | Yes | Yes | not listed | none found |
| What it cuts | | | Cut Out (tabs, ramps), Cut Along, Pocket, Drilling. "Gadgets are not supported... automatic tool changing is not supported." | |

Sources: § 0.1, § 9, § 10.

- **VCarve Desktop does not fit a 4 x 4 bed.** Vectric's two figures disagree by an inch. The Desktop help says: "VCarve Desktop only supports job sizes up to a maximum of 25 inches square without tiling". The Compare page says "Work area: 24" x 24"", and the product text says "Desktop editions are capped at 24"x24" without tiling". Either way, the Shapeoko 5 Pro 4x4 travels 1237 x 1237 mm (about 48.7 in). Desktop also has no toolpath templates (§ 0.1, § 0.2).
- **VCarve Pro is the edition for this bed and this guide.** It needs Windows: a Windows PC, or Windows on the Mac. The report records Vectric's "limited" support for Parallels under Desktop; **not known** whether Vectric says the same of Pro. Ask Vectric before you buy.
- **Spark is Vectric's macOS program.** Vectric lists what it cuts (above), and lists neither templates nor nesting (§ 10). Without templates, each sheet's toolpaths are made by hand. Vectric says Spark files open in VCarve "V13 and later" (§ 7), and V13 was not out on 2026-11-14.
- **On the Mac today, Carbide Create does the whole job.** [Carbide Create: cutting Sawhorse's CNC files](CAM-CARBIDE-CREATE.md).

## Templates and layer names: the safety rule

Sawhorse puts the depth of every pocket and hole in its layer's name: `POCKET_6.35MM` is a pocket 6.35 mm deep, `DRILL_D5MM_10MM` a 5 mm hole 10 mm deep. A template's toolpath selects its shapes by layer name, so a template knows only the layers it was built with.

A new layer name appears whenever a depth or a hole size changes:
- **A metric document.** Its dados and grooves are 6 and 8 mm deep (`POCKET_6MM`, `POCKET_8MM`), not 1/4 and 5/16 in (`POCKET_6.35MM`, `POCKET_7.94MM`), and its pull holes are 5 mm (`DRILL_D5MM_THRU`), not 3/16 in (`DRILL_D4.76MM_THRU`).
- **A new joint depth:** **5 · Construction** > **Dado depth** or **Groove depth**, or a base frame's **Dado depth**.
- **A new drawer-box stock.** A drawer bottom's groove is half the box's thickness deep, and at most 1/4 in. Boxes of 15/32 in plywood give `POCKET_5.95MM`; boxes of 1/2 in give `POCKET_6.35MM`.
- **A new pull hole:** **3 · Fronts and pulls** > **Pull hole**.
- **A cut in a part's other face:** `FLIP_` in front of the name ([below](#double-sided-jobs-for-the-flip_-layers)).

No template toolpath picks up a new name. That is on purpose: a depth meant for another layer is never applied to it without you seeing it. The price is one check after every import:

**After every Load Template, every layer except `STOCK` and `LABELS` must have a toolpath.** A layer with shapes and no toolpath is a cut that will not be made. VCarve's "Missing Layers for Template" dialog warns about the other case, a template layer the job does not have; the help documents no warning for a job layer the template does not have (§ 3). Make the missing toolpath, at the depth in the layer's name, before you save.

Two more things the names do not tell you:
- **The sheet's thickness is in no name.** The through cuts (`PROFILE_THRU`, `CUTOUT_THRU`, the `_THRU` holes) depend on the job's material thickness. Type each sheet's measured thickness in its job.
- **One name can need two bits.** A name gives the depth, not the width. In a metric document the dados (18.2 mm wide) and the drawer bottoms' grooves (6.2 mm wide) are both on `POCKET_6MM`, in different files. A bit wider than a groove cannot cut it: check in the preview that every shape on the layer is cut.

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

## Set up the job

Make the job first, then import the DXF into it.
- The help says files from other CAD programs "will be opened in the original size and position. The Job Setup Form is automatically opened showing the maximum X and Y dimensions of the opened design" (§ 1a). Sawhorse's file is taller than the sheet: the sheet's title on `LABELS` is drawn above the sheet, starting at its left edge (`src/nesting/dxf.ts`). Nothing lies left of or below 0,0, so the design's lower-left corner is the sheet's. **Not known:** whether VCarve counts text in that size. Do not take the size it offers; type the sheet's.
- **Not known:** which unit VCarve reads a DXF in. Sawhorse writes millimetres in the file's header (`$INSUNITS` 4); the report found nothing on whether VCarve reads it. A user says DXFs "open in VCarve by default into inches", and makes a millimetre job first, then imports (§ 1a, a user forum). **Check on your screen**, by measuring, as in [Each sheet](#each-sheet).

**Job Setup** (§ 2):
1. **Job type:** Single Sided (Double Sided only for [FLIP_ layers](#double-sided-jobs-for-the-flip_-layers)).
2. **Units:** millimetres. VCarve offers "inches (Imperial/English) or millimeters (Metric)". The post-processor's units are separate: "conversion is automatically applied when the toolpath is saved" (§ 1a).
3. **Width (X) and height (Y):** the sheet. 1219.2 x 1219.2 mm for a 48 x 48 in sheet, 1220 x 1220 mm for a metric document's.
4. **Thickness (Z):** the sheet's measured thickness.
5. **Z-Zero Position:** the surface of the material. The help: "the tip of the tool is set off the surface of the material... or off the bed / table of the machine for Z = 0.0". Sawhorse's depths are measured down from the top of the sheet ([Set the depths from the top of the sheet](CNC-CABINETS.md#4-set-the-depths-from-the-top-of-the-sheet)).
6. **XY Datum Position:** the lower-left corner. It "can be set at any corner, or the middle of the job". Sawhorse's files put the sheet's lower-left corner at 0,0. That the two line up is the report's inference: **check on your screen** that the `STOCK` rectangle sits exactly on the job's material after the import.
7. **Use Offset:** off. It sets a datum other than X0, Y0.

## Make the toolpath template once

**VCarve Pro only.** VCarve Desktop has no toolpath templates (§ 0.2).

A toolpath template keeps each toolpath with a rule for choosing its shapes: "all closed vectors on layer `POCKET_6.35MM`", say. The help: "When the template is re-opened and the toolpaths recalculated, they will automatically select all vectors which match the filters specified with the Vector Selector for that toolpath" (§ 0.2).

1. **Make a job** as in [Set up the job](#set-up-the-job), and import one of your CNC files: one with as many of the layers you cut as you can find.
2. **Check the layer names** in the layer list against the file's. **Not known:** whether a name with a dot, such as `POCKET_6.35MM`, comes in unchanged (§ 1a). The help warns that DXF imports "commonly include empty layers" (§ 1a).
3. **Enter your bits in the Tool Database.** The help documents only its screens (§ 7); do not make or edit its file outside VCarve. The numbers are in **CNC setup** > **Feeds**.
4. **Make one toolpath per layer.** For each one, click **Selector...** on the toolpath's form to open the **Vector Selector** (§ 3):
   - **Layer Filter:** the one layer;
   - closed vectors only;
   - for a `DRILL_` layer, also **Only Circles** at the hole's diameter ([below](#the-vector-selector-circles-by-diameter));
   - tick **Associate with toolpath**. The toolpath's vector selection then reads "Automatic": on recalculate or edit, the shapes that match now are selected again.
   - Leave **Set toolpath Cut Depth from imported vectors** as it is. **Not known:** what it does (§ 3).

   | Layer | Toolpath | Cut depth | Bit |
   |---|---|---|---|
   | `PROFILE_THRU` | Profile, **Outside** | the measured thickness plus about 0.5 mm | your profile bit |
   | `CUTOUT_THRU` | Profile, **Inside** | the same | your profile bit, if it fits the opening |
   | each `POCKET_…` | Pocket | the number in the name, in mm | narrower than the groove: **8 · Cuts and holes** lists those that need a smaller bit under **Change bit** |
   | `DRILL_D35MM_13MM` | Pocket | 13 mm | an end mill smaller than 35 mm |
   | `DRILL_D5MM_…`, `DRILL_D6MM_10MM` | Pocket ([or Drilling](#holes-pocket-or-drilling-toolpath)) | the number after the diameter | an end mill smaller than the hole: 1/8 in or 3 mm |
   | `DRILL_D4.76MM_THRU`, `DRILL_D5MM_THRU` | Pocket | through, as `PROFILE_THRU` | the same |
   | `STOCK`, `LABELS` | none | | |

   The profile's "Machine Vectors" choices are **Outside / Inside / On**; its other settings are in [Hold the parts down](#hold-the-parts-down-without-tabs-the-last-pass) (§ 4).
5. **Put the toolpaths in cutting order** with the Toolpath Tree's up and down arrows. "If multiple toolpaths are saved as a single file, then this will be the order that the machine cuts them in" (§ 6). Drills and pockets first, `CUTOUT_THRU` next, `PROFILE_THRU` last ([Give each layer its toolpath](CNC-CABINETS.md#2-give-each-layer-its-toolpath)).
6. **Save the template:** **Toolpaths > Templates > Save All Visible Toolpaths as Template**. The automatic-selection settings are saved with it (§ 3). **Not known:** the template file's extension (§ 3).
7. Make one template per document unit: an inch document's names and a metric document's are not the same.

## Each sheet

**Nothing applies on import by itself.** The report found no setting that applies a template when a DXF is opened (§ 0.2, § 3). Every sheet takes these steps:

1. **Make the job** ([Set up the job](#set-up-the-job)) with this sheet's measured thickness.
2. **Import the DXF.** "The imported vectors will always be read in at the size and scale they were created in their original design software" (§ 1a).
3. **Check the scale.** Measure the outer rectangle on `STOCK`: 1219.2 x 1219.2 mm for a 48 x 48 in sheet, 1220 x 1220 mm for a 1220 x 1220 sheet. If it is 25.4 times too big or too small, delete it and fix the units before anything else.
4. **Check the position.** The `STOCK` rectangle must sit exactly on the job's material outline.
5. **Check the shapes.** Sawhorse writes every outline and pocket as a closed polyline and every hole as a circle. **Not known:** whether VCarve reads every closed polyline as a closed vector (§ 1a). These are the help's tools to check (§ 1a):
   - **Edit > Select All Open Vectors** should select nothing;
   - **Edit > Select All Duplicate Vectors** should select nothing: duplicates "can cause problems for some toolpath and modeling functions";
   - the **Vector Validator** finds "overlapping contours or intersections... zero-length spans". It may flag the dados drawn past a part's edge, where they cross `PROFILE_THRU`: those are on purpose ([Leave the dados that cross the outline as they are](CNC-CABINETS.md#3-leave-the-dados-that-cross-the-outline-as-they-are)).
6. **Toolpaths > Templates > Load Template** (§ 0.2). If the sheet lacks a layer the template has (no `CUTOUT_THRU`, say), the **Missing Layers for Template** dialog offers to create the layers, to delete the toolpaths tied to the missing layers, or to load as is (§ 3). None of the three applies a depth to the wrong layer. **Not known:** how each behaves when recalculated. Check the toolpath list afterwards.
7. **Toolpaths > Recalculate All Toolpaths** (§ 0.2).
8. **Check every layer has a toolpath** ([the safety rule](#templates-and-layer-names-the-safety-rule)). Go down the layer list: every layer except `STOCK` and `LABELS` must have a toolpath. A layer the template did not know has none: make it, at the depth in the layer's name.
9. **Preview each toolpath.** Every shape on its layer must be cut, and the pockets that cross the outline must run past the part's edge. The pocket "removes the areas contained inside the selected vectors" (§ 5). **Not known:** an explicit statement that other, unselected vectors do not limit it.
10. **Check the order** in the Toolpath Tree.
11. **Save the toolpaths** with the millimetre Shapeoko post ([Choose the post-processor](#choose-the-post-processor)).

**Several sheets in one job.** A template "will offer to apply that template to all sheets... any toolpaths will be automatically calculated where possible", named "S1-Cut Out", "S2-Cut Out" and so on. To apply all toolpaths to all sheets even where a layer is empty, "hold down Ctrl when clicking Open" (§ 3). Sawhorse writes one file per sheet, so one job per sheet is the simpler way.

**A job template.** A job template (`.crvt`) "may also contain vectors and toolpaths" (§ 0.2). Importing each DXF into one, so that its toolpaths select the new shapes, is the report's untested idea. **Check on your screen** before you rely on it.

## The Vector Selector: circles by diameter

The Vector Selector opens from **Edit > Vector Selector** or from **Selector...** on any toolpath form. Its geometry filters include open or closed vectors and **Only Circles**, with "an exact diameter and tolerance". The help calls it "very useful for selecting vectors for drilling toolpaths, particularly if the vectors have not already been sorted into layers" (§ 3, § 5).

Sawhorse's holes are already sorted: each layer is one diameter and one depth. Add the circle filter as a second guard, so that a hole toolpath can never pick up anything but its own holes:

| Layer | Only Circles: diameter |
|---|---|
| `DRILL_D35MM_13MM` | 35 mm |
| `DRILL_D5MM_11.5MM`, `DRILL_D5MM_13MM`, `DRILL_D5MM_10MM`, `DRILL_D5MM_THRU` | 5 mm |
| `DRILL_D6MM_10MM` | 6 mm |
| `DRILL_D4.76MM_THRU` | 4.7625 mm |

Each circle is drawn at the hole's exact diameter. A layer's name rounds it to 0.01 mm: a 3/16 in pull hole is 4.7625 mm across and its layer is `DRILL_D4.76MM_THRU`. Type 4.7625, or use a tolerance of at least 0.01 mm. **Not known:** VCarve's default tolerance.

## Holes: pocket or Drilling toolpath

**Pocket.** Pocket each circle with an end mill smaller than it, to the depth in the layer's name, as [Give each layer its toolpath](CNC-CABINETS.md#2-give-each-layer-its-toolpath) says. A 6.35 mm end mill cannot pocket a 5 mm hole (§ 5).

**The Drilling toolpath.** It "allows the centers of selected closed vectors to be drilled to a specified depth" (§ 5):
- The drill's diameter comes from the Tool Database.
- Peck drilling uses the tool's Pass Depth, with a full retract or a retract to the previous pass.
- A dwell needs the post-processor's support.

A Drilling toolpath plunges at each circle's centre, so the hole is the size of the bit, whatever the circle's size: a 1/8 in end mill in a 5 mm circle makes a 1/8 in hole. Use it only with a bit of the hole's own diameter, and only if your spindle has a collet for its shank and a speed slow enough for drilling ([Give each layer its toolpath](CNC-CABINETS.md#2-give-each-layer-its-toolpath)). Never for the 35 mm cups: a Forstner bit does not belong in a router. On a trim router, pocket the holes.

**Islands.** **Not known:** how a VCarve pocket treats shapes on one layer that are nested or overlap (§ 5). Sawhorse's starting cabinets have none: the test `src/nesting/cam-layers.wasm.test.ts` checks that no shape on a cut layer lies inside, or overlaps, another shape on the same layer. A pocket is written as one closed outline, the outer edge of its floor, and a hole in that floor is on its own `DRILL_` layer (`src/nesting/machine.ts`).

## Hold the parts down without tabs: the last pass

The last pass of a profile frees the part. [Hold the parts down](CNC-CABINETS.md#6-hold-the-parts-down) says which parts need help most and where screws can go. These are the Profile toolpath's settings for it (§ 4).

**Tabs.**
- "Length and Thickness"; optional **3D (triangular) tabs**. "Tab thickness is measured from the bottom of the CUT DEPTH, not the Material bottom."
- Automatic placement: "Constant number" or "Constant distance between tabs". The first tab goes at the start point, or "Avoid corners and curved regions". Tabs can also be clicked in, deleted or dragged.
- **Not known:** whether automatic tabs are placed again when a template's toolpath recalculates on a new sheet. After **Recalculate All Toolpaths**, check in the preview that every part has its tabs.

**Without tabs: the last pass.**
- **Set Last Pass Thickness** (in **Edit Passes**) sets the last pass "in terms of the remaining thickness of material you wish to cut with the last pass". A thin last pass frees each part with less force on it.
- **Do Separate Last Pass** cuts every pass but the last with an allowance left at the side; the final pass cuts to size. VCarve warns when the allowance is over a third of the tool's diameter, and can reverse the last pass's direction.
- Neither holds a part once it is free. The help describes the passes, not hold-down: a part is loose for the rest of the last pass.
- **Not known:** whether VCarve takes every part to one depth before it starts the last pass, or finishes each part in turn (§ 4). Look at the preview's order before you trust a thin last pass on small parts.

**A skin left over every part.** VCarve has no feature by that name (**not known**, § 4). The report's idea, which it did not test: two profile toolpaths on `PROFILE_THRU`, the first to the thickness less the skin, the second with **Start Depth** at the thickness less the skin and **Cut Depth** the skin. The help documents Start Depth for "machining into the bottom of an existing pocket". **Check on your screen**, then on an offcut. This guide gives no skin thickness.

**Other settings** (§ 4):
- **Direction:** Conventional or Climb.
- **Ramps:** Smooth (by distance or angle), Zig Zag, or Spiral (only without lead-ins), at the start of each pass level, at the plunge rate. Leads: straight or circular, with overcut.
- **Allowance offset:** negative overcuts, positive undercuts. Leave it at 0: Sawhorse's outlines are the parts' sizes.
- "The program will always cut the inner vectors before the outer vectors to ensure the part remains attached to the original material as long as possible." That holds within one toolpath. Sawhorse's openings are on `CUTOUT_THRU`, a toolpath of their own, so put it before `PROFILE_THRU` in the Toolpath Tree.

**A compression bit.** A bit reseller's guide, quoted in Sawhorse's feeds research, says: "Compression bits fail when the first pass is too shallow … take the first pass deeper than the upcut tip (usually about one bit diameter)". So a compression bit's first pass must be deeper than its up-cut section. Everything else about passes and feeds is in **CNC setup** > **Feeds**.

## Double-sided jobs for the FLIP_ layers

A `FLIP_` layer (`FLIP_POCKET_6.35MM`, `FLIP_DRILL_D5MM_10MM`) holds cuts in the face that is down while the rest of the part is cut. No starting cabinet has one ([the layer table](#templates-and-layer-names-the-safety-rule)); the status line names the parts that do. Sawhorse draws a `FLIP_` shape where its cut is when you look down through the part from the face that is up (`src/nesting/machine.ts`).

VCarve has a double-sided job, in Desktop and in Pro (§ 9):
- **Job Setup > Double Sided**, with **Flip Direction Between Sides** (horizontal or vertical) and **Zero off same side**, which lets "Z Zero to reference the same physical location, regardless whether material is flipped or not".
- "The software will automatically mirror your toolpaths and geometry... you must physically turn the material on your CNC machine in the same direction as you have specified."
- Toolpaths can be copied or moved to the other side. The job sheet records the side and the flip direction (Pro).
- Registration: Vectric's V9 help says to turn the block over "whilst maintaining a common registration position", and "The X Y Datum Position applies to both sides of the material". The report reads this from the V9 help and expects V12 to be the same. **Check on your screen.**
- **Not known:** an official pin or dowel method. Forum users suggest dowels or holes placed so the sheet fits only one way.

**Not known:** whether moving Sawhorse's `FLIP_` shapes to the second side keeps them where they are on the part, so that VCarve's mirror puts them in the right place. Before a real part, cut one `FLIP_` hole in scrap and check it comes out where the part's other cuts say it should. Choose the flip direction to match the way you turn the sheet over, and turn it that way every time.

## Choose the post-processor

The post-processor writes the toolpaths as G-code for Carbide Motion.
- Carbide staff wrote in May 2024: "Vectric has been bundling a post-processor for our machines since v8.5" (§ 8b, a staff forum post).
- **Not known:** the post's exact name in VCarve 12.5. Names users have posted (§ 8b, user forums, 2020 and 2025): "Shapeoko (mm)", "Shapeoko (in) (.gcode)", "Shapeoko (inch) TOOLCHANGE(*.gcode)", "Carbide Motion ATC (inches) (*.nc)". For the metric one, staff said only "the metric one".

**How to find it:**
1. Open VCarve's **Machine Configuration**. Onefinity's own instructions pick their post there (§ 8b, Onefinity's forum account), and the report recommends choosing the Shapeoko post there. **Check on your screen**, and check where VCarve asks for the post when you save toolpaths.
2. Look for the entries that start "Shapeoko" or "Carbide".
3. Pick the **mm** one, not the inch one, to match Sawhorse's millimetre files. Not an ATC one: your machine has no automatic tool changer.
4. Save a toolpath and open the file in a text editor. A user says the post "inserts the appropriate command (G20/G21)" (§ 8b); G21 is millimetres and G20 inches, and Carbide Motion takes both (§ 8c). Find G21 near the top. If you find G20, you picked an inch post.

**Not known:** how the variants differ beyond their names, and how each handles a tool change. Until you have checked, save each bit's toolpaths to a file of their own.

## LABELS and STOCK

- Keep both for reference and hide them. Give neither a toolpath (§ 10).
- Keep `STOCK` to measure the scale and position ([Each sheet](#each-sheet)).
- `LABELS` is text: each part's tag and name, and the sheet's title, drawn above the sheet and starting at its left edge. **Not known:** whether VCarve imports DXF text. Name the parts from the PDF's page for the sheet.
- VCarve prints part labels only through the paid Advanced Machining Module's cabinet import (§ 10).

## Aside: the Advanced Machining Module

The Advanced Machining Module is a paid add-on for VCarve Pro 12.508 and later. Its cabinet cut-list import (§ 7):
- takes "A part list in CSV format" and "A parts folder containing DXF files for all exported cabinet parts";
- uses a template `.crv` whose sheet names match the CSV's material names, with toolpaths that select by layer;
- nests and toolpaths automatically, and makes part labels (seven sizes; QR, barcode, Data Matrix);
- supports CabinetParts Pro, CabinetSense, KCD and Mozaik, and "other software using a Custom Mapping File".

**Not known:** the CSV's columns and the Custom Mapping File's format. The help says "please refer to the relevant documentation". Sawhorse cannot write for it until Vectric publishes them. Sawhorse nests and writes a DXF per sheet; the module wants a DXF per part and nests them itself.

Vectric also says files and tool databases edited by 12.508 and later "can't be opened, or are read-only, in 12.507 and earlier" (§ 7).
