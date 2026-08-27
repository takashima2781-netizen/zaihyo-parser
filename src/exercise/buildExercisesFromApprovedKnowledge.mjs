// M5: approved-knowledge.json(M4の派生ビュー)からExercise配列を組み立てる。
//
// 承認済みKnowledgeが何件あっても全件を走査し、対応するExercise generator
// (`exerciseGeneratorRegistry.mjs`)が登録されているものだけExerciseを生成
// する。対応するgeneratorが無いKnowledgeは正常な「未対応」として扱い、
// エラーにしない——fail-closedで止めるべきなのは「supportsが対応可能と
// 判定したのに、実際の生成(generate)に失敗した」場合のみである
// (未対応と生成異常を区別する)。
//
// 以前の実装は特定のKnowledge ID(定額法1件)だけを`find`しており、
// 承認済みKnowledgeが2件目以降に増えても、対応するExerciseが黙って
// 生成されない(エラーにもならない)という不具合を抱えていた。今回、
// レジストリ方式への変更にあわせてこの不具合を修正した。
//
// `output/cases/`(candidate/rejectedを含む生データ)は一切参照しない
// (呼び出し側がapproved-knowledge.jsonの内容だけを渡す設計そのものが、
// この境界を機構として保証する)。
//
// 診断情報(何件確認し、何件生成し、何件が未対応/失敗だったか)は、正式な
// Exerciseデータモデル(exercises.json)には混ぜず、戻り値の`diagnostics`
// として分離する。呼び出し側(CLIスクリプト等)が確認・ログ出力・
// fail-closedの判断に使う。M6は引き続きexercises.jsonの`exercises`配列
// だけを読めばよい、という既存の契約は変更しない。

import { exerciseGenerators as defaultGenerators } from "./exerciseGeneratorRegistry.mjs";

/**
 * @param {{ knowledge: Array<{ approvedAt: string, sourceCase: string, knowledge: object }> }} approvedKnowledgeData
 *   output/knowledge/approved-knowledge.json の内容
 * @param {{ generators?: Array<{ exerciseKind: string, supports: (knowledge: object) => boolean, generate: (entry: object) => object }> }} [options]
 *   テスト時にレジストリを差し替えられるようにするための任意引数
 *   (省略時は実際のレジストリを使う)。
 * @returns {{
 *   exercises: object[],
 *   diagnostics: {
 *     checkedCount: number,
 *     generatedCount: number,
 *     unsupportedCount: number,
 *     failedCount: number,
 *     generated: Array<{ knowledgeId: string, exerciseKind: string, exerciseId: string }>,
 *     unsupported: Array<{ knowledgeId: string, knowledgeKind: string, reason: string }>,
 *     failed: Array<{ knowledgeId: string, exerciseKind: string, error: string }>,
 *   },
 * }}
 */
export function buildExercisesFromApprovedKnowledge(
  approvedKnowledgeData,
  { generators = defaultGenerators } = {},
) {
  const entries = approvedKnowledgeData.knowledge ?? [];

  const exercises = [];
  const generated = [];
  const unsupported = [];
  const failed = [];

  for (const entry of entries) {
    const matchedGenerators = generators.filter((g) => g.supports(entry.knowledge));

    if (matchedGenerators.length === 0) {
      unsupported.push({
        knowledgeId: entry.knowledge.id,
        knowledgeKind: entry.knowledge.knowledgeKind,
        reason: "対応するExercise generatorが登録されていない",
      });
      continue;
    }

    for (const generator of matchedGenerators) {
      try {
        const exercise = generator.generate(entry);
        exercises.push(exercise);
        generated.push({
          knowledgeId: entry.knowledge.id,
          exerciseKind: generator.exerciseKind,
          exerciseId: exercise.id,
        });
      } catch (err) {
        failed.push({
          knowledgeId: entry.knowledge.id,
          exerciseKind: generator.exerciseKind,
          error: err.message,
        });
      }
    }
  }

  return {
    exercises,
    diagnostics: {
      checkedCount: entries.length,
      generatedCount: generated.length,
      unsupportedCount: unsupported.length,
      failedCount: failed.length,
      generated,
      unsupported,
      failed,
    },
  };
}
