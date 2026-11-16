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
// 判定の結論（「∴ 納税義務あり」など）。対になる言い方が決まっているものだけを選択で採点する。
export const JUDGEMENT_PAIRS = [
  ["納税義務あり", "納税義務なし"],
  ["該当する", "該当しない"],
  ["適用あり", "適用なし"],
  ["少額特例適用あり", "少額特例適用なし"],
  ["按分必要", "全額控除"],
  ["満たす", "満たさない"],
  ["個別対応方式", "一括比例配分方式"],
];

// 日付の答え（「令和８年４月１日から令和９年３月31日まで」「令和６年４月１日～令和７年３月31日」「令和８年４月１日」）
const DATE = "令和\\s*([0-9０-９]+|元)\\s*年\\s*([0-9０-９]+)\\s*月\\s*([0-9０-９]+)\\s*日";
const DATE_RANGE = new RegExp(`${DATE}\\s*(?:から|～|〜|－|-)\\s*${DATE}\\s*(?:まで)?`);
const DATE_ONE = new RegExp(DATE);
const num = (s) => (s === "元" ? 1 : Number(toHalf(s)));

/**
 * 1行の日付の答えを読む。行頭の「第33期：」「〔問１〕」などは名前（prefix）にする。「※」の行（途中の計算）は読まない。
 * 戻り値: { prefix, raw, kind: "dateRange" | "date", values: [年,月,日(,年,月,日)] } | null
 */
export function dateAnswerFrom(text) {
  const t = text.trim();
  if (/^※/.test(t)) return null;
  const r = t.match(DATE_RANGE);
  const one = r ? null : t.match(DATE_ONE);
  const m = r ?? one;
  if (!m) return null;
  const prefix = t.slice(0, m.index).replace(/[：:\s]+$/, "").trim();
  const after = t.slice(m.index + m[0].length).trim();
  if (after && !/^[。、）)]?$/.test(after)) return null; // 日付の後に文が続くもの（説明の中の日付）は答えにしない
  const values = (r ? [r[1], r[2], r[3], r[4], r[5], r[6]] : [one[1], one[2], one[3]]).map(num);
  return { prefix, raw: m[0].replace(/\s+/g, ""), kind: r ? "dateRange" : "date", values };
}

// 決まった組に無い結論でも、言い方から選択肢を作れるもの:
//   「著しい変動（増加／減少）に該当する」「著しい変動に該当しない」 → 3つ
//   「１年以内」「１年超２年以内」「２年超３年以内」 → 3つ
//   「○○に該当する／しない」「○○適用あり／なし」 → 2つ（○○に「、」などが無い短い言い方だけ）
const SIGNIFICANT_CHANGE = ["著しい変動（増加）に該当する", "著しい変動（減少）に該当する", "著しい変動に該当しない"];
const HOLDING_PERIOD = ["１年以内", "１年超２年以内", "２年超３年以内"];
function normalizeJudgement(said) {
  return said.replace(/\(/g, "（").replace(/\)/g, "）").replace(/[。]$/, "");
}
function derivedOptions(said) {
  const t = normalizeJudgement(said);
  if (SIGNIFICANT_CHANGE.includes(t)) return SIGNIFICANT_CHANGE;
  if (HOLDING_PERIOD.includes(t)) return HOLDING_PERIOD;
  if (/[、。，\s）]/.test(t) || /^(いずれも|すべて|全て)/.test(t)) return null;
  let m = t.match(/^(.{2,20})に該当(する|しない)$/);
  if (m) return [`${m[1]}に該当する`, `${m[1]}に該当しない`];
  m = t.match(/^(.{1,20})適用(あり|なし)$/);
  if (m) return [`${m[1]}適用あり`, `${m[1]}適用なし`];
  return null;
}

/** 行の並びから、最後の「∴ 結論」を読む。対の言い方に当てはまれば選択肢つきで返す。 */
export function judgementFrom(texts) {
  for (let i = texts.length - 1; i >= 0; i--) {
    const m = texts[i].match(/∴\s*(.+?)\s*[。]?\s*$/);
    if (!m) continue;
    const said = m[1].trim();
    if (new RegExp(`^${AMOUNT.source}$`).test(said)) return null; // 結論が金額のものは金額の段階として扱う
    const pair = JUDGEMENT_PAIRS.find((p) => p.includes(said)) ?? derivedOptions(said);
    if (!pair) return { raw: said, options: null, correct: null };
    const correct = normalizeJudgement(said);
    return { raw: said, options: pair, correct: pair.includes(correct) ? correct : said };
  }
  return null;
}

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
    const hasContent = !onlySubHeadings && (Boolean(expectedRaw) || work.length > 0 || (itemStyle && rest) || Boolean(s.heading && rest.includes("∴")));
    // Ⅰ・１・【 】の見出しに入ったら、前の前置きはもう使わない
    if (s.heading && s.heading.marker.kind !== "paren-number") groupLabel = null;
    if (!hasContent) {
      // 子の見出しを持つだけの見出し（Ⅰ…の計算 など）
      groupLabel = [s.heading ? lineText(s.heading) : plainHeading, ...(onlySubHeadings ? work.map(lineText) : [])].filter(Boolean).join(" ");
      continue;
    }
    // 金額が無い区切りでは、日付の答えを段階にする（1行に1つ。複数あれば行ごとに段階を分ける）
    if (!expectedRaw) {
      const headingDate = s.heading ? dateAnswerFrom(lineText(s.heading).slice(s.heading.marker.raw.length)) : null;
      const dates = [...(headingDate ? [headingDate] : []), ...s.lines.map((l) => dateAnswerFrom(lineText(l))).filter(Boolean)];
      if (dates.length > 0) {
        const baseLabel = s.heading ? s.heading.marker.raw + (headingDate ? "" : " " + headingRest(s.heading)) : plainHeading;
        for (const d of dates) {
          steps.push({
            groupLabel: s.heading?.marker.kind === "paren-number" ? groupLabel : null,
            headingLine: s.heading,
            labelRaw: [baseLabel, d.prefix].filter(Boolean).join(" ").trim() || "日付",
            expected: { raw: d.raw, kind: d.kind, values: d.values, how: "date" },
            judgement: null,
            answerTextRaw: null,
            workLines: s.lines.filter((l) => !dateAnswerFrom(lineText(l))),
          });
        }
        continue;
      }
    }
    const value = parseAmount(expectedRaw);
    // 判定の結論（見出しの行に入っていることもある）
    const judgement = judgementFrom([...(s.heading ? [lineText(s.heading)] : []), ...texts]);
    let labelRaw = s.heading ? lineText(s.heading) : null;
    // 見出しの行に計算式と答えが入っている（「(3) (1)＋(2)＝79,850,000」）ときは、「＝」より前だけを名前にし、
    // 見出しの行そのものは計算式として解説に回す
    let headingIsWork = false;
    // 名前に結論（「∴ …」）が入っていたら、答えになるので外す
    if (labelRaw && labelRaw.includes("∴")) {
      labelRaw = labelRaw.slice(0, labelRaw.indexOf("∴")).trim();
      headingIsWork = true;
    }
    if (labelRaw && labelRaw.includes("＝")) {
      labelRaw = labelRaw.slice(0, labelRaw.indexOf("＝")).trim();
      headingIsWork = true;
    }
    // 名前に残ったのが計算式そのもの（金額を含む）なら、計算の仕方を明かしてしまうので記号だけにする
    if (headingIsWork && s.heading && /[0-9０-９]{2,}/.test(labelRaw.slice(s.heading.marker.raw.length))) {
      labelRaw = s.heading.marker.raw;
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
      // 判定の結論。options があるものは選択で採点、無いものは表示だけ
      judgement,
      // 金額が決まらないときの答えの文（取引ごとの形の「不課税売上げ」など）。採点はしない
      answerTextRaw: value == null && itemStyle ? rest || null : null,
      // 取引ごとの形では、見出しの行（答えと計算式）も解説として見せる
      workLines: (itemStyle || headingIsWork) && s.heading ? [s.heading, ...work] : work,
    });
  }
  // 同じ名前の段階が続く（「〔問２〕」の期間が3つ など）ときは、順番が分かるよう「（1つ目）」を付ける
  const counts = new Map();
  for (const st of steps) counts.set(st.labelRaw, (counts.get(st.labelRaw) ?? 0) + 1);
  const seen = new Map();
  for (const st of steps) {
    if ((counts.get(st.labelRaw) ?? 0) < 2) continue;
    const k = (seen.get(st.labelRaw) ?? 0) + 1;
    seen.set(st.labelRaw, k);
    st.labelRaw = `${st.labelRaw}（${k}つ目）`;
  }
  return steps;
}
