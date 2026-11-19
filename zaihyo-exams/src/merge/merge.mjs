// 財表の問題データ（src/ の v1 が作るポイントチェック）＋ 答練の問題・テキストの「読む」→ アプリ用の財表の問題データ。
//
// - 土台（base）のファイルは読むだけ。src/（v1.0.0）は呼ばない・変えない。
// - 前回合流したこのフォルダの問題（provenance.generator が答練・テキストのもの）は取り除いてから足し直す
//   （何度実行しても同じ結果）。
// - 土台の問題には手を加えない。ただし教材の見出し（structure.book）が無いものには「ポイントチェック」を付ける
//   （範囲を選ぶ画面で教材ごとにまとまるように。学習記録のキーは stableItemIds と形式なので変わらない）。

import { GENERATOR } from "../exerciseView/buildExerciseView.mjs";
import { READING_GENERATOR } from "../exerciseView/buildReading.mjs";

export const OUR_GENERATORS = [GENERATOR, READING_GENERATOR];

export const POINTCHECK_BOOK = {
  structureNodeId: "zaihyo:book:pointcheck",
  titleRaw: { text: "ポイントチェック", source: null, bsmNodeId: "zaihyo:book:pointcheck", inherited: false },
};

const isOurs = (ex) => OUR_GENERATORS.includes(ex?.provenance?.generator);

function withBook(ex) {
  if (isOurs(ex) || !ex.structure || ex.structure.book) return ex;
  return { ...ex, structure: { book: POINTCHECK_BOOK, ...ex.structure } };
}

/**
 * @param {object} base 土台の財表の問題データ
 * @param {object[]} views このフォルダで作った問題データ（答練・テキスト）。並べた順に後ろへ足す
 */
export function mergeExerciseViews(base, views, { generatedAt = new Date().toISOString() } = {}) {
  if (base?.meta?.subject && base.meta.subject !== "zaihyo") throw new Error(`土台が財表の問題データではありません（meta.subject: ${base.meta.subject}）`);
  const kept = base.exercises.filter((ex) => !isOurs(ex)).map(withBook);
  const keptWithheld = (base.withheldExercises ?? []).filter((ex) => !isOurs(ex)).map(withBook);
  const removed = base.exercises.length - kept.length;
  const added = views.flatMap((v) => v.exercises);
  const exercises = [...kept, ...added];
  const meta = {
    ...base.meta,
    exerciseCount: exercises.length,
    withheldExerciseCount: keptWithheld.length,
    zaihyoExams: {
      mergedAt: generatedAt,
      sources: views.map((v) => ({ generator: v.meta.generator ?? null, sets: v.meta.sets, exerciseCount: v.exercises.length })),
      replacedPreviousExercises: removed,
      pointcheckBookAdded: true,
    },
  };
  return { merged: { ...base, meta, exercises, withheldExercises: keptWithheld }, stats: { base: kept.length, added: added.length, removed } };
}
