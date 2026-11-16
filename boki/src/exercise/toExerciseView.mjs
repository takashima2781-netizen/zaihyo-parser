// Phase D: boki-appのExercise(M5の出力)を、財表ドリル(学習エンジン、
// `Zaihyo Parser/html-v2`)が既に読み込める「Exercise View JSON」形式へ
// 変換する。財表ドリル側のコードは一切変更しない(接続であって融合ではない、
// `planning/phase_d_investigation_and_design.md`10節)。
//
// 対応するのは`exerciseKind`が`journal_ordering`/`formula_ordering`の
// Exerciseのみ(`answer.correctOrder`がトークン文字列の配列、
// `answer.grading.method`が`exact_sequence_match`という共通の形状を持つ、
// `src/exercise/generateJournalOrderingExercise.mjs`・
// `generateFormulaOrderingExercise.mjs`参照)。これらはExercise View側の
// `ordering`出題形式(`registry.js`のorderingハンドラ)と判定方式が一致する
// ため、フィールド名を変換するだけで接続できる。未対応のexerciseKindは
// エラーにせず`diagnostics.unsupported`へ記録して除外する
// (`buildExercisesFromApprovedKnowledge.mjs`と同じ、未対応と異常を区別する
// 方針)。
//
// stableItemIds: 財表ドリル側の学習履歴(progressStore.js)は、multi_blank以外
// の出題形式で`stableItemIds[0]`を履歴の主キーに使う。boki-appにはBSM由来の
// 安定IDが無いため、`"boki:" + knowledge.id`を採用する(Knowledge IDの一意性は
// 既にgateChecksで保証済み、`src/gateChecks/idUniquenessChecks.mjs`)。

const SCHEMA_VERSION = "exercise-view-schema-v1.8.0";

const SUPPORTED_EXERCISE_KINDS = new Set(["journal_ordering", "formula_ordering"]);

const BOKI_APP_THEME = {
  structureNodeId: "boki-app",
  titleRaw: { text: "簿記論(boki-app)", source: null, bsmNodeId: null, inherited: false },
};

function toOrderingExercise(exercise) {
  const tokens = exercise.answer.correctOrder;
  const orderingItems = tokens.map((text, i) => ({
    id: `item-${i}`,
    label: String(i + 1),
    text,
  }));
  const correctOrder = orderingItems.map((item) => item.id);

  return {
    exerciseId: exercise.id,
    exerciseType: "ordering",
    sourceBookStructureIds: [],
    sourceItemIds: [],
    stableItemIds: [`boki:${exercise.knowledgeRef.knowledgeId}`],
    contentFingerprints: [],
    prompt: null,
    body: {
      text: exercise.prompt.instruction,
      source: { documentId: "boki-app", locator: exercise.knowledgeRef.knowledgeId },
      bsmNodeId: null,
      inherited: false,
    },
    choices: null,
    expectedAnswer: [],
    judgement: null,
    explanation: null,
    answerForm: null,
    withheldAnswerContent: null,
    structureType: null,
    subQuestions: null,
    bodySegments: null,
    instructionRaw: null,
    structurePath: [],
    structure: { theme: BOKI_APP_THEME },
    orderingItems,
    correctOrder,
  };
}

/**
 * @param {{ exercises: object[] }} exercisesData boki-appの output/exercises/exercises.json の内容
 * @returns {{
 *   document: { meta: object, exercises: object[], withheldExercises: object[] },
 *   diagnostics: {
 *     checkedCount: number,
 *     convertedCount: number,
 *     unsupportedCount: number,
 *     unsupported: Array<{ exerciseId: string, exerciseKind: string, reason: string }>,
 *   },
 * }}
 */
export function toExerciseView(exercisesData) {
  const sourceExercises = exercisesData.exercises ?? [];

  const converted = [];
  const unsupported = [];

  for (const exercise of sourceExercises) {
    if (!SUPPORTED_EXERCISE_KINDS.has(exercise.exerciseKind)) {
      unsupported.push({
        exerciseId: exercise.id,
        exerciseKind: exercise.exerciseKind,
        reason: "対応するExercise View変換ロジックが無い(exact_sequence_match以外の判定方式)",
      });
      continue;
    }
    converted.push(toOrderingExercise(exercise));
  }

  const document = {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      // 学習アプリ(../html-v2)の科目の目印(html-v2/js/subject.js)。これが無い問題データは
      // 財表のものとして扱われ、簿記論として開いた画面では読み込めない。
      subject: "boki",
      status: "boki-app-generated",
      generatedAt: new Date().toISOString(),
      sourceBookStructureMasterPath: null,
      targetCheckBlockIds: [],
      generationRules: ["boki_app_ordering_exercise_to_exercise_view_v1"],
      exerciseCount: converted.length,
      withheldExerciseCount: 0,
    },
    exercises: converted,
    withheldExercises: [],
  };

  return {
    document,
    diagnostics: {
      checkedCount: sourceExercises.length,
      convertedCount: converted.length,
      unsupportedCount: unsupported.length,
      unsupported,
    },
  };
}
