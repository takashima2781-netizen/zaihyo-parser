# TASK(簿記論アプリ)

現在のフェーズ・直近のタスクを記録する。意思決定の経緯・参考資料は
`planning/` を参照。開発原則は `CLAUDE.md`、プロダクト仕様は `SPEC.md` を参照。

## 現在のフェーズ

**Parser設計(PDF→Source層)の設計案が第3版として確定。実データ小規模検証
(Source粒度・親子Source間のsourceFaithful重複・StructureNode認識・ラベル
検出試作・Block Detectionパターン検出系の全数調査・子Source化候補の必要性
判定基準の小規模検証)は完了。子Source化候補の必要性判定基準は、8ケースの
小規模検証を経ても正式なルールとしては未確定であり、次に何を検証するかを
改めて評価する段階にある(`planning/parser_design_proposal.md`9節参照)。**

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
6. **StructureNode認識の下調べ・ラベル検出の試作完了** — 全209ページの
   機械的走査により、テーマ/論点/サブ項目見出しの検出精度、本編6ラベルの
   検出精度を確認した。この過程で`book1_material_survey_report.md`の
   「研究」ラベル・出現回数の誤りを発見し訂正した。
   - `planning/structurenode_recognition_survey.md`
   - `planning/label_detection_prototype_validation.md`
7. **Block Detectionパターン検出系の全数調査完了** — 仕訳型・計算式・方程式
   パターンが全209ページでどう出現するかを機械的に調査した。この過程で
   `book1_material_survey_report.md`の4件の記述(`○○○`出現数・分布、差額
   補充法の式表記、スラッシュ略記の文脈範囲、方程式の適用範囲)の再確認・
   訂正を行った。
   - `planning/pattern_detection_survey.md`
8. **子Source化候補の必要性判定基準の小規模検証完了** — 8ケースの比較により
   「独立参照必要性」が最も判別力の高い判定軸であることの示唆を得たが、
   正式なルールとしては未確定。
   - `planning/child_source_necessity_validation.md`
9. **次フェーズ = 小規模実装前の残り検証**(継続中)。
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
- [x] StructureNode認識の下調べ — `planning/structurenode_recognition_survey.md`
- [x] ラベル検出の試作 — `planning/label_detection_prototype_validation.md`
- [x] Block Detectionパターン検出系(仕訳型・計算式・方程式)の全数調査 —
      `planning/pattern_detection_survey.md`
- [x] 子Source化候補の必要性判定基準の小規模検証(8ケース。正式なルールとしては
      未確定) — `planning/child_source_necessity_validation.md`
- [ ] 子Source化候補の必要性判定基準の追加検証(ケース数を増やして判定基準の
      確からしさを高める)
- [ ] `diag`蓄積型設計の実装可能性確認
- [ ] [7] Validation/DiagnosticsのgateChecks不変条件の具体化
      — `planning/parser_design_proposal.md`9節
- [ ] 教材構造分析からSourceを機械的に組み立てる部分の実装
- [ ] `structure.tokens`(term/operator/fraction/group/power)を
      自動生成するか人手で作るかの判断(Source→Derived Knowledgeフェーズ)
- [ ] Derived Knowledge抽出方法の実装(型・公式の抽出ロジック)
- [ ] Exercise層(仕訳穴埋め・公式並び替え)の設計・実装(まだ先)
- [ ] 残り7冊へのスケール方針の検討(まだ先)
