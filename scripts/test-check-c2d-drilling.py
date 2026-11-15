import importlib.util
import json
import sqlite3
import tempfile
import unittest
import zlib
from pathlib import Path

spec = importlib.util.spec_from_file_location("drill_check", Path(__file__).with_name("check-c2d-drilling.py"))
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class DrillInspection(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "test.c2d"
        self.db = sqlite3.connect(self.path)
        self.addCleanup(self.db.close)
        self.db.execute("CREATE TABLE params (key TEXT, value TEXT)")
        self.db.execute("CREATE TABLE items (id INTEGER, type TEXT, sz INTEGER, data BLOB)")
        self.db.execute("INSERT INTO params VALUES ('thickness', '19.05')")
        self.op = {"type": "drilling_toolpath", "name": "Drill", "tool": {"diameter": 6.35}, "start_depth": "0", "end_depth": "13", "elements": [], "toolpath_layers": ["A"]}

    def item(self, ident, kind, obj):
        data = json.dumps(obj).encode()
        self.db.execute("INSERT INTO items VALUES (?, ?, ?, ?)", (ident, kind, len(data), zlib.compress(data)))

    def run_check(self, layer="DRILL_D4.76MM_THRU", op=None):
        self.item(1, "layer", {"uuid": "A", "name": layer})
        self.item(2, "toolpath", self.op if op is None else op)
        self.db.commit()
        return check.inspect(self.path)

    def test_supplied_example_reports_both_mismatches(self):
        findings = self.run_check()
        self.assertEqual(len(findings), 2)
        self.assertIn("4.76 mm holes", findings[0])
        self.assertIn("6.35 mm", findings[0])
        self.assertIn("13 mm", findings[1])
        self.assertIn("19.05 mm", findings[1])

    def test_rounded_layer_diameter_and_through_depth(self):
        op = {**self.op, "tool": {"diameter": 4.7625}, "end_depth": "19.05"}
        self.assertEqual(self.run_check(op=op), [])

    def test_blind_hole_depth_mismatch(self):
        op = {**self.op, "tool": {"diameter": 5}, "end_depth": "11"}
        self.assertIn("depth 13 mm", self.run_check("DRILL_D5MM_13MM", op)[0])

    def test_refuses_unknown_layer(self):
        with self.assertRaisesRegex(ValueError, "unsupported drill layer"):
            self.run_check("DEFAULT")

    def test_refuses_direct_selection(self):
        with self.assertRaisesRegex(ValueError, "direct element selection"):
            self.run_check(op={**self.op, "elements": ["A"]})

    def test_refuses_missing_or_invalid_settings(self):
        with self.assertRaisesRegex(ValueError, "cutter diameter"):
            self.run_check(op={**self.op, "tool": {"diameter": 0}})


if __name__ == "__main__":
    unittest.main()
