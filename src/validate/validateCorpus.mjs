// 生成された中間JSON（Groupツリー）に対する最低限の妥当性検証。
// Parserのロジックを変更するものではなく、生成結果を検査するだけの独立したチェッカーである。

function walkGroups(groups, visit, ancestors = []) {
  for (const g of groups) {
    visit(g, ancestors);
    for (const cb of g.checkBlocks) {
      visit(cb, [...ancestors, g], "checkBlock");
      for (const q of cb.questions) {
        visit(q, [...ancestors, g], "question");
        for (const it of q.items) {
          visit(it, [...ancestors, g], "item");
        }
      }
    }
    walkGroups(g.children, visit, [...ancestors, g]);
  }
}

function collectAllItems(groups) {
  const items = [];
  function walk(gs, ancestors) {
    for (const g of gs) {
      const nextAncestors = { ...ancestors, [g.parsed.kind]: g };
      for (const cb of g.checkBlocks) {
        for (const q of cb.questions) {
          for (const it of q.items) {
            // group: このItemが直接属するGroup（Topic粒度が無い教材ではSection/Themeになりうる）。
            // answer-source-reused-across-topicsチェックのTopicスコープキーとして使う。
            items.push({ item: it, question: q, checkBlock: cb, group: g, ancestors: nextAncestors });
          }
        }
      }
      walk(g.children, nextAncestors);
    }
  }
  walk(groups, {});
  return items;
}

function collectAllIds(groups) {
  const ids = [];
  function walk(gs) {
    for (const g of gs) {
      ids.push(["group", g.id]);
      for (const cb of g.checkBlocks) {
        ids.push(["checkBlock", cb.id]);
        for (const q of cb.questions) {
          ids.push(["question", q.id]);
          for (const it of q.items) ids.push(["item", it.id]);
        }
      }
      walk(g.children);
    }
  }
  walk(groups);
  return ids;
}

function isValidSource(source) {
  return Boolean(source && source.documentId && source.locator);
}

// 候補2: 解答出典位置の複数Topic間再利用検出（docs/misattribution_detection_design.md 2章）。
// 同一の解答出典位置（source locator = page+block）が、異なるTopic（直近の所属Group、
// Group IDで比較する）に属する複数Itemから参照されている場合に警告する。
// この教材では1つの物理的な解答ブロックが正しく複数のTopicに属することは想定されないため、
// 出現自体が構造的な異常のシグナルとなる。
// 除外条件: 同一Topic内での共有（空欄記号の複数参照等）は正当なため対象外。
// severityは常にwarning（Topicが未確定/不明瞭なケースを含め、errorにはしない）。
// Parser本体の対応付けロジック（buildCorpus.mjs）は再実行せず、groups単体から独立に検査する。
function normalizeTopicTitle(title) {
  return title ? title.trim().replace(/\s+/g, " ") : null;
}

function topicScopeKeyOf(entry) {
  if (entry.group?.id) return `id:${entry.group.id}`;
  return `title:${normalizeTopicTitle(entry.group?.parsed?.title)}`;
}

function findAnswerSourceReuseAcrossTopics(items) {
  const bySourceLocator = new Map();
  for (const entry of items) {
    // source page/block（locatorに両方含まれる）を比較キーとする。ItemIDや生成順には依存しない。
    const locator = entry.item.raw.answers[0]?.text.source?.locator;
    if (!locator) continue; // 解答が空の場合はanswer-linkageチェックの対象であり、ここでは扱わない
    if (!bySourceLocator.has(locator)) bySourceLocator.set(locator, []);
    bySourceLocator.get(locator).push(entry);
  }

  const issues = [];
  for (const [locator, entries] of bySourceLocator) {
    const distinctScopes = new Set(entries.map(topicScopeKeyOf));
    if (distinctScopes.size < 2) continue; // 同一Topic内での共有は正当なため対象外

    issues.push({
      check: "answer-source-reused-across-topics",
      severity: "warning",
      answerSourceLocator: locator,
      shareCount: entries.length,
      items: entries.map((e) => ({
        itemId: e.item.id,
        topicId: e.group?.id ?? null,
        topicTitle: e.group?.parsed?.title ?? null,
        topicUncertain: e.group?.parsed?.kind !== "topic",
        theme: e.ancestors.theme?.parsed?.title ?? null,
        section: e.ancestors.section?.parsed?.title ?? null,
        questionLabel: e.question.raw.text,
      })),
      topics: [...new Set(entries.map((e) => e.group?.parsed?.title ?? "(不明)"))],
      reason: "同一の解答出典位置が異なるTopicに属する複数Itemから参照されている",
    });
  }
  return issues;
}

export function validateCorpus(groups) {
  const issues = [];
  const items = collectAllItems(groups);

  // 1. 問題に回答が紐づいているか
  for (const { item } of items) {
    if (!item.raw.answers || item.raw.answers.length === 0) {
      issues.push({ check: "answer-linkage", itemId: item.id, detail: "raw.answersが空（解答が紐づいていない）" });
    }
  }

  // 2. trueFalseの回答が○、〇、×のいずれかになっているか
  for (const { item } of items) {
    for (const p of item.presentations) {
      if (p.type === "trueFalse") {
        const ans = item.parsed?.answers?.[0]?.text;
        if (!ans || !["○", "〇", "×"].includes(ans)) {
          issues.push({ check: "truefalse-symbol", itemId: item.id, detail: `trueFalseの回答値が想定外: ${JSON.stringify(ans)}` });
        }
      }
    }
  }

  // 3. fillBlankのblankLabelと本文中の空欄が対応しているか
  for (const { item } of items) {
    for (const p of item.presentations) {
      if (p.type === "fillBlank") {
        const qtext = item.parsed?.questionText ?? "";
        if (!qtext.includes(p.blankLabel)) {
          issues.push({
            check: "fillblank-label-correspondence",
            itemId: item.id,
            detail: `blankLabel「${p.blankLabel}」が本文中に見つからない`,
          });
        }
      }
    }
  }

  // 4. 同じ安定IDが重複していないか
  const idList = collectAllIds(groups);
  const seen = new Map();
  for (const [kind, id] of idList) {
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  for (const [id, count] of seen) {
    if (count > 1) {
      issues.push({ check: "duplicate-id", itemId: id, detail: `ID「${id}」が${count}回出現している` });
    }
  }

  // 5. rawの出典位置が欠落していないか
  walkGroups(groups, (node, _ancestors, kind) => {
    if (node.raw?.source && !isValidSource(node.raw.source)) {
      issues.push({ check: "missing-source", itemId: node.id, detail: `${kind ?? "group"}のraw.sourceが不正` });
    }
  });
  for (const { item } of items) {
    for (const q of item.raw.question ?? []) {
      if (!isValidSource(q.source)) {
        issues.push({ check: "missing-source", itemId: item.id, detail: "raw.question[].sourceが不正/欠落" });
      }
    }
    for (const a of item.raw.answers ?? []) {
      if (!isValidSource(a.text?.source)) {
        issues.push({ check: "missing-source", itemId: item.id, detail: "raw.answers[].text.sourceが不正/欠落" });
      }
    }
  }

  // 6. 解答出典位置が異なるTopic間で再利用されていないか（候補2、warning）
  issues.push(...findAnswerSourceReuseAcrossTopics(items));

  return issues;
}
