// v2-7(単一穴埋めの対象マーカー強調)。single_blankの対象空欄が本文中のどのマーカー
// (①②③...)に対応するかを、同じ本文を共有するmulti_blank兄弟のbodySegments
// (Phase 2Cで整備済み。大問本文中の各空欄の正確な位置・順序を保持するデータ)と
// 突き合わせて特定する。本文テキストへの正規表現探索・文字列一致による推測は行わない。
//
// blankUnitIdはBSM QuestionUnit由来のId(例: "qu-item-01")であり、教材全体で一意
// (実データで衝突0件を確認済み)。1つの大問に複数の空欄があり、かつmulti_blank側の
// bodySegmentsが生成されている場合のみ対象になる(実データでsingle_blank 851件中709件、
// 約83%が該当。残りは本文の空欄が1個以下でマーカー間の曖昧さ自体が無いケース)。
// 該当しないsingle_blankは呼び出し側(render.js)がプレーンテキスト表示にフォールバックする。
var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

EVv2.buildBlankMarkerIndex = function (exercises) {
  var map = {};
  exercises.forEach(function (ex) {
    if (ex.exerciseType !== "multi_blank" || !ex.bodySegments) return;
    ex.bodySegments.forEach(function (seg) {
      if (seg.type === "blank") {
        map[seg.blankUnitId] = { segments: ex.bodySegments, label: seg.label };
      }
    });
  });
  return map;
};
