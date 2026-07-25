// GitHub Pages公開フェーズ（docs/exercise_view_full_output_separation_report.mdの続き、
// 財表ドリルの本番公開に向けた対応）。
//
// 教材データ（output/exercise_view_full.json由来、有償ライセンス教材の問題文・解答・解説を含む）は
// これまでどおりGit管理外・公開サイトへは含めない方針を維持する（.gitignoreの /html-v2/data/ 除外は
// 変更していない）。そのため公開URL上では ./data/exercise_view_full.json は常に404になる。
//
// 「URLを開くだけで学習開始できる」体験を、教材データを一切公開せずに実現するため、
// 一度（fetch成功時、または利用者によるファイル選択時）読み込んだ内容をIndexedDBへ端末内保存し、
// 次回以降はそのキャッシュから復元する。学習履歴（progressStore.js、localStorage）とは別の
// 保存領域・別のキーであり、互いに参照しない。
//
// IndexedDBを選んだ理由: 対象JSONが数MB規模（2026-07-25時点で約4MB）であり、
// localStorageの実効上限（ブラウザにより5MB前後、特にモバイルSafariで厳しい）を圧迫しうるため。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

EVv2.DATA_CACHE_DB_NAME = "zaihyo-drill-v2-data-cache";
EVv2.DATA_CACHE_DB_VERSION = 1;
EVv2.DATA_CACHE_STORE_NAME = "exerciseViewCache";
EVv2.DATA_CACHE_RECORD_KEY = "current";

function openDb() {
  return new Promise(function (resolve, reject) {
    if (!window.indexedDB) {
      reject(new Error("IndexedDBが利用できない環境です"));
      return;
    }
    var req = window.indexedDB.open(EVv2.DATA_CACHE_DB_NAME, EVv2.DATA_CACHE_DB_VERSION);
    req.onupgradeneeded = function () {
      var db = req.result;
      if (!db.objectStoreNames.contains(EVv2.DATA_CACHE_STORE_NAME)) {
        db.createObjectStore(EVv2.DATA_CACHE_STORE_NAME);
      }
    };
    req.onsuccess = function () {
      resolve(req.result);
    };
    req.onerror = function () {
      reject(req.error || new Error("IndexedDBのオープンに失敗しました"));
    };
  });
}

// 利用可否を一度だけ判定してキャッシュする（progressStore.jsのlocalStorage可否判定と同じ発想）。
// 実際に開いてみて初めて分かる失敗（プライベートモード等の実装依存の制限）もあるため、
// 呼び出し側は個々のsave/load呼び出しの失敗も別途ハンドリングする。
var availabilityPromise = null;
EVv2.isDataCacheAvailable = function () {
  if (availabilityPromise) return availabilityPromise;
  availabilityPromise = openDb()
    .then(function (db) {
      db.close();
      return true;
    })
    .catch(function () {
      return false;
    });
  return availabilityPromise;
};

// jsonText（Exercise View全体のJSON文字列、未パース）をそのまま保存する。
// meta: { savedAt, sourceLabel, schemaVersion, exerciseCount, withheldCount } を添える
// （キャッシュ状態をUIへ表示するための付随情報。EVv2.parseExerciseViewの結果から呼び出し側が作る）。
EVv2.saveDataCache = function (jsonText, meta) {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(EVv2.DATA_CACHE_STORE_NAME, "readwrite");
      tx.objectStore(EVv2.DATA_CACHE_STORE_NAME).put({ jsonText: jsonText, meta: meta }, EVv2.DATA_CACHE_RECORD_KEY);
      tx.oncomplete = function () {
        db.close();
        resolve();
      };
      tx.onerror = function () {
        db.close();
        reject(tx.error || new Error("キャッシュの保存に失敗しました"));
      };
    });
  });
};

// 戻り値: Promise<{ jsonText, meta } | null>（未保存・取得失敗時はnull。例外は投げない。
// 呼び出し側はnullを「キャッシュなし」として扱い、初回セットアップ導線を表示する）。
EVv2.loadDataCache = function () {
  return openDb()
    .then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(EVv2.DATA_CACHE_STORE_NAME, "readonly");
        var req = tx.objectStore(EVv2.DATA_CACHE_STORE_NAME).get(EVv2.DATA_CACHE_RECORD_KEY);
        req.onsuccess = function () {
          db.close();
          resolve(req.result || null);
        };
        req.onerror = function () {
          db.close();
          reject(req.error || new Error("キャッシュの読み込みに失敗しました"));
        };
      });
    })
    .catch(function (e) {
      console.warn("[EVv2 dataCache] キャッシュの読み込みに失敗しました。キャッシュ無しとして扱います。", e);
      return null;
    });
};

// 学習履歴リセット（既存のEVv2.resetAllProgress）とは独立。データの再取得をやり直したい場合の
// トラブルシューティング用（現時点ではUIから直接は呼ばない。将来の「キャッシュをクリア」導線用に用意）。
EVv2.clearDataCache = function () {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(EVv2.DATA_CACHE_STORE_NAME, "readwrite");
      tx.objectStore(EVv2.DATA_CACHE_STORE_NAME).delete(EVv2.DATA_CACHE_RECORD_KEY);
      tx.oncomplete = function () {
        db.close();
        resolve();
      };
      tx.onerror = function () {
        db.close();
        reject(tx.error || new Error("キャッシュの削除に失敗しました"));
      };
    });
  });
};
