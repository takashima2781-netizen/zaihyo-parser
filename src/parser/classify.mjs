// Step 2: 構造マーカー検出（行単位のラベリング）。
// ここで判定するのは「この行が何の役割を持つか」という候補（candidateRole）のみであり、
// 実際に階層へどう組み込むかはbuildCorpus.mjsの責務とする。
//
// 実データでは見出し行同士が空行を挟まず隣接することがある
// （例: 会員番号欄／テーマ見出し／節見出しが3行連続で並ぶ）ため、
// ブロック化（blockize.mjs）より先に行単位でこの判定を行う設計にしている。

export const FW_DIGIT = "[0-9０-９]+";

export function classifyLine(t) {
  // 会員番号欄はpdftotextで一部の漢字・数字が置換文字（文字化け）になることがあるため、
  // 末尾の文字（「号」など）に依存しない緩いprefixで判定する。
  if (/^会員番|^Copyright|^－[0-9０-９]+－/.test(t)) return "pageFurniture";
  if (new RegExp(`^テーマ${FW_DIGIT}`).test(t)) return "themeHeading";
  if (new RegExp(`^${FW_DIGIT}[-－]${FW_DIGIT}\\s`).test(t)) return "sectionHeading";
  if (/^重要度/.test(t)) return "importanceBadge";
  if (/^＜.+＞/.test(t)) return "checkTypeHeadingCompound"; // チェック区分見出し＋問番号＋指示文が同居する行
  // 解答ページの「問N ...」形式。①-⑳や(N)のマーカーが続く場合だけでなく、
  // ルール3（無マーカー単一Item）が対象とする「問N 文章がそのまま続く」形式も含める
  // （p.53「問２ 原価主義の原則は、...」のように、マーカーなし設問の解答はマーカーなしで続く）。
  if (new RegExp(`^問${FW_DIGIT}\\s*\\S`).test(t)) return "answerBlock";
  // 項目見出し（例:「１ 財務会計」）と、本文中の列挙記号（例:「１ 現金主義会計 現金主義会計とは、
  // …。」のように、同じ「数字+空白」で始まる長い地の文）は、この正規表現だけでは区別できない。
  // 実データ全件調査で、正しい項目見出しは全て30文字以内・句点(。)を含まないのに対し、
  // 本文中の列挙記号に埋もれた行は41文字以上または句点を含むことを確認した（教材データ品質調査、
  // 2026-07-27）。そのためタイトル候補（先頭の「数字+空白」を除いた残り）がこの条件を満たす
  // 場合のみtopicHeadingとする。満たさない場合はunknownとして本文側の継続行に含める
  // （新しい意味判定は行わない。既存の閾値=実測データの分布ギャップに基づく機械的な条件）。
  if (new RegExp(`^${FW_DIGIT}\\s+\\S`).test(t) && !/重要度/.test(t)) {
    const m = t.match(new RegExp(`^${FW_DIGIT}\\s+(.*)$`));
    const titleCandidate = (m ? m[1] : t).trim();
    if (titleCandidate.length <= 30 && !titleCandidate.includes("。")) return "topicHeading";
  }
  return "unknown";
}
