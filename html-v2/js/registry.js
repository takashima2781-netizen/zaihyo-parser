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
  // v2-19: 学習設定画面の問題形式チップと表記を統一する（TYPE_ITEMS、html-v2/js/app.js参照）。
  label: "〇×",
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
  // v2-10(解答/解説の役割整理): judgement.answerBodyRaw.textは教材原文どおり「記号＋訂正文」を
  // そのまま保持しているが(Parser層のraw保持方針、docs/ox_explanation_investigation.mdで検証済み、
  // 265件中148件でexplanation.raw.textと完全一致・欠落0件)、解答欄にそのまま出すとexplanationと
  // 重複表示になる。解答欄は記号のみ(getCorrectLabel)に統一し、訂正文は解説欄(explanation)側で
  // 表示する。answerBodyRaw自体は削除せず、データとしては保持したまま参照しないだけにする。
  getAnswerBodyText: function () {
    return null;
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
  label: "穴埋め",
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
  label: "多重穴埋め",
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
  // v2-25: zones.question/zones.answer/zones.footerは、問題文・回答欄がそれぞれ独立して
  // スクロールできるようcreateExerciseCardが用意する共通の3領域（旧・専用splitレイアウトを
  // 統合した）。
  renderInteractive: function (ex, context, card, progressPanel, exerciseKey, onNext, zones) {
    var mode = this.getInteractionMode(ex, context);

    if (mode === "reveal") {
      // v2-9(問題階層の表示位置修正)。structureType==="independent_subquestions"の大問は
      // 共有本文(ex.body)を持たず、各中問がそれぞれ独立した問題文(subQuestions[].body)を持つ。
      // 中問の本文は「問題文」であって「解答」ではないため、解答表示ボタンより前・常時表示する。
      // 解答表示後は、各中問の直下（同じ.subquestion枠内）にその中問の解答だけを出す
      // （末尾にまとめた一覧は作らない）。shared_body_blanksの安全側フォールバック
      // （distractor不足でchoiceを組めなかった場合）はsubQuestionsを持たないため、
      // 従来通り末尾に空欄単位の一覧を1回だけ表示する（実データでは現状0件、堅牢性のため維持）。
      var hasSubQuestions =
        ex.structureType === "independent_subquestions" && Array.isArray(ex.subQuestions) && ex.subQuestions.length > 0;

      // hasSubQuestionsの場合は各中問の本文(subQuestions[].body)が問題文の役割を果たすため、
      // 共有本文は表示しない(そもそもex.body===null)。無い場合のみ、従来通り共有本文を表示する
      // （render.js側は多重穴埋め全体の共有qText描画をこちらへ委譲しているため、ここで描画する）。
      if (!hasSubQuestions) {
        var revealQuestionSpan = EVv2.getQuestionRawSpan(ex);
        var revealQText = document.createElement("p");
        revealQText.className = "question-text";
        if (revealQuestionSpan) {
          EVv2.appendTextWithHeadingMarkers(revealQText, revealQuestionSpan.text);
        } else {
          revealQText.textContent = "(問題文なし)";
        }
        zones.question.appendChild(revealQText);
      }

      var subAnswerLines = [];
      if (hasSubQuestions) {
        // 各中問の本文はそれ自体が「問題文」の役割を果たすため、questionZoneへ入れる。
        var list = document.createElement("div");
        list.className = "subquestions";
        ex.subQuestions.forEach(function (sq) {
          var item = document.createElement("div");
          item.className = "subquestion";
          var body = document.createElement("p");
          body.className = "subquestion-body";
          EVv2.appendTextWithHeadingMarkers(body, sq.body.text);
          item.appendChild(body);
          var answerLine = EVv2.createCorrectAnswerLine(sq.expectedAnswer.text);
          answerLine.hidden = true;
          item.appendChild(answerLine);
          subAnswerLines.push(answerLine);
          list.appendChild(item);
        });
        zones.question.appendChild(list);
      }

      var revealBtn = document.createElement("button");
      revealBtn.type = "button";
      revealBtn.className = "choice-btn reveal-btn";
      revealBtn.textContent = "解答を表示（自己採点、" + ex.expectedAnswer.length + (hasSubQuestions ? "問）" : "空欄）");
      var revealBox = document.createElement("div");
      revealBox.className = "reveal-box";
      revealBox.hidden = true;
      revealBtn.addEventListener("click", function () {
        revealBtn.disabled = true;
        revealBox.hidden = false;
        revealBox.innerHTML = "";
        // revealモードは自己採点前のため、正解/不正解バナーはまだ出さない。
        if (hasSubQuestions) {
          subAnswerLines.forEach(function (line) {
            line.hidden = false;
          });
        } else {
          var correctText = ex.expectedAnswer
            .map(function (u, idx) {
              return "空欄" + (idx + 1) + "=" + u.answerText.text;
            })
            .join(" ／ ");
          revealBox.appendChild(EVv2.createCorrectAnswerLine(correctText));
        }
        var expl = ex.explanation ? ex.explanation.raw.text : null;
        revealBox.appendChild(EVv2.createExplanationLine(expl));
        // 出典は学習画面では表示しない（?debug=1時のみEVv2.createSourceLineが実体を返す）。
        var sourceLine = EVv2.createSourceLine(
          ex.expectedAnswer.map(function (u) {
            return u.answerText;
          })
        );
        if (sourceLine) revealBox.appendChild(sourceLine);
        // v2-3: multi_blank revealは問題全体単位で1回だけ自己採点する
        // （「正解だった」＝全空欄正解、というユーザー自身の申告に委ねる）。
        EVv2.appendSelfGradeButtons(revealBox, ex, exerciseKey, ex.exerciseType, progressPanel, zones.footer, onNext);
      });
      zones.answer.appendChild(revealBtn);
      zones.answer.appendChild(revealBox);
      return;
    }

    // v2-6(教材データ品質調査2026-07-28 Item4): 選択のたびに即座に正誤を出す方式をやめ、
    // 全空欄を選び終えてから「解答を確定」ボタンで一括採点する方式にする（ユーザー指示）。
    // 選択中は正誤に一切触れない状態(selectedTextのみ)を持ち、確定後にのみ
    // correct/incorrectを確定して以後変更不可にする。
    var choiceSets = buildMultiBlankChoiceSets(ex, context);
    var unitStates = choiceSets.map(function () {
      return { selectedText: null, buttonsByText: {} };
    });
    var confirmed = false;
    var completedSaved = false;

    var summary = document.createElement("div");
    summary.className = "multiblank-summary";
    var resultBox = document.createElement("div");
    resultBox.className = "reveal-box";
    resultBox.hidden = true;

    var confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "choice-btn multiblank-confirm-btn";
    confirmBtn.textContent = "解答を確定";
    confirmBtn.disabled = true;

    function updateConfirmButtonState() {
      confirmBtn.disabled = confirmed || unitStates.some(function (s) { return s.selectedText === null; });
    }

    function selectChoice(idx, choiceText) {
      if (confirmed) return;
      unitStates[idx].selectedText = choiceText;
      var buttonsByText = unitStates[idx].buttonsByText;
      Object.keys(buttonsByText).forEach(function (text) {
        buttonsByText[text].classList.toggle("choice-selected", text === choiceText);
      });
      updateConfirmButtonState();
    }

    // v2-7(multi_blank確定後の空欄単位表示)。問題全体の正誤判定・修得判定・連続正解・
    // 学習履歴保存(recordAnswer呼び出し)は一切変更しない。「全選択→一括確定」という
    // 操作も変更しない。確定後の表示だけを、各空欄の場所で正誤・正解が分かる形にする
    // (履歴の保存先は増やさない。その場のDOM表示のみ)。
    function confirmAnswers() {
      if (confirmed) return;
      if (unitStates.some(function (s) { return s.selectedText === null; })) return;
      confirmed = true;
      confirmBtn.disabled = true;

      var correctCount = 0;
      choiceSets.forEach(function (set, idx) {
        var state = unitStates[idx];
        var isCorrect = state.selectedText === set.correct;
        if (isCorrect) correctCount += 1;
        Object.keys(state.buttonsByText).forEach(function (text) {
          var btn = state.buttonsByText[text];
          btn.disabled = true;
          if (text === state.selectedText) {
            btn.classList.remove("choice-selected");
            btn.classList.add(isCorrect ? "choice-correct" : "choice-wrong");
          } else if (!isCorrect && text === set.correct) {
            // 誤答した空欄では、選ばなかった正解の選択肢にもヒントを付け、
            // その場で「選んだ回答」と「正解」を比較できるようにする。
            btn.classList.add("choice-correct-hint");
          }
        });
        // 空欄ラベルの横に○×を付け、長い問題でもスクロールせず各空欄の正誤が分かるようにする。
        var resultMark = document.createElement("span");
        resultMark.className =
          "multiblank-unit-result " + (isCorrect ? "multiblank-unit-result-correct" : "multiblank-unit-result-wrong");
        resultMark.textContent = isCorrect ? "○" : "×";
        unitLabelEls[idx].appendChild(resultMark);

        // v2-28: 確定後、空欄ごとに「正解」「解説」（入力されている場合のみ）を対応づけて表示する。
        // 解答前には出さない（このブロック自体がconfirmAnswers()内、確定時のみ実行されるため）。
        var answerUnit = ex.expectedAnswer && ex.expectedAnswer[idx];
        var infoBox = document.createElement("div");
        infoBox.className = "multiblank-unit-info";
        var answerLine = document.createElement("p");
        answerLine.className = "multiblank-unit-answer-line";
        answerLine.textContent = "正解：" + set.correct;
        infoBox.appendChild(answerLine);
        if (answerUnit && answerUnit.explanationRaw && answerUnit.explanationRaw.text) {
          var explLine = document.createElement("p");
          explLine.className = "multiblank-unit-explanation-line";
          explLine.textContent = "解説：" + answerUnit.explanationRaw.text;
          infoBox.appendChild(explLine);
        }
        unitBoxEls[idx].appendChild(infoBox);
      });

      var allCorrect = correctCount === choiceSets.length;
      summary.textContent = correctCount + " / " + choiceSets.length + " 正解";
      summary.className =
        "multiblank-summary " +
        (allCorrect ? "multiblank-summary-all" : correctCount === 0 ? "multiblank-summary-none" : "multiblank-summary-partial");

      // v2-7: 空欄ごとの正誤・正解は各unit内に表示済みのため、末尾の一覧表示(長い1行)は行わない。
      // 全体の正解/不正解バナーは残すが、部分点の把握を妨げないよう控えめな表示にする
      // (result-banner-compact。他のexerciseTypeのresult-bannerは変更しない)。
      resultBox.hidden = false;
      resultBox.innerHTML = "";
      var banner = EVv2.createResultBanner(allCorrect);
      banner.classList.add("result-banner-compact");
      resultBox.appendChild(banner);

      // v2-3から変更なし: 保存は一度だけ、問題全体の正誤は「全unitが正解の場合のみ正解」とする。
      if (!completedSaved) {
        completedSaved = true;
        if (typeof EVv2.onExerciseAnswered === "function") {
          var yourAnswerText = choiceSets
            .map(function (set, idx) {
              return "空欄" + (idx + 1) + ": " + unitStates[idx].selectedText;
            })
            .join(" ／ ");
          EVv2.onExerciseAnswered({
            ex: ex,
            exerciseKey: exerciseKey,
            yourAnswerText: yourAnswerText,
            resultKind: "partial",
            correctCount: correctCount,
            total: choiceSets.length,
          });
        }
        var rec = exerciseKey ? EVv2.recordAnswer(exerciseKey, ex.exerciseType, allCorrect) : null;
        EVv2.finalizeAnsweredCard(zones.footer, progressPanel, rec, onNext);
      }
    }
    confirmBtn.addEventListener("click", confirmAnswers);

    // v2-25: 問題文はquestionZoneへ、空欄の選択肢一覧はanswerZone内の独立スクロール領域へ、
    // 「解答を確定」ボタンはanswerZoneの下端に固定する（スクロールしても常に押せる）。
    // 「全選択→一括確定」という操作、正誤判定・修得判定・学習履歴の記録先は一切変更しない。
    var choiceQuestionSpan = EVv2.getQuestionRawSpan(ex);
    var splitQText = document.createElement("p");
    splitQText.className = "question-text";
    if (choiceQuestionSpan) {
      EVv2.appendTextWithHeadingMarkers(splitQText, choiceQuestionSpan.text);
    } else {
      splitQText.textContent = "(問題文なし)";
    }
    zones.question.appendChild(splitQText);

    var unitsScroll = document.createElement("div");
    unitsScroll.className = "multiblank-units-scroll";

    var confirmBar = document.createElement("div");
    confirmBar.className = "multiblank-confirm-bar";
    confirmBar.appendChild(confirmBtn);

    var unitsWrap = document.createElement("div");
    unitsWrap.className = "multiblank-units";
    var unitLabelEls = [];
    // v2-28(空欄ごとの解説表示): 確定後に「正解／解説」の情報行を追加する先として、
    // 各unitのコンテナ要素も保持しておく。
    var unitBoxEls = [];

    choiceSets.forEach(function (set, idx) {
      var unitBox = document.createElement("div");
      unitBox.className = "multiblank-unit";
      var label = document.createElement("div");
      label.className = "multiblank-unit-label";
      label.textContent = "空欄" + (idx + 1);
      unitBox.appendChild(label);
      unitLabelEls.push(label);
      unitBoxEls.push(unitBox);

      var choicesWrap = document.createElement("div");
      choicesWrap.className = "choices";
      set.choices.forEach(function (choiceText) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "choice-btn";
        btn.textContent = choiceText;
        btn.addEventListener("click", function () {
          selectChoice(idx, choiceText);
        });
        unitStates[idx].buttonsByText[choiceText] = btn;
        choicesWrap.appendChild(btn);
      });
      unitBox.appendChild(choicesWrap);
      unitsWrap.appendChild(unitBox);
    });

    unitsWrap.appendChild(summary);
    unitsWrap.appendChild(resultBox);
    unitsScroll.appendChild(unitsWrap);

    zones.answer.appendChild(unitsScroll);
    zones.answer.appendChild(confirmBar);
  },
};

// ---- ordering（並べ替え問題。v2-29でExercise View本体に実在する正式な問題形式へ昇格） ----
//
// v2-29以前はitem-1090専用のアダプタ(orderingAdapter.js)が起動のたびに合成する一時
// オブジェクトのみを対象にしていたが、item-1090は初回のみ本物のExerciseへ昇格されるように
// なった（app.js materializeOrderingExercise）。以後はこのハンドラが受け取るExerciseは
// 他の形式と同じくstate.data.exercisesに実在する通常のオブジェクトであり、複数正解順・
// 部分点は今回もスコープ外だが、汎用のordering exerciseTypeとして扱う。
function orderingArraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

var DRAG_HANDLE_ICON_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

var orderingHandler = {
  label: "並び替え",
  getAnswerFormNote: function (ex) {
    return ex.appEdit && ex.appEdit.origin === "migrated-from-adapter"
      ? "この項目はitem-1090専用アダプタから自動移行した並べ替え問題です（以後は通常のExerciseとして保存・編集されます）。"
      : "並べ替え問題です。";
  },
  // 独自の複数要素UIを構築する（multi_blankと同じく、render.js側の共通choice/revealループは使わない）。
  // onNextはcreateExerciseCard経由で渡された「次の問題へ」の注入コールバック(省略可)。
  // zones.answer/zones.footerはcreateExerciseCardが用意する共通の独立スクロール領域。
  renderInteractive: function (ex, context, card, progressPanel, exerciseKey, onNext, zones) {
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

    // v2-29: renderInteractiveは次の問題へ移動・再挑戦・同じ問題の再出題のたびに毎回新しく
    // 呼ばれる（既存の仕組み、render.js/app.js側）ため、uiStateはこのクロージャの中だけで
    // 完結し、そのたびに自動的に作り直される。特別なリセット処理は不要。
    var uiState = { order: shuffledStartOrder(), answered: false };

    var live = EVv2.createAriaLiveRegion();

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
      live.announce(itemById[uiState.order[target]].label + "を" + (target + 1) + "番目に移動しました。");
    }

    function renderList() {
      listEl.innerHTML = "";
      uiState.order.forEach(function (id, idx) {
        var item = itemById[id];
        var li = document.createElement("li");
        li.className = "ordering-item";
        // キーボード操作（Tabでのフォーカス移動、矢印キーでの移動）を阻害しないため、
        // liそのものにもフォーカス・矢印キー操作を持たせる（ボタン操作・ドラッグが主、これは補助）。
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

        // v2-29: ドラッグ開始はこのハンドルに限定する（カード全体をドラッグ対象にすると
        // テキスト選択・縦スクロールと競合するため）。
        var handle = document.createElement("span");
        handle.className = "drag-handle ordering-drag-handle";
        handle.innerHTML = DRAG_HANDLE_ICON_SVG;
        handle.setAttribute("aria-hidden", "true");
        li.appendChild(handle);

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

        // v2-29: 確定後のみ、位置ごとの正誤と「本来はここに何が来るべきか」を表示する
        // （確定前は正解を一切漏らさない。既存のrevealBox表示タイミングとは別に、
        // カードそのものに対応づけて出す、というユーザー要望に合わせた追加表示）。
        if (uiState.answered) {
          var isCorrectHere = correctOrder[idx] === id;
          li.classList.add(isCorrectHere ? "ordering-item-correct" : "ordering-item-wrong");
          var mark = document.createElement("span");
          mark.className = "ordering-item-result " + (isCorrectHere ? "ordering-item-result-correct" : "ordering-item-result-wrong");
          mark.textContent = isCorrectHere ? "○" : "×";
          li.appendChild(mark);
          if (!isCorrectHere) {
            var correctItem = itemById[correctOrder[idx]];
            var hint = document.createElement("div");
            hint.className = "ordering-item-correct-hint";
            hint.textContent = "正しくは: " + correctItem.label + " " + correctItem.text;
            li.appendChild(hint);
          }
        }

        listEl.appendChild(li);
      });
    }

    EVv2.attachDragReorder({
      container: listEl,
      handleSelector: ".drag-handle",
      disabled: function () {
        return uiState.answered;
      },
      onDrop: function (fromIndex, toIndex) {
        var moved = uiState.order.splice(fromIndex, 1)[0];
        uiState.order.splice(toIndex, 0, moved);
        renderList();
        live.announce(itemById[moved].label + "を" + (toIndex + 1) + "番目に移動しました。");
      },
      onCancel: function () {
        renderList();
      },
    });

    answerBtn.addEventListener("click", function () {
      if (uiState.answered) return;
      uiState.answered = true;
      var correct = orderingArraysEqual(uiState.order, correctOrder);
      renderList(); // 上下ボタンをdisabled状態にし、位置別の正誤マークを付けて再描画する
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
      // v2-29: explanationTextはordering昇格時にexplanation.raw.text（他形式共通の形）へ
      // 正規化済みのため、そちらを参照する。
      revealBox.appendChild(EVv2.createExplanationLine(ex.explanation ? ex.explanation.raw.text : null));
      var orderingSourceLine = EVv2.createSourceLine([ex.body].filter(Boolean));
      if (orderingSourceLine) revealBox.appendChild(orderingSourceLine);

      if (typeof EVv2.onExerciseAnswered === "function") {
        var submittedOrderText = uiState.order
          .map(function (id) {
            return itemById[id].label;
          })
          .join(" → ");
        EVv2.onExerciseAnswered({
          ex: ex,
          exerciseKey: exerciseKey,
          yourAnswerText: submittedOrderText,
          resultKind: "auto",
          isCorrect: correct,
        });
      }
      // v2-3の既存進捗保存機構をそのまま再利用する（新しいlocalStorageスキーマは作らない）。
      var rec = exerciseKey ? EVv2.recordAnswer(exerciseKey, ex.exerciseType, correct) : null;
      EVv2.finalizeAnsweredCard(zones.footer, progressPanel, rec, onNext);
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
    zones.answer.appendChild(listEl);
    zones.answer.appendChild(actionsEl);
    zones.answer.appendChild(revealBox);
    zones.answer.appendChild(live.el);
  },
};

EVv2.registry = {
  true_false: trueFalseHandler,
  single_blank: singleBlankHandler,
  multi_blank: multiBlankHandler,
  ordering: orderingHandler,
};
