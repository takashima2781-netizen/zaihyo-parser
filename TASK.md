# TASK(簿記論アプリ)

現在のフェーズ・直近のタスクを記録する。意思決定の経緯・参考資料は
`planning/` を参照。開発原則は `CLAUDE.md`、プロダクト仕様は `SPEC.md` を参照。

## 進捗サマリ(報告のたびに更新)

- **現在Phase**: Phase C(教材の本格投入)着手
- **Phase進捗**: 汎用性検証フェーズは終了条件5件中3件達成で終了済み
  (`planning/generality_validation_phase_assessment.md`)。Phase C着手前の
  アーキテクチャ確認(ボトルネック・レビュー量・実行方式・データモデル・
  完了条件の5点)を完了し、重大な問題は無いと判定
  (`planning/phase_c_readiness_assessment.md`)。本格投入を妨げる3点
  (M1オーケストレータの重複コード・ID一意性検証の欠落・dev-viewerの
  ケース一覧手動管理)を修正済み。次はPhase C本体(本書残り論点の投入)に
  着手する
- **初版完成までの残Phase**: Phase C(教材の本格投入、着手)→ Phase D
  (財表ドリルとの統合、未着手)→ Phase E(初版完成・実使用確認、E5は
  完了済み・E3〈journal_pattern Knowledgeの実データ一気通貫〉が残る)
- **初版完成までの推定残作業**: Phase Cは「本書1冊の主要論点を一通り
  投入する」規模(CLAUDE.md原則6により1論点ずつ、量の見積りは現時点では
  出さない)。Phase Dは財表ドリル側の現状を確認しないと見積り不能
  (着手前にユーザー確認が必要)。Phase E残りはjournal_pattern Knowledge
  候補の承認(ユーザー判断、作業自体は小さい)のみ
- **現在のブロッカー**: なし
- **人間の判断待ち**(いずれも初版完成の前提条件ではなく、保留のまま
  Phase Cを進めている。詳細は下記「保留事項の整理」参照):
  - 為替手形の振出人を学習対象に含めるか(後回し可)
  - 減価償却費の月割計算を学習対象に含めるか(後回し可)
  - journal_pattern Knowledge候補6件の採用可否(後回し可、下記に平易な
    説明を提示)

## 保留事項の整理(今すぐの判断は不要、後から追加可能)

### 1. 為替手形の振出人 — 後から追加可能

教材にこの1論点(為替手形を振り出した側の仕訳)が学習対象として含まれて
いなくても、初版としては成立する。含めるかどうかを今すぐ判断していただく
必要はない。詳細: `planning/exchange_bill_drawer_journal_material_inquiry.md`

### 2. 減価償却費の月割計算(期中売却/除却/焼失/買換) — 後から追加可能

同上。この1つの計算技法が無くても初版は成立する。詳細:
`planning/depreciation_proration_formula_material_inquiry.md`

### 3. journal_pattern Knowledge候補6件 — 後から追加可能(ただし採用いただけると学習内容が増える)

いずれも「採用しなければ初版が完成しない」性質のものではないが、採用
判断はいつでもブラウザ(開発用確認UI)から行っていただける。内部構造を
確認する必要は無く、次の情報だけで判断できる。

| # | 教材には何が書かれているか | アプリは何を覚えようとしているか | 採用すると学習時にどう使われるか | 推奨 |
|---|---|---|---|---|
| 1 | テーマ8-11(無形固定資産)、支出時の仕訳:「無形固定資産×××/現金預金×××」という型 | 無形固定資産を取得した時の仕訳の型 | 「正しい仕訳になるように並べ替えてください」という問題になる | 採用を推奨(教材の記述どおりで内容に疑義なし) |
| 2 | テーマ8-11、決算時(償却)の仕訳:「無形固定資産償却×××/無形固定資産×××」という型 | 無形固定資産を償却する時の仕訳の型 | 同上 | 採用を推奨 |
| 3 | テーマ4-1(手形)、約束手形の振出人の仕訳:「○○○×××/支払手形×××」という型(借方は科目名が変わりうるため空欄扱い) | 約束手形を振り出した側の仕訳の型 | 同上 | 採用を推奨 |
| 4 | テーマ4-1、約束手形の名宛人の仕訳:「受取手形×××/○○○×××」という型 | 約束手形の名宛人側の仕訳の型 | 同上 | 採用を推奨 |
| 5 | テーマ4-1、為替手形の名宛人の仕訳:「○○○×××/支払手形×××」という型(約束手形の名宛人と同じ形) | 為替手形の名宛人側の仕訳の型 | 同上 | 採用を推奨 |
| 6 | テーマ4-1、為替手形の指図人の仕訳:「受取手形×××/○○○×××」という型 | 為替手形の指図人側の仕訳の型 | 同上 | 採用を推奨 |

いずれも教材の記述をそのまま転記したものであり、Claude Codeが内容を
要約・言い換えたものではない(内容の正しさそのものはユーザーによる会計
知識の確認を必要とするため、Claude Codeからは「採用を推奨」以上の保証は
できない)。開発用確認UIの各カードにある「採用する」を押していただくだけで
反映される。まとめて後回しにしていただいても、Phase Cの開発は止めない。

## 現在のフェーズ

**Parser設計フェーズ完了後、「教材の1論点をPDFから実際に解けるところまで
一本通す」縦切りMVP(`planning/vertical_slice_mvp_roadmap.md`)に着手し、
M1〜M6のすべてが完了した。定額法1ケースについて、PDF→Source→Derived
Knowledge候補→人間による承認→Exercise生成→学習UIでの回答・正誤判定・
出典開示まで、実教材データで最後まで一本通った。**

対象は定額法の定義式ブロック(テーマ8-2)1ケースのみ(`planning/vertical_
slice_mvp_roadmap.md`3節で選定)。M1で実PDFから確定Sourceを1件生成し
(`planning/m1_implementation_report.md`)、M2でその確定Sourceから
Derived Knowledge候補1件(`calculation_formula`)を生成し
(`planning/m2_derived_knowledge_candidate_design.md`)、M3の開発用確認UI
(閲覧のみ)で一気通貫の流れをブラウザ上から追跡できる状態にした
(`planning/m1_minimal_parser_prototype_design.md`)。M4でその確認UIへ承認・
修正・除外の最小操作を追加し、**ユーザー自身が実際に定額法1件を承認**、
`output/knowledge/approved-knowledge.json`(承認済みKnowledgeの一方向の
派生ビュー)への反映まで確認した(`planning/m4_review_workflow_design.md`)。
M5で承認済みKnowledge1件から並び替えExercise1件を生成し
(`output/exercises/exercises.json`)、M3画面へ「8. Exercise」セクションを
追加して確認した(`planning/m5_exercise_generation_design.md`)。M6で
`output/exercises/exercises.json`のみを入力とする学習UI(`learning-ui/`)を
実装し、**ユーザー自身がブラウザ上で実際に問題を解き、正誤判定・正解の
式・出典情報の表示までを確認した**(`planning/m6_learning_ui_implementation_report.md`)。
汎用的なParser・Knowledge生成器・問題生成エンジン・レビュー管理画面・学習UIは
意図的に作らず、この1ケースを最短距離で通すことを優先した(CLAUDE.md原則6・8)。
次フェーズ以降の方針は`planning/vertical_slice_mvp_retrospective.md`を参照。

以下はParser設計フェーズ完了までの経緯(旧「現在のフェーズ」、変更なし)。

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
16. **縦切りMVPロードマップ策定完了** — 「教材の1論点を実際に解ける」までの
    依存関係・最小Parserプロトタイプのスコープ・最初の教材ケース(定額法の
    定義式ブロック、テーマ8-2)・マイルストーン(M1〜M6)・後回しにするものを
    整理した。開発の途中でユーザーが早期に実データをブラウザ確認できるよう、
    M3(開発用確認UI)をM2より前に前倒しする構成へ改訂した。
    `planning/vertical_slice_mvp_roadmap.md`
17. **M1(最小Parserプロトタイプ)・M3(開発用確認UI)実装完了** — 定額法の
    定義式ブロック(テーマ8-2)1ケースについて、PDF→Extraction→Structure
    Recognition→Block Detection→Source Segmentation(F3)→Faithful
    Restoration(`fraction_split`補正)→確定Sourceまでを実装し、実PDFで
    動作確認した(抽出ツールはこの実行環境の`pdftotext`がCJK CMapを欠くため
    `pdftotext`から`PyMuPDF`へ変更。フィールド設計〈`extractionRaw.tool`等〉
    はツールの変化を前提とした設計のため、Parser設計第4版とは矛盾しない)。
    続けて、`output/cases/teigakuho-definition.json`をブラウザ上で閲覧専用
    表示する開発用確認UI(M3)を実装し、「PDFから何を読み取り、どこを補正し、
    なぜSourceとして確定したのか」を人間が追跡できる状態を確認した。
    `planning/m1_minimal_parser_prototype_design.md`(設計)、
    `planning/m1_implementation_report.md`(実装報告)
18. **M2(Derived Knowledge候補生成)詳細設計・実装完了** — M1の確定Source
    (`block-teigakuho-def`)1件から、`calculation_formula`のDerived Knowledge
    候補を1件生成した。`content.rawFormula`が`sourceFaithful`と完全一致する
    こと、5トークン語彙(term/operator/fraction/group)への構造化と往復整合性
    (structureから復元した文字列がrawFormulaと一致すること)、
    `sourceRefs.role = definition`によるSourceとの紐づけ、3軸状態
    (contentConfidence/evidence/consolidation、いずれも既存設計の「1 Source
    → 1 Knowledge」パターンにそのまま一致)を実データで確認した。
    `reviewStatus`(候補/承認等のレビュー工程上の状態)は、Derived Knowledge
    本体の外側で管理する構成とし、3軸モデルの独立性を壊さないようにした
    (ユーザー承認済みの方針)。M3画面へ「7. Derived Knowledge候補」セクション
    を追加し、往復整合性チェックをブラウザ側でも生成処理と同じロジック
    (`/lib/formulaTokenizer.mjs`のimport)で独立に再検証できるようにした。
    `planning/m2_derived_knowledge_candidate_design.md`

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

## 縦切りMVP: M1〜M6(完了。PDFから学習UIまで一本通った)

- [x] 縦切りMVPロードマップ策定 — `planning/vertical_slice_mvp_roadmap.md`
- [x] M1: 定額法1ケースの最小Parserプロトタイプ実装(PDF→確定Source) —
      `planning/m1_minimal_parser_prototype_design.md`(設計)、
      `planning/m1_implementation_report.md`(実装報告)
- [x] M3: 開発用確認UI(閲覧のみ)実装・実データでのブラウザ確認完了
- [x] M2: Derived Knowledge候補生成(定額法1ケース、`calculation_formula`)実装。
      `content.rawFormula`が`sourceFaithful`と一致すること、5トークン語彙への
      構造化と往復整合性、`sourceRefs.role = definition`、3軸状態
      (contentConfidence/evidence/consolidation)、`reviewStatus`をKnowledge
      本体の外側で管理する構成を実データで確認した。M3画面へ「7. Derived
      Knowledge候補」セクションを追加(閲覧のみ)。
      `planning/m2_derived_knowledge_candidate_design.md`
- [x] M4: Derived Knowledge候補の承認・修正・除外を実装。修正可能フィールドを
      `contentConfidence`/`scopeNote`のみに限定し(`sourceRefs`/`evidence`/
      `consolidation`/`content.structure`/`content.rawFormula`は編集不可)、
      `evidence`/`consolidation`は保存のたびに`sourceRefs`から再計算する
      構成とした。`reviewStatus`はDerived Knowledge本体の外側で管理し、
      `candidate→approved/rejected`の一方向遷移のみをfail-closedで許可する。
      承認済みKnowledgeは`output/knowledge/approved-knowledge.json`(ケース
      ファイルからの一方向の派生ビュー、承認のたびに全件再生成)へ反映され、
      M5はこのファイルのみを入力として使う想定とした。ユーザー自身が
      ブラウザから実際に定額法1件を承認し、動作を確認済み。
      `planning/m4_review_workflow_design.md`
- [x] M5: 承認済みKnowledge1件(`dk-calc-formula-teigakuho`)から並び替え
      Exercise1件を生成する実装。`content.structure.tokens`(トップレベル
      5要素)を`renderTokens()`でレンダリングして`answer.correctOrder`とし、
      提示順序のシャッフルはM6側の責務として持たせない設計とした。正誤判定は
      `answer.grading.method`(open vocabulary)という契約をExercise側が持ち、
      実行はM6側に委ねる責務分離とした。`reveal`(旧`explanation`)は
      `rawFormula`/`sourceRefs`のみに限定し、教材に存在しない自然言語解説は
      生成しないこととした。`output/knowledge/approved-knowledge.json`のみを
      入力とし(`output/cases/`には触れない)、`output/exercises/exercises.json`
      へ出力。M3画面へ「8. Exercise」セクションを追加(閲覧のみ)し、ユーザーが
      ブラウザで生成結果を確認済み。
      `planning/m5_exercise_generation_design.md`
- [x] M6: 学習UI(`learning-ui/`)実装。`output/exercises/exercises.json`のみを
      入力とし(GETリクエスト1回のみ、書き込み系リクエストを持たない)、
      教材内容・正解のハードコードなし。並び替え操作はクリック方式。正誤判定は
      `src/exercise/gradingRegistry.mjs`(`answer.grading.method`をキーにした
      レジストリ、M5と共有実装)で行い、`exerciseKind`ごとの判定をUI側に
      ハードコードしない。正解後は`reveal.rawFormula`・`reveal.sourceRefs`
      (出典)のみを表示し、新しい自然言語解説は生成しない。ユーザー自身が
      ブラウザで実際に1問解き、正解/不正解両方のケース・正解表示・出典表示を
      確認済み。
      `planning/m6_learning_ui_implementation_report.md`

**これにより、PDF→Source→Derived Knowledge候補→人間による承認→
Exercise生成→学習UIでの回答・正誤判定・出典開示、という縦切りMVPの
一次ゴールを実教材データで達成した。** 到達点の総括・次フェーズの方針は
`planning/vertical_slice_mvp_retrospective.md`を参照。

## 第2ケース: Source追加の自動化・専門家レビューUI(完了)

M1〜M6を「1ケース専用の縦切りMVP」から「教材を増やしていける仕組み」へ
一段汎化するため、定額法の適用例2件(テーマ8-2内・テーマ9-1〈テーマ横断〉)
を第2ケースとして実データで検証した。

- **Source候補→Knowledge統合の経路を実データで検証完了** —
  Parser候補検出([8]候補確定フェーズ相当)・座標ベースのFaithful
  Restoration・複数Source→1 Knowledge統合(`evidence`/`consolidation`の
  更新)を、実PDFで最後まで通した。
  `planning/case2_readiness_and_generalization_analysis.md`
- **Source確定フェーズの責務再検討・縮小完了** — 「Sourceとして確定
  するか」を毎回人間に問う設計を見直し、F群の構造的事実(同一topic内の
  適用・定義候補が一意・Faithful Restoration解決済み)だけで安全に
  判定できる場合はParser外の評価ロジック
  (`src/parser/evaluateCandidateConfirmation.mjs`)が自動確定・自動統合
  し、テーマ横断等の意味判断が必要な場合だけ人間へ個別の統合候補として
  提示する設計へ変更した。Parser本体(`runApplicationCandidates.mjs`)の
  出力契約(F群のみ)は変更していない。
  `planning/source_confirmation_responsibility_reconsideration.md`
- **Knowledge統合時のレビュー範囲の詳細設計完了** — `reviewStatus`が
  承認しているのはCategory A/C(`content`/`contentConfidence`/
  `scopeNote`)であり、Source統合が変化させるCategory B
  (`evidence`/`consolidation`)は対象外、という整理により、Source追加の
  たびにKnowledge全体を再承認待ちに戻す設計を撤回した。承認の単位は
  「Knowledge全体」ではなく「追加候補ごと」とした。
  `planning/knowledge_integration_review_scope_design.md`
- **本プロジェクト初のgateChecks実装完了** —
  `src/gateChecks/applicationIntegrationChecks.mjs`。自動確定の正当性・
  sourceRefsとの整合性・content不変性を事後検証する(一次判断器ではない)。
  CLIスクリプト(`scripts/run-application-candidates.mjs`)・対話的な
  人間承認経路(`server.mjs`の`approve-as-evidence`ルート)の両方に
  fail-closedで組み込んだ。
- **P193(テーマ9-1)の複数Knowledge候補分析完了** — 1つのSource範囲に、
  既存Knowledgeの適用例であることと、対象固有の別知識(自社利用の
  ソフトウェア等、資産固有の償却条件)が同時に存在しうることを実データで
  確認した。今回は前者(適用例としてのsourceRefs追加)のみを実装し、
  後者(対象固有ルールの独立Knowledge化)は明示的に保留した(下記
  「後回し」参照)。
  `planning/p193_multi_knowledge_analysis.md`
- **専門家レビューUIの責務分離完了** — 開発用確認UIの判断ポイント
  (Knowledge採用/Source追加の承認)を、「専門家レビュー領域」(内部用語を
  使わず、教材の記述同士を比較させる形で判断させる)と「開発者向け詳細」
  (折りたたみ、内部設計の用語をそのまま表示)の2層に分離した。
  `knowledge_integration_review_scope_design.md`・
  `p193_multi_knowledge_analysis.md`の設計提案をUI表示層へ適用したもの。
- **実データでの最終確認完了** — page158(同一topic内の適用)は自動確定・
  自動統合、page193(テーマ横断の適用)は専門家レビューUIでユーザー自身が
  「記録する」を選択したことによる人間確認統合、という異なる経路を
  経て、両方とも`sourceRefs`へ反映された(`evidence.byRole`:
  definition 1/application 2、`distinctThemes`: theme-8/theme-9、
  `consolidation.state`: merged_confirmed)。`content`/`reviewStatus`は
  この間一切変化しなかった。gateChecks・既存テストとも実データに対して
  正常に通ることを確認済み。

## 第3ケース: 仕訳パターン(テーマ8-11 無形固定資産)の追加(完了)

第1・第2ケース(いずれも`calculation_formula`)ではまだ検証できていない
構造を優先し、`knowledgeKind`が異なる仕訳パターン(テーマ8-11 無形固定
資産の会計処理、「(借)勘定科目×××(貸)勘定科目×××」という形)を第3
ケースとして選定・実装した。実PDF調査(page183〜188)で複数候補
(方程式の複数ステップ変形〈page186〉、分母に減算を含む月割計算
〈page188〉、仕訳パターン〈page187〉)を比較し、既存の5トークン語彙
(term/operator/fraction/group/power)を変更せずに表現できる仕訳パターンを
選定した(他候補は新しいcontent構造を要する可能性があり、今回は見送り)。

- **Block Detection拡張**: `detectJournalPatterns`(`src/parser/
  blockDetection.mjs`)を追加。既存の`detectTermBasedFormulas`とは別の
  検出器として実装し、既存の用語ベース計算式検出器は無変更。
- **Faithful Restoration拡張**: 勘定科目名の文字間にある字間調整用の
  空白を除去する`normalizeCjkLetterSpacing`(`src/parser/
  faithfulRestoration.mjs`)を追加。文字自体は変更しないため原則2
  (原文保持)に抵触しない、機械的な正規化として実装した(個別確認済み
  補正〈fraction_split〉とは異なる位置づけ)。
- **新しいknowledgeKind「journal_pattern」**: 既存の5トークン語彙の
  うちtermのみを使って表現できることを確認し、新しいトークン種別は
  追加していない。`src/knowledge/journalPatternTokenizer.mjs`・
  `src/knowledge/deriveJournalPatternKnowledgeCandidate.mjs`を追加
  (`deriveKnowledgeCandidate.mjs`の`computeEvidenceAndConsolidation`は
  そのまま再利用)。
- **Exercise generator registryの実地検証**: `generateJournalOrderingExercise`
  を追加登録し、実際に2件のgeneratorが並存する状態を実データで確認した
  (前回追加したレジストリ設計が機能することの裏付け)。
- **専門家レビューUIの汎化を実データで確認**: 「6. 学習対象として採用
  するか」の2層UI(専門家レビュー領域/開発者向け詳細)が、新しい
  knowledgeKindに対しても無改修でそのまま機能することをブラウザで確認
  した。
- **開発用確認UIの複数ケース表示に対応**: `dev-viewer/index.html`の
  `CASE_NAME`単一定数を`DEFINITION_CASES`配列へ一般化し、`render()`が
  DOM要素を返す関数へ変更、`server.mjs`の`ALLOWED_CASES`(静的ホワイト
  リスト)を`output/cases/`の実ファイル存在確認による動的判定へ変更した
  (`vertical_slice_generalization_readiness_audit.md`のB分類項目を、
  第3ケース追加を機に実施)。
- **実データ確認**: page187から仕訳パターン2件(支出時/決算時)を
  それぞれ独立したSource+Knowledge候補として生成し、ブラウザで全3ケース
  (定額法定義+適用2件、無形固定資産の仕訳2件)が並んで表示されること、
  各ケースの「採用する」操作パネルが平易な言葉で機能することを確認した。
  **Knowledge候補はいずれも`candidate`のまま(私からは承認していない)**。
- **判断の申し送り**: 2件の仕訳パターン(支出時/決算時)は、既存の
  「1 Source(1つの完結した型)→1 Knowledge」という確立済みの粒度
  パターンに従い、独立した2件のKnowledge候補として扱った(1つの
  Knowledgeへ合成しない)。これは会計的な意味判断というより既存パターンへの
  機械的な当てはめだが、教材内容の解釈に関わる判断のため、最終的な粒度が
  適切かはユーザー確認の対象として残す。
- **Parser/M2層の汎化についての所見**: 3ケース目を終えても、Parser
  オーケストレータ・Faithful Restoration・M2生成関数のロジックは、
  検出器・選別条件・復元技術のいずれも案件ごとに異なり、明確な共通の
  抽象化パターンはまだ見えていない(むしろ、多様な形状ごとに専用の
  検出器/復元ロジックを追加していく設計〈CLAUDE.md原則5〉が実データで
  裏付けられている)。一方、Knowledge審査〜Exercise生成〜学習UIの層は、
  レジストリ設計により無改修で新しいknowledgeKindへ対応できることを
  確認した。この所見を踏まえ、Parser/M2層の汎化はまだ見送り、次は
  第4ケースへ進める。

## 第4ケース: 手形(テーマ4-1、約束手形の振出人/名宛人)の追加(完了)

第3ケース(仕訳パターン、既知の勘定科目名のみ)ではまだ検証できていない
構造として、テーマ4-1(手形)の約束手形から、役割ラベル(振出人/名宛人)が
`(借)`の直前に同居する仕訳2件を追加した。新しいテーマ(theme-4)を第1・
第3ケースとは独立に検出し、既存の`journal_pattern`(第3ケースの
knowledgeKind)・`journal_termbased`(blockKind)をそのまま再利用できる
ことを確認した(新しいknowledgeKind・Exercise generatorの追加は不要)。

- **Block Detection拡張**: `detectJournalPatterns`が、行頭固定だった
  「(借)」の前に役割ラベル(例:「振出人」)が同居するケースにも対応できる
  よう最小限拡張した(`inlineLabelRaw`を追加、第3ケースの検出結果は
  変化しない、後方互換)。
- **Faithful Restoration拡張**: 勘定科目名の代わりに使われる「○○○」
  「〇〇〇」(空欄記入を促すプレースホルダー記号)も、字間空白除去の対象に
  含めた。
- **教材内容の判断が必要な候補を意図的に除外**: 同じページの為替手形
  (振出人/名宛人/指図人、3件)も検出はしたが、振出人の行が借方・貸方
  ともプレースホルダーであり、かつ教材の説明文と一見矛盾する内容
  (振出人には手形上の債権・債務が生じないと書かれているにもかかわらず
  仕訳例が示されている)を含むため、会計的な解釈が必要と判断し、今回は
  対象外として`outOfScopeDetections`に記録するに留めた(推測しない、
  原則4)。
- **実データ確認**: 約束手形の振出人/名宛人の仕訳2件を、それぞれ独立
  したSource+Knowledge候補として生成し、ブラウザで全5ケースが並んで
  表示されること、「○○○」プレースホルダーが往復整合性を保ったまま
  正しく表示されることを確認した。**Knowledge候補はいずれも`candidate`
  のまま(承認していない)**。
- **申し送り**: 第3ケース(支出時/決算時)と同じ「1 Source→1 Knowledge」
  粒度判断を、今回の2件(振出人/名宛人)にも一貫して適用した。この2件は
  同一取引の異なる当事者の視点という点で、第3ケースよりもさらに一体的に
  見える可能性があり、粒度の妥当性についてはユーザー確認を仰いでいる
  (第3ケースの確認事項と合わせて検討中)。

## 為替手形(振出人の仕訳)の教材内容確認・追加実装(完了)

第4ケースで対象外とした為替手形の振出人の仕訳について、教材の記述
(地の文・仕訳の型・設例)を整理し、ユーザーへの確認材料として
`planning/exchange_bill_drawer_journal_material_inquiry.md`にまとめた。
設例(page78)まで確認した結果、地の文と仕訳は矛盾しないと読める(振出人の
仕訳は手形の勘定科目を一切使わず、手形とは別の既存の債権・債務〈設例では
売掛金・買掛金〉の消滅を記録しているだけ)ことが分かった。

**ユーザー確認の結果**: 為替手形も学習対象として扱ってよいとの回答を得た。
ただし振出人は、借方・貸方とも決まった科目を持たない(取引関係によって
消滅する既存債権・債務の科目が変わりうる)ため、既存の`journal_pattern`
モデルにそのまま押し込めるのが適切か、実データとKnowledgeモデルを確認した
うえで判断するよう指示された。

**実装(`src/parser/runExchangeBillCase.mjs`・`scripts/run-exchange-bill-
case.mjs`)**: 名宛人・指図人の2件は、約束手形の名宛人と全く同じ形状
(片側が固定科目〈支払手形/受取手形〉、片側がプレースホルダー)であることを
確認し、既存の検出器(`detectJournalPatterns`)・トークナイザー
(`tokenizeJournalPattern`)・Knowledge生成器(`deriveJournalPattern
KnowledgeCandidate`)を無変更で再利用してSource+Knowledge候補として追加した
(コード変更ゼロで実データに適用できることを確認)。振出人は改めて対象外と
した。ただし今回の理由は会計的な判断ではなく、システム側で機械的に判定
できる理由による: `tokenizeJournalPattern`自体は「(借)〇〇〇×××(貸)
〇〇〇×××」という形も技術的には構造化できるが、借方・貸方の両方が
同一のプレースホルダー文字列であるため、既存の並び替えExercise
(`generateJournalOrderingExercise`・`exact_sequence_match`は選択肢の
文字列を位置ごとに比較するだけで、同じ文字列を持つ複数チャンクを区別
しない)にかけると、名宛人・指図人(固定科目を正しい位置に置けるかを問う)
とは異なり、実質的に学習内容が空になる問題が生成されてしまうことを
確認した。原則4(推測しない)に照らし、この構造上の理由による保留は、
無理に実装せず`outOfScopeDetections`に記録するに留めた
(`planning/exchange_bill_drawer_journal_material_inquiry.md`参照)。
**Knowledge候補2件はいずれも`candidate`のまま(承認していない)**。

## 第5ケース: 外貨建取引(テーマ11、換算方法の定義式+適用例)の追加(完了)

第1〜4ケースではまだ検証できていない構造を優先して選定した。候補として
テーマ7-10(仕入諸掛按分計算、複合分数)・テーマ11(外貨建取引等)・
テーマ3(記帳方法比較表)を実PDFから比較検討し、テーマ11を選定した
(`planning/stage3_additional_validation.md`のD3で「境界はあるが反復先
定義が教材上見当たらない」という未解決の矛盾ケースとして指摘されていた
実データそのものであり、実装を通じてこの矛盾が実際には解消できることを
確認できる点、既存インフラ〈calculation_formula・テーマ横断統合〉を
最大限再利用しつつ新しい形状を1つだけ検証できる点を優先した)。

- **新しい計算式の形状**: テーマ11-1の定義式「外貨建取引額×為替レート＝
  円換算額」は、既存の`detectTermBasedFormulas`(括弧内減算 or 先頭数値の
  いずれかを要求)に一致しない、括弧・分数を伴わない最も単純な「項×項＝
  項」という形状だった。既存検出器を条件分岐で複雑にせず、新しい検出器
  `detectPlainTermFormulas`(`src/parser/blockDetection.mjs`)・新しい
  トークナイザー`tokenizePlainTermFormula`(`src/knowledge/
  formulaTokenizer.mjs`)を追加した(第3・第4ケースと同じ、検出器を
  1形状1関数のまま増やす方針)。
- **M2層の汎化(実データ2件目で確認できた範囲)**: `deriveKnowledgeCandidate.
  mjs`の`deriveTeigakuhoKnowledgeCandidate`(第1ケース専用、blockId固定)は
  変更せず、`block.id`固定チェックを持たない汎用版
  `deriveCalculationFormulaKnowledgeCandidate`(block/structureContext/
  knowledgeId/scopeNote/tokenizeを呼び出し側から渡す)を追加した。第3
  ケースで`journal_pattern`について行った同種の汎化を、`calculation_
  formula`について実データ2件目(定額法・外貨建取引)で確認できた範囲に
  限定して行ったもの。M5(Exercise生成)・gateChecks・M4承認フローは
  無改修でそのまま機能した(レジストリ設計の裏付けをまた1件積み増した)。
- **論点横断(テーマ内)の自動確定/要確認振り分けを新しい実データで確認**:
  適用例2件(論点11-1自身の設例〈直物レート、SR〉/論点11-2の設例
  〈決算時レート、CR〉)を検出し、[8]候補確定フェーズ(縮小版、第2ケースの
  ロジックをそのまま再利用)にかけたところ、同一論点内の適用は自動確定、
  論点横断(11-1→11-2、テーマは同じだが論点が異なる)の適用は
  `needs_review`(`reason: cross_topic`)としてユーザー確認待ちになった。
  第2ケースは「テーマ横断」だったのに対し、今回は「同一テーマ内の論点
  横断」という新しい実データ配置で、既存の判定ロジック
  (`evaluateCandidateConfirmation.mjs`、`structureRef`の一致のみを見る)が
  無改修で正しく機能することを確認した。
- **ケース固有ハードコードの除去(2件目の適用例ケースの追加で顕在化)**:
  `src/devViewer/server.mjs`の`approve-as-evidence`/`reject`ルートが
  `teigakuho-application`という1ケース名に固定されていた(これまで適用例
  ケースが1件しか無かったため表面化していなかった技術的負債)ため、
  `/api/case/:caseName`と同じ動的な形へ一般化した。どの定義ケースへ
  統合すべきかは、適用例ケースJSON自身が持つ`definitionCaseName`
  フィールド(`runApplicationCandidates.mjs`等のParser出力に追加)から
  判定する。`dev-viewer/index.html`側も、`CASE_NAME_APPLICATION`という
  単一のモジュール直下定数を廃止し、描画中の`applicationData.case`を
  呼び出し側から渡す形へ一般化した。
- **運用上の教訓(実装中に発生・その場で復旧済み)**: 開発中、既に人間の
  確認(第2ケースでのユーザー承認)を経て`approved`状態になっている
  `teigakuho-definition.json`に対し、Parserの候補検出スクリプト
  (`run-application-candidates.mjs`)を「フィールド追加の確認」目的で
  不用意に再実行してしまい、`teigakuho-application.json`側の確定状態
  (confirmationStatus)が一時的にリセットされる事態が発生した(gateChecks
  がこの不整合を検知しfail-closedで停止したため、`teigakuho-definition.
  json`自体〈Knowledgeの承認状態・sourceRefs〉は無傷だった)。既存の
  確定済みデータと矛盾しないことを検証したうえで復旧した。さらに、
  上記のcaseNameハードコード除去の過程で、`approve-as-evidence`ルートの
  「読み込み」側は動的化した一方「書き込み」側(`writeCase("teigakuho-
  definition", ...)`)を直し忘れるという実装ミスがあり、ブラウザから
  実際に第5ケースの「記録する」操作を検証した際に、
  `teigakuho-definition.json`が誤って第5ケースのデータで上書きされる
  という2件目のインシデントが発生した。いずれも実データ(gitignore対象、
  `output/`配下)への影響にとどまり、コード(Git管理対象)や人間の承認
  判断そのものは失われていない。前者は再実行前の状態から、後者は
  誤って書き込まれた内容(データ自体は正しく計算されていた)から、
  タイムスタンプも含めて正確に復旧したことをgateChecks・テストスイート・
  ブラウザの3方向で確認済み。**教訓**: 人間レビューを経て状態が進んだ
  ケースファイルに対し、Parserの候補検出スクリプトを「軽い確認」目的で
  再実行しない(idempotencyは「人間レビュー前」の範囲でのみ保証される)。
- **実データ確認**: `node scripts/run-foreign-currency-case.mjs` → `node
  scripts/run-foreign-currency-knowledge-candidate.mjs` → `node scripts/
  run-foreign-currency-application-candidates.mjs`の順に実行し、ブラウザ
  (開発用確認UI)で全6ケースが並んで表示されること、専門家レビューUIの
  「記録する」操作(論点横断の適用例の人間確認統合)が実際に機能すること
  を確認した。**Knowledge候補は`candidate`のまま(承認していない)**。
- **申し送り**: テーマ11の教材には、この他に「仕訳なし」という結果になる
  項目(外貨建前渡金、決算時に換算替を行わない旨の説明)、1つの局面に
  複数の仕訳が同居する項目、月割計算のような複合(3つ以上の項の掛け算+
  埋め込まれた分数)な計算式が存在する。今回は「項×項＝項」という最も
  単純な形状のみを対象とし、これらは意図的に対象外とした(検出器の
  `×`/`＝`が複数回現れる行を除外するガードにより、機械的に対象外に
  なっている。教材内容としては存在するが、今回のスコープでは候補にすら
  していない)。将来、これらの構造を検証する際の実データ候補として
  記録しておく(下記「後回し」にも追記)。

## 別ケースへの誤書き込み防止(fail-closedガードの追加、完了)

第5ケースで発生した「適用例ケースの`approve-as-evidence`操作が、取り違え
により別のケースファイルへ書き込んでしまう」事故を受け、構造的な再発防止
策を`src/devViewer/server.mjs`へ追加した。大規模な基盤改修は行わず、
今回の事故を直接防止できる最小限の対策にとどめた。

- **`writeCase`自体にfail-closedガードを追加**: 書き込み先のファイル名
  (caseName)と、書き込もうとしているデータ自身が持つ`case`フィールドが
  一致しない場合、書き込みを拒否するようにした(M4承認/除外/修正・
  適用例候補の承認/却下、`writeCase`を呼ぶ全ルートに自動的に適用される)。
- **2段階書き込みの原子性を確保**: `approve-as-evidence`ルートは
  applicationCase/definitionCaseの2ファイルを書き込むが、1つ目の書き込みが
  成功した後に2つ目が(上記ガード等で)失敗すると、2ファイル間の整合性が
  崩れた状態が残ってしまう(実際に発生した事故はこのパターンだった)。
  両方の書き込み先を、実際に書き込む前にまとめて検証するよう変更した。
- **回帰テスト追加**: `test/devViewer/candidateEndpoints.test.mjs`に、
  書き込み先のファイル名と別のcaseフィールドを持つ定義ケースファイルを
  意図的に用意し、承認操作がfail-closedで拒否され、かつどちらのファイルも
  書き換わらないことを検証するテストを追加した。

## 第6ケース: 仕入諸掛の按分計算(テーマ7-10、平均法)の追加(完了)

第1〜5ケースではまだ検証できていない構造として、テーマ7-10(仕入諸掛)の
按分計算(平均法)を選定した。実PDF調査の過程でテーマ8-3〜8-6(減価償却費の
月割計算)も候補として比較したが、抽象的な定義が教材上どこにも見当たらない
ことが判明したため今回は対象外とし(下記「月割計算の教材内容確認」参照)、
論点内に明示的な抽象定義式(「(1) 平均法」「(2) 先入先出法」)がある本ケースを
選定した。

- **分数の分母が単一項ではなく演算を含む式である形状を新たに確認**:
  定義式「（期首仕入諸掛＋当期仕入諸掛）×（期末商品／（期首商品＋当期
  仕入高）)＝期末仕入諸掛」の分母(期首商品＋当期仕入高)は、これまでの
  全ケースで初めて「単一項ではない分数の分母」だった。5トークン語彙
  自体(fraction.numerator/denominatorがトークン配列であること)は変更
  せずに表現できたが、線形テキストへ書き起こす際に演算子の優先順位が
  曖昧にならないよう、`renderTokens`のfraction分岐へ「複数トークンから
  なる分子/分母には括弧を補う」処理を追加した(単一項の場合〈既存の全
  ケース〉は括弧を付けない、既存の往復整合性への影響が無いことをテストで
  確認済み)。
- **新しい検出器**: 定義式の先頭グループが減算(－)ではなく加算(＋)である
  ため、既存の`detectTermBasedFormulas`に一致しない。新しい検出器
  (`detectAdditionGroupFormulas`)を追加した(第3〜5ケースと同じ、検出器を
  1形状1関数のまま増やす方針)。
- **M2層の汎化を3件目の実データで確認**: `deriveCalculationFormulaKnowledge
  Candidate`(第5ケースで追加した汎用版)を、3件目のcalculation_formula
  Knowledge(定額法・外貨建取引に続く)としてコード変更なしで再利用できる
  ことを確認した。
- **Faithful Restorationは座標対応付けではなく個別確認済み補正を採用**:
  第2ケースの`restoreFractionByPosition`(座標ベースの自動対応付け)は、
  分子・分母の断片が「数値＋年/月」という限定的な形(第2ケースの適用例)を
  前提に作られており、本ケースの分子・分母(「期末商品」「期首商品＋当期
  仕入高」という任意の漢字項)には対応しない。今回は実データ1件のみのため、
  汎用的な複数分数の座標対応付けロジックへ先回りして一般化せず、第1ケースと
  同じ個別確認済み補正(`applyKnownCorrection`、`input/corrections/
  apportionment-average-definition.json`)を採用した(原則6)。
- **実データ確認**: ブラウザで全9ケースが並んで表示されること、往復整合性
  (分母の括弧を含む)がブラウザ側でも正しく再計算されることを確認した。
  **Knowledge候補は`candidate`のまま(承認していない)**。
- **申し送り**: 同じ論点にあるもう1つの按分計算式(先入先出法、分母が単一項の
  より単純な形状)は、今回は対象外とした(第1ケースが定額法のみを対象とし
  定率法・級数法を対象外としたのと同じ判断)。次フェーズ以降の候補として
  記録しておく。

## 減価償却費の月割計算(期中売却/除却/焼失/買換)の教材内容確認 — 依頼中

第6ケースの選定調査で見つけた計算式について、教材の記述を整理し、
ユーザーへの確認材料として`planning/depreciation_proration_formula_
material_inquiry.md`にまとめた。テーマ8-3(売却)〜8-6(買換)で、
「資産の帳簿価額×（１／耐用年数）×（経過月数／12か月）＝月割計算した
減価償却費」という同じ形の式が、具体的な数値のまま少なくとも7回・4つの
異なる論点にわたって繰り返し使われていることを確認したが、これまでの
全ケースとは異なり、教材上どこにも数値を使わない「型」としての抽象的な
表現が見当たらなかった。この計算式を(A)具体例をそのまま型として記録する、
(B)記録を見送る、のいずれで扱うべきかご判断いただきたい。この確認を
待つ間も開発(第7ケース以降)は継続する。

## 汎用性検証フェーズの終了判定・Phase E着手(完了)

ユーザー依頼により、第1〜6ケースを「教材構造の汎用性検証フェーズ」として
アーキテクチャ観点ごとに棚卸しし、終了条件を定義・評価した
(`planning/generality_validation_phase_assessment.md`)。

- **終了条件5件を定義**: Block Detection検出器の追加(E1)・Faithful
  Restoration補正の追加(E2)・knowledgeKind単位の一気通貫(E3)・複数Source
  統合(E4)・複数Exercise/Knowledge同時存在時のUI(E5)。
- **評価結果**: E1・E2・E4は達成済み(教材構造の多様性そのものに関わる
  条件、4回・4パターン・2種類の実データで反復確認済み)。E3・E5は未達
  だが、**いずれも新しいPDFページの追加では解消しない**種類のギャップ
  (E3はjournal_pattern Knowledgeの承認待ち、E5は学習UI側の実装ギャップ)
  と判定した。
- **第7ケースは不要と判断し、汎用性検証フェーズを終了**。次フェーズ
  (Phase C: 教材の本格投入、Phase D: 財表ドリルとの統合、Phase E: 初版
  完成)の大枠を整理した。Phase C・Dは着手前にユーザー確認が必要な
  アーキテクチャ論点を含むため保留し、Claude Code側で完結できる**Phase
  Eの一部(E5)を先に着手**する方針とした。
- **E5(学習UIの複数Exercise対応)を実装・完了**: `learning-ui/index.html`
  が`data.exercises[0]`固定で、承認済みKnowledgeが何件あっても常に1問しか
  表示できなかった問題(第1ケース時点から持ち越されていた既知の制限、
  `vertical_slice_mvp_retrospective.md`2節)を修正した。問題一覧画面
  (問題番号+出題形式ラベルのみ、教材内容〈正解〉は一切表示しない)→
  選択した問題の解答画面→結果画面(「問題一覧に戻る」を追加)という
  画面遷移を追加した。一覧の見出しラベル(「計算式の並び替え」等)は
  アプリ側の固定文言であり、教材由来のテキストではない
  (`instructionOrigin: app_generated`と同じ位置づけ)。
- **実データ確認**: 実際のブラウザで、一覧表示(実データ1問)・解答画面への
  遷移・「問題一覧に戻る」の往復を確認した。複数問題が同時に存在する
  状態でのレンダリング・独立した状態管理・「解答済み」表示は、
  架空データ(教材原文ではない)2問を一時的に用いた検証で確認し、確認後は
  `node scripts/run-teigakuho-exercise.mjs`で実データの状態
  (`output/exercises/exercises.json`、gitignore対象)へ復元した。

## Phase C着手前のアーキテクチャ確認・本格投入を妨げる問題の修正(完了)

ユーザー依頼により、Phase C(教材の本格投入)着手前に5点(ボトルネック・
レビュー量の見積り・現在ケース単位の処理をどう実行するか・データモデルの
大量生成耐性・Phase C完了条件)を確認した
(`planning/phase_c_readiness_assessment.md`)。既存アーキテクチャ(Source/
Knowledge/Exerciseの3層責務分離等)は変更せず、本格投入を妨げる具体的な
3点のみを修正した。

- **ボトルネックの特定**: Knowledge層以降(承認・Exercise生成・学習UI)は
  既に量産に耐える設計であることを確認した。ボトルネックはM1(Source生成
  オーケストレーション)層に限定される——「新しい行形状」ではなく「既に
  確認済みの形状を別ページへ適用するだけ」でも新しい.mjsファイルを要求する
  点が非効率と判定した。
- **共通オーケストレータヘルパーの抽出**(`src/parser/formulaCaseHelpers.mjs`):
  「単一の計算式定義を確定Sourceにする」という第1・第5・第6ケースで
  3回確認できた共通の骨格(テーマ/論点見出し検出・F3確定・ContentBlock
  組み立て・書き出し)を抽出し、3つの既存スクリプト(`runTeigakuhoCase.mjs`・
  `runForeignCurrencyCase.mjs`・`runApportionmentCase.mjs`)をこのヘルパー
  経由へ書き換えた。検出器・候補選別・Faithful Restorationはケースごとに
  実際に異なるため、引き続き各ファイルに残した(1つの`caseConfig`駆動関数へ
  無理に統合しない、CLAUDE.md原則5・6)。**リファクタ前後で出力が完全に
  一致すること(`block`・`structureContext`・`outOfScopeDetections`が
  バイト単位で同一)を、一時パスへの実行結果と実データを比較して確認した
  (実際の`output/cases/`は変更していない)。**
- **ID一意性検証gateChecksの追加**(`src/gateChecks/idUniquenessChecks.mjs`):
  確定Source ID・Knowledge IDがケース横断で重複していないかを検証する。
  `approvedKnowledgeStore.mjs`(承認済みKnowledgeの派生ビュー再生成、M4の
  操作のたびに毎回呼ばれる)へ組み込み、重複時はfail-closedで書き出しを
  拒否する。教材投入量が増えるほど、人間が手動命名するIDの衝突リスクが
  増すため、量産前に追加した。あわせて、この走査が`.test.json`(統合
  テストの一時出力、実ケースと同じID値を持つ)を対象外とするよう修正した
  (対象に含めると、テスト実行環境で検証が常に誤検知する)。
- **開発用確認UIのケース一覧を動的化**: `dev-viewer/index.html`の
  `DEFINITION_CASES`ハードコード配列を廃止し、新しい`/api/cases`
  エンドポイント(`output/cases/`配下を走査し、定義ケース/適用例ケースを
  動的に判別して返す)から取得する形へ変更した。新しいケースファイルを
  追加するたびに手動でこの配列を編集する必要が無くなった。
- **実データ確認**: ブラウザで全9ケースが`/api/cases`経由で正しく表示
  されること、定義ケース+適用例ケースのペアリング(teigakuho-definition⇔
  teigakuho-application等)が動的に解決されることを確認した。

## 後回し(縦切りMVP完了後、`vertical_slice_mvp_roadmap.md`9節で判断済み)

- [ ] Source候補一覧レポートの正式フィールド名・型のコード化
- [ ] `provenance`・`diag`の正式フィールド名・型のコード化
- [x] [8]候補確定フェーズの詳細設計(人間レビューへの提示形式) — 上記
      「第2ケース」で完了。自動確定+専門家レビューUIとして実装済み
- [ ] **トピック固有の会計方針をDerived Knowledgeとして捕捉する設計**
      (`planning/p193_multi_knowledge_analysis.md`4節(b)で保留と結論)。
      例: 自社利用のソフトウェアは定額法・残存価額ゼロ・償却期間の
      原則的上限で処理する、といったテーマ説明部分に一箇所だけ明示される
      規則。現行の`detectTermBasedFormulas`(数式行専用)とは異なる説明文
      検出器・新しいknowledgeKind・独自のSource確定フローが必要になる
      見込みで、複数の教材・複数のテーマで同種パターンが繰り返し
      確認された時点で着手する
- [ ] **1つのSource範囲から複数のKnowledge候補(既存Knowledgeの適用例＋
      独立した新規Knowledge候補)が同時に成立しうるケースへの一般的な
      対応方針**(`planning/p193_multi_knowledge_analysis.md`で初めて
      具体的に確認された論点)。今回の実装(`evaluateAutoConfirmation`・
      `confirmAndIntegrateCandidate`・専門家レビューUI)は、いずれも
      「1つの適用例Source→1つの既存KnowledgeへのsourceRefs追加」という
      今回のケースの範囲に限定してあり、複数Knowledge候補への分岐を
      構造的に妨げるものではないことを確認済み(`sourceRefs`はKnowledge
      側が持つ参照であり、同一Sourceが将来複数のKnowledgeから参照される
      こと自体は現行スキーマ上禁止されていない)。ただし、それを実際に
      検出・提示する仕組みは未設計であり、上記の会計方針Knowledge化と
      合わせて次フェーズ以降の課題とする
- [ ] D2の`relation`拡張問題(本文個別仕訳↔要約表)への対応方針検討
      (候補提示方針とは独立した論点、`stage3_additional_validation.md`)
- [ ] Exercise層(仕訳穴埋め・公式並び替え)の設計・実装
- [ ] 残り7冊へのスケール方針の検討
- [ ] M1実装で判明した未決事項(`m1_implementation_report.md`10節): 抽出
      ツール〈pdftotext→PyMuPDF〉の恒久判断、python実行環境差、級数法の
      `precedingHeading`検出の既知の制限、複数計算式の汎用的な選別方法、
      `location.printedPageLabel`/`outOfScopeDetections`の正式スキーマ化
- [ ] M2実装で判明した未決事項(`m2_derived_knowledge_candidate_design.md`
      12節): `distinctBooks`の正式なbook ID体系、往復整合性チェックを
      正式な`gateChecks`の枠組みへ統合するかどうか、`content.structure`の
      トークン化ロジックをどこまでケース固有のまま保つか、Derived Knowledge
      候補・確定Knowledgeの正式なファイル配置
