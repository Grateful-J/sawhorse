// Where every built-in number in src/cam/ comes from. Each entry is a row (or a table) of
// docs/research/feeds-speeds-sources.md: the maker, the document, where in it, the URL, and
// the report's confidence:
//   high:   a manufacturer document (a bit maker's chart, a router manual, a Carbide 3D
//           product or spec page);
//   medium: a manufacturer blog, a forum post by identified staff, a reseller or retailer;
//   low:    community material (forums, wikis, e-books).
// A number in the data names one of these by id (`src`). src/cam/sources.test.ts walks the
// data and fails on a number without one.

export type Confidence = "high" | "medium" | "low";

export interface Source {
  /** Who published it. */
  maker: string;
  /** The document's title. */
  document: string;
  /** Where in it (page, table, row). */
  where: string;
  url: string;
  confidence: Confidence;
  /** The report's section the row is in. */
  report: string;
}

/** Every source the built-in data uses, by id. */
export const SOURCES = {
  // §0: the machine
  "c3d-specs": {
    maker: "Carbide 3D",
    document: "Shapeoko 5 Pro Specs",
    where: "Size 4x4: Machine Travel, Total Z Travel, Spindle mount (read from the page's raw HTML)",
    url: "https://carbide3d.com/shapeoko/shapeoko5pro-specs/",
    confidence: "high",
    report: "§0",
  },
  "c3d-spindles": {
    maker: "Carbide 3D",
    document: "CNC Spindle Comparison",
    where: 'Carbide Compact Router: "Use cutters with a shank up to 1/4""',
    url: "https://shop.carbide3d.com/pages/spindle-comparison",
    confidence: "high",
    report: "§0",
  },
  "forum-max-feed": {
    maker: "Carbide 3D community forum",
    document: "Max feed speed on Pro 5",
    where: 'SLCJedi, 12 Jun 2025: "As-delivered: 200IPM … firmware max of 275IPM"; quicky06 agrees',
    url: "https://community.carbide3d.com/t/max-feed-speed-on-pro-5/91075",
    confidence: "low",
    report: "§0",
  },
  "c3d-shop-s5": {
    maker: "Carbide 3D",
    document: "Shapeoko 5.1 Pro product page",
    where: '"Spindles and Routers": the Compact Router (110 V); in 220 V countries "grab a Makita RT0700C locally"',
    url: "https://shop.carbide3d.com/products/shapeoko5",
    confidence: "high",
    report: "§0",
  },
  "c3d-superseded": {
    maker: "Carbide 3D (William Adams, staff)",
    document: "Feeds and speeds broken link",
    where: 'Forum, 14 Apr 2025: the old chart has "been superseded by the much better defaults in current versions of Carbide Create"',
    url: "https://community.carbide3d.com/t/feeds-and-speeds-broken-link/89339",
    confidence: "medium",
    report: "§2",
  },
  // §3: routers
  "ccr-shop": {
    maker: "Carbide 3D",
    document: "Carbide Compact Router (shop page)",
    where: 'Specifications, "RPM Settings" and "RPM Range 12,000 - 30,000"',
    url: "https://shop.carbide3d.com/products/carbide-compact-router",
    confidence: "high",
    report: "§3",
  },
  "ccr-staff": {
    maker: "Carbide 3D (WillAdams, staff)",
    document: "Official chart for Carbide Compact Router",
    where: "Forum post, 6 Feb 2020, with half-steps",
    url: "https://community.carbide3d.com/t/carbide-compact-router-speeds/19491",
    confidence: "medium",
    report: "§3",
  },
  "ccr-docs": {
    maker: "Carbide 3D",
    document: "Carbide Compact Router (docs)",
    where: '"1/8 and 1/4" Collet"',
    url: "https://carbide3d.com/hub/docs/carbide-compact-router/",
    confidence: "high",
    report: "§3",
  },
  "makita-manual": {
    maker: "Makita",
    document: "RT0700C / RT0701C instruction manual",
    where: "Specifications, page 2; speed dial, page 5; warnings, page 11",
    url: "https://images.toolsid.com/makita/items/pdf/rt0701c-manual.pdf",
    confidence: "high",
    report: "§3",
  },
  "dewalt-manual": {
    maker: "DeWalt",
    document: "DWP611 instruction manual (manualslib mirror)",
    where: "Printed pages 45–46, Speed Selection Chart",
    url: "https://www.manualslib.com/manual/879147/Dewalt-Dwp611.html?page=47",
    confidence: "high",
    report: "§3",
  },
  // §1: bit makers
  "amana-a1": {
    maker: "Amana Tool",
    document: "Solid Carbide Compression Spiral Router Bits (v12)",
    where: "Chart, 18,000 RPM, 1×D; Ramp Down = feed ÷ flutes",
    url: "https://cdn.shopify.com/s/files/1/1558/5651/files/Solid-Carbide-Compression-Spirals-v12.pdf",
    confidence: "high",
    report: "§1b A1",
  },
  "amana-a2": {
    maker: "Amana Tool",
    document: "Solid Carbide Spektra Compression Spiral Router Bits for Baltic Plywood (v3)",
    where: "Chart, 18,000 RPM, 1×D (Spektra-coated tools: 46700-K, 46701-K, …)",
    url: "https://www.amanatool.com/pub/media/productattachments/Solid-Carbide-Spektra-Compression-Spirals-for-Baltic-Plywood_v3.pdf",
    confidence: "high",
    report: "§1b A2",
  },
  "amana-a4": {
    maker: "Amana Tool",
    document: "2 & 3 Flute Solid Carbide Spiral Plunge Router Bits (v19)",
    where: "Chart for up-cut and down-cut tools, 18,000 RPM, 1×D",
    url: "https://www.amanatool.com/pub/media/productattachments/Solid-Carbide-Spiral-Plunge-2-3-Flute-v19.pdf",
    confidence: "high",
    report: "§1b A4",
  },
  "amana-a5": {
    maker: "Amana Tool",
    document: "Drawing: Solid Carbide Compression Spiral 46170 (via ToolsToday)",
    where: '1/4" cutting diameter, 1/4" shank, 0.875" cutting length; up-cut section 0.2756" ± 0.010" (7 mm) from the tip',
    url: "https://toolstoday.com/content/product_downloads/PDF-for-Amana-Tool-Compression-Spiral-2-Flute-Router-Bits.pdf",
    confidence: "high",
    report: "§1b A5",
  },
  "amana-charts": {
    maker: "Amana Tool, Onsrud, Freud",
    document: "Every chart opened (A1–A4, O1–O4, Freud page 3)",
    where: "Depth of cut: 1×D the chart value; 2×D reduce 25%; 3×D reduce 50%",
    url: "https://cdn.shopify.com/s/files/1/1558/5651/files/Solid-Carbide-Compression-Spirals-v12.pdf",
    confidence: "high",
    report: "§1a, §4",
  },
  "onsrud-o1": {
    maker: "Onsrud (LMT Onsrud)",
    document: "MDF Cutting Data (2005, hosted by WOODWEB)",
    where: "Page 1, chipload per tooth at 1×D",
    url: "https://www.woodweb.com/knowledge_base_images/zp/Chipload_MDF.pdf",
    confidence: "high",
    report: "§1c O1",
  },
  "onsrud-o2": {
    maker: "Onsrud (LMT Onsrud)",
    document: "Hard Plywood Cutting Data (2005, hosted by WOODWEB)",
    where: "Page 1, chipload per tooth at 1×D",
    url: "https://www.woodweb.com/knowledge_base_images/zp/Chipload_Hard_Plywood.pdf",
    confidence: "high",
    report: "§1c O2",
  },
  "onsrud-o3": {
    maker: "Onsrud (LMT Onsrud)",
    document: "Laminated Plywood Cutting Data (2005, hosted by WOODWEB)",
    where: 'Page 1. Not clear whether "laminated" means laminate-faced plywood',
    url: "https://www.woodweb.com/knowledge_base_images/zp/Chipload_Plywood.pdf",
    confidence: "high",
    report: "§1c O3",
  },
  "onsrud-o4": {
    maker: "Onsrud (LMT Onsrud)",
    document: "Laminated Chipboard Cutting Data (2005, hosted by WOODWEB)",
    where: "Page 1: melamine / TFL on particleboard, the nearest Onsrud sheet to laminate on MDF",
    url: "https://www.woodweb.com/knowledge_base_images/zp/Chipload_Laminated.pdf",
    confidence: "high",
    report: "§1c O4",
  },
  "crs-melamine": {
    maker: "CNC Router Store (reseller)",
    document: "Why Is My Melamine Chipping?",
    where: "Undated page; relays LMT Onsrud figures for a single-flute compression spiral in particleboard core; laminate practice",
    url: "https://www.cncrouterstore.ca/pages/why-melamine-chips-cnc",
    confidence: "medium",
    report: "§1c, §5",
  },
  "crs-52-200": {
    maker: "CNC Router Store (reseller)",
    document: "52-200 Series Upcut Spiral",
    where: '"for finished top surfaces use a downcut (57-200) or a compression bit"',
    url: "https://www.cncrouterstore.ca/collections/hard-wood/products/52-200-series-upcut-spiral",
    confidence: "medium",
    report: "§5",
  },
  freud: {
    maker: "Freud",
    document: "Get the most out of your Freud bits (router bit feed and speed for CNC, 2017-08-22)",
    where: "Page 2, solid carbide bits at depth = diameter; pages 1–3 for practice",
    url: "https://www.freudtools.com/public/assets/freud/downloadables/freudtools-router-bit-feed-and-speed-for-cnc-20170822.pdf",
    confidence: "high",
    report: "§1d",
  },
  rennie: {
    maker: "Rennie Tool Company (UK reseller)",
    document: "Solid Carbide Router Bit Chip Load Chart",
    where: 'Page 3, mm per tooth; up-cut or down-cut, "NOT applicable to compression bits"',
    url: "https://cdn.shopify.com/s/files/1/0067/9129/9145/files/Solid_Carbide_Router_Bits_Speeds_Feeds_And_Chipload_Information_04804c76-ed51-42b8-93ba-72288d30d811.pdf",
    confidence: "medium",
    report: "§1e",
  },
  // §2, §4, §5, §6: practice
  "atoz": {
    maker: "Shapeoko community",
    document: "Shapeoko CNC A to Z (community e-book, linked by Carbide 3D staff)",
    where: "Feeds and speeds basics",
    url: "https://shapeokoenthusiasts.gitbook.io/shapeoko-cnc-a-to-z/feeds-and-speeds-basics",
    confidence: "low",
    report: "§2, §4, §6",
  },
  "forum-85436": {
    maker: "Carbide 3D community forum",
    document: "Shapeoko 5 Baltic birch feeds and speeds",
    where: "Jan 2025: ramp in at 20° (Ryan Quick); DOC about 1/2 the bit diameter (Tim Jones)",
    url: "https://community.carbide3d.com/t/shapeoko-5-baltic-birch-feeds-and-speeds/85436",
    confidence: "low",
    report: "§2, §4",
  },
  "forum-46692": {
    maker: "Carbide 3D community forum",
    document: "Feeds and speed: compression bit with plywood",
    where: 'Mdbrock, 19 Jun 2022: Carbide Create library depths of cut "0.03"" and "0.04""',
    url: "https://community.carbide3d.com/t/feeds-and-speed-compression-bit-with-plywood/46692",
    confidence: "low",
    report: "§2, §5",
  },
  toolstoday: {
    maker: "ToolsToday (Amana's retailer)",
    document: "Understanding CNC Feeds and Speeds (1 Jul 2026)",
    where: "Plunge feed about half the main feed; test cuts; rubbing",
    url: "https://toolstoday.com/learn/understanding-cnc-feeds-and-speeds",
    confidence: "medium",
    report: "§4, §5, §6",
  },
  laguna: {
    maker: "Laguna Tools (George Vondriska)",
    document: "Onion skinning for small parts on your CNC (10 Nov 2020)",
    where: '"Set the cut depth to .020" less than the thickness of your material"',
    url: "https://info.lagunatools.com/onion-skinning-for-small-parts-on-your-cnc",
    confidence: "medium",
    report: "§5",
  },
  "c3d-251": {
    maker: "Carbide 3D",
    document: '#251 .25" Downcut Flat Cutter',
    where: '"ideal to cut laminates and wood without tearing out the top side … adequate chip evacuation"',
    url: "https://shop.carbide3d.com/products/251-25-downcut-flat-cutter",
    confidence: "high",
    report: "§5",
  },
  "amana-203431": {
    maker: "Amana Tool (listing text quoted by distributors)",
    document: "35 mm hinge boring bit 203431",
    where: '"Maximum RPM is 8,000"; "Not to be used in portable drills or hand held routers"',
    url: "https://www.burnstools.com/35mm-hinge-boring-for-router",
    confidence: "medium",
    report: "§7",
  },
  wurth: {
    maker: "Würth",
    document: "Longlife & Speed Forstner bit",
    where: "Recommended speeds: over 35 mm, 900 rpm in hardwood/MDF",
    url: "https://eshop.wuerth-professional.com/Product-categories/Forstner-bit-LS/39527501020503.cyid/3952.cgid/en/US/AED/",
    confidence: "high",
    report: "§7",
  },
  report8a: {
    maker: "Sawhorse research report",
    document: "Recommended defaults, Shapeoko 5 Pro 4×4 with the Carbide Compact Router",
    where: "§8a table: the dial each row uses; HPL = .0061 × 0.70 (Amana A1 × Rennie's HPL/MDF ratio)",
    url: "docs/research/feeds-speeds-sources.md#8a-shapeoko-5-pro-4x4-with-the-carbide-compact-router",
    confidence: "medium",
    report: "§8a",
  },
  report8b: {
    maker: "Sawhorse research report",
    document: "Recommended defaults, generic hobby 4×4 machine",
    where: '§8b: the lowest manufacturer value; RPM 18,000 unless the feed exceeds the machine\'s limit; "The 1/8" row is Amana\'s printed chart value; on a light machine, start at half of it"',
    url: "docs/research/feeds-speeds-sources.md#8b-generic-hobby-4x4-machine",
    confidence: "low",
    report: "§8b",
  },
} as const satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;

/** A source by id (undefined for an id not in the list: the data test catches that). */
export function source(id: string): Source | undefined {
  return (SOURCES as Record<string, Source>)[id];
}

/** "Amana Tool, Solid Carbide Compression … (high)": one line for a tooltip or a list. */
export function sourceLine(id: SourceId): string {
  const s = SOURCES[id] as Source;
  return `${s.maker}, ${s.document}: ${s.where} (${s.confidence})`;
}
