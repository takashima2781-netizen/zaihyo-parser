# レビュー判断データ（review/）

## SSOT（正式なデータ）

`review_decisions_core.json` が、本番パイプライン（`src/cli/build-drill-csv.mjs`）が実際に参照する
唯一の正式データ（Single Source of Truth）です。Git管理外の `output/review_decisions.json`
（教材原文の引用・人間向けメモを含む完全な記録）が、これより上位の正式データになることはありません。

- **86件** = `review_decisions_core.json` 内の全レビュー判断**履歴**件数（`pending`/`rejected`/
  `deferred`/`needs_source_fix`等も含む、追記型ログ全体の総数）。
- **48件** = このうち現在のコーパスに対して実際に**適用された**件数（`status: "approved"`かつ
  `contentFingerprintAtReview`・生成バージョンが現状のBSM/Exercise Viewと一致し、同一Itemに
  複数レコードがある場合は`reviewedAt`が最新のもの）。`build-drill-csv.mjs`実行時に出力される
  `reviewOverrideAppliedCount`と一致します。

両者は別の数字であり、86件全部が適用されているわけではありません。

## レビュー判断を追加・変更する正式手順

1. Git管理外のrichデータ（`output/review_decisions.json`）で原文確認・レビュー作業を行う
2. 採用する判断について、教材原文を含まない構造化情報を`review_decisions_core.json`へ反映する
   （`node src/cli/export-review-decisions-core.mjs`で機械的に再生成できるが、これは既存richデータ
   からの**移行・補助ツール**であり、通常のビルドでは自動実行されない。無条件にcoreを上書きするため、
   実行後は必ず次のステップへ進むこと）
3. `git diff review/review_decisions_core.json`でcoreの差分を人間が確認する
4. 正式パイプライン（`run-full-scan.mjs` → `run-book-structure-master-full.mjs` →
   `build-drill-csv.mjs`）を再生成し、件数・ゲートチェックを検証する
5. 問題なければ`review_decisions_core.json`をコミットする

## ファイル

- `review_decisions_core.json` — 正式なSSOT（Git管理）。`review_decisions_core_schema.json`参照。
- `review_decisions_core_schema.json` — coreの形状定義（Git管理）。
