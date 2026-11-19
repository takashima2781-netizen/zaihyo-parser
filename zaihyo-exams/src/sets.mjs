// 取り込む答練の一覧（回の名前・教材・理論の大問）。教材の原文は含まない。
//
// input/pdf/<id>-problem.pdf（A問題）・<id>-sheet.pdf（B答案用紙）・<id>-answer.pdf（C解答）を読む。
// daimonNos: 理論の大問。本試験形式は〔第一問〕〔第二問〕が理論、〔第三問〕が計算。
// 計算の大問は今は読まない（見出しだけ記録して outOfScope にする）。

export const SETS = {
  "jitsuryoku-1": { title: "実力完成答練 第1回", book: { id: "chokuzen-jitsuryoku", title: "直前対策 実力完成答練" }, daimonNos: [1, 2] },
};

export function getSet(id) {
  const s = SETS[id];
  if (!s) return null;
  return { id, ...s };
}
