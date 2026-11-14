# Cabinet generator

A sample Sawhorse plugin (plugin API 1). It builds a frameless (European-style) cabinet for a CNC router from its sizes. Every part is a named component on a plywood material, so the Outliner shows the parts, the Cut list nests them as sheet goods, and the Nesting section's **CNC DXF** writes their dados and holes, a file per sheet named for the cabinet and the parts on it.

## Use it

1. Open the Plugins pane (the puzzle-piece tab at the end of the side panel) and click **Enable…** beside Cabinet generator. The dialog lists what it asks for: read the model, change the model, add a panel and a command, keep settings.
2. The **Cabinet** section appears at the top of the pane, short like a cabinet shop's order form:
   - **Start from** fills in a cabinet: Base (a door and a shelf), Drawer base (three equal drawers), Sink base, a 6 in drawer over a door, Trash pull-out (two bins), Wall (12 in deep, no toe kick, nailers top and bottom, door pulls measured from the bottom), Tall pantry (84 in, too long for a 4 x 4 bed), or Open shelves. It sets the style, the usual sizes and the name, and keeps your stock, joints and hardware. Base cabinets are 23 1/4 in deep (24 in with the door, the frameless standard, and a side and a top share a 4 x 4 sheet); in millimetres they are 870 tall with the toe kick (a 720 carcass on a plinth) and 560 deep.
   - **Name**, width, height and depth, the **style** (doors, drawers, drawers over a door, trash pull-out, open shelves) and how many shelves (0 for none), drawers or bins.
   - Two switches, both on to start: **Hidden (blind) dado joints** and **Drill hardware holes**.
   - **Generate cabinet**, with what it will add and one line on what it comes to: how many parts, from which stock thicknesses (exactly: 23/32 in, not 3/4), how many holes, and the runner's part number.
3. **Details** opens one group at a time; a field shows only when it applies:
   - **Construction:** base, back, joints and bit.
   - **Stock thicknesses.**
   - **Fronts, pulls and hinges.**
   - **Trash bins** (for a trash pull-out).
   - **Drawer runners.**
   - **Every cut and hole**, the table of each cut and how it is made.

## The details

**Stock, measured.** Four thicknesses, and every joint is cut to them, so measure your sheets:

| Field | Starts at | Used for | Material |
|---|---|---|---|
| Cabinet and doors | 23/32 in ("3/4" ply) | sides, top, bottom, shelves, toe kick, doors | Cabinet plywood, Door plywood |
| Drawer fronts | 23/32 in, the doors' stock, so a drawer over a door is flush with it | drawer fronts | Drawer front plywood |
| Drawer boxes | 15/32 in | drawer sides, sub-fronts, backs | Drawer box plywood |
| Back and drawer bottoms | 7/32 in ("1/4" ply) | the back, drawer bottoms | Back plywood |

For a 4 x 4 bed, Nesting > Stock... > **Use 4 x 4 plywood** adds 4 x 4 sheets in 3/4, 1/2 and 1/4 and nests every sheet good on them, so each material finds its thickness by itself. Or give a material its own sheet in Stock...: it must be the material's thickness. The plugin defines a material only when the model does not have it, so the sheet you picked is kept when you generate again. The CNC export warns about any part drawn at a thickness its sheet is not.

**Base and back.**
- **Base:** a toe kick (4 x 3 in to start, with the sides notched for it), or none, for a row of cabinets set on a base you build.
- **Rear nailers:** none, top, or top and bottom, the cabinet stock and a height you set (3 in to start), at the rear edge and behind the back (in dados with blind dados on), to screw the cabinet to the wall through. The back moves in to clear them. With no back, shelves stop at the nailers.
- **Back:** sits in grooves in the sides, the top and the bottom, 1/2 in in from the rear edge. The grooves are 5/16 in deep, and the back plus the fit wide. The top and bottom run to the rear edge to carry the groove; fixed shelves stop at the back. The back can also sit between the sides at the rear, as before. With blind dados, the back's groove must be a different depth from the dados, so each gets its own layer (and bit) in the DXF.

**Fronts.**
- **Doors:** automatic (a pair over 24 in), one or two. One door hinges on the side you pick, and its pull goes on the other edge.
- **Full overlay** (default): the fronts tile the cabinet's face with the gap you set between them (1/8 in) and half of it at the edges.
- **Inset:** fronts sit inside the opening, with half the gap all round.
- A door wider than 24 in is a pair.

**Joinery and bit.**
- **Blind dados:** each side gets a groove for the top, the bottom and each fixed shelf. The groove is a dado depth deep (1/4 in), the stock plus the **fit** wide (0.008 in), and stops short of the front by the distance you set (1/2 in).
- **Rails:** each rail's tongue is 0.5 mm shorter than its groove, so the shoulders close. Its front corners are notched the stop plus one **bit diameter** deep, so the round end the router leaves in the groove never meets the rail's square shoulder.
- **Narrow grooves:** a groove narrower than the bit (the back and drawer-bottom grooves, about 7/32 in) is listed, to cut with a smaller bit on its own layer.

**Trash pull-out.** One full-height drawer front on Blum runners. The box is a low tray (6 in sides to start); its sub-front and back run full height as uprights, and a bin frame spans between them in dados, at the bins' lip height, with a cutout for each bin: one, two side by side, or two front to back. Set the cutout (measured just under the lip) and the lip's height above the tray's bottom from your own bins; the starting numbers are only placeholders. The frame needs 3/4 in of wood around each cutout; the cutouts go on CUTOUT_THRU in the DXF.

**Drawer runners.** Drawers are sized for Blum runners from Blum's own tables (TANDEM plus BLUMOTION 563H, 2017 pp. 14-15; MOVENTO 763H, 2019 pp. 8-9; in `RUNNERS` in `cabinet.js`):

| | TANDEM 563H | MOVENTO 763H |
|---|---|---|
| Drawer lengths | 229, 305, 381, 457, 533 mm (9 to 21 in) | 305, 381, 457, 533 mm (12 to 21 in) |
| Inside of the box | opening - 42 mm | opening - 42 mm |
| Box height | opening - 21 mm | opening - 23 mm |
| Box bottom above the opening | 14 mm | 16 mm |
| Bottom recess | 13 mm | 13 mm |
| Runner screws above the opening | 37 mm | 38 mm |
| Runner screws from the front | 37, A, B (Blum's table) | 37, A, B, or 3 mm less each with a 1/2 in or thinner box (Blum's note for sub-fronts without T59.K010M) |

**Runner length** is the longest the inside depth allows, or the one you pick. Box sides are 12 to 16 mm.

**Drawer heights.** A drawer cabinet's fronts are all one height (an overlay front covers the top or the bottom, so the top and bottom boxes are a thickness shorter). Drawers over a door are each **Drawer front height** tall (6 in, 150 mm to start), stacked from the top, with the door under them and the shelves behind it.

**Drawer box construction.**
- The bottom slides in from the back, in grooves 13 mm up in the sides and the sub-front.
- The box back sits on the bottom, so the runner passes under it: there is no runner notch to cut (Blum's "no notching" option). The bottom must be 6 mm (1/4 in) or thinner, or the rear hook hole breaks out of the back's bottom edge.
- The bottom is 1/32 in short of the grooves' bottoms on each edge, and runs to the back of the box, where it is screwed up into the back.

**Hardware.** Tick **Drill hardware holes** to drill what a flat-bed router can.
- **Hinges:** a Blum CLIP top cup, 35 mm and 13 mm deep, in each door's back face. Its centre is 17.5 mm plus the **boring distance** (3 to 7 mm, 5 to start) from the hinge edge. The table says what overlay that gives on a 0 mm plate (Blum: 11 + boring distance, 16 mm at 5) against what the door covers (the side less half the gap), and the boring distance that matches. Hinges sit **in from the door's top and bottom** by the distance you set; doors over 900 mm tall get three, then four and five. Each mounting plate gets two 5 mm holes 11.5 mm deep, 32 mm apart, 37 mm back, for plates with pre-mounted system screws (173L8100, 175L8100; the 173L6100 family takes wood screws instead). A plate that would sit on a shelf slides along the door, and the table says by how much.
- **Door pull:** two through holes on the opening edge.
  - Vertical or horizontal.
  - Measured from the top (base cabinets) or the bottom (wall cabinets).
  - Placed by how far the nearer hole is from that end, how far the holes are from the opening edge, and their spacing.
  - A pull that would hit a hinge cup is refused.
- **Drawer pull:**
  - two through holes, centred or a set distance down from the top, at the spacing you set; or
  - **no pull:** a finger notch in the front's top edge, its width and depth yours to set. The sub-front behind it is cut 25 mm lower, so fingers reach behind the front. The notch needs no hardware ticked.
- **Pull hole diameter** is 5 mm to start.
- **Runner screws:** 5 mm x 13 mm holes in both sides, for Blum system screws.
- **Rear hook holes:** 6 mm x 10 mm in the rear face of each drawer back, 7 mm from each end (the sides' inside faces) and 24 mm above the bottom of the box (Blum: 11 above the 13 mm notch line).
- **Locking devices** (T51.1901 for TANDEM, T51.7601 for MOVENTO) each need two 2.5 mm pilot holes 10 mm deep at 75 degrees, drilled by hand with the T65.1600.01 template.
- 5 and 6 mm holes are smaller than a 1/4 in bit: the table says to drill their layers with drill bits of their size.

The table lists every cut and how it is made. With inset fronts, the hinge plates and runner screws are listed but not drilled: they are left to Blum's inset tables.

**Changing it.** Select the cabinet (a click on it selects the whole component) and the button reads **Update selected cabinet**: it replaces that cabinet in place with the new sizes, again as one undo step. With anything else selected, it adds a new cabinet beside the model. The whole cabinet is one undo step ("Generate cabinet").

The last sizes are kept for next time (the plugin's own store), and which cabinet it made is kept in the document (saved inside the `.shz`). Sizes saved by an older version still load:
- a centred pull stays centred;
- an "undermount" pull (a hole in a front's bottom edge, which no router can drill) becomes no pull;
- a toe kick of 0 becomes no toe kick.

## How it is built

`main.js` is the panel. `cabinet.js` plans the parts and holds the Blum tables. `mesh.js` builds a closed mesh for a box with grooves, notches, and blind or through holes. The cabinet is one `model.batch(...)` holding one import, so dados and holes are the same undo step as the boxes. Plain JavaScript with `// @ts-check`, checked against `packages/plugin-api/index.d.ts` by `npm run plugin:check`. Read it next to `docs/PLUGINS.md`.

## Licence

MIT (see `LICENSE`). Author: Sawhorse.
