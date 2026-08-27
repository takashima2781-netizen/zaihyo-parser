# 縦切りMVP: 教材追加フェーズへの準備状況の棚卸し

M1〜M6、および第2ケース対応(Source追加の自動化・専門家レビューUI)までの
実装コード全体を対象に、ケース固有のハードコードを洗い出し、「教材を
増やしていける状態になっているか」を評価した結果である。

**本ファイルは調査・分類・推奨方針の提示のみである。コード変更・
commit/pushには一切進んでいない。**

調査方法: `src/`・`scripts/`・`dev-viewer/index.html`・
`learning-ui/index.html`の全ファイルを実際に読み、`teigakuho`・
`dk-calc-formula-teigakuho`・`block-teigakuho-def`・特定ページ番号・
特定の正規表現形状等のハードコードを直接コードから確認した(推測に
よるものではない)。

---

## 1. ハードコード一覧と分類

分類基準:

- **A. 今の段階でも汎化すべきもの**: 汎化のコストが低く、かつ現状のままだと
  正しく動かない(バグに近い)、または今すぐ直しても将来の設計判断を
  先取りしすぎるリスクが無いもの。
- **B. レジストリ等へ移せば教材追加時に設定だけで対応できるもの**: 既に
  近い形はあるが、コード追加ではなく設定追加で対応できる形にはまだ
  なっていないもの。
- **C. ケース固有実装として残して問題ないもの**: 意図的にスコープを
  絞った設計であり、CLAUDE.md原則(教材は一度に大量投入しない・汎用
  パーサーへ発展させない)と整合しているもの。
- **D. 実データの追加ケースを見ないと一般化すべきか判断できないもの**:
  汎化の「正しい形」が、今の1〜2ケースだけでは決められないもの。

### 1-1. Parser層

| # | 対象 | 内容 | 分類 | 理由 |
|---|---|---|---|---|
| 1 | `runTeigakuhoCase.mjs`(M1オーケストレータ) | `THEME_PAGE=150`/`TOPIC_PAGE=155`固定、"定額法"というテキスト一致、`block-teigakuho-def`固定ID、`printedPageLabel: "126"`固定 | **D** | ファイル冒頭のコメントで「このケース専用に書く(汎用`runPipeline(caseConfig)`のような抽象化はまだ作らない)」と最初から明記された意図的な設計。次のケース(第2ケースの`runApplicationCandidates.mjs`)も同じパターンで書かれており、2例そろって初めて「何が`caseConfig`として括り出せるか」が見え始めている段階。今この2例だけで抽象化すると、たまたま両方とも「テーマ+論点のページ番号が既知」という前提に寄りすぎた設計になるリスクがある |
| 2 | `runApplicationCandidates.mjs`(第2ケース) | `THEME_B_PAGE=190`/`TOPIC_B_PAGE=191`/`CANDIDATE_A_PAGE=158`等、6個のページ番号・印字ページラベル定数 | **D** | 同上。#1と同型の専用オーケストレータ |
| 3 | `structureRecognition.mjs`(`detectThemeHeading`/`detectTopicHeading`) | 正規表現ベース、テーマ番号・論点番号の全角/半角ゆれを吸収する汎用ロジック。ページ番号等のハードコードなし | **A(既に達成)** | 引数のページテキストだけで完結し、ケース固有の値を一切持たない。ただし「テーマ／論点」という見出し語彙・書式自体は本書1冊の書式に基づく。他教材で同じ書式かは#20参照 |
| 4 | `blockDetection.mjs`(`FORMULA_LINE_PATTERN`) | 「（A－B）×...＝...」または「数値×...＝...」という用語ベース計算式2形状の正規表現。仕訳型・方程式型等の他パターンには非対応 | **C** | `pattern_detection_survey.md`で仕訳型・方程式型等も調査済みだが、検出器自体は未実装。「用語ベース計算式検出器」は意図的に1種類のパターンへスコープを絞ったものであり、他パターン用の検出器を別途追加していく設計は既に前提とされている(CLAUDE.md原則5と同じ考え方) |
| 5 | `blockDetection.mjs`(`NESTED_LABEL_PATTERN`、「例...設」語順) | `sort=True`の読み順ヒューリスティックがアイコン隣接文字を並べ替える、本PDF固有の崩れ方に合わせた正規表現 | **D** | 今回2箇所(page158/193)で同一の崩れ方を確認したが、これが「このPDF全体の特性」か「このPDFの中でもこの2箇所だけの偶然」かは、他ページ・他教材のデータを見ないと判断できない |
| 6 | `faithfulRestoration.mjs`(`applyKnownCorrection`) | 補正データを引数で受け取る汎用関数、教材原文はコード内に持たない | **A(既に達成)** | CLAUDE.md原則7を踏まえた設計がそのまま汎用性にもつながっている好例 |
| 7 | `faithfulRestoration.mjs`(`restoreFractionByPosition`) | 座標ベースの分数対応付けアルゴリズム自体は汎用(教材固有の値を持たない) | **A(既に達成)** | ただし`FRACTION_FRAGMENT_LINE = /^[０-９0-9]+[年月]$/`が「年」「月」という単位に限定されている | 
| 7' | 同上、単位の限定 | 分数の分子/分母が「年」「月」以外の単位(円・％・回等)になるケースに非対応 | **D** | 今回の2ケースがいずれも期間(年)の分数だったための限定。他の単位を持つ分数付き計算式が実際に出てきた時点で拡張すべき |
| 8 | `sourceSegmentation.mjs`(`applyF3`) | 完全に汎用(`nestedUnder`のみを引数に取る) | **A(既に達成)** | — |
| 9 | `evaluateCandidateConfirmation.mjs` | 関数シグネチャ自体は汎用(`candidate`+`definitionInfo`)。ただし判定条件(F9=同一topic内か等)自体は2候補でのみ検証済み | **A(構造)/D(条件の妥当性)** | 呼び出し方は既に汎用だが、「この3条件で本当に十分か」は次のケースで反例が出るかもしれない。ファイル内コメントで「複数定義候補が検出されるケースは未対応」と既に明記されている |
| 10 | `candidateActions.mjs`(`buildConfirmedSource`の`blockKind: "formula_termbased"`) | 確定Sourceの`blockKind`が固定値 | **C** | 現状、用語ベース計算式以外のblockKindを生成する経路が無いため問題ないが、#4の仕訳型検出器等が追加された時点で、検出結果から`blockKind`を引き継ぐ形へ直す必要がある |

### 1-2. Knowledge層

| # | 対象 | 内容 | 分類 | 理由 |
|---|---|---|---|---|
| 11 | `formulaTokenizer.mjs` | `tokenizeSubtractFractionFormula`/`tokenizeBareNumberFractionFormula`という2つの固定形状の関数。新しい式形状には非対応(fail-closed) | **C(現状維持)、B寄りの将来候補** | CLAUDE.md原則5(未知形式に対応できる設計)を踏まえると、「形状パターン→トークナイズ関数」のレジストリ化は技術的には今すぐでも可能な軽い変更ではある。ただし現状2形状しかなく、レジストリ化の「正しい登録単位」(正規表現1個に対し関数1個でよいか、形状によって分子/分母の数が可変になるケース等が今後出るか)は3つ目の形状が実際に出てから判断する方が安全 |
| 12 | `deriveKnowledgeCandidate.mjs`(`deriveTeigakuhoKnowledgeCandidate`) | `EXPECTED_BLOCK_ID="block-teigakuho-def"`固定、`id:"dk-calc-formula-teigakuho"`固定 | **D** | ファイル冒頭に「汎用Knowledge生成器ではない」と最初から明記。#1と同じ「ケース専用関数」パターン。次のケースが実際に来た時点で、`caseConfig`的な括り出しが可能かを判断する |
| 13 | `deriveKnowledgeCandidate.mjs`(`computeEvidenceAndConsolidation`) | `sourceRefs`と`distinctThemes`のみを引数に取る、完全に汎用 | **A(既に達成)** | M2初回生成・M4修正時再計算・第2ケースの複数Source統合のいずれからも同じ実装を共有できている |
| 14 | `integrateApplicationSource.mjs` | 完全に汎用(特定のKnowledge ID等をハードコードしていない) | **A(既に達成)** | — |
| 15 | `reviewActions.mjs`(`approveCandidate`/`rejectCandidate`/`editCandidate`) | 完全に汎用(`caseData`全体を引数に取る) | **A(既に達成)** | — |
| 16 | `approvedKnowledgeStore.mjs` | `output/cases/*.json`を全走査し、`reviewStatus==="approved"`のものを収集。ケース名のハードコードなし | **A(既に達成)** | 新しいケースファイルが増えても、このファイルは無変更で動く |
| 17 | `processApplicationCandidates.mjs`/`confirmAndIntegrateCandidate.mjs` | 完全に汎用 | **A(既に達成)** | — |
| 18 | `gateChecks/applicationIntegrationChecks.mjs` | 関数自体は汎用(特定IDに依存しない)。ただし「第2ケースのSource統合フロー」という特定シナリオ向けのモジュール | **A** | CLAUDE.mdのgateChecks方針は元々「シナリオごとに検証モジュールを持つ」ことを想定しており、これ自体は問題ない。新しいシナリオ(新しい統合パターン)が出た時点で、新しいgateChecksモジュールを追加していく設計で良い |

### 1-3. Exercise層 — 重要な発見

| # | 対象 | 内容 | 分類 | 理由 |
|---|---|---|---|---|
| 19 | `generateFormulaOrderingExercise.mjs` | `EXPECTED_KNOWLEDGE_ID="dk-calc-formula-teigakuho"`固定チェック。Exercise `id`自体も`"exercise-teigakuho-formula-ordering"`固定 | **A(今すぐ汎化すべき)** | この関数が本質的にチェックすべきなのは`knowledgeKind==="calculation_formula"`のはずで、特定のKnowledge IDへの依存は意図的なスコープ限定というより実装上の書き忘れに近い。**このままでは、テーマ8-2以外のどんな`calculation_formula`Knowledgeを承認しても、この関数はfail-closedで拒否し続ける。** Exercise IDも`knowledge.id`から動的に導出すべき |
| 20 | `buildExercisesFromApprovedKnowledge.mjs` | `TARGET_KNOWLEDGE_ID`固定、`approvedKnowledgeData.knowledge`配列から**その1件だけ**を`find`し、常に長さ1の配列を返す | **A(今すぐ汎化すべき、最重要)** | **これは他の項目と性質が異なる、実質的なバグである。** `approved-knowledge.json`に複数のKnowledgeが並んでいても、この関数は常に1件のExerciseしか生成しない。しかも新しいKnowledgeが見つからなくてもエラーにはならず(既存の`dk-calc-formula-teigakuho`さえ見つかれば処理は「成功」する)、**新しく承認されたKnowledgeに対応するExerciseが黙って生成されない。** fail-closedであるべき箇所が、実質的にfail-open(黙って欠落)になっている。次にどんな些細なKnowledgeを1件追加・承認しても、この関数を直さない限りExerciseは増えない |
| 21 | `gradingRegistry.mjs` | `method`文字列をキーにしたレジストリ、既に理想的な形 | **A/B(既に達成)** | 新しい判定方式を追加する際は、レジストリへ1エントリ追加するだけで済む設計になっている。他の層(#11のformulaTokenizer等)が目指すべき形の実例 |

### 1-4. UI/サーバ層

| # | 対象 | 内容 | 分類 | 理由 |
|---|---|---|---|---|
| 22 | `server.mjs`(`ALLOWED_CASES`) | `Set(["teigakuho-definition","teigakuho-application"])`という明示的ホワイトリスト | **B** | パストラバーサル対策自体は既にURLの正規表現(`[a-zA-Z0-9_-]+`)で別途保証されているため、このホワイトリストは「意図しないファイルを晒さない」ための追加の安全弁という位置づけ。`output/cases/`ディレクトリを走査して動的に許可リストを生成する形に変えれば、教材追加のたびにこの定数を編集する必要がなくなる。緊急度は高くないが、変更コストも低い |
| 23 | `dev-viewer/index.html`(`CASE_NAME`/`CASE_NAME_APPLICATION`) | 定数として1ケースペアのみを対象にした表示・操作ロジック全体 | **D** | M3(開発用確認UI)はそもそも「1論点のPDF→Source→Knowledgeの一気通貫の流れを追跡できるようにする」という目的で作られたものであり(`vertical_slice_mvp_roadmap.md`)、複数ケースを横断的に一覧するUIへ発展させるべきかどうかは、実際に3ケース目以降が並存する状態になってから判断する方が適切。今のままでも「1ケースずつ丁寧に確認する」用途は引き続き成立する |
| 24 | `learning-ui/index.html` | `/api/exercises`を取得し、返ってきた配列を全件表示する設計。ケース名等のハードコードなし(エラーメッセージ内のスクリプト名言及のみ) | **A(既に達成)** | #20の不具合さえ直れば、複数教材のExerciseが増えてもこの画面はそのまま複数問題を表示できる設計になっている |

### 1-5. スクリプト層

| # | 対象 | 内容 | 分類 | 理由 |
|---|---|---|---|---|
| 25 | `scripts/run-teigakuho-*.mjs`・`run-application-candidates.mjs` | `input/book1.pdf`固定、出力ファイル名・ケース名がすべて固定 | **D** | #1・#2と同じ理由。CLIオーケストレータの抽象化パターン(`caseConfig`等)は、次の教材で実際に何が変わり得るか(PDFファイル名だけか、ページ範囲の与え方も変わるか等)を見てから設計すべき |

---

## 2. 「Source→Knowledge→Exerciseで知識と問題を増やしていける」状態への到達度

ユーザー指定の5分類で評価する。

### 2-1. 新しい教材を追加するだけで自動的に処理できる部分

**ほぼ無い。** PDF抽出そのもの(`extract.mjs`/`pymupdf_extract.py`)は
任意のPDF・任意のページを受け取れる汎用実装だが、それを呼び出す
オーケストレータ(M1相当)は教材・論点ごとに専用コードが必要
(表1-1の#1・#2、意図的な設計)。

### 2-2. 設定・レジストリ追加だけで対応できる部分

- `gradingRegistry.mjs`(判定方式) — 既にこの形。
- `approvedKnowledgeStore.mjs`・`reviewActions.mjs`・
  `integrateApplicationSource.mjs`・`processApplicationCandidates.mjs`・
  `confirmAndIntegrateCandidate.mjs`・`gateChecks/applicationIntegration
  Checks.mjs` — Knowledge層のほとんどは既にケース非依存で動く(表1-2)。
- `learning-ui/index.html` — 既にこの形(表1-4の#24)。

**Knowledge層より後ろ(承認〜学習UI)は、想定以上に汎化が進んでいた。**
一方、**Exercise生成の入口(#19・#20)に実質的なバグがあり、この汎化が
機能していない**ことが今回の調査で判明した。

### 2-3. 現在はコード追加が必要な部分

- M1相当のオーケストレータ全体(ページ番号・見出しテキストの指定)。
- M2相当のDerived Knowledge生成関数(確定SourceのID・Knowledge IDの
  対応付け)。
- 新しい数式形状・新しいblockKindへの対応(表1-1の#4・#10、表1-2の#11)。
- (直すべき)Exercise生成の複数Knowledge対応(表1-3の#19・#20)。

### 2-4. 人間の専門判断が必要な部分

- [8]候補確定フェーズでの意味判断(構造的事実だけでは自動確定できない
  場合、テーマ横断等)。
- M4でのKnowledge採用・修正・不採用の判断。
- scopeNoteの陳腐化への気づきと更新(3節参照)。

これらは今回確立した設計(F群/G群の分離、専門家レビューUIの2層化)の
とおりであり、**教材が増えてもこの部分の設計自体は変わらない**。

### 2-5. まだ設計自体が存在しない部分

- 1つのSource範囲から複数のKnowledge候補が生まれるケースへの一般的な
  対応(3節)。
- トピック固有の会計方針(説明文由来)をDerived Knowledgeとして捕捉する
  設計(3節)。
- 複数教材にまたがるDerived Knowledgeの重複統合
  (`consolidation.possibleDuplicateOf`はフィールドとして既に存在するが、
  実際に重複を検出するロジックは未実装)。
- D2の`relation`拡張問題(本文個別仕訳↔要約表、`stage3_responsibility_
  reconsideration.md`から継続する未決事項)。

---

## 3. 今回のP193検討で見つかった3つの将来課題の棚卸し

いずれも実装には着手しない(ユーザー指示どおり)。位置づけのみ確認する。

| 課題 | 現状 | 今回のコード監査での位置づけ |
|---|---|---|
| 1つの教材箇所から複数Knowledge候補が生まれる可能性 | `TASK.md`に将来課題として明記済み(`p193_multi_knowledge_analysis.md`) | 2-5節「まだ設計自体が存在しない部分」に該当。現行スキーマ(`sourceRefs`はKnowledge側が持つ参照)がこれを構造的に妨げていないことは前回確認済み |
| 対象固有の会計ルールを独立Knowledgeとして抽出する問題 | 同上 | 同上。新しい検出器・新しいknowledgeKindが必要という結論は変わらない |
| scopeNoteがSource追加によって陳腐化する問題 | 実データで確認済み(`teigakuho-definition.json`のscopeNoteが古い記述のまま) | 2-4節「人間の専門判断が必要な部分」に近い。scopeNoteは人間所有のフィールド(Category A)であり、陳腐化の検知自体を機械的に行うのは難しい(scopeNoteの文章が実際に古くなったかどうかは意味判断を要する)。低コストな改善として、「sourceRefsが最後に変化した日時」と「scopeNoteが最後に編集された日時」を比較し、前者の方が新しければUI上に「確認をお勧めします」という軽いヒントを出す、という機械的に判定可能な代替案はあるが、これも新規実装であり今回は見送る |

---

## 4. 推奨方針

**A(今すぐ汎化してから次ケースへ進む)、B(もう1〜2ケース追加してから
汎化する)、C(現状のまま教材追加フェーズへ進める)の単純な二択・三択
ではなく、対象を分けて判断する必要がある、というのが今回の調査結果
である。**

### 4-1. 今すぐ着手すべきもの(次ケースの前に)

**表1-3の#19・#20(Exercise生成が特定のKnowledge IDしか処理できない
不具合)は、汎化の是非を議論する対象ではなく、修正すべきバグである。**
これは「まだ1ケースしか無いから専用実装で良い」という理由付けが
成立しない——**現在の1冊構成のままでも、2件目のKnowledgeを承認した
瞬間に問題化する**性質の不具合であり、次ケースを追加するかどうかに
関わらず先に直しておくべきである。修正自体も小さく(IDチェックの削除、
配列の`find`を`filter`+`map`へ変更する程度)、設計判断が必要な規模の
変更ではない。

### 4-2. もう1〜2ケース追加してから判断すべきもの

表1-1・1-2のD分類(M1/M2相当のオーケストレータ、数式形状トークナイザー、
Block Detectionのパターン検出器)は、**CLAUDE.md原則6(教材は一度に
大量投入しない、1冊単位でサイクルを回す)の考え方どおり、次の実データ
ケースを見てから汎化の形を決めるべき**と判断する。理由:

- 現状はN=2(テーマ8-2の定義+テーマ9-1の適用)のデータしかなく、この
  2例だけで「caseConfig」のような抽象化を設計すると、たまたま両方に
  共通する偶然の構造(ページ番号が既知、用語ベース計算式のみ等)へ
  過剰に最適化されるリスクが高い。
- 実際、今回の第2ケース実装でも、Faithful Restorationの座標ベース
  対応付け(#7)のように「実データを見て初めて必要になった一般化」が
  複数回発生している。これは事前の抽象化では予測できなかった。
- 一方、Knowledge層より後ろ(#12〜#18、#21・#24)は、既に十分に汎用的な
  形で実装できていることが今回の監査で確認できた。これは「後工程ほど
  ケース固有の情報から遠い(Knowledge/Exercise/学習UIはSourceの
  取得方法を知らなくてよい)」という既存の責務分離が正しく機能して
  いる証拠であり、Parser層をあえて急いで汎化しなくても、後工程側の
  健全性は保たれる。

### 4-3. 結論

**推奨: 「もう1〜2ケース追加してから汎化する」を基本方針としつつ、
4-1の不具合修正(表1-3の#19・#20)だけは、次ケースに着手する前に
先に直すことを推奨する。**

理由をまとめると:

1. Exercise生成の不具合(#19・#20)は汎化の設計判断ではなく修正すべき
   バグであり、後回しにする理由がない。低コストかつ、次ケースの
   検証結果を必要としない。
2. Parser/M2層(D分類)の汎化は、今の2例だけでは「正しい抽象化」を
   決められない。次の1〜2ケース(できれば本書の別テーマ、または別冊)
   を実データで通し、そこで初めて見えてくる共通点・相違点を材料に
   `caseConfig`的な設計へ進む方が、CLAUDE.md原則6・8(検証可能な状態を
   保つ、教材は一度に大量投入しない)に整合する。
3. B分類(#22のALLOWED_CASES動的化等)・C分類の項目は、緊急度が低く、
   次ケース着手のブロッカーにはならない。次ケースの実装中、自然な
   タイミングで(例えば実際に3ケース目のケース名を追加する際に)
   ついでに動的化する、程度の扱いで十分である。

したがって、「現状のまま教材追加フェーズへ進める」でも大きな支障は
ないが、**#19・#20だけは例外的に先に直すべき**、というのが最終的な
推奨である。この2点の修正自体は小規模で、既存のgateChecks・テストへの
影響も限定的と見込まれる(実装には今回着手していないため、実際の
影響範囲は着手時に再確認が必要)。
