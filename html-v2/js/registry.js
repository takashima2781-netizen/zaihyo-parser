// exerciseType ごとの表示・判定ロジックのレジストリ（Architecture v2 Proposal §5-3）。
// 新しい出題形式を追加する場合、ここに1エントリ追加するだけで済む設計を検証するためのもの。
// v2-0時点では true_false / single_blank のみ登録し、それ以外（multi_blank等）は
// レジストリに存在しない＝「未対応形式」として render.js 側が安全にフォールバック表示する。
//
// v2-1(docs/v2_1_data_contract_investigation.md)で、single_blank内部の表示責務を
// answerForm(BSMのunitKind.codeをそのまま伝播した値)によって分岐するように変更した。
// 文字数等のヒューリスティックによる補正は行わない(実データで機能しないことを確認済み)。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

// prompt優先、なければbody（Exercise View仕様 §9-4 と同じ規則）。
EVv2.getQuestionRawSpan = function (ex) {
  return ex.prompt || ex.body || null;
};

EVv2.formatSource = function (rawSpanRef) {
  // 想定外exerciseType等、未知の形状のオブジェクトが渡ってきても
  // 「未対応形式」フォールバック表示自体がクラッシュしないよう防御的に読む。
  if (!rawSpanRef || !rawSpanRef.source) return "(出典情報なし)";
  var inherited = rawSpanRef.inherited ? "（継承値）" : "";
  return rawSpanRef.source.documentId + " / " + rawSpanRef.source.locator +
    " / bsmNodeId=" + rawSpanRef.bsmNodeId + inherited;
};

function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}
EVv2.shuffle = shuffle;

// answerFormの値のうち、「短答」として4択合成の対象にしてよいことが分かっている値はこれだけ。
// それ以外（"subQuestion"＝長文回答、"unknown"、null＝欠落）は、文字数等で推測せず、
// 一律「reveal」モード（選択肢を作らず、解答を直接開示して自己採点する形式）にフォールバックする。
var SHORT_ANSWER_FORM = "blank";

function answerFormDisplayLabel(answerForm) {
  if (answerForm === "blank") return "blank（短答）";
  if (answerForm === "subQuestion") return "subQuestion（長文回答）";
  if (answerForm === "unknown") return "unknown（BSM側で未判定）";
  return "(欠落。この形式では想定されない状態)";
}
EVv2.answerFormDisplayLabel = answerFormDisplayLabel;

// ---- true_false ----

var trueFalseHandler = {
  label: "正誤 (true_false)",
  getInteractionMode: function () {
    return "choice";
  },
  getChoices: function () {
    return [
      { value: "○", label: "○" },
      { value: "×", label: "×" },
    ];
  },
  isCorrect: function (ex, value) {
    return !!ex.judgement && ex.judgement.symbolRaw.text.trim() === value;
  },
  getCorrectLabel: function (ex) {
    return ex.judgement ? ex.judgement.symbolRaw.text : "(judgementなし)";
  },
  getAnswerBodyText: function (ex) {
    return ex.judgement ? ex.judgement.answerBodyRaw.text : null;
  },
  getExplanationText: function (ex) {
    return ex.explanation ? ex.explanation.raw.text : null;
  },
  getSourceRefs: function (ex) {
    var refs = [];
    if (ex.body) refs.push(ex.body);
    if (ex.judgement) refs.push(ex.judgement.symbolRaw);
    return refs;
  },
};

// ---- single_blank ----
//
// choicesは常にnull（Exercise View仕様上、将来の選択式形式のため予約されているのみで
// 現行データには存在しない）。そのため選択肢はビューア側で明示的な戦略として生成する。
// 現行HTML（reference/current_app/index.html）のgenerateChoicesと同じ発想（同一データセット内の
// 他項目の解答からランダムに集める）だが、v2ではレンダリング本体に埋め込まれた副作用ではなく、
// レジストリに属する名前付き関数として分離する（Architecture v2 Proposal §5-3）。
//
// v2-1: 選択肢候補プールは answerForm==="blank"（短答）の項目のみに限定する。これにより、
// v2-0で実機確認された「長文回答(subQuestion)が短答の4択選択肢に紛れ込む」問題を防ぐ
// （docs/v2_1_data_contract_investigation.md §1・§2）。
EVv2.buildSingleBlankAnswerPool = function (exercises) {
  var pool = [];
  for (var i = 0; i < exercises.length; i++) {
    var ex = exercises[i];
    if (ex.exerciseType !== "single_blank") continue;
    if (ex.answerForm !== SHORT_ANSWER_FORM) continue;
    var item = ex.expectedAnswer && ex.expectedAnswer[0];
    var text = item && item.answerText && item.answerText.text;
    if (text) pool.push({ exerciseId: ex.exerciseId, text: text });
  }
  return pool;
};

EVv2.singleBlankRandomDistractorStrategy = function (ex, pool) {
  var answerItem = ex.expectedAnswer[0];
  var correct = answerItem.answerText.text;
  var seen = { };
  seen[correct] = true;
  var distractors = [];
  var shuffled = shuffle(pool);
  for (var i = 0; i < shuffled.length && distractors.length < 3; i++) {
    var candidate = shuffled[i];
    if (candidate.exerciseId === ex.exerciseId) continue;
    if (seen[candidate.text]) continue;
    seen[candidate.text] = true;
    distractors.push(candidate.text);
  }
  return shuffle([correct].concat(distractors));
};

var singleBlankHandler = {
  label: "穴埋め (single_blank)",
  // answerForm==="blank"（短答であることが分かっている）の場合のみ4択（choice）モード。
  // それ以外（"subQuestion"＝長文回答、"unknown"、null＝欠落）は、文字数等で推測せず、
  // 一律「解答を表示して自己採点する」reveal モードへ安全側にフォールバックする。
  getInteractionMode: function (ex) {
    return ex.answerForm === SHORT_ANSWER_FORM ? "choice" : "reveal";
  },
  getChoices: function (ex, context) {
    var texts = EVv2.singleBlankRandomDistractorStrategy(ex, context.singleBlankPool);
    return texts.map(function (t) {
      return { value: t, label: t };
    });
  },
  isCorrect: function (ex, value) {
    var item = ex.expectedAnswer[0];
    return !!item && item.answerText.text.trim() === value.trim();
  },
  getCorrectLabel: function (ex) {
    var item = ex.expectedAnswer[0];
    return item ? item.answerText.text : "(expectedAnswerなし)";
  },
  getAnswerBodyText: function () {
    return null;
  },
  getExplanationText: function (ex) {
    return ex.explanation ? ex.explanation.raw.text : null;
  },
  getSourceRefs: function (ex) {
    var refs = [];
    if (ex.body) refs.push(ex.body);
    var item = ex.expectedAnswer[0];
    if (item) refs.push(item.answerText);
    return refs;
  },
  // カード上に常時表示する、判定に使ったanswerFormの値そのもの（透明性のため。隠さない）。
  getAnswerFormNote: function (ex) {
    return "answerForm: " + answerFormDisplayLabel(ex.answerForm);
  },
};

// ---- multi_blank ----
//
// v2-2(docs/v2_2_implementation_report.md)。BSM/Exercise Viewは一切変更していない
// （answerFormはv2-1で既にmulti_blankへ付与済み。配下leaf全件のunitKind.codeが一致する
// 場合のみ値を持ち、不一致ならnull。src/exerciseView/buildExerciseView.mjs参照）。
//
// ex.answerForm==="blank" は「グループ内の全unitがblank」と同義（v2-1のgetGroupAnswerFormが
// 既に不一致をnullへ畳んでいるため、ここで改めてunit単位を調べ直す必要はない）。
// それ以外(subQuestion/unknown/null混在)は、文字数等で推測せず問題全体をreveal(自己採点)へ
// 安全側フォールバックする（ユーザー指示どおり、unit単位の部分的なchoice表示は行わない）。
//
// distractor候補は single_blank と同じ「answerForm==="blank"の項目のみ」のプール
// (context.singleBlankPool、v2-1で既にフィルタ済み)をそのまま再利用する。新しいプールは作らない。
// 各unit自身の正解と同一テキストの候補は、singleBlankRandomDistractorStrategyの既存ロジックが
// 除外する（同一leafの解答は多重穴埋め・単一穴埋め双方で同じテキストになるため、これだけで
// 同一大問内の兄弟unitの正解が自分の選択肢に紛れ込むことも実質的に防げる）。
//
// 「安全に4択を生成できない」= いずれか1つのunitで、正解を含めて2択未満（＝distractorが
// 1件も見つからない）しか用意できない場合。この場合は問題全体をrevealへ倒す（unit単位の
// 部分的な代替表示はしない。教材構造上ひとつの大問として扱う、というExercise View仕様§8の
// multi_blank集約方針と同じ考え方）。
var MULTI_BLANK_MIN_CHOICES_PER_UNIT = 2;

function buildMultiBlankChoiceSets(ex, context) {
  var sets = [];
  for (var i = 0; i < ex.expectedAnswer.length; i++) {
    var unit = ex.expectedAnswer[i];
    var pseudoEx = { exerciseId: "multiunit-" + unit.blankUnitId, expectedAnswer: [unit] };
    var texts = EVv2.singleBlankRandomDistractorStrategy(pseudoEx, context.singleBlankPool);
    if (texts.length < MULTI_BLANK_MIN_CHOICES_PER_UNIT) return null;
    sets.push({ blankUnitId: unit.blankUnitId, stableItemId: unit.stableItemId, correct: unit.answerText.text, choices: texts });
  }
  return sets;
}
// app.js側の全件検証パネルから直接呼べるように公開する（診断目的のみ）。
EVv2.buildMultiBlankChoiceSets = buildMultiBlankChoiceSets;

var multiBlankHandler = {
  label: "多重穴埋め (multi_blank)",
  getInteractionMode: function (ex, context) {
    if (ex.answerForm !== SHORT_ANSWER_FORM) return "reveal";
    return buildMultiBlankChoiceSets(ex, context) ? "choice" : "reveal";
  },
  getAnswerFormNote: function (ex) {
    return "answerForm: " + answerFormDisplayLabel(ex.answerForm) + "（配下" + ex.expectedAnswer.length + "空欄の一致判定込み）";
  },
  // 独自の複数unit UIを構築する（render.js側の共通choice/revealループは使わない）。
  // progressPanel/exerciseKeyはrender.js(createExerciseCard)で1回だけ生成されたものを
  // そのまま受け取る（v2-3、docs/v2_3_implementation_report.md）。
  // onNextはcreateExerciseCard経由で渡された「次の問題へ」の注入コールバック(省略可)。
  renderInteractive: function (ex, context, card, progressPanel, exerciseKey, onNext) {
    var mode = this.getInteractionMode(ex, context);

    if (mode === "reveal") {
      var revealBtn = document.createElement("button");
      revealBtn.type = "button";
      revealBtn.className = "choice-btn reveal-btn";
      revealBtn.textContent = "解答を表示（自己採点、" + ex.expectedAnswer.length + "空欄）";
      var revealBox = document.createElement("div");
      revealBox.className = "reveal-box";
      revealBox.hidden = true;
      revealBtn.addEventListener("click", function () {
        revealBtn.disabled = true;
        revealBox.hidden = false;
        revealBox.innerHTML = "";
        // v2-5: 全形式共通の順序（正解/不正解→正しい解答→解説→出典）に揃える。
        // revealモードは自己採点前のため、正解/不正解バナーはまだ出さない。
        var correctText = ex.expectedAnswer
          .map(function (u, idx) {
            return "空欄" + (idx + 1) + "=" + u.answerText.text;
          })
          .join(" ／ ");
        revealBox.appendChild(EVv2.createCorrectAnswerLine(correctText));
        var expl = ex.explanation ? ex.explanation.raw.text : null;
        revealBox.appendChild(EVv2.createExplanationLine(expl));
        revealBox.appendChild(
          EVv2.createSourceLine(
            ex.expectedAnswer.map(function (u) {
              return u.answerText;
            })
          )
        );
        // v2-3: multi_blank revealは問題全体単位で1回だけ自己採点する
        // （「正解だった」＝全空欄正解、というユーザー自身の申告に委ねる）。
        EVv2.appendSelfGradeButtons(revealBox, exerciseKey, ex.exerciseType, progressPanel, card, onNext);
      });
      card.appendChild(revealBtn);
      card.appendChild(revealBox);
      return;
    }

    var choiceSets = buildMultiBlankChoiceSets(ex, context);
    var unitStates = choiceSets.map(function () {
      return { answered: false, correct: false };
    });
    var completedSaved = false;

    var summary = document.createElement("div");
    summary.className = "multiblank-summary";
    var resultBox = document.createElement("div");
    resultBox.className = "reveal-box";
    resultBox.hidden = true;

    function updateSummary() {
      var answeredCount = unitStates.filter(function (s) { return s.answered; }).length;
      var correctCount = unitStates.filter(function (s) { return s.correct; }).length;
      summary.textContent = correctCount + " / " + choiceSets.length + " 正解";
      if (answeredCount !== choiceSets.length) return;

      // v2-5: 全形式共通の順序（正解/不正解→正しい解答→解説→出典）に揃える。
      var allCorrect = correctCount === choiceSets.length;
      resultBox.hidden = false;
      resultBox.innerHTML = "";
      resultBox.appendChild(EVv2.createResultBanner(allCorrect));
      var correctText = choiceSets
        .map(function (set, idx) {
          return "空欄" + (idx + 1) + "=" + set.correct;
        })
        .join(" ／ ");
      resultBox.appendChild(EVv2.createCorrectAnswerLine(correctText));
      // multi_blankのexplanationは仕様上常にnull（複数解答に単一の解説スロットを持たないため）。
      resultBox.appendChild(EVv2.createExplanationLine(null));

      // v2-3: multi_blank choiceは「全unit回答完了時」に1回だけ記録する。
      // 問題全体の正誤は「全unitが正解の場合のみ正解」とする（v2-2のUI表現と同じ考え方）。
      if (!completedSaved) {
        completedSaved = true;
        var rec = exerciseKey ? EVv2.recordAnswer(exerciseKey, ex.exerciseType, allCorrect) : null;
        EVv2.finalizeAnsweredCard(card, progressPanel, rec, onNext);
      }
    }
    updateSummary();

    var unitsWrap = document.createElement("div");
    unitsWrap.className = "multiblank-units";

    choiceSets.forEach(function (set, idx) {
      var unitBox = document.createElement("div");
      unitBox.className = "multiblank-unit";
      var label = document.createElement("div");
      label.className = "multiblank-unit-label";
      label.textContent = "空欄" + (idx + 1);
      unitBox.appendChild(label);

      var choicesWrap = document.createElement("div");
      choicesWrap.className = "choices";
      set.choices.forEach(function (choiceText) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "choice-btn";
        btn.textContent = choiceText;
        btn.addEventListener("click", function () {
          if (unitStates[idx].answered) return;
          unitStates[idx].answered = true;
          unitStates[idx].correct = choiceText === set.correct;
          btn.classList.add(unitStates[idx].correct ? "choice-correct" : "choice-wrong");
          Array.prototype.forEach.call(choicesWrap.children, function (b) {
            b.disabled = true;
          });
          updateSummary();
        });
        choicesWrap.appendChild(btn);
      });
      unitBox.appendChild(choicesWrap);
      unitsWrap.appendChild(unitBox);
    });

    card.appendChild(unitsWrap);
    card.appendChild(summary);
    card.appendChild(resultBox);
  },
};

// ---- ordering（item-1090限定の最小実装。v2-4本体、docs/v2_4_implementation_report.md） ----
//
// このハンドラが受け取るExerciseは、通常のExercise View由来のものではなく、
// orderingAdapter.js(EVv2.buildOrderingViewIfApplicable)がitem-1090専用に合成した
// オブジェクトのみである。BSM・Exercise Viewは変更しない。汎用のordering exerciseType
// 設計・複数正解順・部分点は今回のスコープ外。
function orderingArraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

var orderingHandler = {
  label: "並べ替え (ordering・item-1090限定の暫定対応)",
  getAnswerFormNote: function () {
    return "この項目はwithheld(review_required)データを診断目的で並べ替え形式へ変換した暫定表示です（item-1090限定）。";
  },
  // 独自の複数要素UIを構築する（multi_blankと同じく、render.js側の共通choice/revealループは使わない）。
  // onNextはcreateExerciseCard経由で渡された「次の問題へ」の注入コールバック(省略可)。
  renderInteractive: function (ex, context, card, progressPanel, exerciseKey, onNext) {
    var items = ex.orderingItems;
    var correctOrder = ex.correctOrder;
    var itemById = {};
    items.forEach(function (it) {
      itemById[it.id] = it;
    });

    function shuffledStartOrder() {
      var ids = items.map(function (it) {
        return it.id;
      });
      var attempt = shuffle(ids);
      var tries = 0;
      // 正解順のまま開始しないための再シャッフル（毎回必ず違う必要はない。上限付きで無限ループを防ぐ）。
      while (orderingArraysEqual(attempt, correctOrder) && tries < 10) {
        attempt = shuffle(ids);
        tries += 1;
      }
      return attempt;
    }

    var uiState = { order: shuffledStartOrder(), answered: false };

    var listEl = document.createElement("ol");
    listEl.className = "ordering-list";

    var actionsEl = document.createElement("div");
    actionsEl.className = "ordering-actions";
    var answerBtn = document.createElement("button");
    answerBtn.type = "button";
    answerBtn.className = "choice-btn ordering-answer-btn";
    answerBtn.textContent = "回答する";
    var resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "choice-btn ordering-reset-btn";
    resetBtn.textContent = "初期状態に戻す";
    actionsEl.appendChild(answerBtn);
    actionsEl.appendChild(resetBtn);

    var revealBox = document.createElement("div");
    revealBox.className = "reveal-box";
    revealBox.hidden = true;

    function move(idx, delta) {
      if (uiState.answered) return;
      var target = idx + delta;
      if (target < 0 || target >= uiState.order.length) return;
      var tmp = uiState.order[idx];
      uiState.order[idx] = uiState.order[target];
      uiState.order[target] = tmp;
      renderList();
    }

    function renderList() {
      listEl.innerHTML = "";
      uiState.order.forEach(function (id, idx) {
        var item = itemById[id];
        var li = document.createElement("li");
        li.className = "ordering-item";
        // キーボード操作（Tabでのフォーカス移動、矢印キーでの移動）を阻害しないため、
        // liそのものにもフォーカス・矢印キー操作を持たせる（ボタン操作が主、これは補助）。
        li.tabIndex = 0;
        li.setAttribute(
          "aria-label",
          (idx + 1) + "番目: " + item.label + " " + item.text + "。矢印キーの上下で順番を移動できます。"
        );
        li.addEventListener("keydown", function (e) {
          if (uiState.answered) return;
          if (e.key === "ArrowUp") {
            e.preventDefault();
            move(idx, -1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            move(idx, 1);
          }
        });

        var posEl = document.createElement("span");
        posEl.className = "ordering-position";
        posEl.textContent = String(idx + 1);
        li.appendChild(posEl);

        var textEl = document.createElement("span");
        textEl.className = "ordering-text";
        textEl.textContent = item.label + " " + item.text;
        li.appendChild(textEl);

        var controls = document.createElement("span");
        controls.className = "ordering-controls";

        var upBtn = document.createElement("button");
        upBtn.type = "button";
        upBtn.className = "ordering-move-btn";
        upBtn.textContent = "↑";
        upBtn.setAttribute("aria-label", "上へ移動");
        upBtn.disabled = uiState.answered || idx === 0;
        upBtn.addEventListener("click", function () {
          move(idx, -1);
        });

        var downBtn = document.createElement("button");
        downBtn.type = "button";
        downBtn.className = "ordering-move-btn";
        downBtn.textContent = "↓";
        downBtn.setAttribute("aria-label", "下へ移動");
        downBtn.disabled = uiState.answered || idx === uiState.order.length - 1;
        downBtn.addEventListener("click", function () {
          move(idx, 1);
        });

        controls.appendChild(upBtn);
        controls.appendChild(downBtn);
        li.appendChild(controls);
        listEl.appendChild(li);
      });
    }

    answerBtn.addEventListener("click", function () {
      if (uiState.answered) return;
      uiState.answered = true;
      var correct = orderingArraysEqual(uiState.order, correctOrder);
      renderList(); // 上下ボタンをdisabled状態で再描画する
      answerBtn.disabled = true;

      revealBox.hidden = false;
      revealBox.innerHTML = "";

      // v2-5: 全形式共通の順序（正解/不正解→正しい解答→解説→出典）に揃える。
      revealBox.appendChild(EVv2.createResultBanner(correct));
      var correctOrderText = correctOrder
        .map(function (id) {
          return itemById[id].label;
        })
        .join(" → ");
      revealBox.appendChild(EVv2.createCorrectAnswerLine(correctOrderText));
      revealBox.appendChild(EVv2.createExplanationLine(ex.explanationText));
      revealBox.appendChild(EVv2.createSourceLine(ex.sourceRefs));

      // v2-3の既存進捗保存機構をそのまま再利用する（新しいlocalStorageスキーマは作らない）。
      var rec = exerciseKey ? EVv2.recordAnswer(exerciseKey, ex.exerciseType, correct) : null;
      EVv2.finalizeAnsweredCard(card, progressPanel, rec, onNext);
    });

    resetBtn.addEventListener("click", function () {
      // 「再挑戦時に初期化」：回答結果・順序を破棄し、新しいシャッフルからやり直す。
      uiState.order = shuffledStartOrder();
      uiState.answered = false;
      answerBtn.disabled = false;
      revealBox.hidden = true;
      revealBox.innerHTML = "";
      renderList();
    });

    renderList();
    card.appendChild(listEl);
    card.appendChild(actionsEl);
    card.appendChild(revealBox);
  },
};

EVv2.registry = {
  true_false: trueFalseHandler,
  single_blank: singleBlankHandler,
  multi_blank: multiBlankHandler,
  ordering: orderingHandler,
};
