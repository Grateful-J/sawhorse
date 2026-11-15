# Row features: sources

The Cabinet generator's finished ends, fillers, toe-kick skins, appliance openings and sink check (plugins/cabinet-generator `trim.js`, `trimsizes.js`, `row.js`) use only the values below. Each was read in the maker's or standard's own document during the 2026-11-14 research rounds. Confidence is the research's own:
- **High**: a maker's document, the value printed in its text.
- **Medium**: a drawing label, an older document, a document hosted by a distributor, or a trade standard.

Appliance values differ between models. Each preset names the maker and model family it comes from, and the panel says to check your appliance's installation guide. None is a universal rule.

Where Sawhorse uses a number that no source gives, it says so here and in the panel: those are Sawhorse's own starting values, not standards.

## Finished ends and applied end panels

| What | Value | Source | Where | Conf. |
|---|---|---|---|---|
| Default finished end (AWS) | "FINISHED ENDS shall be INTEGRAL, not applied secondarily" by default | AWI/AWMAC/WI Architectural Woodwork Standards, ed. 1 (2009), sec. 10, https://woodworkinstitute.com/wp-content/uploads/2014/09/WI_AWS_sec10NM.pdf | §1.2.7.2, p.3 | Medium |
| Exposed edges | "Visible front edges of stretchers, ends, divisions, tops, bottoms, shelves, and nailers" are exposed exterior surfaces | same | §1.2.10.1.4, p.2 | Medium |
| Applied (plant-on) end panels | Scribe to wall and to floor; usually flush with the door face; secure with 1-1/8" screws from inside the cabinet | Decor Cabinets Installation Guide (May 2022), https://academy.decorcabinets.com/wp-content/uploads/2024/08/Installation-Guide_Decor.pdf | Step 5, p.5 | High (for that brand) |
| Scribe width (AWS Cabinet Design Series) | "scribes at wall-to-wall installations not exceeding 1-1/2" (38.1 mm) in width" | AWS, URL above | §1.2.20.1.4, p.11 | Medium |
| Installer's scribing limit | Wall variation over 1/4" (6.4 mm), or floor variation over 1/2" (12.7 mm), in 144" is not the installer's responsibility to scribe | AWS, URL above | §1.5.2, p.13 | Medium |

**What Sawhorse does with them**
- An end panel is a part of its own: a finished end applied to the cabinet's side, in the carcass or the door plywood. AWS's default is an integral end (the side itself, finished); an applied panel is the alternative Decor's guide describes.
- **Front**: flush with the door face (Decor: "usually flush with the door face"), or with the carcass front. A choice.
- **Bottom**: to the floor over the toe kick, or flush with the cabinet's bottom (the toe kick's top). A choice; no source picks one.
- **Fastening**: screws from inside the cabinet (Decor's 1-1/8"). The plugin drills nothing for them: no source gives a hole pattern.
- **Scribe allowance**: a field, starting at 0 (none). It is not a standard. AWS's 1-1/2" is the widest scribe its Cabinet Design Series allows at wall-to-wall installations; the panel warns above it, and does not refuse.
- **Edge banding**: the front edge, AWS's "visible front edges of ... ends", in the band the cabinet's carcass front edges take. The bottom and top edges as you choose (a wall cabinet's bottom edge shows).

## Fillers and scribes

| What | Value | Source | Where | Conf. |
|---|---|---|---|---|
| What fillers are for | Fillers or filler overlay sets are used where a run meets a wall, a deeper cabinet or a deeper panel, so doors and drawers clear. "The installer will scribe the fillers as needed"; attach the filler to the cabinet before installing it. | Decor Cabinets Installation Guide (May 2022), URL above | Step 4, p.4–5 | High (for that brand) |
| Blind-corner filler (KraftMaid) | "A 3" Base Filler (BF) is included with each Base Blind Corner (BBC) cabinet" | 2016 KraftMaid Spec Book (The Home Depot), https://s3.amazonaws.com/FlippingBookStorage/Marketing/2016/2016%20KraftMaid%20Spec%20Book%20-%20The%20Home%20Depot/files/assets/basic-html/page-246.html | page-246 (E23) | Medium (2016, face-frame line) |
| KraftMaid base fillers | BF3, BF6, BF3X3: 3 and 6 wide, 3/4" solid wood, 30" high, "No toe kick" | KraftMaid 2016, page-282.html (same URL pattern) | page-282 (E59) | Medium |
| KraftMaid filler rule | Use fillers with full overlay door styles "when cabinets will be against a return wall, box, pilaster or column" | same | page-282 | Medium |
| KraftMaid junction rule | "Fillers are always recommended at both sides of cabinet junction points to allow for wall variations and drawer clearances." | KraftMaid 2016, page-288.html | page-288 (E65) | Medium |
| IKEA wall allowance (planning guide) | "Place a filler piece (minimum 50 mm) between base as well as wall cabinets and the wall to ensure space enough to open doors and drawers fully." | IKEA kitchen planning guide, https://www.ikea.com/es/en/files/pdf/0a/61/0a610c65/ikea_kitchen_planning_guide_eng.pdf | PDF p.7, tip 07 | High |
| IKEA wall allowance (Canada checklist) | "Any cabinet against the wall requires a minimum of 1"." Fillers are cut from cover panels. **Disagrees with the 50 mm above.** | IKEA Canada kitchen planning checklist, https://www.ikea.com/ca/en/files/pdf/f0/b4/f0b40f30/kitchen_planning_checklist_en.pdf | PDF p.2 | High |
| IKEA scribing method | Filler cut to cabinet height; trace the wall with a "small block of wood about 1¼" thick" and a pencil; screw through the cabinet into the filler | IKEA US kitchen installation guide (March 2026), https://www.ikea.com/us/en/files/pdf/49/6f/496ff2f6/kitchen_installation_guide_mar_2026.pdf | PDF p.7 | High |
| A general filler width table | NOT FOUND. No source gives one. | — | — | — |

**What Sawhorse does with them**
- A filler is a strip of the width you type, beside the cabinet: against a wall, or between this cabinet and the next. The row counts its width: the next cabinet stands past it.
- **Starting width**: 3 in in an inch document (a width KraftMaid sells, BF3, and the filler KraftMaid ships with each blind corner base); 50 mm in a metric document (IKEA's planning guide minimum between a cabinet and a wall). Starting values, not a general standard: IKEA's own Canadian checklist says 1".
- **Height**: the cabinet's box, above the toe kick (KraftMaid's base fillers have "No toe kick"). Its face is flush with the carcass front, in the end panels' stock (carcass or door plywood).
- **Scribe filler**: the strip is cut wider by the scribe allowance, on its wall side, for you to scribe by hand (Decor: "The installer will scribe the fillers as needed"; IKEA's method above). The row counts the filler's nominal width, the width after scribing.
- **Fastening**: screw through the cabinet into the filler (IKEA), attached before installing (Decor). Nothing is drilled.
- Not banded: its face shows, its edges are against the cabinet and the wall.

## Toe kicks

| What | Value | Source | Where | Conf. |
|---|---|---|---|---|
| Toe space minimum (KCMA) | If a toe kick is used: at least **2 in (51 mm) deep** and **3 in (76 mm) high** | ANSI/KCMA A161.1-2022, https://kcma.org/sites/default/files/2024-08/KCMA%20A161.1%202022%20High%20Res.pdf | §2.3, p.3 | High |
| Toe kick, one maker | "Standard toe kick dimensions are 4″ high and recessed 3 ½″"; inset kick is 1/2" engineered wood | Shenandoah Cabinetry spec guide, https://shenandoahcabinetry.com/content/dam/sites/shenandoah-site/documents/catalogs-guides-and-planning-documents/Standard_Cabinet_Specs.pdf.coredownload.inline.pdf | "Inset Toe Kick", PDF p.3 | High (for that brand) |
| Toe kicks | "Scribe the toe kick as needed" | Decor Installation Guide, URL above | Step 7 | High (for that brand) |
| Applied toe-kick skins | NOT FOUND: no maker's source for skins was found. | — | — | — |

**What Sawhorse does with them**
- A skin is a strip of the stock you choose (the carcass, door or back plywood), in front of the toe kick, as tall as the toe kick (the cabinet's **Kick height**, or the base frame's **Height**). Its thickness is that stock's, as measured in **4 · Materials**.
- KCMA's minimums are checks: the panel warns when the toe space is under 3 in (76 mm) high, or under 2 in (51 mm) deep once the skin is in front of the kick. It never refuses.

## Appliance openings

### Dishwashers

| Preset | Value | Source | Where | Conf. |
|---|---|---|---|---|
| GE built-in (PDT750 family) | "at least 24" deep, 24" wide and approximately 34-1/2" high from floor to underside of the countertop" | GE install instructions, Pub. 31-31546 (09-14), https://assets.ajmadison.com/ajmadison/itemdocs/PDT750SSFSSInstallation.pdf | p.3 | High |
| GE built-in (PDT750 family), Figure A | Floor to underside of the countertop: 34-1/2" ± 1/4" (34-1/4" to 34-3/4"). The ± was read from the PDF's extracted text ('+ 34-1/2"  1/4"'); the plus-minus glyph should be checked against the drawing. | GE install instructions, Pub. 31-31546 (09-14), https://assets.ajmadison.com/ajmadison/itemdocs/PDT750SSFSSInstallation.pdf | Figure A | Medium |
| GE built-in (PDT750 family), Figure B | Floor to underside of the countertop: 33-1/2" to 34-3/4". Which models each figure is for is not stated in the text read. | GE install instructions, Pub. 31-31546 (09-14), https://assets.ajmadison.com/ajmadison/itemdocs/PDT750SSFSSInstallation.pdf | Figure B | High |
| Bosch (US guide) | "opening is at least 33 7/8" (860 mm) high and 24" (610 mm) wide" | Bosch dishwasher installation instructions 9002059336 A, https://media3.bosch-home.com/Documents/9002059336_A.pdf | p.9 and p.12 | High |
| Bosch fully integrated panel model | Width 23 5/8"–24 1/4" (600–616 mm); height 32"–34 1/4" (813–870 mm) | Bosch 9001450387 C, "Installation Guide for Fully Integrated Door Panel", https://media3.bosch-home.com/Documents/9001450387_C.pdf | p.7 Fig. 1 | High |

### Ranges (30 in)

| Preset | Value | Source | Where | Conf. |
|---|---|---|---|---|
| Frigidaire freestanding (FFEF3003U) cutout | Height (standard) 36"; width (min.) 30"; depth (min.) 24" | Frigidaire FFEF3003U spec (06/18), https://frigidaire.bynder.com/m/5bd4c04d961d8ad3/original/FFEF3003U_0618_EN-pdf.pdf | p.2 | High |
| Frigidaire freestanding clearances | 30" minimum to an unprotected overhead cabinet (24" if protected as specified); overhead cabinets at most 13" deep | same | p.3 | High |
| Frigidaire slide-in (FGDS3065P) cutout | Width 29-15/16" min / 30-1/16" max; height 35-7/8" min / 36-5/8" max; depth 21-3/4" min / 22-1/8" max (24" with optional backguard) | Frigidaire FGDS3065P spec (07/14), https://assets.ajmadison.com/ajmadison/itemdocs/FGDS3065PF_Specs.pdf | p.2–3 | High (2014) |
| Frigidaire slide-in overhead cabinet depth | At most 13" | same | p.3 | High |
| GE slide-in (JS760), cabinets above | "no deeper than 16"". **Disagrees with Frigidaire's 13".** | JS760DPWW manual (manuals.plus copy), https://manuals.plus/ge-appliances/js760dpww-30-slide-in-electric-convection-range-manual.pdf | p.6 | Medium |

### Refrigerators

| What | Value | Source | Where | Conf. |
|---|---|---|---|---|
| GE / GE Profile French-door | Sides 1/8" (3 mm); top 1" (25 mm); back 2" (50 mm) | GE install instructions 49-60792 Rev. 3, https://images.thdstatic.com/catalog/pdfImages/ba/baa7e37f-5f38-4aa1-9145-16cabf2d3486.pdf | "CLEARANCES", p.3 | High |
| Whirlpool WRS588FIH | 1/2" on each side and at the top; 1" behind; 2" minimum on the hinge side next to a fixed wall, "depending on your model" | Whirlpool dimension sheet W10768947A (1/17), https://assets.ajmadison.com/ajmadison/itemdocs/WRS588FIH-dimension_sheet.pdf | p.1 | High |
| The two disagree | Sides 1/8" against 1/2"; top 1" against 1/2"; back 2" against 1" | — | — | — |
| Frameless cabinets beside a fridge | "frameless cabinets may require filler strips to prevent interference with cabinet door swing. The opening must allow for filler strips." | Monogram built-in side-by-side install, Pub. 49-60314, https://products-salsify.geappliances.com/image/upload/s--TIrgAE8y--/6d2320c59acf3758d3068a35bd54d8626edbfa0e.pdf | p.4 | High |
| Freestanding opening widths for 30 / 33 / 36" | NOT FOUND. The opening is the model's case width plus its maker's clearances. | — | — | — |

### Over-the-range microwave

| What | Value | Source | Where | Conf. |
|---|---|---|---|---|
| Space width | "The space between the cabinets must be 30" wide"; a Filler Panel Kit may be used if the space is wider | GE OTR install, Pub. 49-40765 (03-16), https://assets.ajmadison.com/ajmadison/itemdocs/JVM6175YKFS_installation.pdf | "Mounting Space", p.7 | High |
| Height | "66" or More from the Floor to the Top of the Microwave"; "Bottom Edge of Cabinet Needs to be 30" or More from the Cooking Surface" | same | p.7 | High |
| Wall cabinet depth above | "13" max: for standard installation"; a 15" depth needs kit JX15BUMPWW/BB | same | p.7 | High |

### Built-in wall ovens (30 in): listed, no preset

Wall ovens go in a tall cabinet, not in a gap in a row, so there is no opening preset for them. For reference:

| What | Value | Source | Where | Conf. |
|---|---|---|---|---|
| GE Profile PTS700RSN cutout | Cabinet 30"; width 28-1/2" min / 28-5/8" max; height 27-1/4" min / 27-5/16" max; depth 23-1/2" min | GE spec (rev. 3/23), https://static.pcrichard.com/docs/PTS700RSNSS_Quick_Specs.pdf | p.1 | High |
| Bosch HBL8451UC cutout | "27" – 28 5/8" x 28 1/2" x 23 1/2"" (H × W × D) | Bosch spec (07/18), https://media3.bosch-home.com/Documents/specsheet/en-US/HBL8451UC.pdf | p.1 | High |

**What Sawhorse does with them**
- An opening is space in the row where no cabinet goes, the width you set, beside a cabinet. Nothing is cut for it.
- Picking a preset sets the opening's starting width from that preset's source. Every check is a warning, never a refusal.
- **Dishwasher**: the width against the preset's (GE at least 24"; Bosch at least 24" (610 mm); Bosch fully integrated 600–616 mm). The height under the countertop, taken as the top of the cabinets beside the opening above the floor: GE approximately 34-1/2" (a warning under it, since "approximately" is not a minimum); Bosch at least 33-7/8" (860 mm); Bosch fully integrated 813–870 mm. GE's 24" depth is shown, not checked: the countertop's front edge, which bounds the opening's depth, is not modelled.
- **Range**: freestanding, width at least 30"; slide-in, 29-15/16" to 30-1/16". Cabinets of the plugin's above the opening deeper than 13" (Frigidaire's overhead limit) are warned of; GE's slide-in manual allows 16", and the panel says the two disagree.
- **Refrigerator**: you type the width, the fridge's case width plus its maker's clearances. The panel shows GE's and Whirlpool's clearances, which disagree, and Monogram's note on fillers beside frameless cabinets. It starts at no width (0), so nothing is assumed: the panel asks you to type it.
- **Another opening**: the same, for an appliance with no preset.
- **Over-the-range microwave**: not a gap in a row. The microwave hangs under a wall cabinet, which stands in the wall row like any other. Tick **An over-the-range microwave hangs under it** on that wall cabinet. Its width is checked against GE's 30" (the space between the cabinets, which that cabinet fills), and its depth against 13" (the carcass, without its doors). Its bottom less than 66" above the floor is warned of. The floor is the model's ground (z = 0). GE's 30" from the cooking surface is in the panel's text, not checked: the cooktop's height is not modelled.
- In a metric document the metric figure is used where the maker prints one (Bosch's 610 mm and 860 mm); in an inch document the inch figure.

## Sink bases (Kohler)

| Sink | Minimum base cabinet | Source (https://techcomm.kohler.com/techcomm/pdf/…) | Where | Conf. |
|---|---|---|---|---|
| 24" undermount single (Vault K-3894) | 27" (686 mm) | `K-3894_spec_US-CA_Kohler_en.pdf` | spec sheet, p.1 | High |
| 25" single (Vault K-3822-4; Staccato K-3362-4) | 27" (686 mm) | `K-3822-4_…`, `K-3362-4_…` | p.1 | High |
| 32–33" single or double (K-3145-4, K-3346-4, K-3672, K-3821-4, K-3820-4, K-3823-4, K-5285, K-5281, K-5284, K-3361-4) | 36" | each `K-xxxx_spec_US-CA_Kohler_en.pdf` | p.1 | High |
| 35" undermount single (Strive K-5283) | "36"–39" (36" may require cabinet modifications)" | `K-5283_…` | p.1 | High |
| Farmhouse 35-3/4" (Whitehaven K-6489) | "Fits minimum 36" (914 mm) apron sink base cabinet" | `K-6489_…` | p.1 | High |
| Farmhouse 35-1/2" short apron (K-6488) | 36" minimum | `K-6488_…` | p.1 | High |

**What Sawhorse does with them**
- Type the sink's width on the cabinet. A sink 24" to 25" wide asks for a cabinet at least 27" wide; 32" to 33", at least 36"; 35", at least 36" (and Kohler's note that 36" may need modifications); a farmhouse (apron) sink, at least 36". A narrower cabinet is warned of. A sink of another width has no Kohler rule here, and the panel says so.
