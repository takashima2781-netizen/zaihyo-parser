// 自己採点形式(共有本文型)の穴埋め・多重穴埋めから、並べ替え問題(ordering)の文節ならびかえ
// 下書きを作るための純粋関数群。DOM・アプリ状態には一切依存しない（conversionManager.jsが
// これらを使って実際のExercise/変換記録を組み立てる）。
//
// 原則5(原文を失わない)にもとづき、テキストの分割は常に元の文字列の部分文字列への切り分け
// としてのみ行う(文字の削除・書き換え・要約は一切しない。分割位置をずらすだけ)。
// 原則6(推測しない)にもとづき、空欄の位置を一意に特定できないケースは変換対象外とし、
// 呼び出し側(conversionManager.js)がそのまま候補から除外する。

var EVv2 = window.EVv2 || {};
window.EVv2 = EVv2;

// 句読点は直前の断片に含めて区切る(「〜、」「〜。」で1文節が終わる)。
// は/が/を/に/で/の/も等の基本的な格助詞は出現頻度が高すぎて区切り点にすると
// 断片が1〜2文字単位まで細かくなりすぎるため対象にしない(実データで確認済み)。
// 接続表現(と/から/という等)は逆に「そこから次の意味の塊が始まる」ことが多いため、
// 直後の断片に含めて区切る(例:「貸借対照表」|「と」|「損益計算書」|「から構成される」)。
var SPLIT_AFTER_CHARS = ["、", "。", "！", "？"];
// 長い表現を先に判定する(「という」を「と」より先にチェックしないと誤って早く区切ってしまう)。
var SPLIT_BEFORE_TOKENS = ["ということ", "という", "けれど", "しかし", "ながら", "ので", "まで", "より", "から", "と"];

// 1つのテキスト断片を、上記の区切りで複数の文節候補に分割する。区切りが1つも見つからない場合は
// 断片全体をそのまま1件として返す。連結すると必ず元のtextと一致する(文字を1つも捨てない。
// 区切り位置をずらすだけ)。あくまで下書き生成用の簡易ヒューリスティックであり、意味理解に基づく
// 厳密な文節分割ではない(ユーザー指示: 自動分割は100点を目指さず、必ず人の目で調整する前提)。
EVv2.autoSplitPhraseText = function (text) {
  if (!text) return [];
  var pieces = [];
  var current = "";
  var i = 0;
  while (i < text.length) {
    var matchedToken = null;
    for (var t = 0; t < SPLIT_BEFORE_TOKENS.length; t++) {
      var token = SPLIT_BEFORE_TOKENS[t];
      if (text.substr(i, token.length) === token) {
        matchedToken = token;
        break;
      }
    }
    if (matchedToken && current.length > 0) {
      pieces.push(current);
      current = matchedToken;
      i += matchedToken.length;
      continue;
    }
    if (matchedToken) {
      // 断片の先頭に来た場合は区切らず、そのまま今の断片に含めて続ける。
      current += matchedToken;
      i += matchedToken.length;
      continue;
    }
    var ch = text.charAt(i);
    current += ch;
    i += 1;
    if (SPLIT_AFTER_CHARS.indexOf(ch) !== -1) {
      pieces.push(current);
      current = "";
    }
  }
  if (current.length > 0) pieces.push(current);
  return pieces.filter(function (p) {
    return p.length > 0;
  });
};

// 空白のみの断片(例: 単独の" ")を前後どちらかの実質的な断片へ吸収する。空白だけのカードは
// 並べ替え項目エディタの非空チェック(ExerciseEditor.validateOrderingDraft)に必ず失敗するうえ、
// 学習画面でも見た目上「空のカード」になってしまうため、下書きの時点で発生させない。
// 文字を捨てるわけではなく、隣接断片への吸収先を変えるだけ(連結結果は変わらない)。
function foldWhitespaceOnlyPieces(pieces) {
  var result = [];
  var pendingPrefix = "";
  pieces.forEach(function (p) {
    if (/^\s+$/.test(p)) {
      pendingPrefix += p;
      return;
    }
    result.push(pendingPrefix + p);
    pendingPrefix = "";
  });
  if (pendingPrefix) {
    if (result.length > 0) {
      result[result.length - 1] += pendingPrefix;
    } else {
      // 断片全体が空白のみだった場合(実質的に起こらない想定)。吸収先が無いためそのまま残す。
      result.push(pendingPrefix);
    }
  }
  return result;
}

// {origin:"text"|"answer", text}の配列(建材はbuildAssembledPartsForExercise参照)から、
// 実際にordering項目として並べる文節テキストの配列を作る。"answer"(空欄の正解)部分は
// 1つの塊として扱い、自動分割の対象にしない(暗記対象の答えを勝手に割らない)。
EVv2.autoSplitPhraseParts = function (parts) {
  var out = [];
  parts.forEach(function (part) {
    if (!part.text) return;
    if (part.origin === "answer") {
      out.push(part.text);
      return;
    }
    EVv2.autoSplitPhraseText(part.text).forEach(function (piece) {
      out.push(piece);
    });
  });
  return foldWhitespaceOnlyPieces(out);
};

// 多重穴埋め(共有本文型、structureType==="shared_body_blanks")から、空欄を正解で埋めた
// 完成文の断片列を作る。bodySegments(Phase 2Cで確定済み、本文中の空欄位置の正本)をそのまま使い、
// 本文中の空欄位置について新たな推測は一切行わない。
EVv2.buildAssembledPartsForMultiBlank = function (ex) {
  if (ex.exerciseType !== "multi_blank") return { ok: false, reason: "not-multi-blank" };
  if (ex.structureType !== "shared_body_blanks" || !Array.isArray(ex.bodySegments)) {
    return { ok: false, reason: "not-shared-body-blanks" };
  }
  var answerByUnitId = {};
  (ex.expectedAnswer || []).forEach(function (a) {
    answerByUnitId[a.blankUnitId] = a;
  });

  var parts = [];
  for (var i = 0; i < ex.bodySegments.length; i++) {
    var seg = ex.bodySegments[i];
    if (seg.type === "text") {
      parts.push({ origin: "text", text: seg.text });
    } else {
      var answer = answerByUnitId[seg.blankUnitId];
      if (!answer || !answer.answerText || typeof answer.answerText.text !== "string" || !answer.answerText.text) {
        return { ok: false, reason: "missing-answer-for-blank:" + seg.blankUnitId };
      }
      parts.push({ origin: "answer", text: answer.answerText.text });
    }
  }
  return { ok: true, parts: parts };
};

// single_blankから、完成文の断片列を作る。本文中の対象空欄のマーカー(①②…)が
// blankMarkerIndex(Phase 2C由来のbodySegmentsから導出済み、html-v2/js/blankMarkerIndex.js)経由で
// 一意に特定できる場合のみ変換対象にする。本文への新規の正規表現探索・位置の推測は行わない。
// マーカーが特定できない・本文中に見つからない・複数出現して曖昧な場合はok:falseを返す。
EVv2.buildAssembledPartsForSingleBlank = function (ex, blankMarkerIndex) {
  if (ex.exerciseType !== "single_blank") return { ok: false, reason: "not-single-blank" };
  var answer = ex.expectedAnswer && ex.expectedAnswer[0];
  if (!answer || !answer.answerText || !answer.answerText.text) {
    return { ok: false, reason: "no-answer" };
  }
  if (!ex.body || typeof ex.body.text !== "string") {
    return { ok: false, reason: "no-body" };
  }
  var markerInfo = (blankMarkerIndex || {})[answer.blankUnitId];
  if (!markerInfo || !markerInfo.label) {
    return { ok: false, reason: "no-marker" };
  }

  var bodyText = ex.body.text;
  var label = markerInfo.label;
  var firstIdx = bodyText.indexOf(label);
  if (firstIdx === -1) return { ok: false, reason: "marker-not-found-in-body" };
  if (bodyText.indexOf(label, firstIdx + 1) !== -1) return { ok: false, reason: "marker-ambiguous" };

  var parts = [];
  if (firstIdx > 0) parts.push({ origin: "text", text: bodyText.slice(0, firstIdx) });
  parts.push({ origin: "answer", text: answer.answerText.text });
  if (firstIdx + label.length < bodyText.length) {
    parts.push({ origin: "text", text: bodyText.slice(firstIdx + label.length) });
  }
  return { ok: true, parts: parts };
};

EVv2.buildAssembledPartsForExercise = function (ex, blankMarkerIndex) {
  if (ex.exerciseType === "multi_blank") return EVv2.buildAssembledPartsForMultiBlank(ex);
  if (ex.exerciseType === "single_blank") return EVv2.buildAssembledPartsForSingleBlank(ex, blankMarkerIndex);
  return { ok: false, reason: "unsupported-exercise-type" };
};

// 独立小問型(structureType==="independent_subquestions")の多重穴埋め、中問(subQuestion)1件から
// 完成文の断片列を作る。この構造は「文章中の特定位置に空欄がある」のではなく、独立した本文
// (主張・記述)を読んで、その内容を表す短い分類語を答える形式(実データで確認済み。例:
// 本文「利害関係者は...情報を提供する役割を担っている。」→ 正解「情報提供機能」)。
// そのため空欄位置の推測は行わず、本文全体を先頭、正解をそれに続く断片として扱う
// (本文と正解の間の区切り文字は、原文には存在しない表示上の結合であることを明示するため、
// 半角スペース1文字を本文側の末尾に追加するのみで、内容の要約・言い換えは一切行わない)。
// 本文・正解のいずれかが欠落・空文字の場合はok:falseを返す(推測しない)。
EVv2.buildAssembledPartsForMultiBlankSubQuestion = function (subQuestion) {
  if (!subQuestion || !subQuestion.body || typeof subQuestion.body.text !== "string" || !subQuestion.body.text.trim()) {
    return { ok: false, reason: "no-subquestion-body" };
  }
  if (
    !subQuestion.expectedAnswer ||
    typeof subQuestion.expectedAnswer.text !== "string" ||
    !subQuestion.expectedAnswer.text.trim()
  ) {
    return { ok: false, reason: "no-subquestion-answer" };
  }
  return {
    ok: true,
    parts: [
      { origin: "text", text: subQuestion.body.text + " " },
      { origin: "answer", text: subQuestion.expectedAnswer.text },
    ],
  };
};

EVv2.partsToAssembledText = function (parts) {
  return parts
    .map(function (p) {
      return p.text;
    })
    .join("");
};
