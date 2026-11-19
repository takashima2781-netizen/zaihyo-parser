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
      if (gap < -2 || gap > 14) continue;
      if (overlapRatio(a.bbox, b.bbox) < 0.5) continue;
      // 間が6ptを超えるのは、分子と分母のあいだを本文の行が通っているとき（分子が行の上、分母が行の下に
      // はみ出す形）だけ。そのような行が無ければ組まない
      if (gap > 6) {
        const cx = (Math.min(a.bbox[0], b.bbox[0]) + Math.max(a.bbox[2], b.bbox[2])) / 2;
        const between = lines.some((l, li) => li !== ai && li !== bi && !l.role && l.text.trim() !== "" && !NUMERIC.test(l.text.trim()) && l.bbox[1] >= a.bbox[3] - 3 && l.bbox[3] <= b.bbox[1] + 3 && cx >= l.bbox[0] && cx <= l.bbox[2] + 25);
        if (!between) continue;
      }
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
  // 空白が文字のかたまりの境目で2つに分かれていることがある（「×   」｜「   ＝」）。続いている空白は1つにまとめる
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && last.end === r.start) {
      last.end = r.end;
      last.x1 = r.x1;
    } else merged.push({ ...r });
  }
  return merged;
}

/**
 * ページの行に分数を当てはめる。
 * 戻り値: { lines（分数の部品になった行は role="fractionPart"、入った行は segments 付き）, unresolved }
 */
export function restoreFractions(lines, drawings = null) {
  const out = lines.map((l) => ({ ...l }));
  const unresolved = [];
  // 同じ数字が同じ位置に2回書かれていることがある（PDFの重ね刷り）。2つ目以降は分数の部品にせず、
  // 表示もしない（role="overprint"。行そのものは残す）
  out.forEach((l, i) => {
    if (l.role || !NUMERIC.test(l.text.trim())) return;
    const twin = out.findIndex((m, j) => j < i && !m.role && m.text.trim() === l.text.trim() && m.bbox.every((v, k) => Math.abs(v - l.bbox[k]) < 0.5));
    if (twin >= 0) l.role = "overprint";
  });
  const candidates = findFractionCandidates(out, drawings);
  const fractionLineIdx = new Set(candidates.flatMap((c) => [c.numeratorIndex, c.denominatorIndex]));
  const joinedInto = new Map(); // つないだ右の行 -> つなぎ先の行
  const sourceOf = (i) => out[i].source;
  const fractionSeg = (cand, placeholder) => ({
    kind: "fraction",
    numerator: cand.numerator,
    denominator: cand.denominator,
    placeholder,
    source: [sourceOf(cand.numeratorIndex), sourceOf(cand.denominatorIndex)],
  });
  const markParts = (cand) => {
    out[cand.numeratorIndex].role = "fractionPart";
    out[cand.denominatorIndex].role = "fractionPart";
  };
  const giveUp = (reason, cand) =>
    unresolved.push({ reason, numerator: cand.numerator, denominator: cand.denominator, source: [sourceOf(cand.numeratorIndex), sourceOf(cand.denominatorIndex)] });

  // 同じ行に分数が複数あるときに左から順につなげられるよう、上から・左から順に処理する
  candidates.sort((a, b) => (Math.abs(a.centerY - b.centerY) > 4 ? a.centerY - b.centerY : a.centerX - b.centerX));

  // 1) 入る行（空白の連なりを持ち、分数と同じ高さの行）を決める。高さがいちばん近い行が1つに決まらなければ戻さない。
  //    行の右端のすぐ外（25pt以内）の分数も、その行の末尾の空白に入りうる（「Ａ＋Ｂ×  」のように行が空白で終わる）
  const hostOf = new Map();
  const noHost = [];
  // 高さはまず行の上下1pt以内で探し、見つからなければ4ptまで広げる（行が分数より少し下にずれていることがある）
  const hostsWithin = (cand, tol) => {
    const near = [];
    out.forEach((l, i) => {
      if (l.role || fractionLineIdx.has(i)) return;
      const [x0, y0, x1, y1] = l.bbox;
      if (cand.centerY < y0 - tol || cand.centerY > y1 + tol) return;
      if (cand.centerX < x0 || cand.centerX > x1 + 25) return;
      if (gapRuns(l).length === 0) return;
      near.push({ i, dy: Math.abs((y0 + y1) / 2 - cand.centerY) });
    });
    return near;
  };
  const besideRow = (cand) => {
    const fracX0 = Math.min(out[cand.numeratorIndex].bbox[0], out[cand.denominatorIndex].bbox[0]);
    const fracX1 = Math.max(out[cand.numeratorIndex].bbox[2], out[cand.denominatorIndex].bbox[2]);
    return out.some(
      (l, i) =>
        !fractionLineIdx.has(i) && !l.role && l.text.trim() !== "" && cand.centerY >= l.bbox[1] - 1 && cand.centerY <= l.bbox[3] + 1 &&
        ((l.bbox[2] <= fracX0 + 6 && fracX0 - l.bbox[2] < 20) || (l.bbox[0] >= fracX1 - 6 && l.bbox[0] - fracX1 < 20))
    );
  };
  for (const cand of candidates) {
    let near = hostsWithin(cand, 1);
    // 分数のすぐ左右に同じ高さの行があるなら、左右に分かれた行（3）として扱い、高さを広げて探さない
    if (near.length === 0 && !besideRow(cand)) near = hostsWithin(cand, 4);
    near.sort((a, b) => a.dy - b.dy);
    if (near.length === 0) noHost.push(cand);
    else if (near.length > 1 && near[1].dy - near[0].dy < 2) giveUp("fraction-host-ambiguous", cand);
    else hostOf.set(cand, near[0].i);
  }

  // 2) 行ごとに、分数を空白へ入れる。
  //    まず分数ごとに、位置で1つに決まる空白に入れる（行頭の空白にも入る: 「   ＝0.51…」の頭に分数）。
  //    それで決まらない（空白が見つからない・2つの分数が同じ空白に入る）ときだけ、分数の数と空白の数が
  //    同じなら左から順に対応させる（文字幅の見積もりが少しずれても入れられる。行頭・行末の空白を除いて
  //    数が合うときも同じ）。それでも決まらない分数は、左右に分かれた行など（3）で試す。
  const byHost = new Map();
  for (const [cand, index] of hostOf) {
    if (!byHost.has(index)) byHost.set(index, []);
    byHost.get(index).push(cand);
  }
  for (const [index, list] of byHost) {
    const line = out[index];
    const text = line.text;
    const all = gapRuns(line);
    const leading = (r) => text.slice(0, r.start).trim() === "";
    const trailing = (r) => text.slice(r.end).trim() === "";
    const dist = (c, r) => (c.centerX < r.x0 ? r.x0 - c.centerX : c.centerX > r.x1 ? c.centerX - r.x1 : 0);
    list.sort((a, b) => a.centerX - b.centerX);

    // a) 分数ごとに位置で決める（これまでと同じ決め方）
    const pairs = [];
    const notFound = [];
    const ambiguous = [];
    for (const c of list) {
      const inside = all.filter((r) => c.centerX >= r.x0 - 3 && c.centerX <= r.x1 + 3);
      if (inside.length === 1) pairs.push([c, inside[0]]);
      else if (inside.length > 1) ambiguous.push(c);
      else {
        // いちばん近い空白が近く（20pt以内）、2番目より明らかに近い（10pt以上の差）ときだけ入れる
        const sorted = [...all].sort((x, y) => dist(c, x) - dist(c, y));
        if (sorted.length && dist(c, sorted[0]) <= 20 && (sorted.length === 1 || dist(c, sorted[1]) - dist(c, sorted[0]) >= 10)) pairs.push([c, sorted[0]]);
        else notFound.push(c);
      }
    }
    const collision = new Set(pairs.map(([, r]) => r.start)).size !== pairs.length;
    let chosen = null;
    if (!collision && ambiguous.length === 0 && notFound.length === 0) chosen = pairs;
    else {
      // b) 数が合えば左から順に
      const near = (c, r) => (c.centerX >= r.x0 - 25 && c.centerX <= r.x1 + 25) || (trailing(r) && c.centerX >= r.x0 - 25);
      for (const runs of [all, all.filter((r) => !leading(r) && !trailing(r)), all.filter((r) => !leading(r))]) {
        if (runs.length !== list.length) continue;
        const tryPairs = list.map((c, k) => [c, runs[k]]);
        if (tryPairs.every(([c, r]) => near(c, r))) {
          chosen = tryPairs;
          break;
        }
      }
    }
    if (!chosen) {
      if (collision) {
        // 2つの分数が同じ空白に入ろうとした → 決めきれないので、この行の分数はすべて戻さない
        for (const c of list) giveUp("fraction-gap-collision", c);
        continue;
      }
      for (const c of ambiguous) giveUp("fraction-host-ambiguous", c);
      for (const c of notFound) noHost.push(c); // この行の空白には入らない → 左右に分かれた行など（3）で試す
      chosen = pairs;
    }
    if (chosen.length === 0) continue;
    chosen.sort((a, b) => a[1].start - b[1].start);
    const segments = [];
    let pos = 0;
    for (const [c, r] of chosen) {
      if (r.start > pos) segments.push({ kind: "text", text: text.slice(pos, r.start) });
      segments.push(fractionSeg(c, text.slice(r.start, r.end)));
      pos = r.end;
      markParts(c);
    }
    if (pos < text.length) segments.push({ kind: "text", text: text.slice(pos) });
    line.segments = segments;
  }

  // 3) 空白の入った行が無い分数:
  //    - 分数の左右で行が分かれている（「7,104×」｜分数｜「＝646」）→ 左の行に分数と右の行をつなげる
  //    - 行の頭に分数がある（分数｜「＝310,716…」）→ 右の行の頭に分数を入れる
  //    - まわりに行が無く、分数の線がある（表の中の割合など）→ 分子の行を分数として出す
  noHost.sort((a, b) => (Math.abs(a.centerY - b.centerY) > 4 ? a.centerY - b.centerY : a.centerX - b.centerX));
  for (const cand of noHost) {
    const sameRow = (l) => (!l.role || l.role === "fractionJoined") && cand.centerY >= l.bbox[1] - 1 && cand.centerY <= l.bbox[3] + 1;
    const fracX0 = Math.min(out[cand.numeratorIndex].bbox[0], out[cand.denominatorIndex].bbox[0]);
    const fracX1 = Math.max(out[cand.numeratorIndex].bbox[2], out[cand.denominatorIndex].bbox[2]);
    let lefts = [];
    let rights = [];
    out.forEach((l, i) => {
      if (fractionLineIdx.has(i) || !sameRow(l) || l.text.trim() === "") return;
      if (l.bbox[2] <= fracX0 + 6 && fracX0 - l.bbox[2] < 20) lefts.push(i);
      else if (l.bbox[0] >= fracX1 - 6 && l.bbox[0] - fracX1 < 20) rights.push(i);
    });
    // 左（右）の候補が2つあるときは、明らかに近い（5pt以上の差）ほうだけにする（「140,000,000」「×」｜分数）
    const nearest = (list, gapOf) => {
      if (list.length < 2) return list;
      const sorted = [...list].sort((a, b) => gapOf(a) - gapOf(b));
      return gapOf(sorted[1]) - gapOf(sorted[0]) >= 5 ? [sorted[0]] : list;
    };
    lefts = nearest(lefts, (i) => fracX0 - out[i].bbox[2]);
    rights = nearest(rights, (i) => out[i].bbox[0] - fracX1);
    const rootOf = (i) => (joinedInto.has(i) ? rootOf(joinedInto.get(i)) : i);
    // 左の行にすでに分数が入っていても（行の途中の分数）、行の終わりのすぐ後ろの分数はその後ろにつなげる
    if (lefts.length === 1 && rights.length <= 1 && (rights.length === 0 || out[rights[0]].role !== "fractionJoined")) {
      const leftRoot = rootOf(lefts[0]);
      const left = out[leftRoot];
      // 左の行がすでに前の分数とつないだ行なら、その続きに足す（1行に分数が2つ並ぶとき）
      const segs = [...(left.segments ?? [{ kind: "text", text: left.text }]), fractionSeg(cand, "")];
      if (rights.length === 1) {
        // 右の行にすでに分数が入っていれば（行末の空白の分数）、その並びのままつなぐ
        if (out[rights[0]].segments) segs.push(...out[rights[0]].segments);
        else segs.push({ kind: "text", text: out[rights[0]].text, source: out[rights[0]].source });
        out[rights[0]].role = "fractionJoined";
        joinedInto.set(rights[0], leftRoot);
      }
      left.segments = segs;
      markParts(cand);
      continue;
    }
    if (lefts.length === 0 && rights.length === 1 && !out[rights[0]].segments) {
      const right = out[rights[0]];
      right.segments = [fractionSeg(cand, ""), { kind: "text", text: right.text }];
      markParts(cand);
      continue;
    }
    if (lefts.length === 0 && rights.length === 0 && hasFractionBar(out[cand.numeratorIndex], out[cand.denominatorIndex], drawings) === true) {
      const num = out[cand.numeratorIndex];
      num.segments = [fractionSeg(cand, "")];
      num.fractionStandalone = true;
      out[cand.denominatorIndex].role = "fractionPart";
      continue;
    }
    giveUp("fraction-host-not-found", cand);
  }

  return { lines: out, unresolved };
}
