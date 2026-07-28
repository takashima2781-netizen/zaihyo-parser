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
    themeHierarchy: [], // 学習設定のテーマ→節→論点カスケード選択用（buildThemeHierarchyが構築）
  };

  // 1問ずつ学習するセッション画面専用の状態（一覧表示state.filteredとは独立）。
  var studySession = {
    queue: [],
    index: 0,
  };

  var els = {
    onboardingInfo: document.getElementById("onboarding-info"),
    initialSetup: document.getElementById("initial-setup"),
    initialFileInput: document.getElementById("initial-file-input"),
    initialLoading: document.getElementById("initial-setup-loading"),
    initialError: document.getElementById("initial-setup-error"),
    mainApp: document.getElementById("main-app"),
    studySetup: document.getElementById("study-setup"),
    studySetupThemeFilter: document.getElementById("study-setup-theme-filter"),
    studySetupSectionFilter: document.getElementById("study-setup-section-filter"),
    studySetupTopicFilter: document.getElementById("study-setup-topic-filter"),
    studySetupTypeFilter: document.getElementById("study-setup-type-filter"),
    studySetupModeFilter: document.getElementById("study-setup-mode-filter"),
    studySetupCount: document.getElementById("study-setup-count"),
    studySetupEmpty: document.getElementById("study-setup-empty"),
    startStudyBtn: document.getElementById("start-study-btn"),
    openBrowseViewBtn: document.getElementById("open-browse-view-btn"),
    studySession: document.getElementById("study-session"),
    studySessionProgress: document.getElementById("study-session-progress"),
    studySessionCardContainer: document.getElementById("study-session-card-container"),
    endStudyBtn: document.getElementById("end-study-btn"),
    browseView: document.getElementById("browse-view"),
    backToSetupBtn: document.getElementById("back-to-setup-btn"),
    fileInput: document.getElementById("ev-file-input"),
    fetchSampleBtn: document.getElementById("fetch-sample-btn"),
    dataSourceDetails: document.getElementById("data-source-details"),
    dataSourceStatus: document.getElementById("data-source-status"),
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

  // 初回セットアップ画面(#initial-setup)専用のエラー表示。メイン画面(#main-app)は
  // データ読み込み成功まで非表示のため、その間のエラーはこちらに出す。
  function showInitialSetupError(msg) {
    els.initialError.hidden = false;
    els.initialError.textContent = msg;
  }
  function clearInitialSetupError() {
    els.initialError.hidden = true;
    els.initialError.textContent = "";
  }
  function setInitialSetupLoading(isLoading) {
    els.initialLoading.hidden = !isLoading;
    els.initialFileInput.disabled = isLoading;
  }
  function showMainApp() {
    els.initialSetup.hidden = true;
    els.mainApp.hidden = false;
    // 学習中は内部実装・保存先の説明を出さない（データを問題なく読み込めている場合のみ）。
    // 初回セットアップ画面（読み込み前・エラー時）ではこれまでどおり表示したままにする。
    els.onboardingInfo.hidden = true;
    showStudySetup();
  }

  // #main-app内の3画面（学習設定／学習セッション／問題一覧）は同時に1つだけ表示する。
  function showStudySetup() {
    els.studySetup.hidden = false;
    els.studySession.hidden = true;
    els.browseView.hidden = true;
    // 学習セッション終了直後などは修得状態が変わっている可能性があるため、都度再計算する。
    if (state.data) updateStudySetupCount();
  }
  function showStudySession() {
    els.studySetup.hidden = true;
    els.studySession.hidden = false;
    els.browseView.hidden = true;
  }
  function showBrowseView() {
    els.studySetup.hidden = true;
    els.studySession.hidden = true;
    els.browseView.hidden = false;
    if (state.data) applyFilter();
  }

  // GitHub Pages公開フェーズ（docs/exercise_view_full_output_separation_report.mdの続き）。
  // opts.skipCacheSave: IndexedDBキャッシュから復元した内容をそのまま書き戻さないためのフラグ。
  // opts.cachedAt: キャッシュ復元時、状態表示に「最初に保存された時刻」を出すためのISO文字列
  // （省略時は現在時刻＝新規読み込み扱い）。
  function onLoaded(jsonText, sourceLabel, opts) {
    opts = opts || {};
    var isFirstLoad = !state.data;
    clearError();
    clearInitialSetupError();
    var t0 = performance.now();
    var parsed;
    try {
      parsed = EVv2.parseExerciseView(jsonText);
    } catch (e) {
      if (isFirstLoad) {
        setInitialSetupLoading(false);
        showInitialSetupError("読み込みに失敗しました: " + e.message);
      } else {
        showError("読み込みに失敗しました: " + e.message);
      }
      return;
    }
    var t1 = performance.now();

    state.data = parsed.data;
    state.context = { singleBlankPool: EVv2.buildSingleBlankAnswerPool(parsed.data.exercises) };

    var savedAt = opts.cachedAt || new Date().toISOString();
    renderDataSourceStatus(sourceLabel, savedAt);
    if (!opts.skipCacheSave) {
      EVv2.saveDataCache(jsonText, {
        savedAt: savedAt,
        sourceLabel: sourceLabel,
        schemaVersion: parsed.data.meta.schemaVersion,
        exerciseCount: parsed.data.exercises.length,
        withheldCount: parsed.data.withheldExercises.length,
      }).catch(function (e) {
        console.warn("[EVv2 dataCache] 保存に失敗しました。次回起動時にこの端末で自動読み込みできない場合があります。", e);
      });
    }

    // v2-4本体(docs/v2_4_implementation_report.md)。item-1090専用のordering変換を試みる。
    // 対象外・変換失敗の場合はnullが返り、以降は現状どおり(withheld=非表示)のまま何も変わらない。
    // Exercise View本体(parsed.data.exercises/withheldExercises)は一切書き換えない。
    state.orderingView = EVv2.buildOrderingViewIfApplicable(parsed.data);
    state.baseExercises = state.orderingView ? parsed.data.exercises.concat([state.orderingView]) : parsed.data.exercises;
    console.log("[EVv2 orderingAdapter]", { applied: !!state.orderingView, view: state.orderingView });

    // v1.7.0のExercise View(structurePath/structure)を使い、学習設定のテーマ→節→論点
    // カスケード選択肢を構築する。データ再読み込み時にも毎回作り直す。
    state.themeHierarchy = buildThemeHierarchy(state.baseExercises);
    populateThemeSelect();
    populateSectionSelect("all");
    populateTopicSelect("all", "all");

    var t2 = performance.now();

    renderMeta(parsed, sourceLabel);
    renderAnswerFormStats(parsed.data);
    renderProgressKeyDiagnosis(parsed.data);
    renderMultiBlankDiagnosis(parsed.data, state.context);
    renderProgressStorageStatus();
    applyFilter();
    var t3 = performance.now();

    if (isFirstLoad) {
      setInitialSetupLoading(false);
      showMainApp();
    } else {
      updateStudySetupCount();
    }

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
      " / STORAGE_KEY: " + EVv2.STORAGE_KEY +
      "\n問題データキャッシュ - IndexedDB: 確認中...";
    console.log("[EVv2 progressStorage]", { available: available, recordCount: records.length });

    // GitHub Pages公開フェーズ。教材データ本体のキャッシュ（学習履歴とは別の保存領域）の
    // 利用可否を追記する（非同期のため、上の1行を先に描画してから追記する）。
    EVv2.isDataCacheAvailable().then(function (dataCacheAvailable) {
      els.progressStoragePanel.textContent = els.progressStoragePanel.textContent.replace(
        "問題データキャッシュ - IndexedDB: 確認中...",
        "問題データキャッシュ - IndexedDB: " + (dataCacheAvailable ? "利用可能" : "利用不可（毎回の手動読み込みが必要）") +
          " / DB名: " + EVv2.DATA_CACHE_DB_NAME
      );
    });
  }

  // GitHub Pages公開フェーズ。通常利用時（?debug=1なし）でも見える、データの由来・保存時刻の
  // 簡易表示。「今表示している問題が最新か」を利用者自身が判断できるようにするための表示であり、
  // 診断パネル（?debug=1限定）とは別に常時表示する。
  function renderDataSourceStatus(sourceLabel, savedAtIso) {
    if (!els.dataSourceStatus) return;
    var savedDate = new Date(savedAtIso);
    var savedText = isNaN(savedDate.getTime()) ? savedAtIso : savedDate.toLocaleString("ja-JP");
    els.dataSourceStatus.textContent = "現在のデータ: " + sourceLabel + "（保存: " + savedText + "）";
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

  // 表示形式(exerciseType)フィルタのみを適用する。一覧表示(applyFilter)と学習セッションの
  // 出題キュー構築(buildStudyQueue)の両方から共有して呼ばれる。
  function filterByType(all, type) {
    if (type === "all") return all;
    if (type === "unsupported") {
      return all.filter(function (ex) {
        return !EVv2.registry[ex.exerciseType];
      });
    }
    return all.filter(function (ex) {
      return ex.exerciseType === type;
    });
  }

  function applyFilter() {
    var type = els.filterSelect.value;
    var studyMode = els.studyModeSelect.value;
    var all = state.baseExercises || state.data.exercises;
    var byType = filterByType(all, type);
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

  // ---- 学習セッション（1問ずつ学習する画面）。一覧表示(state.filtered)とは独立して
  // studySession.queueを持つ。出題テーマ(theme→section→topic)・問題形式・出題モードの
  // 3軸で絞り込む（学習スタイル・出題順は未定義のため引き続き対象外）。 ----

  // Exercise Viewのstructure(v1.7.0、theme/section/topic)から、テーマ→節→論点の
  // カスケード選択肢を構築する。ex.structureにtopic(またはsection)が無い項目もある
  // （BSM上、checkSectionが直接section配下に付く等、階層の深さが一定でないため。原則6・7、
  // 推測で埋めない）。その場合はそのexerciseを該当する上位階層までのみ登録し、
  // 存在しない下位階層は持たせない（matchesThemeHierarchyが「その階層を指定されたら除外」する）。
  function buildThemeHierarchy(exercises) {
    var themes = [];
    var themeMap = {};
    exercises.forEach(function (ex) {
      var s = ex.structure;
      if (!s || !s.theme) return;
      var themeEntry = themeMap[s.theme.structureNodeId];
      if (!themeEntry) {
        themeEntry = { id: s.theme.structureNodeId, title: s.theme.titleRaw.text, sectionsOrder: [], sectionsMap: {} };
        themeMap[themeEntry.id] = themeEntry;
        themes.push(themeEntry);
      }
      if (!s.section) return;
      var sectionEntry = themeEntry.sectionsMap[s.section.structureNodeId];
      if (!sectionEntry) {
        sectionEntry = { id: s.section.structureNodeId, title: s.section.titleRaw.text, topicsOrder: [], topicsMap: {} };
        themeEntry.sectionsMap[sectionEntry.id] = sectionEntry;
        themeEntry.sectionsOrder.push(sectionEntry);
      }
      if (!s.topic) return;
      if (!sectionEntry.topicsMap[s.topic.structureNodeId]) {
        var topicEntry = { id: s.topic.structureNodeId, title: s.topic.titleRaw.text };
        sectionEntry.topicsMap[topicEntry.id] = topicEntry;
        sectionEntry.topicsOrder.push(topicEntry);
      }
    });
    return themes;
  }

  function findTheme(themeId) {
    return state.themeHierarchy.filter(function (t) { return t.id === themeId; })[0] || null;
  }
  function findSection(themeId, sectionId) {
    var theme = findTheme(themeId);
    return (theme && theme.sectionsMap[sectionId]) || null;
  }

  function populateSelectOptions(selectEl, items) {
    selectEl.innerHTML = "";
    var allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "すべて";
    selectEl.appendChild(allOpt);
    items.forEach(function (item) {
      var opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.title;
      selectEl.appendChild(opt);
    });
    selectEl.disabled = items.length === 0;
  }

  function populateThemeSelect() {
    populateSelectOptions(els.studySetupThemeFilter, state.themeHierarchy);
  }
  function populateSectionSelect(themeId) {
    var theme = findTheme(themeId);
    populateSelectOptions(els.studySetupSectionFilter, theme ? theme.sectionsOrder : []);
  }
  function populateTopicSelect(themeId, sectionId) {
    var section = findSection(themeId, sectionId);
    populateSelectOptions(els.studySetupTopicFilter, section ? section.topicsOrder : []);
  }

  // themeId/sectionId/topicIdはそれぞれ"all"または具体的なstructureNodeId。
  // 該当する階層情報を持たないExercise（buildThemeHierarchyのコメント参照）は、
  // 具体的なIDを指定された時点で該当なしとして除外する（推測で一致させない）。
  function matchesThemeHierarchy(ex, themeId, sectionId, topicId) {
    var s = ex.structure;
    if (themeId !== "all" && (!s || !s.theme || s.theme.structureNodeId !== themeId)) return false;
    if (sectionId !== "all" && (!s || !s.section || s.section.structureNodeId !== sectionId)) return false;
    if (topicId !== "all" && (!s || !s.topic || s.topic.structureNodeId !== topicId)) return false;
    return true;
  }

  function buildStudyQueue() {
    var type = els.studySetupTypeFilter.value;
    var studyMode = els.studySetupModeFilter.value;
    var themeId = els.studySetupThemeFilter.value;
    var sectionId = els.studySetupSectionFilter.value;
    var topicId = els.studySetupTopicFilter.value;
    var all = state.baseExercises || state.data.exercises;
    var byType = filterByType(all, type);
    return byType.filter(function (ex) {
      return matchesStudyMode(ex, studyMode) && matchesThemeHierarchy(ex, themeId, sectionId, topicId);
    });
  }

  // 設定変更のたびに対象問題数を再計算し、0件なら「学習を始める」を無効化する。
  function updateStudySetupCount() {
    var count = buildStudyQueue().length;
    els.studySetupCount.textContent = "対象問題数：" + count + "問";
    els.startStudyBtn.disabled = count === 0;
    els.studySetupEmpty.hidden = count !== 0;
    if (count === 0) els.studySetupEmpty.textContent = "条件に該当する問題がありません。";
  }

  function renderStudySessionCard() {
    els.studySessionCardContainer.innerHTML = "";

    if (studySession.index >= studySession.queue.length) {
      els.studySessionProgress.textContent = "";
      var doneMsg = document.createElement("p");
      doneMsg.className = "empty-state";
      doneMsg.textContent = "この条件の問題をすべて学習しました。";
      els.studySessionCardContainer.appendChild(doneMsg);
      return;
    }

    els.studySessionProgress.textContent =
      (studySession.index + 1) + " / " + studySession.queue.length + "問";

    var ex = studySession.queue[studySession.index];
    try {
      var card = EVv2.createExerciseCard(ex, state.context, function () {
        studySession.index += 1;
        renderStudySessionCard();
      });
      els.studySessionCardContainer.appendChild(card);
    } catch (e) {
      console.error("カード描画失敗", ex.exerciseId, e);
      var errCard = document.createElement("div");
      errCard.className = "ex-card ex-card-error";
      errCard.textContent = "描画エラー: " + ex.exerciseId + " (" + e.message + ")";
      els.studySessionCardContainer.appendChild(errCard);
    }
  }

  els.startStudyBtn.addEventListener("click", function () {
    if (!state.data) return;
    var queue = buildStudyQueue();
    if (queue.length === 0) return; // ボタンは既に無効化されているはずのフェイルセーフ
    studySession.queue = queue;
    studySession.index = 0;
    showStudySession();
    renderStudySessionCard();
  });

  els.endStudyBtn.addEventListener("click", function () {
    showStudySetup();
  });

  // テーマ→節→論点のカスケード。上位を変更したら下位の選択肢を作り直し、"すべて"に戻す。
  els.studySetupThemeFilter.addEventListener("change", function () {
    populateSectionSelect(els.studySetupThemeFilter.value);
    populateTopicSelect(els.studySetupThemeFilter.value, "all");
    updateStudySetupCount();
  });
  els.studySetupSectionFilter.addEventListener("change", function () {
    populateTopicSelect(els.studySetupThemeFilter.value, els.studySetupSectionFilter.value);
    updateStudySetupCount();
  });
  els.studySetupTopicFilter.addEventListener("change", updateStudySetupCount);
  els.studySetupTypeFilter.addEventListener("change", updateStudySetupCount);
  els.studySetupModeFilter.addEventListener("change", updateStudySetupCount);

  els.openBrowseViewBtn.addEventListener("click", function () {
    showBrowseView();
  });

  els.backToSetupBtn.addEventListener("click", function () {
    showStudySetup();
  });

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

  // 初回セットアップ画面(#initial-setup)側のファイル選択。データ未読込の間はこちらが窓口になる
  // （メイン画面側のels.fileInputは#main-appが表示されて初めて操作可能になる）。
  els.initialFileInput.addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    clearInitialSetupError();
    setInitialSetupLoading(true);
    var reader = new FileReader();
    reader.onload = function () {
      onLoaded(reader.result, "ファイル選択: " + file.name);
    };
    reader.onerror = function () {
      setInitialSetupLoading(false);
      showInitialSetupError("ファイル読み込みに失敗しました: " + reader.error);
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

  // GitHub Pages公開フェーズ。教材データ（output/exercise_view_full.json由来）はこれまでどおり
  // Git管理外・公開サイトへは含めないため、公開URL上では ./data/exercise_view_full.json への
  // fetchは常に失敗する（意図した挙動）。その場合はこの端末のIndexedDBキャッシュへフォールバックし、
  // それも無ければ初回セットアップ導線（手動ファイル選択）を案内する。
  // ローカル開発（npm run app:serve、html-v2/serve.mjs経由）では従来どおりfetchが成功し、
  // 常に最新の同期済みデータを使う（キャッシュより優先）。
  function tryLoadFromCache(onNoCache) {
    EVv2.loadDataCache().then(function (cached) {
      if (cached && cached.jsonText) {
        var label = "この端末のキャッシュ" + (cached.meta && cached.meta.sourceLabel ? "（元: " + cached.meta.sourceLabel + "）" : "");
        onLoaded(cached.jsonText, label, {
          skipCacheSave: true,
          cachedAt: cached.meta && cached.meta.savedAt,
        });
      } else {
        onNoCache();
      }
    });
  }

  // キャッシュも無い場合、#initial-setupは初期状態のまま（デフォルトで表示済み）で
  // 案内が完結するため、ここでは何もしない。
  function noCacheAvailable() {}

  if (location.protocol === "file:") {
    // file://ではfetch()が使えないため、キャッシュの有無だけで判定する。
    tryLoadFromCache(noCacheAvailable);
  } else {
    fetchSampleData(function () {
      tryLoadFromCache(noCacheAvailable);
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
