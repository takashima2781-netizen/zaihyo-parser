// テーマ（システム／ライト／ダーク）の永続化と適用。
// index.html <head>内の即時実行スクリプトが初回描画前にdata-theme属性を先に設定しており、
// このモジュールは以後の切替操作・システム設定変更の追従を担当する（役割を分離）。
(function () {
  "use strict";

  var STORAGE_KEY = "zaihyoDrill.themePreference"; // "system" | "light" | "dark"

  function getPreference() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "light" || v === "dark" || v === "system") return v;
    } catch (e) {
      // localStorage不可の環境ではシステム設定にフォールバックする。
    }
    return "system";
  }

  function apply(pref) {
    var root = document.documentElement;
    if (pref === "light" || pref === "dark") root.setAttribute("data-theme", pref);
    else root.removeAttribute("data-theme");
  }

  function setPreference(pref) {
    try {
      window.localStorage.setItem(STORAGE_KEY, pref);
    } catch (e) {
      // 保存できない場合も画面上の適用だけは行う（このセッション内のみ有効）。
    }
    apply(pref);
  }

  window.EVv2 = window.EVv2 || {};
  window.EVv2.THEME_STORAGE_KEY = STORAGE_KEY;
  window.EVv2.getThemePreference = getPreference;
  window.EVv2.setThemePreference = setPreference;
})();
