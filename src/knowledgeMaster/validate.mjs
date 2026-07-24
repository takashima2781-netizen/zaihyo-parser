// Knowledge Master骨格（convert.mjsの生成結果）に対する、変換前後の件数・参照整合性の検証。
// src/validate/validateCorpus.mjsと対になる位置付け。convert.mjsの変換ロジックそのものは検証せず、
// 生成結果を入力Intermediate JSONと突き合わせて独立に検査するだけのチェッカーである。

function collectItemsFlat(groups) {
  const items = [];
  function walk(gs) {
    for (const g of gs) {
      for (const cb of g.checkBlocks) {
        for (const q of cb.questions) {
          for (const it of q.items) items.push(it);
        }
      }
      walk(g.children);
    }
  }
  walk(groups);
  return items;
}

export function validateKnowledgeMaster(book, km) {
  const issues = [];
  const items = collectItemsFlat(book.groups);

  const totalPresentations = items.reduce((n, it) => n + it.presentations.length, 0);
  const totalParsedAnswers = items.reduce((n, it) => n + (it.parsed ? it.parsed.answers.length : 0), 0);

  // 1. Question数 vs 入力側Presentation総数
  //    （本プロトタイプはpresentations.length!==1やreorder型をunresolvedとして除外するため、
  //     一致しない場合も即エラーとはせず、meta.unresolvedで説明が付くかどうかの手がかりとして記録する）
  issues.push({
    check: "question-count-matches-presentation-count",
    inputPresentationCount: totalPresentations,
    generatedQuestionCount: km.questions.length,
    matched: km.questions.length === totalPresentations,
  });

  // 2. AnswerUnit数 vs 入力側parsed.answers総数
  issues.push({
    check: "answerunit-count-matches-parsed-answers-count",
    inputParsedAnswerCount: totalParsedAnswers,
    generatedAnswerUnitCount: km.answerUnits.length,
    matched: km.answerUnits.length === totalParsedAnswers,
  });

  // 3. Question.answerUnitIds の参照整合性
  const answerUnitIdSet = new Set(km.answerUnits.map((a) => a.id));
  for (const q of km.questions) {
    for (const auId of q.answerUnitIds) {
      if (!answerUnitIdSet.has(auId)) {
        issues.push({
          check: "question-answerunit-reference-integrity",
          questionId: q.id,
          detail: `存在しないAnswerUnit id: ${auId}`,
        });
      }
    }
  }

  // 4. AnswerUnit.evidenceId / Question.promptEvidenceIds の参照整合性
  const evidenceIdSet = new Set(km.evidence.map((e) => e.id));
  for (const au of km.answerUnits) {
    if (!evidenceIdSet.has(au.evidenceId)) {
      issues.push({
        check: "answerunit-evidence-reference-integrity",
        answerUnitId: au.id,
        detail: `存在しないEvidence id: ${au.evidenceId}`,
      });
    }
  }
  for (const q of km.questions) {
    for (const evId of q.promptEvidenceIds) {
      if (!evidenceIdSet.has(evId)) {
        issues.push({
          check: "question-prompt-evidence-reference-integrity",
          questionId: q.id,
          detail: `存在しないEvidence id: ${evId}`,
        });
      }
    }
  }

  // 5. Evidence.itemId が入力Item群に実在するか
  const itemById = new Map(items.map((it) => [it.id, it]));
  for (const ev of km.evidence) {
    if (!itemById.has(ev.itemId)) {
      issues.push({
        check: "evidence-item-reference-integrity",
        evidenceId: ev.id,
        detail: `存在しないItem id: ${ev.itemId}`,
      });
    }
  }

  // 6. Evidence.excerptの逐語性（参照元Item.rawの実テキストと完全一致するか、全件確認）＋非空・kind整合性
  const validEvidenceKinds = new Set(["question", "answer", "explanation"]);
  for (const ev of km.evidence) {
    if (!ev.excerpt || ev.excerpt.trim().length === 0) {
      issues.push({ check: "evidence-excerpt-nonempty", evidenceId: ev.id, detail: "excerptが空文字列" });
    }
    if (!validEvidenceKinds.has(ev.kind)) {
      issues.push({ check: "evidence-kind-valid", evidenceId: ev.id, detail: `不正なkind: ${ev.kind}` });
    } else if ((ev.kind === "answer") !== (ev.answerOrder !== null)) {
      issues.push({
        check: "evidence-kind-answerorder-consistency",
        evidenceId: ev.id,
        detail: `kind="${ev.kind}"とanswerOrder=${ev.answerOrder}の組み合わせが不整合（answerのときのみanswerOrderが非null）`,
      });
    }

    const item = itemById.get(ev.itemId);
    if (!item) continue; // 5で既に検出済み
    const candidates = [
      ...item.raw.question.map((q) => q.text),
      ...item.raw.answers.map((a) => a.text.text),
      ...(item.raw.explanation ? [item.raw.explanation.text] : []),
    ];
    if (!candidates.includes(ev.excerpt)) {
      issues.push({
        check: "evidence-excerpt-verbatim",
        evidenceId: ev.id,
        detail: "excerptが参照元Item.rawのいずれのテキストとも逐語一致しない",
      });
    }
  }

  // 7. 各配列内での重複ID
  const idArrays = [
    ["sources", km.sources],
    ["evidence", km.evidence],
    ["answerUnits", km.answerUnits],
    ["questions", km.questions],
  ];
  for (const [label, arr] of idArrays) {
    const seen = new Map();
    for (const x of arr) seen.set(x.id, (seen.get(x.id) ?? 0) + 1);
    for (const [id, count] of seen) {
      if (count > 1) {
        issues.push({ check: "duplicate-id", array: label, id, detail: `${count}回出現している` });
      }
    }
  }

  // 8. AnswerRequirement / Question のnull方針遵守（本プロトタイプ固有のポリシー確認）
  for (const q of km.questions) {
    const r = q.requirement;
    const violations = [];
    if (r.target !== null) violations.push("target");
    if (r.purpose !== null) violations.push("purpose");
    if (r.outputForm !== null) violations.push("outputForm");
    if (r.requiredDepth !== null) violations.push("requiredDepth");
    if (q.canonicalQuestionId !== null) violations.push("canonicalQuestionId");
    if (violations.length > 0) {
      issues.push({
        check: "answer-requirement-null-policy",
        questionId: q.id,
        detail: `null方針違反のフィールド: ${violations.join(", ")}`,
      });
    }
  }

  // 9. Item網羅性（入力側の全Itemが、最低1つのQuestion.itemIdとして出現しているか）
  const coveredItemIds = new Set(km.questions.map((q) => q.itemId));
  const uncoveredItemIds = items.map((it) => it.id).filter((id) => !coveredItemIds.has(id));
  issues.push({
    check: "item-coverage",
    totalItemCount: items.length,
    coveredItemCount: coveredItemIds.size,
    uncoveredItemCount: uncoveredItemIds.length,
    uncoveredItemIds: uncoveredItemIds.slice(0, 20),
  });

  return issues;
}
