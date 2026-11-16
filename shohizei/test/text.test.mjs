// テキスト（読む用）の図の見分け方のテスト。作り物のデータだけを使う。

import { test } from "node:test";
import assert from "node:assert/strict";
import { findFigures, drawingClusters } from "../src/text/figures.mjs";

const page = (drawings) => ({ width: 500, height: 700, drawings: drawings.map((rect) => ({ rect })) });
const line = (text, x, y) => ({ text, bbox: [x, y, x + 40, y + 9] });

test("近い線はひとつのかたまりにまとめる", () => {
  const c = drawingClusters(page([[100, 100, 200, 101], [100, 104, 200, 105], [400, 400, 450, 401]]).drawings, page([]));
  assert.equal(c.length, 2);
});

test("書き出し位置が3列以上に分かれた行を囲むかたまりは図、そろった文章の枠は図にしない", () => {
  const box = [[50, 100, 450, 101], [50, 200, 450, 201], [50, 100, 51, 201], [449, 100, 450, 201]];
  const table = [line("項目", 60, 120), line("金額", 200, 120), line("税額", 340, 120), line("A", 60, 150), line("100", 200, 150)];
  assert.equal(findFigures(page(box), table).length, 1);
  const prose = [line("文章の1行目", 60, 120), line("文章の2行目", 60, 140), line("文章の3行目", 60, 160)];
  assert.equal(findFigures(page(box), prose).length, 0);
});
