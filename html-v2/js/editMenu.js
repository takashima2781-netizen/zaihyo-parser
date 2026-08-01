// 編集モードの入口となる、問題ごとの≡メニュー（ボトムシート）。
// 項目は宣言的な配列(EVv2.editMenuItems)で定義し、この配列に1件足すだけで
// 将来の項目（複製・移動・削除・タグ編集等）を追加できる構成にする。
// このファイル自体は「配列からシートを組み立てる・開閉する・選択をhandlerへ渡す」だけを担当し、
// 各機能の実体（編集画面を開く等）は持たない。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

// handlerはEVv2.openEditScreen等、他ファイル(editForm.js)で定義される関数を呼ぶが、
// スクリプト読み込み順の都合で参照時点ではまだ存在しないため、呼び出し時に遅延解決する
// （直接 EVv2.openEditScreen を代入せず、ラップ関数にする）。
EVv2.editMenuItems = [
  { id: "edit-problem", label: "問題を編集", enabled: true, handler: function (ex) { EVv2.openEditScreen(ex); } },
  { id: "duplicate", label: "問題を複製", enabled: false },
  { id: "move", label: "問題を移動", enabled: false },
  { id: "delete", label: "問題を削除", enabled: false },
  { id: "tags", label: "タグ編集", enabled: false },
  { id: "difficulty", label: "難易度編集", enabled: false },
  { id: "scope", label: "出題範囲編集", enabled: false },
  { id: "check-setting", label: "チェック問題設定", enabled: false },
  { id: "show-id", label: "問題ID表示", enabled: false },
  { id: "debug-info", label: "デバッグ情報", enabled: false },
];

(function () {
  "use strict";

  var backdrop = null;
  var list = null;
  var cancelBtn = null;
  var currentEx = null;

  function close() {
    if (backdrop) backdrop.hidden = true;
    currentEx = null;
  }

  function render() {
    list.innerHTML = "";
    EVv2.editMenuItems.forEach(function (item) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sheet-item" + (item.enabled ? "" : " sheet-item-disabled");
      btn.textContent = item.label;
      btn.disabled = !item.enabled;
      if (item.enabled) {
        btn.addEventListener("click", function () {
          var ex = currentEx;
          close();
          if (typeof item.handler === "function") item.handler(ex);
        });
      }
      list.appendChild(btn);
    });
  }

  function ensureEls() {
    if (backdrop) return;
    backdrop = document.getElementById("edit-menu-sheet");
    list = document.getElementById("edit-menu-list");
    cancelBtn = document.getElementById("edit-menu-cancel-btn");
    cancelBtn.addEventListener("click", close);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) close();
    });
  }

  EVv2.openEditMenu = function (ex) {
    ensureEls();
    currentEx = ex;
    render();
    backdrop.hidden = false;
  };
  EVv2.closeEditMenu = close;
})();
