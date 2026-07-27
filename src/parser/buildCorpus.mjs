// Step 3〜6: 階層組み立て・問題文/解答の対応付け・parsed生成・unknown/unresolvedの記録。
//
// 重要: このモジュールは「問1だから／問2だから」「基礎知識チェックだから」といった
// 個別の問題内容へのハードコードを一切持たない。判断材料は
//   - 行の役割（classify.mjsが付与したrole）
//   - 本文中に現れたマーカー様式（markerStrategies.mjsが判定するstrategy）
//   - 回答テキストの内容（○/〇/×で始まるかどうか。presentation判定にのみ使う）
// の3つだけであり、これらから機械的に組み立てる。docs/parser_grammar.mdで
// 2箇所以上確認できた3つの一般化ルール（presentation判定への回答内容利用、
// ○/〇の同一視、無マーカー単一Itemフォールバック）のみを実装している。
//
// 質問ページ側の行だけがGroup/CheckBlock/Question/Item.raw.questionを生成し、
// 解答ページ側の行はanswerBlockとしてItem.raw.answersの対応付けにのみ使う。
// これは教材の「見開きで問題と解答が対になる」という物理構造をそのまま反映したルールであり、
// 個別問題へのハードコードではない。質問ページと解答ページの対応はページ番号の+1決め打ちではなく、
// 「質問ページより後で最初にanswerと判定されたページ」をfindAnswerPageで探索して引く
// （classifyPage.mjsによるページ種別判定はcontent-basedであり、偶奇はもはや前提にしない）。
// 複数見開きにまたがる連続入力にも対応できるよう、テーマ/節/項目の状態はquestionBlocks全体を
// 通じて引き継ぐ（実データ調査で、節・項目見出しは区間の先頭にしか現れず、後続ページでは
// 省略されることを確認済み。docs/parser_grammar.md 3.3節参照）。

import { FW_DIGIT } from "./classify.mjs";
import { toHalfWidthDigits, extractFootnoteRefs, detectTrueFalseSymbol } from "./textUtils.mjs";
import { detectStrategy } from "./markerStrategies.mjs";
import { labelToCode } from "./checkTypeLabels.mjs";
import { getGroupAExclusionsForLocator, KNOWN_NORMAL_DUPLICATE_MARKER_LOCATORS } from "./knownMarkerExclusions.mjs";

function numOrNull(s) {
  return s == null ? null : Number(toHalfWidthDigits(s));
}

function makeGroup(nextId, block, parserVersion, kind, fields) {
  return {
    id: nextId("group"),
    raw: { text: block.text, source: block.source },
    parsed: {
      parserVersion,
      confidence: "high",
      notes: null,
      kind,
      no: null,
      code: null,
      title: null,
      importance: null,
      // テーマ見出しはページ上部にランニングヘッダーとして繰り返し印字されるため、
      // 正式な開始行以降に現れた繰り返し出現の生テキストをここに記録する（raw上での喪失を防ぐ）。
      runningHeaderOccurrences: [],
      ...fields,
    },
    children: [],
    checkBlocks: [],
  };
}

function buildPresentation(presentationType, subLabelRaw, hasAnswer) {
  if (presentationType === "fillBlank") {
    return { type: "fillBlank", blankLabel: subLabelRaw, answerRef: hasAnswer ? 1 : -1 };
  }
  if (presentationType === "freeText") {
    return { type: "freeText", answerRefs: hasAnswer ? [1] : [] };
  }
  if (presentationType === "trueFalse") {
    return { type: "trueFalse", answerRef: hasAnswer ? 1 : -1 };
  }
  return { type: presentationType };
}

// ルール1+2: 回答テキストが○/〇/×で始まる場合はtrueFalse候補とする（マーカー様式に関わらず）。
// rawは変更せず、判定結果と分割結果はparsed側にのみ反映する。
// ×の場合に後続する誤り解説文は、既存スキーマのItem.raw.explanation / explanationFootnoteRefsへ振り分ける
// （explanation自体は既存の凍結スキーマに存在するフィールドであり、新規フィールドの追加ではない）。
function classifyAnswer(defaultPresentationType, answerText) {
  if (!answerText) {
    return { presentationType: defaultPresentationType, answerValue: null, explanationText: null };
  }
  const symbol = detectTrueFalseSymbol(answerText);
  if (!symbol) {
    return { presentationType: defaultPresentationType, answerValue: answerText, explanationText: null };
  }
  const rest = answerText.trim().slice(symbol.length).trim();
  return {
    presentationType: "trueFalse",
    answerValue: symbol, // ○/〇/×いずれかの原文字。○と〇の正規化は判定(symbol検出)にのみ適用し、値自体は書き換えない
    explanationText: rest || null,
  };
}

const POSITIONAL_FALLBACK_RULE = "answer-marker-value-positional-pairing";
const FRAGMENT_AGGREGATION_RULE = "answer-fragment-aggregation";

// fallbackInfo.rule別に、raw.answers[0].labelへ記録する出典・判定結果の文字列を組み立てる。
// 候補2(断片集約)は5条件ゲートの個別判定結果（docs/candidate2_safety_design.md）も
// 将来の監査のためlabelへ個別フィールドとして記録する（承認済み要件）。
function buildFallbackLabel(fallbackInfo) {
  if (!fallbackInfo) return null;
  const parts = [`fallback:${fallbackInfo.rule}`, `order=${fallbackInfo.order}`];
  if (fallbackInfo.markerBlockLocator) parts.push(`markerBlock=${fallbackInfo.markerBlockLocator}`);
  if (fallbackInfo.fragmentLocator) parts.push(`fragmentBlock=${fallbackInfo.fragmentLocator}`);
  if (fallbackInfo.checks) {
    const c = fallbackInfo.checks;
    parts.push(`nonEmpty=${c.nonEmpty}`);
    parts.push(`balancedParentheses=${c.balancedParentheses}`);
    parts.push(`startsWithParticle=${c.startsWithParticle}`);
    parts.push(`endsWithComma=${c.endsWithComma}`);
    parts.push(`startsWithMarkerLikeSymbol=${c.startsWithMarkerLikeSymbol}`);
  }
  return parts.join(";");
}

function buildFallbackNotes(fallbackInfo) {
  if (!fallbackInfo) return null;
  if (fallbackInfo.rule === FRAGMENT_AGGREGATION_RULE) {
    return `断片集約（${fallbackInfo.order}番目、5条件ゲート通過）により解決した(fallback: ${fallbackInfo.rule})。断片出典: ${fallbackInfo.fragmentLocator}`;
  }
  return `マーカーのみブロックと値のみブロックの位置対応（${fallbackInfo.order}番目）により解決した(fallback: ${fallbackInfo.rule})。マーカー出典: ${fallbackInfo.markerBlockLocator}`;
}

function addItem({
  question,
  subLabelRaw,
  questionText,
  questionSource,
  answerText,
  answerSource,
  defaultPresentationType,
  parserVersion,
  nextId,
  flagUnresolved,
  answerLocatorForWarning,
  confidenceOverride,
  notesOverride,
  fallbackInfo,
  sharedBodyBlankPosition,
}) {
  if (!answerText) {
    flagUnresolved(answerLocatorForWarning, `小問${subLabelRaw ?? "(無マーカー)"}に対応する解答が見つからなかった`);
  }

  const { presentationType, answerValue, explanationText } = classifyAnswer(defaultPresentationType, answerText);

  // フォールバック（候補1/候補2）が適用された場合、raw側に「出典／対応順序／適用ルール名／
  // (候補2の場合)5条件ゲートの個別判定結果」を記録する（既存RawAnswerRow.labelを転用。新規スキーマ追加はしない）。
  const answerLabel = buildFallbackLabel(fallbackInfo);

  const item = {
    id: nextId("item"),
    subLabelRaw,
    masterNo: null,
    raw: {
      question: [{ text: questionText, source: questionSource }],
      answers: answerText
        ? [{ text: { text: answerText, source: answerSource }, fragments: null, label: answerLabel }]
        : [],
      explanation: explanationText ? { text: explanationText, source: answerSource } : null,
    },
    parsed: {
      parserVersion,
      confidence: confidenceOverride ?? (answerText ? "high" : "low"),
      notes:
        notesOverride ??
        (fallbackInfo
          ? buildFallbackNotes(fallbackInfo)
          : answerText
            ? null
            : "対応する解答が見つからなかった"),
      questionText,
      questionTextVariants: null,
      questionFootnoteRefs: extractFootnoteRefs(questionText),
      answers: answerValue
        ? [{ order: 1, text: answerValue, rawIndex: 0, footnoteRefs: extractFootnoteRefs(answerValue) }]
        : [],
      explanationFootnoteRefs: explanationText ? extractFootnoteRefs(explanationText) : null,
      // shared_body_blanks向け(docs/phase2c_blank_position_schema_design.md): 共有本文
      // (questionText)中で、この空欄が実際に占める文字位置。inline-shared経路以外では常にnull。
      sharedBodyBlankPosition: sharedBodyBlankPosition ?? null,
    },
    presentations: [buildPresentation(presentationType, subLabelRaw, Boolean(answerText))],
  };
  question.items.push(item);
}

// inline-shared本文中に出現する丸数字マーカーから、実際に空欄としてItem化すべき
// ラベル列を求める。単純な出現順のリストではなく、以下の2段階の処理を行う：
//
// 1. GROUP_A_MARKER_EXCLUSIONS（原本PDF目視確認済みの4箇所9マーカー）に一致する
//    出現は、箱囲みのない箇条書き見出しラベルであり空欄ではないため除外する。
//    周辺文脈が想定と一致しない場合は補正を適用せず例外を投げて停止する（fail-closed）。
//    定義された除外が1件でも本文中に見つからなかった場合も、想定との乖離とみなし停止する。
// 2. 除外後もなお同一マーカーが複数回残る場合（教材が同じ空欄・同じ正答を本文中で
//    意図的に複数回参照する、正常な構成。docs/phase2c_pdf_visual_verification.md
//    グループB参照）、既知の正常出典（KNOWN_NORMAL_DUPLICATE_MARKER_LOCATORS）に
//    含まれるlocatorであればそのまま処理し、含まれない場合は「未知の重複パターン」
//    としてflagUnresolvedへ警告を記録する（Itemの生成自体は妨げない）。
//
// 戻り値は { label, index, length } の配列（bodyText上の出現順を維持）。
// index/lengthは、docs/phase2c_blank_position_schema_design.mdの設計に基づき、
// HTML側がbodyTextを再解析・再判定せずに空欄位置を復元できるよう、この時点で
// 既に確定している位置情報をそのまま保持する（新しい判定ロジックの追加ではない。
// GroupA除外判定が既に内部で使っているmatchAllの出現位置を、捨てずに運ぶだけ）。
function resolveInlineSharedLabels({ bodyText, bodySource, strategy, flagUnresolved }) {
  strategy.detectRegex.lastIndex = 0;
  const rawMatches = [...bodyText.matchAll(strategy.detectRegex)];
  const locator = bodySource.locator;
  const exclusions = getGroupAExclusionsForLocator(locator);
  const appliedExclusionKeys = new Set();
  const occurrenceCountByMarker = new Map();
  const blanks = [];

  for (const m of rawMatches) {
    const marker = m[0];
    const occurrenceIndex = (occurrenceCountByMarker.get(marker) ?? 0) + 1;
    occurrenceCountByMarker.set(marker, occurrenceIndex);

    const exclusion = exclusions.find((e) => e.marker === marker && e.occurrenceIndex === occurrenceIndex);
    if (exclusion) {
      const start = Math.max(0, m.index - exclusion.contextRadius);
      const end = m.index + marker.length + exclusion.contextRadius;
      const actualContext = bodyText.slice(start, end);
      if (actualContext !== exclusion.expectedContext) {
        throw new Error(
          `[GroupA見出し除外:fail-closed] ${locator} の${marker}(${occurrenceIndex}回目)を見出し由来として` +
            `除外しようとしたが、周辺文脈が想定と一致しなかった。想定: "${exclusion.expectedContext}" ` +
            `実際: "${actualContext}"。原本の抽出結果がこの補正定義の想定と乖離している可能性があるため、` +
            `誤った除外を適用せず処理を停止する。src/parser/knownMarkerExclusions.mjsを確認すること。`
        );
      }
      appliedExclusionKeys.add(`${marker}#${occurrenceIndex}`);
      continue;
    }
    blanks.push({ label: marker, index: m.index, length: marker.length });
  }

  if (appliedExclusionKeys.size !== exclusions.length) {
    const missing = exclusions.filter((e) => !appliedExclusionKeys.has(`${e.marker}#${e.occurrenceIndex}`));
    throw new Error(
      `[GroupA見出し除外:fail-closed] ${locator} に対して定義された除外(${exclusions.length}件)のうち` +
        `${missing.length}件が本文中に見つからなかった（想定: ${missing
          .map((e) => `${e.marker}(${e.occurrenceIndex}回目)`)
          .join(", ")}）。原本の抽出結果がこの補正定義の想定と乖離している可能性があるため処理を停止する。`
    );
  }

  const finalCounts = new Map();
  for (const b of blanks) finalCounts.set(b.label, (finalCounts.get(b.label) ?? 0) + 1);
  const duplicatedLabels = [...finalCounts.entries()].filter(([, count]) => count > 1).map(([label]) => label);
  if (duplicatedLabels.length > 0 && !KNOWN_NORMAL_DUPLICATE_MARKER_LOCATORS.has(locator)) {
    flagUnresolved(
      locator,
      `本文中でマーカー「${duplicatedLabels.join("、")}」が複数回出現した。既知の正常な意図的重複` +
        `（docs/phase2c_pdf_visual_verification.md グループB）にも、既知の見出し由来の除外定義` +
        `（GroupA）にも一致しない未知のパターンのため、人手確認が必要（Itemは通常どおり生成済み）`
    );
  }

  // fail-closed(docs/phase2c_blank_position_schema_design.md §7・ユーザー指示): 位置情報自体の
  // 整合性を検証する。ここを通過しなければ、HTML側が信頼して使える位置情報とはみなさない。
  let previousEnd = -1;
  const seenPositions = new Set();
  for (const b of blanks) {
    if (b.length <= 0) {
      throw new Error(`[空欄位置:fail-closed] ${locator} の${b.label}: lengthが0以下(${b.length})。`);
    }
    if (b.index < 0 || b.index + b.length > bodyText.length) {
      throw new Error(
        `[空欄位置:fail-closed] ${locator} の${b.label}: index(${b.index})が本文範囲外（本文長${bodyText.length}）。`
      );
    }
    const actualChar = bodyText.slice(b.index, b.index + b.length);
    if (actualChar !== b.label) {
      throw new Error(
        `[空欄位置:fail-closed] ${locator} の${b.label}: 該当位置(${b.index})の文字列が` +
          `ラベルと一致しない（実際: "${actualChar}"）。`
      );
    }
    const posKey = `${b.index}:${b.length}`;
    if (seenPositions.has(posKey)) {
      throw new Error(`[空欄位置:fail-closed] ${locator} の${b.label}: 位置(${b.index})が他の空欄と重複している。`);
    }
    seenPositions.add(posKey);
    if (b.index < previousEnd) {
      throw new Error(
        `[空欄位置:fail-closed] ${locator} の${b.label}: 位置順(${b.index})がItem生成順と対応していない` +
          `（直前の空欄の終端${previousEnd}より前に出現している）。`
      );
    }
    previousEnd = b.index + b.length;
  }

  return blanks;
}

function buildItemsForQuestion({
  strategy,
  bodyText,
  bodySource,
  question,
  questionLabelRaw,
  questionMarkers,
  ansBlock,
  ansPage,
  answerPageBlocksByPage,
  parserVersion,
  nextId,
  flagUnresolved,
}) {
  const ansPairs = ansBlock ? [...ansBlock.text.matchAll(strategy.pairRegex)] : [];
  if (ansBlock) {
    const trailingNote = ansBlock.text.match(/※.+$/);
    if (trailingNote) {
      flagUnresolved(
        ansBlock.source.locator,
        `解答欄末尾の注記「${trailingNote[0]}」がどのItemの解説に属するか自動判定できなかった`
      );
    }
  }
  const answerLocatorForWarning = ansBlock ? ansBlock.source.locator : bodySource.locator;

  // 候補1フォールバック: 通常のansPairsで値が見つからなかった場合にのみ、このMapを参照する
  // （通常処理で既に解答が取得できているマーカーを上書きすることは一切しない）。
  const positionalFallback = tryPositionalPairingFallback({ ansBlock, ansPage, answerPageBlocksByPage, strategy });
  // 候補2フォールバック（最終手段）: 通常処理・候補1のいずれでも値が見つからなかった場合にのみ参照する。
  const fragmentAggregation = tryFragmentAggregationFallback({
    questionLabelRaw,
    ansBlock,
    ansPage,
    answerPageBlocksByPage,
    strategy,
    questionMarkers: questionMarkers ?? [],
  });

  if (strategy.mode === "inline-shared") {
    question.sharedPromptRawText = bodyText;
    const blanks = resolveInlineSharedLabels({
      bodyText,
      bodySource,
      strategy,
      flagUnresolved,
    });
    for (const { label, index, length } of blanks) {
      const pair = ansPairs.find(([, l]) => l === label);
      let answerText = pair ? pair[2].trim() : null;
      let answerSource = ansBlock?.source;
      let fallbackInfo = null;
      if (!answerText && positionalFallback?.has(label)) {
        const fb = positionalFallback.get(label);
        answerText = fb.text;
        answerSource = fb.source;
        fallbackInfo = fb;
      } else if (!answerText && fragmentAggregation?.has(label)) {
        const fb = fragmentAggregation.get(label);
        answerText = fb.text;
        answerSource = fb.source;
        fallbackInfo = fb;
      }
      addItem({
        question,
        subLabelRaw: label,
        questionText: bodyText,
        questionSource: bodySource,
        answerText,
        answerSource,
        defaultPresentationType: strategy.presentation,
        parserVersion,
        nextId,
        flagUnresolved,
        answerLocatorForWarning,
        fallbackInfo,
        sharedBodyBlankPosition: { index, length },
      });
    }
  } else {
    const segments = [...bodyText.matchAll(strategy.pairRegex)];
    for (const [, num, segText] of segments) {
      const label = strategy.subLabelOf(num);
      const pair = ansPairs.find(([, n]) => n === num);
      let answerText = pair ? pair[2].trim() : null;
      let answerSource = ansBlock?.source;
      let fallbackInfo = null;
      if (!answerText && positionalFallback?.has(label)) {
        const fb = positionalFallback.get(label);
        answerText = fb.text;
        answerSource = fb.source;
        fallbackInfo = fb;
      } else if (!answerText && fragmentAggregation?.has(label)) {
        const fb = fragmentAggregation.get(label);
        answerText = fb.text;
        answerSource = fb.source;
        fallbackInfo = fb;
      }
      addItem({
        question,
        subLabelRaw: label,
        questionText: segText.trim(),
        questionSource: bodySource,
        answerText,
        answerSource,
        defaultPresentationType: strategy.presentation,
        parserVersion,
        nextId,
        flagUnresolved,
        answerLocatorForWarning,
        fallbackInfo,
      });
    }
  }
}

// 候補1: 「全マーカー→全値、位置対応」フォールバック（docs/table_format_investigation.md 4章）。
// 通常の解答対応付け（findAnswerBlockForQuestion→ansBlockのpairRegex抽出）で個々のマーカーの
// 値が見つからなかった場合にのみ、限定的に適用する。ansBlockが「マーカーのみ」で構成され、
// 解答ページ上でansBlockの直後（role=unknown）に「値のみ」のブロックが続き、個数が完全一致する
// 場合に限り、出現順序で1対1に対応付ける。それ以外は一切適用しない（unresolvedのまま）。
// ページ番号・Theme名・Topic名による個別分岐は持たない。
function isMarkersOnlyBlock(text, strategy) {
  strategy.detectRegex.lastIndex = 0;
  if (!strategy.detectRegex.test(text)) return false;
  const withoutQPrefix = text.replace(/^問[0-9０-９]+/, "");
  strategy.detectRegex.lastIndex = 0;
  // マーカー・空白・改行・軽微な区切り記号（読点/句点/中点）を除いた残差が実質空であることを要求する。
  // 説明文・見出し・金額・勘定科目等の実質的な本文が残る場合は対象外とする。
  const residual = withoutQPrefix.replace(strategy.detectRegex, "").replace(/[\s、。・]/g, "");
  return residual.length === 0;
}

function isValuesOnlyBlock(text, strategy) {
  strategy.detectRegex.lastIndex = 0;
  if (strategy.detectRegex.test(text)) return false; // マーカーを含む場合は「値のみ」ではない
  return text.trim().length > 0;
}

// label -> { text, source, markerBlock, order } のMapを返す。条件を満たさない場合はnull。
function tryPositionalPairingFallback({ ansBlock, ansPage, answerPageBlocksByPage, strategy }) {
  if (!ansBlock || !strategy) return null;
  if (!isMarkersOnlyBlock(ansBlock.text, strategy)) return null;

  const pageBlocks = answerPageBlocksByPage?.get(ansPage) ?? [];
  const idx = pageBlocks.findIndex((b) => b.source.locator === ansBlock.source.locator);
  if (idx === -1) return null;
  const nextBlock = pageBlocks[idx + 1];
  // 次のQuestion／Topic境界を越えないよう、直後のブロックがrole=unknown（構造的に未分類）である
  // ことを必須とする。topicHeading/answerBlock等、既知の役割を持つ行は境界とみなし対象外とする。
  if (!nextBlock || nextBlock.role !== "unknown") return null;
  if (!isValuesOnlyBlock(nextBlock.text, strategy)) return null;

  strategy.detectRegex.lastIndex = 0;
  const markers = [...ansBlock.text.matchAll(strategy.detectRegex)].map((m) => m[0]);
  if (markers.length === 0) return null;
  if (new Set(markers).size !== markers.length) return null; // マーカー重複時は一意に対応できない

  const values = nextBlock.text
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (values.length !== markers.length) return null; // 個数不一致は自動対応しない

  const map = new Map();
  markers.forEach((marker, i) => {
    map.set(marker, {
      rule: POSITIONAL_FALLBACK_RULE,
      text: values[i],
      source: nextBlock.source,
      markerBlockLocator: ansBlock.source.locator,
      order: `${i + 1}/${markers.length}`,
    });
  });
  return map;
}

// 候補2: 断片集約フォールバック（docs/candidate2_safety_design.md）。
// 通常処理・候補1(位置対応)がいずれも失敗した場合にのみ参照する、最後の限定的fallback。
// アンカー（既存ansBlock。ansBlockが存在しない場合は、解答ページ上で「問N」ラベルで始まる
// ブロックが役割を問わず一意に1件だけ存在する場合に限りそれをアンカーとする）の直後から、
// 次のQuestion／Topic境界（role=answerBlock/topicHeading等、role!=unknownのブロック）に
// 達するまで走査する。マーカーを含まないunknownブロック（候補1が既に消費した値のみブロック等）
// はスキップして次を見る（p.61 block4がこの例。docs/candidate2_safety_design.md 1章参照）。
// マーカーを含むブロックについては、全マーカー→値ペアが5条件
// （nonEmpty/balancedParentheses/startsWithParticle/endsWithComma/startsWithMarkerLikeSymbol）を
// すべて満たす場合のみ断片として採用する。この5条件は「値が正しいことの保証」ではなく
// 「fallback候補として採用可能かを判定するゲート」であり、判定結果は個別に保持し
// raw.answers[0].labelへ記録する（addItem/buildFallbackLabel参照）。
// 走査対象のいずれか1件でもゲートを満たさない、マーカーが重複する、質問側マーカー集合と
// 一切重ならない場合は、収集済みの断片も含めて全体を不採用とする（部分的な採用は行わない）。
// ページ番号・Theme名・Topic名による個別分岐は持たない。
function evaluateFragmentValue(value) {
  const openCount = (value.match(/[（(]/g) || []).length;
  const closeCount = (value.match(/[）)]/g) || []).length;
  const nonEmpty = value.length > 0;
  const balancedParentheses = openCount === closeCount;
  const startsWithParticle = /^[のにをはがでもやとへから]/.test(value);
  const endsWithComma = /、$/.test(value);
  const startsWithMarkerLikeSymbol = /^[○〇]/.test(value);
  const gatePass = nonEmpty && balancedParentheses && !startsWithParticle && !endsWithComma && !startsWithMarkerLikeSymbol;
  return { nonEmpty, balancedParentheses, startsWithParticle, endsWithComma, startsWithMarkerLikeSymbol, gatePass };
}

function findFragmentAggregationAnchor({ questionLabelRaw, ansBlock, ansPage, answerPageBlocksByPage }) {
  if (ansBlock) return ansBlock;
  const pageBlocks = answerPageBlocksByPage?.get(ansPage) ?? [];
  // ansBlockが存在しない（＝role=answerBlockの解答ブロックが検出されなかった）場合のみ、
  // 役割を問わず「問N」ラベルで始まるブロックをアンカー候補として探す。一意に決まらない場合は対象外。
  const matches = pageBlocks.filter((b) => b.text.startsWith(questionLabelRaw));
  if (matches.length !== 1) return null;
  return matches[0];
}

// label -> { rule, text, source, fragmentLocator, order, checks } のMapを返す。条件を満たさない場合はnull。
function tryFragmentAggregationFallback({ questionLabelRaw, ansBlock, ansPage, answerPageBlocksByPage, strategy, questionMarkers }) {
  if (!strategy || ansPage == null) return null;
  const anchor = findFragmentAggregationAnchor({ questionLabelRaw, ansBlock, ansPage, answerPageBlocksByPage });
  if (!anchor) return null;

  const pageBlocks = answerPageBlocksByPage?.get(ansPage) ?? [];
  const idx = pageBlocks.findIndex((b) => b.source.locator === anchor.source.locator);
  if (idx === -1) return null;

  const collected = [];
  for (let j = idx + 1; j < pageBlocks.length; j++) {
    const b = pageBlocks[j];
    if (b.role !== "unknown") break; // 次のQuestion/Topic境界（構造上の既知役割行）に到達、正常終了

    strategy.detectRegex.lastIndex = 0;
    if (!strategy.detectRegex.test(b.text)) continue; // マーカーを含まないブロック（候補1が消費済みの値のみブロック等）はスキップして次を見る

    strategy.pairRegex.lastIndex = 0;
    const pairs = [...b.text.matchAll(strategy.pairRegex)];
    if (pairs.length === 0) return null; // マーカーはあるが抽出できない異常系は全体を不採用

    for (const [, marker, rawValue] of pairs) {
      const value = rawValue.trim();
      const checks = evaluateFragmentValue(value);
      if (!checks.gatePass) return null; // 1件でもゲートに落ちたら全体を不採用（部分採用はしない）
      collected.push({ marker, value, source: b.source, fragmentLocator: b.source.locator, checks });
    }
  }

  if (collected.length === 0) return null;
  const markers = collected.map((c) => c.marker);
  if (new Set(markers).size !== markers.length) return null; // 重複マーカーは一意に対応できない

  // 質問側のマーカー集合と無関係な断片集合だけを集めてしまうケース（曖昧さ）を排除する
  if (questionMarkers.length > 0) {
    const overlap = markers.filter((mk) => questionMarkers.includes(mk));
    if (overlap.length === 0) return null;
  }

  const map = new Map();
  collected.forEach((c, i) => {
    map.set(c.marker, {
      rule: FRAGMENT_AGGREGATION_RULE,
      text: c.value,
      source: c.source,
      fragmentLocator: c.fragmentLocator,
      checks: c.checks,
      order: `${i + 1}/${collected.length}`,
    });
  });
  return map;
}

function findNextAnswerPage(afterPage, sortedAnswerPages, maxLookahead) {
  for (const p of sortedAnswerPages) {
    if (p > afterPage && p <= afterPage + maxLookahead) return p;
    if (p > afterPage + maxLookahead) break;
  }
  return null;
}

// 「同一ページ内の複数Topicによる問N番号衝突」対策。
// 1ページに複数Topicが存在し、各Topicが独立して「問１」から番号を振り直す教材がある
// （例: p.262, p.266）。単純に解答ページ内で最初に一致した「問N」ブロックを採用すると、
// 別Topicの解答を誤って参照してしまう。解答ページのブロック列をtopicHeadingの出現ごとに
// セグメント分割し、質問側の現在Topicと一致するセグメントだけを対応付け対象とする
// （Group生成には使わない、この対応付け専用のローカルな区切り）。
function parseTopicHeadingText(text) {
  const m = text.match(new RegExp(`^(${FW_DIGIT})\\s+(.*)$`));
  if (!m) return null;
  return { no: numOrNull(m[1]), title: m[2]?.trim() ?? null };
}

function topicsMatch(a, b) {
  if (!a || !b) return false;
  return a.no != null && b.no != null && a.no === b.no && (a.title ?? null) === (b.title ?? null);
}

function segmentAnswerPageByTopic(pageBlocks) {
  const segments = [];
  let current = { topic: null, blocks: [] };
  for (const b of pageBlocks) {
    if (b.role === "topicHeading") {
      if (current.blocks.length > 0 || current.topic) segments.push(current);
      current = { topic: parseTopicHeadingText(b.text), blocks: [] };
      continue;
    }
    if (b.role === "answerBlock") {
      current.blocks.push(b);
    }
  }
  if (current.blocks.length > 0 || current.topic) segments.push(current);
  return segments;
}

// strategyが対象とする本文から、実際に検出されるマーカーの集合を求める
// （解答候補ブロックとの整合チェックに使う。マーカーが取れない場合は空配列＝チェック対象外）。
function extractQuestionMarkers(strategy, bodyText) {
  if (!strategy) return [];
  if (strategy.mode === "inline-shared") {
    strategy.detectRegex.lastIndex = 0;
    return [...bodyText.matchAll(strategy.detectRegex)].map((m) => m[0]);
  }
  return [...bodyText.matchAll(strategy.pairRegex)].map(([, num]) => strategy.subLabelOf(num));
}

// 質問側の「問N」ラベルに対応する解答ブロックを、優先順位に従って1件に絞り込む。
// 優先1: 質問側の現在Topicと一致するTopicセグメント内から探す（同一Topic優先）。
// 優先2(フォールバック、解答側にTopic見出しが見つからない場合のみ): ページ全体を対象に、
//        質問側でのこのラベルの出現順序(occurrenceIndex)と同じ順序番目の候補を採用する。
// 最後にマーカー集合の整合を確認する。一意に決まらない・整合しない場合はnullを返し、
// 呼び出し元でunresolvedとして扱う（自動対応はしない）。
function findAnswerBlockForQuestion({ questionLabelRaw, currentTopicParsed, ansPageSegments, occurrenceIndex, answerBlocksFlat, questionMarkers }) {
  if (!ansPageSegments || ansPageSegments.length === 0) {
    return { block: null, reason: "解答ページに解答ブロックが存在しない" };
  }

  let candidates;
  let usedTopicMatch = false;
  if (currentTopicParsed) {
    const matchingSegments = ansPageSegments.filter((s) => topicsMatch(s.topic, currentTopicParsed));
    if (matchingSegments.length > 0) {
      candidates = matchingSegments.flatMap((s) => s.blocks).filter((b) => b.text.startsWith(questionLabelRaw));
      usedTopicMatch = true;
    }
  }

  if (!usedTopicMatch) {
    // Topic見出しが解答側で省略されている（またはTopic自体がない）場合のみ、出現順序で対応付ける
    const allMatches = (answerBlocksFlat ?? []).filter((b) => b.text.startsWith(questionLabelRaw));
    if (allMatches.length <= 1) {
      candidates = allMatches;
    } else if (occurrenceIndex != null && occurrenceIndex <= allMatches.length) {
      candidates = [allMatches[occurrenceIndex - 1]];
    } else {
      // 質問側・解答側で同一問番号の出現数が食い違う場合は自動対応しない
      return { block: null, reason: `出現数の不一致（質問側${occurrenceIndex}番目、解答側候補${allMatches.length}件）` };
    }
  }

  if (candidates.length === 0) return { block: null, reason: "対応する解答ブロックが見つからなかった" };
  if (candidates.length > 1) return { block: null, reason: `対応候補が${candidates.length}件あり一意に決まらなかった` };

  const candidate = candidates[0];
  if (questionMarkers.length > 0) {
    const overlap = questionMarkers.filter((mk) => candidate.text.includes(mk));
    if (overlap.length === 0) {
      return { block: null, reason: "候補ブロックのマーカー集合が問題文側と明確に不一致" };
    }
  }
  return { block: candidate, reason: null };
}

// 質問ページPの解答は、教材の物理構造上つねにPの直後(P+1)の見開き相手ページにある。
// ページ偶奇を判定根拠にしない（classifyPage.mjsの内容ベース判定を使う）ことと、
// 「P+1を機械的に解答ページとみなす」ことは別の問題であり、後者は見開き構造そのものの前提として維持する。
// 実際に探索窓を2ページ以上に広げて全文走査したところ、間に「unknown」判定のページ
// （表形式ページ・問番号省略ページ等、今回のスコープ外の構造）が挟まる場合に、
// 探索窓が本来無関係な後続ページの解答ブロックを拾ってしまう誤対応を引き起こすことを確認した
// （docs/parser_fullscan_report.md追補3）。誤対応より「見つからずunresolvedに記録される」方が
// 安全なため、探索窓は1（直後ページのみ）に留める。
const ANSWER_PAGE_LOOKAHEAD = 1;

export function buildCorpus({
  questionBlocks,
  answerBlocksByPage,
  answerPageBlocksByPage,
  themeTitleByNo,
  parserVersion,
  nextId,
  flagUnresolved,
}) {
  const roots = [];
  let currentTheme = null;
  let currentSection = null;
  let currentTopic = null;
  let pendingImportance = null;
  const consumedLocators = new Set();
  const sortedAnswerPages = [...answerBlocksByPage.keys()].sort((a, b) => a - b);
  const questionLabelOccurrenceByPage = new Map();
  const answerSegmentsByPageCache = new Map();
  function getAnswerSegments(page) {
    if (!answerSegmentsByPageCache.has(page)) {
      answerSegmentsByPageCache.set(page, segmentAnswerPageByTopic(answerPageBlocksByPage?.get(page) ?? []));
    }
    return answerSegmentsByPageCache.get(page);
  }

  function currentContainer() {
    return currentTopic ?? currentSection ?? currentTheme ?? null;
  }

  for (let i = 0; i < questionBlocks.length; i++) {
    const block = questionBlocks[i];

    if (block.role === "themeHeading") {
      const m = block.text.match(new RegExp(`^テーマ(${FW_DIGIT})\\s*(.*)$`));
      const detectedNo = numOrNull(m?.[1]);

      // テーマ見出しは各ページ上部にランニングヘッダーとして繰り返し印字される（全文調査で確認済み）。
      // 検出したテーマ番号が現在継続中のテーマと同じ場合は、単なる繰り返しとみなし、
      // 新しいGroupを作らず、現在のテーマ/節/項目の状態をそのまま維持する。
      // rawを失わないよう、繰り返し出現の生テキストはrunningHeaderOccurrencesに積む。
      if (currentTheme && currentTheme.parsed.no === detectedNo) {
        currentTheme.parsed.runningHeaderOccurrences.push({ text: block.text, source: block.source });
        continue;
      }

      // ここに来るのは「検出したテーマ番号が現在継続中のテーマと異なる（または未着手）」場合であり、
      // 正式な新テーマ開始の候補となる。全文調査（27テーマ中26テーマで確認）により、
      // 正式な開始行の直後には必ず「N-1」形式（そのテーマの最初の節）の節見出しが続くことを
      // 裏付けとして使う。この裏付けが取れない場合でも、テーマ番号が現在と異なる以上は
      // 新テーマとして扱うが、確信度をlowにしてunresolvedへも記録する
      // （教材側で節見出し自体が省略されているテーマ26のような例外が実在するため）。
      const next = questionBlocks[i + 1];
      const nextSectionMatch =
        next && next.role === "sectionHeading" ? next.text.match(new RegExp(`^(${FW_DIGIT})[-－](${FW_DIGIT})`)) : null;
      const isFirstSection = nextSectionMatch ? toHalfWidthDigits(nextSectionMatch[2]) === "1" : false;

      currentTheme = makeGroup(nextId, block, parserVersion, "theme", {
        no: detectedNo,
        title: m?.[2]?.trim() ?? null,
        confidence: isFirstSection ? "high" : "low",
        notes: isFirstSection
          ? null
          : "直後に「N-1」形式の節見出しが続かなかったため、正式なテーマ開始の確証（裏付け）が得られなかった。テーマ番号が直前と異なるため新テーマとして扱ったが、教材側で節見出しが省略されている可能性がある",
      });
      if (!isFirstSection) {
        flagUnresolved(
          block.source.locator,
          `テーマ${detectedNo}の開始判定の確証が得られなかった（直後に「N-1」形式の節見出しが続かない）`
        );
      }
      roots.push(currentTheme);
      currentSection = null;
      currentTopic = null;
      continue;
    }

    if (block.role === "sectionHeading") {
      const m = block.text.match(new RegExp(`^(${FW_DIGIT})[-－](${FW_DIGIT})\\s+(.*)$`));
      const sectionThemeNo = m ? numOrNull(m[1]) : null;

      // 節見出し自身が「テーマ番号-節番号」の形でテーマ番号を持つ。テーマ見出し行が
      // pdftotextの文字化けで検出できなかった場合（例: p.276、テーマ番号と会員番号欄の
      // 文字が入り交じって破損する既知の抽出不良）でも、節見出しは破損しない実データを確認済み
      // （docs/parser_fullscan_report.md 追補2）。そのため、節見出しのテーマ番号が現在の
      // currentThemeと食い違う場合は、テーマ見出し検出漏れによる暗黙のテーマ切り替わりとみなし、
      // ここでテーマGroupを補完的に生成する。タイトルはthemeTitleByNo（文書中の他の
      // 正常な出現から集めたテーマ番号→タイトルの対応表）から復元を試みる。
      if (sectionThemeNo != null && (!currentTheme || currentTheme.parsed.no !== sectionThemeNo)) {
        const recoveredTitle = themeTitleByNo.get(sectionThemeNo) ?? null;
        currentTheme = makeGroup(nextId, block, parserVersion, "theme", {
          no: sectionThemeNo,
          title: recoveredTitle,
          confidence: "low",
          notes:
            "テーマ見出し行からは検出できず、節見出し（N-M形式）に埋め込まれたテーマ番号から補完的に生成した" +
            (recoveredTitle
              ? "。タイトルは文書内の他ページの見出しから復元した"
              : "。タイトルも他ページから復元できなかった"),
        });
        flagUnresolved(
          block.source.locator,
          `テーマ${sectionThemeNo}のテーマ見出し行が検出できず、節見出しから補完的に生成した（元のテーマ見出し行が破損している可能性がある）`
        );
        roots.push(currentTheme);
        currentTopic = null;
      }

      currentSection = makeGroup(nextId, block, parserVersion, "section", {
        code: m ? `${toHalfWidthDigits(m[1])}-${toHalfWidthDigits(m[2])}` : null,
        title: m?.[3]?.trim() ?? null,
      });
      if (currentTheme) {
        currentTheme.children.push(currentSection);
      } else {
        flagUnresolved(block.source.locator, "テーマ見出しより前に節見出しが検出されたため、ルート直下に配置した");
        roots.push(currentSection);
      }
      currentTopic = null;
      continue;
    }

    if (block.role === "topicHeading") {
      const m = block.text.match(new RegExp(`^(${FW_DIGIT})\\s+(.*)$`));
      currentTopic = makeGroup(nextId, block, parserVersion, "topic", {
        no: numOrNull(m?.[1]),
        title: m?.[2]?.trim() ?? null,
        importance: pendingImportance,
      });
      pendingImportance = null;
      const parent = currentSection ?? currentTheme;
      if (parent) {
        parent.children.push(currentTopic);
      } else {
        flagUnresolved(block.source.locator, "節/テーマ見出しより前に項目見出しが検出されたため、ルート直下に配置した");
        roots.push(currentTopic);
      }
      continue;
    }

    if (block.role === "importanceBadge") {
      const m = block.text.match(/^重要度\s*(.+)$/);
      const val = m ? m[1].trim() : null;
      if (currentTopic) {
        currentTopic.parsed.importance = val;
      } else {
        pendingImportance = val;
      }
      continue;
    }

    if (block.role === "checkTypeHeadingCompound") {
      // sフラグ(dotAll)が必須: 指示文・本文が複数物理行にまたがりブロック内に改行を含む場合、
      // sフラグなしでは`(.*)$`が改行を越えられず正規表現全体がマッチしない
      // （全文調査で14件確認。blockizeのマージ自体は正しく、ここの正規表現側の不備だった）。
      const m = block.text.match(new RegExp(`^＜(.+?)＞\\s*(問${FW_DIGIT})\\s*(.*)$`, "s"));
      if (!m) {
        flagUnresolved(block.source.locator, "チェック区分見出し行の分割に失敗した");
        continue;
      }
      const [, checkTypeRaw, questionLabelRaw, instructionText] = m;
      const container = currentContainer();
      if (!container) {
        flagUnresolved(block.source.locator, "所属するGroupが特定できないチェック区分見出しをスキップした");
        continue;
      }

      const checkTypeCode = labelToCode(checkTypeRaw);
      const restorationNote = block.restoredFrom
        ? `見出しラベルと指示文が空行を挟んだ別ブロックだったため、blockize.mjsで${block.restoredFrom.join("・")}から復元した`
        : null;
      const notesParts = [
        checkTypeCode ? null : `未知のチェック区分ラベル: ${checkTypeRaw}`,
        restorationNote,
      ].filter(Boolean);
      const checkBlock = {
        id: nextId("checkblock"),
        raw: { text: `＜${checkTypeRaw}＞`, source: block.source },
        parsed: {
          parserVersion,
          confidence: checkTypeCode ? "high" : "low",
          notes: notesParts.length ? notesParts.join("。") : null,
          checkType: checkTypeCode,
        },
        questions: [],
      };
      container.checkBlocks.push(checkBlock);

      const question = {
        id: nextId("question"),
        raw: { text: questionLabelRaw, source: block.source },
        sharedPromptRawText: null,
        instructionRaw: null,
        items: [],
      };
      checkBlock.questions.push(question);

      // 本文候補の探索: 見出し行自身の指示文にマーカーがあればそれを使う。
      // なければ、次の既知ロール行が現れるまでの後続unknown行から、
      // マーカーを含む最初のブロックを本文として採用する。
      // （解答対応付けでマーカー集合の整合チェックに使うため、解答探索より先に行う）
      //
      // v1.8.0向け(共通指示文の計測・実装レポート参照)。instructionText（＜チェック区分＞の直後、
      // 「問N」に続く原文）は、本文として採用されないと以後どこにも保存されず失われることを
      // 実データ計測（全322 checkblock中244件で発生）で確認した。ここでは新しい意味判定は行わず、
      // 「本文としてどこから採用したか」という既存の機械的な条件分岐だけを使って、
      // 本文と重複しない範囲を原文のまま保持する（推測しない・原文を失わない、原則5・6）。
      // - instructionText自体にマーカーが無く、後続の別ブロックが本文として採用された場合
      //   （後述のfor内）: instructionText全体が本文と重複しない別テキストなので、そのまま保持する。
      // - instructionText自体にマーカーが含まれ、かつそのstrategyがsegmented（paren、"(N)"）の場合:
      //   本文は引き続きinstructionText全体から生成されるが、pairRegexは各"(N)"以降だけを
      //   本文として切り出すため、最初のマーカーより前の部分は本文と重複しない。この部分だけを
      //   共通指示文として保持する。指示文と小見出しが同一行で連結されている場合も、無理に
      //   分離せず原文のまま保持する（ユーザー指示: 誤った推測で原文を削るより広めに保持する方が安全）。
      // - instructionText自体にマーカーが含まれ、かつそのstrategyがinline-shared（circled、"①②③"）の
      //   場合: この様式は本文全体（マーカーより前の部分も含む）をそのままsharedBodyBlankPositionの
      //   基準テキストとして使うため、マーカーより前を別途instructionRawとして切り出すと本文と
      //   完全に重複する。したがってこの様式ではinstructionRawを付与しない（ユーザー指示: 本文と
      //   重複格納しない）。
      // - マーカーがどこにも見つからない場合（この後のRule 3、単一Item・無マーカー）は、
      //   指示文と本文の境界を示す手がかりが無いため、分離を試みずnullのままにする。
      let strategy = detectStrategy(instructionText);
      let bodyText = instructionText;
      let bodySource = block.source;
      if (strategy) {
        if (strategy.mode === "segmented") {
          strategy.detectRegex.lastIndex = 0;
          const markerMatch = strategy.detectRegex.exec(instructionText);
          strategy.detectRegex.lastIndex = 0;
          const leading = (markerMatch ? instructionText.slice(0, markerMatch.index) : instructionText).trim();
          question.instructionRaw = leading ? { text: leading, source: block.source } : null;
        }
      } else {
        for (let j = i + 1; j < questionBlocks.length; j++) {
          const nb = questionBlocks[j];
          if (nb.role !== "unknown") break;
          const s = detectStrategy(nb.text);
          if (s) {
            strategy = s;
            bodyText = nb.text;
            bodySource = nb.source;
            consumedLocators.add(nb.source.locator);
            const leading = instructionText.trim();
            question.instructionRaw = leading ? { text: leading, source: block.source } : null;
            break;
          }
        }
      }

      const questionMarkers = extractQuestionMarkers(strategy, bodyText);

      // 同一ページ内で同じ「問N」ラベルが複数Topicにまたがって出現する場合に備え、
      // 質問側での「このラベルの何番目の出現か」を数えておく（出現順序フォールバックで使う）。
      const occKey = `${block.page}::${questionLabelRaw}`;
      const occurrenceIndex = (questionLabelOccurrenceByPage.get(occKey) ?? 0) + 1;
      questionLabelOccurrenceByPage.set(occKey, occurrenceIndex);

      const ansPage = findNextAnswerPage(block.page, sortedAnswerPages, ANSWER_PAGE_LOOKAHEAD);
      const ansPageSegments = ansPage != null ? getAnswerSegments(ansPage) : [];
      const answerBlocksFlat = ansPage != null ? answerBlocksByPage.get(ansPage) ?? [] : [];
      const { block: ansBlock, reason: ansFailReason } = findAnswerBlockForQuestion({
        questionLabelRaw,
        currentTopicParsed: currentTopic?.parsed ?? null,
        ansPageSegments,
        occurrenceIndex,
        answerBlocksFlat,
        questionMarkers,
      });

      if (strategy) {
        if (!ansBlock) {
          flagUnresolved(
            block.source.locator,
            ansPage != null
              ? `「${questionLabelRaw}」に対応する解答ブロックが解答ページ(p.${ansPage})から見つからなかった（${ansFailReason ?? "理由不明"}）`
              : `「${questionLabelRaw}」に対応する解答ページが見つからなかった（p.${block.page}から${ANSWER_PAGE_LOOKAHEAD}ページ以内にanswer判定のページがない）`
          );
        }
        buildItemsForQuestion({
          strategy,
          bodyText,
          bodySource,
          question,
          questionLabelRaw,
          questionMarkers,
          ansBlock,
          ansPage,
          answerPageBlocksByPage,
          parserVersion,
          nextId,
          flagUnresolved,
        });
        continue;
      }

      // ルール3: 明示的なマーカーが見つからない場合のフォールバック。
      // instructionTextに実質的な本文がなければ、直後の最初のunknownブロックを本文候補とする。
      // 本文候補と対応する解答ブロックが1組ずつ確定できる場合のみ、単一の暗黙Itemとして保持する。
      // マーカーによる裏付けがないため、確信度は必ずlowとする。
      let fallbackText = instructionText.trim();
      let fallbackSource = block.source;
      if (!fallbackText) {
        for (let j = i + 1; j < questionBlocks.length; j++) {
          const nb = questionBlocks[j];
          if (nb.role !== "unknown") break;
          fallbackText = nb.text;
          fallbackSource = nb.source;
          consumedLocators.add(nb.source.locator);
          break;
        }
      }

      if (fallbackText && ansBlock) {
        const answerText = ansBlock.text.slice(questionLabelRaw.length).trim();
        addItem({
          question,
          subLabelRaw: null,
          questionText: fallbackText,
          questionSource: fallbackSource,
          answerText: answerText || null,
          answerSource: ansBlock.source,
          defaultPresentationType: "freeText",
          parserVersion,
          nextId,
          flagUnresolved,
          answerLocatorForWarning: ansBlock.source.locator,
          confidenceOverride: "low",
          notesOverride:
            "明示的な小問マーカーが本文から検出できなかったため、単一Itemとして暫定的に保持した(no-marker fallback)",
        });
      } else {
        flagUnresolved(
          block.source.locator,
          `「${questionLabelRaw}」の本文からマーカー（①-⑳ / (N)）を検出できず、単一Itemフォールバックの条件（本文・解答ページ${ansPage != null ? `(p.${ansPage})` : ""}の解答ブロックが1組ずつ揃うこと）も満たさなかった`
        );
      }
      continue;
    }

    // pageFurniture / answerBlock(質問ページには出現しない想定) / unknown はここでは何もしない。
    // unknownは下の未消費チェックでまとめて回収する。
  }

  for (const b of questionBlocks) {
    if (b.role === "unknown" && !consumedLocators.has(b.source.locator)) {
      flagUnresolved(
        b.source.locator,
        `分類できなかった断片: "${b.text}"（レイアウト復元の不備によりリード文から分離した可能性がある）`
      );
    }
  }

  return roots;
}
