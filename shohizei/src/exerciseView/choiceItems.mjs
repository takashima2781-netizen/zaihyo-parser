// 取引ごとに選択肢から1つ選ぶ問題（exerciseType: choice_item）。
//
// - 振り分け（classify_items）: 「課税となるものに○、非課税となるものに△、…」。解答は記号ごとの番号の並び
//   （「○ ………… (2)、(3)」「課 ………… (2)、(3)」、番号は次の行へ続くことがある）。
// - 選ぶ（select_applicable）: 「…となる取引を選びなさい」。解答は選ぶ番号の並び（「(1)、(5)、(7)」）。
//   選択肢は「該当する」「該当しない」。並びに無い番号は「該当しない」。
// 同じ番号が2つの記号に出る、または問題文の取引が解答のどこにも無い（振り分けの場合）ときは、その取引は作らない。

const toHalf = (t) => t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
const NUMS = /[（(]\s*([0-9０-９]+)\s*[）)]/g;

function numbersIn(text) {
  return [...text.matchAll(NUMS)].map((m) => Number(toHalf(m[1])));
}

/** 指示文から記号と意味の対応を読む（「課税となるものに○」「非課税取引となるものには「非」を」）。 */
export function categoryLegend(instruction) {
  const legend = new Map();
  const text = instruction.replace(/\s+/g, "");
  const re = /([^、。，]*?)(?:取引)?となるもの(?:には|に)「?([○〇△×]|[^」「、。]{1,2})」?を?/g;
  for (const m of text.matchAll(re)) {
    const symbol = m[2] === "〇" ? "○" : m[2];
    const meaning = m[1].replace(/^(次の取引のうち|うち|、)/, "").replace(/^.*のうち/, "");
    if (!legend.has(symbol) && meaning) legend.set(symbol, meaning);
  }
  return legend;
}

/** 振り分けの解答: 記号 → 番号。 */
export function parseGroupedAnswer(lines) {
  const bySymbol = new Map();
  const conflicts = new Set();
  const seen = new Map();
  const legend = new Map(); // 解答に書かれた記号の意味（「○〔標準税率〕」）
  let symbol = null;
  for (const l of lines) {
    const t = l.text.trim();
    // 「○ ………… (1)、…」または「○〔標準税率〕 (1)、…」
    const head =
      t.match(/^([○〇△×]|[^\s…‥・.()（）〔〕0-9０-９]{1,2})\s*[…‥・.]{2,}\s*(.*)$/) ||
      t.match(/^([○〇△×])\s*〔([^〕]+)〕\s*(.*)$/) ||
      t.match(/^([○〇△×])\s+(?=[（(][0-9０-９])(.*)$/); // 「○   (1)、(3)…」（点線なし）
    let listText;
    if (head) {
      symbol = head[1] === "〇" ? "○" : head[1];
      if (head.length === 4) {
        legend.set(symbol, head[2]);
        listText = head[3];
      } else listText = head[2];
    } else if (symbol && /^[（(][0-9０-９]+[）)]/.test(t)) listText = t;
    else {
      symbol = null;
      continue;
    }
    for (const no of numbersIn(listText)) {
      if (seen.has(no) && seen.get(no) !== symbol) conflicts.add(no);
      seen.set(no, symbol);
      if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
      bySymbol.get(symbol).push(no);
    }
  }
  return { answerOf: seen, conflicts, symbols: [...bySymbol.keys()], legend };
}

/**
 * 取引ごとに文で答える解答（「(１) 第一種事業    (８) 第三種事業」のように1行に複数並ぶ）。
 * 答えが金額でない短い文のときだけ読む。戻り値: 番号 → 答えの文
 */
export function parseInlineValueAnswers(lines) {
  const out = new Map();
  for (const l of lines) {
    const t = l.text.trim();
    for (const m of t.matchAll(/[（(]\s*([0-9０-９]+)\s*[）)]\s*([^\s（(]+(?:\s[^\s（(]+)?)/g)) {
      const value = m[2].trim();
      if (/^[0-9０-９,，.．△－-]+$/.test(value) || value.length > 12) continue;
      out.set(Number(toHalf(m[1])), value);
    }
  }
  return out;
}

/** 選ぶ問題の解答: 選ぶ番号（解答の先頭から、番号だけが並ぶ行が続く間）。 */
export function parseSelectedAnswer(lines) {
  const selected = new Set();
  for (const l of lines) {
    const t = l.text.trim();
    if (!/^[（(][0-9０-９]+[）)]/.test(t)) break;
    if (t.replace(NUMS, "").replace(/[、,，\s]/g, "") !== "") break; // 番号以外の文が混じる行は答えの並びではない
    for (const no of numbersIn(t)) selected.add(no);
  }
  return selected;
}
