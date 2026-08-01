// 編集モードの編集画面（全画面オーバーレイ）。exerciseTypeごとにフィールドを出し分け、
// 構造編集（中問の追加・削除・移動、大問の追加・削除）のボタンも同じ画面に置く。
// データ操作の実体はexerciseEditor.jsに委譲し、ここではDOM構築とフォーム値の読み取りのみを担当する。
//
// フィールド編集は「保存」を押すまでexercise本体には反映しない（キャンセルで破棄できるように、
// フォームのDOM値を保持し、保存時にまとめてEVv2.ExerciseEditorへ反映する）。ただし構造編集ボタン
// （中問の追加・削除・移動、大問の追加・削除）は押した時点で即座に確定する（個々に確認や
// その場の結果表示が必要なため）。押す前に、その時点でフォームに入力済みの内容は必ず反映してから
// 実行する（入力内容が構造編集で消えないように）。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

(function () {
  "use strict";

  var screen = null;
  var bodyEl = null;
  var cancelBtn = null;
  var saveBtn = null;
  var currentEx = null;
  // true_false（○×）のグループ編集でのみ使う。開いた時点のグループIDを固定で覚えておき、
  // 中問の削除・移動でグループの中身が変わっても（currentEx自体が抜けても）再描画のたびに
  // このIDからメンバーを再取得する（EVv2.ExerciseEditor.findGroupMembers参照）。
  var currentGroupId = null;
  var pendingFieldReaders = [];

  function ensureEls() {
    if (screen) return;
    screen = document.getElementById("edit-screen");
    bodyEl = document.getElementById("edit-screen-body");
    cancelBtn = document.getElementById("edit-screen-cancel-btn");
    saveBtn = document.getElementById("edit-screen-save-btn");
    cancelBtn.addEventListener("click", closeScreen);
    saveBtn.addEventListener("click", function () {
      applyFormToLiveEx();
      EVv2.commitDataEdit();
      closeScreen();
    });
  }

  function closeScreen() {
    if (screen) screen.hidden = true;
    if (bodyEl) bodyEl.innerHTML = "";
    currentEx = null;
    currentGroupId = null;
    pendingFieldReaders = [];
  }

  function applyFormToLiveEx() {
    pendingFieldReaders.forEach(function (f) {
      f.apply(f.el.value);
    });
  }

  function truncate(text, n) {
    if (!text) return "";
    return text.length > n ? text.slice(0, n) + "…" : text;
  }

  function getTopicId(ex) {
    var topic = ex.structure && ex.structure.topic;
    return topic ? topic.structureNodeId : null;
  }

  function findMoveCandidates(ex) {
    var all = EVv2.getEditableExercises();
    var topicId = getTopicId(ex);
    return all.filter(function (cand) {
      return cand !== ex && EVv2.ExerciseEditor.canHoldSubQuestions(cand) && getTopicId(cand) === topicId;
    });
  }

  function labelForExercise(ex) {
    var first = ex.subQuestions && ex.subQuestions[0];
    var preview = first ? truncate(first.body.text, 18) : "(中問なし・空の大問)";
    return preview + "  [" + ex.exerciseId.slice(-8) + "]";
  }

  // ---- フィールドUI部品 ----

  function registerField(el, applyFn) {
    pendingFieldReaders.push({ el: el, apply: applyFn });
  }

  function buildTextField(labelText, initialText, applyFn, rows) {
    var group = document.createElement("div");
    group.className = "field-group edit-field";
    var label = document.createElement("span");
    label.className = "eyebrow";
    label.textContent = labelText;
    group.appendChild(label);
    var textarea = document.createElement("textarea");
    textarea.className = "edit-textarea";
    textarea.value = initialText || "";
    textarea.rows = rows || 3;
    group.appendChild(textarea);
    registerField(textarea, applyFn);
    return group;
  }

  function buildSymbolChoice(initialSymbol, applyFn) {
    var group = document.createElement("div");
    group.className = "field-group edit-field";
    var label = document.createElement("span");
    label.className = "eyebrow";
    label.textContent = "正解";
    group.appendChild(label);
    var wrap = document.createElement("div");
    wrap.className = "chip-grid fill";
    var chip = EVv2.createChipGroup(wrap, {
      items: [{ value: "○", label: "○" }, { value: "×", label: "×" }],
      value: initialSymbol === "×" ? "×" : "○",
    });
    group.appendChild(wrap);
    registerField({ get value() { return chip.getValue(); } }, applyFn);
    return group;
  }

  function buildCommonHeader(ex, handler) {
    var frag = document.createDocumentFragment();
    var structureLevels = ["theme", "section", "topic"]
      .map(function (k) { return ex.structure && ex.structure[k] ? ex.structure[k].titleRaw.text : null; })
      .filter(Boolean);
    var meta = document.createElement("p");
    meta.className = "edit-meta-line";
    meta.textContent = structureLevels.join(" › ") || "(分類なし)";
    frag.appendChild(meta);

    var badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = handler ? handler.label : ex.exerciseType;
    frag.appendChild(badge);
    return frag;
  }

  // ---- true_false（○×）の中問（グループメンバー）行 ----
  // 大問＝共有指示文グループ、中問＝グループ内の1文。exerciseEditor.jsのgetGroupId/
  // findGroupMembers/listOtherGroupsInTopicが動的にグループを解決する
  // （subQuestionsのような配列を持たず、exercises配列上はフラットな兄弟のため）。

  function buildTrueFalseMemberRow(member, index) {
    var row = document.createElement("div");
    row.className = "edit-subquestion-row";

    var heading = document.createElement("div");
    heading.className = "edit-subquestion-heading";
    heading.textContent = "中問" + (index + 1);
    row.appendChild(heading);

    var span = member.prompt || member.body;
    row.appendChild(buildTextField("本文", span ? span.text : "", function (v) {
      EVv2.ExerciseEditor.updateBodyText(member, v);
    }, 3));
    row.appendChild(buildSymbolChoice(member.judgement ? member.judgement.symbolRaw.text : "○", function (v) {
      EVv2.ExerciseEditor.updateJudgementSymbol(member, v);
    }));
    row.appendChild(buildTextField("解説", member.explanation ? member.explanation.raw.text : "", function (v) {
      EVv2.ExerciseEditor.updateExplanationText(member, v);
    }, 2));

    var actions = document.createElement("div");
    actions.className = "edit-subquestion-actions";

    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "edit-structural-btn danger-btn";
    deleteBtn.textContent = "この中問を削除";
    deleteBtn.addEventListener("click", function () {
      EVv2.confirmDialog("この中問を削除しますか？元に戻せません。").then(function (ok) {
        if (!ok) return;
        applyFormToLiveEx();
        EVv2.ExerciseEditor.deleteExercise(EVv2.getEditableExercises(), member);
        EVv2.commitDataEdit();
        renderBody();
      });
    });
    actions.appendChild(deleteBtn);

    var candidates = EVv2.ExerciseEditor.listOtherGroupsInTopic(EVv2.getEditableExercises(), member);
    if (candidates.length > 0) {
      var select = document.createElement("select");
      select.className = "edit-move-select";
      var placeholderOpt = document.createElement("option");
      placeholderOpt.value = "";
      placeholderOpt.textContent = "移動先の大問を選択…";
      select.appendChild(placeholderOpt);
      candidates.forEach(function (cand, i) {
        var opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = truncate(cand.instructionRaw ? cand.instructionRaw.text : "(指示文なし)", 22);
        select.appendChild(opt);
      });

      var moveBtn = document.createElement("button");
      moveBtn.type = "button";
      moveBtn.className = "edit-structural-btn";
      moveBtn.textContent = "別の大問へ移動";
      moveBtn.addEventListener("click", function () {
        if (!select.value) return;
        var dest = candidates[Number(select.value)];
        applyFormToLiveEx();
        EVv2.ExerciseEditor.moveGroupMember(member, dest);
        EVv2.commitDataEdit();
        renderBody();
      });

      actions.appendChild(select);
      actions.appendChild(moveBtn);
    }

    row.appendChild(actions);
    return row;
  }

  function renderTrueFalseGroup() {
    var exercises = EVv2.getEditableExercises();
    var members = EVv2.ExerciseEditor.findGroupMembers(exercises, currentGroupId, "true_false");

    if (members.length === 0) {
      var gone = document.createElement("p");
      gone.className = "edit-note";
      gone.textContent = "この大問の中問が見つかりませんでした（削除された可能性があります）。";
      bodyEl.appendChild(gone);
      return;
    }

    bodyEl.appendChild(buildCommonHeader(members[0], EVv2.registry.true_false));

    bodyEl.appendChild(buildTextField("大問（共通の指示文）", EVv2.ExerciseEditor.getGroupInstructionText(members), function (v) {
      EVv2.ExerciseEditor.updateGroupInstructionText(members, v);
    }, 3));

    var note = document.createElement("p");
    note.className = "edit-note";
    note.textContent = "この指示文は中問" + members.length + "件で共有されています。ここを変更すると全ての中問に反映されます。";
    bodyEl.appendChild(note);

    members.forEach(function (member, i) {
      bodyEl.appendChild(buildTrueFalseMemberRow(member, i));
    });

    var addMemberBtn = document.createElement("button");
    addMemberBtn.type = "button";
    addMemberBtn.className = "edit-structural-btn";
    addMemberBtn.textContent = "＋ 中問を追加";
    addMemberBtn.addEventListener("click", function () {
      applyFormToLiveEx();
      EVv2.ExerciseEditor.addGroupMember(exercises, members);
      EVv2.commitDataEdit();
      renderBody();
    });
    bodyEl.appendChild(addMemberBtn);

    var hr = document.createElement("hr");
    hr.className = "edit-section-divider";
    bodyEl.appendChild(hr);

    var structSection = document.createElement("div");
    structSection.className = "edit-structural-section";

    var addGroupBtn = document.createElement("button");
    addGroupBtn.type = "button";
    addGroupBtn.className = "edit-structural-btn";
    addGroupBtn.textContent = "＋ 新しい大問をこの後に追加";
    addGroupBtn.addEventListener("click", function () {
      applyFormToLiveEx();
      var newEx = EVv2.ExerciseEditor.createTrueFalseGroup(exercises, members[members.length - 1]);
      EVv2.commitDataEdit();
      openScreen(newEx);
    });
    structSection.appendChild(addGroupBtn);

    var deleteGroupBtn = document.createElement("button");
    deleteGroupBtn.type = "button";
    deleteGroupBtn.className = "edit-structural-btn danger-btn";
    deleteGroupBtn.textContent = "この大問を削除（中問" + members.length + "件をすべて削除）";
    deleteGroupBtn.addEventListener("click", function () {
      EVv2.confirmDialog("この大問（中問" + members.length + "件すべて）を削除しますか？元に戻せません。").then(function (ok) {
        if (!ok) return;
        EVv2.ExerciseEditor.deleteGroup(exercises, members);
        EVv2.commitDataEdit();
        closeScreen();
      });
    });
    structSection.appendChild(deleteGroupBtn);

    bodyEl.appendChild(structSection);
  }

  // ---- 中問（subQuestions）行（multi_blank専用。大問＝Exercise自体が既にグループなので、
  // true_falseと違って動的なグループ解決は不要） ----

  function buildSubQuestionRow(ex, sq, index) {
    var row = document.createElement("div");
    row.className = "edit-subquestion-row";

    var heading = document.createElement("div");
    heading.className = "edit-subquestion-heading";
    heading.textContent = "中問" + (index + 1);
    row.appendChild(heading);

    row.appendChild(buildTextField("本文", sq.body.text, function (v) {
      EVv2.ExerciseEditor.updateSubQuestionBody(ex, index, v);
    }, 3));
    row.appendChild(buildTextField("正解", sq.expectedAnswer.text, function (v) {
      EVv2.ExerciseEditor.updateSubQuestionAnswer(ex, index, v);
    }, 2));

    var actions = document.createElement("div");
    actions.className = "edit-subquestion-actions";

    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "edit-structural-btn danger-btn";
    deleteBtn.textContent = "この中問を削除";
    deleteBtn.addEventListener("click", function () {
      EVv2.confirmDialog("この中問を削除しますか？元に戻せません。").then(function (ok) {
        if (!ok) return;
        applyFormToLiveEx();
        EVv2.ExerciseEditor.deleteSubQuestion(ex, index);
        EVv2.commitDataEdit();
        renderBody();
      });
    });
    actions.appendChild(deleteBtn);

    var candidates = findMoveCandidates(ex);
    if (candidates.length > 0) {
      var select = document.createElement("select");
      select.className = "edit-move-select";
      var placeholderOpt = document.createElement("option");
      placeholderOpt.value = "";
      placeholderOpt.textContent = "移動先の大問を選択…";
      select.appendChild(placeholderOpt);
      candidates.forEach(function (cand) {
        var opt = document.createElement("option");
        opt.value = cand.exerciseId;
        opt.textContent = labelForExercise(cand);
        select.appendChild(opt);
      });

      var moveBtn = document.createElement("button");
      moveBtn.type = "button";
      moveBtn.className = "edit-structural-btn";
      moveBtn.textContent = "別の大問へ移動";
      moveBtn.addEventListener("click", function () {
        var destId = select.value;
        if (!destId) return;
        var dest = candidates.filter(function (c) { return c.exerciseId === destId; })[0];
        if (!dest) return;
        applyFormToLiveEx();
        EVv2.ExerciseEditor.moveSubQuestion(ex, index, dest);
        EVv2.commitDataEdit();
        renderBody();
      });

      actions.appendChild(select);
      actions.appendChild(moveBtn);
    }

    row.appendChild(actions);
    return row;
  }

  function buildAddSubQuestionButton(ex) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "edit-structural-btn";
    btn.textContent = "＋ 中問を追加";
    btn.addEventListener("click", function () {
      applyFormToLiveEx();
      EVv2.ExerciseEditor.addSubQuestion(ex, "", "");
      EVv2.commitDataEdit();
      renderBody();
    });
    return btn;
  }

  // ---- 大問レベルの構造編集セクション ----

  function buildStructuralSection(ex) {
    var section = document.createElement("div");
    section.className = "edit-structural-section";

    if (EVv2.ExerciseEditor.isCreatableType(ex.exerciseType)) {
      var addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "edit-structural-btn";
      addBtn.textContent = "＋ 新しい大問をこの後に追加";
      addBtn.addEventListener("click", function () {
        applyFormToLiveEx();
        var exercises = EVv2.getEditableExercises();
        var newEx = EVv2.ExerciseEditor.addExercise(exercises, ex);
        EVv2.commitDataEdit();
        openScreen(newEx);
      });
      section.appendChild(addBtn);
    }

    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "edit-structural-btn danger-btn";
    deleteBtn.textContent = "この大問を削除";
    deleteBtn.addEventListener("click", function () {
      EVv2.confirmDialog("この大問を削除しますか？元に戻せません。").then(function (ok) {
        if (!ok) return;
        var exercises = EVv2.getEditableExercises();
        EVv2.ExerciseEditor.deleteExercise(exercises, ex);
        EVv2.commitDataEdit();
        closeScreen();
      });
    });
    section.appendChild(deleteBtn);

    return section;
  }

  // ---- 画面本体の描画 ----

  function renderBody() {
    var ex = currentEx;
    bodyEl.innerHTML = "";
    pendingFieldReaders = [];

    // true_false（○×）は「大問＝共有指示文グループ」という別モデルなので、専用の描画に委譲する
    // （currentGroupId起点でグループを毎回再取得するため、currentEx自体がグループから
    // 抜けていても正しく描画できる）。
    if (ex.exerciseType === "true_false") {
      renderTrueFalseGroup();
      return;
    }

    var handler = EVv2.registry[ex.exerciseType];
    bodyEl.appendChild(buildCommonHeader(ex, handler));

    var knownType = ex.exerciseType === "multi_blank";
    var inRealArray = EVv2.getEditableExercises().indexOf(ex) !== -1;

    if (!knownType || !inRealArray) {
      var note = document.createElement("p");
      note.className = "edit-note";
      note.textContent = "この問題は編集モードにまだ対応していません。";
      bodyEl.appendChild(note);
      return;
    }

    if (EVv2.ExerciseEditor.canHoldSubQuestions(ex)) {
      ex.subQuestions.forEach(function (sq, i) {
        bodyEl.appendChild(buildSubQuestionRow(ex, sq, i));
      });
      bodyEl.appendChild(buildAddSubQuestionButton(ex));
    } else {
      var note2 = document.createElement("p");
      note2.className = "edit-note";
      note2.textContent =
        "この大問は共有本文（1つの問題文の中に複数の空欄マーカーを持つ形式）のため、問題文はここでは編集できません。正解のみ編集できます。";
      bodyEl.appendChild(note2);
      (ex.expectedAnswer || []).forEach(function (item, i) {
        bodyEl.appendChild(buildTextField("正解（空欄" + (i + 1) + "）", item.answerText.text, function (v) {
          EVv2.ExerciseEditor.updateExpectedAnswerText(ex, i, v);
        }, 2));
      });
    }
    bodyEl.appendChild(buildTextField("解説", ex.explanation ? ex.explanation.raw.text : "", function (v) {
      EVv2.ExerciseEditor.updateExplanationText(ex, v);
    }, 3));

    var hr = document.createElement("hr");
    hr.className = "edit-section-divider";
    bodyEl.appendChild(hr);
    bodyEl.appendChild(buildStructuralSection(ex));
  }

  function openScreen(ex) {
    ensureEls();

    // single_blankは表示上の別バリエーションに過ぎず、編集の実体は常に対応するmulti_blank
    // （まとめられた方）とする。見つからない場合はそのままrenderBodyへ渡し、「未対応」表示にする。
    if (ex.exerciseType === "single_blank") {
      var sibling = EVv2.ExerciseEditor.findMultiBlankSibling(EVv2.getEditableExercises(), ex);
      if (sibling) ex = sibling;
    }

    currentEx = ex;
    currentGroupId = ex.exerciseType === "true_false" ? EVv2.ExerciseEditor.getGroupId(ex) : null;
    screen.hidden = false;
    renderBody();
  }

  EVv2.openEditScreen = openScreen;
  EVv2.closeEditScreen = closeScreen;
})();
