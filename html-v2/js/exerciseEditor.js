// 編集モードのデータ操作本体。DOM・UIには一切依存しない純粋関数群のみを置く
// （画面側はeditForm.js、メニューはeditMenu.js、ID採番・来歴付与はeditIds.js）。
// すべての関数は渡された配列・オブジェクトを直接ミューテートする。呼び出し側
// （app.jsのstate.data.exercises等）が持つオブジェクト参照は変わらないため、
// 学習セッション中のカード等、既にそのオブジェクトを参照している箇所にもそのまま反映される。
//
// 構造編集（中問の追加・削除・移動）は、既にstructureType==="independent_subquestions"を
// 持つ大問（subQuestionsを持つ大問）同士に限定する（v1スコープ。承認済み実装計画参照）。
// 共有本文型（bodySegmentsでマーカー管理するshared_body_blanks）の構造変換は対象外。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

function newRawSpan(text) {
  return { text: text, source: null, bsmNodeId: null, inherited: false };
}

// rawSpan（{text, source, bsmNodeId, inherited, originalText?}）のテキストを書き換える。
// 原文保持のため、書き換え前に必ずcaptureOriginalTextを経由する。
function setRawSpanText(rawSpan, newText) {
  EVv2.captureOriginalText(rawSpan);
  rawSpan.text = newText;
}

var ExerciseEditor = {};

// ---- フィールド単位の編集 ----

// 問題文（prompt優先、なければbody。どちらも無ければbodyを新設する）。
// 呼び出し側（editForm.js）は、bodySegmentsを持つ共有本文型multi_blankには
// この関数を使わない（マーカー位置とテキストがズレるため、v1では編集UIを出さない）。
ExerciseEditor.updateBodyText = function (ex, newText) {
  var span = ex.prompt || ex.body;
  if (span) {
    setRawSpanText(span, newText);
  } else {
    ex.body = newRawSpan(newText);
  }
  EVv2.markUserEdited(ex, false);
};

// 大問（Exercise）自身が持つ共通指示文。true_falseのグループ共有指示文
// （updateGroupInstructionText、複数Exerciseに同時反映）とは異なり、こちらは
// multi_blank等、1つのExerciseが単独で持つinstructionRawを更新する。
ExerciseEditor.updateInstructionText = function (ex, newText) {
  if (ex.instructionRaw) {
    setRawSpanText(ex.instructionRaw, newText);
  } else {
    ex.instructionRaw = newRawSpan(newText);
  }
  EVv2.markUserEdited(ex, false);
};

ExerciseEditor.updateExplanationText = function (ex, newText) {
  if (ex.explanation && ex.explanation.raw) {
    setRawSpanText(ex.explanation.raw, newText);
  } else {
    ex.explanation = { raw: newRawSpan(newText), role: null };
  }
  EVv2.markUserEdited(ex, false);
};

// true_false専用。symbolは"○"か"×"のみ許可する（自己採点ロジックの比較対象そのものなので、
// 自由入力にはしない）。
ExerciseEditor.updateJudgementSymbol = function (ex, symbol) {
  if (symbol !== "○" && symbol !== "×") {
    throw new Error("judgement symbol must be ○ or ×");
  }
  if (ex.judgement && ex.judgement.symbolRaw) {
    setRawSpanText(ex.judgement.symbolRaw, symbol);
  } else {
    ex.judgement = { symbolRaw: newRawSpan(symbol), answerBodyRaw: null };
  }
  EVv2.markUserEdited(ex, false);
};

// single_blank、および中問を持たないmulti_blank（shared_body_blanks）の正解テキスト。
ExerciseEditor.updateExpectedAnswerText = function (ex, index, newText) {
  var item = ex.expectedAnswer && ex.expectedAnswer[index];
  if (!item) return;
  setRawSpanText(item.answerText, newText);
  EVv2.markUserEdited(ex, false);
};

// 中問（subQuestions[index]）の本文・正解。ex.expectedAnswer[index]は同じ内容を映す
// 並行配列（registry.jsが件数表示に使う）のため、必ず両方を同時に更新する。
ExerciseEditor.updateSubQuestionBody = function (ex, index, newText) {
  var sq = ex.subQuestions && ex.subQuestions[index];
  if (!sq) return;
  setRawSpanText(sq.body, newText);
  EVv2.markUserEdited(ex, false);
};

ExerciseEditor.updateSubQuestionAnswer = function (ex, index, newText) {
  var sq = ex.subQuestions && ex.subQuestions[index];
  if (!sq) return;
  setRawSpanText(sq.expectedAnswer, newText);
  var mirrored = ex.expectedAnswer && ex.expectedAnswer[index];
  if (mirrored) setRawSpanText(mirrored.answerText, newText);
  EVv2.markUserEdited(ex, false);
};

// ---- 大問（exercises配列要素）単位の構造編集 ----

function blankTrueFalseExercise() {
  return {
    exerciseId: EVv2.generateUserExerciseId(),
    exerciseType: "true_false",
    sourceBookStructureIds: [],
    sourceItemIds: [],
    stableItemIds: [EVv2.generateUserStableItemId()],
    contentFingerprints: [],
    prompt: null,
    body: newRawSpan(""),
    choices: null,
    expectedAnswer: [],
    judgement: { symbolRaw: newRawSpan("○"), answerBodyRaw: null },
    explanation: null,
    answerForm: null,
    withheldAnswerContent: null,
    structureType: null,
    subQuestions: null,
    bodySegments: null,
    instructionRaw: null,
  };
}

function blankSingleBlankExercise() {
  var stableItemId = EVv2.generateUserStableItemId();
  return {
    exerciseId: EVv2.generateUserExerciseId(),
    exerciseType: "single_blank",
    sourceBookStructureIds: [],
    sourceItemIds: [],
    stableItemIds: [stableItemId],
    contentFingerprints: [],
    prompt: null,
    body: newRawSpan(""),
    choices: null,
    expectedAnswer: [
      { blankUnitId: EVv2.generateUserBlankUnitId(), sourceItemId: null, stableItemId: stableItemId, answerText: newRawSpan("") },
    ],
    judgement: null,
    explanation: null,
    answerForm: "blank",
    withheldAnswerContent: null,
    structureType: null,
    subQuestions: null,
    bodySegments: null,
    instructionRaw: null,
  };
}

// 中問（subQuestions）を持つmulti_blankとして新規作成する。中身は空（中問0件）で
// 作成し、editForm.js側でaddSubQuestionを使って中問を追加してもらう想定。
function blankMultiBlankExercise() {
  return {
    exerciseId: EVv2.generateUserExerciseId(),
    exerciseType: "multi_blank",
    sourceBookStructureIds: [],
    sourceItemIds: [],
    stableItemIds: [],
    contentFingerprints: [],
    prompt: null,
    body: null,
    choices: null,
    expectedAnswer: [],
    judgement: null,
    explanation: null,
    answerForm: "subQuestion",
    withheldAnswerContent: null,
    structureType: "independent_subquestions",
    subQuestions: [],
    bodySegments: null,
    instructionRaw: null,
  };
}

var BLANK_FACTORIES = {
  true_false: blankTrueFalseExercise,
  single_blank: blankSingleBlankExercise,
  multi_blank: blankMultiBlankExercise,
};

ExerciseEditor.isCreatableType = function (exerciseType) {
  return !!BLANK_FACTORIES[exerciseType];
};

// afterExの直後に、同じexerciseType・同じ教材分類（structurePath/structure）の
// 空の大問を1件挿入する。呼び出し側はafterExがexercises配列内に実在することを保証すること。
ExerciseEditor.addExercise = function (exercises, afterEx) {
  var factory = BLANK_FACTORIES[afterEx.exerciseType];
  if (!factory) throw new Error("この形式（" + afterEx.exerciseType + "）の大問追加には対応していません");
  var newEx = factory();
  newEx.structurePath = afterEx.structurePath || [];
  newEx.structure = afterEx.structure || null;
  EVv2.markUserEdited(newEx, true);
  var idx = exercises.indexOf(afterEx);
  exercises.splice(idx + 1, 0, newEx);
  return newEx;
};

ExerciseEditor.deleteExercise = function (exercises, ex) {
  var idx = exercises.indexOf(ex);
  if (idx === -1) return false;
  exercises.splice(idx, 1);
  return true;
};

// ---- 中問（subQuestions）単位の構造編集。exがsubQuestionsを持つ大問であることが前提。----

function reindexSubQuestions(ex) {
  ex.subQuestions.forEach(function (sq, i) {
    sq.order = i + 1;
  });
}

ExerciseEditor.canHoldSubQuestions = function (ex) {
  return ex.exerciseType === "multi_blank" && ex.structureType === "independent_subquestions" && Array.isArray(ex.subQuestions);
};

ExerciseEditor.addSubQuestion = function (ex, bodyText, answerText) {
  if (!ExerciseEditor.canHoldSubQuestions(ex)) {
    throw new Error("この大問は中問（独立した設問）を持たない構造のため、中問を追加できません");
  }
  var stableItemId = EVv2.generateUserStableItemId();
  var sq = {
    sourceItemId: null,
    stableItemId: stableItemId,
    body: newRawSpan(bodyText || ""),
    expectedAnswer: newRawSpan(answerText || ""),
    order: ex.subQuestions.length + 1,
  };
  ex.subQuestions.push(sq);
  ex.expectedAnswer.push({
    blankUnitId: EVv2.generateUserBlankUnitId(),
    sourceItemId: null,
    stableItemId: stableItemId,
    answerText: newRawSpan(answerText || ""),
  });
  ex.stableItemIds.push(stableItemId);
  EVv2.markUserEdited(ex, false);
  return sq;
};

ExerciseEditor.deleteSubQuestion = function (ex, index) {
  if (!ExerciseEditor.canHoldSubQuestions(ex)) return false;
  if (index < 0 || index >= ex.subQuestions.length) return false;
  var removed = ex.subQuestions.splice(index, 1)[0];
  ex.expectedAnswer.splice(index, 1);
  var stableIdx = ex.stableItemIds.indexOf(removed.stableItemId);
  if (stableIdx !== -1) ex.stableItemIds.splice(stableIdx, 1);
  reindexSubQuestions(ex);
  EVv2.markUserEdited(ex, false);
  return true;
};

// fromExのindex番目の中問をtoExの末尾へ移動する。どちらもcanHoldSubQuestionsであること。
ExerciseEditor.moveSubQuestion = function (fromEx, index, toEx) {
  if (!ExerciseEditor.canHoldSubQuestions(fromEx) || !ExerciseEditor.canHoldSubQuestions(toEx)) {
    return false;
  }
  if (index < 0 || index >= fromEx.subQuestions.length) return false;
  var sq = fromEx.subQuestions.splice(index, 1)[0];
  var mirrored = fromEx.expectedAnswer.splice(index, 1)[0];
  var stableIdx = fromEx.stableItemIds.indexOf(sq.stableItemId);
  if (stableIdx !== -1) fromEx.stableItemIds.splice(stableIdx, 1);
  reindexSubQuestions(fromEx);

  toEx.subQuestions.push(sq);
  toEx.expectedAnswer.push(mirrored);
  toEx.stableItemIds.push(sq.stableItemId);
  reindexSubQuestions(toEx);

  EVv2.markUserEdited(fromEx, false);
  EVv2.markUserEdited(toEx, false);
  return true;
};

// ---- 共有指示文グループ（true_falseの「大問」）----
//
// true_false（○×）は、exercises配列上は1文＝1つの独立したExerciseだが、教材としては
// 同じ指示文（例:「次に掲げる各文章について、誤っている箇所があるものには×印を…」）を
// 共有する複数文が1つの大問を構成する（sourceBookStructureIds[1]＝BSMの「question」ノードが
// 共通のグループ識別子）。この節の関数群は、そのグループを動的に見つけて編集するためのもの
// （ユーザー指示、2026-08-01。実データ調査で確認済み: 例えばqu-question-04は6件のtrue_false
// Exerciseを共有グループとして持つ）。

// sourceBookStructureIds[1]（BSMの「question」ノードID）をグループ識別子として使う。
// 配列位置への依存が安全かどうかは、実データ（output/exercise_view_full.json、
// exercises+withheldExercises 計1324件、2026-08-01時点）で以下を確認済み:
//   - 全件でsourceBookStructureIds.length >= 2（index[1]が常に存在する）
//   - 全件でsourceBookStructureIds[1]が"qu-question-"始まり（異常0件）
//   - instructionRawを持つ1083件全てで、instructionRaw.bsmNodeId === sourceBookStructureIds[1]
//     （不一致0件。「index[1]＝questionノードID」という前提の裏付け）
//   - true_falseの同一グループ内（全100グループ）で、instructionRawのtextが不一致になる
//     組み合わせは0件（重複データが実際に同一内容であることの確認）
// グループ判定はこの関数1箇所に集約し、他の場所ではsourceBookStructureIds[1]を直接読まない。
// groupIdが取得できない場合（データ不整合）はnullを返し、呼び出し側
// （findGroupMembers/listOtherGroupsInTopic）はnull同士を「同じグループ」とは扱わないよう
// 明示的にガードする（誤って無関係な項目を同一グループとみなさないため）。
ExerciseEditor.getGroupId = function (ex) {
  return (ex.sourceBookStructureIds && ex.sourceBookStructureIds[1]) || null;
};

ExerciseEditor.findGroupMembers = function (exercises, groupId, exerciseType) {
  if (!groupId) return [];
  return exercises.filter(function (e) {
    return e.exerciseType === exerciseType && ExerciseEditor.getGroupId(e) === groupId;
  });
};

// single_blankは「1空欄ごとに独立したExercise」という、multi_blank（まとめられた方）と
// 内容が重複する別バリエーションに過ぎない。編集の実体は常にmulti_blank側とする
// （ユーザー指示）。見つからない場合はnull（呼び出し側は「未対応」として扱う）。
ExerciseEditor.findMultiBlankSibling = function (exercises, singleBlankEx) {
  var groupId = ExerciseEditor.getGroupId(singleBlankEx);
  if (!groupId) return null;
  return (
    exercises.filter(function (e) {
      return e.exerciseType === "multi_blank" && ExerciseEditor.getGroupId(e) === groupId;
    })[0] || null
  );
};

// 表示用の初期値取得。実データでは全メンバーのinstructionRawが完全一致することを
// 確認済み（getGroupId参照）だが、一部メンバーがinstructionRawを持たない場合
// （教材側で指示文が省略されているケース）に備え、配列の並び順に依存せず
// 最初に見つかった非nullを使う（先頭が欠落データでも取りこぼさない）。
ExerciseEditor.getGroupInstructionText = function (members) {
  for (var i = 0; i < members.length; i++) {
    if (members[i].instructionRaw) return members[i].instructionRaw.text;
  }
  return "";
};

// 共有指示文（instructionRaw）は各メンバーに重複して保持されているため、
// 変更は全メンバーへ同時に適用する。
ExerciseEditor.updateGroupInstructionText = function (members, newText) {
  members.forEach(function (m) {
    if (m.instructionRaw) {
      setRawSpanText(m.instructionRaw, newText);
    } else {
      m.instructionRaw = newRawSpan(newText);
    }
    EVv2.markUserEdited(m, false);
  });
};

function blankTrueFalseGroupMember(groupId, instructionSample, structurePath, structure) {
  var ex = blankTrueFalseExercise();
  ex.sourceBookStructureIds = [null, groupId, null];
  ex.instructionRaw = instructionSample
    ? { text: instructionSample.text, source: null, bsmNodeId: instructionSample.bsmNodeId || groupId, inherited: true }
    : null;
  ex.structurePath = structurePath || [];
  ex.structure = structure || null;
  return ex;
}

// 既存グループへ新しい中問（1文）を追加する。指示文・教材分類は既存メンバーから複製する。
ExerciseEditor.addGroupMember = function (exercises, members) {
  var last = members[members.length - 1];
  var groupId = ExerciseEditor.getGroupId(last);
  var newEx = blankTrueFalseGroupMember(groupId, last.instructionRaw, last.structurePath, last.structure);
  EVv2.markUserEdited(newEx, true);
  var idx = exercises.indexOf(last);
  exercises.splice(idx + 1, 0, newEx);
  return newEx;
};

// グループ全体（指示文を共有するすべての中問）を削除する（「大問を削除」）。
ExerciseEditor.deleteGroup = function (exercises, members) {
  members.forEach(function (m) {
    var idx = exercises.indexOf(m);
    if (idx !== -1) exercises.splice(idx, 1);
  });
};

// 新しい大問（新規グループ、中問1件）をafterExの直後に作る。
ExerciseEditor.createTrueFalseGroup = function (exercises, afterEx) {
  var groupId = EVv2.generateUserGroupId();
  var newEx = blankTrueFalseGroupMember(groupId, { text: "", bsmNodeId: groupId }, afterEx.structurePath, afterEx.structure);
  EVv2.markUserEdited(newEx, true);
  var idx = exercises.indexOf(afterEx);
  exercises.splice(idx + 1, 0, newEx);
  return newEx;
};

// exを、destRepresentative（移動先グループの代表メンバー）と同じグループへ移動する。
// 中問1件の移動なので、subQuestions方式のような並行配列の同期は不要（グループ所属は
// sourceBookStructureIds[1]で動的に判定するため、物理的な配列位置は変えなくてよい）。
ExerciseEditor.moveGroupMember = function (ex, destRepresentative) {
  var destGroupId = ExerciseEditor.getGroupId(destRepresentative);
  ex.sourceBookStructureIds = [
    (ex.sourceBookStructureIds && ex.sourceBookStructureIds[0]) ||
      (destRepresentative.sourceBookStructureIds && destRepresentative.sourceBookStructureIds[0]) ||
      null,
    destGroupId,
    (ex.sourceBookStructureIds && ex.sourceBookStructureIds[2]) || null,
  ];
  if (destRepresentative.instructionRaw) {
    ex.instructionRaw = {
      text: destRepresentative.instructionRaw.text,
      source: null,
      bsmNodeId: destRepresentative.instructionRaw.bsmNodeId || null,
      inherited: true,
    };
  }
  EVv2.markUserEdited(ex, false);
};

// 同じ論点（topic）内にある、exとは異なるtrue_falseグループの一覧（移動先候補）。
// グループごとに代表1件（最初に見つかったメンバー）を返す。
ExerciseEditor.listOtherGroupsInTopic = function (exercises, ex) {
  var myGroupId = ExerciseEditor.getGroupId(ex);
  var myTopicId = ex.structure && ex.structure.topic ? ex.structure.topic.structureNodeId : null;
  var seen = {};
  var result = [];
  exercises.forEach(function (e) {
    if (e.exerciseType !== ex.exerciseType) return;
    var gid = ExerciseEditor.getGroupId(e);
    if (!gid || gid === myGroupId || seen[gid]) return;
    var topicId = e.structure && e.structure.topic ? e.structure.topic.structureNodeId : null;
    if (topicId !== myTopicId) return;
    seen[gid] = true;
    result.push(e);
  });
  return result;
};

// ---- 共有本文型multi_blank（bodySegments方式）の構造化編集 ----
//
// body.textとbodySegments（構造化表現）は完全に導出関係にあることを実データで確認済み
// （bodySegmentsを連結するとbody.textと完全一致。121件中不一致0件、2026-08-01調査）。
// そのため編集はbodySegmentsを唯一の入力（draft）とし、body.text・expectedAnswerは
// 保存時にdraftから再生成する（2つを別々に編集させて食い違わせない設計）。
// ユーザー指示（2026-08-01）で、空欄ごとの解説（expectedAnswer[].explanationRaw、新規
// フィールド）も同じdraftで扱う。

var CIRCLED_DIGITS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳".split("");
// 実データでは①〜⑯までの使用を確認済み（21件超の空欄は未確認）。21件目以降は
// 丸数字が尽きるため"(21)"形式にフォールバックする。
ExerciseEditor.buildBlankLabel = function (index) {
  return CIRCLED_DIGITS[index] || "(" + (index + 1) + ")";
};

// ex.bodySegments/ex.expectedAnswerから編集用ブロック配列（draft）を組み立てる。
// draftの各要素は { kind: "text", text } または
// { kind: "blank", blankUnitId, sourceItemId, stableItemId, answerText, explanationText, isNew }。
ExerciseEditor.buildSegmentDraft = function (ex) {
  var answerByUnitId = {};
  (ex.expectedAnswer || []).forEach(function (item) {
    answerByUnitId[item.blankUnitId] = item;
  });
  return (ex.bodySegments || []).map(function (seg) {
    if (seg.type === "text") {
      return { kind: "text", text: seg.text };
    }
    var answer = answerByUnitId[seg.blankUnitId];
    return {
      kind: "blank",
      blankUnitId: seg.blankUnitId,
      sourceItemId: answer ? answer.sourceItemId : null,
      stableItemId: answer ? answer.stableItemId : null,
      answerText: answer && answer.answerText ? answer.answerText.text : "",
      explanationText: answer && answer.explanationRaw ? answer.explanationRaw.text : "",
      isNew: false,
    };
  });
};

ExerciseEditor.createBlankDraftBlock = function () {
  return {
    kind: "blank",
    blankUnitId: EVv2.generateUserBlankUnitId(),
    sourceItemId: null,
    stableItemId: null,
    answerText: "",
    explanationText: "",
    isNew: true,
  };
};

ExerciseEditor.createTextDraftBlock = function () {
  return { kind: "text", text: "" };
};

// draft（ブロック配列）の整合性チェック。呼び出し側（editForm.js）は保存前に必ず呼び、
// ok:falseの場合はapplySegmentDraftを呼ばずerrorをそのまま表示する。
ExerciseEditor.validateSegmentDraft = function (draft) {
  var blanks = draft.filter(function (b) {
    return b.kind === "blank";
  });
  if (blanks.length === 0) {
    return { ok: false, error: "空欄が1つもありません。少なくとも1つの空欄が必要です。" };
  }
  for (var i = 0; i < blanks.length; i++) {
    if (!blanks[i].answerText || !blanks[i].answerText.trim()) {
      return { ok: false, error: "空欄" + (i + 1) + "の正解が空です。入力してから保存してください。" };
    }
  }
  return { ok: true, error: null };
};

// draftをexへ反映する。bodySegments・body.text・expectedAnswer（+stableItemIds）を
// 一括で再生成するため、この3者が食い違う状態は構造的に起こらない。呼び出し側は
// 事前にvalidateSegmentDraftでok:trueを確認しておくこと（このメソッド自体は検証しない）。
// 既存の空欄（isNew:false）はblankUnitIdで元のanswerText/explanationRawのrawSpan
// オブジェクトを引き継ぎ、captureOriginalTextによる原文保持を壊さない
// （新しいrawSpanを作り直すのは新規追加分のみ）。
ExerciseEditor.applySegmentDraft = function (ex, draft) {
  var originalAnswerByUnitId = {};
  (ex.expectedAnswer || []).forEach(function (item) {
    originalAnswerByUnitId[item.blankUnitId] = item;
  });

  var bodySegments = [];
  var expectedAnswer = [];
  var stableItemIds = [];
  var blankIndex = 0;

  draft.forEach(function (block) {
    if (block.kind === "text") {
      bodySegments.push({ type: "text", text: block.text || "" });
      return;
    }

    var label = ExerciseEditor.buildBlankLabel(blankIndex);
    var order = blankIndex + 1;
    var original = originalAnswerByUnitId[block.blankUnitId];
    var stableItemId = (original && original.stableItemId) || block.stableItemId || EVv2.generateUserStableItemId();

    bodySegments.push({
      type: "blank",
      blankId: block.blankUnitId,
      label: label,
      blankUnitId: block.blankUnitId,
      order: order,
    });

    var answerSpan;
    if (original && original.answerText) {
      answerSpan = original.answerText;
      setRawSpanText(answerSpan, block.answerText);
    } else {
      answerSpan = newRawSpan(block.answerText);
    }

    var explanationSpan = null;
    if (block.explanationText && block.explanationText.trim()) {
      if (original && original.explanationRaw) {
        explanationSpan = original.explanationRaw;
        setRawSpanText(explanationSpan, block.explanationText);
      } else {
        explanationSpan = newRawSpan(block.explanationText);
      }
    }

    var answerItem = {
      blankUnitId: block.blankUnitId,
      sourceItemId: (original && original.sourceItemId) || block.sourceItemId || null,
      stableItemId: stableItemId,
      answerText: answerSpan,
    };
    if (explanationSpan) answerItem.explanationRaw = explanationSpan;

    expectedAnswer.push(answerItem);
    stableItemIds.push(stableItemId);
    blankIndex += 1;
  });

  ex.bodySegments = bodySegments;
  ex.expectedAnswer = expectedAnswer;
  ex.stableItemIds = stableItemIds;

  var newBodyText = bodySegments
    .map(function (seg) {
      return seg.type === "text" ? seg.text : seg.label;
    })
    .join("");
  if (ex.body) {
    setRawSpanText(ex.body, newBodyText);
  } else {
    ex.body = newRawSpan(newBodyText);
  }

  EVv2.markUserEdited(ex, false);
};

EVv2.ExerciseEditor = ExerciseEditor;
