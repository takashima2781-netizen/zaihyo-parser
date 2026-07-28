// buildCorpus.mjsの本文確定処理向けの、個別確認済みの本文断片再結合定義。
//
// 対象は「本文の一部がレイアウト復元の不備により別ブロックへ孤立し(分類できなかった断片として
// meta.unresolvedに記録される)、かつ断片自体は完全な語句であり、本文中への挿入位置・挿入方法が
// 機械的・一意に決定できる」ことを原本PDF目視確認済みの4箇所のみ（教材データ品質調査2026-07-28）。
//
// 「孤立した断片を本文へ結合する」一般ロジックではない。checkBlockId＋本文ブロックのlocator＋
// 期待するfindSubstringの完全一致（本文中に厳密に1回だけ出現すること）を条件とする個別補正であり、
// 文脈が一致しない場合は補正を適用せず例外を投げて処理を停止する（fail-closed）。
// これにより、教材原文が変わった場合や、この一覧の想定と異なる状態になった場合に、
// 誤って無関係な本文を書き換えてしまうことを防ぐ。
//
// 断片が破損している、または本文中の複数箇所へ分割挿入が必要など、単一挿入で復元できない
// ケース（checkblock-11・257・261）はここに含めない。それらはanomalyDetector.mjsの2d
// （body_fragment_incomplete）で個別にwithheld対象としている。

export const KNOWN_BODY_FRAGMENT_FIXES = [
  {
    checkBlockId: "checkblock-01",
    bodyLocator: "pdf:page=8;block=6",
    fragmentLocator: "pdf:page=8;block=7",
    fragmentText: "に報告",
    findSubstring: "① するための",
    replacement: "① に報告するための",
    pdfPage: 8,
    reason:
      "「企業の①するための会計」は原本では「企業の①に報告するための会計」であり、" +
      "「に報告」がレイアウト復元の不備により別ブロック(p.8 block=7)へ孤立していた" +
      "（原本PDF p.8 目視確認済み）。",
  },
  {
    checkBlockId: "checkblock-39",
    bodyLocator: "pdf:page=48;block=7",
    fragmentLocator: "pdf:page=48;block=8",
    fragmentText: "及び",
    findSubstring: "◎ ③",
    replacement: "及び ③",
    pdfPage: 48,
    reason:
      "本文中の「◎」は原本では「及び」であり、「及び」がレイアウト復元の不備により" +
      "別ブロック(p.48 block=8)へ孤立し、代わりに記号「◎」が残存していた" +
      "（原本PDF p.48 目視確認済み）。",
  },
  {
    checkBlockId: "checkblock-77",
    bodyLocator: "pdf:page=80;block=7",
    fragmentLocator: "pdf:page=80;block=8",
    fragmentText: "ため、",
    findSubstring: "④ 〇⑤",
    replacement: "④ ため、⑤",
    pdfPage: 80,
    reason:
      "本文中の「〇」は原本では「ため、」であり、「ため、」がレイアウト復元の不備により" +
      "別ブロック(p.80 block=8)へ孤立し、代わりに記号「〇」が残存していた" +
      "（原本PDF p.80 目視確認済み）。",
  },
  {
    checkBlockId: "checkblock-192",
    bodyLocator: "pdf:page=184;block=6",
    fragmentLocator: "pdf:page=184;block=7",
    fragmentText: "こと等から、取得形",
    findSubstring: "②\n態別ではなく",
    replacement: "② こと等から、取得形態別ではなく",
    pdfPage: 184,
    reason:
      "「その②により、態別ではなく」は原本では「その②により、こと等から、取得形態別ではなく」であり、" +
      "「こと等から、取得形」がレイアウト復元の不備により別ブロック(p.184 block=7)へ孤立していた" +
      "（原本PDF p.184 目視確認済み）。",
  },
];

const FIXES_BY_CHECKBLOCK_ID = new Map(KNOWN_BODY_FRAGMENT_FIXES.map((f) => [f.checkBlockId, f]));

// checkBlockIdに対応する既知の断片再結合定義があれば、fail-closedで検証のうえbodyTextへ適用する。
// 適用した場合は{ bodyText: 修正後本文, fragmentLocator: 消費済みとしてマークすべきlocator }を返す。
// 対象外のcheckBlockIdの場合はnullを返す（何もしない）。
// bodySourceのlocatorや期待するfindSubstringが一致しない場合は、教材原文または
// Parserの挙動がこの一覧の前提と変わったことを意味するため、例外を投げて処理を止める。
export function applyKnownBodyFragmentFix(checkBlockId, bodyText, bodySource) {
  const fix = FIXES_BY_CHECKBLOCK_ID.get(checkBlockId);
  if (!fix) return null;

  if (bodySource?.locator !== fix.bodyLocator) {
    throw new Error(
      `knownBodyFragmentFixes: ${checkBlockId}の本文locatorが想定(${fix.bodyLocator})と異なる` +
        `(実際: ${bodySource?.locator ?? "なし"})。教材原文またはParserの挙動が変わった可能性があるため、` +
        `誤結合を避けて処理を停止した。この定義を再確認してください。`
    );
  }

  const occurrences = bodyText.split(fix.findSubstring).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `knownBodyFragmentFixes: ${checkBlockId}の本文中に想定した文字列「${fix.findSubstring}」が` +
        `ちょうど1回だけ出現することを期待したが、実際は${occurrences}回だった。` +
        `教材原文またはParserの挙動が変わった可能性があるため、誤結合を避けて処理を停止した。` +
        `この定義を再確認してください。`
    );
  }

  return {
    bodyText: bodyText.replace(fix.findSubstring, fix.replacement),
    fragmentLocator: fix.fragmentLocator,
  };
}
