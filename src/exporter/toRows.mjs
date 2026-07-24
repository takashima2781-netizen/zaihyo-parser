// 中間JSON（Groupツリー）→ 財表DB③形式の行オブジェクト配列への変換。
//
// Group.kindは「theme」「section」「topic」というParserの分類結果（オープンな文字列）であり、
// 固定の3階層を前提にしない。祖先を辿って最も近いkind一致のGroupを探す方式にすることで、
// 階層の深さや有無が変わってもこの変換ロジック自体は壊れないようにしている。
//
// マスターNo./No.は今回のParserがCSVと突き合わせていないため、Exporter側で
// 出力順の連番を仮に割り当てる（既存CSVの実際の値と一致する保証はない）。

import { toHalfWidthAscii } from "../parser/textUtils.mjs";
import { codeToLabel } from "../parser/checkTypeLabels.mjs";

function findAncestorByKind(ancestors, kind) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (ancestors[i].parsed?.kind === kind) return ancestors[i];
  }
  return null;
}

function findAncestorWithImportance(ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (ancestors[i].parsed?.importance != null) return ancestors[i];
  }
  return null;
}

// PDF原文の丸数字(①②③)はCSV側もそのまま丸数字表記だが、
// 段落列挙型の(1)(2)…はCSV側では「-1」「-2」という別表記になっている
// （reference/current_csv/財表DB③...の実データで確認済み）。
// これはraw側を書き換えるのではなく、CSV出力時だけの表記変換として扱う。
function formatSubLabelForCsv(subLabelRaw) {
  const m = subLabelRaw.match(/^\((\d+)\)$/);
  if (m) return `-${m[1]}`;
  return subLabelRaw;
}

function buildRow({ ordinal, ancestors, checkBlock, question, item }) {
  const theme = findAncestorByKind(ancestors, "theme");
  const section = findAncestorByKind(ancestors, "section") ?? findAncestorByKind(ancestors, "topic");
  const importanceHolder = findAncestorWithImportance(ancestors);

  const themeText = theme
    ? `テーマ${theme.parsed.no ?? ""} ${theme.parsed.title ?? ""}`.trim()
    : "";
  const sectionText = section ? [section.parsed.code, section.parsed.title].filter(Boolean).join(" ") : "";
  const importanceText = importanceHolder ? toHalfWidthAscii(importanceHolder.parsed.importance) : "";
  const categoryText = codeToLabel(checkBlock.parsed.checkType) ?? checkBlock.parsed.checkType ?? "";
  const questionLabelText = toHalfWidthAscii(question.raw.text);
  const subLabelText = formatSubLabelForCsv(item.subLabelRaw);
  const answerText = item.parsed.answers.map((a) => a.text).join("／");

  return {
    "マスターNo.": String(ordinal),
    "No.": String(ordinal),
    "テーマ": themeText,
    "項目": sectionText,
    "重要度": importanceText,
    "問題カテゴリー": categoryText,
    "問題番号": questionLabelText,
    "小問": subLabelText,
    "問題文": item.parsed.questionText ?? "",
    "解答": answerText,
    "備考": item.parsed.notes ?? "",
  };
}

export function toRows(groups) {
  const rows = [];
  let ordinal = 0;

  function walk(group, ancestors) {
    const nextAncestors = [...ancestors, group];
    for (const checkBlock of group.checkBlocks) {
      for (const question of checkBlock.questions) {
        for (const item of question.items) {
          ordinal += 1;
          rows.push(buildRow({ ordinal, ancestors: nextAncestors, checkBlock, question, item }));
        }
      }
    }
    for (const child of group.children) walk(child, nextAncestors);
  }

  for (const g of groups) walk(g, []);
  return rows;
}
