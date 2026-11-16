import { test } from "node:test";
import assert from "node:assert/strict";

import { restoreFractionByPosition } from "../../src/parser/faithfulRestoration.mjs";

// 架空の座標データ(教材原文は使わない)。実データで確認した2つの配置
// パターン(`case2_readiness_and_generalization_analysis.md`7-1節)を、
// それぞれ架空の数値で再現する。

test("restoreFractionByPosition: 数式全体が1ブロック、分子/分母が別ブロックの場合", () => {
  // 実データのページ158相当: 分子が直前ブロック、分母が直後ブロックに
  // それぞれ単独で存在する配置。
  const blocks = [
    { x0: 0, y0: 100, x1: 50, y1: 108, text: "架空の説明文\n" },
    { x0: 0, y0: 120, x1: 50, y1: 128, text: "３年 \n" },
    { x0: 0, y0: 130, x1: 50, y1: 138, text: "※ 93,000×      ＝12,000 \n" },
    { x0: 0, y0: 140, x1: 50, y1: 148, text: "７年 \n" },
    { x0: 0, y0: 160, x1: 50, y1: 168, text: "架空の次の説明文\n" },
  ];
  const result = restoreFractionByPosition(blocks, "93,000×", "＝12,000");
  assert.deepEqual(result, { numerator: "３年", denominator: "７年" });
});

test("restoreFractionByPosition: 数式が2ブロックに分裂し、分母が＝側ブロックに同居する場合", () => {
  // 実データのページ193相当: 「×」側と「＝」側が別ブロックに分かれ、
  // 分母が「＝」側ブロックの後続行として同居する配置。
  const blocks = [
    { x0: 0, y0: 100, x1: 50, y1: 108, text: "架空の説明文\n" },
    { x0: 0, y0: 120, x1: 50, y1: 128, text: "３年 \n" },
    { x0: 30, y0: 130, x1: 60, y1: 138, text: "※ 45,000× \n" },
    { x0: 0, y0: 130, x1: 30, y1: 150, text: "＝6,000 \n \n７年 \n   \n" },
    { x0: 0, y0: 160, x1: 50, y1: 168, text: "架空の次の説明文\n" },
  ];
  const result = restoreFractionByPosition(blocks, "45,000×", "＝6,000");
  assert.deepEqual(result, { numerator: "３年", denominator: "７年" });
});

test("restoreFractionByPosition: 同じ計算式が同一ページに複数回出現する場合、occurrenceIndexで区別する", () => {
  // 実データのページ193相当: 同じ式が決算時・廃棄時の2回、離れたY座標に出現する。
  const blocks = [
    { x0: 0, y0: 120, x1: 50, y1: 128, text: "３年 \n" },
    { x0: 30, y0: 130, x1: 60, y1: 138, text: "※ 45,000× \n" },
    { x0: 0, y0: 130, x1: 30, y1: 150, text: "＝6,000 \n \n７年 \n   \n" },
    { x0: 0, y0: 220, x1: 50, y1: 228, text: "３年 \n" },
    { x0: 30, y0: 230, x1: 60, y1: 238, text: "※ 45,000× \n" },
    { x0: 0, y0: 230, x1: 30, y1: 250, text: "＝6,000 \n \n９年 \n   \n" },
  ];
  const first = restoreFractionByPosition(blocks, "45,000×", "＝6,000", 0);
  const second = restoreFractionByPosition(blocks, "45,000×", "＝6,000", 1);
  assert.deepEqual(first, { numerator: "３年", denominator: "７年" });
  assert.deepEqual(second, { numerator: "３年", denominator: "９年" });
});

test("restoreFractionByPosition: 対応するブロックが見つからなければfail-closedで例外を投げる", () => {
  const blocks = [{ x0: 0, y0: 100, x1: 50, y1: 108, text: "架空の無関係な文\n" }];
  assert.throws(
    () => restoreFractionByPosition(blocks, "93,000×", "＝12,000"),
    /見つからない/,
  );
});

test("restoreFractionByPosition: 分子・分母の候補が座標的に見つからなければfail-closedで例外を投げる(推測しない)", () => {
  const blocks = [
    { x0: 0, y0: 130, x1: 50, y1: 138, text: "※ 93,000×      ＝12,000 \n" },
    // 分子・分母に該当するような断片がどこにも無い
    { x0: 0, y0: 200, x1: 50, y1: 208, text: "架空の遠く離れた説明文\n" },
  ];
  assert.throws(
    () => restoreFractionByPosition(blocks, "93,000×", "＝12,000"),
    /対応付けに失敗/,
  );
});
