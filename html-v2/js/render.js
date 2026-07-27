// 1件のExerciseからカードDOMを構築する。
// レジストリに存在しないexerciseTypeは、判定・選択肢を持たない「未対応形式」カードとして
// 安全に表示する（クラッシュさせない・情報は原文のまま表示する）。
//
// v2-1(docs/v2_1_data_contract_investigation.md)で、ハンドラの getInteractionMode(ex) が
// "choice"（選択肢ボタン＋正誤判定）か "reveal"（解答を直接開示し、自己採点する形式）かを
// 明示的に選ぶようにした。
//
// v2-3(docs/v2_3_implementation_report.md)で、学習履歴（正誤回数・チェック状態）の表示・
// 記録を追加した。
//
// v2-5(docs/v2_5_implementation_report.md)で、全exerciseType共通のレイアウト順序を統一した:
//   問題文 → 回答UI → 正解／不正解 → 正しい解答 → 解説 → 学習状態 → 次の問題への導線
// 採点ロジック（isCorrect・recordAnswerの呼び出しタイミング）自体は一切変更していない。
// 表示の組み立て方のみを変更した。progressPanel（学習状態）はここで生成するが、DOMへの
// 追加（appendChild）は回答完了時まで遅延させる（＝カード末尾に来るようにするため）。
// id-line・answer-form-noteは診断情報として EVv2.DEBUG_MODE のときのみ表示する。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

function statusLabel(status) {
  if (status === EVv2.PROGRESS_STATUS.MASTERED) return "修得済み";
  if (status === EVv2.PROGRESS_STATUS.UNMASTERED) return "未修得";
  return "未回答";
}

// ---- v2-5: 全exerciseType共通の末尾セクション（正解/不正解 → 正しい解答 → 解説 → 学習状態 → 次へ） ----

// isCorrect: true/false（自動採点）| null（reveal自己採点前など、まだ判定していない場合はバナーを出さない）。
EVv2.createResultBanner = function (isCorrect) {
  if (isCorrect === null || isCorrect === undefined) return null;
  var el = document.createElement("div");
  el.className = "result-banner " + (isCorrect ? "result-banner-correct" : "result-banner-wrong");
  el.textContent = isCorrect ? "正解" : "不正解";
  return el;
};

EVv2.createCorrectAnswerLine = function (text) {
  var el = document.createElement("div");
  el.className = "correct-answer-line";
  el.textContent = "正しい解答: " + text;
  return el;
};

EVv2.createExplanationLine = function (text) {
  var el = document.createElement("div");
  el.className = "explanation-line";
  el.textContent = text ? "解説: " + text : "解説: （教材原文に解説なし）";
  return el;
};

EVv2.createSourceLine = function (sourceRefs) {
  var el = document.createElement("div");
  el.className = "source-line";
  el.textContent = "出典: " + sourceRefs.map(EVv2.formatSource).join(" ／ ");
  return el;
};

// 「次の問題へ」導線。onNextが渡された場合はそれを呼ぶ（1問ずつ学習するセッション画面が
// 「次の問題を描画し直す」処理を注入するために使う）。onNext省略時は従来どおり、
// DOM上で現在のカードの次の.ex-cardへスムーズスクロールするだけの軽量な機能
// （一覧表示という現行の画面構成はこちらを使う限り変更しない）。次のカードが無い場合は
// 「さらに読み込む」を先に実行してからスクロールする。
EVv2.createNextButton = function (card, onNext) {
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "next-btn";
  btn.textContent = "次の問題へ ↓";
  btn.addEventListener("click", function () {
    if (typeof onNext === "function") {
      onNext();
      return;
    }
    var next = card.nextElementSibling;
    if (!next) {
      var loadMoreBtn = document.getElementById("load-more-btn");
      if (loadMoreBtn && !loadMoreBtn.hidden) {
        loadMoreBtn.click();
        next = card.nextElementSibling;
      }
    }
    if (next && typeof next.scrollIntoView === "function") {
      next.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  return btn;
};

// 学習状態（progressPanel）＋「次の問題へ」を、回答が確定した瞬間に1回だけカード末尾へ追加する
// （未回答状態ではこの2つはDOMに存在しない＝誤って次へ進めない、という設計をそのまま満たす）。
// 再挑戦等で複数回呼ばれても、2回目以降はprogressPanelの表示更新のみ行い、DOMの二重追加はしない。
EVv2.finalizeAnsweredCard = function (card, progressPanel, rec, onNext) {
  if (progressPanel && rec) progressPanel.update(rec);
  if (card.dataset.trailingAppended === "1") return;
  card.dataset.trailingAppended = "1";
  if (progressPanel) card.appendChild(progressPanel.el);
  card.appendChild(EVv2.createNextButton(card, onNext));
};

// true_false/single_blankの共通choice/revealループ専用。正解/不正解バナー→正しい解答→解説→出典、
// という統一順序でrevealBoxの中身を組み立てる。isCorrectがnull(revealモード、自己採点前)の場合は
// バナーを出さない。
function fillRevealBox(revealBox, ex, handler, isCorrect) {
  revealBox.innerHTML = "";

  var banner = EVv2.createResultBanner(isCorrect);
  if (banner) revealBox.appendChild(banner);

  var answerBody = handler.getAnswerBodyText(ex);
  var correctAnswerText = answerBody || handler.getCorrectLabel(ex);
  revealBox.appendChild(EVv2.createCorrectAnswerLine(correctAnswerText));

  revealBox.appendChild(EVv2.createExplanationLine(handler.getExplanationText(ex)));
  revealBox.appendChild(EVv2.createSourceLine(handler.getSourceRefs(ex)));
}

// 状態バッジ・連続正解数・チェック登録ボタンをまとめた小さなパネル。
// exerciseKeyがnull（stableItemId欠落等、fail-closed）の場合は学習履歴を保存できない旨を
// 表示し、チェックボタンを無効化する（推測でキーを作らない）。
EVv2.createProgressPanel = function (exerciseKey, exerciseType) {
  var wrap = document.createElement("div");
  wrap.className = "progress-panel";

  var statusEl = document.createElement("span");
  statusEl.className = "progress-status";
  wrap.appendChild(statusEl);

  var streakEl = document.createElement("span");
  streakEl.className = "progress-streak";
  wrap.appendChild(streakEl);

  var checkBtn = document.createElement("button");
  checkBtn.type = "button";
  checkBtn.className = "check-btn";
  wrap.appendChild(checkBtn);

  function render(record) {
    statusEl.textContent = statusLabel(record.status);
    statusEl.className = "progress-status progress-status-" + record.status;
    streakEl.textContent = "連続正解 " + record.correctStreak;
    checkBtn.textContent = record.checked ? "チェック解除" : "チェック登録";
    checkBtn.classList.toggle("checked", record.checked);
  }

  if (exerciseKey) {
    checkBtn.addEventListener("click", function () {
      var rec = EVv2.toggleChecked(exerciseKey, exerciseType);
      if (rec) render(rec);
    });
    render(EVv2.getProgressRecord(exerciseKey, exerciseType));
  } else {
    statusEl.textContent = "学習履歴の保存対象外（識別子なし）";
    streakEl.textContent = "";
    checkBtn.disabled = true;
  }

  return { el: wrap, update: render };
};

// revealモード専用: 開示済みの解答に対して「正解だった」「不正解だった」の自己採点を行う
// ボタンを追加する。single_blankのreveal・multi_blankのreveal両方から共有して呼ばれる。
EVv2.appendSelfGradeButtons = function (container, exerciseKey, exerciseType, progressPanel, card, onNext) {
  var wrap = document.createElement("div");
  wrap.className = "self-grade";

  var correctBtn = document.createElement("button");
  correctBtn.type = "button";
  correctBtn.className = "choice-btn self-grade-btn";
  correctBtn.textContent = "正解だった";

  var wrongBtn = document.createElement("button");
  wrongBtn.type = "button";
  wrongBtn.className = "choice-btn self-grade-btn";
  wrongBtn.textContent = "不正解だった";

  function finish(isCorrect) {
    correctBtn.disabled = true;
    wrongBtn.disabled = true;
    if (!exerciseKey) return;
    var rec = EVv2.recordAnswer(exerciseKey, exerciseType, isCorrect);
    if (card) EVv2.finalizeAnsweredCard(card, progressPanel, rec, onNext);
    else if (rec && progressPanel) progressPanel.update(rec);
  }

  correctBtn.addEventListener("click", function () {
    finish(true);
  });
  wrongBtn.addEventListener("click", function () {
    finish(false);
  });

  wrap.appendChild(correctBtn);
  wrap.appendChild(wrongBtn);
  container.appendChild(wrap);
};

// onNext: 省略可。渡された場合、回答確定後の「次の問題へ」ボタンはこれを呼ぶ
// （1問ずつ学習するセッション画面が「次の問題を描画し直す」処理を注入するために使う）。
// 省略時は従来どおりcreateNextButtonのデフォルト挙動（次の.ex-cardへスクロール）を使う。
EVv2.createExerciseCard = function (ex, context, onNext) {
  var card = document.createElement("article");
  card.className = "ex-card";

  var handler = EVv2.registry[ex.exerciseType];

  var badge = document.createElement("span");
  badge.className = "badge" + (handler ? "" : " badge-unsupported");
  badge.textContent = handler ? handler.label : "未対応形式 (" + ex.exerciseType + ")";
  card.appendChild(badge);

  // v1.8.0(共通指示文の実装レポート参照)。カード上部はテーマ›節›論点 → 共通指示文 →
  // 問題本文 → 回答UI、の順で並べる。パンくずは控えめ、共通指示文は本文よりわずかに小さいが
  // 普通に読める文字色にし、内部ID(id-line)や出典(source-line)とは視覚的に区別する。
  var structureLevels = ["theme", "section", "topic"]
    .map(function (kind) {
      return ex.structure && ex.structure[kind] ? ex.structure[kind].titleRaw.text : null;
    })
    .filter(Boolean);
  if (structureLevels.length > 0) {
    var breadcrumb = document.createElement("div");
    breadcrumb.className = "structure-breadcrumb";
    breadcrumb.textContent = structureLevels.join(" › ");
    card.appendChild(breadcrumb);
  }

  if (ex.instructionRaw) {
    var instructionLine = document.createElement("p");
    instructionLine.className = "instruction-line";
    instructionLine.textContent = ex.instructionRaw.text;
    card.appendChild(instructionLine);
  }

  // v2-5: 内部識別子は診断情報として扱い、通常利用時（?debug=1が無いとき）は表示しない。
  if (EVv2.DEBUG_MODE) {
    var idLine = document.createElement("div");
    idLine.className = "id-line";
    idLine.textContent =
      "exerciseId: " + ex.exerciseId +
      " / stableItemId: " + ((ex.stableItemIds && ex.stableItemIds.join(", ")) || "(なし)");
    card.appendChild(idLine);

    if (handler && typeof handler.getAnswerFormNote === "function") {
      var afNote = document.createElement("div");
      afNote.className = "answer-form-note";
      afNote.textContent = handler.getAnswerFormNote(ex);
      card.appendChild(afNote);
    }
  }

  var questionSpan = EVv2.getQuestionRawSpan(ex);
  var qText = document.createElement("p");
  qText.className = "question-text";
  qText.textContent = questionSpan ? questionSpan.text : "(問題文なし)";
  card.appendChild(qText);

  if (!handler) {
    var note = document.createElement("p");
    note.className = "unsupported-note";
    note.textContent =
      "このビューアはこの出題形式(" + ex.exerciseType + ")にまだ対応していません。" +
      "判定・選択肢は表示されませんが、原文情報は上記のとおり保持されています。";
    card.appendChild(note);

    if (questionSpan) {
      card.appendChild(EVv2.createSourceLine([questionSpan]));
    }
    return card;
  }

  var exerciseKey = EVv2.computeExerciseKey(ex);
  var progressPanel = EVv2.createProgressPanel(exerciseKey, ex.exerciseType);
  // v2-5: progressPanel.elはここでは追加しない。回答確定時にfinalizeAnsweredCardがカード末尾へ追加する。

  // v2-2(docs/v2_2_implementation_report.md)。multi_blank等、1問の中に複数の判定単位を持つ
  // 形式は、下のchoice/reveal二値ループ（true_false/single_blank用）とは独立した専用の描画を持つ。
  // ハンドラがrenderInteractiveを持つ場合はそちらへ完全に委譲する。
  if (typeof handler.renderInteractive === "function") {
    handler.renderInteractive(ex, context, card, progressPanel, exerciseKey, onNext);
    return card;
  }

  var mode = handler.getInteractionMode(ex, context);
  var revealBox = document.createElement("div");
  revealBox.className = "reveal-box";
  revealBox.hidden = true;

  if (mode === "choice") {
    var choicesWrap = document.createElement("div");
    choicesWrap.className = "choices";
    var answered = false;
    var choices = handler.getChoices(ex, context);

    choices.forEach(function (choice) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.textContent = choice.label;
      btn.addEventListener("click", function () {
        if (answered) return;
        answered = true;
        var correct = handler.isCorrect(ex, choice.value);
        btn.classList.add(correct ? "choice-correct" : "choice-wrong");
        Array.prototype.forEach.call(choicesWrap.children, function (b) {
          b.disabled = true;
        });
        revealBox.hidden = false;
        fillRevealBox(revealBox, ex, handler, correct);
        var rec = exerciseKey ? EVv2.recordAnswer(exerciseKey, ex.exerciseType, correct) : null;
        EVv2.finalizeAnsweredCard(card, progressPanel, rec, onNext);
      });
      choicesWrap.appendChild(btn);
    });

    card.appendChild(choicesWrap);
  } else {
    // reveal モード: 短答であることが確認できない（長文回答・未判定・欠落）ため、
    // 選択肢は作らず、ボタン1つで解答を開示し、正誤は自己採点に委ねる。
    var revealBtn = document.createElement("button");
    revealBtn.type = "button";
    revealBtn.className = "choice-btn reveal-btn";
    revealBtn.textContent = "解答を表示（自己採点）";
    revealBtn.addEventListener("click", function () {
      revealBtn.disabled = true;
      revealBox.hidden = false;
      fillRevealBox(revealBox, ex, handler, null);
      EVv2.appendSelfGradeButtons(revealBox, exerciseKey, ex.exerciseType, progressPanel, card, onNext);
    });
    card.appendChild(revealBtn);
  }

  card.appendChild(revealBox);
  return card;
};
