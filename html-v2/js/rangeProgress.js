// v2-50(WISHLIST W-2): 「範囲を選ぶ」画面のための、出題範囲ツリーと進捗集計。
// 学習履歴(progressStore.js)は読むだけで、保存形式・判定ロジックは変更しない。
//
// 進捗の4区分（ユーザー指示: 未回答／やったが不正解／1回正解／習得）は、既存の記録から次のように導く:
//   new      … 記録なし、または status が unanswered
//   mastered … status が mastered（現在は MASTERED_STREAK_THRESHOLD 回連続正解）
//   once     … 習得前で、直近の連続正解が1回以上
//   wrong    … 回答したことがあり、直近が不正解（連続正解0）
// 学習履歴のキーが作れない問題（stableItemId欠落等）は記録できないため new として数える（推測しない）。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

(function () {
  "use strict";

  EVv2.PROGRESS_CATEGORIES = ["mastered", "once", "wrong", "new"];
  EVv2.PROGRESS_CATEGORY_LABELS = { mastered: "習得", once: "1回正解", wrong: "不正解", new: "未回答" };

  EVv2.progressCategoryOf = function (ex) {
    var key = EVv2.computeExerciseKey(ex);
    if (!key) return "new";
    var rec = EVv2.getProgressRecord(key, ex.exerciseType);
    if (!rec || rec.status === EVv2.PROGRESS_STATUS.UNANSWERED) return "new";
    if (rec.status === EVv2.PROGRESS_STATUS.MASTERED) return "mastered";
    return rec.correctStreak >= 1 ? "once" : "wrong";
  };

  EVv2.summarizeProgress = function (exercises) {
    var sum = { total: exercises.length, mastered: 0, once: 0, wrong: 0, new: 0 };
    exercises.forEach(function (ex) {
      sum[EVv2.progressCategoryOf(ex)] += 1;
    });
    return sum;
  };

  // 範囲の木: [{ kind:"theme", id, title, exercises, sections:[{ kind:"section", id, title, exercises }] }]
  // 出現順（＝教材の順）を保つ。structureにtheme/sectionが無い問題は該当階層へ入れない
  // （「全範囲」にだけ含まれる）。
  EVv2.buildRangeTree = function (exercises) {
    var themes = [];
    var themeMap = {};
    exercises.forEach(function (ex) {
      var s = ex.structure;
      if (!s || !s.theme) return;
      var tId = s.theme.structureNodeId;
      var theme = themeMap[tId];
      if (!theme) {
        theme = { kind: "theme", id: tId, title: s.theme.titleRaw.text, exercises: [], sections: [], sectionMap: {} };
        themeMap[tId] = theme;
        themes.push(theme);
      }
      theme.exercises.push(ex);
      if (!s.section) return;
      var sId = s.section.structureNodeId;
      var section = theme.sectionMap[sId];
      if (!section) {
        section = { kind: "section", id: sId, title: s.section.titleRaw.text, exercises: [] };
        theme.sectionMap[sId] = section;
        theme.sections.push(section);
      }
      section.exercises.push(ex);
    });
    return themes;
  };

  // range: { kind:"all" } | { kind:"theme", id } | { kind:"section", id }
  EVv2.matchesRange = function (ex, range) {
    if (!range || range.kind === "all") return true;
    var s = ex.structure;
    if (!s) return false;
    if (range.kind === "theme") return !!s.theme && s.theme.structureNodeId === range.id;
    if (range.kind === "section") return !!s.section && s.section.structureNodeId === range.id;
    return false;
  };

  // 分数（習得/全体）と4色の横棒グラフ。
  EVv2.createProgressMeter = function (summary) {
    var wrap = document.createElement("div");
    wrap.className = "progress-meter";

    var bar = document.createElement("div");
    bar.className = "progress-meter-bar";
    var labels = [];
    EVv2.PROGRESS_CATEGORIES.forEach(function (cat) {
      var n = summary[cat];
      if (n > 0) labels.push(EVv2.PROGRESS_CATEGORY_LABELS[cat] + n);
      if (!n || !summary.total) return;
      var seg = document.createElement("span");
      seg.className = "pm-seg pm-" + cat;
      seg.style.width = (n / summary.total) * 100 + "%";
      bar.appendChild(seg);
    });
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", labels.join("、"));
    wrap.appendChild(bar);

    var frac = document.createElement("span");
    frac.className = "progress-meter-frac";
    var num = document.createElement("b");
    num.textContent = summary.mastered;
    frac.appendChild(num);
    frac.appendChild(document.createTextNode("／" + summary.total + "問"));
    wrap.appendChild(frac);
    return wrap;
  };
})();
