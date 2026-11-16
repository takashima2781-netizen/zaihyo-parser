// gateChecks: ケース横断でのsourceFaithful重複検証(Phase C本体、テーマ8-9の
// 実装時に、テーマ8-1の仕訳と偶然完全に同一の型〈勘定科目名まで一致〉に
// なるケースを人間の目視で発見したことを受けて追加)。
//
// CLAUDE.md原則3(根拠のない知識を作らない・重複したKnowledgeを作らない)を
// 踏まえ、journal_termbased/formula_termbased種別の確定Sourceについて、
// sourceFaithfulが複数ケースで完全に一致していないかを検証する。同一ページ
// 内の重複(洗替法の2行目等)は各run*Case.mjsが候補選別の時点で1件のみを
// 採用するため、そもそもケースファイルにならない。この検証は、異なる論点
// (異なるスクリプト)にまたがる重複——実装時に見落としやすい——を機械的に
// 検出するためのものであり、一次判断器ではなく生成済みデータの検証
// (`idUniquenessChecks.mjs`と同じ位置づけ)。
//
// blockKindがformula_termbased/journal_termbased以外(未知の将来のkind)は
// 対象外とする(無理に汎用化しない、原則6)。

const TARGET_BLOCK_KINDS = new Set(["journal_termbased", "formula_termbased"]);

/**
 * @param {Array<object>} caseDataList `output/cases/*.json`(`.test.json`を
 *   除く)の内容の配列
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function checkDuplicateSourceFaithful(caseDataList) {
  const violations = [];
  const owners = new Map();

  for (const caseData of caseDataList) {
    const block = caseData.block;
    if (!block || !TARGET_BLOCK_KINDS.has(block.blockKind)) continue;
    if (!block.sourceFaithful) continue;

    const key = `${block.blockKind}::${block.sourceFaithful}`;
    if (!owners.has(key)) owners.set(key, []);
    owners.get(key).push(caseData.case);
  }

  for (const [key, caseNames] of owners) {
    if (caseNames.length > 1) {
      const sourceFaithful = key.slice(key.indexOf("::") + 2);
      violations.push(
        `sourceFaithful "${sourceFaithful}" が複数のケースで完全に同一の型として重複している: ${caseNames.join(", ")}`,
      );
    }
  }

  return { ok: violations.length === 0, violations };
}
