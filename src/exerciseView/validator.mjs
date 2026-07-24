// Exercise View Phase 3A の検証（17項目）。
// docs/exercise_view_phase3a_report.md の検証結果セクションに対応する。
// 生成ロジック（buildExerciseView.mjs）そのものではなく、生成結果を独立に検証する
// 読み取り専用チェッカーである（src/bookStructureMaster/validator.mjsと同じ位置づけ）。

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { INELIGIBLE_CATEGORIES_FOR_REPORT, REVIEW_REQUIRED_CATEGORIES_FOR_REPORT } from "./eligibilityCategories.mjs";

function isRawSpanRef(v) {
  return (
    v &&
    typeof v.text === "string" &&
    v.source &&
    typeof v.source.documentId === "string" &&
    typeof v.source.locator === "string" &&
    typeof v.bsmNodeId === "string" &&
    typeof v.inherited === "boolean"
  );
}

// BSM全体をid索引化する（QuestionUnit/CheckSection双方。多重ネストされたStructureNode自体は
// Exercise View Phase 3Aでは参照しないため索引不要）。
export function buildBsmIndex(bsm) {
  const nodesById = new Map();
  for (const book of bsm.books) {
    const stack = [...book.structure];
    while (stack.length > 0) {
      const node = stack.pop();
      for (const child of node.children ?? []) stack.push(child);
      for (const cs of node.checkSections ?? []) {
        nodesById.set(cs.id, cs);
        const quStack = [...(cs.questionUnits ?? [])];
        while (quStack.length > 0) {
          const qu = quStack.pop();
          nodesById.set(qu.id, qu);
          for (const c of qu.children ?? []) quStack.push(c);
        }
      }
    }
  }
  return nodesById;
}

// 1. スキーマ適合（docs/exercise_view_schema_draft.jsonの必須フィールド・型）
export function validateSchemaShape(exerciseView) {
  const issues = [];
  const REQUIRED_EXERCISE_KEYS = [
    "exerciseId", "exerciseType", "sourceBookStructureIds", "sourceItemIds",
    "prompt", "body", "choices", "expectedAnswer", "judgement", "explanation",
    "generationRule", "eligibility", "ineligibilityReasons", "provenance",
  ];
  exerciseView.exercises.forEach((ex, i) => {
    const p = `exercises[${i}]`;
    for (const k of REQUIRED_EXERCISE_KEYS) {
      if (!(k in ex)) issues.push({ check: "schema-shape", path: `${p}.${k}`, detail: "missing" });
    }
    if (ex.prompt !== null && !isRawSpanRef(ex.prompt)) issues.push({ check: "schema-shape", path: `${p}.prompt`, detail: "malformed ExerciseViewRawSpanRef" });
    if (ex.body !== null && !isRawSpanRef(ex.body)) issues.push({ check: "schema-shape", path: `${p}.body`, detail: "malformed ExerciseViewRawSpanRef" });
    if (ex.choices !== null) issues.push({ check: "schema-shape", path: `${p}.choices`, detail: "choicesはnull以外を許容しない(Phase 3A)" });
    if (!Array.isArray(ex.expectedAnswer)) issues.push({ check: "schema-shape", path: `${p}.expectedAnswer`, detail: "配列でない" });
    else
      ex.expectedAnswer.forEach((a, j) => {
        if (typeof a.blankUnitId !== "string") issues.push({ check: "schema-shape", path: `${p}.expectedAnswer[${j}].blankUnitId`, detail: "missing/invalid" });
        if (!isRawSpanRef(a.answerText)) issues.push({ check: "schema-shape", path: `${p}.expectedAnswer[${j}].answerText`, detail: "malformed ExerciseViewRawSpanRef" });
      });
    if (ex.judgement !== null) {
      if (!isRawSpanRef(ex.judgement.symbolRaw)) issues.push({ check: "schema-shape", path: `${p}.judgement.symbolRaw`, detail: "malformed ExerciseViewRawSpanRef" });
      if (!isRawSpanRef(ex.judgement.answerBodyRaw)) issues.push({ check: "schema-shape", path: `${p}.judgement.answerBodyRaw`, detail: "malformed ExerciseViewRawSpanRef" });
    }
    if (ex.explanation !== null) {
      if (!isRawSpanRef(ex.explanation.raw)) issues.push({ check: "schema-shape", path: `${p}.explanation.raw`, detail: "malformed ExerciseViewRawSpanRef" });
      if (!("role" in ex.explanation)) issues.push({ check: "schema-shape", path: `${p}.explanation.role`, detail: "missing" });
    }
    if (!["eligible", "review_required", "ineligible"].includes(ex.eligibility)) {
      issues.push({ check: "schema-shape", path: `${p}.eligibility`, detail: `不正な値: ${ex.eligibility}` });
    }
    if (!ex.provenance || ex.provenance.sourceKind !== "book_structure_master") {
      issues.push({ check: "schema-shape", path: `${p}.provenance.sourceKind`, detail: "Phase 3Aでは常にbook_structure_masterでなければならない" });
    }
  });
  return issues;
}

// 2. 全ExerciseがsourceBookStructureIdsを1件以上持つこと
export function validateHasSourceBookStructureIds(exerciseView) {
  const issues = [];
  exerciseView.exercises.forEach((ex, i) => {
    if (!Array.isArray(ex.sourceBookStructureIds) || ex.sourceBookStructureIds.length === 0) {
      issues.push({ check: "missing-source-bsm-ids", path: `exercises[${i}]`, detail: ex.exerciseId });
    }
  });
  return issues;
}

// 3. 参照先BSM IDが実在すること
export function validateSourceBsmIdsExist(exerciseView, bsmNodesById) {
  const issues = [];
  exerciseView.exercises.forEach((ex, i) => {
    for (const id of ex.sourceBookStructureIds) {
      if (!bsmNodesById.has(id)) {
        issues.push({ check: "source-bsm-id-not-found", path: `exercises[${i}].sourceBookStructureIds`, detail: id });
      }
    }
  });
  return issues;
}

// 4. 教材原文一致（Exercise内のtext値がBSM側の該当RawSpan.textと完全一致）
export function validateVerbatimMatch(exerciseView, bsmNodesById) {
  const issues = [];
  function checkRef(ref, expectedField, path) {
    if (ref == null) return;
    const node = bsmNodesById.get(ref.bsmNodeId);
    if (!node) return; // check3が別途検出する
    const expected = expectedField(node);
    if (!expected || expected.text !== ref.text) {
      issues.push({ check: "verbatim-mismatch", path, detail: `bsmNodeId=${ref.bsmNodeId}` });
    }
  }
  exerciseView.exercises.forEach((ex, i) => {
    const p = `exercises[${i}]`;
    checkRef(ex.prompt, (n) => n.promptRaw, `${p}.prompt`);
    checkRef(ex.body, (n) => n.bodyRaw, `${p}.body`);
    ex.expectedAnswer.forEach((a, j) => checkRef(a.answerText, (n) => n.answer?.answerBodyRaw, `${p}.expectedAnswer[${j}].answerText`));
    if (ex.judgement) {
      checkRef(ex.judgement.symbolRaw, (n) => n.answer?.judgmentSymbolRaw, `${p}.judgement.symbolRaw`);
      checkRef(ex.judgement.answerBodyRaw, (n) => n.answer?.answerBodyRaw, `${p}.judgement.answerBodyRaw`);
    }
    if (ex.explanation) {
      checkRef(ex.explanation.raw, (n) => n.answer?.explanationRaw, `${p}.explanation.raw`);
      const node = bsmNodesById.get(ex.explanation.raw.bsmNodeId);
      if (node && (node.answer?.explanationRole?.code ?? null) !== ex.explanation.role) {
        issues.push({ check: "verbatim-mismatch", path: `${p}.explanation.role`, detail: `bsmNodeId=${ex.explanation.raw.bsmNodeId}` });
      }
    }
  });
  return issues;
}

// 5. expectedAnswerの出典追跡（各AnswerItemがsourceItemId・bsmNodeId・sourceを持つこと）
export function validateAnswerProvenance(exerciseView) {
  const issues = [];
  exerciseView.exercises.forEach((ex, i) => {
    ex.expectedAnswer.forEach((a, j) => {
      const p = `exercises[${i}].expectedAnswer[${j}]`;
      if (!a.sourceItemId) issues.push({ check: "answer-provenance-missing", path: `${p}.sourceItemId`, detail: "null" });
      if (!a.answerText?.bsmNodeId) issues.push({ check: "answer-provenance-missing", path: `${p}.answerText.bsmNodeId`, detail: "missing" });
      if (!a.answerText?.source?.documentId || !a.answerText?.source?.locator) {
        issues.push({ check: "answer-provenance-missing", path: `${p}.answerText.source`, detail: "missing" });
      }
    });
  });
  return issues;
}

// 6. 共有設問文の不要な重複なし: 同一大問(sourceBookStructureIds上の共通親id)を共有する
//    single_blank兄弟間で、inherited:trueのbody/promptが同一bsmNodeId・同一textであること
//    （それぞれが独立に新しいテキストとして複製されていないこと）
export function validateSharedPromptNoRedundantDuplication(exerciseView) {
  const issues = [];
  const singleBlanks = exerciseView.exercises.filter((e) => e.exerciseType === "single_blank");
  const byParent = new Map();
  for (const ex of singleBlanks) {
    // sourceBookStructureIds = [checkSectionId, majorUnitId, leafId] という構築順序を前提とする
    const majorUnitId = ex.sourceBookStructureIds[1];
    if (!byParent.has(majorUnitId)) byParent.set(majorUnitId, []);
    byParent.get(majorUnitId).push(ex);
  }
  for (const [majorUnitId, group] of byParent) {
    const inheritedBodies = group.map((ex) => ex.body).filter((b) => b && b.inherited);
    if (inheritedBodies.length === 0) continue;
    const first = inheritedBodies[0];
    for (const b of inheritedBodies) {
      if (b.bsmNodeId !== majorUnitId) {
        issues.push({ check: "shared-prompt-wrong-source", path: `majorUnitId=${majorUnitId}`, detail: `bsmNodeId=${b.bsmNodeId}` });
      }
      if (b.text !== first.text) {
        issues.push({ check: "shared-prompt-inconsistent-duplication", path: `majorUnitId=${majorUnitId}`, detail: "継承されたbody.textが兄弟間で不一致" });
      }
    }
  }
  return issues;
}

// 7. multi_blankとsingle_blankが同一BSM部分木（同じ大問QuestionUnit id）から生成されていること
export function validateMultiAndSingleBlankSameSubtree(exerciseView) {
  const issues = [];
  const multiBlanks = exerciseView.exercises.filter((e) => e.exerciseType === "multi_blank");
  const singleBlanksByParent = new Set(
    exerciseView.exercises.filter((e) => e.exerciseType === "single_blank").map((e) => e.sourceBookStructureIds[1])
  );
  for (const mb of multiBlanks) {
    const majorUnitId = mb.sourceBookStructureIds[1];
    if (!singleBlanksByParent.has(majorUnitId)) {
      issues.push({ check: "multi-single-subtree-mismatch", path: `multi_blank=${mb.exerciseId}`, detail: `majorUnitId=${majorUnitId}に対応するsingle_blankが存在しない` });
    }
  }
  return issues;
}

// 8. trueFalseのjudgementとexplanationが混在していないこと
export function validateTrueFalseFieldsNotMixed(exerciseView) {
  const issues = [];
  exerciseView.exercises
    .filter((e) => e.exerciseType === "true_false")
    .forEach((ex) => {
      if (ex.expectedAnswer.length !== 0) {
        issues.push({ check: "truefalse-expectedanswer-not-empty", path: ex.exerciseId, detail: "true_falseはexpectedAnswerを使用しない設計であるため空でなければならない" });
      }
      if (ex.judgement) {
        if (ex.explanation && ex.explanation.raw.text === ex.judgement.symbolRaw.text) {
          issues.push({ check: "truefalse-judgement-explanation-mixed", path: ex.exerciseId, detail: "explanation.rawがjudgement.symbolRawと同一値" });
        }
      }
    });
  return issues;
}

// 9. 自動演習化禁止データがeligible=trueな内容付きExerciseとして出力されていないこと
export function validateIneligibleNotExposedAsEligible(exerciseView, anomaliesByUnitId) {
  const issues = [];
  exerciseView.exercises.forEach((ex) => {
    const hasIneligibleAnomaly = ex.sourceBookStructureIds.some((id) =>
      (anomaliesByUnitId.get(id) ?? []).some((a) => INELIGIBLE_CATEGORIES_FOR_REPORT.has(a.category))
    );
    if (hasIneligibleAnomaly && ex.eligibility === "eligible") {
      issues.push({ check: "ineligible-exposed-as-eligible", path: ex.exerciseId, detail: "禁止カテゴリの異常を持つがeligible=eligibleになっている" });
    }
    if (ex.eligibility !== "eligible") {
      if (ex.expectedAnswer.length !== 0) issues.push({ check: "non-eligible-has-answer", path: ex.exerciseId, detail: "expectedAnswerが空でない" });
      if (ex.judgement !== null) issues.push({ check: "non-eligible-has-judgement", path: ex.exerciseId, detail: "judgementがnullでない" });
      if (ex.ineligibilityReasons.length === 0) issues.push({ check: "non-eligible-missing-reasons", path: ex.exerciseId, detail: "ineligibilityReasonsが空" });
    } else if (ex.ineligibilityReasons.length !== 0) {
      issues.push({ check: "eligible-has-reasons", path: ex.exerciseId, detail: "eligible=eligibleなのにineligibilityReasonsが空でない" });
    }
  });
  return issues;
}

// 10. review_required対象が明示されていること
export function validateReviewRequiredExposed(exerciseView, anomaliesByUnitId) {
  const issues = [];
  exerciseView.exercises.forEach((ex) => {
    const hasReviewAnomaly = ex.sourceBookStructureIds.some((id) =>
      (anomaliesByUnitId.get(id) ?? []).some((a) => REVIEW_REQUIRED_CATEGORIES_FOR_REPORT.has(a.category))
    );
    const hasIneligibleAnomaly = ex.sourceBookStructureIds.some((id) =>
      (anomaliesByUnitId.get(id) ?? []).some((a) => INELIGIBLE_CATEGORIES_FOR_REPORT.has(a.category))
    );
    if (hasReviewAnomaly && !hasIneligibleAnomaly && ex.eligibility !== "review_required") {
      issues.push({ check: "review-required-not-exposed", path: ex.exerciseId, detail: `eligibility=${ex.eligibility}` });
    }
  });
  return issues;
}

// 11. 推測で生成した値がないこと
export function validateNoGuessedValues(exerciseView, bsmNodesById) {
  const issues = [];
  exerciseView.exercises.forEach((ex) => {
    if (ex.choices !== null) issues.push({ check: "guessed-choices", path: ex.exerciseId, detail: "choicesは常にnullのはず" });
    if (ex.explanation) {
      const node = bsmNodesById.get(ex.explanation.raw.bsmNodeId);
      const bsmRole = node?.answer?.explanationRole?.code ?? null;
      if (bsmRole === null && ex.explanation.role !== null) {
        issues.push({ check: "guessed-explanation-role", path: ex.exerciseId, detail: "BSM側がnullなのにroleを埋めている" });
      }
    }
    // promptRawがBSM側でnullなノードから、bodyRawの値を推測コピーしていないこと
    if (ex.prompt) {
      const node = bsmNodesById.get(ex.prompt.bsmNodeId);
      if (node && node.promptRaw == null) {
        issues.push({ check: "guessed-prompt-from-body", path: ex.exerciseId, detail: `bsmNodeId=${ex.prompt.bsmNodeId}のpromptRawはnullのはず` });
      }
    }
  });
  return issues;
}

// 15. sourceItemIdsの取得が互換helper(src/exerciseView/sourceRef.mjs)を経由しており、
//     他のExercise Viewモジュールが非スキーマ項目を直接参照していないこと
const RAW_ITEM_ID_FIELD = ["_", "sourceItemId"].join(""); // 検出対象の文字列を組み立てて保持する（このファイル自身が誤検出されないようにするため）
export function validateSourceItemIdAccessIsolated(exerciseViewDir) {
  const issues = [];
  // sourceRef.mjs=正規の格納場所。validator.mjs=本チェック自身(検出対象の文字列を保持するため除外する)
  const allowedFiles = new Set(["sourceRef.mjs", "validator.mjs"]);
  for (const entry of readdirSync(exerciseViewDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".mjs") || allowedFiles.has(entry.name)) continue;
    const content = readFileSync(path.join(exerciseViewDir, entry.name), "utf8");
    if (content.includes(RAW_ITEM_ID_FIELD)) {
      issues.push({ check: "sourceitemid-not-isolated", path: entry.name, detail: `${RAW_ITEM_ID_FIELD}を直接参照している` });
    }
  }
  return issues;
}

// 16. existing_unit_equivalent・KM由来データがExercise View本体(exercises配列)へ混入していないこと
export function validateNoKmBaselineMixedIn(exerciseView) {
  const issues = [];
  exerciseView.exercises.forEach((ex) => {
    if (ex.exerciseType === "existing_unit_equivalent") {
      issues.push({ check: "km-baseline-mixed-in", path: ex.exerciseId, detail: "existing_unit_equivalentはPhase 3Aでは生成しない設計のはず" });
    }
    if (ex.provenance.sourceKind !== "book_structure_master") {
      issues.push({ check: "km-baseline-mixed-in", path: ex.exerciseId, detail: `sourceKind=${ex.provenance.sourceKind}` });
    }
  });
  return issues;
}

// 17. 同一入力で再生成した場合、generatedAtを除きExercise Viewが決定論的に一致すること
// (v1のwithheldExercises配列にも対応。配列が存在しない場合(Phase 3Aの旧形状)は空配列扱いにする)
export function validateDeterminism(resultA, resultB) {
  const strip = (r) => {
    const clone = JSON.parse(JSON.stringify(r));
    delete clone.meta.generatedAt;
    for (const ex of clone.exercises ?? []) delete ex.provenance.generatedAt;
    for (const ex of clone.withheldExercises ?? []) delete ex.provenance.generatedAt;
    return clone;
  };
  const a = JSON.stringify(strip(resultA));
  const b = JSON.stringify(strip(resultB));
  if (a !== b) return [{ check: "non-deterministic-output", path: "exerciseView", detail: "generatedAtを除いた内容が再生成間で一致しない" }];
  return [];
}

// ============================================================
// 以下、Phase 3B-1（docs/exercise_view_spec_v1.md / docs/exercise_view_schema_v1.json）
// 向けの追加検証。exercises/withheldExercises 2配列構造を前提とする。
// 既存(Phase 3A)の検証関数群は変更せず、そのまま残す（output/exercise_view_phase3a.jsonは
// 試作記録として引き続きこれらで検証可能な形のまま）。
// ============================================================

function isRawSpanRefV1(v) {
  return isRawSpanRef(v);
}

// v1-1. スキーマ適合(docs/exercise_view_schema_v1.json準拠)。
// exercisesは常にeligibility="eligible"・ineligibilityReasons=[]、
// withheldExercisesは常にeligibility∈{"review_required","ineligible"}・expectedAnswer=[]・judgement=null・ineligibilityReasons.length>=1
// であることをスキーマレベルで確認する。
export function validateSchemaShapeV1(exerciseView) {
  const issues = [];
  if (!exerciseView.meta || exerciseView.meta.schemaVersion !== "exercise-view-schema-v1.6.0") {
    issues.push({ check: "schema-shape-v1", path: "meta.schemaVersion", detail: `想定外の値: ${exerciseView.meta?.schemaVersion}` });
  }
  if (exerciseView.meta?.exerciseCount !== exerciseView.exercises.length) {
    issues.push({ check: "schema-shape-v1", path: "meta.exerciseCount", detail: "exercises.lengthと不一致" });
  }
  if (exerciseView.meta?.withheldExerciseCount !== exerciseView.withheldExercises.length) {
    issues.push({ check: "schema-shape-v1", path: "meta.withheldExerciseCount", detail: "withheldExercises.lengthと不一致" });
  }

  function checkCommon(ex, p) {
    for (const k of [
      "exerciseId", "exerciseType", "sourceBookStructureIds", "sourceItemIds", "stableItemIds", "contentFingerprints",
      "prompt", "body", "choices", "expectedAnswer", "judgement", "explanation", "answerForm", "withheldAnswerContent",
      "structureType", "subQuestions", "bodySegments",
      "generationRule", "eligibility", "ineligibilityReasons", "provenance", "reviewOverride",
    ]) {
      if (!(k in ex)) issues.push({ check: "schema-shape-v1", path: `${p}.${k}`, detail: "missing" });
    }
    if (Array.isArray(ex.stableItemIds) && Array.isArray(ex.sourceItemIds) && ex.stableItemIds.length !== ex.sourceItemIds.length) {
      issues.push({ check: "schema-shape-v1", path: `${p}.stableItemIds`, detail: "sourceItemIdsと件数が一致しない(F2/v1.1.0)" });
    }
    if (ex.reviewOverride !== null && ex.reviewOverride?.applied !== true) {
      issues.push({ check: "schema-shape-v1", path: `${p}.reviewOverride`, detail: "null以外の場合はapplied:trueでなければならない(F4/v1.2.0)" });
    }
    if (ex.reviewOverride !== null && ex.exerciseType === "multi_blank") {
      issues.push({ check: "schema-shape-v1", path: `${p}.reviewOverride`, detail: "multi_blankはreviewOverride適用対象外のためnullでなければならない(F4/v1.2.0)" });
    }
    if (ex.prompt !== null && !isRawSpanRefV1(ex.prompt)) issues.push({ check: "schema-shape-v1", path: `${p}.prompt`, detail: "malformed" });
    if (ex.body !== null && !isRawSpanRefV1(ex.body)) issues.push({ check: "schema-shape-v1", path: `${p}.body`, detail: "malformed" });
    if (ex.choices !== null) issues.push({ check: "schema-shape-v1", path: `${p}.choices`, detail: "nullでなければならない" });
    if (!ex.provenance || ex.provenance.sourceKind !== "book_structure_master") {
      issues.push({ check: "schema-shape-v1", path: `${p}.provenance.sourceKind`, detail: "book_structure_masterでなければならない" });
    }
  }

  exerciseView.exercises.forEach((ex, i) => {
    const p = `exercises[${i}]`;
    checkCommon(ex, p);
    if (ex.eligibility !== "eligible") issues.push({ check: "schema-shape-v1", path: `${p}.eligibility`, detail: `exercises配列はeligibleのみ: ${ex.eligibility}` });
    if ((ex.ineligibilityReasons ?? []).length !== 0) issues.push({ check: "schema-shape-v1", path: `${p}.ineligibilityReasons`, detail: "eligible配列なのに空でない" });
  });

  exerciseView.withheldExercises.forEach((ex, i) => {
    const p = `withheldExercises[${i}]`;
    checkCommon(ex, p);
    if (!["review_required", "ineligible"].includes(ex.eligibility)) {
      issues.push({ check: "schema-shape-v1", path: `${p}.eligibility`, detail: `withheldExercises配列に不正な値: ${ex.eligibility}` });
    }
    if ((ex.expectedAnswer ?? []).length !== 0) issues.push({ check: "schema-shape-v1", path: `${p}.expectedAnswer`, detail: "空でなければならない" });
    if (ex.judgement !== null) issues.push({ check: "schema-shape-v1", path: `${p}.judgement`, detail: "nullでなければならない" });
    if ((ex.ineligibilityReasons ?? []).length === 0) issues.push({ check: "schema-shape-v1", path: `${p}.ineligibilityReasons`, detail: "1件以上でなければならない" });
  });

  return issues;
}

// v1-2. exerciseIdの重複がないこと(exercises/withheldExercises通算)
export function validateNoDuplicateExerciseIds(exerciseView) {
  const issues = [];
  const seen = new Set();
  for (const ex of [...exerciseView.exercises, ...exerciseView.withheldExercises]) {
    if (seen.has(ex.exerciseId)) {
      issues.push({ check: "duplicate-exercise-id", path: ex.exerciseId, detail: "重複するexerciseId" });
    }
    seen.add(ex.exerciseId);
  }
  return issues;
}

// v1-3. exercises配列に含まれるExerciseが、BSM異常検出上ineligible/review_required対象になる
//       ユニットを参照していないこと(誤って安全でないExerciseがexercises配列へ混入しないこと)
export function validateNoWithheldCategoryInExercisesArray(exerciseView, anomaliesByUnitId) {
  const issues = [];
  for (const ex of exerciseView.exercises) {
    const hasBlocking = ex.sourceBookStructureIds.some((id) =>
      (anomaliesByUnitId.get(id) ?? []).some(
        (a) => INELIGIBLE_CATEGORIES_FOR_REPORT.has(a.category) || REVIEW_REQUIRED_CATEGORIES_FOR_REPORT.has(a.category)
      )
    );
    if (hasBlocking) {
      issues.push({ check: "withheld-category-in-exercises-array", path: ex.exerciseId, detail: "禁止/レビュー対象カテゴリの異常を持つがexercises配列に含まれている" });
    }
  }
  return issues;
}

// v1-5. 全Item網羅性: Intermediate JSON上の全Item idが、exercises/withheldExercisesの
//       いずれかのsourceItemIdsに最低1回は出現すること(欠落なく可視化されていること)。
//       生成失敗(generationFailures)により対象外になったIDは、ここでは除外せずそのまま欠落として
//       検出する(欠落の理由がgenerationFailuresで説明できるかどうかは、CLI側で突き合わせる)。
export function validateFullItemCoverage(exerciseView, { allItemIds }) {
  const covered = new Set();
  for (const ex of [...exerciseView.exercises, ...exerciseView.withheldExercises]) {
    for (const id of ex.sourceItemIds) covered.add(id);
  }
  const issues = [];
  for (const id of allItemIds) {
    if (!covered.has(id)) issues.push({ check: "item-not-covered", path: id, detail: "exercises/withheldExercisesのいずれにも出現しない" });
  }
  return issues;
}

// v1-4. review_required対象がwithheldExercises配列に明示されていること(ineligibleに埋もれていないこと)
export function validateReviewRequiredInWithheldArray(exerciseView, anomaliesByUnitId) {
  const issues = [];
  for (const ex of [...exerciseView.exercises, ...exerciseView.withheldExercises]) {
    const hasReview = ex.sourceBookStructureIds.some((id) => (anomaliesByUnitId.get(id) ?? []).some((a) => REVIEW_REQUIRED_CATEGORIES_FOR_REPORT.has(a.category)));
    const hasIneligible = ex.sourceBookStructureIds.some((id) => (anomaliesByUnitId.get(id) ?? []).some((a) => INELIGIBLE_CATEGORIES_FOR_REPORT.has(a.category)));
    if (hasReview && !hasIneligible && ex.eligibility !== "review_required") {
      issues.push({ check: "review-required-not-in-withheld-array", path: ex.exerciseId, detail: `eligibility=${ex.eligibility}` });
    }
  }
  return issues;
}

// v1-5. Item ID正式化(F2): ExerciseのstableItemIdsが、参照元BSMノードのprovenance.stableItemIdと
// 一致すること(Exercise View側の配線に誤りが無いことのクロスチェック)。
// F4(docs/exercise_view_f4_review_reflection_report.md、レビュー結果の反映機構)。
// 実際に生成されたExercise Viewのreview Override状態が、resolveApplicableOverrides(BSM+決定ログから
// 独立に計算した「適用してよい判断」)と完全に一致するかを再確認する、防御的な二重チェック。
// build-drill-csv.mjsの安全確認ゲートに組み込み、承認されていないItemが誤ってeligible化されて
// いないこと・逆に承認されたItemが取りこぼされていないことの両方を検出する(fail-closed)。
export function validateReviewOverrideConsistency(exerciseView, applicableOverrides) {
  const issues = [];
  let appliedCount = 0;
  for (const ex of [...exerciseView.exercises, ...exerciseView.withheldExercises]) {
    if (ex.reviewOverride === null) continue;
    appliedCount += 1;
    if (ex.exerciseType === "multi_blank") {
      issues.push({ check: "review-override-consistency", path: ex.exerciseId, detail: "multi_blankにreviewOverrideが適用されている(適用対象外のはず)" });
      continue;
    }
    if (ex.eligibility !== "eligible") {
      issues.push({ check: "review-override-consistency", path: ex.exerciseId, detail: "reviewOverride適用済みなのにeligibleでない" });
    }
    const stableItemId = ex.reviewOverride.stableItemId;
    const decision = applicableOverrides.get(stableItemId);
    if (!decision) {
      issues.push({
        check: "review-override-consistency",
        path: ex.exerciseId,
        detail: `stableItemId=${stableItemId}はresolveApplicableOverridesの適用可能一覧に存在しない(未承認のoverrideが適用された疑い)`,
      });
      continue;
    }
    if (
      decision.reviewedAt !== ex.reviewOverride.decisionReviewedAt ||
      decision.reviewedBy !== ex.reviewOverride.decisionReviewedBy ||
      decision.reasonCode !== ex.reviewOverride.decisionReasonCode
    ) {
      issues.push({ check: "review-override-consistency", path: ex.exerciseId, detail: "reviewOverrideの内容が決定ログの該当レコードと一致しない" });
    }
  }
  if (appliedCount !== applicableOverrides.size) {
    issues.push({
      check: "review-override-consistency",
      path: "(summary)",
      detail: `適用されたreviewOverride件数(${appliedCount})がresolveApplicableOverridesの適用可能件数(${applicableOverrides.size})と一致しない`,
    });
  }
  return issues;
}

// v2-1(answerFormデータ契約、docs/v2_1_data_contract_investigation.md)。
// answerFormが、buildExerciseView.mjsの生成ロジックとは独立に、BSM側のparsed.unitKind.codeから
// 再計算した期待値と一致することを確認する(validateStableItemIdsMatchBsmと同じ、独立再検証の考え方)。
// true_falseは常にnullでなければならない(意図的に伝播しない設計)。
export function validateAnswerFormMatchesUnitKind(exerciseView, bsmNodesById) {
  const issues = [];
  for (const ex of [...exerciseView.exercises, ...exerciseView.withheldExercises]) {
    const p = ex.exerciseId;
    if (ex.exerciseType === "true_false") {
      if (ex.answerForm !== null) {
        issues.push({ check: "answer-form-mismatch", path: p, detail: `true_falseはanswerForm=nullのはずだが実際は${ex.answerForm}` });
      }
      continue;
    }
    if (ex.exerciseType === "single_blank") {
      const leafId = ex.sourceBookStructureIds[ex.sourceBookStructureIds.length - 1];
      const expected = bsmNodesById.get(leafId)?.parsed?.unitKind?.code ?? null;
      if (ex.answerForm !== expected) {
        issues.push({ check: "answer-form-mismatch", path: p, detail: `BSM側unitKind.code=${expected}だがanswerForm=${ex.answerForm}` });
      }
      continue;
    }
    if (ex.exerciseType === "multi_blank") {
      const leafIds = ex.sourceBookStructureIds.slice(2);
      const kinds = leafIds.map((id) => bsmNodesById.get(id)?.parsed?.unitKind?.code ?? null);
      const uniqueKinds = Array.from(new Set(kinds));
      const expected = kinds.some((k) => k == null) || uniqueKinds.length !== 1 ? null : uniqueKinds[0];
      if (ex.answerForm !== expected) {
        issues.push({ check: "answer-form-mismatch", path: p, detail: `BSM側から導出した期待値=${expected}だがanswerForm=${ex.answerForm}` });
      }
    }
  }
  return issues;
}

// v2-4準備(withheldAnswerContent診断フィールド、docs/v2_4_prep_investigation.md)。
// buildExerciseView.mjsの生成ロジックとは独立に、BSM側のanswerから再計算した期待値と
// withheldAnswerContentが一致することを確認する(validateAnswerFormMatchesUnitKindと同じ、
// 独立再検証の考え方)。
// - eligible(exercises配列)は常にnullでなければならない(真の解答は既にexpectedAnswer/judgement/
//   explanationで表現されているため)。
// - multi_blankは常にnullでなければならない(複数leaf集約のため今回は未対応)。
// - single_blank/true_falseのwithheld項目は、対応するBSM leafのanswerから再計算した
//   judgmentSymbolRaw/answerBodyRaw/explanationRaw/explanationRoleと一致しなければならない。
//   BSM leaf.answerがnull(missing_answer)の場合は、withheldAnswerContentもnullでなければならない
//   (欠落データが安全にnullとなることの確認)。
export function validateWithheldAnswerContentConsistency(exerciseView, bsmNodesById) {
  const issues = [];

  function expectedFor(leafId) {
    const node = bsmNodesById.get(leafId);
    const answer = node?.answer ?? null;
    if (!answer) return null;
    return {
      judgmentSymbolRaw: answer.judgmentSymbolRaw != null ? answer.judgmentSymbolRaw.text : null,
      answerBodyRaw: answer.answerBodyRaw != null ? answer.answerBodyRaw.text : null,
      explanationRaw: answer.explanationRaw != null ? answer.explanationRaw.text : null,
      explanationRole: answer.explanationRole?.code ?? null,
    };
  }
  function actualFor(wac) {
    if (!wac) return null;
    return {
      judgmentSymbolRaw: wac.judgmentSymbolRaw != null ? wac.judgmentSymbolRaw.text : null,
      answerBodyRaw: wac.answerBodyRaw != null ? wac.answerBodyRaw.text : null,
      explanationRaw: wac.explanationRaw != null ? wac.explanationRaw.text : null,
      explanationRole: wac.explanationRole ?? null,
    };
  }
  function equalOrBothNull(a, b) {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  for (const ex of exerciseView.exercises) {
    if (ex.withheldAnswerContent !== null) {
      issues.push({ check: "withheld-answer-content-mismatch", path: ex.exerciseId, detail: "eligibleなのにwithheldAnswerContentがnullでない" });
    }
  }

  for (const ex of exerciseView.withheldExercises) {
    const p = ex.exerciseId;
    if (ex.exerciseType === "multi_blank") {
      if (ex.withheldAnswerContent !== null) {
        issues.push({ check: "withheld-answer-content-mismatch", path: p, detail: "multi_blankはwithheldAnswerContent=nullのはずだがnullでない" });
      }
      continue;
    }
    if (ex.exerciseType !== "single_blank" && ex.exerciseType !== "true_false") continue;
    const leafId = ex.sourceBookStructureIds[ex.sourceBookStructureIds.length - 1];
    const expected = expectedFor(leafId);
    const actual = actualFor(ex.withheldAnswerContent);
    if (!equalOrBothNull(expected, actual)) {
      issues.push({
        check: "withheld-answer-content-mismatch",
        path: p,
        detail: `BSM側から再計算した期待値と一致しない(expected=${JSON.stringify(expected)}, actual=${JSON.stringify(actual)})`,
      });
    }
  }

  return issues;
}

export function validateStableItemIdsMatchBsm(exerciseView, bsmNodesById) {
  const issues = [];
  for (const ex of [...exerciseView.exercises, ...exerciseView.withheldExercises]) {
    for (const id of ex.sourceBookStructureIds) {
      const node = bsmNodesById.get(id);
      const expected = node?.provenance?.stableItemId;
      if (expected && !ex.stableItemIds.includes(expected)) {
        issues.push({
          check: "stable-item-id-not-reflected-in-exercise",
          path: ex.exerciseId,
          detail: `BSMノード${id}のprovenance.stableItemId(${expected})がExercise.stableItemIdsに含まれない`,
        });
      }
    }
  }
  return issues;
}

// v1.5.0(Phase 1、docs/phase1_multiblank_31_structural_investigation.md)。
// multi_blankのstructureType/subQuestionsが、意図した条件下でのみ・意図した形で
// 生成されていることを独立に再確認する(buildExerciseView.mjs自身のロジックとは別の検証)。
// subQuestionsが想定外のExerciseに付与された場合は、fail closedとして報告する。
export function validateMultiBlankSubQuestions(exerciseView) {
  const issues = [];
  for (const ex of [...exerciseView.exercises, ...exerciseView.withheldExercises]) {
    if (ex.exerciseType !== "multi_blank") {
      if (ex.structureType !== null || ex.subQuestions !== null) {
        issues.push({ check: "structureType-subquestions-not-null-for-non-multiblank", path: ex.exerciseId, detail: `exerciseType=${ex.exerciseType}` });
      }
    }
  }
  for (const ex of exerciseView.exercises) {
    if (ex.exerciseType !== "multi_blank") continue;
    const p = ex.exerciseId;

    if (!["shared_body_blanks", "independent_subquestions", "unknown"].includes(ex.structureType)) {
      issues.push({ check: "multiblank-structureType-invalid", path: p, detail: `想定外のstructureType: ${ex.structureType}` });
    }

    if (ex.structureType !== "independent_subquestions") {
      if (ex.subQuestions !== null) {
        issues.push({ check: "multiblank-subquestions-unexpected", path: p, detail: `structureType=${ex.structureType}なのにsubQuestionsが非null` });
      }
      continue;
    }

    if (ex.subQuestions === null) {
      issues.push({ check: "multiblank-subquestions-missing", path: p, detail: "structureType=independent_subquestionsなのにsubQuestionsがnull" });
      continue;
    }

    if (ex.subQuestions.length !== ex.expectedAnswer.length) {
      issues.push({
        check: "multiblank-subquestions-count-mismatch",
        path: p,
        detail: `subQuestions(${ex.subQuestions.length}件)とexpectedAnswer(${ex.expectedAnswer.length}件)の件数が一致しない`,
      });
    }

    ex.subQuestions.forEach((sq, i) => {
      const sqp = `${p}.subQuestions[${i}]`;
      if (sq.order !== i + 1) {
        issues.push({ check: "multiblank-subquestions-order-invalid", path: sqp, detail: `order=${sq.order}、配列位置は${i + 1}番目` });
      }
      if (typeof sq.body?.text !== "string" || sq.body.text.trim().length === 0) {
        issues.push({ check: "multiblank-subquestions-body-empty", path: sqp, detail: "bodyが空" });
      }
      if (typeof sq.expectedAnswer?.text !== "string" || sq.expectedAnswer.text.trim().length === 0) {
        issues.push({ check: "multiblank-subquestions-answer-empty", path: sqp, detail: "expectedAnswerが空" });
      }
      const counterpart = ex.expectedAnswer[i];
      if (counterpart) {
        if (sq.sourceItemId !== counterpart.sourceItemId) {
          issues.push({ check: "multiblank-subquestions-sourceItemId-mismatch", path: sqp, detail: `subQuestions=${sq.sourceItemId} / expectedAnswer=${counterpart.sourceItemId}` });
        }
        if (sq.stableItemId !== counterpart.stableItemId) {
          issues.push({ check: "multiblank-subquestions-stableItemId-mismatch", path: sqp, detail: `subQuestions=${sq.stableItemId} / expectedAnswer=${counterpart.stableItemId}` });
        }
        if (sq.expectedAnswer?.text !== counterpart.answerText?.text) {
          issues.push({
            check: "multiblank-subquestions-answerText-mismatch",
            path: sqp,
            detail: `subQuestions.expectedAnswer.text(${sq.expectedAnswer?.text})とexpectedAnswer[${i}].answerText.text(${counterpart.answerText?.text})が一致しない`,
          });
        }
      }
    });
  }

  // withheldExercisesのmulti_blankは、expectedAnswer同様subQuestionsも常にnullでなければならない。
  for (const ex of exerciseView.withheldExercises) {
    if (ex.exerciseType === "multi_blank" && ex.subQuestions !== null) {
      issues.push({ check: "multiblank-subquestions-leaked-in-withheld", path: ex.exerciseId, detail: "withheldExercisesなのにsubQuestionsが非null" });
    }
  }

  return issues;
}

// v1.6.0(docs/phase2c_blank_position_schema_design.md)。bodySegmentsが、意図した条件下でのみ・
// 意図した形で生成されていることを独立に再確認する(buildExerciseView.mjs自身の生成時
// 自己検証＝buildBodySegments内のreturn nullロジックとは別の、生成後の検証)。
export function validateBodySegments(exerciseView) {
  const issues = [];
  for (const ex of [...exerciseView.exercises, ...exerciseView.withheldExercises]) {
    const p = ex.exerciseId;
    if (ex.exerciseType !== "multi_blank") {
      if (ex.bodySegments !== null) {
        issues.push({ check: "bodysegments-not-null-for-non-multiblank", path: p, detail: `exerciseType=${ex.exerciseType}` });
      }
      continue;
    }
    const isEligibleSharedBody = exerciseView.exercises.includes(ex) && ex.structureType === "shared_body_blanks";
    if (!isEligibleSharedBody) {
      if (ex.bodySegments !== null) {
        issues.push({ check: "bodysegments-unexpected", path: p, detail: `structureType=${ex.structureType}, eligibility=${ex.eligibility}なのにbodySegmentsが非null` });
      }
      continue;
    }

    if (ex.bodySegments === null) {
      issues.push({ check: "bodysegments-missing", path: p, detail: "structureType=shared_body_blanksかつeligibleなのにbodySegmentsがnull" });
      continue;
    }
    if (!Array.isArray(ex.bodySegments) || ex.bodySegments.length === 0) {
      issues.push({ check: "bodysegments-empty", path: p, detail: "bodySegmentsが配列でないか空" });
      continue;
    }

    // text連結+blankラベル差し込みで、元のbody.textを完全に再構成できることを確認する。
    const reconstructed = ex.bodySegments
      .map((s) => {
        if (s.type === "text") return typeof s.text === "string" ? s.text : "";
        if (s.type === "blank") return typeof s.label === "string" ? s.label : "";
        return null;
      })
      .join("");
    if (ex.bodySegments.some((s) => s.type !== "text" && s.type !== "blank")) {
      issues.push({ check: "bodysegments-invalid-type", path: p, detail: "text/blank以外のtypeが含まれる" });
    }
    if (reconstructed !== ex.body?.text) {
      issues.push({ check: "bodysegments-reconstruction-mismatch", path: p, detail: "text/blankセグメントの連結結果がbody.textと一致しない" });
    }

    const blankSegments = ex.bodySegments.filter((s) => s.type === "blank");
    if (blankSegments.length !== ex.expectedAnswer.length) {
      issues.push({
        check: "bodysegments-blank-count-mismatch",
        path: p,
        detail: `blankセグメント数(${blankSegments.length})とexpectedAnswer件数(${ex.expectedAnswer.length})が一致しない`,
      });
    }
    const blankUnitIds = blankSegments.map((s) => s.blankUnitId);
    if (new Set(blankUnitIds).size !== blankUnitIds.length) {
      issues.push({ check: "bodysegments-blankUnitId-duplicate", path: p, detail: "blankUnitIdに重複がある" });
    }
    blankSegments.forEach((s, i) => {
      const counterpart = ex.expectedAnswer[i];
      if (!counterpart || s.blankUnitId !== counterpart.blankUnitId) {
        issues.push({
          check: "bodysegments-blankUnitId-order-mismatch",
          path: `${p}.bodySegments(blank[${i}])`,
          detail: `blankUnitId=${s.blankUnitId} / expectedAnswer[${i}].blankUnitId=${counterpart?.blankUnitId}`,
        });
      }
      if (typeof s.blankId !== "string" || typeof s.label !== "string" || typeof s.order !== "number") {
        issues.push({ check: "bodysegments-blank-shape-invalid", path: `${p}.bodySegments(blank[${i}])`, detail: "blankId/label/orderの型が不正" });
      }
      if (s.order !== i + 1) {
        issues.push({ check: "bodysegments-blank-order-invalid", path: `${p}.bodySegments(blank[${i}])`, detail: `order=${s.order}、配列上の位置は${i + 1}番目` });
      }
    });
  }
  return issues;
}
