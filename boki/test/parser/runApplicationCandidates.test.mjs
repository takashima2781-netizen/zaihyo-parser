import { test } from "node:test";
import assert from "node:assert/strict";

import { splitFormulaGap } from "../../src/parser/runApplicationCandidates.mjs";

// 架空データ(教材原文は使わない)。

test("splitFormulaGap: 数式行を×側と＝側に分割する", () => {
  const result = splitFormulaGap("※  93,000×        ＝12,000");
  assert.deepEqual(result, { beforeGap: "93,000×", afterGap: "＝12,000" });
});

test("splitFormulaGap: 想定外の形状はfail-closedで例外を投げる", () => {
  assert.throws(() => splitFormulaGap("架空の無関係な行"), /一致しない/);
});
