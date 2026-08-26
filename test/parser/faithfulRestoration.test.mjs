import { test } from "node:test";
import assert from "node:assert/strict";

import { applyKnownCorrection } from "../../src/parser/faithfulRestoration.mjs";

// 架空の補正データを使う(教材原文は使わない)。

test("applyKnownCorrection: 期待される断片がすべて揃っていれば補正を適用する", () => {
  const correction = {
    blockId: "block-fake",
    artifactKind: "fraction_split",
    expectedFragments: ["架空項Ａ", "架空額", "架空全体単位"],
    correctedText: "（架空項Ａ－架空項Ｂ）×（１架空単位／架空全体単位）＝架空額",
  };
  const rawText = "１架空単位\n（架空項Ａ－架空項Ｂ）×      ＝架空額\n架空全体単位";

  const result = applyKnownCorrection(rawText, correction);
  assert.equal(result.sourceFaithful, correction.correctedText);
  assert.equal(result.artifact.kind, "fraction_split");
  assert.equal(result.artifact.resolved, true);
});

test("applyKnownCorrection: 期待される断片が欠けていればfail-closedで例外を投げる(推測で補正しない)", () => {
  const correction = {
    blockId: "block-fake",
    artifactKind: "fraction_split",
    expectedFragments: ["架空項Ａ", "想定外の断片"],
    correctedText: "（架空項Ａ－架空項Ｂ）×（１架空単位／架空全体単位）＝架空額",
  };
  const rawText = "１架空単位\n（架空項Ａ－架空項Ｂ）×      ＝架空額\n架空全体単位";

  assert.throws(() => applyKnownCorrection(rawText, correction), /fail-closed/);
});
