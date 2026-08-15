# TASK(簿記論アプリ)

現在のフェーズ・直近のタスクを記録する。意思決定の経緯・参考資料は
`planning/` を参照。開発原則は `CLAUDE.md`、プロダクト仕様は `SPEC.md` を参照。

## 現在のフェーズ

初期構築(リポジトリ・開発環境の準備)

## 直近タスク

- [x] design brief と 調査レポートの統合・再評価
      (`planning/boki-app-integration-proposal.md`)
- [x] ユーザー承認(3点修正を反映: 本質/応用パターンを固定ルール化しない、
      SPEC.mdで具体的スキーマを先に固定しない、テスト方針を追加)
- [x] ローカル初期構成の作成
  - [x] CLAUDE.md / SPEC.md / TASK.md 初期版
  - [x] .gitignore(教材保護ルール、Zaihyo Parserの運用を踏襲)
  - [x] 最低限のテスト基盤(`node:test`)
  - [x] planning/ への経緯資料引き継ぎ
        (design brief・統合提案・Project-Template README参考資料)
- [ ] 新規Private リポジトリ `boki-app` の作成(GitHub側の操作が必要)
- [ ] リモートへの初回push・確認
- [ ] 初期構築完了報告 → ユーザー確認

## 次フェーズ(教材調査。まだ着手しない)

- [ ] 基礎コース1冊目のPDFを受け取る
- [ ] PDF調査・教材構造分析
- [ ] Source層の中間データ設計案作成(raw/parsed/diag分離の検討を含む)
- [ ] Derived Knowledge抽出方法の設計案作成
      (型・公式の抽出ロジック、出典参照の持たせ方)
- [ ] 上記についてユーザー確認
- [ ] 1冊目でのSource → Derived Knowledgeパイプラインの実装・検証
- [ ] Exercise層(仕訳穴埋め・公式並び替え)の設計・実装
- [ ] 残り7冊へのスケール方針の検討
