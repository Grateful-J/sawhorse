import importlib.util
import json
import sqlite3
import tempfile
import unittest
import zlib
from pathlib import Path

spec = importlib.util.spec_from_file_location("pocket_check", Path(__file__).with_name("check-c2d-pocket-width.py"))
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class PocketInspection(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "example.c2d"
        self.db = sqlite3.connect(self.path)
        self.db.execute("CREATE TABLE items (id INTEGER, type TEXT, sz INTEGER, data BLOB)")
        self.item(1, "layer", {"uuid": "layer-1", "name": "POCKET_7.94MM"})
        self.op = {"name": "Pocket", "type": "pocket_toolpath", "tool": {"diameter": 6.35}, "toolpath_layers": ["layer-1"], "elements": []}

    def item(self, ident, kind, obj):
        raw = json.dumps(obj).encode()
        self.db.execute("INSERT INTO items VALUES (?, ?, ?, ?)", (ident, kind, len(raw), zlib.compress(raw)))

    def shape(self, width, height, **extra):
        return {"geometryType": "path", "layer": {"uuid": "layer-1", "name": "POCKET_7.94MM"}, "points": [[0, 0], [width, 0], [width, height], [0, height]], **extra}

    def inspect(self):
        self.db.commit()
        return check.inspect(self.path)

    def test_narrow_pocket_both_orientations(self):
        self.item(2, "element", self.shape(100, 5.7595))
        self.item(3, "element", self.shape(5.7595, 100))
        self.item(4, "toolpath", self.op)
        findings = self.inspect()
        self.assertEqual([f["item"] for f in findings], [2, 3])
        self.assertAlmostEqual(findings[0]["span_mm"], 5.7595)

    def test_larger_box_is_not_claimed_safe(self):
        self.item(2, "element", self.shape(10, 20))
        self.item(3, "toolpath", self.op)
        self.assertEqual(self.inspect(), [])

    def test_curve_controls_are_included_in_bounds(self):
        self.item(2, "element", self.shape(4, 20, cp1=[[8, 5]]))
        self.item(3, "toolpath", self.op)
        self.assertEqual(self.inspect(), [])

    def test_disabled_operation_is_ignored(self):
        self.item(2, "element", self.shape(4, 20))
        self.item(3, "toolpath", {**self.op, "enabled": False})
        with self.assertRaisesRegex(ValueError, "no enabled pocket toolpaths"):
            self.inspect()

    def test_unknown_layer_and_direct_selection_are_refused(self):
        self.item(2, "element", self.shape(4, 20))
        self.item(3, "toolpath", {**self.op, "toolpath_layers": ["missing"]})
        with self.assertRaisesRegex(ValueError, "unknown layer"):
            self.inspect()
        self.db.execute("DELETE FROM items WHERE id=3")
        self.item(3, "toolpath", {**self.op, "elements": ["unsupported"]})
        with self.assertRaisesRegex(ValueError, "direct element selection"):
            self.inspect()

    def test_invalid_diameter_and_compressed_data_are_refused(self):
        self.item(2, "element", self.shape(4, 20))
        self.item(3, "toolpath", {**self.op, "tool": {"diameter": 0}})
        with self.assertRaisesRegex(ValueError, "diameter"):
            self.inspect()
        self.db.execute("UPDATE items SET data=? WHERE id=2", (b"bad",))
        with self.assertRaises(zlib.error):
            self.inspect()


if __name__ == "__main__":
    unittest.main()
