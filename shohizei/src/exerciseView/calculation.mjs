// トレーニングの計算問題 → 段階ごとに金額を入力する問題（exerciseType: calculation_steps）。
//
// ユーザーの選択（2026-11-17）: 段階ごとに金額を入力して自動で答え合わせ。全部合って正解。
//
// 解答の行を「見出し」で区切り、見出しごとに正解の金額を1つ決める。見出しになるのは
// 行頭記号（１ 、Ⅰ 、【 】、(1) ）のある行。金額は次の順で決める（推測で作らない）:
//   1. 答案用紙の「金額」欄（「40,568,000円」だけの行）
//   2. 計算式の行の最後の「→ 金額」、無ければ最後の「＝ 金額」
//   3. (1) の行が「(1)  60,000」のように金額だけのとき、その金額
// 金額が決まらない見出しは、答えの文（例: 「不課税売上げ」）を表示だけする段階にする（採点しない）。
// 子の見出しを持つだけの見出し（例:「Ⅰ 課税標準額に対する消費税額の計算」）は段階にせず、
// 次の段階の見出しの前置き（groupLabel）にする。

const toHalf = (t) => t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

// 数字の並び（桁区切り・小数点つき）。先頭の△はマイナス（還付など）。
const AMOUNT = /△?\s*[0-9０-９][0-9０-９,，]*(?:[.．][0-9０-９]+)?/;

export function parseAmount(raw) {
  if (raw == null) return null;
  const t = toHalf(String(raw)).replace(/[,，\s円]/g, "").replace(/．/g, ".");
  const m = t.match(/^(△|-|－)?(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const v = Number(m[2]);
  return m[1] ? -v : v;
}

function lineText(l) {
  return (l.segments ? l.segments.map((s) => (s.kind === "fraction" ? `${s.numerator}/${s.denominator}` : s.text)).join("") : l.text).trim();
}

const BOX_AMOUNT = new RegExp(`^(${AMOUNT.source})\\s*円$`);
const FORM_NOISE = /^(金|額|計\s*算\s*過\s*程.*)$/;

function amountFromCalcLine(text) {
  const arrow = text.lastIndexOf("→");
  const eq = text.lastIndexOf("＝");
  const from = arrow > eq ? arrow : eq;
  if (from === -1) return null;
  const m = text.slice(from + 1).match(AMOUNT);
  return m ? m[0].replace(/\s/g, "") : null;
}

function isHeading(line) {
  const k = line.marker?.kind;
  return k === "number" || k === "roman" || k === "bracket-heading" || k === "paren-number" || k === "sub-question";
}

/** 見出しの行から、記号の後ろの文（見出し名、または「(1)  60,000」の金額部分）を取り出す。 */
function headingRest(line) {
  return lineText(line).slice(line.marker.raw.length).trim();
}

/**
 * @param answerLines 解答の行
 * @param questionItems 問題文の (n) の行（番号 → 行の文）。取引ごとに金額を答える形のとき、段階の名前に使う
 */
export function buildCalculationSteps(answerLines, questionItems = new Map()) {
  // 取引ごとの形: 解答が (1)(2)… だけで並んでいる（Ⅰ・１・【 】の見出しが無い）。
  // このとき (n) の行の残り（金額や「不課税売上げ」）は答えなので、段階の名前には出さず、
  // 問題文の (n) の文を名前にする。
  // さらに、解答の (n) の番号が問題文の (n) とほぼ一致すること（3つ以上、問題文の8割以上）。
  // 「(1) 課税仕入れ」「(2) 課税貨物」のような解答の小見出しを取引と取り違えないため。
  const headingKinds = new Set(answerLines.filter(isHeading).map((l) => l.marker.kind));
  const answerNos = answerLines
    .filter((l) => l.marker?.kind === "paren-number")
    .map((l) => Number(toHalf(l.marker.raw).replace(/\D/g, "")));
  const itemStyle =
    headingKinds.size === 1 &&
    headingKinds.has("paren-number") &&
    answerNos.length >= 3 &&
    answerNos.every((n) => questionItems.has(n)) &&
    answerNos.length >= questionItems.size * 0.8;

  const sections = [];
  let cur = null;
  for (const l of answerLines) {
    // ページをまたいだ「【控除対象仕入税額】（続き）」は、前の区切りの続き
    if (isHeading(l) && cur && /（続き）\s*$/.test(lineText(l))) continue;
    if (isHeading(l)) {
      cur = { heading: l, lines: [] };
      sections.push(cur);
    } else if (cur) cur.lines.push(l);
    else {
      cur = { heading: null, lines: [l] };
      sections.push(cur);
    }
  }

  const steps = [];
  let groupLabel = null;
  for (const s of sections) {
    const texts = s.lines.map(lineText);
    // 「金額」欄が複数あるとき（ページをまたいだ続きなど）は最後のもの
    const box = texts.map((t) => t.match(BOX_AMOUNT)).filter(Boolean).slice(-1)[0];
    // 正解の候補にする計算式: 「※１ …」のような注記の検算は除き、「→」（端数処理の後）がある行を優先する
    const calcLines = texts.filter((t) => t.includes("＝") && !/^※/.test(t));
    const arrowLines = calcLines.filter((t) => t.includes("→"));
    let expectedRaw = null;
    let how = null;
    // 結論の行（「(3)＞(4)  ∴  91,260,000」）の金額
    const conclusion = texts
      .map((t) => t.match(new RegExp(`∴\\s*(${AMOUNT.source})\\s*$`)))
      .filter(Boolean)
      .slice(-1)[0];
    if (box) {
      expectedRaw = box[1].replace(/\s/g, "");
      how = "box";
    } else if (conclusion) {
      expectedRaw = conclusion[1].replace(/\s/g, "");
      how = "conclusion";
    } else if (calcLines.length) {
      expectedRaw = amountFromCalcLine((arrowLines.length ? arrowLines : calcLines).slice(-1)[0]);
      how = expectedRaw ? "calc" : null;
    }
    // 計算式も「金額」欄も無く、金額だけの行がある（「(2) 課税貨物」の次の行が「3,120,000」）
    if (!expectedRaw) {
      const bare = texts.filter((t) => new RegExp(`^${AMOUNT.source}$`).test(t));
      if (bare.length) {
        expectedRaw = bare[bare.length - 1].replace(/\s/g, "");
        how = "bare";
      }
    }
    // 見出しの記号が無い区切り（解答の先頭の「課税標準額」など）は、先頭の短い文の行を見出しとして扱う
    let plainHeading = null;
    if (!s.heading && texts.length && !texts[0].includes("＝") && texts[0].length <= 30 && !new RegExp(`^${AMOUNT.source}$`).test(texts[0])) {
      plainHeading = texts[0];
    }
    const rest = s.heading ? headingRest(s.heading) : "";
    // 「(1)  60,000」「(13) 76,540,000－3,640,000＝72,900,000」のように見出しの行そのものに答えがある
    if (!expectedRaw && itemStyle && rest) {
      if (rest.includes("＝")) {
        expectedRaw = amountFromCalcLine(rest);
        how = "calc";
      } else {
        const m = rest.match(new RegExp(`^(${AMOUNT.source})(?:\\s|$)`));
        if (m) {
          expectedRaw = m[1].replace(/\s/g, "");
          how = "inline";
        }
      }
    }
    // 「(3) (1)＋(2)＝79,850,000」のように見出しの行に計算式があり、ほかに金額が無いとき
    if (!expectedRaw && s.heading && rest.includes("＝")) {
      expectedRaw = amountFromCalcLine(rest);
      how = expectedRaw ? "calc" : null;
    }
    const work = s.lines.filter(
      (l, idx) => !(plainHeading && idx === 0) && !FORM_NOISE.test(lineText(l)) && !BOX_AMOUNT.test(lineText(l)),
    );
    // 金額が無く、中身が「〔…〕」の小見出しだけの区切りは、子の段階の前置きとして扱う
    const onlySubHeadings = !expectedRaw && work.length > 0 && work.every((l) => /^〔[^〕]*〕$/.test(lineText(l)));
    const hasContent = !onlySubHeadings && (Boolean(expectedRaw) || work.length > 0 || (itemStyle && rest));
    // Ⅰ・１・【 】の見出しに入ったら、前の前置きはもう使わない
    if (s.heading && s.heading.marker.kind !== "paren-number") groupLabel = null;
    if (!hasContent) {
      // 子の見出しを持つだけの見出し（Ⅰ…の計算 など）
      groupLabel = [s.heading ? lineText(s.heading) : plainHeading, ...(onlySubHeadings ? work.map(lineText) : [])].filter(Boolean).join(" ");
      continue;
    }
    const value = parseAmount(expectedRaw);
    let labelRaw = s.heading ? lineText(s.heading) : null;
    // 見出しの行に計算式と答えが入っている（「(3) (1)＋(2)＝79,850,000」）ときは、「＝」より前だけを名前にし、
    // 見出しの行そのものは計算式として解説に回す
    let headingIsWork = false;
    if (labelRaw && labelRaw.includes("＝")) {
      labelRaw = labelRaw.slice(0, labelRaw.indexOf("＝")).trim();
      headingIsWork = true;
    }
    if (plainHeading) labelRaw = plainHeading;
    if (itemStyle && s.heading) {
      const no = Number(toHalf(s.heading.marker.raw).replace(/\D/g, ""));
      labelRaw = questionItems.get(no) ?? s.heading.marker.raw;
    }
    steps.push({
      groupLabel: s.heading?.marker.kind === "paren-number" ? groupLabel : null,
      headingLine: s.heading,
      labelRaw,
      expected: value == null ? null : { raw: expectedRaw, value, how },
      // 金額が決まらないときの答えの文（取引ごとの形の「不課税売上げ」など）。採点はしない
      answerTextRaw: value == null && itemStyle ? rest || null : null,
      // 取引ごとの形では、見出しの行（答えと計算式）も解説として見せる
      workLines: (itemStyle || headingIsWork) && s.heading ? [s.heading, ...work] : work,
    });
  }
  return steps;
}
