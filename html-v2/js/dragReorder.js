// v2-29: 外部ライブラリ無しのドラッグ&ドロップ並べ替え共通処理（Pointer Eventsのみ）。
// 編集画面（segment blocks・true_false中問・subQuestions・ordering項目）と学習画面
// （並べ替え問題の回答）の両方から使う。このモジュール自体はDOM操作と並べ替えの
// 「見た目」だけを担当し、実際にどの配列をどう書き換えるかは呼び出し側（onDrop）に委ねる
// （編集データと回答データを混同しないため。詳細は各呼び出し元のコメント参照）。
//
// 方式: ドラッグ中の要素はposition:fixedでdocument.bodyへ一時的に退避し、指を追従させる。
// 元の位置には「プレースホルダー」（空div）を置き、指の位置に応じてプレースホルダーだけを
// リスト内で動かす（実要素はドロップ確定まで動かさない）。これにより、要素を頻繁に
// 入れ替えても表示がジャンプしない。ドロップ時にプレースホルダーの位置へ実要素を戻し、
// onDrop(fromIndex, toIndex)を呼ぶ（実際に位置が変わった場合のみ）。pointercancel等では
// onCancel()のみ呼び、データには一切触れない（呼び出し側は何もしなくてよい。DOMは
// このモジュールが自分で元に戻す）。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

// 並べ替え結果の読み上げ用（aria-live）。ドラッグ・↑↓ボタン・キーボード操作、
// いずれで並べ替えた場合も呼び出し側がannounce()を呼べば同じ場所で読み上げられる。
EVv2.createAriaLiveRegion = function () {
  var el = document.createElement("div");
  el.className = "sr-only";
  el.setAttribute("aria-live", "polite");
  el.setAttribute("role", "status");
  return {
    el: el,
    announce: function (msg) {
      el.textContent = "";
      window.setTimeout(function () {
        el.textContent = msg;
      }, 30);
    },
  };
};

(function () {
  "use strict";

  var EDGE_THRESHOLD = 48;
  var SCROLL_SPEED = 14;

  function findScrollableAncestor(el) {
    var node = el.parentElement;
    while (node) {
      var style = window.getComputedStyle(node);
      if ((style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
        return node;
      }
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  // opts: {
  //   container: 直接の子要素がドラッグ対象になる親要素（自身は動かさない）,
  //   handleSelector: ドラッグ開始を許可する要素のCSSセレクタ（既定 ".drag-handle"）,
  //   disabled: function() -> boolean（trueの間はドラッグ開始しない）,
  //   scrollContainer: 自動スクロール対象（省略時はcontainerの最も近いスクロール祖先）,
  //   onDrop: function(fromIndex, toIndex)（実際に位置が変わった時のみ呼ばれる）,
  //   onCancel: function()（pointercancel等。呼び出し側は何もしなくてよい）,
  // }
  // 戻り値: { destroy() } （リスナーを外す。このコンテナ自体を使い回さなくなった場合のみ呼べば十分。
  //   editForm.js/registry.js側は通常、再描画のたびにコンテナごと作り直すため呼ばなくても
  //   リークしない）。
  EVv2.attachDragReorder = function (opts) {
    var container = opts.container;
    var handleSelector = opts.handleSelector || ".drag-handle";
    var isDisabled = opts.disabled || function () { return false; };
    var onDrop = opts.onDrop || function () {};
    var onCancel = opts.onCancel || function () {};

    var dragEl = null;
    var placeholder = null;
    var pointerId = null;
    var pointerOffsetY = 0;
    var fromIndex = -1;
    var scrollContainer = null;
    var autoScrollDir = 0;
    var rafId = null;

    function items() {
      return Array.prototype.slice.call(container.children);
    }
    function indexOf(el) {
      return items().indexOf(el);
    }
    function closestChild(el) {
      var node = el;
      while (node && node.parentElement !== container) node = node.parentElement;
      return node;
    }

    function repositionPlaceholder(dragMid) {
      var siblings = items(); // dragElはdocument.body配下に退避済みなのでcontainer.childrenには含まれない
      var moved = true;
      var guard = 0;
      while (moved && guard < siblings.length + 1) {
        moved = false;
        guard++;
        var idx = siblings.indexOf(placeholder);
        var prev = siblings[idx - 1];
        var next = siblings[idx + 1];
        if (prev) {
          var prevRect = prev.getBoundingClientRect();
          if (dragMid < prevRect.top + prevRect.height / 2) {
            container.insertBefore(placeholder, prev);
            siblings = items();
            moved = true;
            continue;
          }
        }
        if (next) {
          var nextRect = next.getBoundingClientRect();
          if (dragMid > nextRect.top + nextRect.height / 2) {
            container.insertBefore(placeholder, next.nextSibling);
            siblings = items();
            moved = true;
            continue;
          }
        }
      }
    }

    function autoScrollStep() {
      if (autoScrollDir === 0 || !dragEl) {
        rafId = null;
        return;
      }
      scrollContainer.scrollTop += autoScrollDir * SCROLL_SPEED;
      var top = parseFloat(dragEl.style.top) || 0;
      repositionPlaceholder(top + dragEl.offsetHeight / 2);
      rafId = requestAnimationFrame(autoScrollStep);
    }

    function handleAutoScroll(clientY) {
      if (!scrollContainer) return;
      var rect = scrollContainer.getBoundingClientRect();
      if (clientY < rect.top + EDGE_THRESHOLD) {
        autoScrollDir = -1;
      } else if (clientY > rect.bottom - EDGE_THRESHOLD) {
        autoScrollDir = 1;
      } else {
        autoScrollDir = 0;
      }
      if (autoScrollDir !== 0 && rafId === null) {
        rafId = requestAnimationFrame(autoScrollStep);
      }
    }

    function stopAutoScroll() {
      autoScrollDir = 0;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function onPointerMove(e) {
      if (e.pointerId !== pointerId || !dragEl) return;
      e.preventDefault();
      var top = e.clientY - pointerOffsetY;
      dragEl.style.top = top + "px";
      repositionPlaceholder(top + dragEl.offsetHeight / 2);
      handleAutoScroll(e.clientY);
    }

    function finishDrag(commit) {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      stopAutoScroll();

      if (!dragEl || !placeholder) return;

      var toIndex = indexOf(placeholder);
      container.insertBefore(dragEl, placeholder);
      container.removeChild(placeholder);

      dragEl.style.position = "";
      dragEl.style.left = "";
      dragEl.style.top = "";
      dragEl.style.width = "";
      dragEl.style.zIndex = "";
      dragEl.style.pointerEvents = "";
      dragEl.classList.remove("dragging");

      var movedFromIndex = fromIndex;
      dragEl = null;
      placeholder = null;
      pointerId = null;

      if (commit) {
        if (toIndex !== movedFromIndex) onDrop(movedFromIndex, toIndex);
      } else {
        onCancel();
      }
    }

    function onPointerUp(e) {
      if (e.pointerId !== pointerId) return;
      finishDrag(true);
    }
    function onPointerCancel(e) {
      if (e.pointerId !== pointerId) return;
      finishDrag(false);
    }

    function onPointerDown(e) {
      if (isDisabled()) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      var handle = e.target.closest ? e.target.closest(handleSelector) : null;
      if (!handle) return;
      var item = closestChild(handle);
      if (!item) return;
      e.preventDefault();

      dragEl = item;
      pointerId = e.pointerId;
      fromIndex = indexOf(dragEl);

      var rect = dragEl.getBoundingClientRect();
      pointerOffsetY = e.clientY - rect.top;

      placeholder = document.createElement("div");
      placeholder.className = "drag-placeholder";
      placeholder.style.height = rect.height + "px";
      container.insertBefore(placeholder, dragEl);

      dragEl.style.position = "fixed";
      dragEl.style.left = rect.left + "px";
      dragEl.style.top = rect.top + "px";
      dragEl.style.width = rect.width + "px";
      dragEl.style.zIndex = "500";
      dragEl.style.pointerEvents = "none";
      document.body.appendChild(dragEl);
      dragEl.classList.add("dragging");

      scrollContainer = opts.scrollContainer || findScrollableAncestor(container);

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
    }

    container.addEventListener("pointerdown", onPointerDown);

    return {
      destroy: function () {
        container.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
        stopAutoScroll();
      },
    };
  };
})();
