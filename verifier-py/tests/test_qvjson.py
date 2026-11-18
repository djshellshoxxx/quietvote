import unittest

from qv_verifier import qvjson
from qv_verifier.errors import QVError


class TestQVJson(unittest.TestCase):
    def canon(self, text):
        return qvjson.canonical_text(qvjson.parse(text))

    def test_canonical_forms(self):
        self.assertEqual(self.canon('{"b":1,"a":[true,false,-3]}'), '{"a":[true,false,-3],"b":1}')
        # UTF-16 code-unit order: U+1F600 (surrogates D83D..) sorts before U+FF5E
        self.assertEqual(self.canon('{"\\uff5e":1,"\\ud83d\\ude00":2}'), '{"\U0001F600":2,"～":1}')
        self.assertEqual(self.canon('"\\u0001\\n\\t\\"\\\\\\/\\u007f"'), '"\\u0001\\n\\t\\"\\\\/\x7f"')
        self.assertEqual(self.canon(" [ 1 ,\n2 ] "), "[1,2]")
        self.assertEqual(self.canon("9007199254740991"), "9007199254740991")

    def test_rejections(self):
        for bad in ('{"a":1,"a":2}', '{"x":{"a":1,"a":1}}', "1.0", "1e2", "null", '{"a":null}',
                    "-0", "9007199254740992", '"\\ud800"', '"é"', "01", "[1] 2", '"\t"',
                    "NaN", "Infinity", "﻿1"):
            with self.subTest(bad=bad):
                with self.assertRaises(QVError) as cm:
                    qvjson.parse(bad)
                self.assertEqual(cm.exception.code, "E_PARSE")
        with self.assertRaises(QVError):
            qvjson.parse(b"\xef\xbb\xbf1")
        with self.assertRaises(QVError):
            qvjson.parse(b'"\xff"')

    def test_jcs_bytes(self):
        self.assertEqual(qvjson.jcs({"s": "é€"}), '{"s":"é€"}'.encode("utf-8"))


if __name__ == "__main__":
    unittest.main()
