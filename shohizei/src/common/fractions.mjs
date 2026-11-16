// 分数の復元（位置による対応付け）。
//
// 教材の分数（例: 計算式の「× 分子/分母」）は、抽出すると本文の行には空白だけが残り、
// 分子と分母は別のかたまりとしてページの後ろに出てくる。ここでは位置だけを手がかりに、
// 「どの行の、どの空白」に入る分数かを決める。
//
// fail-closed: 入る場所が1つに決まらないものは復元しない（unresolved に残す）。推測で埋めない。
// 原文の行（text）は書き換えない。復元結果は segments（文字と分数の並び）として別に持つ。

// 分子・分母になりうる文字列: 数字（と小数点・桁区切り）。分母が「７＋３」のような式のこともある。
const NUMERIC = /^(?=.*[0-9０-９①-⑳])[0-9０-９①-⑳.．,，＋+－\-×()（）]+$/; // 数字のほか、「(1)＋(2)＋18,000,000」のような式も分子・分母になる
const GAP = /[ 　]{2,}/g;

function overlapRatio(a, b) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  return w <= 0 ? 0 : w / Math.min(a[2] - a[0], b[2] - b[0]);
}

/**
 * 「数字だけの短い行が2つ、縦に重なって並んだもの」を分数の候補として拾う。
 * 分子の真下（間隔 -2〜6pt、横の重なり5割以上）に分母があるものだけ。1つの行が2つの候補に
 * 使われることはない（上から順に、いちばん近い相手と組む）。
 */
/**
 * 分子と分母のあいだに横線（分数の線）があるか。drawings が渡されないときは確かめない（null）。
 * 表の列で金額が上下に並んでいるだけのもの（例: 5,000,000 の下に 0）を分数と取り違えないため。
 */
function hasFractionBar(a, b, drawings) {
  if (!drawings) return null;
  const yTop = a.bbox[3] - 3;
  const yBottom = b.bbox[1] + 3;
  const x0 = Math.min(a.bbox[0], b.bbox[0]);
  const x1 = Math.max(a.bbox[2], b.bbox[2]);
  return drawings.some((d) => {
    const [dx0, dy0, dx1, dy1] = d.rect;
    if (dy1 - dy0 > 2) return false; // 横線だけ
    if (dx1 - dx0 > (x1 - x0) * 1.6 + 6) return false; // 表の罫線のような長い線は分数の線ではない
    const cy = (dy0 + dy1) / 2;
    if (cy < yTop || cy > yBottom) return false;
    const overlap = Math.min(dx1, x1) - Math.max(dx0, x0);
    return overlap > 0.5 * Math.min(dx1 - dx0, x1 - x0);
  });
}

export function findFractionCandidates(lines, drawings = null) {
  const numeric = [];
  lines.forEach((l, i) => {
    if (l.role) return;
    const t = l.text.trim();
    // 数字だけなら12文字まで、式（＋や(1)を含む）なら40文字まで。行頭記号だけの行（「(1)」）は除く
    const isExpr = /[＋+()（）×－①-⑳]/.test(t);
    if (t.length > 0 && t.length <= (isExpr ? 40 : 12) && NUMERIC.test(t) && !/^[（(][0-9０-９]+[）)]$/.test(t)) numeric.push(i);
  });
  numeric.sort((a, b) => lines[a].bbox[1] - lines[b].bbox[1]);
  const used = new Set();
  const candidates = [];
  for (const ai of numeric) {
    if (used.has(ai)) continue;
    const a = lines[ai];
    let best = null;
    for (const bi of numeric) {
      if (bi === ai || used.has(bi)) continue;
      const b = lines[bi];
      const gap = b.bbox[1] - a.bbox[3];
      if (gap < -2 || gap > 6) continue;
      if (overlapRatio(a.bbox, b.bbox) < 0.5) continue;
      if (!best || gap < best.gap) best = { bi, gap };
    }
    if (!best) continue;
    const b = lines[best.bi];
    if (hasFractionBar(a, b, drawings) === false) continue;
    used.add(ai);
    used.add(best.bi);
    candidates.push({
      numeratorIndex: ai,
      denominatorIndex: best.bi,
      numerator: a.text.trim(),
      denominator: b.text.trim(),
      centerX: (Math.min(a.bbox[0], b.bbox[0]) + Math.max(a.bbox[2], b.bbox[2])) / 2,
      centerY: (a.bbox[1] + b.bbox[3]) / 2,
    });
  }
  return candidates;
}

// 文字の幅の見積もり（全角=1字分、半角=半字分）。MS明朝・ゴシック系の等幅に近い前提で、
// 空白の位置を大まかに決めるためだけに使う。決めきれない場合は呼び出し側で復元をやめる。
function charWidth(ch, size) {
  return /[\u0000-ÿ｡-ﾟ]/.test(ch) ? size * 0.5 : size;
}

/** 行の中の空白の連なり（2文字以上）ごとに、文字列上の位置と、ページ上のおおよその x 範囲を出す。 */
export function gapRuns(line) {
  const runs = [];
  let offset = 0;
  for (const span of line.spans) {
    const width = [...span.text].reduce((w, ch) => w + charWidth(ch, span.size), 0);
    const scale = width > 0 ? (span.bbox[2] - span.bbox[0]) / width : 1;
    let x = span.bbox[0];
    const chars = [...span.text];
    const xs = chars.map((ch) => {
      const start = x;
      x += charWidth(ch, span.size) * scale;
      return [start, x];
    });
    let m;
    GAP.lastIndex = 0;
    const text = chars.join("");
    while ((m = GAP.exec(text))) {
      const startChar = [...text.slice(0, m.index)].length;
      const len = [...m[0]].length;
      runs.push({
        start: offset + m.index,
        end: offset + m.index + m[0].length,
        x0: xs[startChar][0],
        x1: xs[startChar + len - 1][1],
      });
    }
    offset += span.text.length;
  }
  return runs;
}

/**
 * ページの行に分数を当てはめる。
 * 戻り値: { lines（分数の部品になった行は role="fractionPart"、入った行は segments 付き）, unresolved }
 */
export function restoreFractions(lines, drawings = null) {
  const out = lines.map((l) => ({ ...l }));
  const unresolved = [];
  const candidates = findFractionCandidates(out, drawings);
  const fractionLineIdx = new Set(candidates.flatMap((c) => [c.numeratorIndex, c.denominatorIndex]));
  const placements = new Map(); // hostIndex -> [{run, cand}]

  for (const cand of candidates) {
    const hosts = [];
    out.forEach((l, i) => {
      if (l.role || fractionLineIdx.has(i)) return;
      const [x0, y0, x1, y1] = l.bbox;
      if (cand.centerY < y0 - 1 || cand.centerY > y1 + 1) return;
      if (cand.centerX < x0 || cand.centerX > x1) return;
      const all = gapRuns(l);
      let runs = all.filter((r) => cand.centerX >= r.x0 - 3 && cand.centerX <= r.x1 + 3);
      if (runs.length === 0 && all.length > 0) {
        // 文字幅の見積もりがずれて、どの空白にも入らないことがある。いちばん近い空白が近く（20pt以内）、
        // 2番目より明らかに近い（10pt以上の差）ときだけ、その空白に入れる。決めきれなければ入れない。
        const dist = (r) => (cand.centerX < r.x0 ? r.x0 - cand.centerX : cand.centerX - r.x1);
        const sorted = [...all].sort((a, b) => dist(a) - dist(b));
        if (dist(sorted[0]) <= 20 && (sorted.length === 1 || dist(sorted[1]) - dist(sorted[0]) >= 10)) runs = [sorted[0]];
      }
      if (runs.length > 0) hosts.push({ index: i, runs });
    });
    const sourceOf = (i) => out[i].source;
    // 空白の入った行が無いとき: 分数の左右で行が分かれている（「7,104×」｜分数｜「＝646」）。
    // 同じ高さで、分数のすぐ左で終わる行がちょうど1つあれば、その行に分数と右の行をつなげる。
    if (hosts.length === 0) {
      const sameRow = (l) => !l.role && cand.centerY >= l.bbox[1] - 1 && cand.centerY <= l.bbox[3] + 1;
      const fracX0 = Math.min(out[cand.numeratorIndex].bbox[0], out[cand.denominatorIndex].bbox[0]);
      const fracX1 = Math.max(out[cand.numeratorIndex].bbox[2], out[cand.denominatorIndex].bbox[2]);
      const lefts = [];
      const rights = [];
      out.forEach((l, i) => {
        if (fractionLineIdx.has(i) || !sameRow(l)) return;
        if (l.bbox[2] <= fracX0 + 3 && fracX0 - l.bbox[2] < 15) lefts.push(i);
        else if (l.bbox[0] >= fracX1 - 3 && l.bbox[0] - fracX1 < 15) rights.push(i);
      });
      if (lefts.length === 1 && rights.length <= 1 && !out[lefts[0]].segments && (rights.length === 0 || !out[rights[0]].segments)) {
        const left = out[lefts[0]];
        const segs = [
          { kind: "text", text: left.text },
          {
            kind: "fraction",
            numerator: cand.numerator,
            denominator: cand.denominator,
            placeholder: "",
            source: [sourceOf(cand.numeratorIndex), sourceOf(cand.denominatorIndex)],
          },
        ];
        if (rights.length === 1) {
          segs.push({ kind: "text", text: out[rights[0]].text, source: out[rights[0]].source });
          out[rights[0]].role = "fractionJoined";
        }
        left.segments = segs;
        out[cand.numeratorIndex].role = "fractionPart";
        out[cand.denominatorIndex].role = "fractionPart";
        continue;
      }
    }
    if (hosts.length !== 1 || hosts[0].runs.length !== 1) {
      unresolved.push({
        reason: hosts.length === 0 ? "fraction-host-not-found" : "fraction-host-ambiguous",
        numerator: cand.numerator,
        denominator: cand.denominator,
        source: [sourceOf(cand.numeratorIndex), sourceOf(cand.denominatorIndex)],
      });
      continue;
    }
    const { index, runs } = hosts[0];
    if (!placements.has(index)) placements.set(index, []);
    placements.get(index).push({ run: runs[0], cand });
  }

  for (const [index, list] of placements) {
    const used = new Set(list.map((p) => p.run.start));
    if (used.size !== list.length) {
      // 2つの分数が同じ空白に入ろうとした → 決めきれないので、この行の分数はすべて戻さない
      for (const p of list) {
        unresolved.push({
          reason: "fraction-gap-collision",
          numerator: p.cand.numerator,
          denominator: p.cand.denominator,
          source: [out[p.cand.numeratorIndex].source, out[p.cand.denominatorIndex].source],
        });
      }
      continue;
    }
    list.sort((a, b) => a.run.start - b.run.start);
    const text = out[index].text;
    const segments = [];
    let pos = 0;
    for (const p of list) {
      if (p.run.start > pos) segments.push({ kind: "text", text: text.slice(pos, p.run.start) });
      segments.push({
        kind: "fraction",
        numerator: p.cand.numerator,
        denominator: p.cand.denominator,
        placeholder: text.slice(p.run.start, p.run.end),
        source: [out[p.cand.numeratorIndex].source, out[p.cand.denominatorIndex].source],
      });
      pos = p.run.end;
    }
    if (pos < text.length) segments.push({ kind: "text", text: text.slice(pos) });
    out[index].segments = segments;
  }

  // 復元できた分数の部品の行だけを本文から外す。復元できなかったものは本文の行として残す
  // （表示から消えないように。unresolved にも分子・分母と出典が残る）。
  for (const [, list] of placements) {
    if (new Set(list.map((p) => p.run.start)).size !== list.length) continue;
    for (const p of list) {
      out[p.cand.numeratorIndex].role = "fractionPart";
      out[p.cand.denominatorIndex].role = "fractionPart";
    }
  }
  return { lines: out, unresolved };
}
