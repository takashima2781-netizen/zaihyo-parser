// [5] Faithful Restoration(最小版: このケース1件のfraction_split補正のみ)
//
// Zaihyo Parserの`knownTextCorrections.mjs`パターン(fail-closedな個別確認済み
// ノイズ補正)を踏襲する。汎用的な分数復元ロジックは実装しない
// (`m1_minimal_parser_prototype_design.md`5節)。
//
// 【教材保護について】補正の「中身」(崩れたテキストの断片・正しい忠実な表現)は
// 教材原文に由来するデータであるため、このファイル自体には一切書かない。
// 呼び出し側が、Git管理対象外の領域(`/input/corrections/`等)から読み込んだ
// 補正データを引数として渡す構成にする(CLAUDE.md原則7)。

/**
 * @typedef {{
 *   blockId: string,
 *   artifactKind: string,
 *   expectedFragments: string[],
 *   correctedText: string,
 * }} CorrectionEntry
 */

/**
 * extractionRawの内容が、既知の補正エントリが期待する断片をすべて含んでいるかを
 * 確認し、含んでいればsourceFaithfulを確定する。含んでいなければ
 * (想定外の崩れ方だった場合)、無理に補正せず例外を投げる(fail-closed、原則4)。
 *
 * @param {string} rawText extractionRawのテキスト(候補+前後コンテキスト)
 * @param {CorrectionEntry} correction
 * @returns {{ sourceFaithful: string, artifact: { kind: string, stage: "extraction", resolved: true, note: string } }}
 */
export function applyKnownCorrection(rawText, correction) {
  const missing = correction.expectedFragments.filter(
    (fragment) => !rawText.includes(fragment),
  );
  if (missing.length > 0) {
    throw new Error(
      `Faithful Restoration failed (fail-closed): expected fragments not found in extractionRaw: ${JSON.stringify(
        missing,
      )}. 既知の補正パターン(${correction.artifactKind})に一致しないため、無理に補正しない。`,
    );
  }

  return {
    sourceFaithful: correction.correctedText,
    artifact: {
      kind: correction.artifactKind,
      stage: "extraction",
      resolved: true,
      note: `既知の${correction.artifactKind}パターンとして人間確認済みの補正を適用した`,
    },
  };
}

// captured_matches_sourceFaithful(補正不要)のケースを扱う関数は、
// このM1ケース(定額法の定義式、fraction_splitが必ず発生する)では
// 一度も使われないため実装しない(未使用のコードを持ち込まない、
// self-review時に削除。次のケースで実際に必要になった時点で追加する)。
