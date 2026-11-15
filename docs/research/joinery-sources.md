<!-- The sources behind the Cabinet generator's dowels, Confirmat screws and full-height line boring (plugins/cabinet-generator/cabinet.js: DOWEL, CONFIRMAT, CONFIRMAT_LAYOUT, LINE_BORE, dowelLayout; docs/CNC-CABINETS.md, "Joinery: dowels and Confirmat screws" and "Full-height line boring"), copied from the research reports written on 2026-11-14. Only the parts the plugin uses are here, as they were written. Do not edit the findings: research again and replace the file. -->

# Joinery and line boring: the sources

Researched 2026-11-14. Every row below comes from a document opened during that research: a PDF whose text was extracted, a page rendered and viewed (marked **[drawing]**), or a web page fetched. Search snippets were not used as sources.

**Confidence**
- **High**: a manufacturer document with the value printed in its text.
- **Medium**: a manufacturer drawing label, a manufacturer document older than 2015 or hosted by a distributor, or a trade standard.
- **Low**: a distributor, retailer or forum.

"NOT FOUND" means it was looked for and no source was found.

**Documents**

| Key | Document | URL |
|---|---|---|
| HF-US11 | Häfele America catalogue, ch. 11 "Connectors and Shelf Supports" (2017, pages marked 2/15), printed pages FC 11.xx | https://p11.secure.hostingprod.com/@site.homedecorhardware.com/ssl/hafele-catalog-2017/11-Connectors-and-Shelf-Supports.pdf (hosted by a distributor; the file is Häfele's catalogue) |
| HF-UK | Häfele UK catalogue 2023, printed page 7.96 | https://files.hafele.co.uk/CatalogFiles/www/23T7-96.pdf |
| HF-UK-750 | Häfele UK catalogue 2023, printed pages 7.50 and 7.52 (Variantool-N, Unitool Multi) | https://files.hafele.co.uk/CatalogFiles/www/23T7-50.pdf , https://files.hafele.co.uk/CatalogFiles/www/23T7-52.pdf |
| BL-P32 | Blum Inc. *Process 32 Universal Boring Pattern*, drawing BUS0126 (rev. 4/12/04) | https://woodweb.com/knowledge_base_images/ms/Process32_041204.pdf (Blum's PDF hosted by WOODWEB) |
| AWS2 | AWI/AWMAC/WI *Architectural Woodwork Standards*, 2nd ed. (2014), Section 10 introduction | https://woodworkinstitute.com/wp-content/uploads/2015/05/Sec10_2ndEdAWS_SmBkMrkd_141001-3.pdf |

## What the plugin takes from these, and what it does not

| The plugin | From |
|---|---|
| Full-height pin rows: the lowest hole 46.5 mm above the bottom of the box, then every 32 mm up to the highest at least 56.5 mm below the side's top end | BL-P32: on a 775 mm (30 1/2 in) side, the first hole 56.5 mm below the top end, the last 46.5 mm above the bottom end, "672 (22 holes)" (section 2). **The generalisation is Sawhorse's own**: Blum draws one side height. Sawhorse measures the 46.5 from the bottom of the box (the side's bottom end with no toe kick; the top of the toe-kick notch with one), as Blum measures its hinge-plate holes "from bottom of cabinet side", and fills the 32 mm grid up to the 56.5 mm limit. A 775 mm side with no toe kick gives Blum's 22 holes exactly. |
| Pin holes 5 mm, 10 mm deep, rows 37 mm from the front and the rear row on the same grid | Unchanged from before this work: the planner's existing pin hole and rows (`PIN`). The depth is derived from pin lengths; no maker prints a line-bore depth (section 2, NOT FOUND). |
| Dowels 8 mm, 37 mm from the front and back edges of each joint | HF-US11 FC 11.124, Häfele's case-dowelling drawing (section 3) |
| At least 3 dowels a joint up to 18 in deep, 4 up to 24 in; deeper is refused | HF-US11 FC 11.124: "up to 18"": "Min. 3 dowels"; "up to 24"": "Min. 4 dowels". Häfele gives no count deeper than 24 in, so Sawhorse refuses rather than invent one. Sawhorse drills exactly the least count. |
| The dowels between the front and back ones on the 32 mm grid, counted from the front one | AWS2: dowel joints are "often based on" 32 mm spacing. **Descriptive, not a requirement.** Which grid points (the nearest to evenly spaced, each keeping 3 mm of wood to the back dowel) is Sawhorse's choice. |
| Dowel holes 11 mm into the side's face (CNC), 25 mm into the rail's edge (doweling jig) | HF-UK 7.96: **Häfele's 8 mm permanent assembly dowel, one product**: 25 into the shelf (edge), 11 into the side panel (face), "For minimum wood thickness 18 mm". No maker's depth table for a plain 8 mm wood dowel was found (section 3). Stock under 18 mm is built with a Check row that quotes Häfele. |
| A dowel of 8 mm, no longer than 36 mm, on the shopping list, in words | The two hole depths added (11 + 25). No part number: the holes are one product's, and Häfele's assembly dowel is not a plain wood dowel. |
| Confirmat: a 7 mm through hole in the side (CNC), no countersink cut | HF-US11 FC 11.161: "Through-hole for Confirmat shank" Ø7; self-countersinking type: "Countersink is not necessary as the nibs countersink hole" (section 1) |
| Confirmat: a 5 mm pilot in the rail's edge (jig), depth per the screw maker's instructions | HF-US11 FC 11.161: "Drill hole: Ø5 mm". The pilot's depth: NOT FOUND. |
| Confirmat lengths 50 and 70 mm, Häfele 264.44.190 and 264.44.194 | HF-US11 FC 11.161: the self-countersinking connector, pointed tip, PZ3, in 50 and 70 mm. Häfele's 40 mm Confirmat (264.42.099) is not listed as self-countersinking, so it is not offered. |
| Confirmat screws placed where Häfele's dowels go | **No Confirmat edge distance or spacing was found in a maker's document** (section 1). The panel, the rows and the docs say: "Häfele's dowel layout; no confirmat spacing was found in a maker's document". |
| 3 mm of wood behind and beside each hole; stock at least 14 mm for dowels (11 + 3; 8 + 2 x 3), 11 mm for Confirmat (5 + 2 x 3) | The planner's own 3 mm rule (`WEB`), not a sourced figure. |

## 1. Confirmat (one-piece connector) screws

From `cabinet-standards-2.md` § 1.

| Item | Value | Unit | Source URL | Document / page | Conf. |
|---|---|---|---|---|---|
| 7 mm one-piece connector: hole in the edge (pilot) | Ø5 ("Drill hole: Ø5 mm") | mm | HF-US11 | FC 11.161, "One-piece Connector" and both "Self-countersinking Connector" blocks | High |
| 7 mm connector: hole through the face piece | Ø7, labelled "Through-hole for Confirmat shank" | mm | HF-US11 | FC 11.161 drilling sketch **[drawing]**; also FC 11.160 | High |
| 7 mm connector: shank / head | Shank Ø7, head Ø10 | mm | HF-US11 | FC 11.161 | High |
| 7 mm lengths and part numbers | 40 mm: 264.42.099 (PZ3). 50 mm: 264.42.197 (PZ3), 264.43.192 (hex SW4). 70 mm: 264.42.299 (PZ3), 264.43.299 (hex). Bronzed and black variants are also listed. | – | HF-US11 | FC 11.161 table | High |
| Self-countersinking 7 × 50 / 7 × 70 | Pointed tip: 264.44.190 / 264.44.194 (PZ3), 264.43.164 (hex, 50 only). Tapered tip: 264.44.180 / 264.44.184, 264.43.160 (hex). | – | HF-US11 | FC 11.161 | High |
| Is the face hole countersunk? | **Not needed for the self-countersinking type.** Häfele: "Countersink is not necessary as the nibs countersink hole". | – | HF-US11 | FC 11.161, "Confirmat" bullet list | High |
| Countersink diameter (when drilled) | Ø10. This is the third step of Häfele's special bit 001.22.645 ("1st step Ø5 / 2nd step Ø7 / Countersunk Ø10"). | mm | HF-US11 | FC 11.162 "Special Drill Bit" table | High |
| Stepped bit for 7 mm Confirmat | Häfele 001.22.645: Ø5 / Ø7 / countersink Ø10, length 150 mm, HSS, "For use with Zentrix drilling system" | mm | HF-US11 | FC 11.162 | High |
| Countersink **depth** | NOT FOUND. No Häfele page gives a depth. | – | – | – | NOT FOUND |
| Pilot (edge) hole **depth** | NOT FOUND from a manufacturer. | – | – | – | NOT FOUND |
| Minimum distance from front and back edges | **NOT FOUND from a manufacturer.** Forum only: "no more than 36 mm from each edge", attributed from memory to AWI. Not used. | mm | https://woodweb.com/knowledge_base/Confirmat_screw_spacing.html | WOODWEB thread | Low |
| Spacing between screws | **NOT FOUND from a manufacturer.** Forum only: "AWI requires that the Confirmats be no farther than 128 mm on center"; "four in a 600 mm-deep base cabinet and three in a 305 mm-deep wall unit". The AWS 2nd-edition Section 10 excerpt opened does not mention Confirmats. Not used. | mm | same | same | Low |

## 2. System 32 line boring

From `cabinet-standards-2.md` § 2 and `cabinet-standards.md` § 7.

| Item | Value | Unit | Source URL | Document / page | Conf. |
|---|---|---|---|---|---|
| End offsets of the hole rows, 775 mm (30-1/2") side | First hole **56.5 mm below the top end**, last hole **46.5 mm above the bottom end**, 672 mm between them ("672 (22 holes)", 21 × 32). | mm | BL-P32 | PDF p.3, drawing "Base bore pattern for all Blum runners", BUS0126 page 1 **[drawing]** | Medium (2003/04 drawing) |
| Same offsets on a 30-1/2" wall cabinet | The wall-cabinet side is drawn on the same dashed hole lines, so it uses the same 56.5 / 46.5 | mm | BL-P32 | PDF p.3 **[drawing]** | Medium |
| Row setbacks, 24" (610 mm) base | Front row 37 from the front; centre row 224 behind it ("Center row of holes req'd. for TANDEMBOX"); rear row 517 from the front row, 93 from the back | mm | BL-P32 | PDF p.3 **[drawing]** | Medium |
| Row setbacks, 12" (305 mm) base and wall | 37 front, 192 between rows, 76 from the back | mm | BL-P32 | PDF p.3 **[drawing]** | Medium |
| Hole diameter and pitch | "Ø 5 typ.", "32 c. to c. typ." | mm | BL-P32 | PDF p.3 | Medium |
| Hinge-plate positions | "System hole locations for hinge mounting plate – Measured from bottom of cabinet side" | mm | BL-P32 | PDF p.4 (BUS0126 p.2) | Medium |
| Front row setback (Häfele) | 37 mm from the front edge (Variantool-N and Unitool Multi); Ø3 or Ø5 holes "consistently at 32 mm intervals" | mm | HF-UK-750 | p.7.50, p.7.52 | High |
| Rear row setback (Häfele) | Variantool-N: 69 mm from the back edge. Unitool Multi: 60 mm from the rear edge. **The two Häfele jigs disagree.** The planner keeps its existing rear row (on the 32 mm grid from the front row) and does not pick either. | mm | HF-UK-750 | p.7.50, p.7.52 | High (both quoted) |
| A general manufacturer line-bore depth for 5 mm construction or shelf-pin holes | NOT FOUND (Häfele US ch. 11, Blum EU 2027/28, Blum Process 32, Hettich *Connecting technology* 2016 and the Hettich furniture technology guide were searched) | – | – | – | NOT FOUND |

## 3. Dowel joints with 8 mm dowels

From `cabinet-standards-2.md` § 3.

| Item | Value | Unit | Source URL | Document / page | Conf. |
|---|---|---|---|---|---|
| Distance of dowels from front and back edges (Häfele) | **37 mm** from the front edge and 37 mm from the back edge, in Häfele's drawing for case dowelling | mm | HF-US11 | FC 11.124 "Dowels", drawing next to the pre-glued dowel **[drawing]** | Medium (drawing label) |
| Number of dowels by panel depth (Häfele) | "up to 18"": "Min. 3 dowels"; "up to 24"": "Min. 4 dowels" | – | HF-US11 | FC 11.124 **[drawing]** | Medium |
| 8 mm dowel sizes offered (Häfele US) | 8 × 25, 30, 32, 35, 38, 40, 50 (fluted, 267.83.2xx); pre-glued 8 × 25–38 (267.84.2xx) | mm | HF-US11 | FC 11.124 | High |
| Spacing (AWS) | "DOWEL JOINT – An established industry standard assembly method, this versatile joinery technique is often based on 1-1/4" (32 mm) spacing of dowels." | mm | AWS2 | Section 10 introduction, printed p.293, Fig. 10-045 | Medium (descriptive, not a requirement) |
| Häfele Ø8 permanent assembly dowel (267.24.300 for Ø8/5 holes; 267.26.000 for Ø8/8) | Part lengths: **25 into the shelf (edge)** and **11 into the side panel (face)**; "For minimum wood thickness 18 mm" | mm | HF-UK | 7.96 **[drawing]** | Medium |
| Hole depth, face and edge, for a plain 8 mm wood dowel (manufacturer) | NOT FOUND. A WOODWEB article's 2/3 : 1/3 rule gives about 23.3 / 11.7 mm for 8 × 35, close to Häfele's 25 / 11 for its assembly dowel. Not used. | mm | – | – | NOT FOUND |
| Lamello, Würth or Blum dowel depth table | NOT FOUND | – | – | – | NOT FOUND |
