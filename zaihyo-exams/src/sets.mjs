// 取り込む答練の一覧（回の名前・教材・理論の大問）。教材の原文は含まない。
//
// input/pdf/<id>-problem.pdf（A問題）・<id>-sheet.pdf（B答案用紙）・<id>-answer.pdf（C解答）を読む。
// daimonNos: 理論の大問。本試験形式は〔第一問〕〔第二問〕が理論、〔第三問〕が計算。
// 計算の大問は今は読まない（見出しだけ記録して outOfScope にする）。

export const SETS = {
  "jitsuryoku-1": { title: "実力完成答練 第1回", book: { id: "chokuzen-jitsuryoku", title: "直前対策 実力完成答練" }, daimonNos: [1, 2] },
  "jitsuryoku-2": { title: "実力完成答練 第2回", book: { id: "chokuzen-jitsuryoku", title: "直前対策 実力完成答練" }, daimonNos: [1, 2] },
  "jitsuryoku-3": { title: "実力完成答練 第3回", book: { id: "chokuzen-jitsuryoku", title: "直前対策 実力完成答練" }, daimonNos: [1, 2] },
  "jitsuryoku-4": { title: "実力完成答練 第4回", book: { id: "chokuzen-jitsuryoku", title: "直前対策 実力完成答練" }, daimonNos: [1, 2] },
  "jitsuryoku-5": { title: "実力完成答練 第5回", book: { id: "chokuzen-jitsuryoku", title: "直前対策 実力完成答練" }, daimonNos: [1, 2] },
  "jitsuryoku-6": { title: "実力完成答練 第6回", book: { id: "chokuzen-jitsuryoku", title: "直前対策 実力完成答練" }, daimonNos: [1, 2] },
  "yosou-1": { title: "直前予想答練 第1回", book: { id: "chokuzen-yosou", title: "直前対策 直前予想答練" }, daimonNos: [1, 2] },
  "yosou-2": { title: "直前予想答練 第2回", book: { id: "chokuzen-yosou", title: "直前対策 直前予想答練" }, daimonNos: [1, 2] },
  "yosou-3": { title: "直前予想答練 第3回", book: { id: "chokuzen-yosou", title: "直前対策 直前予想答練" }, daimonNos: [1, 2] },
  "koukai-moshi": { title: "公開模試", book: { id: "chokuzen-moshi", title: "直前対策 公開模試" }, daimonNos: [1, 2] },
  "jokyu-1": { title: "上級演習 第1回", book: { id: "jokyu-enshu", title: "上級 演習" }, daimonNos: [1, 2] },
  "jokyu-2": { title: "上級演習 第2回", book: { id: "jokyu-enshu", title: "上級 演習" }, daimonNos: [1, 2] },
  "jokyu-3": { title: "上級演習 第3回", book: { id: "jokyu-enshu", title: "上級 演習" }, daimonNos: [1, 2] },
  "jokyu-4": { title: "上級演習 第4回", book: { id: "jokyu-enshu", title: "上級 演習" }, daimonNos: [1, 2] },
  "jokyu-5": { title: "上級演習 第5回", book: { id: "jokyu-enshu", title: "上級 演習" }, daimonNos: [1, 2] },
  "jokyu-6": { title: "上級演習 第6回", book: { id: "jokyu-enshu", title: "上級 演習" }, daimonNos: [1, 2] },
  "jokyu-7": { title: "上級演習 第7回", book: { id: "jokyu-enshu", title: "上級 演習" }, daimonNos: [1, 2] },
  "jokyu-8": { title: "上級演習 第8回", book: { id: "jokyu-enshu", title: "上級 演習" }, daimonNos: [1, 2] },
  "jokyu-9": { title: "上級演習 第9回", book: { id: "jokyu-enshu", title: "上級 演習" }, daimonNos: [1, 2] },
  "jokyu-10": { title: "上級演習 第10回", book: { id: "jokyu-enshu", title: "上級 演習" }, daimonNos: [1, 2] },
  "kiso-2-test": { title: "基礎マスター No.2 実力テスト", book: { id: "kiso-test", title: "基礎マスター 実力テスト" }, daimonNos: [1, 2] },
  "kiso-3-test": { title: "基礎マスター No.3 実力テスト", book: { id: "kiso-test", title: "基礎マスター 実力テスト" }, daimonNos: [1, 2] },
  "kiso-4-test": { title: "基礎マスター No.4 実力テスト", book: { id: "kiso-test", title: "基礎マスター 実力テスト" }, daimonNos: [1, 2] },
};

export function getSet(id) {
  const s = SETS[id];
  if (!s) return null;
  return { id, ...s };
}
