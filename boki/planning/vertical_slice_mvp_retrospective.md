# 縦切りMVP振り返り(M1〜M6)と次フェーズの提案

本ファイルは、`planning/vertical_slice_mvp_roadmap.md`で計画した縦切りMVP
(M1〜M6)が実際にPDFから学習UIまで一本通った時点での振り返りと、次に
着手すべき開発フェーズの提案である。対象は一貫して定額法の定義式ブロック
(テーマ8-2)1ケースのみ。

参照資料: `planning/m1_implementation_report.md`〜
`planning/m6_learning_ui_implementation_report.md`(各フェーズの実装報告)、
`planning/parser_design_proposal.md`(第4版・Parser正式設計)、
`planning/source_derived_knowledge_design_proposal.md`(データモデル正式設計)。

---

## 1. 今回実証できたこと

実教材(`★簿記論 No.1 基本テキスト.pdf`)を使い、次を実データで確認した。

- PDFから機械的にテーマ/論点構造を検出し、パターン検出器で用語ベース計算式を
  検出できること
- Faithful Restoration(`fraction_split`補正)が実際のPDF抽出崩れに対して
  fail-closedに機能すること(既知パターン以外は処理を止める)
- Source→Derived Knowledge変換で、`rawFormula = sourceFaithful`という不変
  条件・5トークン語彙による構造化・往復整合性チェックが実データで機能すること
- 3軸モデル(contentConfidence/evidence/consolidation)が実データにそのまま
  適用でき、機械的な確信度閾値を使わずに「内容確信度は高いが証拠は少ない」を
  表現できること
- `reviewStatus`をKnowledge本体の外側に分離するという設計判断が実際に機能し、
  ユーザー自身がブラウザから承認・除外を試せたこと
- `approved-knowledge.json`という「正本からの一方向の派生ビュー、毎回全件
  再生成」というパターンが、二重管理のドリフトを防ぐ形で実際に機能すること
- Knowledge→Exercise変換で、教材忠実性(`reveal`)とアプリ生成情報
  (`prompt.instruction`)を明確に分離できること
- `answer.grading.method`によるレジストリ方式の正誤判定が、生成側(M5)と
  実行側(M6)で同じ実装を共有する形で機能すること
- Source由来情報(`sourceRefs`)がExercise・学習UIまで一貫して追跡可能で
  あること(原則3の徹底)
- 全段階がfail-closedな検証(往復整合性・状態遷移・ID/kind検証等)で保護され、
  6回のcommitを通じて教材原文・PDF・`input`/`output`が一度もGitへ混入
  しなかったこと

**これは「デモが動いた」以上の意味を持つ**。CLAUDE.mdの8原則(教材優先・
原文保持・出典追跡・推測しない・出題形式非固定・段階的投入・教材保護・
検証可能性)が、抽象的な理念ではなく実際のコード・データフローとして機能する
ことを、1ケースについて確認できた。

---

## 2. まだ「この1ケース専用」のもの

- Parserのページ番号(`THEME_PAGE=150`・`TOPIC_PAGE=155`)・「定額法」という
  文字列による候補選別(`runTeigakuhoCase.mjs`)
- 用語ベース計算式トークナイザーが「（A－B）×（C／D）＝E」という1つの形状
  にしか対応していない(`tokenizeSubtractFractionFormula`)
- `block-teigakuho-def`・`dk-calc-formula-teigakuho`等のIDがハードコードされ、
  M2・M4・M5の随所に`このM◯実装は◯◯専用です`という明示的なガードがある
  (意図的な「先回りしない」判断の結果)
- `computeEvidenceAndConsolidation`は`sourceRefs.length === 1`のみサポート
  (複数Sourceの統合ロジックは未実装)
- Exercise生成・学習UIは常に「1問だけ」を前提にしている(`exercises`配列は
  存在するが、複数件を扱うUI・ロジックは無い)

---

## 3. 汎用化できているもの(考え方・型として)

- 4概念モデル(`extractionRaw`/`sourceFaithful`/`parsed`/`diag`)のフィールド
  構造そのもの
- 「個別確認済みノイズのみ補正し、想定外はfail-closedで停止する」という補正
  パターン(Faithful Restoration・Exercise生成の往復整合性再検証で2回使われた)
- 3軸モデルのフィールド構造
- `reviewStatus`外部化+`candidate→approved/rejected`の一方向状態遷移という型
- 「正本から毎回全件再生成する派生ビュー」というパターン
  (`approved-knowledge.json`)
- `answer.grading.method`のレジストリという拡張点(M5・M6で共有)
- `/lib/`配下の共有ロジック配信という仕組み(`formulaTokenizer.mjs`・
  `gradingRegistry.mjs`の2件が既にこのパターンに乗っている)
- M3開発用確認UIへ段階的にセクションを追加していくという開発サイクル自体

**アーキテクチャパターンとしては汎用化されているが、具体的な実装(正規表現・
ID・判定ロジック)はケース固有のまま**、という状態である。これは意図的な
判断(先回りして抽象化しない)の結果であり、次のケースで初めて「本当に
汎用化すべき境界線」が見える。

---

## 4. 次のケースを追加すると初めて検証できるもの

- **候補提示方針・[8]候補確定フェーズ**: 今回のケースはF3(トップレベル)で
  即座に確定したため、Parser設計第4版の最大の成果物である「候補検出→人間
  確認」という経路が**一度も実地で通っていない**。
- 親子Source構造・`provenance`/`relation`(`extracted_from_parent`等)
- `sourceRefs.role = application`の実際の使用(現状`definition`のみ)
- `consolidation.state = merged_confirmed`への遷移(複数Source統合)
- `evidence.byRole`が複数ロールを持つケース
- Source候補一覧レポートの実データでの中身(現状「候補0件」という構造のみ
  確認済み)
- 複数Exercise・複数Knowledgeが同時に存在する状態でのM3〜M6の挙動

---

## 5. 今後の本格開発前に解決すべき設計課題

- [8]候補確定フェーズの正式設計(4節のとおり未検証)
- Source候補一覧レポートの正式スキーマ化
- D2の`relation`拡張問題(1対1前提のモデルでは表現できない関係、
  `stage3_additional_validation.md`から持ち越し)
- 複数問題・複数Knowledgeを扱うデータ構造(現状「1件専用」の生成ロジック・
  UIをどう拡張するか)
- 抽出ツール(`pdftotext`→`PyMuPDF`)の恒久判断、python実行環境差
- book ID体系(`distinctBooks: ["book-1"]`が仮値のまま)

---

## 6. 現時点で技術的負債になっている箇所

- `EXPECTED_BLOCK_ID`/`EXPECTED_KNOWLEDGE_ID`等の文字列定数によるガードが
  M2・M4・M5に分散している。次のケースを追加する際、同じパターンを機械的に
  複製するのか、ここで初めて抽象化するのかの判断が必要になる。
- `precedingHeading`検出範囲(6行)の既知の制限(級数法で発生、M1から持ち越し)
- python3/pythonのエイリアス問題(環境依存、M1から持ち越し)
- `location.printedPageLabel`・`outOfScopeDetections`等、正式設計にない
  補足フィールドが複数箇所に存在する(M1由来)
- `output/cases/`・`approved-knowledge.json`・`exercises.json`という3段階の
  派生ストアが、ケース数が増えた際の全件スキャン再生成コストをまだ検証
  していない(現状1ケースのみのため問題が顕在化していない)

---

## 7. これまで保留していた未決事項の現在の重要度

| 未決事項 | 現時点の重要度 | 理由 |
|---|---|---|
| Source候補一覧レポート・`provenance`/`diag`の正式スキーマ化 | **中〜高** | 第2ケース(4節)に進むなら実質必須 |
| D2の`relation`拡張問題 | 低 | まだ実例に遭遇していない。第2ケースでも発生しない見込み(1対1関係) |
| 抽出ツールの恒久判断 | 低〜中 | 現状動作しているが、他の実行環境での再現性に懸念が残る |
| 複数knowledgeKind対応(`journal_pattern`等) | 中 | 教材の対象範囲を広げる場合に必要。今は不要 |
| 残り7冊へのスケール | 低 | 時期尚早 |
| 学習履歴・ランダム出題・複数問題 | 低 | 今回のユーザー方針(Knowledgeと問題が増える仕組みの強化)より優先度が低い |

---

## 8. 次の開発フェーズの比較・提案

### 8-1. 選択肢の比較

| 選択肢 | 内容 | 評価 |
|---|---|---|
| **A. 第2ケースを追加してParser/Knowledge/Exerciseの汎化を検証する** | 定額法の複数適用(テーマ8/9、`vertical_slice_mvp_roadmap.md`3-2節で選定済み)を通す | **推奨**(8-2節) |
| B. 教材の対象範囲を広げてSource/Knowledgeを増やす | 他の論点・他冊を新たに調査・投入する | 現状のParser/Knowledge生成は1ケース専用のガードだらけ(2節)。汎化を検証しないまま量だけ増やすと、CLAUDE.md原則6(手戻り最小化)に反するリスクが高い |
| C. 問題形式を増やす(穴埋め等) | `journal_pattern`向けの穴埋め形式を追加する | 対応する`journal_pattern`のKnowledgeがまだ存在しない(結局Bの一部が前提になる)。優先度低 |
| D. 学習UIを改善する | デザイン・UX向上 | ユーザー自身が「見た目の完成より仕組みの強化を優先したい」と明言。優先度低 |
| E. レビュー・公式化フローを改善する | [8]候補確定フェーズの正式化等 | 4節・5節のとおり、実データ(候補が実際に発生するケース)が無いと要件が定まらない。**Aと組み合わせて検証するのが効率的** |
| F. その他 | — | 特になし |

### 8-2. 推奨: A(第2ケースの追加)を最優先とし、その中でEを検証する

**理由:**

1. **最大の未検証リスクがAでしか解消できない**: 現在の実装は「候補化されず
   即座に確定する最も簡単な経路」しか通っておらず、Parser設計第4版の中核
   成果物(候補提示方針・[8]候補確定フェーズ)が一度も実地検証されていない
   (4節)。これは機能追加より先に解消すべき技術的リスクである。
2. **ユーザーの願望(教材を読み込ませればKnowledgeが増える仕組みを強くする)
   は、Bを先にやっても達成できない**: 現状は`EXPECTED_BLOCK_ID`のような
   ハードコードされたガードだらけであり(6節)、量を増やす前に「2件目が
   来たときに何が壊れるか」を実地で確認し、どこを汎用化すべきかを見極める
   必要がある。これはA(2件目を実際に通す)を経て初めて設計できる。
3. **調査コストがほぼゼロ**: 第2ケース(定額法の複数適用、テーマ8/9)は既に
   `vertical_slice_mvp_roadmap.md`3-2節で選定済みであり、新しい論点を探す
   必要がない。CLAUDE.md原則6(1冊単位で段階的に検証)にも合致する。
4. **複数Exercise/複数Knowledgeの挙動も自然に検証できる**: 第2ケースを通す
   過程で、M3〜M6に散在する「1件専用」の前提がどこで崩れるかが分かる。

**Aで得られた知見をもとにBへ進む、という順序を提案する。** ユーザーの
優先度(Knowledgeと問題が増える仕組みの強化)自体は正しい方向性だが、
それを実現する最短路は「先に量を増やす」ことではなく、「今の1ケースの
延長で、量が増えたときに壊れる場所を先に特定・設計する」ことだと判断する。

### 8-3. 第2ケースで具体的に検証すべき項目(参考)

`vertical_slice_mvp_roadmap.md`3-2節・`m1_minimal_parser_prototype_design.md`
の記述と、今回の実装経験を踏まえると、次を検証することになる見込みである。

- Stage3候補検出(テーマ8/9の設例内に教材明示の区切りなしで現れる計算行)
- Source候補一覧レポートへの実データ登録
- [8]候補確定フェーズ(人間レビューが「この計算行を独立参照が必要な子Source
  として確定するか」を判断する、最初の実例)
- `provenance`(`relation: extracted_from_parent`)・親子`sourceFaithful`
  重複の許容
- Derived Knowledge側の複数Source統合(`sourceRefs`に`application`role追加、
  `evidence.byRole = {definition: 1, application: N}`、`consolidation.state:
  merged_confirmed`)
- 同一Knowledgeに対する複数Sourceの追加が、M3〜M6の「1件専用」前提を
  どう壊すか(または壊さないか)

**この節は参考情報であり、正式な設計は次フェーズ着手時に改めて行う。**

---

以上が縦切りMVP(M1〜M6)の振り返りと次フェーズの提案である。次フェーズの
コード実装にはまだ進んでいない。ユーザー確認を得たうえで、次の設計フェーズへ
進む。
