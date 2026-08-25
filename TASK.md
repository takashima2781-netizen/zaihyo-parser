# TASK(簿記論アプリ)

現在のフェーズ・直近のタスクを記録する。意思決定の経緯・参考資料は
`planning/` を参照。開発原則は `CLAUDE.md`、プロダクト仕様は `SPEC.md` を参照。

## 現在のフェーズ

**Parser設計(PDF→Source層)の設計案が第3版として確定。実データ小規模検証
(Source粒度・親子Source間のsourceFaithful重複・StructureNode認識・ラベル
検出試作・Block Detectionパターン検出系の全数調査・子Source化候補の必要性
判定基準の小規模検証・gateChecks不変条件の具体化・`diag`蓄積型設計の実装
可能性確認)はすべて完了し、正式設計(`parser_design_proposal.md`・
`source_derived_knowledge_design_proposal.md`)へ反映した。**

**Parser設計フェーズの基礎アーキテクチャ検証(StructureNode認識・Block
Detection・Source Segmentation粒度・親子重複・gateChecks・`diag`蓄積型)は
一通り完了したが、Parser設計フェーズ自体はまだ完全には終了していない**。
Stage3(子Source化候補の必要性判定基準)は8ケースの小規模検証を経ても正式な
ルールとして確定できておらず、これが唯一の未着手の検証事項として残っている
(`planning/parser_design_proposal.md`9節)。Stage3の確定を待たずにParser
実装や最終設計確定へ進むと、Source Segmentationのアーキテクチャ自体の手戻り
リスクがあるため、次フェーズとして何を行うかは改めてユーザーと評価する
(下記「次フェーズの評価」参照)。

## 次フェーズの評価(Parser実装前の最終設計確定 / 最小Parserプロトタイプ / 追加のStage3検証)

これまでの基礎アーキテクチャ検証(StructureNode認識・Block Detection・
Source Segmentation粒度・親子重複・gateChecks・`diag`蓄積型)がほぼ完了した
ことを踏まえ、次フェーズの候補を評価する。

- **Parser実装前の最終設計確定**: まだ時期尚早と判断する。Stage3(子Source化
  候補の必要性判定基準)は、Source Segmentationという設計の中心的な論点の
  1つであり、これが未確定のまま「最終設計」として確定させると、後から
  Stage3のルールが固まった際に他の確定済み方針(5-1節の親子重複の扱い等)へ
  手戻りが波及するリスクがある。
- **最小Parserプロトタイプ**: 同様にまだ時期尚早と判断する。プロトタイプの
  対象範囲(どこまでを子Source化するか)自体がStage3の判定基準に依存する
  ため、基準が未確定のままプロトタイプを組むと、プロトタイプの前提が
  途中で覆る可能性がある。
- **追加のStage3検証**: 現時点で最も筋が通っている。前回の8ケースの小規模
  検証(`planning/child_source_necessity_validation.md`)で「独立参照必要性」
  という軸が有効そうだという示唆は得られたが、これは限られたケース数からの
  帰納にとどまる。他の反復パターン(`①②③`等の未検証の列挙記号を含む)で
  追加検証し、判定基準の確からしさを高めることが、Parser設計フェーズを
  実質的に区切るために残された作業と考えられる。

**この評価はTASK.md側の整理であり、最終的にどの案を採るかはユーザー判断に
委ねる。**

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
9. **gateChecks不変条件の具体化完了** — gateChecks候補18件を洗い出し、A(hard
   invariant)/B(review invariant)/C(diagnostic)に分類、実データ8ケースで検証。
   gateChecksは意味判断器ではなく生成済みデータの構造・整合性契約を検証する
   ものと位置づけ、`parser_design_proposal.md`6-3節へ反映した。
   - `planning/gatechecks_invariant_validation.md`
10. **`diag`蓄積型設計の実装可能性確認完了** — 単一オブジェクト・ステージ別
    namespace・イベント配列・組み合わせの4方式を比較し、実データ8ケースで検証。
    基本はステージ別namespace+複数回試行のみ履歴化という組み合わせ方式を採用し、
    `provenance`は`diag`外へ分離する方針を`parser_design_proposal.md`5・5-1節へ
    反映した。
    - `planning/diag_accumulation_validation.md`
11. **次フェーズ = Stage3(子Source化候補の必要性判定基準)の扱いを検討中**。
    `planning/parser_design_proposal.md`9節・本ファイル「次フェーズの評価」
    節を参照。

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
      (重複許容+`provenance`〈`diag`外、旧`diag.provenance`から改訂〉+
      `relation`のopen vocabulary)
- [x] StructureNode認識の下調べ — `planning/structurenode_recognition_survey.md`
- [x] ラベル検出の試作 — `planning/label_detection_prototype_validation.md`
- [x] Block Detectionパターン検出系(仕訳型・計算式・方程式)の全数調査 —
      `planning/pattern_detection_survey.md`
- [x] 子Source化候補の必要性判定基準の小規模検証(8ケース。正式なルールとしては
      未確定) — `planning/child_source_necessity_validation.md`
- [x] [7] Validation/DiagnosticsのgateChecks不変条件の具体化 —
      `planning/gatechecks_invariant_validation.md`(候補18件をA/B/C分類。
      正式なコード化・不変条件リストの確定はまだ行っていない)
- [x] `diag`蓄積型設計の実装可能性確認 —
      `planning/diag_accumulation_validation.md`(方式を比較・8ケースで検証。
      正式スキーマの確定はまだ行っていない)
- [ ] 子Source化候補の必要性判定基準の追加検証(ケース数を増やして判定基準の
      確からしさを高める。Stage3、唯一の未着手項目)
- [ ] 教材構造分析からSourceを機械的に組み立てる部分の実装
- [ ] `structure.tokens`(term/operator/fraction/group/power)を
      自動生成するか人手で作るかの判断(Source→Derived Knowledgeフェーズ)
- [ ] Derived Knowledge抽出方法の実装(型・公式の抽出ロジック)
- [ ] Exercise層(仕訳穴埋め・公式並び替え)の設計・実装(まだ先)
- [ ] 残り7冊へのスケール方針の検討(まだ先)
