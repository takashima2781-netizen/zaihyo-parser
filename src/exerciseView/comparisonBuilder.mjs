// 既存Knowledge Master v0.6（output/knowledge_master_full_scan.json、凍結・実使用中）を
// 読み取り専用の比較対象として直接読み込み、Exercise View生成結果とItemごとに突き合わせる。
//
// 設計上の方針（ユーザー指示、Option B）:
// 既存KM由来のデータはExercise View本体（exercises配列）には一切混入させない。
// 比較結果はこのモジュールの出力（比較行の配列）としてのみ存在し、
// output/exercise_view_phase3a_comparison.csv へ書き出す。
// Exercise ViewのsourceKindは常に"book_structure_master"であり、
// KM由来のExerciseオブジェクト（exerciseType: "existing_unit_equivalent"）はPhase 3Aでは生成しない。

const DIFF_CATEGORIES = {
  INPUT_DATA_SHORTAGE: "入力データ不足",
  MANUAL_JUDGEMENT_NEEDED: "手動判断が必要",
  INTENTIONAL_IMPROVEMENT: "BSM構造を活用した意図的改善",
  KM_COMPAT_DIFF: "KM互換性差",
  REPRESENTATION_ONLY: "表現上の差のみ",
  GENERATION_RULE_BUG: "生成ルールの不具合",
};

function indexById(list) {
  return new Map(list.map((x) => [x.id, x]));
}

function kmQuestionForItem(km, itemId) {
  return km.questions.find((q) => q.itemId === itemId) ?? null;
}

function kmPromptTextForQuestion(question, evidenceById) {
  if (!question) return null;
  return question.promptEvidenceIds.map((id) => evidenceById.get(id)?.excerpt ?? "").join("");
}

function kmAnswerTextForQuestion(question, km, evidenceById) {
  if (!question) return null;
  const answerUnitById = indexById(km.answerUnits);
  return question.answerUnitIds
    .map((auId) => evidenceById.get(answerUnitById.get(auId)?.evidenceId)?.excerpt ?? "")
    .join("／");
}

function kmExplanationTextForItem(km, itemId) {
  const ev = km.evidence.find((e) => e.itemId === itemId && e.kind === "explanation");
  return ev?.excerpt ?? null;
}

// Exercise View生成結果から、Item単位の「代表Exercise」（single_blankまたはtrue_false）を選ぶ。
// multi_blankは複数Itemにまたがるため、Item単位比較の代表としては使わない
// （multi_blankへの参加自体は newCapabilityInEv として別途記録する）。
function primaryExerciseForItem(exercises, itemId) {
  const candidates = exercises.filter(
    (e) => (e.exerciseType === "single_blank" || e.exerciseType === "true_false") && e.sourceItemIds.includes(itemId)
  );
  return candidates[0] ?? null;
}

function evAnswerTextOf(exercise) {
  if (!exercise) return null;
  if (exercise.judgement) return exercise.judgement.answerBodyRaw.text;
  if (exercise.expectedAnswer.length > 0) return exercise.expectedAnswer.map((a) => a.answerText.text).join("／");
  return null;
}

export function buildComparisonRows(exerciseView, km, { itemToCheckBlockId }) {
  const evidenceById = indexById(km.evidence);
  const allItemIds = Array.from(new Set(exerciseView.exercises.flatMap((e) => e.sourceItemIds)));

  // 同一CheckBlock内で、同じKM問題文(promptEvidence excerpt結合)を共有している(=重複コピーしている)
  // Itemを検出するための下準備。
  const kmPromptTextByItemId = new Map();
  for (const itemId of allItemIds) {
    const q = kmQuestionForItem(km, itemId);
    kmPromptTextByItemId.set(itemId, kmPromptTextForQuestion(q, evidenceById));
  }
  const itemsByCheckBlock = new Map();
  for (const itemId of allItemIds) {
    const cbId = itemToCheckBlockId.get(itemId);
    if (!itemsByCheckBlock.has(cbId)) itemsByCheckBlock.set(cbId, []);
    itemsByCheckBlock.get(cbId).push(itemId);
  }

  const rows = [];
  for (const itemId of allItemIds) {
    const checkBlockId = itemToCheckBlockId.get(itemId);
    const question = kmQuestionForItem(km, itemId);
    const kmOperation = question?.requirement?.operation ?? null;
    const kmPromptText = kmPromptTextByItemId.get(itemId);
    const kmAnswerText = kmAnswerTextForQuestion(question, km, evidenceById);
    const kmExplanationText = kmExplanationTextForItem(km, itemId);

    const evExercises = exerciseView.exercises.filter((e) => e.sourceItemIds.includes(itemId));
    const evExerciseTypes = Array.from(new Set(evExercises.map((e) => e.exerciseType)));
    const exerciseIds = evExercises.map((e) => e.exerciseId);

    const primary = primaryExerciseForItem(exerciseView.exercises, itemId);
    const evPromptText = primary?.prompt?.text ?? null;
    const evBodyText = primary?.body?.text ?? null;
    const evAnswerText = evAnswerTextOf(primary);
    const evExplanationText = primary?.explanation?.raw?.text ?? null;

    const siblingIds = (itemsByCheckBlock.get(checkBlockId) ?? []).filter((id) => id !== itemId);
    const sharedPromptDuplicatedInKm =
      kmPromptText != null && kmPromptText !== "" && siblingIds.some((sib) => kmPromptTextByItemId.get(sib) === kmPromptText);

    const participatesInMultiBlank = evExercises.some((e) => e.exerciseType === "multi_blank" && e.eligibility === "eligible");

    let structureLostInKm = "";
    if (sharedPromptDuplicatedInKm) {
      structureLostInKm = "共有設問文が複製されており、大問-空欄の親子関係を保持していない（CSV Bridge/KM側の既知の制約）";
    }
    let newCapabilityInEv = "";
    if (participatesInMultiBlank) {
      newCapabilityInEv = "multi_blankとして複数空欄をまとめて演習化可能（KM v0.6には対応する演習単位がない）";
    }

    let diffCategory;
    let notes;
    if (!question) {
      diffCategory = DIFF_CATEGORIES.INPUT_DATA_SHORTAGE;
      notes = "KM v0.6上でこのItemに対応するQuestionが存在しない（解答未リンクの既知29件仕様の一部）。Exercise View側も同じ理由でineligible/review_requiredとして演習化を停止・保留している";
    } else if (primary && primary.eligibility !== "eligible") {
      diffCategory = DIFF_CATEGORIES.MANUAL_JUDGEMENT_NEEDED;
      notes = `Exercise View側は異常検出により eligibility=${primary.eligibility} として演習化を停止・保留したが、KM v0.6は異常検出の概念を持たないため同じItemに対しQuestionを生成している。KMの当該解答が信頼できるかは手動確認が必要`;
    } else if (sharedPromptDuplicatedInKm) {
      diffCategory = DIFF_CATEGORIES.INTENTIONAL_IMPROVEMENT;
      notes = "KM側は共有設問文を複製しているが、Exercise View側はinherited:trueとして親から1回だけ保持した値を参照している（BSMの共有設問文一本化を活用）。" +
        (participatesInMultiBlank ? "あわせてmulti_blankとして複数空欄をまとめた演習単位も生成できる" : "");
    } else if (participatesInMultiBlank) {
      diffCategory = DIFF_CATEGORIES.KM_COMPAT_DIFF;
      notes = "KM v0.6は1 Item=1 Questionという粒度しか持たないため、multi_blankのような複数空欄をまとめた演習単位という語彙自体が存在しない（優劣ではなく粒度モデルの違い）";
    } else if (evAnswerText != null && kmAnswerText != null && evAnswerText === kmAnswerText) {
      diffCategory = DIFF_CATEGORIES.REPRESENTATION_ONLY;
      notes = "問題文・解答ともに実質同一内容。フィールド名・粒度の表現形式のみが異なる";
    } else {
      diffCategory = DIFF_CATEGORIES.GENERATION_RULE_BUG;
      notes = `KMとExercise Viewの解答テキストが一致しない（KM: "${kmAnswerText ?? ""}" / EV: "${evAnswerText ?? ""}"）。生成ルールまたはBSM変換の不具合の可能性があるため個別確認が必要`;
    }

    rows.push({
      itemId,
      checkBlockId,
      exerciseIds: exerciseIds.join(";"),
      kmOperation: kmOperation ?? "",
      kmPromptText: kmPromptText ?? "",
      kmAnswerText: kmAnswerText ?? "",
      kmExplanationText: kmExplanationText ?? "",
      evExerciseTypes: evExerciseTypes.join(";"),
      evPromptText: evPromptText ?? "",
      evAnswerText: evAnswerText ?? "",
      evExplanationText: evExplanationText ?? "",
      sharedPromptDuplicatedInKm: String(sharedPromptDuplicatedInKm),
      structureLostInKm,
      newCapabilityInEv,
      diffCategory,
      notes,
    });
  }
  return rows;
}

export const COMPARISON_COLUMNS = [
  "itemId",
  "checkBlockId",
  "exerciseIds",
  "kmOperation",
  "kmPromptText",
  "kmAnswerText",
  "kmExplanationText",
  "evExerciseTypes",
  "evPromptText",
  "evAnswerText",
  "evExplanationText",
  "sharedPromptDuplicatedInKm",
  "structureLostInKm",
  "newCapabilityInEv",
  "diffCategory",
  "notes",
];

function escapeField(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toComparisonCsvText(rows, { bom = true } = {}) {
  const lines = [COMPARISON_COLUMNS.map(escapeField).join(",")];
  for (const row of rows) {
    lines.push(COMPARISON_COLUMNS.map((c) => escapeField(row[c])).join(","));
  }
  const body = lines.join("\r\n") + "\r\n";
  return bom ? "﻿" + body : body;
}
