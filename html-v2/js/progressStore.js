// v2-3(docs/v2_3_implementation_report.md)。学習履歴（正誤回数・チェック状態等）の
// localStorage永続化。BSM・Exercise View生成側・正式CSV・CSV Bridge・KM Adapter・
// review override・現行HTMLはいずれも参照・変更しない（html-v2完結）。
//
// 保存先は固定キー1つ(STORAGE_KEY)。個々のExerciseのキーはprogressKey.jsのbuildProgressKey
// ([id, exerciseType]のJSON配列化)を再利用する。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

EVv2.STORAGE_KEY = "zaihyo-drill-v2-progress";
EVv2.STORAGE_SCHEMA_VERSION = "zaihyo-drill-v2-progress-v1";
EVv2.MASTERED_STREAK_THRESHOLD = 2;

EVv2.PROGRESS_STATUS = {
  UNANSWERED: "unanswered",
  UNMASTERED: "unmastered",
  MASTERED: "mastered",
};

function defaultRecord(exerciseKey, exerciseType) {
  return {
    exerciseKey: exerciseKey,
    exerciseType: exerciseType,
    status: EVv2.PROGRESS_STATUS.UNANSWERED,
    checked: false,
    correctCount: 0,
    incorrectCount: 0,
    correctStreak: 0,
    lastResult: null,
    lastAnsweredAt: null,
  };
}

function cloneRecord(rec) {
  return {
    exerciseKey: rec.exerciseKey,
    exerciseType: rec.exerciseType,
    status: rec.status,
    checked: rec.checked,
    correctCount: rec.correctCount,
    incorrectCount: rec.incorrectCount,
    correctStreak: rec.correctStreak,
    lastResult: rec.lastResult,
    lastAnsweredAt: rec.lastAnsweredAt,
  };
}

// ---- localStorage availability(一度だけ判定してキャッシュする) ----
// 一部のブラウザ環境(プライベートモード等)ではwindow.localStorageの参照自体、または
// setItem呼び出し自体が例外を投げることがあるため、実際に試し書き/削除して判定する。
var storageAvailable = (function () {
  try {
    var testKey = "__zaihyo_v2_storage_probe__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    console.warn(
      "[EVv2 progressStore] localStorageが利用できないため、学習履歴はこのセッション内のみ保持されます。",
      e
    );
    return false;
  }
})();
EVv2.isProgressStorageAvailable = function () {
  return storageAvailable;
};

function isValidStatus(s) {
  return (
    s === EVv2.PROGRESS_STATUS.UNANSWERED ||
    s === EVv2.PROGRESS_STATUS.UNMASTERED ||
    s === EVv2.PROGRESS_STATUS.MASTERED
  );
}

// 保存データから読み込んだ1レコードを検証し、正規化する。不正な形の場合はnullを返す
// （呼び出し側はnullのレコードを個別に無視し、他のレコードの読み込みは継続する）。
// 欠落しているオプションフィールドはdefaultRecordの初期値で補完する。
function sanitizeRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.exerciseKey !== "string" || !raw.exerciseKey) return null;
  if (typeof raw.exerciseType !== "string" || !raw.exerciseType) return null;
  var rec = defaultRecord(raw.exerciseKey, raw.exerciseType);
  if (isValidStatus(raw.status)) rec.status = raw.status;
  if (typeof raw.checked === "boolean") rec.checked = raw.checked;
  if (typeof raw.correctCount === "number" && raw.correctCount >= 0) rec.correctCount = raw.correctCount;
  if (typeof raw.incorrectCount === "number" && raw.incorrectCount >= 0) rec.incorrectCount = raw.incorrectCount;
  if (typeof raw.correctStreak === "number" && raw.correctStreak >= 0) rec.correctStreak = raw.correctStreak;
  if (raw.lastResult === "correct" || raw.lastResult === "incorrect" || raw.lastResult === null) {
    rec.lastResult = raw.lastResult;
  }
  if (typeof raw.lastAnsweredAt === "string" || raw.lastAnsweredAt === null) {
    rec.lastAnsweredAt = raw.lastAnsweredAt;
  }
  return rec;
}

// exerciseKey -> record のプレーンオブジェクト。初回アクセス時に一度だけ読み込む(遅延初期化)。
var progressMap = null;

function loadProgressStoreInternal() {
  var map = {};
  if (!storageAvailable) return map;

  var raw;
  try {
    raw = window.localStorage.getItem(EVv2.STORAGE_KEY);
  } catch (e) {
    console.warn("[EVv2 progressStore] localStorageの読み込みに失敗しました。学習履歴は空の状態から開始します。", e);
    return map;
  }
  if (!raw) return map;

  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn("[EVv2 progressStore] 保存データのJSON解析に失敗しました。学習履歴は空の状態から開始します。", e);
    return map;
  }

  if (!parsed || typeof parsed !== "object") {
    console.warn("[EVv2 progressStore] 保存データの形式が不正です。学習履歴は空の状態から開始します。");
    return map;
  }
  if (parsed.version !== EVv2.STORAGE_SCHEMA_VERSION) {
    console.warn(
      "[EVv2 progressStore] 保存データのversionが不明です（想定: " +
        EVv2.STORAGE_SCHEMA_VERSION +
        " / 実際: " +
        parsed.version +
        "）。安全側として読み込みをスキップします。"
    );
    return map;
  }

  var records = Array.isArray(parsed.records) ? parsed.records : [];
  var skippedCount = 0;
  records.forEach(function (rawRecord) {
    var rec = sanitizeRecord(rawRecord);
    if (!rec) {
      skippedCount += 1;
      return;
    }
    map[rec.exerciseKey] = rec;
  });
  if (skippedCount > 0) {
    console.warn("[EVv2 progressStore] 形式が不正なレコード" + skippedCount + "件を無視しました。");
  }
  return map;
}

function ensureLoaded() {
  if (progressMap === null) progressMap = loadProgressStoreInternal();
  return progressMap;
}

function persist() {
  if (!storageAvailable) return;
  var records = Object.keys(progressMap).map(function (k) {
    return progressMap[k];
  });
  var payload = { version: EVv2.STORAGE_SCHEMA_VERSION, records: records };
  try {
    window.localStorage.setItem(EVv2.STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("[EVv2 progressStore] localStorageへの保存に失敗しました（このセッション内の状態は保持されます）。", e);
  }
}

// true_false/single_blank: [stableItemIds[0], exerciseType]
// multi_blank: [exerciseId, exerciseType]（v2-3では問題全体単位。unit単位の永続履歴はスコープ外）
EVv2.computeExerciseKey = function (ex) {
  if (ex.exerciseType === "multi_blank") {
    return EVv2.buildProgressKey(ex.exerciseId, ex.exerciseType);
  }
  var stableId = ex.stableItemIds && ex.stableItemIds[0];
  return EVv2.buildProgressKey(stableId, ex.exerciseType);
};

// 既存レコードを返す。無ければ(まだ一度も回答/チェックされていない)デフォルト値のレコードを
// その場で作るだけで、保存はしない(実際に回答/チェックが起きて初めて永続化する)。
EVv2.getProgressRecord = function (exerciseKey, exerciseType) {
  var map = ensureLoaded();
  return map[exerciseKey] ? cloneRecord(map[exerciseKey]) : defaultRecord(exerciseKey, exerciseType);
};

EVv2.getAllProgressRecords = function () {
  var map = ensureLoaded();
  return Object.keys(map).map(function (k) {
    return map[k];
  });
};

// 正誤を1件記録する。correctStreakがMASTERED_STREAK_THRESHOLD以上でmastered、
// そうでなければ(1件以上回答済みのため)unmasteredとする。
EVv2.recordAnswer = function (exerciseKey, exerciseType, isCorrect) {
  if (!exerciseKey) return null;
  var map = ensureLoaded();
  var rec = map[exerciseKey] ? cloneRecord(map[exerciseKey]) : defaultRecord(exerciseKey, exerciseType);
  if (isCorrect) {
    rec.correctCount += 1;
    rec.correctStreak += 1;
    rec.lastResult = "correct";
  } else {
    rec.incorrectCount += 1;
    rec.correctStreak = 0;
    rec.lastResult = "incorrect";
  }
  rec.lastAnsweredAt = new Date().toISOString();
  rec.status =
    rec.correctStreak >= EVv2.MASTERED_STREAK_THRESHOLD
      ? EVv2.PROGRESS_STATUS.MASTERED
      : EVv2.PROGRESS_STATUS.UNMASTERED;
  map[exerciseKey] = rec;
  persist();
  return cloneRecord(rec);
};

EVv2.toggleChecked = function (exerciseKey, exerciseType) {
  if (!exerciseKey) return null;
  var map = ensureLoaded();
  var rec = map[exerciseKey] ? cloneRecord(map[exerciseKey]) : defaultRecord(exerciseKey, exerciseType);
  rec.checked = !rec.checked;
  map[exerciseKey] = rec;
  persist();
  return cloneRecord(rec);
};

// 学習履歴を他端末へ持ち出すためのエクスポート。保存形式(persist()と同じ{version, records})を
// そのまま整形JSON化するだけ（問題データのExercise View JSONとは別の、完全に独立したファイル）。
EVv2.exportProgressData = function () {
  var map = ensureLoaded();
  var records = Object.keys(map).map(function (k) {
    return map[k];
  });
  return JSON.stringify({ version: EVv2.STORAGE_SCHEMA_VERSION, records: records }, null, 2);
};

// 他端末からエクスポートされた学習履歴を読み込み、この端末の学習履歴を丸ごと置き換える
// （マージはしない。問題データのJSONインポートと同じ「置き換え」方式に揃える）。
// 個々のレコードの検証はloadProgressStoreInternalと同じsanitizeRecordを再利用する
// （不正なレコードは個別に無視して続行、致命的な形式不正のみ失敗として返す）。
// 呼び出し側で置き換えの確認ダイアログを出すこと（ここでは確認しない）。
EVv2.importProgressData = function (jsonText) {
  var parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return { ok: false, error: "JSONとして読み込めませんでした。" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "データの形式が不正です。" };
  }
  if (parsed.version !== EVv2.STORAGE_SCHEMA_VERSION) {
    return { ok: false, error: "対応していない形式です（version: " + parsed.version + "）。" };
  }
  var records = Array.isArray(parsed.records) ? parsed.records : [];
  var map = {};
  var skippedCount = 0;
  records.forEach(function (rawRecord) {
    var rec = sanitizeRecord(rawRecord);
    if (!rec) {
      skippedCount += 1;
      return;
    }
    map[rec.exerciseKey] = rec;
  });
  progressMap = map;
  persist();
  return { ok: true, importedCount: Object.keys(map).length, skippedCount: skippedCount };
};

// 学習履歴を全件削除する(呼び出し側で確認ダイアログを出すこと。ここでは確認しない)。
EVv2.resetAllProgress = function () {
  progressMap = {};
  if (!storageAvailable) return;
  try {
    window.localStorage.removeItem(EVv2.STORAGE_KEY);
  } catch (e) {
    console.warn("[EVv2 progressStore] リセット時のlocalStorage削除に失敗しました。", e);
  }
};
