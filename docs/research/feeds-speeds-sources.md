<!-- Copied unchanged from the research done for the feeds and speeds calculator (2026-11-14). Every built-in number in src/cam/ names its row here. Do not trim a row a number depends on. -->

# Feeds and speeds research for the CNC cabinet app

Researched 2026-11-14. Every number below comes from a page or PDF opened in this session. Each row gives its URL. "NOT FOUND" means I looked and found no source I could open.

**Target machine (confirmed by coordinator):** Carbide 3D Shapeoko 5 Pro 4×4, Carbide Motion, trim router (not a VFD).

**Confidence key**
- **high**: a manufacturer document, such as a bit maker's chart, a router manual, or a Carbide 3D product or spec page.
- **medium**: a manufacturer blog, a forum post by identified staff, or a reseller or tool-retailer document.
- **low**: community material, such as forums, wikis or e-books.

**Units:** chipload is in inches per tooth (in/tooth) and feed is in inches per minute (IPM), unless a row says otherwise.

---

## 0. Target machine: Shapeoko 5 Pro 4×4 (published specs)

| Item | Value | Source URL | Document / location | Confidence |
|---|---|---|---|---|
| Machine travel, 4×4 (X × Y) | `formatMM(1249-12)` × `formatMM(1249-12)`, which renders as **1237 mm × 1237 mm** (48.70 in) | https://carbide3d.com/shapeoko/shapeoko5pro-specs/ | "Shapeoko 5 Pro Specs", Size 4x4, Machine Travel. The value is in the page's Alpine.js `x-text` expressions; I read it from the raw HTML. The table heading reads "Shapeoko 5.1 Pro". | high |
| Total Z travel | `formatMM(165 - 10)`, which renders as **155 mm** | same page | Machine Specs, "Total Z Travel" | high |
| Z travel with Sweepy Pro | **140 mm** (`150 - 10`) | same page | "Total Z Travel (With Sweepy Pro)" | high |
| Clearance, table to Z axis | **4 in** with the Hybrid Table; **5 in** without it | same page | Machine Specs | high |
| Z travel / clearance (blog) | "Z-travel on all machines is now 6" (155mm) and clearance under the gantry is 4"" | https://carbide3d.com/blog/introducing-shapeoko-5-pro/ | "Introducing Shapeoko 5 Pro CNC Router", Rob, 31 Oct 2022 | medium |
| Ballscrews | X/Y: 16 mm diameter, 20 mm pitch. Z: 16 mm diameter, 10 mm pitch | spec page | Machine Specs | high |
| Ballscrew accuracy | ±50 µm per 300 mm | spec page | Machine Specs | high |
| Step length | X/Y 0.012 mm; Z 0.006 mm | spec page | Machine Specs | high |
| Spindle mount | 65 mm diameter | spec page | Machine Specs | high |
| Router / spindle | "What you need to provide: 65mm trim router or spindle, either our Carbide Compact Router or VFD Spindle". **No router ships with the machine.** | spec page | "What you need to provide" | high |
| Router choice (shop page) | Carbide Compact Router (110 V). In 220 V countries, "grab a Makita RT0700C locally". VFD upgrade is optional. Photos show the Compact Router, "(not included)". | https://shop.carbide3d.com/products/shapeoko5 | Shapeoko 5.1 Pro product page, "Spindles and Routers" | high |
| Included cutter | One "#201 .25" Flat Endmill" | spec page | "What's included" | high |
| Compact Router shank limit | "Use cutters with a shank up to 1/4"" (65 mm VFD: up to 3/8"; 80 mm VFD: up to 1/2") | https://shop.carbide3d.com/pages/spindle-comparison | "CNC Spindle Comparison" | high |
| Max feed / rapid rate | **NOT FOUND** in any Carbide 3D document | — | — | — |
| Max feed (community) | "As-delivered: 200IPM … firmware max of 275IPM" | https://community.carbide3d.com/t/max-feed-speed-on-pro-5/91075 | SLCJedi, 12 Jun 2025; quicky06 agrees ("factory grbl config is 200 ipm") | low |
| Carbide 3D feeds-and-speeds guidance specific to the 5 Pro | **NOT FOUND.** Staff point to Carbide Create's built-in library, which is not published on the web. See §2. | — | — | — |

**What this means for the app:** with the Compact Router, any bit must have a **1/4" shank or smaller**. The 3/8" and 1/2" chart rows below do not apply to this router, except for 1/4"-shank bits with larger cutting diameters.

---

## 1. Bit-maker chipload charts

### 1a. Which charts assume industrial machines

| Chart | Assumption | Source |
|---|---|---|
| Amana Tool (every chart opened here) | Banner reads "INDUSTRIAL"; "CNC Operating Spindle Speed: 18,000 RPM / Depth of Cut: 1 x Tool Diameter" | Amana PDFs, rows below |
| Onsrud (LMT Onsrud) | All examples use 18,000 RPM: "tools are recommended to cut at 18,000 RPM but the customer can vary it based on their machine" | Onsrud PDFs, page 2 |
| Freud | "based on cut depth equal to bit diameter"; examples at 18,000 RPM; "recommended starting point and does not warranty against tool breakage" | Freud PDF, pages 1–2 |
| Rennie Tool (UK reseller) | "We would recommend running at 18,000 RPM"; "NOT applicable to compression bits" | Rennie PDF, pages 1–2 |
| ToolsToday (Amana's retailer) | "A heavy industrial CNC can push a compression bit through MDF at feed rates that would make a desktop CNC chatter, flex, or lose accuracy." Example: the Amana 46172-K chart gives 400 IPM in MDF; "a smaller desktop CNC might need … 120 IPM". | https://toolstoday.com/learn/understanding-cnc-feeds-and-speeds ("Understanding CNC Feeds and Speeds", ToolsToday Team, 1 Jul 2026) |

**Depth-of-cut rule (the same in every manufacturer chart opened):**
- 1×D: use the chart value.
- 2×D: reduce by 25%.
- 3×D: reduce by 50%.

Amana applies the reduction to the **feed rate**. Onsrud and Freud apply it to the **chipload**. At a fixed RPM the two are equivalent.

### 1b. Amana Tool (high)

**Source A1:** https://cdn.shopify.com/s/files/1/1558/5651/files/Solid-Carbide-Compression-Spirals-v12.pdf
"Solid Carbide Compression Spiral Router Bits" (Amana), 18,000 RPM, 1×D. Ramp Down = feed ÷ flutes.

| Flutes | Dia | Wood (IPM / chipload / ramp) | MDF/Laminate | Plywood | Plastic |
|---|---|---|---|---|---|
| 1 | 1/8" | 60 / .0031 / 60 | 110 / .0062 / 110 | 60 / .0031 / 60 | 60 / .0031 / 60 |
| 1 | 1/4" | 60 / .0031 / 60 | 110 / .0062 / 110 | 60 / .0031 / 60 | 60 / .0031 / 60 |
| 1 | 3/8" | 110 / .0061 / 110 | 220 / .0122 / 220 | 110 / .0061 / 110 | 110 / .0061 / 110 |
| 1 | 1/2" | 140 / .0077 / 140 | 280 / .0153 / 280 | 170 / .0092 / 170 | 220 / .0123 / 220 |
| 2 | 1/8" | 40 / .0011 / 20 | 80 / .0022 / 40 | 40 / .0011 / 20 | 40 / .0011 / 20 |
| 2 | 5/32" | 60 / .0017 / 30 | 110 / .0031 / 55 | 60 / .0017 / 30 | — |
| 2 | 3/16" | 80 / .0022 / 40 | 160 / .0044 / 80 | 80 / .0022 / 40 | — |
| 2 | **1/4"** | 110 / .0031 / 55 | **220 / .0061 / 110** | **110 / .0031 / 55** | 110 / .0031 / 55 |
| 2 | 3/8" | 200 / .0056 / 100 | 400 / .0111 / 200 | 200 / .0056 / 100 | 200 / .0056 / 100 |
| 2 | 1/2" | 280 / .0077 / 140 | 400 / .0111 / 200 | 280 / .0077 / 140 | 280 / .0077 / 140 |
| 3 | 3/8" | 300 / .0056 / 100 | 400 / .0074 / 133 | 300 / .0056 / 100 | — |
| 3 | 1/2" | 350 / .0065 / 117 | 450 / .0080 / 150 | 350 / .0065 / 117 | — |

The 2-flute 1/4" tools on this chart include 46037, 46170 and 46170-LH.

**Source A2:** https://www.amanatool.com/pub/media/productattachments/Solid-Carbide-Spektra-Compression-Spirals-for-Baltic-Plywood_v3.pdf
"Solid Carbide Spektra™ … Compression Spiral Router Bits For Baltic Plywood", 18,000 RPM, 1×D.

| Flutes | Dia | Feed IPM | Chipload |
|---|---|---|---|
| 2 | 1/8" | 145 | .0040 |
| 2 | **1/4"** | 150–180 | **.004–.005** |
| 2 | 3/8" | 180–200 | .005–.006 |
| 2 | 1/2" | 200–220 | .006–.0065 |
| 3 | 1/4" | 270 | .0050 |
| 3 | 3/8" | 330 | .009 |
| 3 | 1/2" | 350 | .0065 |

These rows are for Spektra-coated tools: 46700-K (1/4"), 46701-K (1/8"), and so on.

**Source A3:** https://cdn.shopify.com/s/files/1/1558/5651/files/Solid-Carbide-Mortise-Compression-Spirals-v10.pdf
"Solid Carbide Mortise Compression Spiral Router Bits", 18,000 RPM, 1×D.
- The 1-flute 1/4" and 2-flute 1/4", 3/8" and 1/2" values are identical to A1. Example: 2-flute 1/4" gives MDF/Laminate 220 IPM / .0061, Plywood 110 IPM / .0031.
- 4-flute 1/2": Wood 550 / .0077; MDF/Laminate 600 / .0082.
- Tools: 46350 (2-flute, 1/4"), 46393 (1-flute, 1/4").

**Source A4:** https://www.amanatool.com/pub/media/productattachments/Solid-Carbide-Spiral-Plunge-2-3-Flute-v19.pdf
"2 & 3 Flute Solid Carbide Spiral Plunge Router Bits". The chart covers **up-cut and down-cut** tools, 18,000 RPM, 1×D.

| Dia | Up-cut / Down-cut tool # | Wood/Plywood (IPM / chipload / ramp) | MDF/Laminate (IPM / chipload / ramp) |
|---|---|---|---|
| 1/8" | 46100 / 46200 (also 46125/46225, 46127/46227, 46333/46433) | 145 / .0040 / 72.5 | 180 / .0050 / 90 |
| 3/16" | 46101 / 46201 | 180 / .0050 / 90 | 215 / .0060 / 107.5 |
| **1/4"** | 46102 / 46202 (and others) | **180 / .0050 / 90** | **215 / .0060 / 107.5** |
| 3/8" | 46103 / 46203 | 230 / .0064 / 115 | 390 / .0108 / 195 |
| 1/2" | 46106 / 46206 | 200 / .0057 / 100 | 350 / .0096 / 175 |
| 3-flute 1/4" | 46149 / — | 270 / .0050 / 90 | 325 / .0060 / 109 |

**Source A5:** https://toolstoday.com/content/product_downloads/PDF-for-Amana-Tool-Compression-Spiral-2-Flute-Router-Bits.pdf
Amana drawing "Solid Carbide Compression Spiral 46170".
- 1/4" cutting diameter, 1/4" shank, 0.875" cutting length, 2.500" overall length, 30° helix.
- **The up-cut section is 0.2756" ± 0.010" (7 mm) from the tip.**
- Confidence: high.

**6 mm, metric:** Amana gives no 6 mm row. **NOT FOUND** in any Amana chart opened.

**O-flute for wood or MDF:** **NOT FOUND.** Amana's O-flute charts I saw listed are for aluminum and plastic. I did not open them, because they are not for these materials.

### 1c. Onsrud / LMT Onsrud (high)

These are Onsrud's own chart PDFs, as hosted by WOODWEB. Each sheet is dated 2005 in its metadata. All rows are chipload per tooth at 1×D. Diameter columns were read from the page image, because the text layer is misaligned.

**Bit type of each series.** These identifications come from reseller pages (medium confidence):
- **48-000:** "Carbide Tipped Straight Flute" (https://www.wsimachinery.com/collections/48-000-carbide-tipped-straight-router-bits).
- **52-200:** up-cut spiral. 57-200 is the down-cut counterpart (https://www.cncrouterstore.ca/collections/hard-wood/products/52-200-series-upcut-spiral: "for finished top surfaces use a downcut (57-200) or a compression bit (60-100MW)").
- **60-100:** "Solid Carbide - Compression, Dual Core, & High Velocity" (https://www.wsimachinery.com/collections/60-100-solid-carbide-compression-dual-core-high-velocity).
- **60-100C:** "Chipbreaker/Finisher Compression" (https://wsimachinery.com/collections/60-100c-solid-carbide-chipbreaker-finisher-compression).
- 56-200, 61-200, 62-200, 64-000/65-000, 60-100DE and 60-1003E: **identity NOT FOUND**.

**O1. MDF** (https://www.woodweb.com/knowledge_base_images/zp/Chipload_MDF.pdf, "MDF Cutting Data", page 1)

| Series | 1/8" | 1/4" | 3/8" | 1/2" |
|---|---|---|---|---|
| 48-000 straight | — | .005–.007 | .005–.007 | .006–.008 |
| 52-200/57-200 up/down spiral | .005–.007 | .006–.008 | .007–.009 | .008–.010 |
| 56-200 (?) | .003–.005 | .005–.007 | .006–.008 | .007–.009 |
| 60-100 compression | .010–.012 | .013–.015 | .014–.016 | .016–.018 |
| 60-100C | — | — | .017–.019 | .018–.020 |
| 61-200 (?) | .007–.009 | .009–.011 | .010–.012 | .011–.013 |
| 62-200 (?) | .010–.012 | .012–.014 | .013–.015 | .014–.016 |
| 64-000/65-000 (?) | .002–.004 | .004–.006 | .005–.007 | — |

The page-2 example uses a 48-707, a 1/2" tool in MDF: .006–.008, giving 216–288 IPM at 18,000 RPM with 2 flutes.

**O2. Hard plywood** (https://www.woodweb.com/knowledge_base_images/zp/Chipload_Hard_Plywood.pdf, "Hard Plywood Cutting Data", page 1)

This is the closest Onsrud sheet to Baltic birch.

| Series | 1/8" | 1/4" | 3/8" | 1/2" |
|---|---|---|---|---|
| 48-000 | — | .005–.007 | .006–.008 | .007–.009 |
| 56-200 (?) | .003–.005 | .005–.007 | .006–.008 | .007–.009 |
| 60-100 compression | .012–.018 | .014–.016 | .016–.018 | .018–.020 |
| 60-100C | — | — | .019–.021 | .021–.023 |
| 61-200 (?) | .005–.007 | .007–.009 | .008–.010 | .009–.011 |
| 64-000/65-000 (?) | .002–.004 | .004–.006 | .005–.007 | — |

The sheet lists 60-300/60-350 as "Good" for single pass. The page-2 example is a 60-311, 1/2", .021–.023.

**O3. Laminated plywood** (https://www.woodweb.com/knowledge_base_images/zp/Chipload_Plywood.pdf, "Laminated Plywood Cutting Data", page 1)

It is not clear whether "laminated" here means laminate-faced plywood or plywood as laminated wood.

| Series | 1/8" | 1/4" | 3/8" | 1/2" |
|---|---|---|---|---|
| 48-000 | — | .005–.007 | .006–.008 | .007–.009 |
| 60-100 | .013–.015 | .015–.017 | .016–.018 | .018–.020 |
| 60-100DE | — | .015–.017 | .016–.018 | .018–.020 |
| 60-100C | — | — | .019–.021 | .021–.023 |

The page-2 example is a 60-163C, 1/2": .021–.023, giving 756–828 IPM at 18,000 RPM with 2 flutes.

**O4. Laminated chipboard (melamine / TFL on particleboard)** (https://www.woodweb.com/knowledge_base_images/zp/Chipload_Laminated.pdf, "Laminated Chipboard Cutting Data", page 1)

| Series | 1/8" | 1/4" | 3/8" | 1/2" |
|---|---|---|---|---|
| 48-000 | — | .006–.008 | .007–.009 | .008–.010 |
| 60-100 | .013–.015 | .015–.017 | .016–.018 | .018–.020 |
| 60-100DE | — | .017–.019 | .019–.021 | .021–.023 |
| 60-100C | — | — | .022–.024 | .024–.026 |

**Discrepancy inside this document.** Page 2's worked example, 60-100C 1/2" "Laminated Plywood", says .021–.023. The page-1 table says .024–.026. The example appears to be copied from the plywood sheet.

**Laminate-faced MDF (Onsrud):** **NOT FOUND.** No sheet for laminate on an MDF core was located. Melamine on chipboard (O4) is the nearest.

**Onsrud figures relayed by a reseller** (https://www.cncrouterstore.ca/pages/why-melamine-chips-cnc, "Why Is My Melamine Chipping?", undated; medium). The page says these are "LMT Onsrud's published figures for a single-flute compression spiral in particleboard core":
- 1/8": .013–.015
- 3/16": .014–.016
- 1/4": .017–.019
- 3/8": .019–.021
- 1/2": .021–.023

### 1d. Freud (high)

https://www.freudtools.com/public/assets/freud/downloadables/freudtools-router-bit-feed-and-speed-for-cnc-20170822.pdf
"Get the most out of your Freud bits…", page 2. Solid carbide bits, at depth = diameter.

| Dia | MDF / particleboard | Laminated particleboard | Hardwood | Softwood | Plywood |
|---|---|---|---|---|---|
| 1/8" | .004–.007 | .003–.006 | .002–.005 | .004–.006 | .003–.005 |
| 1/4" | .013–.017 | .010–.015 | .008–.011 | .010–.012 | .006–.009 |
| 3/8" | .018–.021 | .014–.018 | .014–.016 | .016–.019 | .015–.018 |
| 1/2" | .023–.027 | .022–.026 | .018–.021 | .020–.023 | .018–.021 |

The chart does not separate up-cut, down-cut and compression. The same page also has a table for carbide-*tipped* straight bits; for example, 1/4" plywood .005–.006 and 1/4" MDF .004–.006.

### 1e. Rennie Tool Company (medium: UK reseller chart)

https://cdn.shopify.com/s/files/1/0067/9129/9145/files/Solid_Carbide_Router_Bits_Speeds_Feeds_And_Chipload_Information_04804c76-ed51-42b8-93ba-72288d30d811.pdf
"Solid Carbide Router Bit Chip Load Chart", page 3. Values are in **mm per tooth**. The chart covers 1-, 2- and 3-flute up-cut or down-cut bits and is "NOT applicable to compression bits".

| Material | 3.175 mm (1/8") | **6 mm** | 6.35 mm (1/4") | 9.35 mm (3/8") | 12.7 mm (1/2") |
|---|---|---|---|---|---|
| Soft plywood | .102–.153 | .270–.320 | .279–.330 | .432–.508 | .533–.584 |
| MDF / particleboard | .102–.178 | .320–.396 | .330–.406 | .508–.584 | .635–.686 |
| High-pressure laminate | .076–.127 | .219–.294 | .229–.305 | .381–.457 | .584–.635 |
| Hardwood | .076–.127 | .220–.270 | .229–.279 | .381–.457 | .483–.534 |

The 6 mm row is the only 6 mm source found. The page-2 example is a 6 mm 2-flute up-cut in MDF: 0.32 × 18,000 × 2 = 11,520 mm/min.

### 1f. Other bit makers

| Maker | Result |
|---|---|
| Whiteside | **NOT FOUND.** No chipload chart on whitesiderouterbits.com was found. Whiteside offers Vectric/Carveco tool files, which I did not open. |
| Vortex | **NOT FOUND.** The old URL vortextool.com/images/chipLoadChart.pdf returns 404. The site links only a catalog PDF, which I did not parse. |
| CMT | **NOT FOUND** |
| Kyocera SGS | **NOT FOUND.** The router catalog exists, but I did not find a chipload table I could open. |
| Precise Bits | **NOT FOUND** |
| Haas Tooling | https://www.haascnc.com/…/Speeds%20and%20Feeds%20Metric%20-%20Wood%20Router%20Bits.pdf ("Speeds and Feeds", page 1) gives RPM 12,000–22,000, feed 3,500–11,000 mm/min and depth 1.5–12 mm, by part number only. It gives no diameter or flute data, so I did not use it. |

### 1g. Disagreements to show the user

**1/4" compression in MDF / laminate, at 18,000 RPM and 1×D:**
- Amana 2-flute (A1): **.0061**.
- Onsrud 60-100 MDF (O1): **.013–.015**.
- Onsrud figures relayed by the reseller, 1-flute: .017–.019.

**1/4" compression in plywood:**
- Amana 2-flute (A1): **.0031**.
- Amana Baltic (A2): **.004–.005**.
- Onsrud 60-100 hard plywood (O2): **.014–.016**.
- Freud, plywood, any bit type: .006–.009.

That is a 3–5× spread between manufacturers for the same nominal job.

A ToolsToday Q&A (https://questions.toolstoday.com/6432588/…, 26 May 2018) records a user saying the Amana chart is "much lower than other manufacturers recommend". The only answer asks for a phone number.

---

## 2. Hobby-machine guidance from machine makers

| Item | Value / quote | Source URL | Document | Confidence |
|---|---|---|---|---|
| Carbide 3D's official F&S | "The feeds and speeds in that document have been superseded by the much better defaults in current versions of Carbide Create." The old PDF `docs.carbide3d.com/support/supportfiles/S3_feeds_250.pdf` now redirects to my.carbide3d.com. | https://community.carbide3d.com/t/feeds-and-speeds-broken-link/89339 | William Adams (Carbide 3D), 14 Apr 2025 | medium |
| Character of the Carbide Create library | Values are "intended to be conservative and reliable". The original chart's author "has since left Carbide3D", and new values are by wmoy. | https://community.carbide3d.com/t/feeds-speeds-carbide-create-vs-materialmondays-vs-wiki/30858 | WillAdams (staff), 27 Feb 2021 | medium |
| Carbide Create default, #201 1/4" endmill, hardwood (as of 2021) | plunge 12 IPM, feed 60 IPM, 18k RPM, DOC .04" | same thread | cqualley (user), 27 Feb 2021 | low |
| #MaterialMondays, #201, hardwood | feed 75 IPM, 18k RPM, DOC .06" | same thread | cqualley quoting wmoy | low |
| Old Carbide 3D chart, #201, hardwood | plunge 30, feed 65, 19k RPM, DOC .22" | same thread | cqualley | low |
| #201 in MDF | Carbide Create DOC .060" vs. .3" in the old Shapeoko chart | same thread | cqualley | low |
| Carbide Create library, compression bits in plywood | Library depths of cut "0.03"" and "0.04"" | https://community.carbide3d.com/t/feeds-and-speed-compression-bit-with-plywood/46692 | Mdbrock (user), 19 Jun 2022 | low |
| Carbide 3D support scope | "We can only advise on the tooling which we sell and our (admittedly conservative) feeds and speeds." | https://community.carbide3d.com/t/shapeoko-5-baltic-birch-feeds-and-speeds/85436 | Support, quoted by WillAdams (staff), 6 Jan 2025 | medium |
| Starting advice | "Just use the numbers in Carbide Create to start … increase feed and speed (proportionally, so as to maintain chipload) and depth of cut." | https://community.carbide3d.com/t/feeds-and-speeds-shapeoko-4-xl/39119/2 | WillAdams (staff), 7 Jan 2022 | medium |
| Carbide Create library values as a web table | **NOT FOUND.** The library ships inside the app; staff say it can be exported to CSV through Help → About → Open data directory. | https://community.carbide3d.com/t/feeds-speeds-from-carbide-create/40662 | WillAdams, 1 Feb 2022 | medium |
| Derating bit-maker charts | "endmill manufacturers recommendations may not be directly suitable for the Shapeoko"; less rigid and less powerful, "so DOC recommendations … need to be reduced"; cutting-force limit ≈ 20 lbf (9 kg). **No percentage is given.** | https://shapeokoenthusiasts.gitbook.io/shapeoko-cnc-a-to-z/feeds-and-speeds-basics | "Shapeoko CNC A to Z" (community e-book, linked by Carbide 3D staff) | low |
| Shapeoko chipload ranges | Soft wood & hard plastics: 1/8" .001–.0025; 1/4" .001–.005. Hard wood & metals: 1/8" .0005–.001; 1/4" .001–.002. | same | same | low |
| Rubbing floor | 0.001" is the commonly cited minimum; it "may need to be lowered to 0.0005'' for 1/8'' and smaller endmills" | same | same | low |
| Avid CNC | **NOT FOUND** (no official document). The forum says spreadsheet values are "starting values"; start a bit lower and increase while listening. | https://forum.avidcnc.com/t/feeds-speed-and-chip-load-questions/1286 | Stephen, subnoize, 14 Nov 2022 (roles not shown) | low |
| Onefinity | **NOT FOUND** (no official document). One user: "The formulas work well for large industrial machines but not so much for these small guys." | https://forum.onefinitycnc.com/t/feeds-and-speeds-realistic-expectations-for-the-onefinity/10275 | Knappwerks, 9 Feb 2022 | low |
| Shapeoko 5 Pro, Baltic birch (community) | "1/4" 2 flute compression 24k rpm 250 ipm in baltic" at 1/2" DOC, roughing; ramp in at 20°. Another user broke a 1/4" 2-flute at 22k / 180 IPM / 0.6" DOC (2.2 kW spindle). | https://community.carbide3d.com/t/shapeoko-5-baltic-birch-feeds-and-speeds/85436 | Ryan Quick, bodscheerer, Jan 2025 | low |
| 1/8" in Baltic birch (community) | 1/8" bit in 1/2" BB: 18,000 RPM, 75 IPM, 0.168" DOC, 3 passes | https://community.carbide3d.com/t/feeds-and-speed-compression-bit-with-plywood/46692 | cnc_aero, 20 Jun 2022 | low |

---

## 3. Router and spindle RPM (manufacturer pages)

### Carbide Compact Router (the router Carbide 3D sells for the Shapeoko 5 Pro)

| Source | RPM range | Dial 1 | 2 | 3 | 4 | 5 | 6 | Confidence |
|---|---|---|---|---|---|---|---|---|
| https://shop.carbide3d.com/products/carbide-compact-router ("Carbide Compact Router", Specifications → "RPM Settings") | "RPM Range 12,000 - 30,000" | 11,000 | 13,500 | 18,250 | 24,500 | 29,250 | 31,000 | high |
| https://community.carbide3d.com/t/carbide-compact-router-speeds/19491 ("Official chart for Carbide Compact Router", WillAdams, staff, 6 Feb 2020) | — | 10,000 | 14,000 | 18,000 | 23,000 | 27,000 | 32,000 | medium |

The staff chart also gives half-steps: 1.5 = 12,000; 2.5 = 16,000; 3.5 = 20,500; 4.5 = 25,000; 5.5 = 29,500.

**Conflicts to note:**
- The two tables disagree by up to about 1,500 RPM.
- The shop page's own dial 1 (11,000) and dial 6 (31,000) fall outside its stated range of 12,000–30,000.
- Staff caveat: speeds "may differ from one unit batch to another", vary with mains frequency, and are "an estimate/guideline only".
- The Compact Router accepts shanks up to 1/4" (spindle comparison page, §0). Its doc page lists "1/8 and 1/4" Collet" (https://carbide3d.com/hub/docs/carbide-compact-router/).

### Makita RT0701C

Source: the Makita instruction manual covering RT0700C/RT0701C, https://images.toolsid.com/makita/items/pdf/rt0701c-manual.pdf. Specifications on page 2; speed dial on page 5. Confidence: high.
- No-load speed: 10,000–30,000 /min.
- Collet: 1/4" and 3/8".
- Dial table: 1 = 10,000; 2 = 12,000; 3 = 17,000; 4 = 22,000; 5 = 27,000; 6 = 30,000.
  - The text layer lists the six RPM values out of order. This pairing is the only monotonic reading.
  - It matches the RT0701CX3/RT0700C manual snippets in search results.
- Manual warnings: "If the tool is operated continuously at low speeds for a long time, the motor will get overloaded"; "Moving the tool forward too slowly may burn and mar the cut" (page 11).

### DeWalt DWP611

Source: https://www.manualslib.com/manual/879147/Dewalt-Dwp611.html?page=47 and page 48, DWP611 Instruction Manual, printed pages 45–46. Confidence: high (manufacturer manual on a mirror site).
- "infinite number of speeds between 16,000 and 27,000 RPM".
- Speed Selection Chart: 1 = 16,000; 2 = 18,200; 3 = 20,400; 4 = 22,600; 5 = 24,800; 6 = 27,000.
- The text extraction lost which uses go with which settings. The uses listed are "Large diameter bits and cutters", "Small diameter bits and cutters", and "Softwoods, plastics, laminates".

### VFD spindles

1.5–2.2 kW spindle RPM ranges from a manufacturer page: **NOT FOUND.**
- Protohaven's wiki says an Avid unit is 6,000–24,000. That is a third party and I did not open it, so I do not use it.
- Carbide 3D's 65 mm and 80 mm VFD doc pages exist but were not opened.

---

## 4. Formulas

| Formula | Statement | Source | Confidence |
|---|---|---|---|
| Feed | Feed (IPM) = RPM × flutes × chipload | Amana A1–A4 ("To find Feed Rate IPM"); Onsrud O1–O4; Freud page 2; Haas page 2 (v_f = f_z · n · Z) | high |
| Chipload | Chipload = Feed ÷ (RPM × flutes) | same | high |
| RPM | RPM = Feed ÷ (flutes × chipload) | Onsrud; Freud | high |
| Ramp feed | Ramp Down = Feed ÷ # of flutes | Amana A1–A4. The 1-flute rows set ramp = feed, consistent with the formula. | high |
| Plunge feed (rule of thumb) | Straight plunge 30–40% of feed for woods. Ramping allows higher rates. | Shapeoko CNC A to Z | low |
| Plunge feed (rule of thumb) | "many CNC users reduce ramp or plunge feed to about half the main feed rate" | ToolsToday "Understanding CNC Feeds and Speeds" | medium |
| Depth-of-cut derate | 1×D chart value; 2×D −25%; 3×D −50%. Freud worked example: ".019" × .75 = .014". | Amana, Onsrud, Freud page 3 | high |
| Depth per pass (hobby) | Wide and shallow: DOC 10–50% of D for softer materials. Narrow and deep: DOC 100–300%, WOC 10–25%. Do not go below 5% DOC. | Shapeoko CNC A to Z | low |
| Depth per pass (hobby) | "Standard rule of thumb is DOC should be approximately 1/2 of the bit diameter" | https://community.carbide3d.com/t/shapeoko-5-baltic-birch-feeds-and-speeds/85436 (Tim Jones) | low |
| Stepover for pockets | Roughing WOC 40–100% of D (wide and shallow); finishing 5–10% | Shapeoko CNC A to Z | low |
| Stepover from a bit maker | **NOT FOUND** | — | — |
| Ramp angle | 20° in Baltic birch on a Shapeoko 5 Pro (ramp in rather than plunge) | 85436 thread (Ryan Quick) | low |
| Ramp angle from a bit maker | **NOT FOUND.** Easel's 20°/5° page returned 403 and was not read. | — | — |
| Chip thinning | Shallow radial cuts thin the chip, so the feed must rise to keep the chip thick | https://carbide3d.com/blog/feed-and-speeds-part-2/ (Bob Warfield guest post, 7 Sep 2016) | medium |

---

## 5. Laminate practice

| Topic | Finding | Source | Confidence |
|---|---|---|---|
| Top vs bottom chipping | Top face only: "Upcut geometry is lifting the skin". Fix: downcut or compression. Bottom face only: "Downcut geometry is pushing the skin off the unsupported underside". Fix: compression and a flat spoilboard. Both faces: wrong geometry or a dull edge. | https://www.cncrouterstore.ca/pages/why-melamine-chips-cnc | medium (reseller) |
| Up-cut on laminate | 52-200 up-cut: "The top face can fuzz or chip in veneer and laminate, so for finished top surfaces use a downcut (57-200) or a compression bit" | cncrouterstore 52-200 page | medium |
| Compression first pass | "Compression bits fail when the first pass is too shallow … take the first pass deeper than the upcut tip (usually about one bit diameter)" | cncrouterstore melamine page | medium |
| Compression up-cut length, real tool | Amana 46170 (1/4"): up-cut section **0.2756" ± 0.010" (7 mm)** | Amana drawing (A5) | high |
| Same, retailer answer | For 18 mm Baltic birch, "the minimum depth of cut would need to be no less than 7mm" (answer about the 46170) | https://questions.toolstoday.com/6435341/… | medium |
| Same, community | "You only need to get depths of cut equal to the upcut portion of the compression bit." | 85436 thread (SLCJedi) | low |
| **Conflict** | The Carbide Create library is reported to use 0.03–0.04" DOC for compression in plywood (thread 46692). That is far shallower than a 0.276" up-cut section, so the bit cuts as an up-cut. | 46692 vs Amana A5 | — |
| Compression strategy on a Shapeoko | Rough at a safe DOC with the contour offset ~0.02" outward, then run a full-depth compression finishing pass | 46692 thread (Julien, 20 Jun 2022) | low |
| Down-cut for dados and pockets | Carbide 3D #251: "ideal to cut laminates and wood without tearing out the top side of the material. Care must be used to have adequate chip evacuation." | https://shop.carbide3d.com/products/251-25-downcut-flat-cutter | high |
| Down-cut, economics | "a downcut spiral is often the better economic choice when only the top face is coated" | cncrouterstore melamine page | medium |
| Short up-cut (mortise) compression | Mortise compression is suggested for shallow dados (cncrouterstore). Amana mortise up-cut length: **NOT FOUND** (no drawing opened). | cncrouterstore | medium |
| Onion skin | "Set the cut depth to .020" less than the thickness of your material"; measure the stock with digital calipers; preview to confirm it is not a through cut | https://info.lagunatools.com/onion-skinning-for-small-parts-on-your-cnc (George Vondriska, Laguna, 10 Nov 2020) | medium (machine maker's blog) |
| Two-pass, melamine | "leaving 1/16 or less skin"; first pass climb, final pass conventional; "Oversize your first cut by 1/64th and cut to size with your finish pass"; space parts by the bit diameter plus .03" | https://woodweb.com/knowledge_base/CNC_Routing_Chipboard_with_Two_Passes.html (2 Dec 2011) | low |
| Burning and dulling from low chipload | "If your chip is very small, or just sawdust, then it will not carry enough heat away from the edge of the bit. Excessive heat will prematurely dull the edge" | Freud PDF, page 2 | high |
| Same | "Too little chip load can cause rubbing, heat buildup, and premature dulling" | ToolsToday "Understanding CNC Feeds and Speeds" | medium |
| Same | Slowing feed too much causes rubbing, "one of the worst things for tool life"; wood may smoke, blacken or catch fire | Carbide 3D blog part 2 (Warfield) | medium |
| Melamine resin | A too-light chip means "the edge rubs, heats the resin and produces micro-chipping along the whole cut line" | cncrouterstore melamine page | medium |
| RPM vs feed when slowing down | Conflict. cncrouterstore: "reduce RPM rather than crawling the feed". Warfield (Carbide 3D blog part 2), as summarized by the fetch tool: "It's always better to slow the feedrate then slow the spindle rpms". **Both mean: keep the chipload.** | — | — |
| Tool heat check | A hot tool means the feeds and speeds are wrong, or the tool is dull and rubbing; dust instead of chips means chipload too low ("MDF is an exception") | Shapeoko CNC A to Z (e-book page 227) | low |
| Melamine, industrial practice | 3/4" melamine nests at "2 flute, 18k rpm, 600ipm"; "2 flute Vortex 3130 xp 720 IPM 18K RPM" | https://www.woodweb.com/knowledge_base/Improving_Bit_Life_and_Performance.html (13 Mar 2014) | low |
| HPL-specific chipload | Rennie: HPL ≈ 70–75% of the MDF value at the same diameter (6.35 mm: .229–.305 mm vs .330–.406 mm) | Rennie PDF, page 3 | medium |

---

## 6. Chipload test procedure for a novice (each step sourced)

1. **Start point.** Take the bit maker's chart value for your bit and material, and start at its low end. Freud: "start your tests with the lower feed rates yielded by our formulas". Rennie: "Always start out at the lower feed rate and work your way up".
2. **Depth.** Start with a shallow pass. Freud: "Always start with shallow passes in your test cuts". Shapeoko A to Z: start DOC/WOC "small, conservative … then increase".
3. **Material.** Cut scrap of the same sheet, thickness and hold-down you will use. ToolsToday: "Make a test cut in scrap material."
4. **Hold RPM, change feed.** Keep RPM constant and raise the feed in steps. Use Carbide Motion's feed override; Shapeoko A to Z: "a great way to tune the chipload value". Change "one variable at a time" (ToolsToday).
5. **Judge each step.**
   - Chips vs dust: dust means the chipload is too low, except in MDF (Shapeoko A to Z; ToolsToday).
   - Edge: look for burn, fuzz, chatter marks or tear-out (ToolsToday).
   - Bit temperature after the pass: it should be at most slightly warm (Shapeoko A to Z).
   - Sound: listen for chatter (Shapeoko A to Z; Avid forum, Stephen).
6. **Back off.** Back off from the first step that chatters or degrades the edge. Record the last good value for that bit, material and machine (ToolsToday: "Record what works").
7. **Deeper cuts.** Only after this, increase DOC. Apply the 2×D −25% / 3×D −50% derate (Amana, Onsrud, Freud).

---

## 7. Drilling 5 mm, 6 mm and 35 mm holes with a router

| Topic | Finding | Source | Confidence |
|---|---|---|---|
| Hinge-boring bit at router RPM | Amana 203431, 35 mm carbide-tipped hinge boring bit: "Maximum RPM is 8,000"; "Not to be used in portable drills or hand held routers" | https://generalcuttingtools.com/?p=6959 and https://www.burnstools.com/35mm-hinge-boring-for-router (Amana listing text) | medium (distributors quoting Amana) |
| **Implication for this machine** | The Carbide Compact Router's lowest dial is about 11,000 RPM (shop page) or 10,000 (staff chart). Both are above the 8,000 RPM rating, so this bit cannot be run in this router within its rating. | §3 + row above | derived |
| Forstner bit speeds | Würth Longlife & Speed Forstner, recommended speeds: >35 mm, 1600 rpm softwood / **900 rpm hardwood/MDF**; >25 mm, 1800/1000 | https://eshop.wuerth-professional.com/Product-categories/Forstner-bit-LS/39527501020503.cyid/3952.cgid/en/US/AED/ | high |
| Rated-speed rule | "always check to ensure the rated speed of the router bit is higher than or equal to the maximum speed marked on the CNC machine. Router bits running faster than their RATED SPEED can break and fly apart." | Freud PDF, page 1 | high |
| Plunge-drilling with router bits | "Carbide tipped bits should not be used to drill directly into the work piece." | Freud PDF, pages 1–2 | high |
| Interpolating instead | Pocket each hole with an end mill using a ramp or helix. Ramp feed = feed ÷ flutes (Amana). Ramp in at ~20° rather than plunge (community). | Amana A1–A4; 85436 thread | high / low |
| 5 mm and 6 mm holes | Only a tool smaller than the hole can interpolate it. Of the user's bits, that is the 1/8" (3.175 mm), at the 1/8" rows above. The tool-to-hole ratio for wood is **NOT FOUND** from any bit maker. | — | — |
| Flute length vs hole depth | Freud: "Never exceed the recommended cutting depth listed on the router bit package". Example: Amana 46170 has 0.875" cutting length. Cutting lengths for Carbide #201/#251 are **NOT FOUND**; the shop page renders them in JavaScript and I did not extract them. | Freud page 1; Amana A5 | high |
| Brad-point or twist drill RPM in sheet goods | **NOT FOUND** | — | — |

---

## 8. Recommended defaults

### 8a. Shapeoko 5 Pro 4×4 with the Carbide Compact Router

**How these defaults were derived**
1. **Chipload is not derated below the lowest manufacturer value for that bit and material.** The reason is that Freud, ToolsToday and the Carbide 3D blog all say too low a chipload rubs, heats and dulls the bit. Where makers disagree (§1g), I take the **lowest** manufacturer figure, which is Amana. That is already 2–5× below Onsrud.
2. **The derating goes into depth per pass, not chipload.** Shapeoko A to Z says manufacturer DOC "need[s] to be reduced" for the Shapeoko; no percentage is published. Carbide 3D support calls its own numbers "admittedly conservative".
3. **RPM is picked from the dial table** (Carbide shop page, §3) so the computed feed stays under the as-delivered 200 IPM limit (§0, low confidence).
4. **Feed = RPM × flutes × chipload** (Amana/Onsrud/Freud). Plunge/ramp feed = feed ÷ flutes (Amana).
5. **Every default is a starting point** for the §6 test, not a final value.

| Job | Bit | Chipload (source row) | Dial → RPM | Feed IPM | Ramp/plunge IPM | Depth per pass | Notes |
|---|---|---|---|---|---|---|---|
| Profile Baltic birch, plain or laminate-faced | 1/4" 2-flute compression | **.0031** (Amana A1, 2fl 1/4" Plywood) | 3 → 18,250 | **113** | 57 (113 ÷ 2) | **First pass ≥ the bit's up-cut length.** For Amana 46170 that is 0.2756" ± .010, so ≥ 0.29" (A5). Later passes ≤ 1×D (0.25"). If a pass exceeds 1×D, reduce feed 25% → **85 IPM** (Amana 2×D rule). | Test range .0031–.005 (A1 → A2 Baltic Spektra) = 113–183 IPM. Onsrud's .014–.016 (O2) would be 511+ IPM, above this machine's feed limit. |
| Profile raw MDF | 1/4" 2-flute compression | **.0061** (Amana A1, MDF/Laminate) | 2 → 13,500 | **165** | 82 | Same first-pass rule; then ≤ 1×D | At dial 3 the feed would be 223 IPM, above the 200 IPM limit, so dial 2 is used. |
| Profile melamine/TFL on MDF | 1/4" 2-flute compression | **.0061** (Amana A1, "MDF/Laminate") | 2 → 13,500 | **165** | 82 | Same | — |
| Profile HPL on MDF | 1/4" 2-flute compression | **.0043** = .0061 × 0.70 (Amana A1 × Rennie HPL/MDF ratio at 6.35 mm, §1e) | 2 → 13,500 | **115** | 58 | Same | This is a derived ratio. Rennie's chart excludes compression bits. |
| Dados and pockets in laminate-faced BB or MDF | 1/4" 2-flute down-cut (e.g. Carbide #251) | BB **.0050**, MDF/laminate **.0060** (Amana A4, 46202 row) | 2 → 13,500 | BB **135**, MDF **162** | 68 / 81 | ≤ 0.125" (½D, community rule, low). Amana's baseline is 1×D. | Down-cut needs good chip evacuation (Carbide #251 page). Onsrud 57-200 MDF 1/4" is .006–.008 (O1), which agrees. |
| Small parts, 5 mm / 6 mm holes, fine features | 1/8" 2-flute flat end mill (e.g. Carbide #102) | **.002** (Shapeoko A to Z 1/8" soft-wood max .0025, low). Amana up-cut 1/8" is .0040 (A4); Freud plywood .003–.005. | 3 → 18,250 | **73** | 37 | 0.0625" (½D, community) | This is the only row where chipload is derated below a bit maker's value. The source is low confidence. It agrees with the community result of 75 IPM at 18k in BB (46692). It stays above the .001 rubbing floor. |
| Upcut, roughing on non-show faces (if owned) | 1/4" 2-flute up-cut | ply **.0050**, MDF **.0060** (Amana A4, 46102) | 2 → 13,500 | 135 / 162 | 68 / 81 | ≤ 1×D | Never on a laminate top face (cncrouterstore 52-200 page). |
| 35 mm cup holes | 1/4" down-cut or compression, pocket with helical/ramp entry | Use the matching row above | as above | as above | Ramp ≈ 20° (low) at feed ÷ flutes | As above | **Do not use** a hinge-boring or Forstner bit in this router: the router minimum is about 11,000 RPM, against an 8,000 RPM maximum (Amana) and 900–1600 rpm recommended (Würth). |
| Onion skin for small parts | Any of the above | — | — | — | — | Leave **0.020"** (Laguna). Clean up with a final conventional pass (WOODWEB, low). | — |

**Router choice:** the Makita RT0701C dial table (10,000–30,000) can stand in. If the user has a Makita, use dial 3 ≈ 17,000 instead of 18,250 and recompute the feed. Example: compression in BB at 17,000 × 2 × .0031 = 105 IPM.

### 8b. Generic hobby 4×4 machine

These keep the same rules as 8a, but without this machine's dial table or feed cap.
- **Chipload:** the lowest manufacturer value for the bit and material. That is Amana (A1/A4) in every row.
- **RPM:** 18,000, the chart basis, unless the feed exceeds the machine's limit. In that case lower the RPM and keep the chipload.
- **Depth per pass:** ≤ 1×D (the bit-maker baseline). Reduce further on light machines (Shapeoko A to Z, low). For a compression bit, the first pass must be ≥ its up-cut length.
- **Plunge/ramp:** feed ÷ flutes (Amana).

**Feeds at 18,000 RPM with 2 flutes:**

| Bit | Material | Chipload | Feed (IPM) |
|---|---|---|---|
| 1/4" compression | Plywood | .0031 | 112 |
| 1/4" compression | MDF/laminate | .0061 | 220 |
| 1/4" down-cut | Plywood | .0050 | 180 |
| 1/4" down-cut | MDF | .0060 | 216 |
| 1/8" up-cut | Plywood | .0040 | 144 |

The 1/4" rows reproduce Amana's printed IPM. The 1/8" row is Amana's printed chart value; on a light machine, start at half of it (see 8a).

**VFD spindle (1.5–2.2 kW):** no manufacturer derating was found. The same chart values apply. The 3/8" and 1/2" rows become usable only with a 65 mm or 80 mm VFD collet (Carbide spindle comparison).

---

## 9. What I could not verify

**Carbide 3D numbers**
- **Carbide 3D's current feeds and speeds (the Carbide Create tool library):** not published on any web page I could open. The only figures are user-reported snapshots from 2021–2022.
- **Shapeoko 5 Pro max feed and rapid rates:** not on any Carbide 3D page. The 200 IPM factory and 275 IPM firmware limits come from forum users only.

**Bit-maker charts and tools**
- **Whiteside, Vortex, CMT, Kyocera SGS, Precise Bits chipload charts:** NOT FOUND.
- **O-flute chipload for wood, MDF or laminate:** NOT FOUND. Onsrud 64-000/65-000 *may* be O-flute; one reseller lists 65-100 as "upcut O flute". The series identity is unverified.
- **Onsrud series identities** for 56-200, 61-200, 62-200, 60-100DE and 60-1003E: NOT FOUND.
- **Onsrud chart age:** the sheets are 2005-era PDFs hosted by WOODWEB. A current LMT Onsrud chart was not found.
- **6 mm chiploads:** only Rennie (a reseller). No 6 mm row from Amana, Onsrud or Freud.
- **Amana mortise-compression up-cut length:** NOT FOUND. This is the short-up-cut tool for shallow dados.
- **Cutting lengths of Carbide #201, #251 and #102:** not extracted.

**Router and spindle data**
- **DeWalt DWP611:** which application row goes with which dial setting is unclear in the extracted chart text.
- **Makita RT0701C dial pairing:** inferred from a jumbled text layer. It matches the RT0701CX3/RT0700C snippets.
- **Compact Router RPM:** the two Carbide sources disagree (§3). Measure with a tachometer for exact values.
- **VFD spindle RPM ranges and derating** from a spindle maker: NOT FOUND.

**Practice guidance**
- **Ramp angle and helical-entry pitch** from a wood bit maker: NOT FOUND. 20° is community advice only.
- **End-mill-to-hole diameter ratio** for interpolating holes in wood: NOT FOUND.
- **Stepover for pockets** from a bit maker: NOT FOUND. Only the Shapeoko community e-book.
- **A published percentage derating** for hobby machines from any bit or machine maker: NOT FOUND. ToolsToday's single example (400 IPM industrial vs ~120 IPM desktop, MDF, 3/8" 3-flute) is the only quantified comparison. I did not use it as a chipload derate, because it would push the chipload toward the rubbing range.
- **HPL vs melamine chipload** from Onsrud or Amana: NOT FOUND. The HPL factor comes from Rennie only.
