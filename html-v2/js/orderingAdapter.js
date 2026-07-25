// v2-4本体(docs/v2_4_implementation_report.md)。
// item-1090専用の狭いスコープのordering変換アダプタ。**汎用的な並べ替え問題抽出パーサーではない**。
// BSM・Exercise View生成ロジック・review override・正式CSV・CSV Bridge・KM Adapter・現行HTMLは
// 一切変更しない。v2-4準備(docs/v2_4_prep_investigation.md)で追加された診断専用フィールド
// withheldAnswerContentを読み取るのみで、Exercise View本体・BSMへの書き戻しは行わない。
//
// item-1090以外のwithheldExerciseには一切影響しない（対象判定が一致しなければ常にnullを返す）。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

// item-1090の実際のstableItemId（v2-1調査／v2-4準備で確認済み。BSM再生成に対しても安定）。
// ハードコードは意図的（今回のスコープはitem-1090のみ、汎用マッチングは行わない）。
var ITEM_1090_STABLE_ID = "sitem:src.pdf.pointcheck:p286:b08:mnone";

// item-1090の実データ範囲のみ対応（ア〜オ）。他教材・他Itemへの拡張は次工程の課題。
var ORDERING_LABEL_CHARS = "アイウエオ";

function normalizeWhitespace(s) {
  return s.replace(/\s+/g, " ").trim();
}

// 問題文(body.text)から、並べ替え対象の選択肢を抽出する。item-1090専用のアドホックな
// 抽出であり、一般的な並べ替え問題抽出機能ではない（ラベル文字がテキスト中に空白付きで
// 出現する、という item-1090 固有の書式にのみ対応する）。
// 抽出できない場合はnullを返す（安全側フォールバック、推測しない）。
function extractOrderingOptions(bodyText) {
  var labelClass = "[" + ORDERING_LABEL_CHARS + "]";
  var splitRe = new RegExp("(?=" + labelClass + "(?=[\\s\\u3000]))", "g");
  var parts = bodyText.split(splitRe);
  if (parts.length < 2) return null; // ラベル(空白付き)が1件も見つからなかった

  var promptText = normalizeWhitespace(parts[0]);
  if (!promptText) return null;

  var options = [];
  for (var i = 1; i < parts.length; i++) {
    var chunk = parts[i];
    var label = chunk.charAt(0);
    var text = normalizeWhitespace(chunk.slice(1));
    if (!text) return null; // ラベルのみでテキストが空 -> 不正として扱う
    options.push({ label: label, text: text });
  }
  return { promptText: promptText, options: options };
}

function parseCorrectOrderLabels(answerText) {
  return answerText
    .split("→")
    .map(function (s) {
      return s.trim();
    })
    .filter(function (s) {
      return s.length > 0;
    });
}

// 検証ルール（ユーザー指示どおり）:
// - 並べ替え対象数とcorrectOrder数が一致しない場合はordering化しない
// - 重複ラベル、不明ラベル、欠落ラベルがある場合はordering化しない
// - 要素数1以下は出題不可
// いずれかを満たさなければnullを返す（呼び出し側は安全側フォールバックとして非表示のままにする）。
function validateAndBuildOrdering(options, correctLabels) {
  if (!options || options.length <= 1) return null;
  if (options.length !== correctLabels.length) return null;

  var labelSet = {};
  for (var i = 0; i < options.length; i++) {
    if (labelSet[options[i].label]) return null; // 選択肢側の重複ラベル
    labelSet[options[i].label] = true;
  }

  var correctSet = {};
  for (var j = 0; j < correctLabels.length; j++) {
    if (correctSet[correctLabels[j]]) return null; // correctOrder側の重複ラベル
    correctSet[correctLabels[j]] = true;
  }

  var optionLabelKeys = Object.keys(labelSet);
  var correctLabelKeys = Object.keys(correctSet);
  if (optionLabelKeys.length !== correctLabelKeys.length) return null;
  for (var k = 0; k < optionLabelKeys.length; k++) {
    if (!correctSet[optionLabelKeys[k]]) return null; // 選択肢のラベルがcorrectOrderに無い
  }
  for (var m = 0; m < correctLabelKeys.length; m++) {
    if (!labelSet[correctLabelKeys[m]]) return null; // correctOrderに不明ラベル
  }

  var orderingItems = options.map(function (opt) {
    return { id: "ord-" + opt.label, label: opt.label, text: opt.text };
  });
  var idByLabel = {};
  orderingItems.forEach(function (item) {
    idByLabel[item.label] = item.id;
  });
  var correctOrder = correctLabels.map(function (label) {
    return idByLabel[label];
  });

  return { orderingItems: orderingItems, correctOrder: correctOrder };
}

// withheldExercisesの中から、以下をすべて満たす1件（item-1090）だけを対象として
// ordering表示用オブジェクトを合成する。対象外・変換失敗の場合は常にnullを返し、
// 呼び出し側は何も表示しない（＝現状どおり非表示のまま。既存のwithheld表示に
// 「安全に」フォールバックする、という要件を、そもそも表示しないことで満たす）。
//
// 対象判定:
// - exerciseType === "single_blank"
// - eligibility === "review_required"（withheldExercises配列に格納される値の1つ）
// - stableItemIdsにitem-1090の実際のstableItemIdを含む
// - withheldAnswerContent.answerBodyRaw.textが存在する
//
// 戻り値はExercise View本体には存在しない、html-v2内部限定の合成オブジェクトである。
// Exercise View JSON・BSMへの書き戻しは一切行わない。
EVv2.buildOrderingViewIfApplicable = function (data) {
  var withheld = data.withheldExercises || [];
  var target = withheld.find(function (ex) {
    return (
      ex.exerciseType === "single_blank" &&
      ex.eligibility === "review_required" &&
      Array.isArray(ex.stableItemIds) &&
      ex.stableItemIds.indexOf(ITEM_1090_STABLE_ID) !== -1 &&
      ex.withheldAnswerContent &&
      ex.withheldAnswerContent.answerBodyRaw &&
      typeof ex.withheldAnswerContent.answerBodyRaw.text === "string"
    );
  });
  if (!target) return null;
  if (!target.body || typeof target.body.text !== "string") return null;

  try {
    var extracted = extractOrderingOptions(target.body.text);
    if (!extracted) return null;
    var correctLabels = parseCorrectOrderLabels(target.withheldAnswerContent.answerBodyRaw.text);
    var built = validateAndBuildOrdering(extracted.options, correctLabels);
    if (!built) return null;

    return {
      exerciseId: "ex-ordering-" + (target.sourceItemIds && target.sourceItemIds[0] ? target.sourceItemIds[0] : "item-1090"),
      exerciseType: "ordering",
      sourceItemIds: target.sourceItemIds || [],
      stableItemIds: target.stableItemIds,
      prompt: null,
      body: {
        text: extracted.promptText,
        source: target.body.source,
        bsmNodeId: target.body.bsmNodeId,
        inherited: target.body.inherited,
      },
      orderingItems: built.orderingItems,
      correctOrder: built.correctOrder,
      explanationText: target.withheldAnswerContent.explanationRaw ? target.withheldAnswerContent.explanationRaw.text : null,
      sourceRefs: [target.body, target.withheldAnswerContent.answerBodyRaw].filter(Boolean),
      sourceExerciseId: target.exerciseId,
    };
  } catch (e) {
    console.warn("[EVv2 orderingAdapter] item-1090の変換に失敗しました。安全側として非表示のままにします。", e);
    return null;
  }
};
