// v2-5(docs/v2_5_implementation_report.md)。診断UI（診断パネル・カード上の内部識別子表示等）を
// 通常利用時には非表示にし、URLパラメータ ?debug=1 のときのみ表示するための判定。
// 診断機能自体は削除しない（app.js/render.jsが参照するのみ）。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

EVv2.DEBUG_MODE = (function () {
  try {
    var params = new URLSearchParams(window.location.search);
    return params.get("debug") === "1";
  } catch (e) {
    return false;
  }
})();
