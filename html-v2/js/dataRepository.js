// 問題データ（Exercise View JSON全体）の永続化先を差し替え可能にする層。
// 現在の実装はdataCache.js（IndexedDB、端末内保存）へそのまま委譲するだけだが、
// 呼び出し側（app.js・editForm.js）は常にこのEVv2.dataRepositoryを経由することで、
// 将来サーバー保存やGitHub同期へ切り替える際にこのファイルの実装だけを差し替えれば済むようにする。
//
// save/loadのシグネチャはdataCache.jsのsaveDataCache/loadDataCacheに合わせる
// （jsonText: 未パースのJSON文字列、meta: 状態表示用の付随情報）。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

EVv2.dataRepository = {
  save: function (jsonText, meta) {
    return EVv2.saveDataCache(jsonText, meta);
  },
  load: function () {
    return EVv2.loadDataCache();
  },
};
