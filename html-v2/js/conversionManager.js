// 自己採点形式の穴埋め・多重穴埋めを、既存の並べ替え問題(ordering)へ変換するバッチ処理と、
// 変換候補の確定/却下の状態管理。
//
// 対象は次の3パターン(いずれも「assembledTextを推測なしで復元できる」もののみ):
//   1. single_blank(共有本文型の兄弟からマーカー①②…が一意特定できるもの)
//   2. multi_blank(structureType==="shared_body_blanks"、bodySegments由来)
//   3. multi_blank(structureType==="independent_subquestions")の中問(subQuestion)単位
// 1・2は実データ上ほぼ0件(既存4択で解決できてしまうため)で、3が実質的な主対象になることを
// 調査で確認済み(2026-08-01)。single_blankの中には3と同じ内容を1問だけ重複表示している
// もの(answerForm==="subQuestion")があるため、対象からは除外する(同じ内容を二重変換しない)。
// 論述問題(answerForm==="unknown"、本文に空欄がなく長文解答が必要なもの)も対象外。
//
// 変換候補の状態(pending/confirmed)は、問題データ(exercises配列の各要素)自体には持たせず、
// 別の管理配列 state.data.exerciseConversions に持たせる(ユーザー指示、2026-08-01)。
// これにより、ordering型のExerciseは常に「そのまま出題できる普通のordering」であり続け、
// レビュー中かどうかという運用状態と学習コンテンツ本体が混ざらない。
//
// この節の関数はすべて、渡されたdata({exercises, exerciseConversions, ...})を直接
// ミューテートする(exerciseEditor.jsと同じ方針)。DOM・画面遷移には一切関与しない。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

EVv2.PHRASE_REORDER_KIND = "phrase_reorder";

function newRawSpanPlain(text) {
  return { text: text, source: null, bsmNodeId: null, inherited: false };
}

// 変換記録の重複判定キー。subQuestionIndexが無い(単一Exercise丸ごとが対象の)場合はnull。
function conversionCandidateKey(sourceExerciseId, subQuestionIndex) {
  return sourceExerciseId + (subQuestionIndex == null ? "" : "::" + subQuestionIndex);
}

// 変換候補を「候補記述子」の配列として返す。{ sourceExercise, subQuestionIndex }。
// subQuestionIndexは独立小問型の中問1件を指す場合のみ数値、それ以外はnull
// (single_blank・共有本文型multi_blankはExercise丸ごとが対象のため)。
// 既にこの候補に対する変換記録が(pending/confirmedいずれでも)ある場合は候補から除く
// (重複変換を防ぐ)。
EVv2.findPhraseReorderCandidates = function (exercises, context, conversions) {
  var alreadyConverted = {};
  (conversions || []).forEach(function (c) {
    if (c.kind === EVv2.PHRASE_REORDER_KIND) {
      alreadyConverted[conversionCandidateKey(c.sourceExerciseId, c.sourceSubQuestionIndex)] = true;
    }
  });

  var out = [];
  exercises.forEach(function (ex) {
    if (ex.exerciseType === "single_blank") {
      // 独立小問型の重複ビュー・論述問題(空欄自体を持たない)は対象外。共有本文型の兄弟から
      // マーカーが一意特定できるものだけを候補にする(実データではまだ0件だが、将来の
      // データ追加に備えてこの経路自体は残す)。
      if (ex.answerForm === "subQuestion" || ex.answerForm === "unknown") return;
      if (EVv2.registry.single_blank.getInteractionMode(ex, context) !== "reveal") return;
      if (alreadyConverted[conversionCandidateKey(ex.exerciseId, null)]) return;
      out.push({ sourceExercise: ex, subQuestionIndex: null });
      return;
    }
    if (ex.exerciseType !== "multi_blank") return;

    if (ex.structureType === "shared_body_blanks") {
      if (EVv2.registry.multi_blank.getInteractionMode(ex, context) !== "reveal") return;
      if (alreadyConverted[conversionCandidateKey(ex.exerciseId, null)]) return;
      out.push({ sourceExercise: ex, subQuestionIndex: null });
      return;
    }

    if (ex.structureType === "independent_subquestions" && Array.isArray(ex.subQuestions)) {
      if (EVv2.registry.multi_blank.getInteractionMode(ex, context) !== "reveal") return;
      ex.subQuestions.forEach(function (sq, idx) {
        if (alreadyConverted[conversionCandidateKey(ex.exerciseId, idx)]) return;
        out.push({ sourceExercise: ex, subQuestionIndex: idx });
      });
    }
  });
  return out;
};

// 1件の変換候補から、ordering(拡張)のExerciseを組み立てる。断片の復元・自動分割に失敗した場合
// (マーカー特定不可・空欄/中問の正解欠落・文節数が2未満など)はnullを返す(推測で埋めない。
// 呼び出し側はこの場合、単に候補に加えない=対象外として一覧に出さない)。
EVv2.buildPhraseReorderConversion = function (candidate, blankMarkerIndex) {
  var sourceEx = candidate.sourceExercise;
  var subQuestionIndex = candidate.subQuestionIndex;

  var built =
    subQuestionIndex == null
      ? EVv2.buildAssembledPartsForExercise(sourceEx, blankMarkerIndex)
      : EVv2.buildAssembledPartsForMultiBlankSubQuestion(sourceEx.subQuestions[subQuestionIndex]);
  if (!built.ok) return null;
  var assembledText = EVv2.partsToAssembledText(built.parts);
  if (!assembledText.trim()) return null;

  var phraseTexts = EVv2.autoSplitPhraseParts(built.parts);
  if (phraseTexts.length < 2) return null; // 並べ替えとして成立しない(ordering側の最小件数と同じ)

  var orderingItems = phraseTexts.map(function (text, i) {
    return { id: EVv2.generateUserBlankUnitId(), label: EVv2.ExerciseEditor.buildOrderingLabel(i), text: text };
  });
  var correctOrder = orderingItems.map(function (it) {
    return it.id;
  });

  // 独立小問(subQuestion)単位の変換は、その中問1件のIDのみを引き継ぐ(Exercise丸ごとの
  // sourceItemIds/stableItemIdsをそのまま使うと、変換していない他の中問のIDまで
  // 誤って引き継いでしまうため)。
  var subQuestion = subQuestionIndex == null ? null : sourceEx.subQuestions[subQuestionIndex];
  var sourceItemIds = subQuestion ? [subQuestion.sourceItemId].filter(Boolean) : sourceEx.sourceItemIds || [];
  var stableItemIds = subQuestion ? [subQuestion.stableItemId].filter(Boolean) : sourceEx.stableItemIds || [];

  var orderingEx = {
    exerciseId: EVv2.generateUserExerciseId(),
    exerciseType: "ordering",
    sourceBookStructureIds: sourceEx.sourceBookStructureIds || [],
    sourceItemIds: sourceItemIds,
    stableItemIds: stableItemIds,
    contentFingerprints: sourceEx.contentFingerprints || [],
    prompt: null,
    // 完成文そのものは正解なので、問題文には出さない。汎用の指示文のみ表示する。
    body: newRawSpanPlain("次の文章になるように、下の文節を正しい順番に並び替えなさい。"),
    choices: null,
    expectedAnswer: [],
    judgement: null,
    // sourceEx.explanation/instructionRawはrawSpanオブジェクトの参照をそのまま使わず複製する
    // (どちらかを後で編集した際に、変換元・変換後が同じオブジェクトを共有して片方の編集が
    // もう片方にも波及してしまう事故を避けるため)。
    explanation:
      sourceEx.explanation && sourceEx.explanation.raw
        ? { raw: { text: sourceEx.explanation.raw.text, source: null, bsmNodeId: null, inherited: true }, role: sourceEx.explanation.role || null }
        : null,
    answerForm: null,
    withheldAnswerContent: null,
    structureType: null,
    subQuestions: null,
    bodySegments: null,
    instructionRaw: sourceEx.instructionRaw
      ? { text: sourceEx.instructionRaw.text, source: null, bsmNodeId: sourceEx.instructionRaw.bsmNodeId || null, inherited: true }
      : null,
    structurePath: sourceEx.structurePath || [],
    structure: sourceEx.structure || null,
    orderingItems: orderingItems,
    correctOrder: correctOrder,
    // v2-31(元問題との統合): この並べ替え問題は完成文の凍結コピーを持たない。
    // 「元問題の一つの表現方法」(ユーザー指示、2026-08-01)として、正解の完成文は常に
    // orderingItems/correctOrderの連結から都度導出する(registry.js参照)。
    // assembledFromSourceは、ラベル非表示・完成文reveal等の表示切り替えに使う印にすぎない。
    assembledFromSource: true,
    sourceExerciseId: sourceEx.exerciseId,
    // 独立小問(subQuestion)単位の変換のみ非null。エディタ(editForm.js)はこれを使って
    // 元の中問を直接特定し、本文・正解の編集をその場で元問題へ書き戻す。
    sourceSubQuestionIndex: subQuestionIndex,
    appEdit: { origin: "converted-from-" + sourceEx.exerciseType, editedAt: new Date().toISOString() },
  };

  return { orderingEx: orderingEx, sourceExerciseType: sourceEx.exerciseType, subQuestionIndex: subQuestionIndex };
};

// 変換候補すべてを一括で下書き生成する(ユーザー操作: 「変換候補を生成」ボタン)。
// dataは呼び出し側(app.js)のstate.dataをそのまま渡す想定。戻り値は画面表示用の件数サマリ。
EVv2.runPhraseReorderBatch = function (data, context) {
  if (!Array.isArray(data.exerciseConversions)) data.exerciseConversions = [];
  var candidates = EVv2.findPhraseReorderCandidates(data.exercises, context, data.exerciseConversions);
  var created = 0;
  var skipped = 0;
  candidates.forEach(function (candidate) {
    var result = EVv2.buildPhraseReorderConversion(candidate, context.blankMarkerIndex);
    if (!result) {
      skipped += 1;
      return;
    }
    data.exercises.push(result.orderingEx);
    data.exerciseConversions.push({
      conversionId: EVv2.generateUserExerciseId(),
      kind: EVv2.PHRASE_REORDER_KIND,
      sourceExerciseId: candidate.sourceExercise.exerciseId,
      sourceExerciseType: result.sourceExerciseType,
      sourceSubQuestionIndex: result.subQuestionIndex,
      orderingExerciseId: result.orderingEx.exerciseId,
      status: "pending",
      createdAt: new Date().toISOString(),
      confirmedAt: null,
    });
    created += 1;
  });
  return { candidateCount: candidates.length, created: created, skipped: skipped };
};

EVv2.confirmPhraseReorderConversion = function (data, conversionId) {
  var conv = (data.exerciseConversions || []).filter(function (c) {
    return c.conversionId === conversionId;
  })[0];
  if (!conv) return false;
  conv.status = "confirmed";
  conv.confirmedAt = new Date().toISOString();
  return true;
};

// 却下(下書きの段階)・取り消し(確定後でも)共通。変換記録と生成したordering Exerciseを
// 両方削除する。変換元のExercise自体には最初から一切手を加えていないため、この操作だけで
// 変換前の状態に完全に戻る(可逆性、ユーザー指示)。
EVv2.discardPhraseReorderConversion = function (data, conversionId) {
  var conversions = data.exerciseConversions || [];
  var conv = conversions.filter(function (c) {
    return c.conversionId === conversionId;
  })[0];
  if (!conv) return false;

  var targetEx = data.exercises.filter(function (e) {
    return e.exerciseId === conv.orderingExerciseId;
  })[0];
  if (targetEx) {
    var exIdx = data.exercises.indexOf(targetEx);
    if (exIdx !== -1) data.exercises.splice(exIdx, 1);
  }

  var convIdx = conversions.indexOf(conv);
  if (convIdx !== -1) conversions.splice(convIdx, 1);
  return true;
};

// 出題対象からの除外判定に使う集合。
// - Exercise丸ごとが対象の変換(subQuestionIndex===null)は、confirmed済みなら変換元Exercise
//   丸ごとを除外する(pendingの間は変換元がそのまま出題され続け、確定した時点で入れ替わる)。
// - 独立小問(subQuestion)単位の変換は、そのExerciseが持つ全中問がconfirmed済みになって
//   初めて変換元Exercise丸ごとを除外する(1中問だけ確定した段階では、他の未変換の中問が
//   まだ出題対象として必要なため、Exercise自体は表示を続ける)。
EVv2.computePhraseReorderExclusionSets = function (conversions, exercises) {
  var excludedSourceIds = {};
  var excludedDraftOrderingIds = {};
  var confirmedSubQuestionIndexesBySource = {};

  (conversions || []).forEach(function (c) {
    if (c.kind !== EVv2.PHRASE_REORDER_KIND) return;
    if (c.status !== "confirmed") {
      excludedDraftOrderingIds[c.orderingExerciseId] = true;
      return;
    }
    if (c.sourceSubQuestionIndex == null) {
      excludedSourceIds[c.sourceExerciseId] = true;
      return;
    }
    if (!confirmedSubQuestionIndexesBySource[c.sourceExerciseId]) {
      confirmedSubQuestionIndexesBySource[c.sourceExerciseId] = {};
    }
    confirmedSubQuestionIndexesBySource[c.sourceExerciseId][c.sourceSubQuestionIndex] = true;
  });

  var exerciseById = {};
  (exercises || []).forEach(function (ex) {
    exerciseById[ex.exerciseId] = ex;
  });
  Object.keys(confirmedSubQuestionIndexesBySource).forEach(function (sourceId) {
    var ex = exerciseById[sourceId];
    if (!ex || !Array.isArray(ex.subQuestions) || ex.subQuestions.length === 0) return;
    var confirmedSet = confirmedSubQuestionIndexesBySource[sourceId];
    var allConfirmed = ex.subQuestions.every(function (sq, idx) {
      return !!confirmedSet[idx];
    });
    if (allConfirmed) excludedSourceIds[sourceId] = true;
  });

  return { excludedSourceIds: excludedSourceIds, excludedDraftOrderingIds: excludedDraftOrderingIds };
};
