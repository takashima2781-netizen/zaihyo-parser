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
  // v2-12(振り返り機能): answeredLogは今回のセッション中に回答した問題の一時的な記録
  // （メモリ上のみ。progressStore/localStorageの保存形式・保存先は一切変更しない）。
  // retryは「この問題をもう一度解く」実行中の状態（元の一覧/詳細表示に戻るための情報を保持）。
  var studySession = {
    queue: [],
    index: 0,
    answeredLog: [],
  };
  var studyReview = {
    filter: "all", // "all" | "wrong"
    detailEntry: null,
    retryReturnTo: null, // { view: "list" } | { view: "detail", entry } | null（もう一度解く実行前の画面）
  };

  var els = {
    header: document.querySelector("header"),
    onboardingInfo: document.getElementById("onboarding-info"),
    initialSetup: document.getElementById("initial-setup"),
    initialFileInput: document.getElementById("initial-file-input"),
    initialLoading: document.getElementById("initial-setup-loading"),
    initialError: document.getElementById("initial-setup-error"),
    mainApp: document.getElementById("main-app"),
    studySetup: document.getElementById("study-setup"),
    studySetupThemeSelect: document.getElementById("study-setup-theme-select"),
    studySetupSectionSelect: document.getElementById("study-setup-section-select"),
    studySetupTopicSelect: document.getElementById("study-setup-topic-select"),
    studySetupTypeChips: document.getElementById("study-setup-type-chips"),
    studySetupModeChips: document.getElementById("study-setup-mode-chips"),
    studySetupPickerToggle: document.getElementById("study-setup-picker-toggle"),
    studySetupPickerPanel: document.getElementById("study-setup-picker-panel"),
    studySetupPickerSummaryText: document.getElementById("study-setup-picker-summary-text"),
    studySetupDockSummary: document.getElementById("study-setup-dock-summary"),
    studySetupDockCount: document.getElementById("study-setup-dock-count"),
    startStudyBtn: document.getElementById("start-study-btn"),
    openBrowseViewBtn: document.getElementById("open-browse-view-btn"),
    themeSwitch: document.getElementById("theme-switch"),
    studySession: document.getElementById("study-session"),
    studySessionProgress: document.getElementById("study-session-progress"),
    studySessionCardContainer: document.getElementById("study-session-card-container"),
    endStudyBtn: document.getElementById("end-study-btn"),
    endStudyConfirmBackdrop: document.getElementById("end-study-confirm"),
    endStudyConfirmYesBtn: document.getElementById("end-study-confirm-yes"),
    endStudyConfirmNoBtn: document.getElementById("end-study-confirm-no"),
    editMenuBtn: document.getElementById("edit-menu-btn"),
    exportEditedDataBtn: document.getElementById("export-edited-data-btn"),
    genericConfirmBackdrop: document.getElementById("generic-confirm"),
    genericConfirmTitle: document.getElementById("generic-confirm-title"),
    genericConfirmYesBtn: document.getElementById("generic-confirm-yes"),
    genericConfirmNoBtn: document.getElementById("generic-confirm-no"),
    studyReview: document.getElementById("study-review"),
    studyReviewListView: document.getElementById("study-review-list-view"),
    studyReviewDetailView: document.getElementById("study-review-detail-view"),
    studyReviewStats: document.getElementById("study-review-stats"),
    studyReviewFilterAllBtn: document.getElementById("study-review-filter-all"),
    studyReviewFilterWrongBtn: document.getElementById("study-review-filter-wrong"),
    studyReviewList: document.getElementById("study-review-list"),
    studyReviewBackBtn: document.getElementById("study-review-back-btn"),
    studyReviewDetailBackBtn: document.getElementById("study-review-detail-back-btn"),
    studyReviewDetailBody: document.getElementById("study-review-detail-body"),
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

  // v2-25: 学習画面はページ全体をスクロールさせず、ヘッダー直下から画面下端までの高さに
  // 固定する（CSS側の#study-sessionがcalc(100dvh - var(--header-h))を使う）。
  // ヘッダーの内容（テーマ切替⇔進捗表示）で高さが変わるため、画面切替のたびに呼び直す。
  function syncHeaderHeightVar() {
    document.documentElement.style.setProperty("--header-h", els.header.getBoundingClientRect().height + "px");
  }
  syncHeaderHeightVar();
  window.addEventListener("resize", syncHeaderHeightVar);

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

  // #main-app内の4画面（学習設定／学習セッション／振り返り／問題一覧）は同時に1つだけ表示する。
  function showStudySetup() {
    els.studySetup.hidden = false;
    els.studySession.hidden = true;
    els.studyReview.hidden = true;
    els.browseView.hidden = true;
    els.header.classList.remove("theme-switch-hidden");
    syncHeaderHeightVar();
    // 学習セッション終了直後などは修得状態が変わっている可能性があるため、都度再計算する。
    if (state.data) updateStudySetupCount();
  }
  function showStudySession() {
    els.studySetup.hidden = true;
    els.studySession.hidden = false;
    els.studyReview.hidden = true;
    els.browseView.hidden = true;
    // v2-16/v2-20: 問題を解いている間はテーマ切替の代わりに進捗・終了ボタンを表示する
    // （ヘッダー内の同じ位置。CSS側のheader.theme-switch-hidden .study-session-headerが担う）。
    els.header.classList.add("theme-switch-hidden");
    syncHeaderHeightVar();
  }
  function showBrowseView() {
    els.studySetup.hidden = true;
    els.studySession.hidden = true;
    els.studyReview.hidden = true;
    els.browseView.hidden = false;
    els.header.classList.remove("theme-switch-hidden");
    syncHeaderHeightVar();
    if (state.data) applyFilter();
  }

  // GitHub Pages公開フェーズ（docs/exercise_view_full_output_separation_report.mdの続き）。
  // opts.skipCacheSave: IndexedDBキャッシュから復元した内容をそのまま書き戻さないためのフラグ。
  // opts.cachedAt: キャッシュ復元時、状態表示に「最初に保存された時刻」を出すためのISO文字列
  // （省略時は現在時刻＝新規読み込み扱い）。
  // v2-27(編集モード): state.dataの中身(exercises配列)をミューテートした後、派生状態
  // （distractor pool・マーカー索引・orderingアダプタ・テーマ階層・一覧フィルタ・
  // 学習設定の件数表示）を作り直す。onLoaded（新規読み込み時）・commitDataEdit（編集保存時）の
  // 両方から呼ぶ共通処理。JSONの再パースは行わない（オブジェクト参照を維持し、
  // 学習セッション中のカード等、既に該当exerciseオブジェクトを参照している箇所にも
  // そのまま反映されるようにするため）。
  function refreshDerivedState() {
    // v2-7: single_blankの対象マーカー強調用。同じ本文を共有するmulti_blank兄弟の
    // bodySegmentsから、blankUnitId単位のマーカー位置情報を索引化する(docs/未作成、
    // html-v2/js/blankMarkerIndex.js参照)。
    state.context = {
      singleBlankPool: EVv2.buildSingleBlankAnswerPool(state.data.exercises),
      blankMarkerIndex: EVv2.buildBlankMarkerIndex(state.data.exercises),
    };

    // v2-4本体(docs/v2_4_implementation_report.md)。item-1090専用のordering変換を試みる。
    // 対象外・変換失敗の場合はnullが返り、以降は現状どおり(withheld=非表示)のまま何も変わらない。
    // Exercise View本体(state.data.exercises/withheldExercises)は一切書き換えない。
    state.orderingView = EVv2.buildOrderingViewIfApplicable(state.data);
    state.baseExercises = state.orderingView ? state.data.exercises.concat([state.orderingView]) : state.data.exercises;

    // v1.7.0のExercise View(structurePath/structure)を使い、学習設定のテーマ→節→論点
    // カスケード選択肢を構築する。データ再読み込み・編集保存のたびに毎回作り直す。
    state.themeHierarchy = buildThemeHierarchy(state.baseExercises);
    populateThemeSelect();

    applyFilter();
    updateStudySetupCount();
  }

  // v2-27(編集モード): 編集画面の「保存」で呼ばれる。EVv2.ExerciseEditor側の各関数が
  // state.data.exercises内のオブジェクトを直接ミューテートしている前提で、
  // 派生状態の再構築とIndexedDBへの保存（EVv2.dataRepository経由、将来差し替え可能）を行う。
  // 学習セッション表示中は、削除等でキューから消えた項目を整合させたうえでカードを再描画する。
  function commitDataEdit() {
    refreshDerivedState();

    var jsonText = JSON.stringify(state.data);
    EVv2.dataRepository
      .save(jsonText, {
        savedAt: new Date().toISOString(),
        sourceLabel: "編集（アプリ内エディタ）",
        schemaVersion: state.data.meta.schemaVersion,
        exerciseCount: state.data.exercises.length,
        withheldCount: state.data.withheldExercises.length,
      })
      .catch(function (e) {
        console.warn("[EVv2 editStore] 編集内容のIndexedDB保存に失敗しました。この端末に保存されない可能性があります。", e);
      });
    renderDataSourceStatus("編集（アプリ内エディタ）", new Date().toISOString());

    if (!els.studySession.hidden) {
      var currentExRef = studySession.queue[studySession.index];
      var baseSet = state.baseExercises;
      studySession.queue = studySession.queue.filter(function (ex) {
        return baseSet.indexOf(ex) !== -1;
      });
      var newIndex = studySession.queue.indexOf(currentExRef);
      studySession.index = newIndex !== -1 ? newIndex : Math.min(studySession.index, studySession.queue.length);
      renderStudySessionCard();
    }
  }
  EVv2.commitDataEdit = commitDataEdit;
  EVv2.getEditableExercises = function () {
    return state.data.exercises;
  };

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

    var savedAt = opts.cachedAt || new Date().toISOString();
    renderDataSourceStatus(sourceLabel, savedAt);
    if (!opts.skipCacheSave) {
      EVv2.dataRepository
        .save(jsonText, {
          savedAt: savedAt,
          sourceLabel: sourceLabel,
          schemaVersion: parsed.data.meta.schemaVersion,
          exerciseCount: parsed.data.exercises.length,
          withheldCount: parsed.data.withheldExercises.length,
        })
        .catch(function (e) {
          console.warn("[EVv2 dataCache] 保存に失敗しました。次回起動時にこの端末で自動読み込みできない場合があります。", e);
        });
    }

    refreshDerivedState();
    console.log("[EVv2 orderingAdapter]", { applied: !!state.orderingView, view: state.orderingView });

    var t2 = performance.now();

    renderMeta(parsed, sourceLabel);
    renderAnswerFormStats(parsed.data);
    renderProgressKeyDiagnosis(parsed.data);
    renderMultiBlankDiagnosis(parsed.data, state.context);
    renderProgressStorageStatus();
    var t3 = performance.now();

    if (isFirstLoad) {
      setInitialSetupLoading(false);
      showMainApp();
    }

    var msg =
      "JSON.parse: " + (t1 - t0).toFixed(1) + "ms / " +
      "前処理+初期描画(distractor pool構築等): " + (t2 - t1).toFixed(1) + "ms / " +
      "診断パネル描画(" + state.renderedCount + "件): " + (t3 - t2).toFixed(1) + "ms / " +
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

  // v2-15(教材ピッカーをプルダウンへ差し戻し): テーマは27件超あり、横スクロールのチップは
  // 操作性が悪いためselectに戻す。データの意味づけ(themeHierarchy・structureNodeId)や
  // カスケード（テーマ→節→論点）のロジック自体はv2-13から変更していない。
  function populateSelectOptions(selectEl, nodes, labelFn) {
    selectEl.innerHTML = "";
    var allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "すべて";
    selectEl.appendChild(allOpt);
    nodes.forEach(function (n) {
      var opt = document.createElement("option");
      opt.value = n.id;
      opt.textContent = labelFn ? labelFn(n.title) : n.title;
      selectEl.appendChild(opt);
    });
    selectEl.value = "all";
    selectEl.disabled = nodes.length === 0;
  }

  // KNOWN-ISSUE: 元データ(titleRaw.text)上、テーマ26のみ見出しに「テーマ」の語が欠落している
  // （原文自体は書き換えない。表示専用のラベル整形としてのみ、この画面内で補う）。
  function formatThemeTitle(title) {
    return /^\d/.test(title) && title.indexOf("テーマ") !== 0 ? "テーマ" + title : title;
  }

  function populateThemeSelect() {
    populateSelectOptions(els.studySetupThemeSelect, state.themeHierarchy, formatThemeTitle);
    populateSectionSelect("all");
    populateTopicSelect("all", "all");
  }
  function populateSectionSelect(themeId) {
    var theme = findTheme(themeId);
    populateSelectOptions(els.studySetupSectionSelect, theme ? theme.sectionsOrder : []);
  }
  function populateTopicSelect(themeId, sectionId) {
    var section = findSection(themeId, sectionId);
    populateSelectOptions(els.studySetupTopicSelect, section ? section.topicsOrder : []);
  }

  els.studySetupThemeSelect.addEventListener("change", function () {
    populateSectionSelect(els.studySetupThemeSelect.value);
    populateTopicSelect(els.studySetupThemeSelect.value, "all");
    updateStudySetupCount();
  });
  els.studySetupSectionSelect.addEventListener("change", function () {
    populateTopicSelect(els.studySetupThemeSelect.value, els.studySetupSectionSelect.value);
    updateStudySetupCount();
  });
  els.studySetupTopicSelect.addEventListener("change", updateStudySetupCount);

  // 問題形式は英語のexerciseTypeそのままだと直感的でないため、日本語ラベルで表示する
  // （フィルタの実装値・buildStudyQueueが参照する値は従来のexerciseType文字列のまま）。
  var TYPE_ITEMS = [
    { value: "all", label: "全て" },
    { value: "true_false", label: "〇×" },
    { value: "single_blank", label: "穴埋め" },
    { value: "multi_blank", label: "多重穴埋め" },
    { value: "ordering", label: "並び替え" },
  ];
  var MODE_ITEMS = [
    { value: "all", label: "すべての問題" },
    { value: "unmastered", label: "未修得の問題" },
    { value: "checked", label: "チェック問題" },
  ];
  var typeChipGroup = EVv2.createChipGroup(els.studySetupTypeChips, {
    items: TYPE_ITEMS,
    value: "all",
    onChange: updateStudySetupCount,
  });
  var modeChipGroup = EVv2.createChipGroup(els.studySetupModeChips, {
    items: MODE_ITEMS,
    value: "all",
    onChange: updateStudySetupCount,
  });

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
    var type = typeChipGroup.getValue();
    var studyMode = modeChipGroup.getValue();
    var themeId = els.studySetupThemeSelect.value;
    var sectionId = els.studySetupSectionSelect.value;
    var topicId = els.studySetupTopicSelect.value;
    var all = state.baseExercises || state.data.exercises;
    var byType = filterByType(all, type);
    return byType.filter(function (ex) {
      return matchesStudyMode(ex, studyMode) && matchesThemeHierarchy(ex, themeId, sectionId, topicId);
    });
  }

  // v2-14(教材ピッカー・ドックUI化): 教材ピッカーの要約行と、画面下部に常時固定した
  // ドック（現在の絞り込み内容の一文＋開始ボタン）を、設定変更のたびに再計算する。
  function updateStudySetupCount() {
    var count = buildStudyQueue().length;
    var themeId = els.studySetupThemeSelect.value;
    var theme = themeId === "all" ? null : findTheme(themeId);
    var themeLabel = theme ? formatThemeTitle(theme.title) : "すべて";
    var typeLabel = typeChipGroup.getLabel() || "全て";
    var modeLabel = modeChipGroup.getLabel() || "すべての問題";

    // 問題数は下部のドックに一本化する（ピッカー要約行では重複させない）。
    els.studySetupPickerSummaryText.textContent = themeLabel;

    els.studySetupDockSummary.textContent = "";
    if (count === 0) {
      els.studySetupDockSummary.textContent = "条件に該当する問題がありません";
    } else {
      els.studySetupDockSummary.appendChild(document.createTextNode(themeLabel));
      [typeLabel, modeLabel].forEach(function (label) {
        var sep = document.createElement("span");
        sep.className = "sep";
        sep.textContent = "・";
        els.studySetupDockSummary.appendChild(sep);
        els.studySetupDockSummary.appendChild(document.createTextNode(label));
      });
    }
    els.studySetupDockCount.textContent = count;
    els.startStudyBtn.disabled = count === 0;
  }

  function renderStudySessionCard() {
    els.studySessionCardContainer.innerHTML = "";

    if (studySession.index >= studySession.queue.length) {
      showStudyReview();
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

  // ---- v2-12: 振り返り機能（今回のセッションを振り返る。progressStore/localStorageは
  // 参照のみ・チェック状態の読み書きは既存のtoggleChecked/getProgressRecordをそのまま使う）。----

  function isReviewEntryWrongish(entry) {
    if (entry.resultKind === "partial") return entry.correctCount < entry.total;
    return entry.isCorrect !== true;
  }

  // exerciseType・structureTypeに応じて、振り返り画面に出す「解答」「解説」を組み立てる。
  // 各registry.jsハンドラが持つ既存ロジック(getCorrectLabel等)と同じ実データ参照のみで構成し、
  // 新しい判定・推測は行わない。
  function describeAnswerForReview(ex) {
    if (ex.exerciseType === "true_false") {
      return {
        answer: ex.judgement ? ex.judgement.symbolRaw.text : "(judgementなし)",
        explanation: ex.explanation ? ex.explanation.raw.text : null,
      };
    }
    if (ex.exerciseType === "single_blank") {
      var item = ex.expectedAnswer && ex.expectedAnswer[0];
      return {
        answer: item ? item.answerText.text : "(expectedAnswerなし)",
        explanation: ex.explanation ? ex.explanation.raw.text : null,
      };
    }
    if (ex.exerciseType === "multi_blank") {
      if (Array.isArray(ex.subQuestions) && ex.subQuestions.length > 0) {
        return {
          answer: ex.subQuestions
            .map(function (sq, i) {
              return "中問" + (i + 1) + ": " + sq.expectedAnswer.text;
            })
            .join(" ／ "),
          explanation: null,
        };
      }
      return {
        answer: ex.expectedAnswer
          .map(function (u, i) {
            return "空欄" + (i + 1) + "=" + u.answerText.text;
          })
          .join(" ／ "),
        explanation: null,
      };
    }
    if (ex.exerciseType === "ordering") {
      return {
        answer: ex.correctOrder
          .map(function (id) {
            var found = ex.orderingItems.filter(function (it) {
              return it.id === id;
            })[0];
            return found ? found.label : id;
          })
          .join(" → "),
        explanation: ex.explanationText || null,
      };
    }
    return { answer: "(不明)", explanation: null };
  }

  function getReviewQuestionText(ex) {
    if (ex.exerciseType === "multi_blank" && Array.isArray(ex.subQuestions) && ex.subQuestions.length > 0) {
      var parts = ex.instructionRaw ? [ex.instructionRaw.text] : [];
      ex.subQuestions.forEach(function (sq, i) {
        parts.push("中問" + (i + 1) + ": " + sq.body.text);
      });
      return parts.join("\n");
    }
    var span = EVv2.getQuestionRawSpan(ex);
    return span ? span.text : "(問題文なし)";
  }

  function reviewResultMarkText(entry) {
    if (entry.resultKind === "partial") return entry.correctCount + "/" + entry.total;
    return entry.isCorrect ? "○" : "×";
  }
  function reviewResultMarkClass(entry) {
    if (entry.resultKind === "partial") {
      return entry.correctCount === entry.total ? "review-mark-correct" : entry.correctCount === 0 ? "review-mark-wrong" : "review-mark-partial";
    }
    return entry.isCorrect ? "review-mark-correct" : "review-mark-wrong";
  }

  function showStudyReview() {
    els.studySetup.hidden = true;
    els.studySession.hidden = true;
    els.browseView.hidden = true;
    els.studyReview.hidden = false;
    els.studyReviewListView.hidden = false;
    els.studyReviewDetailView.hidden = true;
    els.header.classList.remove("theme-switch-hidden");
    syncHeaderHeightVar();
    renderReviewStats();
    renderReviewList();
  }

  function renderReviewStats() {
    var log = studySession.answeredLog;
    var autoTotal = 0,
      autoCorrect = 0,
      selfTotal = 0,
      selfCorrect = 0,
      multiTotal = 0,
      multiFullCorrect = 0,
      multiBlanksTotal = 0,
      multiBlanksCorrect = 0;
    log.forEach(function (entry) {
      if (entry.resultKind === "auto") {
        autoTotal++;
        if (entry.isCorrect) autoCorrect++;
      } else if (entry.resultKind === "self") {
        selfTotal++;
        if (entry.isCorrect) selfCorrect++;
      } else if (entry.resultKind === "partial") {
        multiTotal++;
        if (entry.correctCount === entry.total) multiFullCorrect++;
        multiBlanksTotal += entry.total;
        multiBlanksCorrect += entry.correctCount;
      }
    });
    var lines = ["今回は" + log.length + "問解きました"];
    if (autoTotal > 0) lines.push("自動採点: " + autoCorrect + "/" + autoTotal + "正解");
    if (selfTotal > 0) lines.push("自己採点(自己申告): " + selfCorrect + "/" + selfTotal);
    if (multiTotal > 0) {
      lines.push("multi_blank: " + multiFullCorrect + "/" + multiTotal + "問（空欄計" + multiBlanksCorrect + "/" + multiBlanksTotal + "）");
    }
    els.studyReviewStats.innerHTML = "";
    var headline = document.createElement("p");
    headline.className = "study-review-headline";
    headline.textContent = lines[0];
    els.studyReviewStats.appendChild(headline);
    var breakdown = document.createElement("div");
    breakdown.className = "study-review-breakdown";
    lines.slice(1).forEach(function (line) {
      var span = document.createElement("span");
      span.textContent = line;
      breakdown.appendChild(span);
    });
    els.studyReviewStats.appendChild(breakdown);
  }

  function renderReviewList() {
    els.studyReviewList.innerHTML = "";
    var log = studySession.answeredLog.filter(function (entry) {
      return studyReview.filter === "all" || isReviewEntryWrongish(entry);
    });
    if (log.length === 0) {
      var empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = studyReview.filter === "wrong" ? "誤答・要復習の問題はありません。" : "回答した問題がありません。";
      els.studyReviewList.appendChild(empty);
      return;
    }
    log.forEach(function (entry) {
      var row = document.createElement("div");
      row.className = "study-review-row";
      row.addEventListener("click", function () {
        renderReviewDetail(entry);
      });

      var mark = document.createElement("span");
      mark.className = "review-result-mark " + reviewResultMarkClass(entry);
      mark.textContent = reviewResultMarkText(entry);
      row.appendChild(mark);

      var badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = entry.ex.exerciseType;
      row.appendChild(badge);

      var preview = document.createElement("span");
      preview.className = "review-preview-text";
      preview.textContent = getReviewQuestionText(entry.ex).replace(/\n/g, " ");
      row.appendChild(preview);

      var actions = document.createElement("div");
      actions.className = "review-row-actions";
      actions.appendChild(createReviewCheckButton(entry, false));
      actions.appendChild(createReviewRetryButton(entry));
      row.appendChild(actions);

      els.studyReviewList.appendChild(row);
    });
  }

  // stopPropagationはprimary(false時)のみ必要(一覧行クリックで詳細を開いてしまうのを防ぐため)。
  // 詳細画面側(primary=true)は行クリックの外なので不要だが、渡しても害はない。
  function createReviewCheckButton(entry, primary) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = primary ? "action-btn" : "review-icon-btn";
    function refresh() {
      if (!entry.exerciseKey) {
        btn.disabled = true;
        btn.textContent = primary ? "チェック対象外" : "☆";
        return;
      }
      var rec = EVv2.getProgressRecord(entry.exerciseKey, entry.ex.exerciseType);
      btn.classList.toggle("checked", rec.checked);
      btn.textContent = primary ? (rec.checked ? "チェック解除" : "チェック登録") : rec.checked ? "★" : "☆";
    }
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!entry.exerciseKey) return;
      // v2-12: 既存のtoggleChecked(progressStore.js)をそのまま使う。新しい保存方式は作らない。
      EVv2.toggleChecked(entry.exerciseKey, entry.ex.exerciseType);
      refresh();
    });
    refresh();
    return btn;
  }

  function createReviewRetryButton(entry) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "review-icon-btn";
    btn.textContent = "↻";
    btn.title = "この問題をもう一度解く";
    btn.setAttribute("aria-label", "この問題をもう一度解く");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      startRetry(entry, { view: "list" });
    });
    return btn;
  }

  function renderReviewDetail(entry) {
    studyReview.detailEntry = entry;
    els.studyReviewListView.hidden = true;
    els.studyReviewDetailView.hidden = false;

    var desc = describeAnswerForReview(entry.ex);
    els.studyReviewDetailBody.innerHTML = "";

    var badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = entry.ex.exerciseType;
    els.studyReviewDetailBody.appendChild(badge);

    var qText = document.createElement("p");
    qText.className = "question-text review-detail-question";
    EVv2.appendTextWithHeadingMarkers(qText, getReviewQuestionText(entry.ex));
    els.studyReviewDetailBody.appendChild(qText);

    function addRow(label, value) {
      var row = document.createElement("div");
      row.className = "review-detail-row";
      var l = document.createElement("span");
      l.className = "review-detail-label";
      l.textContent = label;
      var v = document.createElement("span");
      v.className = "review-detail-value";
      v.textContent = value;
      row.appendChild(l);
      row.appendChild(v);
      els.studyReviewDetailBody.appendChild(row);
    }
    addRow("あなたの解答", entry.yourAnswerText || "(自己採点)");
    addRow("解答", desc.answer);
    addRow("解説", desc.explanation || "（教材原文に解説なし）");

    var resultLine = document.createElement("p");
    var wrongish = isReviewEntryWrongish(entry);
    resultLine.className = "review-detail-result " + (wrongish ? "review-detail-result-wrong" : "review-detail-result-correct");
    resultLine.textContent =
      entry.resultKind === "partial"
        ? entry.correctCount + " / " + entry.total + " 正解"
        : entry.resultKind === "self"
          ? "自己採点: " + (entry.isCorrect ? "正解" : "不正解")
          : entry.isCorrect
            ? "正解"
            : "不正解";
    els.studyReviewDetailBody.appendChild(resultLine);

    var actions = document.createElement("div");
    actions.className = "review-detail-actions";
    actions.appendChild(createReviewCheckButton(entry, true));
    var retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "action-btn action-btn-primary";
    retryBtn.textContent = "もう一度解く";
    retryBtn.addEventListener("click", function () {
      startRetry(entry, { view: "detail", entry: entry });
    });
    actions.appendChild(retryBtn);
    els.studyReviewDetailBody.appendChild(actions);
  }

  // 「この問題をもう一度解く」。通常のstudySession.queue/indexには触れず、単発の出題だけを
  // #study-session画面で行い、回答完了後は振り返り画面（呼び出し元の一覧/詳細）へ戻る。
  function startRetry(entry, returnTo) {
    studyReview.retryReturnTo = returnTo;
    els.studyReview.hidden = true;
    els.studySession.hidden = false;
    els.header.classList.add("theme-switch-hidden");
    syncHeaderHeightVar();
    els.studySessionProgress.textContent = "この問題をもう一度解く";
    els.studySessionCardContainer.innerHTML = "";
    try {
      var card = EVv2.createExerciseCard(entry.ex, state.context, function () {
        var back = studyReview.retryReturnTo;
        studyReview.retryReturnTo = null;
        showStudyReview();
        if (back && back.view === "detail") {
          // answeredLogは更新済み（onExerciseAnsweredが同じキーのレコードを差し替える）ため、
          // 最新のentryを取り直してから詳細を開き直す。
          var logKey = back.entry.exerciseKey || back.entry.ex.exerciseId;
          var latest = studySession.answeredLog.filter(function (e2) {
            return (e2.exerciseKey || e2.ex.exerciseId) === logKey;
          })[0];
          renderReviewDetail(latest || back.entry);
        }
      });
      els.studySessionCardContainer.appendChild(card);
    } catch (e) {
      console.error("カード描画失敗", entry.ex.exerciseId, e);
    }
  }

  els.studyReviewFilterAllBtn.addEventListener("click", function () {
    studyReview.filter = "all";
    els.studyReviewFilterAllBtn.classList.add("active");
    els.studyReviewFilterWrongBtn.classList.remove("active");
    renderReviewList();
  });
  els.studyReviewFilterWrongBtn.addEventListener("click", function () {
    studyReview.filter = "wrong";
    els.studyReviewFilterWrongBtn.classList.add("active");
    els.studyReviewFilterAllBtn.classList.remove("active");
    renderReviewList();
  });
  els.studyReviewBackBtn.addEventListener("click", function () {
    showStudySetup();
  });
  els.studyReviewDetailBackBtn.addEventListener("click", function () {
    els.studyReviewDetailView.hidden = true;
    els.studyReviewListView.hidden = false;
    renderReviewList();
  });

  // v2-14: 開始ドックのボタンは画面下部に常時固定されているため、
  // スクロール位置に関わらずいつでも同じ動作で学習を開始できる。
  function startStudyFromSetup() {
    if (!state.data) return;
    var queue = buildStudyQueue();
    if (queue.length === 0) return; // ボタンは既に無効化されているはずのフェイルセーフ
    studySession.queue = queue;
    studySession.index = 0;
    studySession.answeredLog = [];
    showStudySession();
    renderStudySessionCard();
  }
  els.startStudyBtn.addEventListener("click", startStudyFromSetup);

  // v2-14: 教材ピッカーの開閉。実際の並び替え・選択ロジックはchipGroupが担う。
  els.studySetupPickerToggle.addEventListener("click", function () {
    var willOpen = els.studySetupPickerPanel.hidden;
    els.studySetupPickerPanel.hidden = !willOpen;
    els.studySetupPickerToggle.setAttribute("aria-expanded", String(willOpen));
  });

  // v2-13: テーマ（システム／ライト／ダーク）切替。永続化・data-theme適用はthemeStore.jsが担う。
  function refreshThemeSwitchUI() {
    var pref = EVv2.getThemePreference();
    var buttons = els.themeSwitch.querySelectorAll("button");
    buttons.forEach(function (b) { b.classList.toggle("active", b.dataset.mode === pref); });
  }
  els.themeSwitch.querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function () {
      EVv2.setThemePreference(b.dataset.mode);
      refreshThemeSwitchUI();
    });
  });
  refreshThemeSwitchUI();

  // v2-12(振り返り機能)。render.js/registry.js側の4箇所（true_false/single_blank選択式、
  // 自己採点、multi_blank一括確定、ordering）から、回答が確定した瞬間に呼ばれる共通フック。
  // 同じexerciseKey（無い場合はexerciseId）の記録が既にあれば更新し、無ければ追加する
  // （「もう一度解く」で再回答した場合に一覧の結果を最新の状態へ差し替えるため）。
  // progressStore・localStorageには一切書き込まない（studySession.answeredLogはメモリ上のみ）。
  EVv2.onExerciseAnswered = function (entry) {
    var logKey = entry.exerciseKey || entry.ex.exerciseId;
    var existingIndex = -1;
    for (var i = 0; i < studySession.answeredLog.length; i++) {
      var k = studySession.answeredLog[i].exerciseKey || studySession.answeredLog[i].ex.exerciseId;
      if (k === logKey) {
        existingIndex = i;
        break;
      }
    }
    if (existingIndex >= 0) {
      studySession.answeredLog[existingIndex] = entry;
    } else {
      studySession.answeredLog.push(entry);
    }
  };

  // v2-9: 学習終了ボタンは即時終了せず、確認ダイアログを挟む（誤操作防止）。
  // 「はい」を選んだ場合のみ、既存の終了処理(showStudySetup)をそのまま呼ぶ。
  var endStudyConfirmTriggerEl = null;

  function openEndStudyConfirm() {
    endStudyConfirmTriggerEl = document.activeElement;
    els.endStudyConfirmBackdrop.hidden = false;
    els.endStudyConfirmYesBtn.focus();
    document.addEventListener("keydown", onEndStudyConfirmKeydown);
  }
  function closeEndStudyConfirm() {
    els.endStudyConfirmBackdrop.hidden = true;
    document.removeEventListener("keydown", onEndStudyConfirmKeydown);
    if (endStudyConfirmTriggerEl && typeof endStudyConfirmTriggerEl.focus === "function") {
      endStudyConfirmTriggerEl.focus();
    }
  }
  // Escで閉じる（「いいえ」相当）。Tabはダイアログ内の2ボタン間だけを循環させる簡易フォーカストラップ。
  function onEndStudyConfirmKeydown(e) {
    if (e.key === "Escape") {
      closeEndStudyConfirm();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      var focusables = [els.endStudyConfirmNoBtn, els.endStudyConfirmYesBtn];
      var idx = focusables.indexOf(document.activeElement);
      var nextIdx = e.shiftKey
        ? idx <= 0
          ? focusables.length - 1
          : idx - 1
        : idx === focusables.length - 1
        ? 0
        : idx + 1;
      focusables[nextIdx].focus();
    }
  }

  els.endStudyBtn.addEventListener("click", openEndStudyConfirm);
  els.endStudyConfirmNoBtn.addEventListener("click", closeEndStudyConfirm);
  els.endStudyConfirmYesBtn.addEventListener("click", function () {
    closeEndStudyConfirm();
    showStudySetup();
  });
  // ダイアログ外（背景）クリックで閉じる（「いいえ」相当）。
  els.endStudyConfirmBackdrop.addEventListener("click", function (e) {
    if (e.target === els.endStudyConfirmBackdrop) closeEndStudyConfirm();
  });

  els.openBrowseViewBtn.addEventListener("click", function () {
    showBrowseView();
  });

  // v2-27(編集モード): 汎用の確認ダイアログ。「はい/いいえ」の結果をPromise<boolean>で返す。
  // end-study-confirm（学習終了専用）とは別の#generic-confirmを使い回す。
  function confirmDialog(message) {
    els.genericConfirmTitle.textContent = message;
    els.genericConfirmBackdrop.hidden = false;
    return new Promise(function (resolve) {
      function cleanup(result) {
        els.genericConfirmBackdrop.hidden = true;
        els.genericConfirmYesBtn.removeEventListener("click", onYes);
        els.genericConfirmNoBtn.removeEventListener("click", onNo);
        resolve(result);
      }
      function onYes() {
        cleanup(true);
      }
      function onNo() {
        cleanup(false);
      }
      els.genericConfirmYesBtn.addEventListener("click", onYes);
      els.genericConfirmNoBtn.addEventListener("click", onNo);
    });
  }
  EVv2.confirmDialog = confirmDialog;

  // v2-27(編集モード): 学習セッション画面のヘッダーにある≡ボタン。
  // 現状「問題を編集」以外のメニュー項目が未実装で、ボトムシートを経由すると
  // 実質1択のワンクッションになってしまうため、当面は編集画面へ直接遷移させる
  // （ユーザー指示、2026-08-01）。EVv2.editMenuItems・EVv2.openEditMenu自体は
  // 将来項目が増えた時点で使えるよう残してある（editMenu.js）。
  els.editMenuBtn.addEventListener("click", function () {
    var ex = studySession.queue[studySession.index];
    if (!ex) return;
    EVv2.openEditScreen(ex);
  });

  // v2-27(編集モード): 編集済みデータ（appEdit付き）をJSONとしてダウンロードする。
  // リポジトリのマスターデータ（html-v2/data/exercise_view_full.json）更新に使う想定
  // （インポートは既存のev-file-input／initial-file-inputでそのまま読み込める）。
  els.exportEditedDataBtn.addEventListener("click", function () {
    if (!state.data) return;
    var jsonText = JSON.stringify(state.data, null, 2);
    var blob = new Blob([jsonText], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = "exercise_view_full.edited-" + ts + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
    EVv2.dataRepository.load().then(function (cached) {
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
