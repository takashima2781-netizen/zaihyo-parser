// 問い方の候補（formCandidates）。指示文の言い回しを根拠（evidence）に付けた候補であり、決定ではない。
// どれにも当てはまらなければ空の配列（＝unknown）。新しい問い方はここに足す。

const RULES = [
  { form: "choose_from_word_bank", re: /語群.{0,12}選|空欄.{0,40}(?:選び|選択し)/ },
  // 選ぶ数: 「２つ選び」「３つ選択し」→ その数、「すべて選び」→ "all"、数の無い「選び」「選択し」→ 1
  { form: "choose_options", re: /([１-９1-9一二三四五])つ(?:を)?(?:選び|選択)/, count: (m) => toNumber(m[1]) },
  { form: "choose_options", re: /すべて(?:を)?(?:選び|選択)/, count: () => "all" },
  { form: "choose_options", re: /選び|選択し/, count: () => 1 },
  { form: "order", re: /並[び べ]替え|並び替え|並べ替え|順序に並/ },
  { form: "calculate", re: /計算しなさい|計算して|金額を求め|金額を答案用紙に示/ },
  // 「方法（名称）を指摘しなさい」は名称を書く問い（write_terms）なので、ここでは「指摘」から除く
  { form: "write_text", re: /定義を答え|説明しなさい|述べなさい|理由を答え|明らかにしなさい|(?<!名称[)）]?を)指摘しなさい/ },
  { form: "write_terms", re: /語句を答え|語句を記入|名称を答え|カタカナで答え|用語を答え|名称[)）]?を指摘|記入しなさい|示しなさい|挙げなさい|答えなさい/ },
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
    if (out.some((c) => c.form === rule.form)) continue; // 同じ問い方は最初に当たった言い回しだけ
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
