// 問題文の下線（「上記下線部」「下線部(a)」の問い）。
//
// 下線は PDF では文字ではなく、行のすぐ下に引かれた細い横線の図形。表の罫線も細い横線なので、
// 縦の線とつながる横線（表の枠）は除き、下線を問う問いの節（とその上の節）の行にだけ当てる。
// 横線の下にある文字（文字の幅から中心を見積もる）を、行の文字の範囲として残す。原文の文字は変えない。

const THIN = 1.6;

/** ページごとの、下線の候補の横線（つながった短い線は1本にまとめる）。 */
export function underlineSegments(doc) {
  const out = new Map();
  for (const p of doc?.pages ?? []) {
    const rects = (p.drawings ?? []).map((d) => d.rect).filter(Boolean);
    const vertical = rects.filter((r) => r[2] - r[0] <= THIN && r[3] - r[1] >= 6);
    const pieces = rects.filter((r) => r[3] - r[1] <= THIN && r[2] - r[0] > 0).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const merged = [];
    for (const r of pieces) {
      const m = merged.find((x) => Math.abs(x[1] - r[1]) < 0.8 && r[0] <= x[2] + 1.5 && r[2] >= x[0] - 1.5);
      if (m) {
        m[0] = Math.min(m[0], r[0]);
        m[2] = Math.max(m[2], r[2]);
        m[3] = Math.max(m[3], r[3]);
      } else merged.push([...r]);
    }
    // 表の罫線: 横線の左端と右端の両方で縦線とつながる。
    // 下線の途中や端に空欄の枠（〇②〇）が乗るだけのもの（片方の端だけ）は下線
    const touchesAt = (h, x) => vertical.some((v) => v[1] <= h[3] + 1.5 && v[3] >= h[1] - 1.5 && v[0] <= x + 2 && v[2] >= x - 2);
    const touchesGrid = (h) => touchesAt(h, h[0]) && touchesAt(h, h[2]);
    const lines = merged.filter((h) => h[2] - h[0] >= 6 && !touchesGrid(h));
    if (lines.length) out.set(p.page, lines);
  }
  return out;
}

/**
 * 行（span と、行の文字の中での span の位置 start を持つ）の下に引かれた線 → 行の文字の範囲。
 * @returns {Array<{start:number, end:number, text:string}>}
 */
export function rowUnderlines(row, segmentsByPage) {
  const b = row.source.bbox;
  const lines = (segmentsByPage.get(row.source.page) ?? []).filter((l) => l[1] >= b[3] - 3 && l[1] <= b[3] + 7 && l[0] < b[2] && l[2] > b[0]);
  if (!lines.length) return [];
  const flags = [];
  for (const s of row.spans ?? []) {
    if (s.start === undefined) continue;
    // 文字ごとの位置（抽出の chars）があればそれを使う
    if (s.chars && s.chars.length === s.text.length) {
      [...s.text].forEach((c, i) => {
        const [x0, x1] = s.chars[i];
        const cx = (x0 + x1) / 2;
        if (!/[\s　]/.test(c) && lines.some((l) => cx >= l[0] && cx <= l[2])) flags[s.start + i] = true;
      });
      continue;
    }
    // 無ければ見積もる。文字の幅: 半角（英数字・記号・半角の空白）は全角の半分として、span の幅を割り振る
    const chars = [...s.text];
    const widths = chars.map((c) => (/[\x20-\x7e\uff61-\uff9f]/.test(c) ? 0.5 : 1));
    const unit = (s.bbox[2] - s.bbox[0]) / Math.max(widths.reduce((a, b) => a + b, 0), 0.5);
    let off = s.start;
    let x = s.bbox[0];
    chars.forEach((c, i) => {
      const cx = x + (widths[i] * unit) / 2;
      x += widths[i] * unit;
      const tol = unit * 0.25; // 線の端が文字の中ほどで止まることがある
      if (!/[\s　]/.test(c) && lines.some((l) => cx >= l[0] - tol && cx <= l[2] + tol)) flags[off] = true;
      off += c.length;
    });
  }
  const out = [];
  let i = 0;
  while (i < row.text.length) {
    if (!flags[i]) {
      i++;
      continue;
    }
    let end = i + 1;
    // 下線の文字のあいだの空白はつなぐ
    for (let j = end; j < row.text.length; j++) {
      if (flags[j]) end = j + 1;
      else if (!/[\s　]/.test(row.text[j])) break;
    }
    // どの線の下か（線の左右と高さ。下線部の札「(a)」を下線に結びつけるのに使う）
    const line = lineFor(row, i, end, lines) ?? lines[0];
    out.push({ start: i, end, text: row.text.slice(i, end), line: [Math.round(line[0] * 10) / 10, Math.round(line[1] * 10) / 10, Math.round(line[2] * 10) / 10] });
    i = end;
  }
  return out;
}

function charX(row, index) {
  for (const s of row.spans ?? []) {
    if (s.start === undefined || index < s.start || index >= s.start + s.text.length) continue;
    if (s.chars && s.chars.length === s.text.length) return (s.chars[index - s.start][0] + s.chars[index - s.start][1]) / 2;
    return s.bbox[0] + ((index - s.start + 0.5) / s.text.length) * (s.bbox[2] - s.bbox[0]);
  }
  return null;
}

function lineFor(row, start, end, lines) {
  const x = charX(row, start);
  const x2 = charX(row, end - 1);
  if (x === null || x2 === null) return null;
  return lines.find((l) => x2 >= l[0] - 3 && x <= l[2] + 3) ?? null;
}

// 下線部の札だけの行「(a)」「(b)」「(C)」「ア」「Ａ」
const UNDERLINE_LABEL = /^[\s　]*([（(][a-zA-Zａ-ｚＡ-Ｚ][)）]|[ア-ンＡ-Ｚa-zA-Z])[\s　]*$/;

/**
 * 下線を問う問い（指示文に「下線」）の属する問（問の層が無ければ大問）の中の節 → その行に下線の範囲を付ける（rowRef.underlines）。
 * 「上記文章下線部Ａ」は前の小問の本文を指すことがあるので、問の中は兄弟の節も見る。
 */
export function attachUnderlines(nodes, problemRows, segmentsByPage) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rowByKey = new Map(problemRows.map((r) => [`${r.source.page}:${r.source.row}`, r]));
  const roots = new Set();
  for (const n of nodes) {
    if (!/下線/.test(n.instructionText ?? "")) continue;
    let root = n;
    for (let p = n; p; p = byId.get(p.parent)) {
      root = p;
      if (p.kind === "toi") break;
    }
    roots.add(root.id);
  }
  const scope = new Set();
  const inRoot = (n) => {
    for (let p = n; p; p = byId.get(p.parent)) if (roots.has(p.id)) return true;
    return false;
  };
  for (const n of nodes) if (inRoot(n)) scope.add(n.id);
  // 問の上（大問）の本文も「上記」に入る
  for (const id of roots) for (let p = byId.get(byId.get(id).parent); p; p = byId.get(p.parent)) scope.add(p.id);
  let count = 0;
  const underlined = [];
  for (const id of scope) {
    const n = byId.get(id);
    const refs = [...(n.instruction ?? []), ...(n.passage ?? []), ...(n.options ?? []).flatMap((o) => o.rows ?? []), ...(n.labeledItems ?? []).flatMap((l) => l.rows ?? [])];
    for (const ref of refs) {
      if (ref.fromHeading || !ref.source) continue;
      const row = rowByKey.get(`${ref.source.page}:${ref.source.row}`);
      if (!row || row.text !== ref.text) continue;
      const u = rowUnderlines(row, segmentsByPage);
      if (u.length) {
        ref.underlines = u;
        count += u.length;
        underlined.push(ref);
      }
    }
  }
  // 下線のすぐ下（線の端に重なることもある）の札「(a)」→ どの行のどの下線の札か（underlineLabelOf）。表示では下線の後ろに置く
  for (const id of scope) {
    const n = byId.get(id);
    for (const ref of [...(n.instruction ?? []), ...(n.passage ?? [])]) {
      if (!ref.source || !UNDERLINE_LABEL.test(ref.text)) continue;
      const b = ref.source.bbox;
      const cx = (b[0] + b[2]) / 2;
      for (const target of underlined) {
        if (target.source.page !== ref.source.page) continue;
        const k = target.underlines.findIndex((u) => b[3] >= u.line[1] - 2 && b[1] <= u.line[1] + 10 && cx >= u.line[0] - 12 && cx <= u.line[2] + 12);
        if (k >= 0) {
          ref.underlineLabelOf = { page: target.source.page, row: target.source.row, index: k };
          break;
        }
      }
    }
  }
  return count;
}
