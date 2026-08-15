# TASK(簿記論アプリ)

現在のフェーズ・直近のタスクを記録する。意思決定の経緯・参考資料は
`planning/` を参照。開発原則は `CLAUDE.md`、プロダクト仕様は `SPEC.md` を参照。

## 現在のフェーズ

**Parser設計(PDF→Source層)の設計案が第3版として確定。実データ小規模検証
(Source粒度・親子Source間のsourceFaithful重複)は完了。次は小規模実装へ
進む前に残る検証事項(StructureNode認識の下調べ・ラベル検出の試作等)。**

これまでに完了したこと(古い順):

1. **教材調査完了** — 基礎コース1冊目(`★簿記論 No.1 基本テキスト.pdf`)の
   構造調査。`planning/book1_material_survey_report.md`
2. **Source / Derived Knowledge設計完了** — 中間データ設計案の初版〜
   第4版。`planning/source_derived_knowledge_design_proposal.md`
   (現時点の正式設計)
3. **実データによる小規模検証完了** — 8ケースの検証計画・結果・データ
   モデル改訂案・改訂の再検証。設計は第4版として確定した。
   - `planning/book1_prototype_validation_plan.md`
   - `planning/book1_prototype_validation_results.md`
   - `planning/data_model_revision_proposal_round1.md`
   - `planning/data_model_revision_round1_recheck.md`
4. **Parser設計(PDF→Source層)完了** — 段階的Source Segmentation方針
   (Stage1〜3)、Parser/Derived Knowledgeの責務境界、親子Source間の
   `sourceFaithful`重複の扱いを確定した(第3版・現時点の正式設計)。
   `planning/parser_design_proposal.md`
5. **実データによる小規模検証完了(Parser設計)** — Source粒度7ケース検証、
   親子Source間の`sourceFaithful`重複2ケース検証。
   - `planning/parser_source_granularity_validation.md`
   - `planning/parser_sourcefaithful_duplication_validation.md`
6. **次フェーズ = 小規模実装前の残り検証**(まだ着手していない)。
   `planning/parser_design_proposal.md`9節を参照。

## 直近タスク(完了分)

- [x] design brief と 調査レポートの統合・再評価
      (`planning/boki-app-integration-proposal.md`)
- [x] ローカル初期構成の作成(CLAUDE.md/SPEC.md/TASK.md、.gitignore、
      テスト基盤、planning/への経緯資料引き継ぎ)
- [x] 新規Private リポジトリ `boki-app` の作成・GitHubへのpush
- [x] 基礎コース1冊目のPDF調査・教材構造分析
- [x] Source / Derived Knowledgeの中間データ設計案作成・改訂
      (raw/parsed/diag → extractionRaw/sourceFaithful/parsed/diagの
      4概念モデル、3軸状態モデルを含む)
- [x] 実データ(基礎コース1冊目)による小規模プロトタイプ検証
      (8ケース→データモデル改訂→再検証まで完了)
- [x] 上記についてユーザー確認・設計確定

## 次フェーズ(Parser設計の残り検証・小規模実装。まだコード実装には着手しない)

- [x] Source粒度の設計(13節の申し送りを踏まえる) —
      `planning/parser_design_proposal.md`3節で段階的Source Segmentation
      方針(Stage1〜3)として確定
- [x] 親子Source間の`sourceFaithful`重複の扱い — 同5-1節で確定
      (重複許容+`diag.provenance`+`relation`のopen vocabulary)
- [ ] 小規模実装へ進む前の残り検証(StructureNode認識の下調べ・ラベル検出の
      試作・`diag`蓄積型設計の実装可能性確認・gateChecks不変条件の具体化) —
      `planning/parser_design_proposal.md`9節
- [ ] 教材構造分析からSourceを機械的に組み立てる部分の実装
- [ ] `structure.tokens`(term/operator/fraction/group/power)を
      自動生成するか人手で作るかの判断(Source→Derived Knowledgeフェーズ)
- [ ] Derived Knowledge抽出方法の実装(型・公式の抽出ロジック)
- [ ] Exercise層(仕訳穴埋め・公式並び替え)の設計・実装(まだ先)
- [ ] 残り7冊へのスケール方針の検討(まだ先)
