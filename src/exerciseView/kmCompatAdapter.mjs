// Exercise View (v1, docs/exercise_view_schema_v1.json) → 既存Knowledge Master v0.6と同一shapeの
// JSONへ投影するAdapter（Phase 3B-2試作）。
//
// 位置づけ（docs/exercise_view_spec_v1.md §9・ユーザー指示）:
// - 変換対象は exerciseView.exercises（eligibleのみ）のうち、single_blank・true_falseのみ。
// - multi_blankは変換対象外（KM v0.6が「1 Item = 1 Question」という粒度しか持たないため、
//   複数空欄をまとめた演習を1つのKM Questionへ折りたたむことはしない。原則5・6に反する簡略化になる）。
// - withheldExercises（review_required・ineligible）は変換対象外
//   （KM v0.6には「保留中」という概念自体が存在しない。既存の29件KM未解決Itemが単に出力されない
//   のと同じ扱いであり、新しい概念をKM側に持ち込まない）。
// - 対象外は「エラー・変換失敗」ではなく、専用の集計区分(unsupportedByAdapter)で管理する。
// - 既存Knowledge Master（src/knowledgeMaster/）のコード・スキーマは一切変更しない
//   （このファイルは新規モジュールであり、KM側を一切importして書き換えたりしない）。
// - Item IDは、Exerciseの sourceItemIds（Exercise View側の現行互換helper経由で既に解決済みの値）を
//   そのまま使う。Adapter自身が非スキーマ項目へ直接アクセスすることはない。

function makeIdFactory() {
  const counters = {};
  return function nextId(prefix) {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}-${counters[prefix]}`;
  };
}

// exerciseType → KM Requirement.operation への機械的な対応表。
// 注意: これはBSM/Exercise Viewが持つ情報（judgmentSymbolRawの有無）から導出した推定値であり、
// 元のIntermediate JSON Item.presentations[].type（KMの本来のoperation源）とは独立している。
// そのため、真のoperationが"freeText"だった項目がsingle_blankとして扱われている場合、
// Adapterはそれを"fillBlank"と表記する（Exercise Viewの設計上の境界。docs/exercise_view_spec_v1.md
// が明記する既知の制約であり、Phase 3B-2レポートでKM互換Adapterの前提として改めて説明する）。
function operationForExerciseType(exerciseType) {
  if (exerciseType === "true_false") return "trueFalse";
  if (exerciseType === "single_blank") return "fillBlank";
  return null;
}

function answerTextForExercise(ex) {
  if (ex.exerciseType === "true_false") {
    return ex.judgement ? ex.judgement.answerBodyRaw.text : null;
  }
  if (ex.exerciseType === "single_blank") {
    return ex.expectedAnswer.length === 1 ? ex.expectedAnswer[0].answerText.text : null;
  }
  return null;
}

// exerciseViewのexercises/withheldExercisesから、KM v0.6互換のJSONを生成する。
// 戻り値のkmは、src/knowledgeMaster/validate.mjsのvalidateKnowledgeMaster()でそのまま検証できる形。
export function buildKmCompatFromExerciseView(exerciseView, { bookId, bookTitle, schemaVersion, builtBy }) {
  const nextId = makeIdFactory();
  const unresolved = [];
  const evidence = [];
  const answerUnits = [];
  const questions = [];

  const unsupportedByAdapter = {
    multiBlankExcluded: [],
    withheldExcluded: [],
  };
  const conversionFailures = [];

  const sourceId = nextId("source");
  const source = {
    id: sourceId,
    title: bookTitle,
    corpusRef: { bookId, schemaVersion, parserVersion: null },
  };

  for (const ex of exerciseView.withheldExercises) {
    unsupportedByAdapter.withheldExcluded.push({ exerciseId: ex.exerciseId, eligibility: ex.eligibility, exerciseType: ex.exerciseType });
    unresolved.push({ locator: `exercise:${ex.exerciseId}`, reason: `withheldExercises(eligibility=${ex.eligibility})のため変換対象外` });
  }

  for (const ex of exerciseView.exercises) {
    if (ex.exerciseType === "multi_blank") {
      unsupportedByAdapter.multiBlankExcluded.push({ exerciseId: ex.exerciseId });
      unresolved.push({
        locator: `exercise:${ex.exerciseId}`,
        reason: "multi_blankはKM互換Adapterの変換対象外（KM v0.6は1 Item=1 Questionの粒度のみ対応）",
      });
      continue;
    }
    if (ex.exerciseType !== "single_blank" && ex.exerciseType !== "true_false") {
      unsupportedByAdapter.multiBlankExcluded.push({ exerciseId: ex.exerciseId, reason: `未対応のexerciseType: ${ex.exerciseType}` });
      continue;
    }

    if (ex.sourceItemIds.length !== 1) {
      conversionFailures.push({ exerciseId: ex.exerciseId, reason: `sourceItemIdsが1件ではない(${ex.sourceItemIds.length}件): single_blank/true_falseは1 Exercise=1 Itemを前提とする` });
      continue;
    }
    const itemId = ex.sourceItemIds[0];

    const promptText = ex.prompt?.text ?? ex.body?.text ?? null;
    if (promptText == null) {
      conversionFailures.push({ exerciseId: ex.exerciseId, reason: "prompt/bodyが両方ともnullで、問題文Evidenceを生成できない" });
      continue;
    }

    const answerText = answerTextForExercise(ex);
    if (answerText == null) {
      conversionFailures.push({ exerciseId: ex.exerciseId, reason: "eligible=eligibleにも関わらず解答内容(judgement/expectedAnswer)が得られない" });
      continue;
    }

    const promptEvId = nextId("ev");
    evidence.push({ id: promptEvId, itemId, kind: "question", answerOrder: null, excerpt: promptText, excerptSource: "raw" });

    const answerEvId = nextId("ev");
    evidence.push({ id: answerEvId, itemId, kind: "answer", answerOrder: 1, excerpt: answerText, excerptSource: "raw" });
    const auId = nextId("au");
    answerUnits.push({ id: auId, sourceId, order: 1, evidenceId: answerEvId });

    if (ex.explanation) {
      const explEvId = nextId("ev");
      evidence.push({ id: explEvId, itemId, kind: "explanation", answerOrder: null, excerpt: ex.explanation.raw.text, excerptSource: "raw" });
    }

    questions.push({
      id: nextId("q"),
      sourceId,
      itemId,
      presentationIndex: 0,
      promptEvidenceIds: [promptEvId],
      requirement: {
        target: null,
        operation: operationForExerciseType(ex.exerciseType),
        purpose: null,
        requiredCount: 1,
        outputForm: null,
        requiredDepth: null,
        notes:
          "exercise-view-km-compat-adapter-phase3b2: operationはExercise ViewのexerciseTypeから機械的に導出した推定値であり、" +
          "元のKnowledge Master v0.6のoperation（Intermediate JSON Item.presentations[].type由来）と一致しない場合がある",
      },
      answerUnitIds: [auId],
      canonicalQuestionId: null,
    });
  }

  return {
    km: {
      meta: { schemaVersion: "0.5.0-draft", status: "provisional", builtBy, unresolved },
      sources: [source],
      evidence,
      answerUnits,
      questions,
    },
    unsupportedByAdapter,
    conversionFailures,
  };
}
