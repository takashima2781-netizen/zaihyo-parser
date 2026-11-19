// 問い方の候補（formCandidates）。指示文の言い回しを根拠（evidence）に付けた候補であり、決定ではない。
// どれにも当てはまらなければ空の配列（＝unknown）。新しい問い方はここに足す。

const RULES = [
  { form: "choose_from_word_bank", re: /語群.{0,12}選び/ },
  { form: "choose_options", re: /([１-９1-9一二三四五])つ選び/, count: (m) => toNumber(m[1]) },
  { form: "order", re: /並[び べ]替え|並び替え|並べ替え|順序に並/ },
  { form: "calculate", re: /計算しなさい|計算して/ },
  { form: "write_text", re: /定義を答え|説明しなさい|述べなさい|理由を答え/ },
  { form: "write_terms", re: /語句を答え|語句を記入|名称を答え|カタカナで答え|用語を答え|記入しなさい|答えなさい/ },
];

function toNumber(c) {
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 };
  if (map[c]) return map[c];
  return Number(c.replace(/[１-９]/, (x) => String.fromCharCode(x.charCodeAt(0) - 0xfee0)));
}

/**
 * @param {string} instruction 指示文（行をつないだもの）
 * @returns {Array<{form:string, evidence:string, count?:number}>}
 */
export function formCandidates(instruction) {
  const t = instruction.replace(/[\s　]+/g, "");
  const out = [];
  for (const rule of RULES) {
    const m = t.match(rule.re);
    if (!m) continue;
    // 「答えなさい」だけの一般的な言い回しは、ほかの候補が無いときだけ write_terms の根拠にする
    if (rule.form === "write_terms" && m[0] === "答えなさい" && out.length > 0) continue;
    const c = { form: rule.form, evidence: m[0] };
    if (rule.count) c.count = rule.count(m);
    out.push(c);
  }
  // 「語群から選び」と「１つ選び」が両方あるときは語群の方だけ（語群の記号を選ぶ問題）
  if (out.some((c) => c.form === "choose_from_word_bank")) return out.filter((c) => c.form !== "choose_options" && c.form !== "write_terms");
  return out;
}
