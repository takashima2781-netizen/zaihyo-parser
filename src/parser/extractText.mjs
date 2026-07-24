// Step 0: ドキュメント取り込み。
// pdftotextを（-layoutなし・-enc UTF-8で）呼び出し、ページごとのテキストへ分割する。
// このモジュールの責務はテキスト抽出のみ。構造解釈は一切行わない。

import { execFileSync } from "node:child_process";

export function extractPages(pdfPath, firstPage, lastPage) {
  const buf = execFileSync("pdftotext", [
    "-f", String(firstPage),
    "-l", String(lastPage),
    "-enc", "UTF-8",
    pdfPath,
    "-",
  ]);
  const text = buf.toString("utf8");
  const pages = text.split("\f");
  return pages
    .map((t, i) => ({ page: firstPage + i, text: t }))
    .filter((p) => p.page <= lastPage);
}
