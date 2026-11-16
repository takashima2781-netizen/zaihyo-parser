// M6: 正誤判定のレジストリ(判定方式キー → 判定関数)
//
// M5(Exercise生成)は`answer.grading.method`という契約(open vocabulary)だけを
// Exerciseデータへ設定し、実際の判定処理の実装はここに置く
// (`m5_exercise_generation_design.md`7-1節の責務分離)。
//
// `exerciseKind`ではなく`grading.method`をキーにすることで、将来別の
// `exerciseKind`が同じ判定方式を共有したり、新しい判定方式を追加したりする際に
// `exerciseKind`ごとの分岐ロジックをM6側にハードコードせずに済む。
//
// このファイルはNode(テスト)とブラウザ(学習UI、/lib/経由でimport)の両方から
// 同じ実装として使う(重複実装によるロジックの食い違いを避ける、M2〜M5と
// 同じ考え方)。

/**
 * @type {Record<string, (userAnswer: string[], exercise: object) => boolean>}
 */
export const gradingRegistry = {
  exact_sequence_match(userAnswer, exercise) {
    const correct = exercise.answer.correctOrder;
    if (userAnswer.length !== correct.length) return false;
    return userAnswer.every((value, i) => value === correct[i]);
  },
};

/**
 * @param {string[]} userAnswer
 * @param {object} exercise
 * @returns {boolean}
 */
export function grade(userAnswer, exercise) {
  const method = exercise.answer.grading.method;
  const judge = gradingRegistry[method];
  if (!judge) {
    throw new Error(`未対応の判定方式です(fail-closed): "${method}"`);
  }
  return judge(userAnswer, exercise);
}
