// 学習アプリに渡す文字から、教材の「位置を揃えるための空白」を消す（ユーザー指示、2026-11-17
// 「位置を揃えるための空白だとわかった時は、その空白は消しておいて欲しいです」）。
//
// 教材構造（第1層）の原文はそのまま残す。ここで変えるのは問題データ（第2層）の表示用の文字だけ。
// 位置合わせの空白とみなすもの:
//   1. 「定 義」「非 課 税」「計 算 過 程」のように、1文字ずつ空けて書いた語の間の空白 → 詰める
//   2. 2つ以上続く空白（表の桁揃え・字下げ） → 日本語どうしの間なら消す。数字・英字の隣なら1つにする
//   3. 行頭の記号（(1)・①・イ・１・Ⅰ・※ など）の後の空白 → 1つにする（記号と本文はくっつけない）
//   4. 行末・行頭の空白 → 消す
// どれにも当てはまらない1つだけの空白（例: 「１ 課税標準額」）は残す。

const CJK = "\\u3040-\\u30ff\\u3400-\\u9fff\\uff10-\\uff19\\uff21-\\uff5a"; // ひらがな・カタカナ・漢字・全角英数
const CJK_RE = new RegExp(`[${CJK}]`);
const FULLWIDTH_PUNCT = /[、。，．・：；？！「」『』（）【】〔〕＝＋－×÷％→←≦≧＜＞～]/;
const LEADING_MARKER = /^([（(][^（）()]{1,3}[）)]|[①-⑳]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]|※[0-9０-９]*|[0-9０-９]+[．.]?|[イロハニホヘトチリヌルヲワカヨタレソツネナラム])[ 　]+/;

function isWide(ch) {
  return ch !== undefined && (CJK_RE.test(ch) || FULLWIDTH_PUNCT.test(ch));
}

/** 1文字ずつ空けて書いた語（2文字以上）を詰める。 */
function joinSpacedOutWords(text) {
  const parts = text.split(/([ 　]+)/);
  // parts: [語, 空白, 語, 空白, …]
  let i = 0;
  const out = [];
  while (i < parts.length) {
    const word = parts[i];
    if (i % 2 === 0 && isSingleWide(word)) {
      let j = i;
      while (j + 2 < parts.length && parts[j + 1].length === 1 && isSingleWide(parts[j + 2])) j += 2;
      if (j > i) {
        for (let k = i; k <= j; k += 2) out.push(parts[k]);
        i = j + 1;
        continue;
      }
    }
    out.push(word);
    i += 1;
  }
  return out.join("");
}

function isSingleWide(s) {
  return [...s].length === 1 && CJK_RE.test(s);
}

/** 2つ以上続く空白: 日本語どうしの間なら消し、それ以外は1つにする。 */
function collapseRuns(text) {
  return text.replace(/[ 　]{2,}/g, (run, offset, whole) => {
    const before = whole[offset - 1];
    const after = whole[offset + run.length];
    if (before === undefined || after === undefined) return "";
    return isWide(before) && isWide(after) ? "" : " ";
  });
}

/**
 * @param {string} text 1行分の文字
 * @param {{ lineStart?: boolean, lineEnd?: boolean }} where 行の先頭・末尾を含むか（segments の一部を渡すとき）
 */
export function removeAlignmentSpaces(text, { lineStart = true, lineEnd = true } = {}) {
  if (typeof text !== "string" || text === "") return text;
  let t = text;
  if (lineStart) t = t.replace(/^[ 　]+/, "");
  if (lineEnd) t = t.replace(/[ 　]+$/, "");
  let marker = "";
  if (lineStart) {
    const m = t.match(LEADING_MARKER);
    if (m) {
      marker = m[1] + " ";
      t = t.slice(m[0].length);
    }
  }
  t = collapseRuns(t);
  t = joinSpacedOutWords(t);
  return marker + t;
}

/** 複数行の文字（\n 区切り）を行ごとに処理する。 */
export function removeAlignmentSpacesMultiline(text) {
  if (typeof text !== "string") return text;
  return text
    .split("\n")
    .map((l) => removeAlignmentSpaces(l))
    .join("\n");
}

/** segments（1行分）の文字を処理する。先頭の segment だけが行頭、最後の segment だけが行末。 */
export function removeAlignmentSpacesInSegments(segments) {
  const textIdx = segments.map((s, i) => (s.kind === "fraction" ? -1 : i)).filter((i) => i !== -1);
  const first = textIdx[0];
  const last = textIdx[textIdx.length - 1];
  return segments
    .map((s, i) => {
      if (s.kind === "fraction") return s;
      return { ...s, text: removeAlignmentSpaces(s.text ?? "", { lineStart: i === first, lineEnd: i === last }) };
    })
    .filter((s) => s.kind === "fraction" || s.text !== "");
}
