// v2-49(問題メモ、WISHLIST W-1): 問題ごとに1件だけ持てる自由記述メモのlocalStorage永続化。
// 学習履歴(progressStore.js)とは保存キー・保存形式・エクスポートファイルをすべて分ける
// （学習履歴の既存ファイル形式・バージョンを変えずに済み、片方だけの受け渡しもできるため）。
//
// 問題の識別には学習履歴と同じキー（EVv2.computeExerciseKey、[stableItemId|exerciseId, exerciseType]）
// を使う。問題データを編集・再読込してもキーが変わらない限りメモは同じ問題に紐づき続ける。
// 該当する問題が見つからなくなったメモも削除せず保持する（一覧側で「問題が見つからないメモ」として出す）。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

// v2-54: 保存先は科目ごと（js/subject.js）。財表は従来の "zaihyo-drill-v2-memos" のまま。
EVv2.MEMO_STORAGE_KEY = EVv2.SUBJECT.storage.memos;
EVv2.MEMO_SCHEMA_VERSION = "zaihyo-drill-v2-memos-v1";

(function () {
  "use strict";

  // exerciseKey -> { exerciseKey, exerciseType, text, updatedAt }。初回アクセス時に読み込む。
  var memoMap = null;

  function storageAvailable() {
    return typeof EVv2.isProgressStorageAvailable === "function" ? EVv2.isProgressStorageAvailable() : true;
  }

  function sanitize(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.exerciseKey !== "string" || !raw.exerciseKey) return null;
    if (typeof raw.text !== "string" || raw.text.trim() === "") return null;
    return {
      exerciseKey: raw.exerciseKey,
      exerciseType: typeof raw.exerciseType === "string" ? raw.exerciseType : null,
      text: raw.text,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    };
  }

  // {version, memos:[...]} を検証してmapにする。致命的な形式不正はerrorを返す。
  function parsePayload(jsonText) {
    var parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      return { error: "JSONとして読み込めませんでした。" };
    }
    if (!parsed || typeof parsed !== "object") return { error: "データの形式が不正です。" };
    if (parsed.version !== EVv2.MEMO_SCHEMA_VERSION) {
      return { error: "対応していない形式です（version: " + parsed.version + "）。" };
    }
    var map = {};
    var skipped = 0;
    (Array.isArray(parsed.memos) ? parsed.memos : []).forEach(function (raw) {
      var m = sanitize(raw);
      if (!m) {
        skipped += 1;
        return;
      }
      map[m.exerciseKey] = m;
    });
    return { map: map, skipped: skipped };
  }

  function ensureLoaded() {
    if (memoMap !== null) return memoMap;
    memoMap = {};
    if (!storageAvailable()) return memoMap;
    var raw = null;
    try {
      raw = window.localStorage.getItem(EVv2.MEMO_STORAGE_KEY);
    } catch (e) {
      console.warn("[EVv2 memoStore] localStorageの読み込みに失敗しました。", e);
    }
    if (!raw) return memoMap;
    var result = parsePayload(raw);
    if (result.error) {
      console.warn("[EVv2 memoStore] 保存済みメモを読み込めませんでした: " + result.error);
      return memoMap;
    }
    memoMap = result.map;
    return memoMap;
  }

  function serialize(pretty) {
    var map = ensureLoaded();
    var memos = Object.keys(map).map(function (k) {
      return map[k];
    });
    return JSON.stringify({ version: EVv2.MEMO_SCHEMA_VERSION, subject: EVv2.SUBJECT.id, memos: memos }, null, pretty ? 2 : 0);
  }

  function persist() {
    if (!storageAvailable()) return;
    try {
      window.localStorage.setItem(EVv2.MEMO_STORAGE_KEY, serialize(false));
    } catch (e) {
      console.warn("[EVv2 memoStore] localStorageへの保存に失敗しました（このセッション内の状態は保持されます）。", e);
    }
  }

  EVv2.getMemo = function (exerciseKey) {
    if (!exerciseKey) return null;
    var m = ensureLoaded()[exerciseKey];
    return m ? { exerciseKey: m.exerciseKey, exerciseType: m.exerciseType, text: m.text, updatedAt: m.updatedAt } : null;
  };

  // 空文字（空白のみ）で保存した場合はメモを削除する。
  EVv2.saveMemo = function (exerciseKey, exerciseType, text) {
    if (!exerciseKey) return null;
    var map = ensureLoaded();
    if (typeof text !== "string" || text.trim() === "") {
      delete map[exerciseKey];
      persist();
      return null;
    }
    map[exerciseKey] = {
      exerciseKey: exerciseKey,
      exerciseType: exerciseType || null,
      text: text,
      updatedAt: new Date().toISOString(),
    };
    persist();
    return EVv2.getMemo(exerciseKey);
  };

  EVv2.deleteMemo = function (exerciseKey) {
    var map = ensureLoaded();
    if (!map[exerciseKey]) return;
    delete map[exerciseKey];
    persist();
  };

  EVv2.getAllMemos = function () {
    var map = ensureLoaded();
    return Object.keys(map).map(function (k) {
      return EVv2.getMemo(k);
    });
  };

  EVv2.exportMemoData = function () {
    return serialize(true);
  };

  // 学習履歴のインポートと同じく「置き換え」方式。確認ダイアログは呼び出し側で出す。
  EVv2.importMemoData = function (jsonText) {
    var label;
    try {
      label = JSON.parse(jsonText).subject;
    } catch (e) {
      label = undefined; // JSONとして不正な場合はparsePayloadがエラーを返す
    }
    var result = parsePayload(jsonText);
    if (result.error) return { ok: false, error: result.error };
    var subjectError = EVv2.checkSubjectLabel(label, "このメモファイル");
    if (subjectError) return { ok: false, error: subjectError };
    if (result.error) return { ok: false, error: result.error };
    memoMap = result.map;
    persist();
    return { ok: true, importedCount: Object.keys(memoMap).length, skippedCount: result.skipped };
  };
})();
