// テキスト正規化・脚注抽出などの小さな共通ユーティリティ。
// Parser固有のドメイン知識は持たず、文字列処理のみを責務とする。

// 全角英数記号（！-～、U+FF01-FF5E）を半角へ変換する。
// テーマ番号・重要度(A/B/C)・問題番号など、PDF側は全角で印字されるがCSV側は半角で
// 保存されている項目をExporterで揃えるために使う。
export function toHalfWidthAscii(s) {
  return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

export function toHalfWidthDigits(s) {
  return toHalfWidthAscii(s);
}

// 回答テキストの先頭が正誤記号（○/〇/×）かどうかを判定する。
// 「○」(U+25CB 白丸)と「〇」(U+3007 漢数字ゼロ)は教材内で混在使用されているため、
// 判定処理の中でのみ同一視する（rawの文字自体は書き換えない）。
// docs/parser_grammar.md 4.2節で複数箇所の混在使用を確認済み。
export function detectTrueFalseSymbol(text) {
  const m = text.trim().match(/^([○〇×])/);
  return m ? m[1] : null;
}

export function extractFootnoteRefs(text) {
  const refs = new Set();
  const re = /\[(\d+(?:,\s*\d+)*)\]/g;
  let m;
  while ((m = re.exec(text))) {
    m[1].split(",").forEach((n) => refs.add(Number(n.trim())));
  }
  return [...refs].sort((a, b) => a - b);
}

export function makeIdFactory() {
  const counters = {};
  return function nextId(prefix) {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}-${String(counters[prefix]).padStart(2, "0")}`;
  };
}
