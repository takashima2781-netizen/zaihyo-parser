# TASK(簿記論アプリ)

現在のフェーズ・直近のタスクを記録する。意思決定の経緯・参考資料は
`planning/` を参照。開発原則は `CLAUDE.md`、プロダクト仕様は `SPEC.md` を参照。

## 現在のフェーズ

**Parser設計(PDF→Source層)は第4版として確定し、Parser設計フェーズを完了した
と判断する。**

Stage3(子Source化候補の必要性判定基準)は、8ケースの小規模検証を経ても
単一の判定ルールとしては確定できなかった。追加実データ検証(D1〜D5、
`planning/stage3_additional_validation.md`)でも同様の結果となり、既存
ケースを単純に増やす形では正式化できないことが確認された。

この結果を受け、Stage3という工程自体の責務設定を再検討し
(`planning/stage3_responsibility_reconsideration.md`)、**Parserは「候補を
検出し、構造的事実(F群)を提示するところまで」を担当し、「独立参照が
必要かどうか(子Source化すべきか)」という意味判断(G群)はParser外の
候補確定フェーズ(人間レビュー/Derived Knowledge層)へ渡す**という
「候補提示方針」を採用した。この方針をParserパイプライン全体へ適用した
再定義(`planning/stage3_parser_pipeline_redesign.md`)、候補一覧レポート・
C3型再評価サイクル・人間レビュー情報量の最終確認(`planning/stage3_c_
plan_final_validation.md`)を経て、`planning/parser_design_proposal.md`を
第4版として正式改訂した。

これにより、Parser設計フェーズの基礎アーキテクチャ検証(StructureNode
認識・Block Detection・Source Segmentation粒度・Source候補管理・親子
重複・gateChecks・`diag`蓄積型・Parser/Derived Knowledge責務境界)は
一通り完了したと判断する。残る未決事項([8]候補確定フェーズの詳細設計・
候補一覧レポート等の正式スキーマ化・D2の`relation`拡張問題)は、いずれも
最小プロトタイプの実装を妨げない範囲の詳細設計・独立した論点として、
次フェーズへ持ち越す(詳細は`planning/parser_design_proposal.md`9・10節)。

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
   `sourceFaithful`重複の扱いを確定した(第3版時点)。
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
11. **Stage3追加実データ検証完了** — 8ケースを単純に増やす形では判定基準を
    正式化できないことを、5ケース(①②③・振出人/名宛人/指図人・仕入諸掛
    按分計算・外貨建取引・記帳方法比較表・地の文スラッシュ仕訳)の検証に
    より確認した。
    - `planning/stage3_additional_validation.md`
12. **Stage3責務再検討完了** — 既存13ケースをParserが確定できる事実(F群)と
    意味判断を要するもの(G群)に再分類し、「不要」判定は全てF群のみで
    説明がつくことを確認した。Parserは候補提示までとし、子Source化の最終
    判断は別責務(候補確定フェーズ)へ渡す「候補提示方針」を評価した。
    - `planning/stage3_responsibility_reconsideration.md`
13. **候補提示方針を前提としたParserパイプライン再定義完了** — 確定Source/
    Source候補の区別、Parser出力契約(概念レベル)、13ケースの新パイプライン
    への通し確認、既存設計への影響洗い出しを行った。
    - `planning/stage3_parser_pipeline_redesign.md`
14. **候補提示方針の最終確認完了** — 候補一覧レポート案の実データ試作
    (A1・A2・C2・C3・D1・D2・D3)、C3型ループの具体的トレース、人間レビュー
    に必要な情報量の確認を行い、「一部修正すれば正式採用できる」という
    結論を得た。
    - `planning/stage3_c_plan_final_validation.md`
15. **Parser設計案を第4版として正式改訂・Parser設計フェーズ完了** —
    候補提示方針(Parserは候補検出・構造的事実の提示まで、子Source化の
    最終判断はParser外の候補確定フェーズへ)を正式方針として反映した。
    Parserパイプライン再定義([4]⇔[5]の局所的な再評価サイクルを含む)、
    Source候補一覧レポートの概念設計、確定Source/候補の境界の明文化、
    gateChecks/`diag`/候補一覧レポートの責務分離を行った。
    `planning/parser_design_proposal.md`(第4版・現時点の正式設計)

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
- [x] Parser設計(PDF→Source層)完了(第4版・候補提示方針を含む)

## Parser設計フェーズ(完了)

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
- [x] 子Source化候補の必要性判定基準の小規模検証(8ケース) —
      `planning/child_source_necessity_validation.md`
- [x] [7] Validation/DiagnosticsのgateChecks不変条件の具体化 —
      `planning/gatechecks_invariant_validation.md`(候補18件をA/B/C分類。
      正式なコード化・不変条件リストの確定はまだ行っていない)
- [x] `diag`蓄積型設計の実装可能性確認 —
      `planning/diag_accumulation_validation.md`(方式を比較・8ケースで検証。
      正式スキーマの確定はまだ行っていない)
- [x] 子Source化候補の必要性判定基準の追加検証(D1〜D5) —
      `planning/stage3_additional_validation.md`(単純な追加検証では正式化
      できないことを確認)
- [x] Stage3責務再検討・候補提示方針の評価・最終確認 —
      `planning/stage3_responsibility_reconsideration.md`
      `planning/stage3_parser_pipeline_redesign.md`
      `planning/stage3_c_plan_final_validation.md`
- [x] 候補提示方針を正式方針として`parser_design_proposal.md`(第4版)へ反映

## 次フェーズ(最小Parserプロトタイプ。設計はほぼ確定、実装はこれから)

Parser設計フェーズは完了したと判断するが、次のフェーズはあくまで
**最小プロトタイプ**とする(CLAUDE.md原則6・8に従い、段階的に検証しながら
進める)。

- [ ] 最小プロトタイプの範囲を確定する(ユーザー確認事項)。現時点の想定:
      [1]〜[3](抽出・StructureNode認識・Block Detection)は既存の実データ
      検証で機械的に動作することを確認済みのため、これらを土台に、
      [4] Source Segmentationの確定/候補振り分け(F3/F5判定)と、
      Source候補一覧レポート(概念設計は`parser_design_proposal.md`3-8節)
      の試作出力までを最小スコープとする。
- [ ] Source候補一覧レポートの正式フィールド名・型のコード化
- [ ] `provenance`・`diag`の正式フィールド名・型のコード化
- [ ] [8]候補確定フェーズの詳細設計(人間レビューへの提示形式)
- [ ] D2の`relation`拡張問題(本文個別仕訳↔要約表)への対応方針検討
      (候補提示方針とは独立した論点、`stage3_additional_validation.md`)
- [ ] `structure.tokens`(term/operator/fraction/group/power)を
      自動生成するか人手で作るかの判断(Source→Derived Knowledgeフェーズ)
- [ ] Derived Knowledge抽出方法の実装(型・公式の抽出ロジック)
- [ ] Exercise層(仕訳穴埋め・公式並び替え)の設計・実装(まだ先)
- [ ] 残り7冊へのスケール方針の検討(まだ先)
