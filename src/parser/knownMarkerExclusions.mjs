// buildCorpus.mjsのinline-shared分岐（本文中に出現する丸数字を空欄マーカーとして検出する処理）
// 向けの、個別確認済みの除外定義。
//
// 対象は「本文中で丸数字が、空欄マーカーとしてではなく、箱囲みのない箇条書き見出しラベル
// （イ・ロと並ぶ項目番号、または節内の項目見出し番号）として再利用されている」ことを
// 原本PDF目視確認済みの4箇所・9マーカーのみ（docs/phase2c_pdf_visual_verification.md
// グループA参照）。
//
// 「丸数字の重複を一律に除外する」一般ロジックではない。locator＋marker文字＋本文中の
// 出現順序（occurrenceIndex）＋周辺文脈の完全一致を条件とする個別補正であり、
// 文脈が一致しない場合は補正を適用せず例外を投げて処理を停止する（fail-closed）。
// これにより、教材原文が変わった場合や、この一覧の想定と異なる状態になった場合に、
// 誤って見出し以外の本物の空欄を除外してしまうことを防ぐ。

export const GROUP_A_MARKER_EXCLUSIONS = [
  {
    locator: "pdf:page=98;block=5",
    exerciseHint: "ex-multiblank-qu-question-94",
    marker: "①",
    occurrenceIndex: 2,
    contextRadius: 15,
    expectedContext: "取引の同質性に基づく対応表示 ① 実質的対応関係（因果関係）に",
    pdfPage: 98,
    reason:
      "「①実質的対応関係（因果関係）に基づく対応表示」は、イ・ロと並ぶ箇条書き見出しラベルであり、" +
      "空欄マーカーではない（箱囲みなし。原本PDF p.98 目視確認済み）。",
  },
  {
    locator: "pdf:page=98;block=5",
    exerciseHint: "ex-multiblank-qu-question-94",
    marker: "②",
    occurrenceIndex: 2,
    contextRadius: 15,
    expectedContext: " に基 づく対応表示である。 ② 取引の同質性に基づく対応表示",
    pdfPage: 98,
    reason:
      "「②取引の同質性に基づく対応表示」は箇条書き見出しラベルであり、空欄マーカーではない" +
      "（箱囲みなし。原本PDF p.98 目視確認済み）。",
  },
  {
    locator: "pdf:page=130;block=2",
    exerciseHint: "ex-multiblank-qu-question-127",
    marker: "①",
    occurrenceIndex: 2,
    contextRadius: 15,
    expectedContext: " 「金融基準」が採用する方法 ① 「金融基準」が採用する方法\n",
    pdfPage: 130,
    reason:
      "「① 『金融基準』が採用する方法」は(3)の見出しをほぼそのまま繰り返した、項目1つのみの" +
      "箇条書き見出しラベルであり、空欄マーカーではない（箱囲みなし。原本PDF p.130 目視確認済み）。",
  },
  {
    locator: "pdf:page=160;block=3",
    exerciseHint: "ex-multiblank-qu-question-165",
    marker: "①",
    occurrenceIndex: 2,
    contextRadius: 15,
    expectedContext: " (2) 改正前基準の問題点 ① 会計上の情報開示の観点からは",
    pdfPage: 160,
    reason:
      "「① 会計上の情報開示の観点からは...」は(2)改正前基準の問題点の箇条書き見出しラベルであり、" +
      "空欄マーカーではない（箱囲みなし。原本PDF p.160 目視確認済み）。",
  },
  {
    locator: "pdf:page=160;block=3",
    exerciseHint: "ex-multiblank-qu-question-165",
    marker: "②",
    occurrenceIndex: 2,
    contextRadius: 15,
    expectedContext: "るため、 ⑤ すべきである。 ② 本来、代替的な処理が認められ",
    pdfPage: 160,
    reason:
      "「② 本来、代替的な処理が...」は箇条書き見出しラベルであり、空欄マーカーではない" +
      "（箱囲みなし。原本PDF p.160 目視確認済み）。",
  },
  {
    locator: "pdf:page=232;block=6",
    exerciseHint: "ex-multiblank-qu-question-247",
    marker: "①",
    occurrenceIndex: 2,
    contextRadius: 15,
    expectedContext: "る。 (2) 決算時の換算等 ① 外国通貨\n外国通貨については",
    pdfPage: 232,
    reason:
      "「①外国通貨」は(2)決算時の換算等の4項目見出し（外国通貨/外貨建金銭債権債務/" +
      "外貨建売買目的有価証券/外貨建満期保有目的の債券）の1つであり、空欄マーカーではない" +
      "（箱囲みなし。原本PDF p.232 目視確認済み）。",
  },
  {
    locator: "pdf:page=232;block=6",
    exerciseHint: "ex-multiblank-qu-question-247",
    marker: "②",
    occurrenceIndex: 2,
    contextRadius: 15,
    expectedContext: "期の ③ として処理す る。 ② 外貨建金銭債権債務 イ 換算",
    pdfPage: 232,
    reason: "「②外貨建金銭債権債務」は同上4項目見出しの1つであり、空欄マーカーではない（同上）。",
  },
  {
    locator: "pdf:page=232;block=6",
    exerciseHint: "ex-multiblank-qu-question-247",
    marker: "③",
    occurrenceIndex: 2,
    contextRadius: 15,
    expectedContext: "当期の\n⑤ として処理する。 ③ 外貨建売買目的有価証券\nイ ",
    pdfPage: 232,
    reason: "「③外貨建売買目的有価証券」は同上4項目見出しの1つであり、空欄マーカーではない（同上）。",
  },
  {
    locator: "pdf:page=232;block=6",
    exerciseHint: "ex-multiblank-qu-question-247",
    marker: "④",
    occurrenceIndex: 2,
    contextRadius: 15,
    expectedContext: "証券評価損益として処理する。 ④ 外貨建満期保有目的の債券 イ",
    pdfPage: 232,
    reason: "「④外貨建満期保有目的の債券」は同上4項目見出しの1つであり、空欄マーカーではない（同上）。",
  },
];

export function getGroupAExclusionsForLocator(locator) {
  return GROUP_A_MARKER_EXCLUSIONS.filter((e) => e.locator === locator);
}

// Group B（同一マーカー・同一正答が本文中で意図的に複数回参照される、正常な教材構成）の
// 既知の出典一覧。この一覧に含まれるlocatorでは、マーカー重複を異常として警告しない。
// docs/phase2c_pdf_visual_verification.md グループB（question-21,34,72,171,314）を根拠とする。
export const KNOWN_NORMAL_DUPLICATE_MARKER_LOCATORS = new Set([
  "pdf:page=28;block=2", // ex-multiblank-qu-question-21
  "pdf:page=42;block=7", // ex-multiblank-qu-question-34
  "pdf:page=78;block=6", // ex-multiblank-qu-question-72
  "pdf:page=166;block=5", // ex-multiblank-qu-question-171
  "pdf:page=286;block=7", // ex-multiblank-qu-question-314
]);
