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

// --- 第3ケース専用: 仕訳パターンの字間空白除去 ---
//
// 実データ確認(テーマ8-11 無形固定資産の会計処理、仕訳パターン2件)で、
// 勘定科目名の文字間に空白が挿入されている箇所があることを確認した
// (例: 「無 形 固 定 資 産」)。同じ勘定科目名(「無形固定資産」)が
// 別の行では空白なしで印字されていることも確認しており、これは抽出の
// 崩れではなく、教材側の字間調整(タイプセット上の見た目の調整)である。
//
// fraction_splitのような個別確認済み補正(`applyKnownCorrection`)とは
// 異なり、「全角文字(漢字・かな・カナ)の間の空白を詰める」という変換は
// 文字そのものを一切変更しない(文字の並びが保持されるため、原文を
// 失う〈原則2〉リスクが無い)。そのため、行ごとの個別確認済みテキストを
// 要求せず、機械的な正規化として実装する。ただし対象は今回確認できた
// 仕訳パターンの勘定科目名という狭い用途にとどめ、汎用的なテキスト
// クレンジングユーティリティとしては扱わない。
const CJK_CHAR = "[一-龠々〆ヵヶぁ-んァ-ヶーＡ-Ｚａ-ｚ０-９]";
const CJK_SPACING_PATTERN = new RegExp(`(${CJK_CHAR})[ 　]+(?=${CJK_CHAR})`, "g");

/**
 * 全角文字の間にある字間調整用の空白を除去する。文字自体は一切変更しない
 * (fail-closed: 除去後に想定外の空白が残っていないか呼び出し側で確認できる
 * よう、除去した空白の個数を返す)。
 * @param {string} text
 * @returns {{ normalized: string, removedCount: number }}
 */
export function normalizeCjkLetterSpacing(text) {
  let removedCount = 0;
  const normalized = text.replace(CJK_SPACING_PATTERN, (_match, char) => {
    removedCount += 1;
    return char;
  });
  return { normalized, removedCount };
}

// --- 第2ケース専用: 座標ベースの分数対応付け ---
//
// `get_text(sort=True)`の読み順ヒューリスティックは、1ページに複数の
// 分数付き計算行がある場合、分子/分母の断片を誤った計算行の近くに
// 並べてしまうことがある(第2ケースの実データ検証で判明、
// `planning/case2_readiness_and_generalization_analysis.md`7-1節)。
// この問題は「±1行」という単純なテキスト隣接ヒューリスティックでは
// 解決できないため、座標付きブロック(`extractBlocks`)を使った位置ベースの
// 対応付けへ切り替える。汎用的な座標復元エンジンではなく、今回確認できた
// 2つの適用例を正しく扱うために必要な最小限のロジックにとどめる。

const FRACTION_FRAGMENT_LINE = /^[０-９0-9]+[年月]$/;
const Y_THRESHOLD = 40;

/**
 * 同じページに同一の計算式が複数回出現する場合があるため(第2ケースの実データ、
 * ページ193で確認済み。決算時・廃棄時で同じ式が繰り返される)、`beforeGap`/
 * `afterGap`の出現箇所をY座標が近いもの同士でペアリングし、ページ上の出現
 * 順(Y座標が小さい順)で`occurrenceIndex`番目のものを対象とする。
 *
 * @param {Array<{x0:number,y0:number,x1:number,y1:number,text:string}>} blocks
 * @param {string} beforeGap 数式の×側の文字列(例: "93,000×")
 * @param {string} afterGap 数式の＝側の文字列(例: "＝12,000")
 * @param {number} [occurrenceIndex] 複数出現する場合の対象インデックス(0始まり)
 * @returns {{ numerator: string, denominator: string }}
 */
export function restoreFractionByPosition(blocks, beforeGap, afterGap, occurrenceIndex = 0) {
  const beforeIndices = blocks
    .map((b, i) => (b.text.includes(beforeGap) ? i : -1))
    .filter((i) => i !== -1);
  const afterIndices = blocks
    .map((b, i) => (b.text.includes(afterGap) ? i : -1))
    .filter((i) => i !== -1);

  if (beforeIndices.length === 0 || afterIndices.length === 0) {
    throw new Error(
      `数式に対応するブロックが座標データから見つからない(fail-closed): ` +
        `"${beforeGap}" / "${afterGap}"`,
    );
  }

  // beforeGapの各出現箇所を、Y座標が最も近いafterGapの出現箇所とペアリングする
  const pairs = beforeIndices
    .map((bi) => {
      let bestAi = null;
      let bestDist = Infinity;
      for (const ai of afterIndices) {
        const dist = Math.abs(blocks[ai].y0 - blocks[bi].y0);
        if (dist < bestDist) {
          bestDist = dist;
          bestAi = ai;
        }
      }
      return { beforeIndex: bi, afterIndex: bestAi, y0: Math.min(blocks[bi].y0, blocks[bestAi].y0) };
    })
    .sort((a, b) => a.y0 - b.y0);

  if (occurrenceIndex >= pairs.length) {
    throw new Error(
      `occurrenceIndex(${occurrenceIndex})がページ上の出現数(${pairs.length})を` +
        `超えている(fail-closed): "${beforeGap}" / "${afterGap}"`,
    );
  }

  const { beforeIndex, afterIndex } = pairs[occurrenceIndex];
  const anchorIndices = [...new Set([beforeIndex, afterIndex])];

  let numerator = null;
  let denominator = null;

  // 同一ブロック内(数式の直後に分母が同居しているケース、例: 第2ケースの
  // 適用例B)を優先的に探す。×を含む行より前を分子候補、＝を含む行より
  // 後を分母候補とする。
  for (const i of anchorIndices) {
    const lines = blocks[i].text.split("\n").map((l) => l.trim());
    const formulaLineIdx = lines.findIndex((l) => l.includes("×") || l.includes("＝"));
    lines.forEach((line, idx) => {
      if (!FRACTION_FRAGMENT_LINE.test(line)) return;
      if (idx < formulaLineIdx && numerator === null) numerator = line;
      if (idx > formulaLineIdx && denominator === null) denominator = line;
    });
  }

  const anchorY0 = Math.min(...anchorIndices.map((i) => blocks[i].y0));
  const anchorY1 = Math.max(...anchorIndices.map((i) => blocks[i].y1));

  if (numerator === null) {
    numerator = findNearestFragment(blocks, anchorIndices, anchorY0, "above");
  }
  if (denominator === null) {
    denominator = findNearestFragment(blocks, anchorIndices, anchorY1, "below");
  }

  if (numerator === null || denominator === null) {
    throw new Error(
      `分子・分母の座標的な対応付けに失敗した(fail-closed、無理に推測しない): ` +
        `numerator=${numerator}, denominator=${denominator}`,
    );
  }

  return { numerator, denominator };
}

function findNearestFragment(blocks, excludeIndices, anchorY, direction) {
  let best = null;
  let bestDistance = Infinity;

  blocks.forEach((b, i) => {
    if (excludeIndices.includes(i)) return;
    const distance = direction === "above" ? anchorY - b.y1 : b.y0 - anchorY;
    if (distance < -2 || distance > Y_THRESHOLD) return;

    for (const line of b.text.split("\n")) {
      const trimmed = line.trim();
      if (FRACTION_FRAGMENT_LINE.test(trimmed) && distance < bestDistance) {
        best = trimmed;
        bestDistance = distance;
      }
    }
  });

  return best;
}
