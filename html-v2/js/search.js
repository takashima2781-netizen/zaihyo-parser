// v2-64(WISHLIST W-8): キーワード検索。「範囲を選ぶ」画面で、キーワードを含む問題だけに絞り込み、
// そのまま出題する（ユーザーの選択）。探す場所（問題文・答え・解説・テキスト・メモ）は選べる。
//
// 文字の比べ方: 全角・半角の違い（NFKC）と大文字・小文字の違いを無視し、空白・改行も無視する
// （教材の行の折り返しや位置揃えの空白で、言葉が途中で切れていても見つかるように）。
// 空白で区切った複数の言葉は、すべてを含む問題だけにする。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

(function () {
  "use strict";

  EVv2.SEARCH_FIELD_ITEMS = [
    { value: "all", label: "すべて" },
    { value: "question", label: "問題文" },
    { value: "answer", label: "答え" },
    { value: "explanation", label: "解説" },
    { value: "text", label: "テキスト" },
    { value: "memo", label: "メモ" },
  ];

  // 問題の欄 → 探す場所。ここに無い欄（出典・学習記録のキーなど）は探さない。
  var FIELD_OF_KEY = {
    prompt: "question",
    body: "question",
    promptRich: "question",
    bodySegments: "question",
    instructionRaw: "question",
    choices: "question",
    subQuestions: "question",
    orderingItems: "question",
    expectedAnswer: "answer",
    answerRich: "answer",
    judgement: "answer",
    explanation: "explanation",
    guidanceRich: "explanation",
    readingContent: "text",
  };
  // 文字を集めるときに入らない欄（出典の位置・識別子・見た目の指定・画像）
  var SKIP_KEYS = {
    source: 1, bsmNodeId: 1, documentId: 1, locator: 1, inherited: 1, id: 1, blankId: 1, blankUnitId: 1,
    sourceItemId: 1, stableItemId: 1, style: 1, role: 1, kind: 1, frame: 1, how: 1, type: 1, src: 1,
    width: 1, height: 1, page: 1, depth: 1, continues: 1, heading: 1, order: 1,
  };

  EVv2.normalizeSearchText = function (s) {
    var t = String(s == null ? "" : s);
    if (t.normalize) t = t.normalize("NFKC");
    return t.toLowerCase().replace(/\s+/g, "");
  };

  function collect(value, out) {
    if (value == null) return;
    if (typeof value === "string") {
      out.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) collect(value[i], out);
      return;
    }
    if (typeof value === "object") {
      for (var k in value) {
        if (!Object.prototype.hasOwnProperty.call(value, k) || SKIP_KEYS[k]) continue;
        collect(value[k], out);
      }
    }
  }

  // 問題ごとの、探す場所別の文字（正規化済み）。問題データは読み込み後に変わらないので覚えておく
  // （問題を編集・読み込みし直したときは EVv2.resetSearchCache() で作り直す。編集は問題を直接書き換えるため）。
  var cache = typeof WeakMap === "function" ? new WeakMap() : null;
  function textsOf(ex) {
    var hit = cache && cache.get(ex);
    if (hit) return hit;
    var parts = { question: [], answer: [], explanation: [], text: [] };
    Object.keys(FIELD_OF_KEY).forEach(function (k) {
      if (ex[k] != null) collect(ex[k], parts[FIELD_OF_KEY[k]]);
    });
    // 計算問題: 段階の名前と答えは「答え」、計算の過程は「解説」
    (ex.calculationSteps || []).forEach(function (st) {
      collect([st.groupLabel, st.labelRaw, st.answerTextRaw, st.expected && st.expected.raw, st.judgement], parts.answer);
      collect(st.workRich, parts.explanation);
    });
    // 並べ替え: つなげた本文も「答え」
    if (ex.orderingMeta && ex.orderingMeta.referenceText) parts.answer.push(ex.orderingMeta.referenceText);
    var out = {};
    Object.keys(parts).forEach(function (f) {
      out[f] = EVv2.normalizeSearchText(parts[f].join(""));
    });
    if (cache) cache.set(ex, out);
    return out;
  }
  EVv2.resetSearchCache = function () {
    cache = typeof WeakMap === "function" ? new WeakMap() : null;
  };

  /** キーワードを、空白で区切った言葉（正規化済み）の配列にする。空なら []。 */
  EVv2.parseSearchQuery = function (query) {
    return String(query || "")
      .split(/[\s　]+/)
      .map(EVv2.normalizeSearchText)
      .filter(Boolean);
  };

  /**
   * terms（parseSearchQuery の結果）のすべてを、fields（["all"] か探す場所の配列）のどこかに含むか。
   * terms が空なら true。
   */
  EVv2.matchesKeyword = function (ex, terms, fields) {
    if (!terms || !terms.length) return true;
    var all = !fields || fields.indexOf("all") >= 0;
    var texts = textsOf(ex);
    var hay = [];
    ["question", "answer", "explanation", "text"].forEach(function (f) {
      if (all || fields.indexOf(f) >= 0) hay.push(texts[f]);
    });
    if (all || fields.indexOf("memo") >= 0) {
      var key = EVv2.computeExerciseKey ? EVv2.computeExerciseKey(ex) : null;
      var memo = key && EVv2.getMemo ? EVv2.getMemo(key) : null;
      if (memo) hay.push(EVv2.normalizeSearchText(memo.text));
    }
    // 探す場所どうしの境目をまたいで一致しないよう、区切りの文字を挟む
    var joined = hay.join("\u0000");
    return terms.every(function (t) {
      return joined.indexOf(t) >= 0;
    });
  };
})();
