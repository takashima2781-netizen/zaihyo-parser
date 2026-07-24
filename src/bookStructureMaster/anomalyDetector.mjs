// Phase 2B: 生成されたBook Structure Masterと元Intermediate JSONを突き合わせ、
// 自動変換が完全にはできなかった箇所を分類する。
// 各カテゴリの検出条件は、bsm/Intermediate JSON上で機械的に確認できる条件のみを用いる
// （検出根拠がないものを推測で異常扱いしない）。
// カテゴリごとの根拠は docs/book_structure_master_phase2b_report.md にまとめる。

function parsePage(locator) {
  const m = /page=(\d+)/.exec(locator ?? "");
  return m ? Number(m[1]) : null;
}

function markerPositions(text) {
  if (!text) return [];
  const positions = [];
  const re = /[①-⑳]/g;
  let m;
  while ((m = re.exec(text)) !== null) positions.push(m.index);
  return positions;
}

// 丸数字マーカー間の平均文字間隔。マーカーが2個未満の場合はnull（判定根拠なし）。
function avgSegLen(text) {
  const positions = markerPositions(text);
  if (positions.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < positions.length; i++) gaps.push(positions[i] - positions[i - 1]);
  return gaps.reduce((a, b) => a + b, 0) / gaps.length;
}

// checkblock-90(p.94, avgSegLen≈5.2)と checkblock-208/296(p.198/p.270, avgSegLen≈30.7/18.0)を
// 分離する閾値として、実データ（全1,121 Item）から経験的に定めた。
// docs/book_structure_master_phase2b_report.md 4章参照。
const MARKER_MISCLASSIFICATION_MIN_AVG_SEG_LEN = 10;

function collectLeavesAndMajorGroups(bsm) {
  const leaves = [];
  const majorGroups = [];
  function walkQu(qu, checkBlockId, questionId) {
    if (qu._sourceItemId) {
      leaves.push({ qu, checkBlockId, questionId });
    } else if (qu.parsed?.unitKind?.code === "majorQuestion") {
      majorGroups.push({ qu, checkBlockId, questionId });
    }
    (qu.children ?? []).forEach((c) => walkQu(c, checkBlockId, questionId));
  }
  for (const book of bsm.books) {
    for (const sn of book.structure) {
      (function walkSn(node) {
        (node.children ?? []).forEach(walkSn);
        (node.checkSections ?? []).forEach((cs) => {
          (cs.questionUnits ?? []).forEach((qu) => walkQu(qu, cs.id, qu.id));
        });
      })(sn);
    }
  }
  return { leaves, majorGroups };
}

let anomalySeq = 0;
function nextAnomalyId() {
  anomalySeq += 1;
  return `anomaly-${String(anomalySeq).padStart(4, "0")}`;
}

function excerptOf(item) {
  return item ? item.raw.question.map((q) => q.text).join("").slice(0, 80) : "";
}

export function detectAnomalies(bsm, { itemsById, builderErrors = [], validationIssues = [] }) {
  anomalySeq = 0;
  const anomalies = [];
  const { leaves, majorGroups } = collectLeavesAndMajorGroups(bsm);

  // 1. missing_answer: Intermediate JSON側でraw.answersが空のItem（Parser v1.0.0の既知29件仕様）
  for (const { qu, checkBlockId, questionId } of leaves) {
    if (qu.answer === null) {
      const item = itemsById.get(qu._sourceItemId);
      anomalies.push({
        anomaly_id: nextAnomalyId(),
        severity: "info",
        category: "missing_answer",
        source_page: item ? parsePage(item.raw.question[0]?.source?.locator) : null,
        checkblock_id: checkBlockId,
        question_id: questionId,
        item_id: qu._sourceItemId,
        unit_id: qu.id,
        raw_excerpt: excerptOf(item),
        reason: "Intermediate JSON上でraw.answersが空（Parser v1.0.0時点で解答未リンク。既知の29件仕様の一部、Parserのbaselineとして受け入れ済み）",
        recommended_action: "Parser側の解答リンク改善課題として記録する（Parser自体は変更しない）。BSM側では解答なしItemとしてそのまま保持済み",
      });
    }
  }

  // 2a. possible_marker_misclassification（leaf単位）: unitKind="unknown" かつ
  //     diag.notesに「マーカー」を含む（no-marker fallback。既存Parserのnotesをそのまま検出根拠として使う）
  for (const { qu, checkBlockId, questionId } of leaves) {
    const notes = qu.parsed?.diag?.notes ?? "";
    if (qu.parsed?.unitKind?.code === "unknown" && /マーカー/.test(notes)) {
      const item = itemsById.get(qu._sourceItemId);
      anomalies.push({
        anomaly_id: nextAnomalyId(),
        severity: "review",
        category: "possible_marker_misclassification",
        source_page: item ? parsePage(item.raw.question[0]?.source?.locator) : null,
        checkblock_id: checkBlockId,
        question_id: questionId,
        item_id: qu._sourceItemId,
        unit_id: qu.id,
        raw_excerpt: excerptOf(item),
        reason: `Parserのnotesに小問マーカー検出失敗の記録がある（"${notes}"）ため、unitKindを"unknown"のまま保持した`,
        recommended_action: "小問マーカー検出ロジックの改善候補としてParser側の将来課題に記録する（手動レビュー要）",
      });
    }
  }

  // 2b. possible_marker_misclassification / unsupported_table_structure（大問グループ単位）:
  //     大問直下の子が2件以上あり、全員が解答未リンクのfillBlank(blank)である場合、
  //     本文中の丸数字マーカー間の平均文字間隔(avgSegLen)から機械的に振り分ける。
  //     ただし、avgSegLenだけではp.198型（マーカー誤判定）とp.270型（ページ種別判定失敗、
  //     docs/remaining_answer_linkage_catalog.md参照）を区別できないため、
  //     いずれもpossible_marker_misclassificationとして人手レビューに委ねる（保守的な扱い、
  //     特定ページ専用の分岐は作らない）。
  for (const { qu, checkBlockId, questionId } of majorGroups) {
    const children = qu.children ?? [];
    if (children.length <= 1) continue;
    const allMissingAnswer = children.every((c) => c.answer === null);
    const allBlank = children.every((c) => c.parsed?.unitKind?.code === "blank");
    if (!allMissingAnswer || !allBlank) continue;
    const bodyText = qu.bodyRaw?.text ?? children.map((c) => c.bodyRaw?.text ?? "").join("");
    const seg = avgSegLen(bodyText);
    if (seg === null) continue; // マーカーが2個未満で判定根拠がないため、推測でカテゴリを付けない
    const category = seg >= MARKER_MISCLASSIFICATION_MIN_AVG_SEG_LEN ? "possible_marker_misclassification" : "unsupported_table_structure";
    for (const c of children) {
      const item = itemsById.get(c._sourceItemId);
      anomalies.push({
        anomaly_id: nextAnomalyId(),
        severity: "review",
        category,
        source_page: item ? parsePage(item.raw.question[0]?.source?.locator) : null,
        checkblock_id: checkBlockId,
        question_id: questionId,
        item_id: c._sourceItemId,
        unit_id: c.id,
        raw_excerpt: excerptOf(item),
        reason:
          category === "possible_marker_misclassification"
            ? `同一大問配下の${children.length}件が全て解答未リンクのfillBlankであり、本文中の丸数字マーカー間の平均文字間隔が${seg.toFixed(1)}文字（閾値${MARKER_MISCLASSIFICATION_MIN_AVG_SEG_LEN}文字以上）と長いため、列挙記号を空欄記号と誤判定した可能性がある。ただしこの指標だけではページ種別判定失敗（別原因）と機械的に区別できないため、保守的にこのカテゴリへ分類した`
            : `同一大問配下の${children.length}件が全て解答未リンクのfillBlankであり、本文中の丸数字マーカー間の平均文字間隔が${seg.toFixed(1)}文字（閾値${MARKER_MISCLASSIFICATION_MIN_AVG_SEG_LEN}文字未満）と短いため、表構造など現行のツリーモデルでは表現できない構造の可能性がある`,
        recommended_action:
          category === "possible_marker_misclassification"
            ? "手動レビューが必要。docs/book_structure_master_phase2b_report.mdの既知の限界（p.198型とp.270型の区別不可）を参照"
            : "手動レビューが必要。現行スキーマのQuestionUnitツリーでは表現できない可能性があり、スキーマ拡張の検討課題として記録する",
      });
    }
  }

  // 3. unresolved_item: 上記のいずれにも該当しない confidence="low" のItem（catch-all、推測はしない）
  const alreadyFlagged = new Set(
    anomalies
      .filter((a) => ["missing_answer", "possible_marker_misclassification", "unsupported_table_structure"].includes(a.category))
      .map((a) => a.item_id)
  );
  for (const { qu, checkBlockId, questionId } of leaves) {
    const item = itemsById.get(qu._sourceItemId);
    if (item?.parsed?.confidence === "low" && !alreadyFlagged.has(qu._sourceItemId)) {
      anomalies.push({
        anomaly_id: nextAnomalyId(),
        severity: "review",
        category: "unresolved_item",
        source_page: parsePage(item.raw.question[0]?.source?.locator),
        checkblock_id: checkBlockId,
        question_id: questionId,
        item_id: qu._sourceItemId,
        unit_id: qu.id,
        raw_excerpt: excerptOf(item),
        reason: 'Parserのconfidenceが"low"だが、missing_answer/possible_marker_misclassification/unsupported_table_structureのいずれにも該当しない',
        recommended_action: "個別に手動レビューが必要",
      });
    }
  }

  // 4. explanation_role_unknown: explanationRawを持つ全Leaf（Phase 2A方針により常にexplanationRole.code=null）
  for (const { qu, checkBlockId, questionId } of leaves) {
    if (qu.answer?.explanationRaw != null) {
      const item = itemsById.get(qu._sourceItemId);
      anomalies.push({
        anomaly_id: nextAnomalyId(),
        severity: "info",
        category: "explanation_role_unknown",
        source_page: item ? parsePage(item.raw.question[0]?.source?.locator) : null,
        checkblock_id: checkBlockId,
        question_id: questionId,
        item_id: qu._sourceItemId,
        unit_id: qu.id,
        raw_excerpt: qu.answer.explanationRaw.text.slice(0, 80),
        reason: "訂正文か一般解説かを機械的に断定するルールが未確立のため、explanationRole.codeをnullのまま保持した（Phase 2Aと同じ保守的方針）",
        recommended_action: "explanationRoleの分類ルールを設計できるまで、Phase 2B完了後の検討課題として保留する",
      });
    }
  }

  // 5. shared_prompt_mismatch: Builderのdiag.notesに、sharedPromptRawTextと一部Itemの本文が
  //    不一致だった旨の記録が残っている大問QuestionUnit（Builder自身が実施した文字列比較の結果を
  //    そのまま検出根拠として使う。新たな推測はしない）
  for (const { qu, checkBlockId, questionId } of majorGroups) {
    const notes = qu.parsed?.diag?.notes ?? "";
    if (notes.includes("一部Itemのraw.questionが不一致")) {
      anomalies.push({
        anomaly_id: nextAnomalyId(),
        severity: "review",
        category: "shared_prompt_mismatch",
        source_page: null,
        checkblock_id: checkBlockId,
        question_id: questionId,
        item_id: null,
        unit_id: qu.id,
        raw_excerpt: (qu.labelRaw?.text ?? "").slice(0, 80),
        reason: notes,
        recommended_action: "共有設問文と各Itemの本文の不一致原因を手動確認する",
      });
    }
  }

  // 6. missing_provenance / schema_validation_error / other: バリデータの検出結果をそのまま反映する
  //    （新たな推測はせず、validator.mjsが実際に検出した違反のみを転記する）
  const SCHEMA_ERROR_CHECKS = new Set([
    "schema-shape",
    "duplicate-id",
    "content-diag-mixing",
    "invented-label",
    "invented-promptRaw",
    "invented-explanationRole",
    "shared-prompt-duplicated",
  ]);
  for (const issue of validationIssues) {
    if (issue.check === "provenance-missing") {
      anomalies.push({
        anomaly_id: nextAnomalyId(),
        severity: "error",
        category: "missing_provenance",
        source_page: null,
        checkblock_id: null,
        question_id: null,
        item_id: null,
        unit_id: null,
        raw_excerpt: "",
        reason: `${issue.path}: ${issue.detail}`,
        recommended_action: "Builderの出典参照生成ロジックを確認する",
      });
    } else if (SCHEMA_ERROR_CHECKS.has(issue.check)) {
      anomalies.push({
        anomaly_id: nextAnomalyId(),
        severity: "error",
        category: "schema_validation_error",
        source_page: null,
        checkblock_id: null,
        question_id: null,
        item_id: null,
        unit_id: null,
        raw_excerpt: "",
        reason: `${issue.check}: ${issue.path ?? issue.detail ?? JSON.stringify(issue)}`,
        recommended_action: "output/book_structure_master_full_validation.jsonの詳細出力を確認する",
      });
    } else if (issue.check === "verbatim-mismatch") {
      anomalies.push({
        anomaly_id: nextAnomalyId(),
        severity: "error",
        category: "other",
        source_page: null,
        checkblock_id: null,
        question_id: null,
        item_id: issue.itemId ?? null,
        unit_id: null,
        raw_excerpt: issue.textSample ?? "",
        reason: `verbatim-mismatch: Item ${issue.itemId} の原文が生成結果内に逐語で見つからない`,
        recommended_action: "Builderの当該Item変換ロジックを確認する（原文欠落の可能性）",
      });
    }
  }

  // 7. builder_error: CheckBlock単位の変換で例外が発生したケース（全体を止めず記録のみ）
  for (const be of builderErrors) {
    anomalies.push({
      anomaly_id: nextAnomalyId(),
      severity: "error",
      category: "builder_error",
      source_page: null,
      checkblock_id: be.checkBlockId,
      question_id: null,
      item_id: null,
      unit_id: null,
      raw_excerpt: "",
      reason: be.message,
      recommended_action: "buildBookStructureMasterFull()のエラー内容を確認し、必要ならBuilderロジックを修正する",
    });
  }

  return anomalies;
}
