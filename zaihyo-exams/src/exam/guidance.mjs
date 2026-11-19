// 解答の後半「解答への道」→ 小問・枝問ごとの解説の行と、選択肢ごとの〇×。
//
// 見出し「問１」「１について」「１(2)及び(3)について」で区切る。行の原文はそのまま持つ。
// 「ア 〇」「エ ×：理由」の行は optionJudgements として別にも持つ（原文の行はブロックにも残す）。

import { contentRows } from "../common/rows.mjs";
import { parseGuidanceHeading, parseOptionJudgement, parseToiHeading } from "./patterns.mjs";

export function buildGuidance(rows, daimonNo) {
  const blocks = [];
  const diag = [];
  let toi = null;
  let block = null;
  const open = (refs, headingRow) => {
    block = { daimon: daimonNo, toi, refs, heading: headingRow ? { text: headingRow.text, source: headingRow.source } : null, rows: [], optionJudgements: [] };
    blocks.push(block);
  };
  let lastJudgement = null;
  for (const r of contentRows(rows)) {
    const th = parseToiHeading(r.text);
    if (th && th.rest === "") {
      toi = th.no;
      open(null, r); // 問の直下（小問の見出しより前）の解説
      lastJudgement = null;
      continue;
    }
    const refs = parseGuidanceHeading(r.text);
    if (refs) {
      open(refs, r);
      lastJudgement = null;
      continue;
    }
    if (!block) open(null, null);
    block.rows.push({ text: r.text, source: r.source, x: r.x });
    const j = parseOptionJudgement(r.text);
    if (j) {
      lastJudgement = { ...j, source: r.source, x: r.x, rows: [{ text: r.text, source: r.source }] };
      block.optionJudgements.push(lastJudgement);
      continue;
    }
    // 理由の続きの行（字下げが深い・「したがって」で始まらない）
    if (lastJudgement && r.x > lastJudgement.x + 3 && !/^[\s　]*したがって/.test(r.text)) {
      lastJudgement.rows.push({ text: r.text, source: r.source });
      if (lastJudgement.reason !== null) lastJudgement.reason += r.text.trim();
      continue;
    }
    lastJudgement = null;
  }
  for (const b of blocks) {
    const seen = new Set();
    for (const j of b.optionJudgements) {
      if (seen.has(j.symbol)) diag.push({ reason: "duplicate-option-judgement", toi: b.toi, refs: b.refs, symbol: j.symbol });
      seen.add(j.symbol);
    }
  }
  return { blocks: blocks.filter((b) => b.rows.length > 0 || b.refs), diag };
}
