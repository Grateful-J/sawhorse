<!-- The research report behind docs/CAM-CARBIDE-CREATE.md and docs/CAM-VCARVE.md, copied as it was written on 2026-11-14. The guides cite its sections (§ 0.1, § 1b, ...) and its confidence levels. Do not edit the findings here: research again and replace the file. -->

# CAM programs for Sawhorse DXFs: VCarve (Pro/Desktop 12.5) and Carbide Create (V8 / Pro)

Research date: 2026-11-14. Every fact below comes from a page opened in this session; the URL is given.

**Confidence key**
- **HIGH**: official vendor documentation or product page, read directly.
- **MED**: official vendor changelog or blog, a vendor staff post on a forum, or the personal docs of a vendor staff member.
- **LOW**: user forum posts or third-party pages.

"NOT FOUND" means I looked and found no source; it does not mean the feature is absent.

**Versions in scope**
- **VCarve Pro / Desktop 12.5**, released 2026-09-22. The updates page does not mention V13. Source: https://www.vectric.com/support/program-updates (HIGH).
  - docs.vectric.com publishes V12.0 and V12.5 help for both editions. V13 help URLs return 404 (checked 2026-11-14).
- **Carbide Create**: stable build 876 (2026-10-12), beta build 881 (2026-11-13).
- **Carbide Motion**: stable build 667 (2026-08-01), beta build 704 (2026-11-05 Windows, 2026-10-30 macOS).
  - Source for both: https://files.carbide3d.com/builds.json, the JSON that the official download pages load (HIGH).
- The Carbide Create download page is titled "Download Carbide Create V8": https://carbide3d.com/carbidecreate/download/ (HIGH).

**Main sources (opened)**
- **VS-D**: VCarve Desktop V12.5 help, one page: https://docs.vectric.com/docs/V12.5/VCarveDesktop/ENU/Help/page/single-page/index.html (also the V12.0 copy at the same path with V12.0).
- **VS-P**: VCarve Pro V12.5 help, one page: https://docs.vectric.com/docs/V12.5/VCarvePro/ENU/Help/page/single-page/index.html
  - Per-topic pages also exist under `.../Help/form/<name>/index.html`. I opened these:
    - `form/vector-selector/`
    - `form/uiProfileMachineForm/`
    - `form/Job%20Setup%20Single/` (Desktop)
    - `form/load-toolpath-template/` (Desktop: content area empty)
- **VEC-CMP**: Vectric Compare page: https://www.vectric.com/compare
- **VEC-LLM**: Vectric's own text export of its website: https://www.vectric.com/llms-full.txt
  - It covers the products, compare, Spark, Advanced Machining Module and FAQ pages.
- **C3D-G**: Carbide 3D Guides at https://guides.carbide3d.com/. The old docs.carbide3d.com and carbide3d.com/hub/faq URLs now redirect here or return 404.
- **C3D-CL**: Carbide changelogs:
  - https://files.carbide3d.com/cc/beta/881/changes.txt (Create, full history back to about build 800)
  - https://files.carbide3d.com/cm/stable/667/changes.txt (Motion)

---

## 0. Headline answers

### 0.1 VCarve Desktop size limit (critical for a 4x4 bed)

Vectric's two official sources disagree by one inch.

| Source | Limit for VCarve Desktop | Confidence |
|---|---|---|
| VCarve Desktop V12.5 help (and V12.0), "Job Setup - Single Sided" | "VCarve Desktop only supports job sizes up to a maximum of **25 inches square** without tiling. You can cut jobs larger than this limit but you will need to use the Toolpath Tiling feature to cut the job in sections." | HIGH. VS-D; https://docs.vectric.com/docs/V12.5/VCarveDesktop/ENU/Help/form/Job%20Setup%20Single/index.html |
| Vectric Compare page | "Work area: **24" x 24"**" for Cut2D/VCarve Desktop; "Unlimited" for VCarve Pro. | HIGH. VEC-CMP |
| Vectric product text | "If your CNC machine bed size is 24" x 24" or smaller, Cut2D or VCarve Desktop is right for you." It also says "Desktop editions are capped at 24"x24" without tiling" and lists "Cut Parts Larger Than 24"x24" Without Tiling" as a feature Desktop lacks. | HIGH. VEC-LLM |

**Conclusion**
- The software help says 25 in square. Marketing says 24 x 24 in.
- Either way, the Shapeoko 5 Pro 4x4 travels 1237 x 1237 mm (about 48.7 in), see section 8a. VCarve Desktop can use only about a quarter of that bed without tiling.
- **VCarve Pro is the edition that fits this user.**

Desktop also lacks the features this workflow needs. The compare page lists these as "No" for Desktop and "Yes" for VCarve Pro (VEC-CMP, HIGH):
- toolpath templates
- true shape nesting
- merging toolpaths
- gadgets
- job setup sheets
- keep-out zones
- array copy toolpath

### 0.2 Can toolpaths be assigned automatically by layer name?

**VCarve Pro: yes, by an explicit load step. Nothing applies automatically on import.**
- A toolpath can be tied to a Vector Selector filter, for example "all closed vectors on layer POCKET", using **Associate with toolpath**. Vector selection then becomes "Automatic".
- Saved in a Toolpath Template, the filter goes with it. The help says: "When the template is re-opened and the toolpaths recalculated, they will automatically select all vectors which match the filters specified with the Vector Selector for that toolpath." (VS-P, "Vector Selector" > "Advanced Toolpath Templates", and "Save All Visible Toolpaths as a Template". HIGH.)
- Workflow for each new DXF:
  1. Open or import the DXF.
  2. Run **Toolpaths > Templates > Load Template**.
  3. Run **Toolpaths > Recalculate All Toolpaths**.
- I found no documented setting that applies a template automatically when a DXF is opened. **NOT FOUND.**
- A Job Template (`.crvt`) can hold toolpaths too. The help says templates "may also contain vectors and toolpaths" (VS-P, Startup Tasks; HIGH). Using one so that a DXF imported into it picks up auto-select toolpaths is my inference. I did not verify it.
- **Desktop: no toolpath templates.**
  - The compare page says so (VEC-CMP, HIGH).
  - The V12.5 Desktop "Load Toolpath Template" help page has an empty content area (opened 2026-11-14; HIGH that it is empty).
- The paid **Advanced Machining Module** for VCarve Pro does the fully automatic version, see section 7.

**Carbide Create (V7 and later, Core and Pro): yes, by a template `.c2d`.**
- "Toolpaths can now link to a layer instead of individual vectors... it will recalculate any time the contents of that layer change... make template files that contain known-good machining processes where you only have to add vectors to the correct layer." Depths can be expressions in stock thickness `t`, for example `t/2` or `t+.01in`. (Carbide blog "Carbide Create V7", Jul 20 2022: https://carbide3d.com/blog/carbide-create-v7/; MED-HIGH, official blog.)
- Build 839 (Feb 2026) has a new DXF parser and an import option **"Insert layers from File"**. With it, "an object which is on a layer in the DXF will be placed on a layer so named in the .c2d file." (Staff post by William Adams, Feb 17 2026, https://community.carbide3d.com/t/carbide-create-beta-839/101187; MED.)
- Staff confirmed on Jun 27 2026: "Carbide Create will now import layers in DXFs as separate layers." (https://community.carbide3d.com/t/layers-will-not-move-when-imported-into-cc/104591; MED.)
- So: open the template `.c2d`, import the DXF with "Insert layers from File", and toolpaths linked to POCKET_6.35MM, PROFILE_THRU and so on recalculate.
  - This is the combination of documented behaviours. I did not see it demonstrated end to end. MED.
  - Exception: tabs are attached to vectors, not toolpaths, so they do not come in from a DXF (section 4).

---

## 1. DXF import

### 1a. VCarve Pro / Desktop 12.5

| Question | Finding | Confidence and source |
|---|---|---|
| Size and position | "Files from other CAD or graphics software packages such as AutoCAD will be opened in the original size and position. The Job Setup Form is automatically opened showing the maximum X and Y dimensions of the opened design." Import is also described as: "The imported vectors will always be read in at the size and scale they were created in their original design software." | HIGH. VS-P "File Types" and "Import Bitmap / Vectors" |
| Units assumed | The help does not say which unit a unitless DXF is read as. **NOT FOUND (official).** One forum user says DXFs "open in VCarve by default into inches" and are not converted. Their fix is to create a metric (mm) job first, then import. | LOW. https://forum.easel.com/t/dxf-file-import/38124 (seen in search results; not opened in full) |
| How to set units | Job Setup has "inches (Imperial/English) or millimeters (Metric)". Post-processor output units are separate: "it doesn't matter what units where used to create the original toolpath... conversion is automatically applied when the toolpath is saved". | HIGH. VS-P "Job Setup" and the post-processor intro |
| Layers kept | Implied, not stated outright. The help warns that DXF/DWG imports "commonly include empty layers". The whole template-by-layer workflow and the AMM cabinet import depend on DXF layer names. DXF export "preserves" layer information. | MED (inferred from HIGH sources). VS-P "Layer Management", "Export Vectors", "Cabinet Cut-list Import" |
| Closed LWPOLYLINE becomes a closed vector | **NOT FOUND (official).** Tools exist to check: Edit > Select All Open Vectors, Join Open Vectors (closes or joins ends within a tolerance), and the Vector Validator, which finds "overlapping contours or intersections... zero-length spans". | HIGH for the tools. VS-P |
| R12 vs newer | **NOT FOUND (official).** A forum user recommends R12 POLYLINE export; another saw no difference. | LOW. OpenBuilds and Sawmill Creek posts in search results, not opened |
| Duplicate vectors | Edit > Select All Duplicate Vectors: "vectors which are exact copies of each other... These can cause problems for some toolpath and modeling functions." | HIGH. VS-P "Edit > Selection" |
| Layer names containing "." (POCKET_6.35MM) | **NOT FOUND** in either program. | n/a |

### 1b. Carbide Create (V8 builds up to 876 stable / 881 beta)

| Question | Finding | Confidence and source |
|---|---|---|
| DXF import available in Core | "SVG and DXF import" is in both Core and Pro. | HIGH. https://carbide3d.com/carbidecreate/core-vs-pro/ |
| Units assumed | **NOT FOUND (official).** A user (Jan 2022) reported DXFs "always seem to be interpreted as inches regardless of how I have the job's units configured", and that `$INSUNITS` made no difference. Build 810 changelog: "(FIX) Tweak DXF import scaling." Current behaviour is unverified, so check against the STOCK rectangle after import. | LOW (forum): https://community.carbide3d.com/t/carbide-create-dxf-import-units/39828. Changelog: C3D-CL, HIGH that the line exists |
| Layers kept | Older builds: no. Staff in Oct 2025: "No" ("CC puts the whole DXF on DEFAULT"). **Since build 839 (Feb 2026): yes**, with the "Insert layers from File" option. Rob Grzesek (Carbide): "layers, blocks, and groups should all work and be respected." | MED. https://community.carbide3d.com/t/is-cc-supposed-to-respect-dxf-layers/96971 ; https://community.carbide3d.com/t/carbide-create-beta-839/101187 |
| Import into an existing file | The release thread says objects go "on a layer so named in the .c2d file". Who it applies to is unclear: one user's imported Outline content landed in his existing (locked) Outline layer, which points to matching by name. | MED/LOW. Same threads plus /104591 |
| New DXF parser | Build 839: "All-new DXF parser that handles less-popular parts of the DXF format better." Later fixes cover splines (856), bounding boxes (840) and customer files (841). Build 813: "read a different polyline variation". | HIGH that the lines exist. C3D-CL |
| Text entities | Rob (Carbide), Feb 2026: imported text is something "we still do not support." **Text on our LABELS layer may be dropped.** | MED. beta-839 thread |
| 3D data | Staff, Oct 2025: CC "discards any 3D information". | MED. /96971 |
| Duplicate or overlapping segments | Build 808: "Better handling of imported DXF/SVG files with duplicated/overlapping segments." | HIGH that the line exists. C3D-CL |
| Open vectors | Build 760 (Oct 2023): the Info panel counts open vectors and offers select, join and close. Imports adds start/end markers. | MED-HIGH. https://carbide3d.com/blog/create-big-file-update/ |
| Known bug | Build 854: a group nested inside a group does not import. Staff: subgroups "don't seem to be a formal part of the DXF format"; no fix confirmed. Our DXFs use no groups, so this should not affect us. | MED. https://community.carbide3d.com/t/cc-build-854-dxf-import-bug/105400 |
| R12 vs newer, LWPOLYLINE closed flag | **NOT FOUND.** | n/a |

---

## 2. Job setup

### VCarve
- **Job Setup** fields (VS-P "Job Setup - Single Sided"; HIGH):
  - width (X), height (Y) and thickness (Z)
  - units: inches or mm
  - **Z-Zero Position**: "the tip of the tool is set off the surface of the material... or off the bed / table of the machine for Z = 0.0."
  - **XY Datum Position**: "can be set at any corner, or the middle of the job"
  - **Use Offset**: a datum other than X0,Y0
- When a DXF is opened, the Job Setup form opens showing the design's maximum X and Y (VS-P File Types; HIGH).
  - Our DXF has the sheet's lower-left corner at 0,0, and DXFs open "in the original size and position". So a lower-left datum should line up with the DXF origin. That last step is my inference.
- **Desktop**: the 25 in square limit applies to job size (section 0.1).

### Carbide Create
- The official Job Setup lesson is a video. Its text says only: "Step One on any project is entering the information about your STOCK... Accurate measurement is key." (https://guides.carbide3d.com/create/job-setup/; HIGH.) No written field list. **NOT FOUND (official text).**
- Forum: a "zero height" top/bottom setting exists. Users disagree on whether it changes depth values. (https://community.carbide3d.com/t/zero-at-bottom-of-stock/66574; LOW.)
  - Staff (William Adams) in the same thread: define the stock as your thickest piece and surface it. (MED.)
- Forum: the CC origin "is a reference point for the design... Zero is always set in CM", and "There is nothing in the G-code to tell the machine where to set zero." (https://community.carbide3d.com/t/x-y-axis-of-stock-vs-x-y-toolpath-zero/90972; LOW. Staff only confirmed that the file's origin was lower-left.)
- Toolpath depths can be expressions of stock thickness `t` (V7 blog; MED-HIGH).
- A depth that exactly reaches the stock bottom can be set with a "Use Stock Bottom" button. (Forum, LOW; search snippet only, thread not opened.)

---

## 3. Assigning toolpaths by layer

### VCarve Pro (HIGH unless marked; VS-P)
- **Vector Selector**
  - Open it from Edit > Vector Selector or from the **Selector...** button on any toolpath form.
  - Geometry filters: open or closed vectors, "Only Circles" with "an exact diameter and tolerance".
  - **Layer Filter**: one or more visible layers, or "All visible layers".
  - Two options exist only when it is opened from a toolpath form: "Associate with toolpath" and "Set toolpath Cut Depth from imported vectors". I did not find what the second one does. **NOT FOUND.**
- **Associate with toolpath** makes Vector Selection "Automatic". On recalculate or edit, the vectors that currently match are re-selected.
- **Saving templates**
  - Toolpaths > Templates > Save All Visible Toolpaths as Template saves a group as one template. A single-toolpath "save toolpath template" also exists (`form/save-toolpath-template`, linked from the help).
  - Automatic-selection settings are stored in the template.
- **Loading templates**
  - Toolpaths > Templates > Load Template.
  - If a layer is missing, the "Missing Layers for Template" dialog offers three choices: create the layers, delete the toolpaths tied to missing layers, or load as is.
  - "Should you wish to apply all toolpaths to all sheets even if the layer is 'empty' for some sheets, then hold down Ctrl when clicking Open."
- **Multiple sheets**: a template "will offer to apply that template to all sheets... any toolpaths will be automatically calculated where possible", named "S1-Cut Out", "S2-Cut Out" and so on.
- **Template file extension**: not stated in the help. **NOT FOUND.**
- **Automatic application to every new DXF**: no automatic-on-open behaviour documented. **NOT FOUND.** The minimum per job is "Load Template" then "Recalculate All".
- **Desktop**: no toolpath templates (VEC-CMP; HIGH).
- **Gadgets** (Pro only): Vectric describes gadgets as able to do "template application plus auto post-processing across a nested job". The FAQ also mentions a "DXF batch processor gadget" that "just lays out DXFs from a folder in rows and columns". (VEC-LLM; HIGH that Vectric says this.) I did not open the gadget pages.

### Carbide Create
- Toolpaths link to a layer (V7 and later), recalculate when the layer changes, and support `t` depth expressions. The blog suggests template files: "Engraving layer linked to a V-carve toolpath... Pocket layer linked to a pocket toolpath with the depth set to "t/2"... Outline layer linked to a contour toolpath with the depth set to "t+.01in"." (V7 blog; MED-HIGH.)
- DXF layers land in layers of the same name (build 839 and later; section 1b).
- Build 878 beta: "Updated Send to Carbide Motion... Requires Carbide Motion 702 or newer." (C3D-CL; HIGH that the line exists.)

---

## 4. Profile (contour / cut-out) options

| Option | VCarve Pro 12.5 (VS-P "2D Profile Toolpath", "Toolpath Tabs"; HIGH) | Carbide Create |
|---|---|---|
| Inside / outside | Machine Vectors: **Outside / Inside / On**. Open vectors: Left / Right / On. | Contour offset: **Inside/Left, No Offset, Outside/Right**. MED: https://willadams.gitbook.io/design-into-3d/toolpaths (personal docs of a Carbide staff member; no date) |
| Climb / conventional | "Direction: Conventional or Climb". | Contour direction is **Pro only** ("Stock to Leave and Direct (Climb vs. Conventional) for Contours"; MED, gitbook). Pocket Climb/Conventional is Pro, added in build 859 (C3D-CL; HIGH). Core has no direction setting (forum, LOW: https://community.carbide3d.com/t/is-there-a-way-to-choose-conventional-milling-vs-climb-milling-in-carbide-create/30143, search snippet only). |
| Tabs: size | "Length and Thickness"; optional **3D (triangular) tabs**. "Tab thickness is measured from the bottom of the CUT DEPTH, not the Material bottom." | Since V7, "Tabs are now a part of the vectors, not contour toolpaths... If you copy the vector, you copy the tabs too." (V7 blog; MED-HIGH.) The Cutout toolpath has its own tab fields; tab width fixed in builds 844, 851, 855. (C3D-CL; HIGH that the lines exist.) |
| Tabs: count | Automatic placement: "Constant number" or "Constant distance between tabs". Placement: first tab at the start point, or "Avoid corners and curved regions". Tabs can also be clicked in, deleted or dragged. | Count options **NOT FOUND**. Consequence: DXF-imported vectors arrive with no tabs and need tabs added in CC. |
| Ramps | Ramp page: **Smooth** (distance or angle), **Zig Zag**, **Spiral** (only without lead-ins). Applied at the start of each pass level at plunge rate. Leads: straight or circular, with overcut. | "Ramped entry for contours and pockets" is **Pro only**. HIGH: core-vs-pro page |
| Allowance | "Allowance offset": negative overcuts, positive undercuts. | "Stock to Leave" (Pro; MED gitbook). Changelog: "Contour toolpath ignored tabs if the Stock to Leave was not zero" (fixed; C3D-CL). |
| Last pass / leave skin | **Do Separate Last Pass**: all passes but the last are undercut by an allowance; the final pass cuts to size. Warns if it exceeds 1/3 of tool diameter; optional reversed direction. **Edit Passes > "Set Last Pass Thickness"** sets the last pass "in terms of the remaining thickness of material you wish to cut with the last pass". | **Cutout toolpath** (build 843 and later; not marked PRO in the changelog, so it appears to be in Core) has a **Breakthrough** value. Negative values "will be subtracted from the Stock Thickness and leave that dimension as an uncut 'onion skin'." MED (gitbook). Forum threads (search results only, not opened) describe the same sign convention, with staff saying the reference is the bottom of the material. Build 855 fixed the start-depth and breakthrough fields: "Existing files may need the values reset." (C3D-CL.) |
| Onion skin (a skin left over all parts, then a final skim) | **No feature by that name found. NOT FOUND.** Workarounds: (a) "Set Last Pass Thickness"; (b) **my inference**: two profile toolpaths, the first to depth T minus skin, the second with **Start Depth** = T minus skin and Cut Depth = skin. The help documents Start Depth for "machining into the bottom of an existing pocket". Whether VCarve finishes all parts to one level before the last pass is **NOT FOUND**. | Cutout Breakthrough (negative) leaves a skin. A separate final skim pass is my inference: a second contour from the skin depth. Not documented. |
| Inside before outside | "The program will always cut the inner vectors before the outer vectors to ensure the part remains attached to the original material as long as possible." | **NOT FOUND (official).** Changelog: "Improved linking for nested contour toolpaths" (817). Users say ordering within a toolpath is unoptimized (section 6). |

---

## 5. Pockets, circles and drilling

### VCarve (VS-P; HIGH unless marked)
- **Pocket** "removes the areas contained inside the selected vectors". Options:
  - Offset or Raster strategy, with Climb (CCW) or Conventional (CW) cut direction
  - several tools in sequence, the first clearing what it can
  - Pocket Allowance
  - Ramp Plunge Moves
  - Use Vector Selection Order
- **Drilling** "allows the centers of selected closed vectors to be drilled to a specified depth". The drill diameter comes from the Tool Database. Peck drilling uses the tool's Pass Depth, with full retract or retract to the previous pass, and optional dwell, which needs post support.
- **Selecting holes**: Vector Selector "Only Circles" with exact diameter and tolerance is "very useful for selecting vectors for drilling toolpaths, particularly if the vectors have not already been sorted into layers."
- 35 mm hinge cup and 5 mm holes (my inference, not from a source):
  - Use a Pocket on the circle with an end mill smaller than the circle, or a Drilling toolpath with a matching drill tool defined in the Tool Database.
  - A 6.35 mm end mill cannot pocket a 5 mm hole. Use a drill or a smaller end mill.
- **Pocket running past a part outline**: the pocket clears only inside the selected vectors. The help says nothing about other, unselected vectors limiting it. So a dado rectangle on a pocket layer that crosses the part's PROFILE outline is just a closed region.
  - **NOT FOUND**: an explicit statement covering this case, and island handling for overlapping or nested vectors inside one pocket selection.
  - The Vector Validator flags "overlapping contours or intersections".

### Carbide Create
- Pockets "cut out the interior of geometry". **Nested geometry makes islands**: "If there is nested geometry, then the pocketing algorithm will alternate between cutting and not cutting, leaving islands." Offset or Raster pocket type is Pro. (MED, gitbook.)
  - **Gotcha**: do not nest one pocket shape inside another on the same pocket layer.
- **Drill** "toolpaths plunge the tool at the center of the selected geometry". Types: Full Depth, Peck, and Peck with Full Retract. Square, ball or V end mills can be used. (MED, gitbook.)
- Changelog: "Fixed a bug in the retract height for Drill toolpaths." (C3D-CL; HIGH that the line exists.)
- Changelog: "We made sure pockets will be linked layer-first to avoid slotting" (824). Pockets past a part outline: **NOT FOUND**.

---

## 6. Toolpath order

- **VCarve**
  - The Toolpath Tree's up/down arrows set the order. "If multiple toolpaths are saved as a single file, then this will be the order that the machine cuts them in." (VS-P "Toolpath Tree"; HIGH.)
  - Within a profile, the Order tab offers Vector Selection Order, Left to Right, Bottom to Top and Grid; the software picks the shortest of the options chosen. Inner vectors are always cut before outer ones. (HIGH.)
- **Carbide Create**
  - Toolpaths run in list order and can be dragged; build 876 made the drop target clearer (blog Oct 12 2026: https://carbide3d.com/blog/carbide-create-876/; MED-HIGH).
  - Users report no cut-order optimization within a toolpath: "toolpaths are run in the order you specify them." (Aug 2023, non-staff: https://community.carbide3d.com/t/why-random-cut-order-within-toolpath/66970; LOW.)
  - Cut-inside-first: **NOT FOUND (official).**

---

## 7. File formats: what could a third party generate?

### VCarve
- **Job file `.crv`, job templates `.crvt` / `.crv3dt`**
  - The help documents them only as program files: "They have different file extensions (.crv3dt and .crvt)". Job templates "behave as though they are new files". (VS-P "Job Templates", "File Types"; HIGH.)
  - No public format spec. **NOT FOUND.**
  - Spark (macOS) files open in VCarve "V13 and later" (VEC-LLM), which points to future format changes.
- **Toolpath Template file**: extension and format **NOT FOUND**. Undocumented.
- **Tool database `.vtdb`**
  - The help documents import and export of "a tool database file" from the UI only (VS-P "Tool Database"; HIGH).
  - The format is SQLite according to community posts (LightBurn forum, Carbide forum; LOW; search results only).
  - Vectric itself states: "files/tool databases edited by 12.508+ can't be opened, or are read-only, in 12.507 and earlier" (VEC-LLM, AMM FAQ; HIGH). So the schema changes between point releases.
  - **Undocumented. Do not generate.**
- **Post-processor `.pp`**
  - A plain-text format documented in the help's "Post-Processor Editing" chapter: POST_NAME, FILE_EXTENSION, UNITS, `begin HEADER` blocks, variables such as [F], [S], [T]. (VS-P; HIGH.)
  - Documented, but we do not need to write one: bundled posts cover the Shapeoko.
- **Advanced Machining Module cabinet import** (paid add-on, VCarve Pro 12.508+)
  - Takes "A part list in CSV format" plus "A parts folder containing DXF files for all exported cabinet parts".
  - Uses a template `.crv` whose sheet names match CSV material names. Toolpaths use Selection Filters by layer, for example "PerimeterCut".
  - Nests and toolpaths automatically, and generates part labels (seven sizes; QR, barcode, Data Matrix).
  - Supports CabinetParts Pro, CabinetSense, KCD and Mozaik, and "other software using a Custom Mapping File". (VS-P "Cabinet Cut-list Import", "Advanced Machining Module"; VEC-LLM AMM page; HIGH.)
  - **The CSV columns and the Custom Mapping File format are NOT FOUND** in the help. The help says "please refer to the relevant documentation".
  - **This is the closest match to Sawhorse's export, worth a follow-up**, but it cannot be targeted until the mapping format is found.

### Carbide Create
- **`.c2d`**
  - Staff (William Adams, Aug 14 2021): "No official documentation... the file format has been something of a moving target." (https://community.carbide3d.com/t/c2d-file-schema/34985/2; MED.)
  - V7 and later: a SQLite file. "V7 uses a sqlite format 3 file the previous versions used a json file format". Gerry (no affiliation shown): data columns are compressed; there are `items` and `sqlar` tables; the "gcode row... is also encrypted"; toolpath data reads as JSON after `sqlar_uncompress`. (Jul 2022, https://community.carbide3d.com/t/utility-to-display-c2d-file-information/47336; LOW.)
  - The official V7 blog confirms "G-code is now stored in the C2D file" and "The new C2D file also compresses most of the data". (MED-HIGH.)
  - V8 changed the format again: "this is why the file format changed for V8"; "Create V6 files do not load into V8". (Blog Sep 9 2024, https://carbide3d.com/blog/create-v8/; MED-HIGH.)
  - Changelog: "Cutout toolpaths will not load in prior versions"; "V-Carve tool paths saved in 810 will not load correctly in prior versions". (C3D-CL.)
  - **No evidence anyone has made a CC-openable `.c2d` outside the program.** A 2024 user: "I can't find much info about the C2D file format." (https://community.carbide3d.com/t/creating-c2d-file-with-layers-directly-with-python/82323; LOW.)
  - **Undocumented, versioned, compressed, partly encrypted. Do not generate.**
- **Tool library**
  - Plain **CSV files** in the `tools` folder under About > Open Data Directory (Windows example: `C:\Users\<user>\AppData\Local\Carbide 3D\Carbide Create\tools`).
  - Staff: "It is an unsupported option to manually edit the underlying .csv file" and "there isn't much error-checking"; use a template or the New Library button.
  - The file name can limit a library to a machine, for example "Bits & Bits+Shapeoko+V1.0.csv" (user tip).
  - Sources: https://community.carbide3d.com/t/how-to-import-tool-library-database/92413 and /t/adding-a-custom-tool-library-with-csv-file/91485 (MED for staff lines, LOW for user lines).
  - **Column spec NOT FOUND. Treat as document-only.**
- **Create Pro post-processor (`.post`, JavaScript)**
  - Carbide publishes a base file and describes `onOpen`, `onClose` and `onSection`. "Note: this is a placeholder for a larger document." (https://guides.carbide3d.com/faq/create-pro-custom-post-processor/ and https://guides.carbide3d.com/files/custom-shapeoko.post; HIGH.)
  - Only relevant to Pro users.

---

## 8. Post-processors and the user's machine (Shapeoko 5 Pro 4x4, Carbide Motion, trim router)

### 8a. Machine facts
- **Travel and clearances** (the page is titled "Shapeoko 5.1 Pro Specifications"; values come from the page's own formulas in the HTML; HIGH): https://carbide3d.com/shapeoko/shapeoko5pro-specs/

  | Item | Value |
  |---|---|
  | Travel (4x4) | **1237 x 1237 mm** (`formatMM(1249-12)` for X and Y), about 48.7 in |
  | Z travel | **155 mm** (`165 - 10`); 140 mm with Sweepy Pro |
  | Table-to-Z clearance | 4 in with the Hybrid Table, 5 in without |
  | Gantry shift for joinery | 80 mm |
  | T-slot spacing | 102.6 mm |
  | Ballscrews | X/Y 16 mm diameter, 20 mm pitch; Z 10 mm pitch |
  | Homing | inductive homing switches, dual Y |

  - **Not checked**: whether the 5 Pro and 5.1 Pro travel figures are identical.
- **Homing corner: back right.** The official homing guide's manual workaround says to "Jog your machine all the way to the back right, and lift the Z to the maximum height... Enter G28.3... This sets the current position as home." (https://guides.carbide3d.com/start-here/troubleshooting-homing/; HIGH, implied.)
  - The 5 Pro re-squares with switches on each Y side and tolerates about 25 mm of initial out-of-square.
  - Machine coordinates of home: **NOT FOUND.**
- **Tool-change position**: front right. Carbide Motion changelog build 600: "Tool change location is on the front right for Shapeoko." (C3D-CL; HIGH that the line exists.)
- **Carbide Motion version**: stable **667** (2026-08-01), beta 704 (builds.json; HIGH). The download page links "instructions on setting up your Shapeoko with V6". The Shapeoko 5 Pro appears in the build 619 notes ("Y2 may not show in Setup Wizard for Shapeoko 5 Pro").

### 8b. Which post to pick
- **VCarve to Shapeoko / Carbide Motion**
  - Carbide staff (William Adams, May 19 2024): "Vectric has been bundling a post-processor for our machines since v8.5". (https://community.carbide3d.com/t/v-carce-12-with-a-shapeoko-5-por/77451; MED.)
  - Exact current display name: **NOT FOUND (official).** Forum names seen:
    - "Shapeoko (mm)" and "Shapeoko (in) (.gcode)" (2020, /27082)
    - "Shapeoko (inch) TOOLCHANGE(*.gcode)" and "Carbide Motion ATC (inches) (*.nc)" (2025, /90696). For the metric variant staff said only "the metric one".
    - All LOW.
  - A 2014 third-party copy of a Shapeoko inch post: `POST_NAME = "Shapeoko (inch) (*.gcode)"`, `UNITS = "INCHES"`, header `T1M6 / G17 / G20 / G0 [ZH] / G0 [XH] [YH] [S] M3`, arcs as `G2/G3 [X] [Y] [I] [J]`, footer `M30`. (https://gist.github.com/paulkaplan/8359822; LOW, not Vectric's current file.)
  - Units: a forum user says the post "inserts the appropriate command (G20/G21)". (/27082; LOW.)
  - **Recommendation (inference):** pick the Shapeoko / Carbide Motion **mm** post in VCarve's Machine Configuration, to match our mm DXFs. Confirm the name and the G21 header in the saved file.
- **Carbide Create to Shapeoko**
  - No post choice is needed in Core. "In Carbide Create V7, the G-code is saved into the Carbide Create design file". Saving standard G-code for any machine is Pro only. (https://carbide3d.com/carbidecreate/pro/ and /core-vs-pro/; HIGH.)
  - Carbide Motion "loads files directly from Carbide Create". CM 565 and later "adds a button to save the G-code to an external file". (https://carbide3d.com/carbidemotion/ ; V7 blog; HIGH / MED-HIGH.)
- **Onefinity**
  - Onefinity says posts are built into current Vectric: "Both of the latest versions of Vectric and Carveco have Onefinity post processors built in." (Feb 16 2024, https://www.onefinitycnc.com/post/unlocking-precision-understanding-cnc-cad-post-processors-for-vectric-and-carveco-products-on-onefi; HIGH.)
  - Elite (Masso): in Machine Configuration choose manufacturer "Onefinity", series "Elite (Masso)", your model, then accessories. (Official account, Jun 4 2025, https://forum.onefinitycnc.com/t/vectric-aspire-vcarve-pro-vcarve-desktop-post-processor-for-elite-masso-3-axis-rotary-rapidchange-atc-faq/33643; MED.)
  - Buildbotics: posts "Onefinity (MM).pp" and "Onefinity (Inch).pp", built into Vectric 10.5 and later. (Official account, May 2025, /32831; MED.)
  - Redline/RealTime controller posts were added to Vectric in Nov 2025. (/36165; MED.)
  - Carbide Create Pro post for Onefinity: a thread exists; not opened.
- **Avid (Mach4)**
  - "Avid CNC post processors are already included in Vectric Products v11+." Mach4 posts v3.0 (2021-09-14); EX/Centroid posts v1.2 (2025-02-17). (https://www.avidcnc.com/support/instructions/software/downloads/vectric/; HIGH.)
  - Exact display name **NOT FOUND**.

### 8c. G-code Carbide Motion accepts (input for a future GRBL / Carbide Motion writer)
- **Official list** (https://guides.carbide3d.com/faq/supported-gcodes/; HIGH; no date on the page): "supported on the Nomad and Shapeoko using Carbide Motion":

  | Code | Meaning or note |
  |---|---|
  | G0 | rapid |
  | G1 | linear at F |
  | **G2, G3** | arc at F |
  | G4 | dwell |
  | G17, G18, G19 | arc plane |
  | G20, G21 | inch / mm |
  | G28 | go to predefined position |
  | G28.2 | homing |
  | G40, G43, G49 | "Accepted but ignored" |
  | G54–G59 | "Accepted but ignored"; "Carbide Motion uses work coordinate systems internal and care must be taken... not to overwrite its settings" |
  | G90, G91 | absolute / relative |
  | M0 | pause/end |
  | M1 | optional stop |
  | M2 | end |
  | M30 | end; "may return the machine to the machine origin" |
  | M6 | tool change; "implemented in Carbide Motion to facilitate the Nomad tool length sensor" |
  | M3 | spindle on |
  | M5 | spindle off |
  | M7, M9 | "Accepted but ignored" |

  - **Not listed**: M4, M8, an explicit S or T word, G53, G28.3. The product page separately says Carbide Motion "accepts all common G-code commands". (https://carbide3d.com/carbidemotion/; HIGH.)
  - The homing guide uses G28.3 in the MDI.
  - Carbide's own Create Pro base post emits `G53G0Z-5` (section 8d), so G53 works in practice.
  - **Arc I/J vs R form: NOT FOUND.**
- **Trim router and S**
  - For a router without speed control, CM shows an on/off dialog that includes the speed. Staff: "Having the BitRunner enabled prevents the speed prompt from showing up, since it's part of the on/off dialog... If you disable the BitRunner... you should get the on/off prompts again which include speed settings." (Dec 27 2022, https://community.carbide3d.com/t/there-was-a-time-that-cm-told-me-to-set-the-router-speed/55525; MED.)
  - CM changelog: "RPM Popups should be back on Shapeokos" (617), "Router RPM popup with BitRunner enabled" (658), "Added the 'Turn Off Router' pop-up before parking at the end of a job" (657). (C3D-CL; HIGH that the lines exist.)
  - **Exact trigger (M3, an S change, or M6): NOT FOUND.**
- **Tool changes and BitSetter**
  - From CM 623, the tool is measured with BitSetter whenever Z zero is set, and "Run the program, tools are measured normally" (on M6).
  - For "a custom program without an M6 tool change", CM "mandates that you hit the 'Load Tool' button" on first run. (Blog Feb 7 2024, https://carbide3d.com/blog/bitsetter-changes-carbide-motion/; MED-HIGH.)
  - CM 642: "Added code to read a tool table from the G-code." CM 615: "Bounds checking when running a job." (C3D-CL.)
- **Writer target (inference)**: mm units (G21), absolute (G90), G0/G1 (optionally G2/G3 on G17), M6 Tn at tool changes so BitSetter measures, M3 Sxxxx with M5 at the end, M2 or M30. Avoid G54–G59 and G43.

### 8d. What Carbide Create's own output looks like
- Carbide's base Create Pro post (https://guides.carbide3d.com/files/custom-shapeoko.post; HIGH that the file says this):
  - defines `outputMetric = true` and `extension = "nc"`
  - writes `G90` then `G21` (or `G20`)
  - writes the safe retract `G53G0Z-5` (-5 mm in machine coordinates)
  - writes comments in parentheses, including Cutviewer `STOCK/BLOCK` and `TOOL/MILL` lines
  - at a tool change: `M05`, retract, `M6 T<n>`
  - spindle on: `M03 S<rpm>`
  - end: `M05`, `M02`
  - formats coordinates to 3 decimals in mm
  - **defines only `onLinear` and `onRapid` (no arc handler)**, so expect G0/G1 only, no G2/G3, from a post built on it
- The built-in Core output (stored in `.c2d`) cannot be inspected without CM's "save G-code" button or Pro. **NOT VERIFIED** that it matches this file.
- **For comparison fixtures (inference)**:
  1. In CC Core, save toolpaths into the `.c2d`.
  2. Open it in Carbide Motion.
  3. Use CM's save-to-file button (CM 565 and later).
  - Carbide also ran a web extractor: "drop your C2D file (From Carbide Create V7 or higher)". It is limited to original machine owners, and the page says "It will be removed in Aug. 2026"; it was still up on 2026-11-14. (https://my.carbide3d.com/extractgcode/; HIGH that the page says this.)

### 8e. Carbide Create command line or batch G-code export
- **NOT FOUND.** No CLI, scripting API or batch export appears in the Carbide guides, product pages or changelogs I read.
- Related items:
  - Pro "Save Standard G-code"
  - the beta "Send to Carbide Motion" (878, needs CM 702 or later)
  - the Pro post file is "loaded and evaluated each time you save G-code", which helps when iterating on a post, not with batch export (FAQ page; HIGH)

---

## 9. Two-sided machining (our `FLIP_` layers)

- **VCarve** (Desktop and Pro; the "Double Sided" job type appears in both V12.5 helps). HIGH, VS-P:
  - Job Setup offers "Double Sided" with **Flip Direction Between Sides** (horizontal or vertical) and "Zero off same side", which lets "Z Zero to reference the same physical location, regardless whether material is flipped or not".
  - "The software will automatically mirror your toolpaths and geometry... you must physically turn the material on your CNC machine in the same direction as you have specified."
  - Toolpaths can be Copied or Moved to the other side. Nesting has "Nest two-sided parts". Job sheets record side and flip direction.
  - Registration: the V9 help (still Vectric's own wording) says to turn the block over "whilst maintaining a common registration position" and that "The X Y Datum Position applies to both sides of the material". (https://docs.vectric.com/docs/V9.0/Cut2DDesktop/ENU/Help/Interface/Two-Sided%20Machining.html; HIGH for V9, likely the same in V12.)
  - **Pin or dowel method: NOT FOUND** in official docs. Forum advice: dowels or asymmetric holes (LOW).
- **Carbide Create**
  - No built-in two-sided job feature found. **NOT FOUND (official).**
  - Staff (Jan/Feb 2025): duplicate the geometry and use **Mirror Vertical** (corrected from Horizontal); "use the same corner for both operations"; centred dowel holes cut on side 1; "center doubles any alignment error".
  - Kevin Barnett (Carbide): cut a flip frame so side 1 defines the dimensions. (https://community.carbide3d.com/t/flip-cut-in-carbide-create/86342; MED.)
  - Build 879 beta adds "Flip Model command turns the 3D model over so the back of the part can be machined... Optionally flips the selected vectors too." It is listed without a PRO tag, but it concerns the 3D model. (C3D-CL; HIGH that the line exists.)
- **Implication for Sawhorse (inference)**: export `FLIP_` operations already mirrored for the chosen flip axis, plus registration holes on both sides. Or document how to mirror in each program. Either way, state the flip axis in the export.

---

## 10. Labels, nesting and edition differences

| Feature | VCarve Desktop | VCarve Pro | Carbide Create |
|---|---|---|---|
| Job size | 25 in square (help) / 24x24 in (compare) without tiling | Unlimited | No limit found; Pro has tiling. (core-vs-pro; HIGH) |
| True shape nesting | No (VEC-CMP) | Yes: Nest Parts with tool diameter and clearance, border gap, rotate, mirror, parts inside parts, two-sided parts (VS-P; HIGH) | **Pro**: "Added Nesting command. Consider this a work in progress" (build 840; C3D-CL) |
| Part labels | NOT FOUND | Only through the **Advanced Machining Module** cabinet import (paid): seven label sizes, part name, unit and sheet number, material, QR, barcode, Data Matrix (VS-P; HIGH) | NOT FOUND. Imported DXF text not supported (staff, Feb 2026) |
| Job setup sheet | No (VEC-CMP) | Yes: Create Job Sheet (HTML: layout thumbnail, material setup, toolpath list, times) (VS-P; HIGH) | NOT FOUND |
| Toolpath templates | No | Yes | Layer-linked toolpaths in a template `.c2d` (Core and Pro) |
| Platform | Windows only (Mac via Parallels, "limited" support) | Windows only | Mac and Windows |

- Platform sources: VEC-LLM FAQ; core-vs-pro; HIGH.
- Vectric's macOS product is **Spark**, with Cut Out (tabs, ramps), Cut Along, Pocket and Drilling. "Gadgets are not supported... automatic tool changing is not supported." Templates and nesting are not listed. (VEC-LLM Spark page; HIGH.)
- Our `LABELS` and `STOCK` layers: keep them for reference and hide them in both programs. Do not toolpath them. CC may drop text entities on import.

---

## Safe to generate vs. document only

| Artifact | Program | Public spec? | Evidence | Verdict |
|---|---|---|---|---|
| DXF (current export, layer-per-operation) | both | Yes (AutoCAD DXF) | Both import DXF with layers (CC since build 839) | **Generate** (already done) |
| Toolpath Template file | VCarve Pro | No; extension NOT FOUND | Help documents UI only | **Document only** (how to build it once by hand) |
| Job template `.crvt` / job `.crv` | VCarve | No | Help documents UI only; format moves with versions (Spark to V13 note) | **Do not generate** |
| Tool database `.vtdb` | VCarve | No (SQLite per community) | Vectric: 12.508+ databases unreadable in 12.507 | **Do not generate**; document the tool values to type in |
| Post-processor `.pp` | VCarve | Yes (help, "Post-Processor Editing") | Text format documented | Not needed (bundled Shapeoko post); document which to pick |
| AMM cut-list CSV + Custom Mapping File | VCarve Pro + paid module | NOT FOUND | Help says the feature exists; columns and mapping undocumented | **Document only**; revisit if Vectric publishes the mapping spec |
| `.c2d` job (with or without toolpaths) | Carbide Create | No ("No official documentation", staff 2021) | SQLite, compressed columns, encrypted G-code row (forum); format changed in V7 and V8 | **Do not generate.** Have the user build one template `.c2d` by hand instead |
| Tool library CSV | Carbide Create | No column spec | Staff: editing is "unsupported", "not much error-checking" | **Document only** |
| Create Pro post `.post` (JavaScript) | Carbide Create Pro | Partial (base file plus three hooks) | Published by Carbide | Not needed for a Shapeoko on Core |
| G-code for Carbide Motion | Carbide Motion | Yes (supported-codes list) | guides.carbide3d.com FAQ | **Feasible** for a future writer; compare against CC output |

---

## What I could not verify

1. Which unit VCarve 12.5 and Carbide Create assume for a unitless DXF, and whether either reads `$INSUNITS`. Only user reports, some from 2022.
2. Whether either program reads the LWPOLYLINE closed flag (code 70 bit 1) as a closed vector, and whether R12 POLYLINE and newer LWPOLYLINE differ. No official statement.
3. Whether layer names containing "." (POCKET_6.35MM) or other characters survive import unchanged in VCarve and CC.
4. The VCarve Toolpath Template file extension and format, and what "Set toolpath Cut Depth from imported vectors" does.
5. Whether a VCarve toolpath template can apply automatically on DXF open; none documented. Whether a `.crvt` job template with auto-select toolpaths works as an "import into template" route.
6. Whether VCarve's profile finishes all parts to one depth level before the last pass. This matters for onion-skin behaviour.
7. Carbide Create's written Job Setup fields (the official lesson is a video) and its tab count/spacing options.
8. Whether a CC Cutout toolpath can add tabs to DXF-imported vectors automatically, or tabs must be placed on each vector.
9. Island and overlap handling when several overlapping dado rectangles share one pocket layer (both programs).
10. The exact current name of VCarve's bundled Shapeoko / Carbide Motion post (mm vs inch), and the exact Avid Mach4 post name. Only forum names found.
11. Whether Carbide Motion accepts R-form arcs or I/J only, and exactly what triggers the router-speed popup (M3, S change, or M6).
12. Whether Core's built-in G-code inside `.c2d` matches the published `custom-shapeoko.post`, in particular whether Core emits G2/G3.
13. The Shapeoko 5 Pro home position in machine coordinates, and whether the 5 Pro and 5.1 Pro travel figures are identical.
14. Any Carbide Create command-line or batch export. None found.
15. Any third party successfully generating a `.c2d` that CC opens. None found.
16. The AMM CSV columns and Custom Mapping File format.
17. These search-result pages were not opened, and their claims are not relied on above:
    - the onion-skin and "Stock Bottom Offset" forum threads
    - the fouts-dev `.c2d` reverse-engineering blog (DNS failed)
    - Vectric gadget documentation
