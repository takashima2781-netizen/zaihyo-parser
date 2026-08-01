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

  // v2-29: registry.jsの学習画面ドラッグハンドルと同じ見た目（≡アイコン）を使う。
  var DRAG_HANDLE_ICON_SVG =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

  var screen = null;
  var bodyEl = null;
  var errorEl = null;
  var cancelBtn = null;
  var saveBtn = null;
  var currentEx = null;
  // true_false（○×）のグループ編集でのみ使う。開いた時点のグループIDを固定で覚えておき、
  // 中問の削除・移動でグループの中身が変わっても（currentEx自体が抜けても）再描画のたびに
  // このIDからメンバーを再取得する（EVv2.ExerciseEditor.findGroupMembers参照）。
  var currentGroupId = null;
  var pendingFieldReaders = [];
  // v2-28(共有本文型multi_blankの構造化編集): 通常のテキストフィールド群
  // （pendingFieldReaders）とは別に、bodySegments一式をまとめて検証・反映する必要があるため、
  // 専用のvalidate/commitを持つオブジェクトをここに保持する。true_false・subQuestions方式・
  // 共有本文を持たない画面では常にnull。
  var activeSegmentEditor = null;

  function ensureEls() {
    if (screen) return;
    screen = document.getElementById("edit-screen");
    bodyEl = document.getElementById("edit-screen-body");
    errorEl = document.getElementById("edit-screen-error");
    cancelBtn = document.getElementById("edit-screen-cancel-btn");
    saveBtn = document.getElementById("edit-screen-save-btn");
    cancelBtn.addEventListener("click", closeScreen);
    saveBtn.addEventListener("click", function () {
      if (activeSegmentEditor) {
        var result = activeSegmentEditor.validate();
        if (!result.ok) {
          showSaveError(result.error);
          return;
        }
        activeSegmentEditor.commit();
      }
      applyFormToLiveEx();
      EVv2.commitDataEdit();
      closeScreen();
    });
  }

  function showSaveError(msg) {
    if (!errorEl) return;
    errorEl.hidden = false;
    errorEl.textContent = msg;
  }

  function clearSaveError() {
    if (!errorEl) return;
    errorEl.hidden = true;
    errorEl.textContent = "";
  }

  function closeScreen() {
    if (screen) screen.hidden = true;
    if (bodyEl) bodyEl.innerHTML = "";
    clearSaveError();
    currentEx = null;
    currentGroupId = null;
    activeSegmentEditor = null;
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

  function buildTrueFalseMemberRow(member, index, count) {
    var row = document.createElement("div");
    row.className = "edit-subquestion-row";

    var headingRow = document.createElement("div");
    headingRow.className = "edit-subquestion-heading-row";
    var handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.innerHTML = DRAG_HANDLE_ICON_SVG;
    handle.setAttribute("aria-label", "中問" + (index + 1) + "をドラッグして並べ替え");
    headingRow.appendChild(handle);
    var heading = document.createElement("span");
    heading.className = "edit-subquestion-heading";
    heading.textContent = "中問" + (index + 1);
    headingRow.appendChild(heading);
    row.appendChild(headingRow);

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

    // v2-29: ドラッグの代替操作。groupMemberCountはrenderTrueFalseGroup側から
    // row要素のdata属性経由ではなく、呼び出し時点のmembers配列長をクロージャで渡す
    // （buildTrueFalseMemberRowの第3引数）。
    var upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "segment-move-btn";
    upBtn.textContent = "↑";
    upBtn.setAttribute("aria-label", "上へ移動");
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", function () {
      applyFormToLiveEx();
      EVv2.ExerciseEditor.reorderGroupMembers(EVv2.getEditableExercises(), EVv2.ExerciseEditor.findGroupMembers(EVv2.getEditableExercises(), currentGroupId, "true_false"), index, index - 1);
      EVv2.commitDataEdit();
      renderBody();
    });
    actions.appendChild(upBtn);

    var downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "segment-move-btn";
    downBtn.textContent = "↓";
    downBtn.setAttribute("aria-label", "下へ移動");
    downBtn.disabled = index >= count - 1;
    downBtn.addEventListener("click", function () {
      var members = EVv2.ExerciseEditor.findGroupMembers(EVv2.getEditableExercises(), currentGroupId, "true_false");
      if (index >= members.length - 1) return;
      applyFormToLiveEx();
      EVv2.ExerciseEditor.reorderGroupMembers(EVv2.getEditableExercises(), members, index, index + 1);
      EVv2.commitDataEdit();
      renderBody();
    });
    actions.appendChild(downBtn);

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

    var memberListEl = document.createElement("div");
    memberListEl.className = "true-false-member-list";
    members.forEach(function (member, i) {
      memberListEl.appendChild(buildTrueFalseMemberRow(member, i, members.length));
    });
    bodyEl.appendChild(memberListEl);

    EVv2.attachDragReorder({
      container: memberListEl,
      handleSelector: ".drag-handle",
      onDrop: function (fromIndex, toIndex) {
        applyFormToLiveEx();
        EVv2.ExerciseEditor.reorderGroupMembers(exercises, members, fromIndex, toIndex);
        EVv2.commitDataEdit();
        renderBody();
      },
      onCancel: function () {
        renderBody();
      },
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

  function buildSubQuestionRow(ex, sq, index, count) {
    var row = document.createElement("div");
    row.className = "edit-subquestion-row";

    var headingRow = document.createElement("div");
    headingRow.className = "edit-subquestion-heading-row";
    var handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.innerHTML = DRAG_HANDLE_ICON_SVG;
    handle.setAttribute("aria-label", "中問" + (index + 1) + "をドラッグして並べ替え");
    headingRow.appendChild(handle);
    var heading = document.createElement("span");
    heading.className = "edit-subquestion-heading";
    heading.textContent = "中問" + (index + 1);
    headingRow.appendChild(heading);
    row.appendChild(headingRow);

    row.appendChild(buildTextField("本文", sq.body.text, function (v) {
      EVv2.ExerciseEditor.updateSubQuestionBody(ex, index, v);
    }, 3));
    row.appendChild(buildTextField("正解", sq.expectedAnswer.text, function (v) {
      EVv2.ExerciseEditor.updateSubQuestionAnswer(ex, index, v);
    }, 2));

    var actions = document.createElement("div");
    actions.className = "edit-subquestion-actions";

    var upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "segment-move-btn";
    upBtn.textContent = "↑";
    upBtn.setAttribute("aria-label", "上へ移動");
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", function () {
      applyFormToLiveEx();
      EVv2.ExerciseEditor.reorderSubQuestion(ex, index, index - 1);
      EVv2.commitDataEdit();
      renderBody();
    });
    actions.appendChild(upBtn);

    var downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "segment-move-btn";
    downBtn.textContent = "↓";
    downBtn.setAttribute("aria-label", "下へ移動");
    downBtn.disabled = index >= count - 1;
    downBtn.addEventListener("click", function () {
      applyFormToLiveEx();
      EVv2.ExerciseEditor.reorderSubQuestion(ex, index, index + 1);
      EVv2.commitDataEdit();
      renderBody();
    });
    actions.appendChild(downBtn);

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

  // ---- 共有本文型multi_blank（bodySegments方式）のブロックエディタ ----
  // 本文を「文章」「空欄」のブロック列として表示・編集する。exerciseEditor.jsの
  // buildSegmentDraft/validateSegmentDraft/applySegmentDraftがデータ側の実体を持ち、
  // ここではブロック一覧の描画と、並び替え・追加・削除操作のみを担当する。
  // 保存確定まではmountEl配下だけを再描画し（bodyEl全体は再描画しない）、他フィールド
  // （解説欄など）の入力途中の値を消さないようにする。

  function renderSegmentEditor(ex, mountEl) {
    var draft = EVv2.ExerciseEditor.buildSegmentDraft(ex);
    var blockListEl = document.createElement("div");
    blockListEl.className = "segment-block-list";
    mountEl.appendChild(blockListEl);

    function blankPositionLabel(index) {
      var before = draft.slice(0, index).filter(function (b) {
        return b.kind === "blank";
      }).length;
      return before + 1;
    }

    function buildBlockEl(block, index) {
      var card = document.createElement("div");
      card.className = "segment-block " + (block.kind === "blank" ? "segment-block-blank" : "segment-block-text");

      var headingRow = document.createElement("div");
      headingRow.className = "edit-subquestion-heading-row";
      var handle = document.createElement("span");
      handle.className = "drag-handle";
      handle.innerHTML = DRAG_HANDLE_ICON_SVG;
      handle.setAttribute(
        "aria-label",
        (block.kind === "blank" ? "空欄" + blankPositionLabel(index) : "文章ブロック") + "をドラッグして並べ替え"
      );
      headingRow.appendChild(handle);
      var heading = document.createElement("span");
      heading.className = "edit-subquestion-heading";
      heading.textContent = block.kind === "blank" ? "空欄" + blankPositionLabel(index) : "文章";
      headingRow.appendChild(heading);
      card.appendChild(headingRow);

      if (block.kind === "text") {
        var textarea = document.createElement("textarea");
        textarea.className = "edit-textarea";
        textarea.rows = 2;
        textarea.value = block.text;
        textarea.addEventListener("input", function () {
          block.text = textarea.value;
        });
        card.appendChild(textarea);
      } else {
        var answerGroup = document.createElement("div");
        answerGroup.className = "field-group edit-field";
        var answerLabel = document.createElement("span");
        answerLabel.className = "eyebrow";
        answerLabel.textContent = "正解";
        answerGroup.appendChild(answerLabel);
        var answerInput = document.createElement("textarea");
        answerInput.className = "edit-textarea";
        answerInput.rows = 2;
        answerInput.value = block.answerText;
        answerInput.addEventListener("input", function () {
          block.answerText = answerInput.value;
        });
        answerGroup.appendChild(answerInput);
        card.appendChild(answerGroup);

        var explGroup = document.createElement("div");
        explGroup.className = "field-group edit-field";
        var explLabel = document.createElement("span");
        explLabel.className = "eyebrow";
        explLabel.textContent = "解説（任意）";
        explGroup.appendChild(explLabel);
        var explInput = document.createElement("textarea");
        explInput.className = "edit-textarea";
        explInput.rows = 2;
        explInput.value = block.explanationText;
        explInput.addEventListener("input", function () {
          block.explanationText = explInput.value;
        });
        explGroup.appendChild(explInput);
        card.appendChild(explGroup);
      }

      var actions = document.createElement("div");
      actions.className = "edit-subquestion-actions segment-block-actions";

      var upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "segment-move-btn";
      upBtn.textContent = "↑";
      upBtn.setAttribute("aria-label", "上へ移動");
      upBtn.disabled = index === 0;
      upBtn.addEventListener("click", function () {
        var tmp = draft[index - 1];
        draft[index - 1] = draft[index];
        draft[index] = tmp;
        renderBlocks();
      });
      actions.appendChild(upBtn);

      var downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "segment-move-btn";
      downBtn.textContent = "↓";
      downBtn.setAttribute("aria-label", "下へ移動");
      downBtn.disabled = index === draft.length - 1;
      downBtn.addEventListener("click", function () {
        var tmp = draft[index + 1];
        draft[index + 1] = draft[index];
        draft[index] = tmp;
        renderBlocks();
      });
      actions.appendChild(downBtn);

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "edit-structural-btn danger-btn";
      deleteBtn.textContent = block.kind === "blank" ? "この空欄を削除" : "この文章を削除";
      deleteBtn.addEventListener("click", function () {
        draft.splice(index, 1);
        renderBlocks();
      });
      actions.appendChild(deleteBtn);

      card.appendChild(actions);
      return card;
    }

    function renderBlocks() {
      clearSaveError();
      blockListEl.innerHTML = "";
      draft.forEach(function (block, index) {
        blockListEl.appendChild(buildBlockEl(block, index));
      });
    }

    EVv2.attachDragReorder({
      container: blockListEl,
      handleSelector: ".drag-handle",
      onDrop: function (fromIndex, toIndex) {
        var moved = draft.splice(fromIndex, 1)[0];
        draft.splice(toIndex, 0, moved);
        renderBlocks();
      },
      onCancel: function () {
        renderBlocks();
      },
    });

    renderBlocks();

    var addTextBtn = document.createElement("button");
    addTextBtn.type = "button";
    addTextBtn.className = "edit-structural-btn";
    addTextBtn.textContent = "＋ 文章を追加";
    addTextBtn.addEventListener("click", function () {
      draft.push(EVv2.ExerciseEditor.createTextDraftBlock());
      renderBlocks();
    });
    mountEl.appendChild(addTextBtn);

    var addBlankBtn = document.createElement("button");
    addBlankBtn.type = "button";
    addBlankBtn.className = "edit-structural-btn";
    addBlankBtn.textContent = "＋ 空欄を追加";
    addBlankBtn.addEventListener("click", function () {
      draft.push(EVv2.ExerciseEditor.createBlankDraftBlock());
      renderBlocks();
    });
    mountEl.appendChild(addBlankBtn);

    return {
      validate: function () {
        return EVv2.ExerciseEditor.validateSegmentDraft(draft);
      },
      commit: function () {
        EVv2.ExerciseEditor.applySegmentDraft(ex, draft);
      },
    };
  }

  // ---- 並べ替え問題（ordering）の項目エディタ ----
  // カードを正しい順番に並べる＝そのままcorrectOrderになる、という設計
  // （exerciseEditor.js ExerciseEditor.buildOrderingDraft/applyOrderingDraft参照）。
  // segment editorと同じ「ローカルdraft＋validate/commit」方式。

  function renderOrderingEditor(ex, mountEl) {
    var draft = EVv2.ExerciseEditor.buildOrderingDraft(ex);
    // v2-31(元問題との統合): 「元問題の一つの表現方法が並べ替え問題」という考え方
    // （ユーザー指示、2026-08-01）にもとづき、完成文の凍結コピーは持たない。変換元が
    // 独立小問(subQuestion)単位で特定できる場合、その本文・正解をこの画面から直接編集し、
    // 保存時に元問題へ書き戻す。文節を連結した結果が本文＋正解と完全一致していない場合は
    // 保存をブロックする（ユーザー指示: 一致していない状態では保存できないようにする）。
    var isSentenceMode = ex.assembledFromSource === true;

    var sourceEx = null;
    var subQuestion = null;
    if (isSentenceMode && ex.sourceExerciseId) {
      sourceEx =
        EVv2.getEditableExercises().filter(function (e) {
          return e.exerciseId === ex.sourceExerciseId;
        })[0] || null;
      if (sourceEx && ex.sourceSubQuestionIndex != null && Array.isArray(sourceEx.subQuestions)) {
        subQuestion = sourceEx.subQuestions[ex.sourceSubQuestionIndex] || null;
      }
    }

    var note = document.createElement("p");
    note.className = "edit-note";
    note.textContent = "並んでいる順番がそのまま正解の順序になります。学習画面では毎回シャッフルして出題されます。";
    mountEl.appendChild(note);

    var bodyTextarea = null;
    var answerTextarea = null;
    var reconstructionLine = null;

    function currentReferenceText() {
      return bodyTextarea.value + " " + answerTextarea.value;
    }

    function updateReconstructionLine() {
      if (!reconstructionLine) return;
      var joined = draft
        .map(function (item) {
          return item.text;
        })
        .join("");
      var matches = joined === currentReferenceText();
      reconstructionLine.className = "phrase-reorder-reconstruction-line" + (matches ? " phrase-reorder-match" : " phrase-reorder-mismatch");
      reconstructionLine.textContent =
        (matches ? "✓ 本文＋正解の連結と一致しています: " : "⚠ 本文＋正解の連結と一致しません（この状態では保存できません）: ") + joined;
    }

    if (isSentenceMode) {
      if (subQuestion) {
        var sourceNote = document.createElement("p");
        sourceNote.className = "edit-note";
        sourceNote.textContent =
          "この問題は元の問題（多重穴埋め）の一つの表現方法です。下の「本文」「正解」を編集すると元の問題にも反映されます。" +
          "文節を連結した結果が本文＋正解と完全に一致していないと保存できません。";
        mountEl.appendChild(sourceNote);

        var bodyGroup = document.createElement("div");
        bodyGroup.className = "field-group edit-field";
        var bodyLabel = document.createElement("span");
        bodyLabel.className = "eyebrow";
        bodyLabel.textContent = "本文（元の問題と共有）";
        bodyGroup.appendChild(bodyLabel);
        bodyTextarea = document.createElement("textarea");
        bodyTextarea.className = "edit-textarea";
        bodyTextarea.rows = 3;
        bodyTextarea.value = subQuestion.body.text;
        bodyTextarea.addEventListener("input", updateReconstructionLine);
        bodyGroup.appendChild(bodyTextarea);
        mountEl.appendChild(bodyGroup);

        var answerGroup = document.createElement("div");
        answerGroup.className = "field-group edit-field";
        var answerLabel = document.createElement("span");
        answerLabel.className = "eyebrow";
        answerLabel.textContent = "正解（元の問題と共有）";
        answerGroup.appendChild(answerLabel);
        answerTextarea = document.createElement("textarea");
        answerTextarea.className = "edit-textarea";
        answerTextarea.rows = 2;
        answerTextarea.value = subQuestion.expectedAnswer.text;
        answerTextarea.addEventListener("input", updateReconstructionLine);
        answerGroup.appendChild(answerTextarea);
        mountEl.appendChild(answerGroup);

        reconstructionLine = document.createElement("p");
        reconstructionLine.className = "phrase-reorder-reconstruction-line";
        mountEl.appendChild(reconstructionLine);
      } else {
        var noLinkNote = document.createElement("p");
        noLinkNote.className = "edit-note";
        noLinkNote.textContent =
          "元の問題と自動連携できません（見つからないか、この形式にはまだ対応していません）。文節の内容はここで手動管理してください。";
        mountEl.appendChild(noLinkNote);
      }
    }

    var listEl = document.createElement("div");
    listEl.className = "ordering-editor-list";
    mountEl.appendChild(listEl);

    function buildItemEl(item, index) {
      var card = document.createElement("div");
      card.className = "segment-block";

      var headingRow = document.createElement("div");
      headingRow.className = "edit-subquestion-heading-row";
      var handle = document.createElement("span");
      handle.className = "drag-handle";
      handle.innerHTML = DRAG_HANDLE_ICON_SVG;
      handle.setAttribute("aria-label", "項目" + (index + 1) + "をドラッグして並べ替え");
      headingRow.appendChild(handle);
      var heading = document.createElement("span");
      heading.className = "edit-subquestion-heading";
      heading.textContent = "項目" + (index + 1) + "（正解順で" + (index + 1) + "番目）";
      headingRow.appendChild(heading);
      card.appendChild(headingRow);

      var textarea = document.createElement("textarea");
      textarea.className = "edit-textarea";
      textarea.rows = 2;
      textarea.value = item.text;
      textarea.addEventListener("input", function () {
        item.text = textarea.value;
        updateReconstructionLine();
      });
      card.appendChild(textarea);

      var actions = document.createElement("div");
      actions.className = "edit-subquestion-actions segment-block-actions";

      var upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "segment-move-btn";
      upBtn.textContent = "↑";
      upBtn.setAttribute("aria-label", "上へ移動");
      upBtn.disabled = index === 0;
      upBtn.addEventListener("click", function () {
        var tmp = draft[index - 1];
        draft[index - 1] = draft[index];
        draft[index] = tmp;
        renderItems();
      });
      actions.appendChild(upBtn);

      var downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "segment-move-btn";
      downBtn.textContent = "↓";
      downBtn.setAttribute("aria-label", "下へ移動");
      downBtn.disabled = index === draft.length - 1;
      downBtn.addEventListener("click", function () {
        var tmp = draft[index + 1];
        draft[index + 1] = draft[index];
        draft[index] = tmp;
        renderItems();
      });
      actions.appendChild(downBtn);

      // v2-30(文節ならびかえ): 分割はまず「テキスト編集＋項目追加」で対応する方針
      // （ユーザー指示。使ってみて分割ボタンが必要になったら別途追加する）。結合は区切りの
      // 調整で最も頻度が高い操作と見込まれるため、文章復元モード限定でボタンを用意する。
      if (isSentenceMode && index < draft.length - 1) {
        var mergeBtn = document.createElement("button");
        mergeBtn.type = "button";
        mergeBtn.className = "segment-move-btn";
        mergeBtn.textContent = "次と結合";
        mergeBtn.setAttribute("aria-label", "次の項目と結合する");
        mergeBtn.addEventListener("click", function () {
          draft[index].text = draft[index].text + draft[index + 1].text;
          draft.splice(index + 1, 1);
          renderItems();
        });
        actions.appendChild(mergeBtn);
      }

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "edit-structural-btn danger-btn";
      deleteBtn.textContent = "この項目を削除";
      deleteBtn.addEventListener("click", function () {
        draft.splice(index, 1);
        renderItems();
      });
      actions.appendChild(deleteBtn);

      card.appendChild(actions);
      return card;
    }

    function renderItems() {
      clearSaveError();
      listEl.innerHTML = "";
      draft.forEach(function (item, index) {
        listEl.appendChild(buildItemEl(item, index));
      });
      updateReconstructionLine();
    }

    EVv2.attachDragReorder({
      container: listEl,
      handleSelector: ".drag-handle",
      onDrop: function (fromIndex, toIndex) {
        var moved = draft.splice(fromIndex, 1)[0];
        draft.splice(toIndex, 0, moved);
        renderItems();
      },
      onCancel: function () {
        renderItems();
      },
    });

    renderItems();

    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "edit-structural-btn";
    addBtn.textContent = "＋ 項目を追加";
    addBtn.addEventListener("click", function () {
      draft.push(EVv2.ExerciseEditor.createOrderingDraftItem());
      renderItems();
    });
    mountEl.appendChild(addBtn);

    return {
      validate: function () {
        var base = EVv2.ExerciseEditor.validateOrderingDraft(draft);
        if (!base.ok) return base;
        if (subQuestion) {
          var joined = draft
            .map(function (item) {
              return item.text;
            })
            .join("");
          if (joined !== currentReferenceText()) {
            return { ok: false, error: "文節を連結した結果が本文＋正解と一致しません。区切り・並び・本文/正解の文言を確認してください。" };
          }
        }
        return { ok: true, error: null };
      },
      commit: function () {
        if (subQuestion) {
          EVv2.ExerciseEditor.updateSubQuestionBody(sourceEx, ex.sourceSubQuestionIndex, bodyTextarea.value);
          EVv2.ExerciseEditor.updateSubQuestionAnswer(sourceEx, ex.sourceSubQuestionIndex, answerTextarea.value);
        }
        EVv2.ExerciseEditor.applyOrderingDraft(ex, draft);
      },
    };
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
    activeSegmentEditor = null;
    clearSaveError();

    // true_false（○×）は「大問＝共有指示文グループ」という別モデルなので、専用の描画に委譲する
    // （currentGroupId起点でグループを毎回再取得するため、currentEx自体がグループから
    // 抜けていても正しく描画できる）。
    if (ex.exerciseType === "true_false") {
      renderTrueFalseGroup();
      return;
    }

    var handler = EVv2.registry[ex.exerciseType];
    bodyEl.appendChild(buildCommonHeader(ex, handler));

    var knownType = ex.exerciseType === "multi_blank" || ex.exerciseType === "ordering";
    var inRealArray = EVv2.getEditableExercises().indexOf(ex) !== -1;

    if (!knownType || !inRealArray) {
      var note = document.createElement("p");
      note.className = "edit-note";
      note.textContent = "この問題は編集モードにまだ対応していません。";
      bodyEl.appendChild(note);
      return;
    }

    if (ex.exerciseType === "ordering") {
      // v2-29: 並べ替え問題。項目一覧（正しい順に並べる＝そのまま正解になる）はdraft方式で
      // 検証・一括反映する（activeSegmentEditorをsegment editorと共用、同じ{validate,commit}）。
      bodyEl.appendChild(buildTextField("問題文", ex.body ? ex.body.text : "", function (v) {
        EVv2.ExerciseEditor.updateBodyText(ex, v);
      }, 3));

      var orderingLabel = document.createElement("span");
      orderingLabel.className = "eyebrow";
      orderingLabel.textContent = "並べ替え項目（正しい順）";
      bodyEl.appendChild(orderingLabel);
      var orderingContainer = document.createElement("div");
      orderingContainer.className = "segment-editor";
      bodyEl.appendChild(orderingContainer);
      activeSegmentEditor = renderOrderingEditor(ex, orderingContainer);
    } else {
      // multi_blankは1つのExerciseが既に「大問」そのものなので、true_falseのような
      // グループ横断更新は不要。このExercise自身のinstructionRawを直接編集する。
      bodyEl.appendChild(buildTextField("大問（共通の指示文）", ex.instructionRaw ? ex.instructionRaw.text : "", function (v) {
        EVv2.ExerciseEditor.updateInstructionText(ex, v);
      }, 3));

      if (EVv2.ExerciseEditor.canHoldSubQuestions(ex)) {
        var subQuestionListEl = document.createElement("div");
        subQuestionListEl.className = "subquestion-edit-list";
        ex.subQuestions.forEach(function (sq, i) {
          subQuestionListEl.appendChild(buildSubQuestionRow(ex, sq, i, ex.subQuestions.length));
        });
        bodyEl.appendChild(subQuestionListEl);

        EVv2.attachDragReorder({
          container: subQuestionListEl,
          handleSelector: ".drag-handle",
          onDrop: function (fromIndex, toIndex) {
            applyFormToLiveEx();
            EVv2.ExerciseEditor.reorderSubQuestion(ex, fromIndex, toIndex);
            EVv2.commitDataEdit();
            renderBody();
          },
          onCancel: function () {
            renderBody();
          },
        });

        bodyEl.appendChild(buildAddSubQuestionButton(ex));
      } else {
        // v2-28: 共有本文（1つの問題文の中に複数の空欄マーカーを持つ形式）は、文章／空欄の
        // ブロックエディタで編集する。本文中の空欄数・順序とexpectedAnswer等は
        // ExerciseEditor.applySegmentDraftが一括で再生成するため、ここでの個別編集はしない。
        var segmentLabel = document.createElement("span");
        segmentLabel.className = "eyebrow";
        segmentLabel.textContent = "問題文（文章・空欄のブロック）";
        bodyEl.appendChild(segmentLabel);
        var segmentContainer = document.createElement("div");
        segmentContainer.className = "segment-editor";
        bodyEl.appendChild(segmentContainer);
        activeSegmentEditor = renderSegmentEditor(ex, segmentContainer);
      }
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
