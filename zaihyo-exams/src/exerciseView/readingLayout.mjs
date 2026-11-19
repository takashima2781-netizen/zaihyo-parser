// テキスト（読む用）の行を、読みやすい段落の形にする（位置だけで判断する。原文の文字は変えない）。
//
// ユーザーの要望（2026-11-19）: 消費税の読み物が読みにくい。インデントとか、区切りとか。
//
// 1行ごとに次を決める:
//   continues … 前の行の続き（PDFの折り返し）。前の行が右端まで届いている、または括弧が開いたまま
//                終わっている。ただし行頭が (1)・①・※・・ などの記号なら、必ず新しい段落にする
//   rowJoin   … 前の行と同じ高さにある右隣の文字（表のような2列の並び）。表示では全角の空白で
//                つないで1行にする
//   depth     … 段落の字下げの深さ（ページの本文の左端からの距離を、ほぼ1文字＝9ptで数える。0〜4）
//   indent    … "first"（1行目だけ1文字下げる、ふつうの段落）／"hanging"（記号だけ左に出し、
//                2行目以降をそろえる。※の注など）／null
// ページの本文の左端は、折り返しの続きの行の書き出し位置で最も多いもの（奇数・偶数ページで余白が
// 違うため、ページごとに求める）。

const CHAR = 9; // 本文の1文字の幅（pt）
const MARKER = /^[\s　]*(?:[(（][0-9０-９]{1,2}[)）]|[①-⑳]|[❶-❿➊-➓]|[(（][イロハニホヘトチリヌルｲﾛﾊﾆﾎﾍﾄﾁﾘﾇﾙ][)）]|[イロハニホヘトチリヌル][\s　]|[※・●○◆◇■□▶▷★☆【〔]|[(（]注[0-9０-９]*[)）]|注[0-9０-９]*[\s　.．]|[0-9０-９]{1,2}[.．][\s　]|[0-9０-９]{1,2}[\s　](?=\S))/;

const bboxOf = (l) => l.source.bbox;
const pageKey = (l) => `${l.source.doc}:${l.source.page}`;
const textOf = (l) => (l.segments ?? [{ text: l.text }]).map((g) => g.text ?? "").join("") || l.text;

export function startsWithMarker(text) {
  return MARKER.test(text);
}

function openParens(text) {
  let depth = 0;
  for (const ch of text) {
    if (ch === "（" || ch === "(") depth += 1;
    else if (ch === "）" || ch === ")") depth = Math.max(0, depth - 1);
  }
  return depth;
}

function mode(values) {
  const count = new Map();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  let best = null;
  let n = 0;
  for (const [v, c] of count) if (c > n || (c === n && v < best)) [best, n] = [v, c];
  return best;
}

/**
 * lines: テキスト構造の行（{ text, segments, style, source: { doc, page, bbox } }）。
 * 戻り値: 行ごとの { continues, rowJoin, depth, indent }（lines と同じ順・同じ数）。
 */
export function layoutReadingLines(lines) {
  // ページの右端は本文の行だけで決める（見出し「理論：重要度 ★★★」などは本文より右まで出ていることがあり、
  // それで決めると本文の行がどれも右端に届かず、折り返しがつながらなかった）
  const rightEdge = new Map();
  for (const l of lines) if (l.style !== "heading") rightEdge.set(pageKey(l), Math.max(rightEdge.get(pageKey(l)) ?? 0, bboxOf(l)[2]));
  for (const l of lines) if (!rightEdge.has(pageKey(l))) rightEdge.set(pageKey(l), bboxOf(l)[2]);
  // 枠の中や図の横など、本文より狭い所の文章: まわり（上下60pt以内で、書き出し位置が±20pt以内）の本文の行の
  // 右端で最も右のものを、その所の右端とする。3行以上がその右端にそろっている（折り返している文章）ときだけ使う
  // （短い項目を並べただけのところで、いちばん長い項目を「右端まで届いた」と取り違えないため）
  const body = lines.filter((l) => l.style !== "heading");
  const localEdge = (l) => {
    const [x0, y0] = bboxOf(l);
    const near = body.filter((m) => pageKey(m) === pageKey(l) && Math.abs(bboxOf(m)[1] - y0) <= 60 && Math.abs(bboxOf(m)[0] - x0) <= 20);
    if (near.length < 3) return null;
    const edge = Math.max(...near.map((m) => bboxOf(m)[2]));
    const aligned = near.filter((m) => bboxOf(m)[2] >= edge - 6).length;
    return aligned >= 3 ? edge : null;
  };
  const reachesRight = (l) => {
    if (bboxOf(l)[2] >= (rightEdge.get(pageKey(l)) ?? Infinity) - 12) return true;
    const edge = localEdge(l);
    return edge != null && bboxOf(l)[2] >= edge - 6;
  };

  // 1) 行のつながり
  const out = lines.map(() => ({ continues: false, rowJoin: false, depth: 0, indent: null }));
  let parenDepth = 0;
  let paraStart = -1;
  lines.forEach((l, i) => {
    const text = textOf(l);
    const prev = i > 0 ? lines[i - 1] : null;
    const heading = l.style === "heading";
    if (prev && !heading && prev.style !== "heading" && pageKey(prev) === pageKey(l)) {
      const [px0, py0, px1, py1] = bboxOf(prev);
      const [x0, y0] = bboxOf(l);
      // 同じ高さで右隣（表のような2列）
      if (y0 < py1 - 3 && py0 < bboxOf(l)[3] - 3 && x0 > px1) {
        out[i].continues = true;
        out[i].rowJoin = true;
        parenDepth = openParens(textOfRange(lines, paraStart, i));
        return;
      }
    }
    const canContinue = prev && !heading && prev.style !== "heading" && !startsWithMarker(text) && paraStart >= 0;
    // 折り返しの続きは、段落の1行目より大きく右へは下がらない（※の注の2行目は1文字ほど右）
    const notFarRight = paraStart >= 0 && bboxOf(l)[0] <= bboxOf(lines[paraStart])[0] + 1.5 * CHAR;
    // 前の行が「。」で終わるとき: 次の行が1文字ほど下がって始まる（段落の1行目の字下げ）か、前の行が
    // 狭い所の右端に届いただけなら、文がちょうど右端で終わった段落の終わりとみなす
    const prevEndsSentence = prev && /。[\s　]*$/.test(textOf(prev));
    const pageEdgeReached = prev && bboxOf(prev)[2] >= (rightEdge.get(pageKey(prev)) ?? Infinity) - 12;
    const newParaAfterSentence = prevEndsSentence && (bboxOf(l)[0] >= bboxOf(prev)[0] + CHAR / 2 || !pageEdgeReached);
    if (canContinue && notFarRight && !newParaAfterSentence && (reachesRight(prev) || parenDepth > 0)) {
      out[i].continues = true;
    } else {
      paraStart = i;
    }
    // 段落の頭からこの行までで、閉じていない括弧の数
    parenDepth = openParens(textOfRange(lines, paraStart, i));
  });

  // 2) ページごとの本文の左端（折り返しの続きの行の書き出し位置で最も多いもの）
  const contX = new Map();
  lines.forEach((l, i) => {
    if (!out[i].continues || out[i].rowJoin) return;
    const k = pageKey(l);
    if (!contX.has(k)) contX.set(k, []);
    contX.get(k).push(Math.round(bboxOf(l)[0] / 3) * 3);
  });
  const baseOf = new Map();
  const pages = new Set(lines.map(pageKey));
  for (const k of pages) {
    const xs = contX.get(k);
    const body = lines.filter((l) => pageKey(l) === k && l.style !== "heading").map((l) => bboxOf(l)[0]);
    baseOf.set(k, xs && xs.length ? mode(xs) : body.length ? Math.min(...body) : 0);
  }

  // 3) 段落ごとの字下げ
  // 2行以上の段落の左端（2行目の書き出し位置）を、ページごとに集めておく。1行だけの段落は自分では左端が
  // 分からないので、近く（上下80pt以内）の段落の左端からちょうど1文字下がって始まっていれば、その段落と
  // 同じ左端で1行目を下げたもの（ふつうの段落）とみなす（枠の中の「したがって、…」の1行の段落など）
  const knownLefts = [];
  for (let i = 0; i < lines.length; ) {
    let j = i + 1;
    while (j < lines.length && out[j].continues) j += 1;
    const second = lines.slice(i + 1, j).find((l, k) => !out[i + 1 + k].rowJoin && pageKey(l) === pageKey(lines[i]));
    if (second && lines[i].style !== "heading") knownLefts.push({ page: pageKey(lines[i]), y: bboxOf(lines[i])[1], x: bboxOf(second)[0] });
    i = j;
  }
  const nearbyLeftFor = (first) => {
    const fx = bboxOf(first)[0];
    const fy = bboxOf(first)[1];
    const hits = knownLefts.filter((k) => k.page === pageKey(first) && Math.abs(k.y - fy) <= 80 && Math.abs(fx - CHAR - k.x) <= 3);
    if (!hits.length) return null;
    hits.sort((a, b) => Math.abs(a.y - fy) - Math.abs(b.y - fy));
    return hits[0].x;
  };
  for (let i = 0; i < lines.length; ) {
    let j = i + 1;
    while (j < lines.length && out[j].continues) j += 1;
    const first = lines[i];
    const base = baseOf.get(pageKey(first));
    const firstX = bboxOf(first)[0];
    const second = lines.slice(i + 1, j).find((l, k) => !out[i + 1 + k].rowJoin && pageKey(l) === pageKey(first));
    let left;
    let indent = null;
    if (first.style === "heading") {
      left = Math.min(firstX, base);
    } else if (second) {
      left = bboxOf(second)[0];
      if (firstX - left > CHAR / 2) indent = "first";
      else if (left - firstX > CHAR / 2) indent = "hanging";
    } else if (!startsWithMarker(textOf(first)) && nearbyLeftFor(first) != null) {
      left = nearbyLeftFor(first);
      indent = "first";
    } else if (firstX - base > CHAR / 2 && firstX - base <= 1.5 * CHAR && !startsWithMarker(textOf(first))) {
      // 1行だけの段落で、1文字分だけ下がっているものは、ふつうの段落の1行目の字下げ
      left = base;
      indent = "first";
    } else {
      left = firstX;
    }
    const depth = Math.max(0, Math.min(4, Math.round((Math.min(left, firstX) - base) / CHAR)));
    for (let k = i; k < j; k += 1) {
      out[k].depth = depth;
      out[k].indent = k === i ? indent : null;
    }
    i = j;
  }
  return out;
}

function textOfRange(lines, from, to) {
  let s = "";
  for (let k = Math.max(0, from); k <= to; k += 1) s += textOf(lines[k]);
  return s;
}
