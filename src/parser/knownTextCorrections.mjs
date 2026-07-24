// Step 0（pdftotext抽出直後、blockize前）に適用する、個別確認済みのテキストノイズ補正。
//
// 対象は「原本PDFには存在せず、pdftotextによるテキスト抽出結果にのみ混入したノイズ」
// であることを、原本PDF目視確認（docs/phase2c_pdf_visual_verification.md）と
// pdftotext単体再現実験（docs/phase2c_root_cause_investigation.md §3.2）の両方で
// 確認済みの4箇所・14文字列のみを対象とする。
//
// 数字や記号を一般的に除去する正規表現は使わない。ページ番号＋完全一致する原文断片
// （find）のみを対象とし、期待した出現回数（1回）と一致しない場合は補正を適用せず
// 例外を投げて処理を停止する（fail-closed）。原本の再抽出結果がこの一覧の想定と
// 乖離した場合、誤った補正を無言で適用するより、処理を止めて人手確認に回すことを優先する。

export const KNOWN_TEXT_NOISE_CORRECTIONS = [
  {
    page: 260,
    exerciseHint: "ex-multiblank-qu-question-281",
    find: "123①123",
    replace: "①",
    reason:
      "pdftotext抽出結果にのみ混入した数字ノイズ「123」。原本PDF(p.260)の該当箇所を目視確認したが数字は存在しない。",
  },
  {
    page: 260,
    exerciseHint: "ex-multiblank-qu-question-281",
    find: "123②123",
    replace: "②",
    reason: "同上（question-281、②側）。",
  },
  {
    page: 260,
    exerciseHint: "ex-multiblank-qu-question-281",
    find: "123③123",
    replace: "③",
    reason: "同上（question-281、③側）。",
  },
  {
    page: 268,
    exerciseHint: "ex-multiblank-qu-question-294",
    find: "○①○",
    replace: "①",
    reason:
      "pdftotext抽出結果にのみ混入した記号ノイズ「○」。原本PDF(p.268)の表内空欄を目視確認したが○記号は存在しない。",
  },
  {
    page: 268,
    exerciseHint: "ex-multiblank-qu-question-294",
    find: "②○",
    replace: "②",
    reason: "同上（question-294、②側）。",
  },
  {
    page: 282,
    exerciseHint: "ex-multiblank-qu-question-308",
    find: "資1①1債",
    replace: "①",
    reason:
      "pdftotext抽出結果にのみ混入した数字ノイズ「資1」「1債」。原本PDF(p.282)の該当箇所を目視確認したが数字は存在しない。",
  },
  { page: 282, exerciseHint: "ex-multiblank-qu-question-308", find: "資1②1債", replace: "②", reason: "同上（question-308、②側）。" },
  { page: 282, exerciseHint: "ex-multiblank-qu-question-308", find: "資1③1債", replace: "③", reason: "同上（question-308、③側）。" },
  { page: 282, exerciseHint: "ex-multiblank-qu-question-308", find: "資1④1債", replace: "④", reason: "同上（question-308、④側）。" },
  { page: 282, exerciseHint: "ex-multiblank-qu-question-308", find: "資1⑤1債", replace: "⑤", reason: "同上（question-308、⑤側）。" },
  { page: 282, exerciseHint: "ex-multiblank-qu-question-308", find: "資1⑥1債", replace: "⑥", reason: "同上（question-308、⑥側）。" },
  { page: 282, exerciseHint: "ex-multiblank-qu-question-308", find: "資1⑦1債", replace: "⑦", reason: "同上（question-308、⑦側）。" },
  {
    page: 284,
    exerciseHint: "ex-multiblank-qu-question-311",
    find: "資1①1債",
    replace: "①",
    reason:
      "pdftotext抽出結果にのみ混入した数字ノイズ「資1」「1債」。原本PDF(p.284)の該当箇所を目視確認したが数字は存在しない。",
  },
  { page: 284, exerciseHint: "ex-multiblank-qu-question-311", find: "資1②1債", replace: "②", reason: "同上（question-311、②側）。" },
  { page: 284, exerciseHint: "ex-multiblank-qu-question-311", find: "資1③1債", replace: "③", reason: "同上（question-311、③側）。" },
];

// pages: [{page, text}] (extractPages()の戻り値そのもの)。
// 補正適用箇所・適用前後の文字列は呼び出し元がログできるよう、監査ログを第2戻り値として返す。
export function applyKnownTextNoiseCorrections(pages) {
  const byPage = new Map();
  for (const c of KNOWN_TEXT_NOISE_CORRECTIONS) {
    if (!byPage.has(c.page)) byPage.set(c.page, []);
    byPage.get(c.page).push(c);
  }

  const auditLog = [];
  const correctedPages = pages.map((p) => {
    const corrections = byPage.get(p.page);
    if (!corrections) return p;
    let text = p.text;
    for (const c of corrections) {
      const occurrenceCount = text.split(c.find).length - 1;
      if (occurrenceCount !== 1) {
        throw new Error(
          `[数字ノイズ補正:fail-closed] p.${p.page}（${c.exerciseHint}）で "${c.find}" の出現数が` +
            `想定(1件)と異なる(${occurrenceCount}件)。原本の抽出結果がこの補正定義の想定と乖離している` +
            `可能性があるため、誤った補正を適用せず処理を停止する。src/parser/knownTextCorrections.mjsを確認すること。`
        );
      }
      text = text.replace(c.find, c.replace);
      auditLog.push({
        page: p.page,
        exerciseHint: c.exerciseHint,
        find: c.find,
        replace: c.replace,
        reason: c.reason,
      });
    }
    return { ...p, text };
  });

  return { pages: correctedPages, auditLog };
}
