// 現行のBook Structure Master (BSM) スキーマ（docs/book_structure_master_schema_draft.json）には、
// QuestionUnitからIntermediate JSON Item.idへの正式な逆参照フィールドが存在しない。
// 現在の src/bookStructureMaster/mappings.mjs のBuilder実装は、末端QuestionUnitへ非スキーマ項目
// `_sourceItemId` を付与しているが、これはBuilderの内部実装であり、BSMスキーマ上の正式な契約ではない。
//
// Exercise View側がこの内部項目へ直接依存すると、将来BSM Builderの内部実装が変わった場合に
// Exercise View全体が壊れてしまう。そのため、`_sourceItemId` への参照はこのファイルへ隔離し、
// 他の src/exerciseView/*.mjs モジュールは本ファイルが公開する getSourceItemId / getSourceItemIds
// のみを使用すること（他のモジュールで `_sourceItemId` という文字列を直接書かないこと。
// src/exerciseView/validator.mjs の検証15がこれを機械的に確認する）。
//
// Phase 3D-1/F2（docs/item_id_formalization_design_memo.md）で、BSMスキーマへ正式な
// provenanceフィールド（QuestionUnit.provenance: {legacyItemId, stableItemId, contentFingerprint}）
// を追加した。stableItemIdは出典位置＋マーカーベースの安定IDであり、Parserの再実行や
// Item追加削除の影響を受けにくい。ただし現行`item-NNN`（legacyItemId）も後方互換のため
// 引き続き保持しており、getSourceItemId/getSourceItemIds（上記の互換helper）は変更していない。

export function getSourceItemId(questionUnit) {
  return questionUnit?._sourceItemId ?? null;
}

// questionUnitを根とする部分木に含まれる、全ての末端由来Item idを収集する（大問レベルの集約に使う）。
export function getSourceItemIds(questionUnit) {
  const ids = [];
  (function walk(unit) {
    const id = getSourceItemId(unit);
    if (id) ids.push(id);
    for (const child of unit.children ?? []) walk(child);
  })(questionUnit);
  return ids;
}

// stableItemId/contentFingerprintはBSMの正式スキーマフィールド(provenance)であり、
// getSourceItemIdのような非スキーマ項目の隔離は不要だが、取得方法を1箇所にまとめるため
// 同じファイルに並べて公開する。
export function getStableItemId(questionUnit) {
  return questionUnit?.provenance?.stableItemId ?? null;
}

export function getStableItemIds(questionUnit) {
  const ids = [];
  (function walk(unit) {
    const id = getStableItemId(unit);
    if (id) ids.push(id);
    for (const child of unit.children ?? []) walk(child);
  })(questionUnit);
  return ids;
}

export function getContentFingerprint(questionUnit) {
  return questionUnit?.provenance?.contentFingerprint ?? null;
}

// questionUnitを根とする部分木に含まれる、末端のcontentFingerprintを文書順(children配列の順)で収集する。
// sourceItemIds/stableItemIdsと同じ木構造・同じ走査順で辿るため、対応するインデックス同士が
// 同一Itemを指す（呼び出し側で3つの配列を並行して構築する場合に順序が揃うことを保証する）。
export function getContentFingerprints(questionUnit) {
  const fingerprints = [];
  (function walk(unit) {
    const fp = getContentFingerprint(unit);
    if (fp) fingerprints.push(fp);
    for (const child of unit.children ?? []) walk(child);
  })(questionUnit);
  return fingerprints;
}
