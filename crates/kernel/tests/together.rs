//! Keep together (grain-matched fronts): parts that share a key in one group or component
//! are nested as one rigid block, in index order, a kerf apart, their grain lined up, never
//! split. Through `nest_list` on hand-made cut lists (both algorithms, the router and the
//! saw, a block too large, mixed with parts on their own, two copies of a cabinet), through
//! the model (`set_together`: refusals, undo, the snapshot, hashes, explode), the checker
//! (a good nesting changed one way at a time is caught), and property tests on random lists
//! with random blocks.

use glam::DVec3;
use proptest::prelude::*;
use sawhorse_kernel::Document;
use sawhorse_kernel::cutlist::{
    CutList, CutOptions, CutRow, CutTotals, Grain, M_PER_IN, Occurrence, PartBox, PartKey, PartRef,
    Rounding, Stack, Together,
};
use sawhorse_kernel::model::{DrawTarget, Model, Op, OpOutcome};
use sawhorse_kernel::nesting::{NestOptions, Nesting, Placement, UnplacedReason, nest_list};
use sawhorse_kernel::nodes::Item;
use sawhorse_kernel::stock::{
    NestAlgorithm, NestSettings, SawOverflow, SheetSize, StockDef, StockGrain, StockKind,
    StockLibrary,
};
use sawhorse_kernel::testing::{check_blocks, check_nesting_of};
use sawhorse_kernel::transform::Xform;

const IN: f64 = M_PER_IN;

/// One row of a hand-made list: width, length (in), copies, grain, material, keep together
/// (key, index, stack, the holder of every copy).
struct R {
    w: f64,
    l: f64,
    qty: usize,
    grain: Grain,
    material: &'static str,
    together: Option<(&'static str, u32, Stack)>,
    holders: Vec<Option<u64>>,
}

fn r(w: f64, l: f64, grain: Grain) -> R {
    R {
        w,
        l,
        qty: 1,
        grain,
        material: "Front ply",
        together: None,
        holders: vec![],
    }
}

impl R {
    fn kept(mut self, key: &'static str, index: u32, stack: Stack) -> R {
        self.together = Some((key, index, stack));
        self
    }
    fn qty(mut self, qty: usize, holders: Vec<Option<u64>>) -> R {
        self.qty = qty;
        self.holders = holders;
        self
    }
    fn of(mut self, material: &'static str) -> R {
        self.material = material;
        self
    }
}

/// Sheet parts 0.72 in thick, every one counted.
fn list(rows: &[R]) -> CutList {
    let mut out = Vec::new();
    let mut next = 1u64;
    for (k, p) in rows.iter().enumerate() {
        let mut size = [0.72 * IN, p.w * IN, p.l * IN];
        size.sort_by(f64::total_cmp);
        let occurrences = (0..p.qty)
            .map(|c| {
                let id = next;
                next += 1;
                Occurrence {
                    item: Item::Object(id),
                    visible: true,
                    handed: false,
                    bbox: PartBox {
                        axes: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
                        size,
                        center: [0.0; 3],
                        shaped: false,
                    },
                    holder: p.holders.get(c).copied().flatten(),
                }
            })
            .collect();
        out.push(CutRow {
            key: PartKey::Object(k as u64 + 1),
            target: PartRef::Object(k as u64 + 1),
            name: format!("Part {}", k + 1),
            qty: p.qty,
            total: p.qty,
            hidden: 0,
            handed: 0,
            size,
            rounded: size,
            steps: [0; 3],
            shaped: false,
            scaled: false,
            not_solid: false,
            included: true,
            uncounted: None,
            nominal_thickness: size[0],
            nominal: None,
            grain: p.grain,
            grain_set: p.grain != Grain::Length,
            material: Some(p.material.into()),
            stock_set: false,
            sheet: true,
            sheet_set: true,
            board_feet: 0.0,
            area_m2: 0.0,
            bom: Vec::new(),
            stretched: 0,
            together: p.together.map(|(key, index, stack)| Together {
                key: key.into(),
                index,
                stack,
            }),
            occurrences,
        });
    }
    CutList {
        rounding: Rounding::Sixteenth,
        visible_only: false,
        rows: out,
        totals: CutTotals {
            parts: 0,
            pieces: 0,
            excluded: 0,
            not_solid: 0,
            loose_faces: 0,
            loose_here: 0,
            loose_places: vec![],
            uncounted: 0,
            hidden: 0,
            board_feet: 0.0,
            lumber: vec![],
            sheets: vec![],
            sheet_count: 0,
        },
        sheet_size: [48.0 * IN, 96.0 * IN],
        hash: String::new(),
    }
}

fn sheet(name: &str, w: f64, l: f64, t: f64, grain: StockGrain) -> StockDef {
    StockDef {
        name: name.into(),
        kind: StockKind::Sheet,
        length: l * IN,
        width: w * IN,
        thickness: t * IN,
        nominal: Some("3/4".into()),
        grain,
    }
}

/// The built-in library with a router's 4 x 4 of 3/4 ply, "Front ply" defaulting to it.
fn shop() -> StockLibrary {
    let mut lib = StockLibrary::builtin();
    lib.defaults.clear();
    lib.stocks.push(sheet(
        "4 x 4 sheet, 3/4",
        48.0,
        48.0,
        23.0 / 32.0,
        StockGrain::Length,
    ));
    lib.defaults
        .insert("Front ply".into(), "4 x 4 sheet, 3/4".into());
    lib
}

/// Kerf and trim (in) on the router's 4 x 4, `alg`; with `saw`, a 4 x 8 track saw (1/8 in
/// kerf, 1/4 in trim) takes what the router's sheet cannot.
fn router(kerf: f64, trim: f64, alg: NestAlgorithm, saw: bool) -> NestSettings {
    NestSettings {
        kerf: kerf * IN,
        trim: trim * IN,
        algorithm: alg,
        sheet_size: Some(SheetSize {
            width: 48.0 * IN,
            length: 48.0 * IN,
        }),
        overflow: saw.then_some(SawOverflow {
            sheet_size: SheetSize {
                width: 48.0 * IN,
                length: 96.0 * IN,
            },
            kerf: IN / 8.0,
            trim: 0.25 * IN,
        }),
        ..NestSettings::default()
    }
}

const ALGS: [NestAlgorithm; 2] = [NestAlgorithm::Guillotine, NestAlgorithm::Maxrects];

fn nested(l: &CutList, lib: &StockLibrary, st: NestSettings) -> Nesting {
    let n = nest_list(l, lib, st);
    check_nesting_of(l, &n).unwrap_or_else(|e| panic!("{e}\n{n:#?}"));
    n
}

/// Every placement of the block `key`, in its order, with the piece it is on.
fn block<'a>(n: &'a Nesting, key: &str) -> Vec<(usize, &'a Placement)> {
    let mut out: Vec<(usize, &Placement)> = n
        .pieces
        .iter()
        .enumerate()
        .flat_map(|(pi, p)| p.placements.iter().map(move |q| (pi, q)))
        .filter(|(_, q)| q.together.as_ref().is_some_and(|b| b.key == key))
        .collect();
    out.sort_by_key(|(pi, q)| (*pi, q.together.as_ref().unwrap().n));
    out
}

/// Four drawer fronts of a 17 in wide cabinet, 6, 7, 8 and 9 in high, the grain running up
/// the cabinet (across each front's length: `Grain::Width`), the bottom one first; and three
/// parts on their own.
fn fronts(stack: Stack) -> CutList {
    let grain = match stack {
        Stack::Along => Grain::Width,
        Stack::Across => Grain::Length,
    };
    list(&[
        r(20.0, 30.0, Grain::Length),
        r(17.0, 9.0, grain).kept("fronts", 3, stack),
        r(17.0, 6.0, grain).kept("fronts", 0, stack),
        r(10.0, 40.0, Grain::Length),
        r(17.0, 8.0, grain).kept("fronts", 2, stack),
        r(17.0, 7.0, grain).kept("fronts", 1, stack),
        r(5.0, 12.0, Grain::None).qty(3, vec![]),
    ])
}

/// End to end along the grain, in index order, each the kerf on from the last to the
/// nanometre, on one sheet, all turned alike, with both algorithms and two kerfs.
#[test]
fn fronts_with_the_grain_up_the_cabinet_are_cut_end_to_end_a_kerf_apart() {
    let l = fronts(Stack::Along);
    for alg in ALGS {
        for kerf in [0.25, 3.0 / 8.0] {
            let n = nested(&l, &shop(), router(kerf, 0.5, alg, false));
            assert!(n.unplaced.is_empty(), "{:#?}", n.unplaced);
            let b = block(&n, "fronts");
            assert_eq!(b.len(), 4);
            let rows: Vec<usize> = b.iter().map(|(_, q)| q.row).collect();
            assert_eq!(rows, [2, 5, 4, 1], "lowest index first");
            assert!(b.iter().all(|(pi, _)| *pi == b[0].0), "one sheet");
            let k = kerf * IN;
            for w in b.windows(2) {
                let (p, q) = (w[0].1, w[1].1);
                // The grain runs along x (the sheet's length): the fronts follow one another
                // along it, each a kerf on, lined up on the same edge.
                assert!((q.x - (p.x + p.dx + k)).abs() < 1e-12, "{p:?} {q:?}");
                assert_eq!(q.y, p.y);
                assert_eq!((q.turned, q.dy), (p.turned, p.dy));
                assert!(q.turned, "a front's length runs across the sheet's grain");
            }
            let says: Vec<_> = b
                .iter()
                .map(|(_, q)| {
                    let t = q.together.as_ref().unwrap();
                    (t.index, t.n, t.of, t.stack)
                })
                .collect();
            assert_eq!(
                says,
                [
                    (0, 1, 4, Stack::Along),
                    (1, 2, 4, Stack::Along),
                    (2, 3, 4, Stack::Along),
                    (3, 4, 4, Stack::Along)
                ]
            );
            // Parts on their own say nothing.
            assert!(
                n.pieces
                    .iter()
                    .flat_map(|p| &p.placements)
                    .filter(|q| ![1, 2, 4, 5].contains(&q.row))
                    .all(|q| q.together.is_none())
            );
        }
    }
}

/// Grain across the cabinet: ripped one off the next, side by side across the grain.
#[test]
fn fronts_with_the_grain_across_are_ripped_side_by_side() {
    let l = fronts(Stack::Across);
    for alg in ALGS {
        let n = nested(&l, &shop(), router(0.25, 0.5, alg, false));
        assert!(n.unplaced.is_empty(), "{:#?}", n.unplaced);
        let b = block(&n, "fronts");
        assert_eq!(b.len(), 4);
        for w in b.windows(2) {
            let (p, q) = (w[0].1, w[1].1);
            assert!(
                (q.y - (p.y + p.dy + 0.25 * IN)).abs() < 1e-12,
                "{p:?} {q:?}"
            );
            assert_eq!(q.x, p.x);
            assert!(!q.turned && !p.turned);
            assert_eq!(q.dx, p.dx);
        }
    }
}

/// A block too long for the router's sheet goes to the saw's sheet whole, a saw's kerf
/// apart; with no saw, or too long for the saw too, every part of it is reported, too large
/// as a block, and the other parts are nested as before.
#[test]
fn a_block_too_large_goes_to_the_saw_whole_or_is_reported_whole() {
    // Six fronts 9 in high: 54 in and five kerfs along the grain, more than a 4 x 4 holds.
    let tall = |n: u32| {
        let mut rows = vec![r(20.0, 30.0, Grain::Length)];
        for i in 0..n {
            rows.push(r(17.0, 9.0, Grain::Width).kept("tall", i, Stack::Along));
        }
        list(&rows)
    };
    let l = tall(6);
    for alg in ALGS {
        let n = nested(&l, &shop(), router(0.25, 0.5, alg, true));
        assert!(n.unplaced.is_empty(), "{:#?}", n.unplaced);
        let b = block(&n, "tall");
        assert_eq!(b.len(), 6);
        let piece = &n.pieces[b[0].0];
        assert!(
            piece.saw && piece.stock == "4 x 8 sheet, 3/4",
            "{}",
            piece.stock
        );
        for w in b.windows(2) {
            assert!((w[1].1.x - (w[0].1.x + w[0].1.dx + IN / 8.0)).abs() < 1e-12);
        }
        // The part on its own stays on the router's sheet.
        assert!(
            n.pieces
                .iter()
                .any(|p| !p.saw && p.placements.iter().any(|q| q.row == 0))
        );

        // No saw: reported, every part, against the router's sheet; nothing of it placed.
        let n = nested(&l, &shop(), router(0.25, 0.5, alg, false));
        assert!(block(&n, "tall").is_empty());
        assert_eq!(n.unplaced.len(), 6);
        for (i, u) in n.unplaced.iter().enumerate() {
            assert_eq!(u.reason, UnplacedReason::TogetherTooLarge);
            assert_eq!(u.stock.as_deref(), Some("4 x 4 sheet, 3/4"));
            assert_eq!(u.together.as_ref().unwrap().n, i + 1);
        }
        assert_eq!(n.totals.placed, 1);
    }
    // Eleven: 99 in, more than the saw's 4 x 8 too; reported against the saw's sheet.
    let n = nested(
        &tall(11),
        &shop(),
        router(0.25, 0.5, NestAlgorithm::Maxrects, true),
    );
    assert_eq!(n.unplaced.len(), 11);
    assert!(
        n.unplaced
            .iter()
            .all(|u| u.reason == UnplacedReason::TogetherTooLarge
                && u.stock.as_deref() == Some("4 x 8 sheet, 3/4"))
    );
}

/// A block is never split: two parts with one index, parts of two materials, two ways of
/// running, or a part that has no stock keep the whole block off the sheet, each part saying
/// why (its own reason, or the block's).
#[test]
fn a_block_that_cannot_be_one_is_reported_never_split() {
    let st = router(0.25, 0.5, NestAlgorithm::Guillotine, false);
    let cases: Vec<(&str, CutList)> = vec![
        (
            "one index twice",
            list(&[
                r(17.0, 6.0, Grain::Width).kept("f", 0, Stack::Along),
                r(17.0, 7.0, Grain::Width).kept("f", 0, Stack::Along),
            ]),
        ),
        (
            "two materials",
            list(&[
                r(17.0, 6.0, Grain::Width).kept("f", 0, Stack::Along),
                r(17.0, 7.0, Grain::Width)
                    .kept("f", 1, Stack::Along)
                    .of("Oak"),
            ]),
        ),
        (
            "two ways",
            list(&[
                r(17.0, 6.0, Grain::Width).kept("f", 0, Stack::Along),
                r(17.0, 7.0, Grain::Width).kept("f", 1, Stack::Across),
            ]),
        ),
    ];
    for (what, l) in cases {
        let n = nested(&l, &shop(), st);
        assert_eq!(n.totals.placed, 0, "{what}");
        assert!(
            n.unplaced
                .iter()
                .all(|u| u.reason == UnplacedReason::Together && u.together.is_some()),
            "{what}: {:#?}",
            n.unplaced
        );
    }
    // A part too wide for any sheet says so; the rest of its block says the block.
    let l = list(&[
        r(17.0, 6.0, Grain::Width).kept("f", 0, Stack::Along),
        r(17.0, 60.0, Grain::Length).kept("f", 1, Stack::Along),
    ]);
    let n = nested(&l, &shop(), st);
    let why: Vec<_> = n.unplaced.iter().map(|u| (u.row, u.reason)).collect();
    assert_eq!(
        why,
        [(0, UnplacedReason::Together), (1, UnplacedReason::TooLarge)]
    );
}

/// Each copy of a cabinet (each holder) is a block of its own; a block of one part is just
/// that part.
#[test]
fn each_copy_of_a_cabinet_is_its_own_block() {
    let l = list(&[
        r(17.0, 6.0, Grain::Width)
            .kept("f", 0, Stack::Along)
            .qty(2, vec![Some(10), Some(20)]),
        r(17.0, 8.0, Grain::Width)
            .kept("f", 1, Stack::Along)
            .qty(2, vec![Some(20), Some(10)]),
        r(17.0, 5.0, Grain::Width).kept("g", 0, Stack::Along),
    ]);
    for alg in ALGS {
        let n = nested(&l, &shop(), router(0.25, 0.5, alg, false));
        assert!(n.unplaced.is_empty());
        let all = block(&n, "f");
        assert_eq!(all.len(), 4);
        let pairs: Vec<_> = all
            .iter()
            .map(|(_, q)| (q.row, q.copy, q.together.as_ref().unwrap().of))
            .collect();
        assert!(pairs.iter().all(|p| p.2 == 2), "{pairs:?}");
        let g = block(&n, "g");
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].1.together.as_ref().unwrap().of, 1);
    }
}

/// Nothing kept together: nothing in the nesting says so, and the JSON has no such field.
#[test]
fn without_blocks_nothing_is_written() {
    let mut l = fronts(Stack::Along);
    for row in &mut l.rows {
        row.together = None;
    }
    let n = nested(
        &l,
        &shop(),
        router(0.25, 0.5, NestAlgorithm::Maxrects, false),
    );
    let json = serde_json::to_string(&n).unwrap();
    assert!(!json.contains("together"), "{json}");
    assert!(!serde_json::to_string(&l).unwrap().contains("together"));
    // With them, the hash is not the same.
    let k = nested(
        &fronts(Stack::Along),
        &shop(),
        router(0.25, 0.5, NestAlgorithm::Maxrects, false),
    );
    assert_ne!(k.hash, n.hash);
}

/// The checker measures each block itself: a good nesting changed one way at a time is
/// caught.
#[test]
fn the_checker_catches_a_block_that_is_not_one() {
    let l = fronts(Stack::Along);
    let n = nested(
        &l,
        &shop(),
        router(0.25, 0.5, NestAlgorithm::Guillotine, false),
    );
    let find = |n: &Nesting, row: usize| -> (usize, usize) {
        for (pi, p) in n.pieces.iter().enumerate() {
            if let Some(qi) = p.placements.iter().position(|q| q.row == row) {
                return (pi, qi);
            }
        }
        panic!("row {row}")
    };
    type Edit = Box<dyn Fn(&mut Nesting)>;
    let edits: Vec<(&str, Edit)> = vec![
        (
            "a front a millimetre off its kerf",
            Box::new(move |n| {
                let (pi, qi) = find(n, 4);
                n.pieces[pi].placements[qi].x += 0.001;
            }),
        ),
        (
            "two fronts swapped",
            Box::new(move |n| {
                let (pa, qa) = find(n, 5);
                let (pb, qb) = find(n, 4);
                let (xa, xb) = (n.pieces[pa].placements[qa].x, n.pieces[pb].placements[qb].x);
                let (da, db) = (
                    n.pieces[pa].placements[qa].dx,
                    n.pieces[pb].placements[qb].dx,
                );
                n.pieces[pa].placements[qa].x = xb + db - da;
                n.pieces[pb].placements[qb].x = xa;
            }),
        ),
        (
            "a front that does not say its place",
            Box::new(move |n| {
                let (pi, qi) = find(n, 1);
                n.pieces[pi].placements[qi].together = None;
            }),
        ),
        (
            "a part on its own that says it is in a block",
            Box::new(move |n| {
                let (pi, qi) = find(n, 0);
                let said = find(n, 1);
                let b = n.pieces[said.0].placements[said.1].together.clone();
                n.pieces[pi].placements[qi].together = b;
            }),
        ),
    ];
    for (what, edit) in edits {
        let mut bad = n.clone();
        edit(&mut bad);
        // By the block check itself, not only by another (a part moved is not freed by
        // the cuts either).
        assert!(check_blocks(&l, &bad).is_err(), "{what} was not caught");
        assert!(check_nesting_of(&l, &bad).is_err(), "{what} was not caught");
    }
    // A front dropped from the sheet is caught too.
    let mut bad = n.clone();
    let (pi, qi) = find(&bad, 1);
    bad.pieces[pi].placements.remove(qi);
    assert!(check_blocks(&l, &bad).is_err(), "a front dropped");
    assert!(check_nesting_of(&l, &bad).is_err(), "a front dropped");
    // A block reported too large that fits: the six tall fronts reported with no saw, checked
    // against fronts an inch lower, which a 4 x 4 takes.
    let tall = |h: f64| {
        let rows: Vec<R> = (0..6)
            .map(|i| r(17.0, h, Grain::Width).kept("tall", i, Stack::Along))
            .collect();
        list(&rows)
    };
    let st = router(0.25, 0.5, NestAlgorithm::Guillotine, false);
    let reported = nested(&tall(9.0), &shop(), st);
    assert_eq!(reported.unplaced.len(), 6);
    let mut lower = tall(7.0);
    for row in &mut lower.rows {
        row.size[1] = 7.0 * IN;
    }
    let e = check_blocks(&lower, &reported).unwrap_err();
    assert!(e.contains("but fits it"), "{e}");
}

// ---- through the model ---------------------------------------------------------------------

fn ok(d: &mut Document, op: Op) -> OpOutcome {
    d.apply(&op).unwrap_or_else(|e| panic!("{op:?}: {e}"))
}

/// A board from (x, y, z), `w` along red, `d` along green, `h` up (inches).
fn board(doc: &mut Document, x: f64, y: f64, z: f64, w: f64, d: f64, h: f64) -> u64 {
    let (x, y, z, w, d, h) = (x * IN, y * IN, z * IN, w * IN, d * IN, h * IN);
    let out = ok(
        doc,
        Op::Draw {
            target: DrawTarget::Plane {
                origin: [0.0, 0.0, z],
                normal: [0.0, 0.0, 1.0],
            },
            points: vec![[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]],
            closed: true,
            curve: None,
        },
    );
    let OpOutcome::Drawn {
        sketch: Some(sketch),
        inside: Some(region),
        ..
    } = out
    else {
        panic!("{out:?}")
    };
    match ok(
        doc,
        Op::Extrude {
            sketch,
            region,
            distance: h,
        },
    ) {
        OpOutcome::ObjectCreated { object } => object,
        o => panic!("{o:?}"),
    }
}

fn component(d: &mut Document, items: Vec<Item>, name: &str) -> (u64, u64) {
    match ok(
        d,
        Op::MakeComponent {
            items,
            name: name.into(),
        },
    ) {
        OpOutcome::ComponentCreated {
            instance,
            definition,
        } => (instance, definition),
        o => panic!("{o:?}"),
    }
}

fn kept(key: &str, index: u32) -> Option<Together> {
    Some(Together {
        key: key.into(),
        index,
        stack: Stack::Along,
    })
}

/// A cabinet (a component) of a side and three 3/4 in drawer fronts, each front a component
/// of its own (5, 6 and 7 in high, 17 in wide, standing at y = 0), made of "Front ply" on
/// sheet stock. Returns the document, the cabinet's instance and the fronts' instances.
fn cabinet() -> (Document, u64, Vec<u64>) {
    let mut d = Document::with_ground_sketch();
    ok(
        &mut d,
        Op::DefineMaterial {
            name: "Front ply".into(),
            color: [190, 160, 120, 255],
            texture: None,
            size: None,
            rotation: 0.0,
            offset: [0.0; 2],
            stock: None,
        },
    );
    let mut items = Vec::new();
    let mut fronts = Vec::new();
    let mut z = 0.0;
    for (i, h) in [5.0, 6.0, 7.0].into_iter().enumerate() {
        let o = board(&mut d, 0.0, 0.0, z, 17.0, 0.75, h);
        ok(
            &mut d,
            Op::SetMaterial {
                object: o,
                material: Some("Front ply".into()),
            },
        );
        let (inst, _) = component(&mut d, vec![Item::Object(o)], &format!("Front {i}"));
        ok(
            &mut d,
            Op::SetStock {
                part: PartRef::Node(inst),
                stock: Some("3/4 birch ply".into()),
                sheet: None,
            },
        );
        items.push(Item::Node(inst));
        fronts.push(inst);
        z += h + 0.125;
    }
    let side = board(&mut d, -1.0, 0.0, 0.0, 0.75, 20.0, 30.0);
    let (side, _) = component(&mut d, vec![Item::Object(side)], "Side");
    items.push(Item::Node(side));
    let (cab, _) = component(&mut d, items, "Cabinet");
    (d, cab, fronts)
}

fn cut(m: &Model) -> CutList {
    m.cut_list(&CutOptions::default())
}

fn nest_model(d: &Document) -> Nesting {
    let n = d.model().nest(&NestOptions::default());
    check_nesting_of(&cut(d.model()), &n).unwrap_or_else(|e| panic!("{e}"));
    n
}

/// The op through a part of the cabinet: the fronts of every copy are blocks of their own;
/// clearing gives back the model's and the nesting's hashes; undo works; the snapshot keeps
/// it; a file with a bad one is refused.
#[test]
fn set_together_keeps_the_fronts_of_each_copy_together() {
    let (mut d, cab, _) = cabinet();
    let plain = (d.model().hash(), cut(d.model()).hash, nest_model(&d).hash);
    // Through the fronts as they are now (inside the cabinet), by their definitions.
    let defs: Vec<u64> = cut(d.model())
        .rows
        .iter()
        .filter(|r| r.name.starts_with("Front"))
        .map(|r| match r.target {
            PartRef::Definition(id) => id,
            t => panic!("{t:?}"),
        })
        .collect();
    assert_eq!(defs.len(), 3);
    for (i, &def) in defs.iter().enumerate() {
        ok(
            &mut d,
            Op::SetTogether {
                part: PartRef::Definition(def),
                together: kept("Cabinet fronts", i as u32),
            },
        );
    }
    assert_ne!(d.model().hash(), plain.0);
    let l = cut(d.model());
    assert!(
        l.rows
            .iter()
            .filter(|r| r.name.starts_with("Front"))
            .all(|r| r
                .together
                .as_ref()
                .is_some_and(|t| t.key == "Cabinet fronts"))
    );
    let n = nest_model(&d);
    let b = block(&n, "Cabinet fronts");
    assert_eq!(b.len(), 3);
    // A second cabinet: a second block.
    let OpOutcome::Copied { .. } = ok(
        &mut d,
        Op::Copy {
            objects: vec![],
            nodes: vec![cab],
            xform: Xform::translation(DVec3::new(30.0 * IN, 0.0, 0.0)),
        },
    ) else {
        panic!()
    };
    let n = nest_model(&d);
    let b = block(&n, "Cabinet fronts");
    assert_eq!(b.len(), 6);
    assert!(b.iter().all(|(_, q)| q.together.as_ref().unwrap().of == 3));
    // Saved and opened: the same model, cut list and nesting.
    let json = serde_json::to_string(&d.model().snapshot()).unwrap();
    assert!(
        json.contains(r#""together":{"key":"Cabinet fronts","index":2}"#),
        "{json}"
    );
    let back = Model::from_snapshot(&serde_json::from_str(&json).unwrap()).unwrap();
    assert_eq!(back.hash(), d.model().hash());
    assert_eq!(back.nest(&NestOptions::default()).hash, n.hash);
    // A file that could not have been made is refused.
    for (from, to) in [
        (
            r#""key":"Cabinet fronts","index":2"#,
            r#""key":" Cabinet","index":2"#,
        ),
        (
            r#""key":"Cabinet fronts","index":2"#,
            r#""key":"","index":2"#,
        ),
        (
            r#""key":"Cabinet fronts","index":2"#,
            r#""key":"Cabinet fronts","index":10000"#,
        ),
        (
            r#""key":"Cabinet fronts","index":2"#,
            r#""key":"Cab\tinet","index":2"#,
        ),
    ] {
        let tampered = json.replacen(from, to, 1);
        assert_ne!(tampered, json);
        let e = Model::from_snapshot(&serde_json::from_str(&tampered).unwrap()).unwrap_err();
        assert!(e.to_string().contains("keep together"), "{e}");
    }
    // `across` is written; `along` is not.
    ok(
        &mut d,
        Op::SetTogether {
            part: PartRef::Definition(defs[0]),
            together: Some(Together {
                key: "Cabinet fronts".into(),
                index: 0,
                stack: Stack::Across,
            }),
        },
    );
    let json = serde_json::to_string(&d.model().snapshot()).unwrap();
    assert!(json.contains(r#""index":0,"stack":"across""#), "{json}");
    // Undo, and clearing: back to the hashes of a model that never said it.
    d.apply(&Op::Undo).unwrap();
    d.apply(&Op::Undo).unwrap();
    for &def in &defs {
        ok(
            &mut d,
            Op::SetTogether {
                part: PartRef::Definition(def),
                together: None,
            },
        );
    }
    assert_eq!(
        (d.model().hash(), cut(d.model()).hash, nest_model(&d).hash),
        plain
    );
    assert!(
        !serde_json::to_string(&d.model().snapshot())
            .unwrap()
            .contains("together")
    );
}

/// Refused: a key or index that cannot be kept, a whole cabinet (an assembly, never nested),
/// a part that is not there. The model is unchanged. Clearing is always allowed.
#[test]
fn set_together_refuses_what_cannot_be_kept() {
    let (mut d, cab, fronts) = cabinet();
    let before = d.hash();
    let def = cut(d.model())
        .rows
        .iter()
        .find(|r| r.name == "Front 0")
        .map(|r| r.target)
        .unwrap();
    for (key, index) in [
        ("", 0),
        ("   ", 0),
        (" fronts", 0),
        ("fronts ", 0),
        ("fr\nonts", 0),
        (&*"x".repeat(65), 0),
        ("fronts", 10_000),
    ] {
        let e = d
            .apply(&Op::SetTogether {
                part: def,
                together: kept(key, index),
            })
            .unwrap_err();
        assert!(e.to_string().starts_with("keep together: "), "{key:?}: {e}");
    }
    let e = d
        .apply(&Op::SetTogether {
            part: PartRef::Node(cab),
            together: kept("fronts", 0),
        })
        .unwrap_err();
    assert!(e.to_string().contains("holds other parts"), "{e}");
    assert!(
        d.apply(&Op::SetTogether {
            part: PartRef::Definition(9999),
            together: kept("fronts", 0),
        })
        .is_err()
    );
    assert_eq!(d.hash(), before);
    ok(
        &mut d,
        Op::SetTogether {
            part: PartRef::Node(cab),
            together: None,
        },
    );
    // The limits themselves are kept.
    ok(
        &mut d,
        Op::SetTogether {
            part: def,
            together: kept(&"x".repeat(64), 9_999),
        },
    );
    // As a plugin sends it.
    let op: Op = serde_json::from_str(&format!(
        r#"{{"op":"set_together","part":{{"node":{}}},"together":{{"key":"Cabinet 3 fronts","index":1,"stack":"across"}}}}"#,
        fronts[1]
    ))
    .unwrap();
    assert!(matches!(op, Op::SetTogether { .. }));
}

/// Exploding a part component hands its keep together to the one solid that becomes the
/// part; the block is still whole.
#[test]
fn exploding_a_kept_part_keeps_it_in_its_block() {
    let mut d = Document::with_ground_sketch();
    let mut insts = Vec::new();
    for (i, z) in [0.0, 7.0].into_iter().enumerate() {
        let o = board(&mut d, 0.0, 0.0, z, 17.0, 0.75, 6.0);
        let (inst, def) = component(&mut d, vec![Item::Object(o)], &format!("Front {i}"));
        ok(
            &mut d,
            Op::SetStock {
                part: PartRef::Definition(def),
                stock: Some("3/4 birch ply".into()),
                sheet: None,
            },
        );
        ok(
            &mut d,
            Op::SetTogether {
                part: PartRef::Definition(def),
                together: kept("pair", i as u32),
            },
        );
        insts.push(inst);
    }
    let out = ok(&mut d, Op::Explode { node: insts[1] });
    let OpOutcome::Exploded { objects, .. } = out else {
        panic!("{out:?}")
    };
    assert_eq!(objects.len(), 1);
    let l = cut(d.model());
    let loose = l
        .rows
        .iter()
        .find(|r| r.key == PartKey::Object(objects[0]))
        .unwrap();
    assert_eq!(loose.together, kept("pair", 1));
    let n = nest_model(&d);
    assert_eq!(block(&n, "pair").len(), 2);
}

/// A solid that already has its own keep together keeps it when the component around it is
/// exploded; the component's own is dropped, and a note says so (as it does for several
/// solids). One the same as the solid's loses nothing and says nothing.
#[test]
fn exploding_a_part_onto_a_solid_with_its_own_keep_together_says_what_is_dropped() {
    let mut d = Document::with_ground_sketch();
    let mut explode = |own: Option<Together>, outer: Option<Together>| {
        let o = board(&mut d, 0.0, 0.0, 0.0, 17.0, 0.75, 6.0);
        ok(
            &mut d,
            Op::SetTogether {
                part: PartRef::Object(o),
                together: own,
            },
        );
        let (inst, def) = component(&mut d, vec![Item::Object(o)], "Front");
        ok(
            &mut d,
            Op::SetTogether {
                part: PartRef::Definition(def),
                together: outer,
            },
        );
        let out = ok(&mut d, Op::Explode { node: inst });
        let OpOutcome::Exploded { objects, notes, .. } = out else {
            panic!("{out:?}")
        };
        assert_eq!(objects.len(), 1);
        let l = cut(d.model());
        let row = l
            .rows
            .iter()
            .find(|r| r.key == PartKey::Object(objects[0]))
            .unwrap();
        (row.together.clone(), notes)
    };
    let (kept_as, notes) = explode(kept("own", 2), kept("pair", 1));
    assert_eq!(kept_as, kept("own", 2));
    assert_eq!(notes.len(), 1, "{notes:?}");
    assert!(
        notes[0].contains("\"pair\" 1") && notes[0].contains("\"own\" 2"),
        "{notes:?}"
    );
    // The same keep together on both: nothing is lost, nothing is said.
    let (kept_as, notes) = explode(kept("same", 1), kept("same", 1));
    assert_eq!(kept_as, kept("same", 1));
    assert!(notes.is_empty(), "{notes:?}");
    // Only the component's: the solid takes it, as ever.
    let (kept_as, notes) = explode(None, kept("pair", 0));
    assert_eq!(kept_as, kept("pair", 0));
    assert!(notes.is_empty(), "{notes:?}");
}

// ---- property tests ------------------------------------------------------------------------

/// A random list: up to nine parts, some kept in one of two blocks (two holders), random
/// sizes, grain, indices (now and then a repeat) and ways of running.
fn a_list() -> impl Strategy<Value = CutList> {
    let part = (
        prop_oneof![3 => 2.0..30.0f64, 1 => 20.0..60.0f64],
        prop_oneof![3 => 2.0..30.0f64, 1 => 20.0..100.0f64],
        prop_oneof![Just(Grain::Length), Just(Grain::Width), Just(Grain::None)],
        prop_oneof![2 => Just(None), 3 => (0u8..2, 0u32..6, any::<bool>()).prop_map(Some)],
        1usize..3,
        any::<bool>(),
    );
    prop::collection::vec(part, 0..9).prop_map(|parts| {
        let rows: Vec<R> = parts
            .into_iter()
            .map(|(w, l, grain, kept, qty, oak)| {
                let mut p = r(w, l, grain).qty(qty, vec![Some(1), Some(2)]);
                if oak {
                    p = p.of("Oak");
                }
                if let Some((k, i, across)) = kept {
                    let stack = if across { Stack::Across } else { Stack::Along };
                    p = p.kept(["a", "b"][k as usize], i, stack);
                }
                p
            })
            .collect();
        list(&rows)
    })
}

fn any_settings() -> impl Strategy<Value = NestSettings> {
    (
        prop_oneof![Just(0.0), Just(0.25), 0.0..0.5f64],
        prop_oneof![Just(0.0), Just(0.5), 0.0..2.0f64],
        prop_oneof![
            Just(NestAlgorithm::Guillotine),
            Just(NestAlgorithm::Maxrects)
        ],
        any::<bool>(),
        any::<bool>(),
    )
        .prop_map(|(kerf, trim, alg, saw, footprint)| {
            let mut s = router(kerf, trim, alg, saw);
            if !footprint {
                s.sheet_size = None;
            }
            s
        })
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(
        std::env::var("PROPTEST_CASES").ok().and_then(|c| c.parse().ok()).unwrap_or(256)
    ))]

    /// Every block whole on one sheet, in order, a kerf apart, lined up, or every part of it
    /// reported (the checker's `check_blocks`); the other invariants as ever; deterministic;
    /// the other algorithm keeps them too, and places a block exactly when this one does.
    #[test]
    fn every_block_is_whole_or_reported(
        l in a_list(),
        st in any_settings(),
        grainless in any::<bool>(),
    ) {
        let mut lib = shop();
        lib.defaults.insert("Oak".into(), "4 x 8 sheet, 3/4".into());
        if grainless {
            for s in &mut lib.stocks {
                s.grain = StockGrain::None;
            }
        }
        let n = nest_list(&l, &lib, st);
        if let Err(e) = check_nesting_of(&l, &n) {
            return Err(TestCaseError::fail(e));
        }
        prop_assert_eq!(nest_list(&l, &lib, st).hash, n.hash.clone());
        let other = NestSettings {
            algorithm: match st.algorithm {
                NestAlgorithm::Guillotine => NestAlgorithm::Maxrects,
                NestAlgorithm::Maxrects => NestAlgorithm::Guillotine,
            },
            ..st
        };
        let m = nest_list(&l, &lib, other);
        if let Err(e) = check_nesting_of(&l, &m) {
            return Err(TestCaseError::fail(e));
        }
        prop_assert_eq!(m.totals.placed, n.totals.placed);
    }
}
