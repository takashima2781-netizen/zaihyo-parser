# M6実装報告: 学習UI(定額法1問を実際に解く)

本ファイルは、`planning/vertical_slice_mvp_roadmap.md`のM6(実際に問題を解く)の
実装報告である。M1〜M5と異なり、ユーザーの指示により事前の独立した設計案
ファイルは作成せず、既存設計(`vertical_slice_mvp_roadmap.md`7節・
`m5_exercise_generation_design.md`)との整合性確認のみを行ったうえで直接実装
した。**新しい設計判断・既存設計の変更を要する論点は見つからなかったため、
設計を停止して報告する場面は発生しなかった。**

---

## 1. 実装したファイル

```
learning-ui/index.html            新規。学習UI本体(単一HTMLファイル)
src/exercise/gradingRegistry.mjs  新規。正誤判定レジストリ(Node/ブラウザ共有)
src/devViewer/server.mjs          変更。/learnルート追加、/lib/の汎用化
test/devViewer/server.test.mjs    変更。新規ルートのテスト追加
test/exercise/gradingRegistry.test.mjs  新規。判定ロジックの単体テスト
```

---

## 2. データ経路(既存設計との整合)

```
output/exercises/exercises.json(M5の出力、正本)
   ↓ GET /api/exercises(M3で既に用意していたエンドポイントを流用)
learning-ui/index.html
```

`m5_exercise_generation_design.md`9-1節が定めた「M6はexercises.jsonだけを
読み、approved-knowledge.jsonやoutput/cases/には一切触れない」という制約を
そのまま踏襲した。学習UIのfetch呼び出しは`/api/exercises`へのGET1回のみで
あり(書き込み系のリクエストを一切持たない)、一方向のデータフローが
コード上の構造として保証されている。

---

## 3. 並び替え操作(クリック方式)

ドラッグ&ドロップではなく、クリックで選択肢⇄回答欄を行き来させる方式とした
(`vertical_slice_mvp_roadmap.md`7節が既に「drag&dropまたは単純なクリック
選択+並べ替え」の両方を許容していたため、既存設計と矛盾しない)。実装が
軽く、誤操作の取り消し(回答欄のチャンクを再クリックすれば選択肢へ戻る)も
容易。

---

## 4. 正誤判定(レジストリ方式)

`src/exercise/gradingRegistry.mjs`が`exercise.answer.grading.method`
(`m5_exercise_generation_design.md`7-1節で定義済みの契約)をキーに判定関数を
引く。学習UIは`exerciseKind`ごとの判定をハードコードしない。このモジュールは
`/lib/gradingRegistry.mjs`経由でM6からimportされ、将来M5側が同じ判定方式を
使う別の`exerciseKind`を追加した場合も、この1つの実装を共有し続けられる。

---

## 5. 正解後に表示する情報

`reveal.rawFormula`(正しい式)・`reveal.sourceRefs`(出典)のみを表示する。
`m5_exercise_generation_design.md`8節が確定した「解説ではなく開示情報」という
制約(自然言語の解説文を新たに生成しない)を、M6の表示内容もそのまま踏襲した。

---

## 6. 動作確認

ユーザーが実際にブラウザから操作し、次を確認済み。

- シャッフルされた5チャンクの選択肢が表示されること
- クリックで回答欄に並べられること
- 正解の並びで回答すると「正解です!」、誤った並びでは「不正解です」と
  表示されること
- 正解後に正しい式と出典情報(Source ID・role)が表示されること
- 「もう一度解く」で再挑戦できること

---

## 7. 今回実装しなかったもの

学習履歴・進捗保存、ランダム出題、複数問題、スコア、ログイン、完成版
デザイン。いずれも`vertical_slice_mvp_roadmap.md`9節で既に後回しと判断済みの
項目であり、新たな判断は発生していない。

---

以上がM6(学習UI)の実装報告である。M1〜M6を通した縦切りMVPの到達点・
次フェーズの提案は`planning/vertical_slice_mvp_retrospective.md`を参照。
