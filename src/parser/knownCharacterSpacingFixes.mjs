// buildCorpus.mjsの本文確定処理向けの、個別確認済みの文字間スペース除去定義。
//
// 対象は「PDF側の文字間隔を広げた組版（字間を空ける強調表現）が原因で、pdftotextが
// 1文字ごとにスペースを挟んで抽出してしまった」箇所のうち、原本PDF目視確認済みの3箇所のみ
// （教材データ品質調査2026-07-29）。
//
// 「文字間の余分なスペースを一律で除去する」一般ロジックではない。日本語の文章では
// スペースが単語区切りとして使われないため、一見安全に見える一律除去は、実際には
// 単一文字のリスト項目ラベル（例:「イ 換算等」「オ 取引価格の算定」の「イ」「オ」）の
// 前後にある正当なスペースまで壊してしまう（実データ調査で確認済み）。そのため、
// checkBlockId＋本文ブロックのlocator＋期待するfindSubstringの完全一致（本文中に厳密に
// 1回だけ出現すること）を条件とする個別補正のみを対象とし、それ以外では一切何もしない
// （knownBodyFragmentFixes.mjsと同じ設計方針）。
//
// 1つのcheckBlockIdに対して複数の除去箇所を持つ場合があるため、fixesは配列で保持する。

export const KNOWN_CHARACTER_SPACING_FIXES = [
  {
    checkBlockId: "checkblock-03",
    bodyLocator: "pdf:page=10;block=6",
    fixes: [
      {
        findSubstring: "財 産 法 と は 、",
        replacement: "財産法とは、",
        reason: "「財産法とは」が1文字ずつスペースで区切られて抽出されていた（原本PDF p.10 目視確認済み）。",
      },
      {
        findSubstring: "（ 正 味 財 産 ）",
        replacement: "（正味財産）",
        reason:
          "同一文中で先に「（正味財産）」が通常どおり抽出されている一方、2回目の出現が" +
          "「（ 正 味 財 産 ）」と1文字ずつスペースで区切られて抽出されていた（原本PDF p.10 目視確認済み）。",
      },
      {
        findSubstring: "する方法で ある。",
        replacement: "する方法である。",
        reason:
          "「である」の間に不要なスペースが1つ入っていた。同じ本文内の対応する箇所（静態論側）は" +
          "「する方法である。」と正しく抽出されており、動態論側のみに生じた抽出ゆれ（原本PDF p.10 目視確認済み）。",
      },
    ],
  },
  {
    checkBlockId: "checkblock-233",
    bodyLocator: "pdf:page=220;block=5",
    fixes: [
      {
        findSubstring: "し た と は 認 め ら れ ず 、 結 合 後 企 業 の",
        replacement: "したとは認められず、結合後企業の",
        reason:
          "「したとは認められず、結合後企業の」が1文字ずつスペースで区切られて抽出されていた" +
          "（原本PDF p.220 目視確認済み）。",
      },
    ],
  },
  {
    checkBlockId: "checkblock-281",
    bodyLocator: "pdf:page=260;block=6",
    fixes: [
      {
        findSubstring: "キ ャ ッ シ ュ ・ フ ロ ー 計 算 書 は 、 一 会 計 期 間 に お け る",
        replacement: "キャッシュ・フロー計算書は、一会計期間における",
        reason:
          "同じ本文の見出し「キャッシュ・フロー計算書の位置付け」は正しく抽出されている一方、" +
          "直後の文章が「キ ャ ッ シ ュ ・ フ ロ ー 計 算 書 は 、 一 会 計 期 間 に お け る」と" +
          "1文字ずつ（「・」を含む）スペースで区切られて抽出されていた（原本PDF p.260 目視確認済み）。",
      },
    ],
  },
];

// 調査時に候補として挙がったが、個別確認の結果「文字間隔の抽出不具合ではない」と判定し、
// 意図的に対象から除外した箇所（記録として残す。修正は行わない）。
//   - checkblock-247 (pdf:page=232;block=6):「外貨建金銭債権債務 イ 換算等」等の「イ」は
//     項目ラベル（イロハ順）であり、前後のスペースは正当な区切り。
//   - checkblock-315 (pdf:page=286;block=8):「収益の認識 イ 履行義務の識別」「識別 オ 取引価格の算定」の
//     「イ」「オ」も同様に項目ラベル（ア〜オ）であり、前後のスペースは正当な区切り。

const FIXES_BY_CHECKBLOCK_ID = new Map(KNOWN_CHARACTER_SPACING_FIXES.map((f) => [f.checkBlockId, f]));

// checkBlockIdに対応する既知の文字間スペース除去定義があれば、fail-closedで検証のうえ
// bodyTextへ順番に適用する。対象外のcheckBlockIdの場合はbodyTextをそのまま返す。
// bodySourceのlocatorや期待するfindSubstringが一致しない場合は、教材原文またはParserの
// 挙動がこの一覧の前提と変わったことを意味するため、例外を投げて処理を止める。
export function applyKnownCharacterSpacingFixes(checkBlockId, bodyText, bodySource) {
  const entry = FIXES_BY_CHECKBLOCK_ID.get(checkBlockId);
  if (!entry) return bodyText;

  if (bodySource?.locator !== entry.bodyLocator) {
    throw new Error(
      `knownCharacterSpacingFixes: ${checkBlockId}の本文locatorが想定(${entry.bodyLocator})と異なる` +
        `(実際: ${bodySource?.locator ?? "なし"})。教材原文またはParserの挙動が変わった可能性があるため、` +
        `誤修正を避けて処理を停止した。この定義を再確認してください。`
    );
  }

  let text = bodyText;
  for (const fix of entry.fixes) {
    const occurrences = text.split(fix.findSubstring).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `knownCharacterSpacingFixes: ${checkBlockId}の本文中に想定した文字列「${fix.findSubstring}」が` +
          `ちょうど1回だけ出現することを期待したが、実際は${occurrences}回だった。` +
          `教材原文またはParserの挙動が変わった可能性があるため、誤修正を避けて処理を停止した。` +
          `この定義を再確認してください。`
      );
    }
    text = text.replace(fix.findSubstring, fix.replacement);
  }
  return text;
}
