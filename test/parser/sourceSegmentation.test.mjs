import { test } from "node:test";
import assert from "node:assert/strict";

import { applyF3 } from "../../src/parser/sourceSegmentation.mjs";

test("applyF3: トップレベル候補は確定Sourceとする", () => {
  const result = applyF3({ nestedUnder: null });
  assert.equal(result.confirmed, true);
  assert.equal(result.rule, "F3");
});

test("applyF3: ネストした候補はこのM1実装では確定しない", () => {
  const result = applyF3({ nestedUnder: "block-parent-worked-example" });
  assert.equal(result.confirmed, false);
});
