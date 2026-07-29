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
//
// v2-9: 「正しい解答」という見出しは自動採点・自己採点を問わず「解答」に統一した
// （EVv2.createCorrectAnswerLineのデフォルト値を変更。「正解」「不正解」の結果表示は対象外）。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

function statusLabel(status) {
  if (status === EVv2.PROGRESS_STATUS.MASTERED) return "修得済み";
  if (status === EVv2.PROGRESS_STATUS.UNMASTERED) return "未修得";
  return "未回答";
}

// v2-11(問題文の構造可視化、保守的案)。実際の改行(\n、またはテキスト先頭)に続く
// 全角数字＋空白だけを見出し候補として扱う（実データ調査で、この組み合わせ以外
// ―「・」「(1)」等―は改行の裏付けが無く誤判定リスクが高いことを確認済み）。
// 見出しタイトル文字列(「静態論の特徴」等)の終端を示す共通の区切りが実データに無いため、
// タイトル部分の切り出しは行わず、全角数字そのものだけを強調する（推測しない）。
// 判定できる場合だけ強調し、それ以外は何もしない(container.appendChildで素のテキストのまま)。
var BODY_HEADING_REGEX = /(^|\n)([０-９]+)([　 ])/g;
function appendTextWithHeadingMarkers(container, text) {
  BODY_HEADING_REGEX.lastIndex = 0;
  var lastIndex = 0;
  var m;
  while ((m = BODY_HEADING_REGEX.exec(text))) {
    var matchStart = m.index + m[1].length;
    if (matchStart > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, matchStart)));
    }
    var markerEl = document.createElement("span");
    markerEl.className = "body-heading-marker";
    markerEl.textContent = m[2] + m[3];
    container.appendChild(markerEl);
    lastIndex = matchStart + m[2].length + m[3].length;
  }
  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}
EVv2.appendTextWithHeadingMarkers = appendTextWithHeadingMarkers;

// v2-7(単一穴埋めの対象マーカー強調)。single_blankの対象空欄が本文中のどのマーカー
// (①②③...)に対応するかをEVv2.buildBlankMarkerIndex(html-v2/js/blankMarkerIndex.js)の
// 索引で特定し、対象マーカーだけを強調して表示する。索引に無い場合(該当する
// multi_blank兄弟が無い、または再構成した本文が実際の本文と一致しない想定外のケース)は、
// 推測せず従来通りのプレーンテキスト表示にフォールバックする。
// 戻り値: true=強調を適用した(選択肢側にも同系色の視覚的関連付けをしてよい合図) / false。
function appendQuestionBody(container, ex, context, questionSpan) {
  if (!questionSpan) {
    container.textContent = "(問題文なし)";
    return false;
  }
  var targetBlankUnitId =
    ex.exerciseType === "single_blank" && ex.expectedAnswer && ex.expectedAnswer[0]
      ? ex.expectedAnswer[0].blankUnitId
      : null;
  var entry = targetBlankUnitId && context && context.blankMarkerIndex ? context.blankMarkerIndex[targetBlankUnitId] : null;
  if (!entry) {
    appendTextWithHeadingMarkers(container, questionSpan.text);
    return false;
  }
  var reconstructed = entry.segments
    .map(function (seg) {
      return seg.type === "blank" ? seg.label : seg.text;
    })
    .join("");
  if (reconstructed !== questionSpan.text) {
    appendTextWithHeadingMarkers(container, questionSpan.text);
    return false;
  }
  entry.segments.forEach(function (seg) {
    if (seg.type === "text") {
      appendTextWithHeadingMarkers(container, seg.text);
      return;
    }
    var markerEl = document.createElement("span");
    markerEl.textContent = seg.label;
    markerEl.className =
      seg.blankUnitId === targetBlankUnitId ? "blank-marker blank-marker-target" : "blank-marker blank-marker-other";
    container.appendChild(markerEl);
  });
  return true;
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

// v2-9: 「正しい解答」表記は自動採点・自己採点を問わず「解答」に統一する（見出しの文言のみ。
// 「正解」「不正解」という結果表示は対象外、EVv2.createResultBanner側は変更しない）。
// labelは互換のため残すが、現状すべての呼び出し元がデフォルト値をそのまま使う。
EVv2.createCorrectAnswerLine = function (text, label) {
  var el = document.createElement("div");
  el.className = "correct-answer-line";
  el.textContent = (label || "解答") + ": " + text;
  return el;
};

// v2-10: 解説本文がある場合は通常の読みやすい文字色、無い場合（教材原文に解説自体が
// 存在しない）は補助表示として控えめな色にする（CSS側で.explanation-line-emptyのみ調整）。
EVv2.createExplanationLine = function (text) {
  var el = document.createElement("div");
  el.className = "explanation-line" + (text ? "" : " explanation-line-empty");
  el.textContent = text ? "解説: " + text : "解説: （教材原文に解説なし）";
  return el;
};

// v2-8(出典を学習画面では非表示にする): データ・整形ロジック自体は削除せず、通常利用時
// (EVv2.DEBUG_MODEがfalse、つまり?debug=1の指定が無い場合)はnullを返して非表示にする。
// 呼び出し側は戻り値がnullの場合appendChildしないこと。
EVv2.createSourceLine = function (sourceRefs) {
  if (!EVv2.DEBUG_MODE) return null;
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
  btn.textContent = "次の問題へ";
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

// true_false/single_blankの共通choice/revealループ専用。正解/不正解バナー→解答→解説→出典、
// という統一順序でrevealBoxの中身を組み立てる。isCorrectがnull(revealモード、自己採点前)の場合は
// バナーを出さない（出典行は学習画面では表示しない、item1参照）。
function fillRevealBox(revealBox, ex, handler, isCorrect) {
  revealBox.innerHTML = "";

  var banner = EVv2.createResultBanner(isCorrect);
  if (banner) revealBox.appendChild(banner);

  var answerBody = handler.getAnswerBodyText(ex);
  var correctAnswerText = answerBody || handler.getCorrectLabel(ex);
  revealBox.appendChild(EVv2.createCorrectAnswerLine(correctAnswerText));

  revealBox.appendChild(EVv2.createExplanationLine(handler.getExplanationText(ex)));
  var sourceLine = EVv2.createSourceLine(handler.getSourceRefs(ex));
  if (sourceLine) revealBox.appendChild(sourceLine);
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

// revealモード専用: 開示済みの解答に対して自己採点を行うボタンを追加する。
// single_blankのreveal・multi_blankのreveal両方から共有して呼ばれる。
// v2-8: 文字（「正解だった」「不正解だった」）ではなく○×の記号を中心にしたUIにする
// （読み上げ用にaria-labelへ元の文言を残す。判定ロジック・学習履歴の記録先は変更しない）。
// v2-12(振り返り機能): 自己採点確定時にEVv2.onExerciseAnsweredを呼ぶため、exを追加した。
EVv2.appendSelfGradeButtons = function (container, ex, exerciseKey, exerciseType, progressPanel, card, onNext) {
  var wrap = document.createElement("div");
  wrap.className = "self-grade";

  var correctBtn = document.createElement("button");
  correctBtn.type = "button";
  correctBtn.className = "choice-btn self-grade-btn self-grade-btn-correct";
  correctBtn.textContent = "○";
  correctBtn.setAttribute("aria-label", "正解だった");

  var wrongBtn = document.createElement("button");
  wrongBtn.type = "button";
  wrongBtn.className = "choice-btn self-grade-btn self-grade-btn-wrong";
  wrongBtn.textContent = "×";
  wrongBtn.setAttribute("aria-label", "不正解だった");

  function finish(isCorrect) {
    correctBtn.disabled = true;
    wrongBtn.disabled = true;
    if (typeof EVv2.onExerciseAnswered === "function") {
      EVv2.onExerciseAnswered({
        ex: ex,
        exerciseKey: exerciseKey,
        yourAnswerText: null,
        resultKind: "self",
        isCorrect: isCorrect,
      });
    }
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
  var markerHighlightApplied = appendQuestionBody(qText, ex, context, questionSpan);
  // v2-8/v2-10: multi_blankは本文の描画をhandler.renderInteractive側(registry.js)へ完全に委譲する。
  // 理由は2つ: (1)独立した中問(subQuestions)を持つ大問は共有本文を持たず(ex.body===null)、
  // 各中問の本文を個別に表示する必要がある。(2)choiceモード(空欄を選ぶ形式)では、v2-10の
  // レイアウト改善により本文を解答エリアと分離した独立スクロール領域(.multiblank-split-body)へ
  // 表示するため、ここで共通のqTextを先に追加すると二重表示になる。
  if (ex.exerciseType !== "multi_blank") {
    card.appendChild(qText);
  }

  if (!handler) {
    var note = document.createElement("p");
    note.className = "unsupported-note";
    note.textContent =
      "このビューアはこの出題形式(" + ex.exerciseType + ")にまだ対応していません。" +
      "判定・選択肢は表示されませんが、原文情報は上記のとおり保持されています。";
    card.appendChild(note);

    if (questionSpan) {
      var unsupportedSourceLine = EVv2.createSourceLine([questionSpan]);
      if (unsupportedSourceLine) card.appendChild(unsupportedSourceLine);
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
    // v2-7: 本文側の対象マーカー強調(appendQuestionBody)が適用された場合のみ、
    // 選択肢側にも同系色の細い上枠線を付けて視覚的に結びつける(single_blank限定。
    // true_falseはmarkerHighlightAppliedが常にfalseのため影響しない)。
    choicesWrap.className = "choices" + (markerHighlightApplied ? " choices-marker-linked" : "");
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
        if (typeof EVv2.onExerciseAnswered === "function") {
          EVv2.onExerciseAnswered({
            ex: ex,
            exerciseKey: exerciseKey,
            yourAnswerText: choice.label,
            resultKind: "auto",
            isCorrect: correct,
          });
        }
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
      EVv2.appendSelfGradeButtons(revealBox, ex, exerciseKey, ex.exerciseType, progressPanel, card, onNext);
    });
    card.appendChild(revealBtn);
  }

  card.appendChild(revealBox);
  return card;
};
