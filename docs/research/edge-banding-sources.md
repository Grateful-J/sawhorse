<!-- The sources behind the Cabinet generator's edge banding (plugins/cabinet-generator/cabinet.js, BAND and bandPart; docs/CNC-CABINETS.md, "Edge banding"), copied from the research reports written on 2026-11-14. Only the parts the plugin uses are here, as they were written. Do not edit the findings: research again and replace the file. -->

# Edge banding: the sources

Researched 2026-11-14. Every row below comes from a document opened during that research: a PDF whose text was extracted, a page rendered and viewed, or a web page fetched. Search snippets were not used as sources.

**Confidence**
- **High**: the manufacturer's own document, with the value in its text.
- **Medium**: a manufacturer drawing label, a manufacturer document read through a third-party host or a summary, an old document, a trade standard, an owner's spec, or trade-software documentation.
- **Low**: a distributor or a forum.

"NOT FOUND" means it was looked for and no source was found.

## What the plugin takes from these, and what it does not

| The plugin | From |
|---|---|
| Finished part = cut blank + bands: each banded edge's blank is cut short by its band's thickness | Geometry. **No edgeband or machine maker states this rule** (section 3). Of the trade software read (section 3): OptiCut deducts the edging thickness "when working in net dimensions"; Mozaik's help says to set the band to 0 mm when the bander pre-mills, "to ensure Mozaik is not deducting anything"; Promob's worked example subtracts the band; Microvellum's pre-mill modes remove or add it. |
| Every cut stays where it is in the finished part | Blum gives the cup's boring distance from the door's edge, and the plates and runner screws 37 mm from the side's front edge; with a band on, that edge is the band's face. The planner keeps its 3 mm of wood to the raw edge under the band, after any pre-mill. |
| Band thicknesses offered: 0.018 in (0.457 mm), 1, 2, 3 mm, or measured | REHAU's stock sizes (section 1). REHAU gives the thin band as .018" only; 0.457 mm is the conversion. |
| A typed thickness of 0.1 to 6.35 mm (1/4 in); a band at least as wide as the stock it covers | **Sawhorse's limits, not sourced rules.** |
| Widths to start: 15/16 in (inch documents), 23 mm (metric) | REHAU stocks 15/16 in; Ostermann's standard widths include 23 mm (section 1) |
| Which edges to start: the front edges of the sides, top, bottom, fixed shelves and front stretcher; an adjustable shelf's front edge | AWS 2009, section 10 (section 2) |
| Doors and drawer fronts banded all round | One owner's spec: all exposed edges; 3 mm on doors and drawer fronts, 1 mm elsewhere (section 2). **One spec, not a standard.** |
| Waste: 1 in per banded side (on each part), then 5% (the shopping list's banding overage, once on the total) | Microvellum's edgeband report (section 4). **A software default, not a standard.** |
| An edge with a notch at its end (a toe kick, a rail's tongues) counts its whole run | Sawhorse's choice: on an edgebander the band runs across the notch and is trimmed by hand at its inside corner. Not sourced. |
| Nailers not banded, though AWS counts their visible front edges as exposed | The nailers here sit behind the back at the rear edge: no front edge of theirs shows. |
| Edgebander pre-mill, 0 to 3 mm, default 0 | Felder and SCM edgebanders (section 3). An iron-on band takes none. |
| Measure the band with calipers | REHAU's thickness tolerance, +-0.10 to +-0.15 mm (section 1) |

Not used: the overhang before trimming and the scraper's removal (they concern the edgebander, not the cut size); a threshold below which a band is not deducted (NOT FOUND).

## 1. Bands sold

From `cabinet-standards.md` § 1a.

| Item | Value | Source URL | Document / page | Conf. |
|---|---|---|---|---|
| Edgeband polymers offered | PVC, ABS, PP (polypropylene), PMMA (acrylic) | https://www.rehau.com/downloads/886866/edgeband-technical-data-sheet.pdf | REHAU, Inc. "REHAU edgeband Technical data", p.1 §2 | High |
| Thin stock sizes (width × thickness) | 3/4 × .018", 5/8 × .018", 7/8 × .018", 15/16 × .018", 1-5/16 × .020" | same | p.2 "Standard stock sizes" (SpectraEdge Rigid – Thin) | High |
| 1 mm stock | 15/16" × 1 mm | same | p.2 | High |
| 2 mm stock | 7/8" × 2 mm, 15/16" × 2 mm | same | p.2 (SpectraEdge Rigid – Thick) | High |
| 3 mm stock | 15/16" × 3 mm, 1-5/16" × 3 mm (rigid and FlexEdge semi-rigid) | same | p.2 | High |
| Thickness tolerance | 0.9–1.0 mm: ±0.10 mm; 1.1–1.6 mm: ±0.15 mm; 1.7–3.9 mm: ±0.15 mm (embossed: an extra −0.05 to −0.10 mm) | same | p.2 "Size availability" table | High |
| Coil lengths | 600 ft (182.88 m) for bands under 0.8 mm; 400 ft (121.92 m) for 2 mm; 300 ft (91.44 m) for 3 mm | same | p.3 "Packaging" (metres converted here) | High |
| Edge thickness range of a small automatic edgebander | 0.4–3 mm coiled PVC/ABS | https://cdn.shopify.com/s/files/1/0053/0907/1450/files/cantek_mx350m.pdf | Cantek MX350M brochure, p.1–2 | High (for that machine) |

From `r2/edgebanding.md`, "edgeband width relative to board thickness".

| Item | Value | Unit | Source URL | Document | Conf. |
|---|---|---|---|---|---|
| Ostermann standard ABS widths: 23, 33, 43, 100 mm; stock 16, 19, 25, 28, 54, 55 mm; cut to any width 12-100 mm. No board-thickness mapping is given | list | mm | https://www.ostermann.eu/en/advice/trends-and-inspiration/edging-highlights/abs-edgings-in-six-new-standard-widths | Ostermann article | High (no rule) |
| Ostermann thickness by use: 0.4 mm for rear panels and shelves; 1 mm for carcass and fronts; 2 mm for tables and impact edges | guidance | mm | https://www.ostermann.eu/en/advice/services/expert-advice/edgings/for-each-project-the-right-edging | Ostermann "For Each Project the Right Edging" | High |
| Manufacturer formula "board thickness + X mm" | NOT FOUND (other than Festool's ≈4 mm) | - | - | - | - |

## 2. Which edges are banded

From `cabinet-standards.md` § 1d and § 1b.

| Edge | Value | Source URL | Document / page | Conf. |
|---|---|---|---|---|
| Frameless definition | "TYPE A - Frameless construction where the front edge of the cabinet body components are edgebanded." | https://woodworkinstitute.com/wp-content/uploads/2014/09/WI_AWS_sec10NM.pdf | AWI/AWMAC/WI Architectural Woodwork Standards, Ed. 1 (2009), Sec. 10, §1.2.17.1, p.8 | Medium (2009 edition; a 2014 2nd edition exists) |
| Exposed edges | "Visible front edges of stretchers, ends, divisions, tops, bottoms, shelves, and nailers" are exposed exterior surfaces | same | §1.2.10.1.4, p.2 | Medium |
| Shelf edges | Shelves "including edgebanding" are exposed (open casework) or semi-exposed (behind doors) | same | §1.2.10.2.1 and §1.2.11.1, p.4 | Medium |
| Adjustable-shelf back and side edges | "The three non-visible edges of adjustable shelves" are concealed surfaces | same | §1.2.12.5, p.4 | Medium |
| Doors and drawer fronts, all four edges | The UMD spec bands doors and drawer fronts in 3 mm PVC (below). No standard text opened says "all four edges" in so many words. | https://www.facilities.umd.edu/sites/default/files/2024-04/ContractorSpecsDivision_12.pdf | p.5 | Medium |
| Finished ends | "FINISHED ENDS shall be INTEGRAL, not applied secondarily" by default | AWS URL above | §1.2.7.2, p.3 | Medium |
| Banding on decorative-laminate casework (institutional spec) | "Rigid PVC … 3mm thick at doors and drawer fronts, 1mm thick elsewhere" | https://www.facilities.umd.edu/sites/default/files/2024-04/ContractorSpecsDivision_12.pdf | Univ. of Maryland spec, Section 123200 "Manufactured Wood Casework" (June 2013), p.5, 2.x H | Medium (an owner's spec, not a standard) |
| Where banding goes (same spec) | "provide specified edgebanding on all exposed edges" and "…on all semiexposed edges" | same | p.5 items A.5 and B.5 | Medium |

## 3. Cut size, pre-mill

From `r2/edgebanding.md` Q1 and Q2, `cabinet-standards.md` § 1c and `cabinet-standards-2.md` § 7.

| Item | Value | Source URL | Document & page | Conf. |
|---|---|---|---|---|
| Reduce cut size by band thickness? | **No edgeband or machine maker states it.** The nearest statement is Felder tempora F1000: jointing removal 0–3 mm "can be automatically linked to the edge thickness". | https://www.felder-group.com/en-jp/downloadbrochure/3689652 | F1000 brochure PDF p.5 | High (the link to edge thickness is stated; the brochure does not say this keeps finished size equal to cut size) |
| Software rule when the bander pre-mills off the tape thickness | "If your edge bander is set up to pre-mill the edge tape thickness you will need to change the banding thickness in Mozaik to 0mm to ensure Mozaik is not deducting anything for the edging thickness." (So the default is to deduct the band thickness from the cut size.) | https://cadmate.helpjuice.com/en_AU/edging/how-to-change-your-edge-banding-for-pre-milling | Cadmate/Mozaik help article | Medium |
| OptiCut (Wood Designer) | "When working in net dimensions, edging thickness will be deducted from the panel dimensions." | https://wooddesigner.org/help-centre/opticut-net-versus-overall-dimensions/ | OptiCut help, "Net versus overall dimensions" | Medium (trade software) |
| Promob Builder | Cut size has "Plate offset" added per banded side and the banding thickness subtracted. Worked example: 720 x 550 part, offset 5, 1 mm band per side, cut 728 x 558 | https://suporte.promob.com/hc/en-us/articles/31122592292753-Builder-Edge-Banding-Offset | Promob help (example values, not a recommendation) | Medium |
| Microvellum pre-mill modes | "Legacy Premill": remove the band thickness from the part edge, then add back the toolfile "Edgebander PreMill Dimension". "Edgeband Thickness": increase the cut size by the band thickness. "Custom Edgeband Amount": use a per-material "Part Size Adjustment". | https://intercom.help/microvellum-knowledge-base/en/articles/14858858-edgeband-premill-settings-and-part-size-adjustment | Microvellum KB article | Medium |
| Thickness threshold below which banding is not deducted | NOT FOUND | - | - | - |
| Felder/Format4 tempora F1000: infeed guide "variable chip removal from 0-3 mm" | 0-3 mm | https://www.felder-group.com/en-jp/downloadbrochure/3689652 | tempora F1000 brochure, PDF p.5 | High |
| Felder/Format4 tempora F600: premilling "variable depth of cut can be adjusted and set between 0-2 mm" | 0-2 mm | https://www.felder-group.com/fg-en/products/edgebanders/edgebander-tempora-f600-60-06l.html | Felder product page, "Infeed fence" | High (read through a fetch summary) |
| SCM olimpic K360: RT-V1 pre-milling unit, "pre-milling up to 3 mm thickness" | up to 3 mm | https://wtp.hoechsmann.com/de/lexikon/pdf/scm_olimpick_360_2017_en.pdf | SCM olimpic K360 brochure 2017, PDF p.6 | High (SCM document hosted by a dealer) |
| SCM (Minimax) me 40: pre-milling "Stock removals" | 0-2 mm | https://wtp.hoechsmann.com/it/lexikon/pdf/scm_me_2023_en.pdf | SCM "me range" brochure 2023, PDF p.20 | High |
| SCM me: pre-milling "corrects any panel imperfections caused by the saw cutting process and panel storage" | purpose | same | PDF p.9-10 | High |
| Pre-mill maximum on a small bander | "Maximum Removal of 3mm" | https://cdn.shopify.com/s/files/1/0053/0907/1450/files/cantek_mx350m.pdf | MX350M brochure p.1 | High (for that machine) |
| A rule that panels must be cut oversize by the pre-mill amount | NOT FOUND in a manufacturer document; software only (Promob, Microvellum above) | - | - | - |

## 4. Waste

From `cabinet-standards.md` § 1c and `r2/edgebanding.md` Q4.

| Item | Value | Source URL | Document / page | Conf. |
|---|---|---|---|---|
| Edgeband waste allowance (software default) | Microvellum tutorial formula: add 1" (25.4 mm) per banded part side, then add 5% | https://community.microvellum.com/portal/en/kb/articles/tutorial-edgeband-report-add-waste-factor | Microvellum KB, "Edgeband Report – Add Waste Factor" | Medium |
| Edgeband or machine maker per-edge or % waste allowance | NOT FOUND | - | - | - |
| Festool CONTURO (hand-fed): "You should add approx. 10 cm (3-15/16") to the length of the edging." | ≈ 100 mm per edge | https://online.flippingbook.com/view/574170/24/ | Festool CONTURO booklet, p.24 | Medium (read through a fetch summary; a hand-held machine) |
