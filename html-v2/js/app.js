// HTML v2プロトタイプの画面配線。
// v2-3(docs/v2_3_implementation_report.md)で学習履歴のlocalStorage永続化（progressStore.js）を
// 追加した。v2-4本体(docs/v2_4_implementation_report.md)で、item-1090限定のordering変換
// （orderingAdapter.js）を追加した。BSM・Exercise View生成側・正式CSV・CSV Bridge・KM Adapter・
// review override・現行HTMLはいずれも変更していない。
(function () {
  "use strict";

  var state = {
    data: null,
    context: null,
    filtered: [],
    renderedCount: 0,
    batchSize: 30,
  };

  var els = {
    fileInput: document.getElementById("ev-file-input"),
    fetchSampleBtn: document.getElementById("fetch-sample-btn"),
    metaPanel: document.getElementById("meta-panel"),
    filterSelect: document.getElementById("type-filter"),
    studyModeSelect: document.getElementById("study-mode-filter"),
    list: document.getElementById("exercise-list"),
    emptyState: document.getElementById("empty-state"),
    loadMoreBtn: document.getElementById("load-more-btn"),
    timingPanel: document.getElementById("timing-panel"),
    errorPanel: document.getElementById("error-panel"),
    answerFormPanel: document.getElementById("answer-form-panel"),
    progressKeyPanel: document.getElementById("progress-key-panel"),
    multiBlankPanel: document.getElementById("multi-blank-panel"),
    progressStoragePanel: document.getElementById("progress-storage-panel"),
    resetProgressBtn: document.getElementById("reset-progress-btn"),
    debugPanels: document.getElementById("debug-panels"),
  };

  // v2-5(docs/v2_5_implementation_report.md §5)。診断パネルは?debug=1のときのみ表示する。
  // 診断機能自体（集計・検証ロジック）は削除せず、通常利用時は非表示にするだけ。
  if (!EVv2.DEBUG_MODE) {
    els.debugPanels.hidden = true;
  }

  function showError(msg) {
    els.errorPanel.hidden = false;
    els.errorPanel.textContent = msg;
  }
  function clearError() {
    els.errorPanel.hidden = true;
    els.errorPanel.textContent = "";
  }

  function onLoaded(jsonText, sourceLabel) {
    clearError();
    var t0 = performance.now();
    var parsed;
    try {
      parsed = EVv2.parseExerciseView(jsonText);
    } catch (e) {
      showError("読み込みに失敗しました: " + e.message);
      return;
    }
    var t1 = performance.now();

    state.data = parsed.data;
    state.context = { singleBlankPool: EVv2.buildSingleBlankAnswerPool(parsed.data.exercises) };

    // v2-4本体(docs/v2_4_implementation_report.md)。item-1090専用のordering変換を試みる。
    // 対象外・変換失敗の場合はnullが返り、以降は現状どおり(withheld=非表示)のまま何も変わらない。
    // Exercise View本体(parsed.data.exercises/withheldExercises)は一切書き換えない。
    state.orderingView = EVv2.buildOrderingViewIfApplicable(parsed.data);
    state.baseExercises = state.orderingView ? parsed.data.exercises.concat([state.orderingView]) : parsed.data.exercises;
    console.log("[EVv2 orderingAdapter]", { applied: !!state.orderingView, view: state.orderingView });

    var t2 = performance.now();

    renderMeta(parsed, sourceLabel);
    renderAnswerFormStats(parsed.data);
    renderProgressKeyDiagnosis(parsed.data);
    renderMultiBlankDiagnosis(parsed.data, state.context);
    renderProgressStorageStatus();
    applyFilter();
    var t3 = performance.now();

    var msg =
      "JSON.parse: " + (t1 - t0).toFixed(1) + "ms / " +
      "前処理(distractor pool構築): " + (t2 - t1).toFixed(1) + "ms / " +
      "初期描画(" + state.renderedCount + "件): " + (t3 - t2).toFixed(1) + "ms / " +
      "合計: " + (t3 - t0).toFixed(1) + "ms / " +
      "入力サイズ: " + (jsonText.length / 1024 / 1024).toFixed(2) + "MB";
    els.timingPanel.textContent = msg;
    console.log("[EVv2 timing] " + msg);
  }

  // v2-1(docs/v2_1_data_contract_investigation.md §11検証項目1-3)。
  function renderAnswerFormStats(data) {
    var all = data.exercises.concat(data.withheldExercises);
    var counts = {};
    var missing = 0;
    all.forEach(function (ex) {
      if (ex.answerForm == null) {
        missing += 1;
      } else {
        counts[ex.answerForm] = (counts[ex.answerForm] || 0) + 1;
      }
    });
    var parts = Object.keys(counts).map(function (k) {
      return k + ": " + counts[k];
    });
    els.answerFormPanel.textContent =
      "answerForm集計 - " + parts.join(" / ") + " / 欠落(null): " + missing +
      " (true_falseは常にnullが正しい状態です)";
    console.log("[EVv2 answerForm]", { counts: counts, missing: missing });
  }

  // v2-1(docs/v2_1_data_contract_investigation.md §9)。stableItemId単独ベースの複合キー
  // (diagnoseProgressKeysが検証するスキーム)の生成可否・重複有無を検証する診断専用パネル。
  // 実際の学習履歴保存キーはexerciseId等を使うcomputeExerciseKey(v2-3で確定)が別途生成しており、
  // 本パネルの「未定義」はstableItemId単独スキームの話であって進捗保存が効かないという意味ではない。
  function renderProgressKeyDiagnosis(data) {
    var d = EVv2.diagnoseProgressKeys(data);
    els.progressKeyPanel.textContent =
      "複合キー検査(stableItemId単独スキーム, 診断専用) - 全" + d.total + "件中: " +
      "生成成功" + d.keyGeneratedCount + "件 / " +
      "stableItemId欠落" + d.missingStableItemIdCount + "件 / " +
      "本スキームでは未定義(multi_blank等、stableItemId複数件。実際の保存キーは別方式で生成される)" + d.keyUndefinedMultiIdCount + "件 / " +
      "重複キー" + d.duplicateKeyGroupCount + "グループ / " +
      "進捗保存対象(fail-closed適用後)" + d.progressEligibleCount + "件";
    console.log("[EVv2 progressKey diagnosis]", d);
  }

  // v2-2(docs/v2_2_implementation_report.md §6)。multi_blank全件を対象に、
  // choice/reveal(answerForm不一致)/reveal(distractor不足フォールバック)の内訳、
  // および distractor汚染・選択肢重複・正解欠落が0件であることを独立に再検証する。
  function renderMultiBlankDiagnosis(data, context) {
    var all = data.exercises.concat(data.withheldExercises);
    var multiBlanks = all.filter(function (ex) {
      return ex.exerciseType === "multi_blank";
    });

    // choice/reveal内訳(理由別)
    var choiceCount = 0;
    var revealAnswerFormMismatchCount = 0;
    var revealSafetyFallbackCount = 0;

    // 独立検証用(出典ベース): distractorプールの各候補が、本当にanswerForm==="blank"の
    // Exerciseから来ているかを再確認する（プール構築ロジックはexerciseId単位でフィルタしている
    // ため、これは同義反復のチェックに見えるが、独立した再検証として価値がある）。
    //
    // 注意: 初期実装ではテキスト値の一致で「禁止リスト」を作る方式を試したが、
    // 「情報提供機能」（ex-item-02、answerForm=blank）と「情報提供機能」（ex-item-04、
    // answerForm=subQuestion）のように、無関係な別項目が偶然同じ短い解答テキストを持つ実例が
    // 実データに存在するため、テキスト一致による判定は誤検出（false positive）を生むと判明した。
    // 正しくは出典(exerciseId)ベースで判定する必要がある。
    var poolExerciseIds = {};
    context.singleBlankPool.forEach(function (p) {
      poolExerciseIds[p.exerciseId] = true;
    });
    var poolSourceContaminationCount = 0;
    data.exercises.forEach(function (ex) {
      if (poolExerciseIds[ex.exerciseId] && ex.answerForm !== "blank") poolSourceContaminationCount += 1;
    });

    var duplicateChoiceCount = 0;
    var missingCorrectCount = 0;

    multiBlanks.forEach(function (ex) {
      if (ex.answerForm !== "blank") {
        revealAnswerFormMismatchCount += 1;
        return;
      }
      var sets = EVv2.buildMultiBlankChoiceSets(ex, context);
      if (!sets) {
        revealSafetyFallbackCount += 1;
        return;
      }
      choiceCount += 1;
      sets.forEach(function (set) {
        var seen = {};
        var dup = false;
        set.choices.forEach(function (c) {
          if (seen[c]) dup = true;
          seen[c] = true;
        });
        if (dup) duplicateChoiceCount += 1;
        if (set.choices.indexOf(set.correct) === -1) missingCorrectCount += 1;
      });
    });

    var keyDiag = EVv2.diagnoseMultiBlankUnitKeys(data);

    els.multiBlankPanel.textContent =
      "multi_blank診断 - 全" + multiBlanks.length + "件: " +
      "choice" + choiceCount + "件 / " +
      "reveal(answerForm不一致)" + revealAnswerFormMismatchCount + "件 / " +
      "reveal(distractor不足フォールバック)" + revealSafetyFallbackCount + "件 / " +
      "distractorプール出典汚染" + poolSourceContaminationCount + "件 / " +
      "選択肢重複" + duplicateChoiceCount + "件 / " +
      "正解欠落" + missingCorrectCount + "件\n" +
      "unit識別子診断 - 全" + keyDiag.totalUnits + "unit中: " +
      JSON.stringify(keyDiag.sourceCounts) + " / 重複キー" + keyDiag.duplicateKeyGroupCount + "グループ";
    console.log("[EVv2 multiBlank diagnosis]", {
      total: multiBlanks.length,
      choiceCount: choiceCount,
      revealAnswerFormMismatchCount: revealAnswerFormMismatchCount,
      revealSafetyFallbackCount: revealSafetyFallbackCount,
      poolSourceContaminationCount: poolSourceContaminationCount,
      duplicateChoiceCount: duplicateChoiceCount,
      missingCorrectCount: missingCorrectCount,
      unitKeyDiagnosis: keyDiag,
    });
  }

  // v2-3(docs/v2_3_implementation_report.md §6)。localStorageの利用可否・保存件数を表示する
  // （壊れたlocalStorage・利用不可環境でもアプリ本体が起動を継続していることの確認用）。
  function renderProgressStorageStatus() {
    var available = EVv2.isProgressStorageAvailable();
    var records = EVv2.getAllProgressRecords();
    els.progressStoragePanel.textContent =
      "学習履歴ストレージ - localStorage: " + (available ? "利用可能" : "利用不可（このセッション内のみ保持）") +
      " / 保存済みレコード数: " + records.length +
      " / STORAGE_KEY: " + EVv2.STORAGE_KEY;
    console.log("[EVv2 progressStorage]", { available: available, recordCount: records.length });
  }

  function renderMeta(parsed, sourceLabel) {
    var m = parsed.data.meta;
    var text =
      "読込元: " + sourceLabel + "\n" +
      "schemaVersion: " + m.schemaVersion + " / generatedAt: " + m.generatedAt + "\n" +
      "exercises: " + parsed.data.exercises.length +
      " / withheldExercises(通常はカード表示の対象外。answerForm集計・複合キー検査には含める): " + parsed.data.withheldExercises.length +
      "\nordering(item-1090)アダプタ適用: " + (state.orderingView ? "有効（1件を並べ替え形式として表示）" : "無効（対象外または変換失敗、非表示のまま）");
    if (parsed.schemaWarning) {
      text += "\n⚠ " + parsed.schemaWarning;
    }
    els.metaPanel.textContent = text;
  }

  // v2-3(docs/v2_3_implementation_report.md §5)。出題モード（全て/未修得/チェック）を、
  // 既存の表示形式フィルタ(exerciseType)と組み合わせて適用する。
  function matchesStudyMode(ex, mode) {
    if (mode === "all") return true;
    var key = EVv2.computeExerciseKey(ex);
    var rec = key ? EVv2.getProgressRecord(key, ex.exerciseType) : null;
    if (mode === "unmastered") {
      // 未修得の問題 = status !== "mastered"（未回答＝レコードが無い場合も含む）。
      return !rec || rec.status !== EVv2.PROGRESS_STATUS.MASTERED;
    }
    if (mode === "checked") {
      return !!rec && rec.checked;
    }
    return true;
  }

  function applyFilter() {
    var type = els.filterSelect.value;
    var studyMode = els.studyModeSelect.value;
    var all = state.baseExercises || state.data.exercises;
    var byType;
    if (type === "all") {
      byType = all;
    } else if (type === "unsupported") {
      byType = all.filter(function (ex) {
        return !EVv2.registry[ex.exerciseType];
      });
    } else {
      byType = all.filter(function (ex) {
        return ex.exerciseType === type;
      });
    }
    state.filtered = byType.filter(function (ex) {
      return matchesStudyMode(ex, studyMode);
    });

    els.list.innerHTML = "";
    state.renderedCount = 0;

    if (state.filtered.length === 0) {
      els.emptyState.hidden = false;
      els.emptyState.textContent = emptyStateMessage(type, studyMode, byType.length);
      els.loadMoreBtn.hidden = true;
      return;
    }
    els.emptyState.hidden = true;
    renderNextBatch();
  }

  // v2-5(docs/v2_5_implementation_report.md §4)。出題モード・表示形式の組み合わせに応じた
  // 空状態メッセージ。typeOnlyCountは出題モードを適用する「前」の件数（表示形式フィルタのみ
  // 適用した件数）。これが既に0件の場合は「対象問題そのものが無い」ことが原因であり、
  // 出題モードのせいで0件になったのではないと判別できる。
  function emptyStateMessage(type, studyMode, typeOnlyCount) {
    if (type === "ordering" && typeOnlyCount === 0) {
      return "並べ替え(ordering)形式の対象問題は現在ありません。item-1090専用の暫定対応のため、対象外のデータでは表示されません。";
    }
    if (typeOnlyCount > 0 && studyMode === "checked") {
      return "チェックした問題はまだありません。各問題の「チェック登録」ボタンを押すと、ここに表示されます。";
    }
    if (typeOnlyCount > 0 && studyMode === "unmastered") {
      return "未修得の問題はありません。表示中の範囲はすべて修得済みです。";
    }
    return "条件に一致する問題はありません。";
  }

  function renderNextBatch() {
    var next = state.filtered.slice(state.renderedCount, state.renderedCount + state.batchSize);
    var frag = document.createDocumentFragment();
    next.forEach(function (ex) {
      try {
        frag.appendChild(EVv2.createExerciseCard(ex, state.context));
      } catch (e) {
        console.error("カード描画失敗", ex.exerciseId, e);
        var errCard = document.createElement("div");
        errCard.className = "ex-card ex-card-error";
        errCard.textContent = "描画エラー: " + ex.exerciseId + " (" + e.message + ")";
        frag.appendChild(errCard);
      }
    });
    els.list.appendChild(frag);
    state.renderedCount += next.length;
    var remaining = state.filtered.length - state.renderedCount;
    els.loadMoreBtn.hidden = remaining <= 0;
    if (remaining > 0) {
      els.loadMoreBtn.textContent = "さらに読み込む（残り" + remaining + "件）";
    }
  }

  els.fileInput.addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      onLoaded(reader.result, "ファイル選択: " + file.name);
    };
    reader.onerror = function () {
      showError("ファイル読み込みに失敗しました: " + reader.error);
    };
    reader.readAsText(file, "utf-8");
  });

  function fetchSampleData(onFail) {
    fetch("./data/exercise_view_full.json")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(function (text) {
        onLoaded(text, "./data/exercise_view_full.json（自動読込）");
      })
      .catch(function (e) {
        if (onFail) onFail(e);
        else showError("読み込みに失敗しました: " + e.message);
      });
  }

  els.fetchSampleBtn.addEventListener("click", function () {
    if (location.protocol === "file:") {
      showError("file://環境ではfetch()による読み込みができません。上の「ファイルを選択」から同じJSONファイルを選んでください。");
      return;
    }
    fetchSampleData();
  });

  // 起動時の自動読み込み。npm run app:serve（html-v2/serve.mjs）経由でこのページを開いた場合、
  // 毎回ファイル選択やボタン操作をしなくても ./data/exercise_view_full.json を自動で読み込む。
  // file://で開いた場合はfetch()が使えないため何もしない（従来どおりファイル選択が必要）。
  // 失敗時（データ未同期＝ `npm run app:sync-data` 未実行等）もエラー表示のみで、
  // 手動読み込み手段（ファイル選択・ボタン）はそのまま使える状態を維持する。
  if (location.protocol !== "file:") {
    fetchSampleData(function (e) {
      showError(
        "起動時の自動読み込みに失敗しました（" + e.message + "）。" +
        "`npm run app:sync-data` でデータを同期するか、下の「ファイルを選択」から読み込んでください。"
      );
    });
  }

  els.filterSelect.addEventListener("change", function () {
    if (state.data) applyFilter();
  });
  els.studyModeSelect.addEventListener("change", function () {
    if (state.data) applyFilter();
  });
  els.loadMoreBtn.addEventListener("click", renderNextBatch);

  // v2-3(docs/v2_3_implementation_report.md §7)。実行前に確認ダイアログを表示する。
  els.resetProgressBtn.addEventListener("click", function () {
    var ok = window.confirm(
      "学習履歴（正誤回数・連続正解数・修得状態・チェック状態など）をすべて削除します。この操作は取り消せません。よろしいですか？"
    );
    if (!ok) return;
    EVv2.resetAllProgress();
    renderProgressStorageStatus();
    if (state.data) applyFilter();
  });

  if (location.protocol === "file:") {
    els.fetchSampleBtn.disabled = true;
    els.fetchSampleBtn.title = "file://環境ではfetch()が使えません（ブラウザのセキュリティ制約）";
  }
})();
