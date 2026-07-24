// 空欄・小問マーカーの検出戦略。
//
// 今回観測できた実データには2種類のマーカー様式があった。
//   - circled: ①②③ … 1つの共有本文の中に複数の空欄が埋め込まれる（inline-shared）
//   - paren:  (1)(2) … 1つの見出し文の中に複数の枝が列挙される（segmented）
//
// 「どちらの様式か」はcheckType（基礎知識チェック/理解度チェック等）ではなく、
// 本文中に実際に現れたマーカー記号の種類だけから判定する。
// これにより「問1だから／問2だから」という個別問題へのハードコードを避けている。
//
// この2様式は今回の1見開きだけから得られた暫定的な分類であり、
// PDF全体を対象にした際には未知のマーカー様式（数字のみ、ローマ数字等）が
// 出現する可能性がある。その場合はここに戦略を追加する形で拡張する。

export const MARKER_STRATEGIES = [
  {
    id: "circled",
    mode: "inline-shared", // 本文全体を全Itemが共有し、マーカーは本文中の位置を指すだけ
    presentation: "fillBlank",
    detectRegex: /[①-⑳]/g,
    pairRegex: /([①-⑳])\s*([^①-⑳※]+)/g,
    subLabelOf: (m) => m,
  },
  {
    id: "paren",
    mode: "segmented", // 本文がマーカーごとに異なる部分文字列へ分割される
    presentation: "freeText",
    detectRegex: /\((\d+)\)/g,
    pairRegex: /\((\d+)\)\s*([^()]+?)(?=\(\d+\)|$)/g,
    subLabelOf: (n) => `(${n})`,
  },
];

export function detectStrategy(text) {
  for (const strategy of MARKER_STRATEGIES) {
    strategy.detectRegex.lastIndex = 0;
    const matched = strategy.detectRegex.test(text);
    strategy.detectRegex.lastIndex = 0; // g付き共有regexのlastIndexを呼び出し側に漏らさない
    if (matched) return strategy;
  }
  return null;
}
