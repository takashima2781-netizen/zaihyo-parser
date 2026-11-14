// v2-50(WISHLIST W-2): 1問ごとの制限時間。残り秒数を1秒単位で減らし、バーの幅も合わせて縮める。
// 時間の数え方・表示だけを持ち、時間切れ時に何をするか（不正解の記録など）は呼び出し側(onExpire)が決める。
//
// opts: { rootEl, barEl, textEl, onExpire: function(), isPaused: function() -> bool }
// isPausedがtrueを返している間（メモ・編集画面を開いている、タブが裏にある等）は時間を進めない。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

(function () {
  "use strict";

  EVv2.TIME_LIMIT_ITEMS = [
    { value: "10", label: "10秒" },
    { value: "30", label: "30秒" },
    { value: "60", label: "1分" },
    { value: "300", label: "5分" },
    { value: "0", label: "なし" },
  ];

  function formatSeconds(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  EVv2.createQuestionTimer = function (opts) {
    var totalMs = 0;
    var remainingMs = 0;
    var lastTick = 0;
    var intervalId = null;
    var shownSec = -1;

    function render() {
      var sec = Math.max(0, Math.ceil(remainingMs / 1000));
      if (sec === shownSec) return;
      shownSec = sec;
      opts.textEl.textContent = formatSeconds(sec);
      var ratio = totalMs > 0 ? (sec * 1000) / totalMs : 0;
      opts.barEl.style.width = Math.min(100, ratio * 100) + "%";
      opts.rootEl.classList.toggle("is-low", sec <= Math.max(3, Math.ceil(totalMs / 1000 / 5)));
    }

    function tick() {
      var now = Date.now();
      var elapsed = now - lastTick;
      lastTick = now;
      if (opts.isPaused && opts.isPaused()) return;
      remainingMs -= elapsed;
      render();
      if (remainingMs <= 0) {
        stop();
        opts.rootEl.classList.add("is-expired");
        if (opts.onExpire) opts.onExpire();
      }
    }

    // 時間の計測を止める（表示はそのまま残す）。
    function stop() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      opts.rootEl.classList.add("is-stopped");
    }

    // seconds<=0なら制限なし（タイマーを隠す）。
    function start(seconds) {
      stop();
      opts.rootEl.classList.remove("is-stopped", "is-expired", "is-low");
      if (!(seconds > 0)) {
        opts.rootEl.hidden = true;
        return;
      }
      opts.rootEl.hidden = false;
      totalMs = seconds * 1000;
      remainingMs = totalMs;
      shownSec = -1;
      // 最初の描画ではバーの縮むアニメーションを効かせない（前の問題の幅から戻るのを見せない）。
      opts.barEl.style.transition = "none";
      render();
      void opts.barEl.offsetWidth;
      opts.barEl.style.transition = "";
      lastTick = Date.now();
      intervalId = setInterval(tick, 200);
    }

    function hide() {
      stop();
      opts.rootEl.hidden = true;
    }

    return {
      start: start,
      stop: stop,
      hide: hide,
      isRunning: function () {
        return intervalId !== null;
      },
    };
  };
})();
