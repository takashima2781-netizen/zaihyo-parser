// テキストの図解・表の範囲を見つける（位置だけで判断する）。
//
// ページの線・枠（drawings）を、近いもの同士でまとめて「かたまり」にする。かたまりの中に文字の行が
// 3行以上あり、その行の書き出し位置（x）が3列以上に分かれているものを図・表とみなす。
// 文章を枠で囲んだだけのもの（書き出し位置がそろっている）は図にしない（文字で読めるため）。
// 図とみなした範囲の行は文字としては出さず、範囲を画像にする（呼び出し側）。

function union(a, b) {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}
function near(a, b, gap) {
  return a[0] - gap <= b[2] && b[0] - gap <= a[2] && a[1] - gap <= b[3] && b[1] - gap <= a[3];
}
function inside(bbox, r, pad = 1) {
  const cx = (bbox[0] + bbox[2]) / 2;
  const cy = (bbox[1] + bbox[3]) / 2;
  return cx >= r[0] - pad && cx <= r[2] + pad && cy >= r[1] - pad && cy <= r[3] + pad;
}

/** drawings をかたまりにまとめる（近さ gap pt 以内）。ページ全体を囲むような大きな枠は除く。 */
export function drawingClusters(drawings, page, gap = 6) {
  const rects = drawings
    .map((d) => d.rect)
    .filter((r) => r[2] - r[0] < page.width * 0.95 || r[3] - r[1] < page.height * 0.9);
  const clusters = [];
  for (const r of rects) {
    let merged = r;
    for (let i = clusters.length - 1; i >= 0; i--) {
      if (near(clusters[i], merged, gap)) {
        merged = union(clusters[i], merged);
        clusters.splice(i, 1);
      }
    }
    clusters.push(merged);
  }
  // まとめた結果どうしがさらに近いことがあるので、変わらなくなるまで繰り返す
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < clusters.length && !changed; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (near(clusters[i], clusters[j], gap)) {
          clusters[i] = union(clusters[i], clusters[j]);
          clusters.splice(j, 1);
          changed = true;
          break;
        }
      }
    }
  }
  return clusters;
}

/**
 * 図・表の範囲を返す。lines は本文の行（ページ付属物を除いたもの）。
 * 戻り値: [{ rect, lineIndexes }]
 */
export function findFigures(page, lines) {
  const out = [];
  for (const c of drawingClusters(page.drawings, page)) {
    if (c[2] - c[0] < 40 || c[3] - c[1] < 20) continue; // 小さすぎる線（下線・矢印だけ）は図にしない
    const idx = [];
    lines.forEach((l, i) => {
      if (l.text.trim() !== "" && inside(l.bbox, c)) idx.push(i);
    });
    if (idx.length < 3) continue;
    const columns = new Set(idx.map((i) => Math.round(lines[i].bbox[0] / 20)));
    if (columns.size < 3) continue;
    out.push({ rect: c.map((v) => Math.round(v * 10) / 10), lineIndexes: idx });
  }
  return out;
}
