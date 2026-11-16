# Knowledge統合時のレビュー範囲・詳細設計

`planning/source_confirmation_responsibility_reconsideration.md`で提示した
B案(原則自動確定＋例外のみ人間レビュー、レビュー地点はDerived Knowledge)の
方向性が承認された。本ファイルは、その前提のもとで残された1点
――「Source追加のたびにKnowledgeを再承認待ちに戻す」という単純なルールが
将来のレビュー疲弊を招くという懸念――を解消するための詳細設計である。

**本ファイルは設計提示のみである。コード変更・commit/pushには一切進んで
いない。** 新規実データ探索も行っていない。

先に結論を要約すると: **前回文書の「Source統合のたびにreviewStatusを
非approved状態へ戻す」という提案は撤回する。** 再検討の結果、
「reviewStatusの意味」自体を見直すことで、単純なルールに頼らずに
安全性・監査可能性を維持できることが分かった。

---

## 1. 「Sourceが増えた」と「Knowledgeの意味内容が変わった」は区別できるか

**区別できる。この区別は、既存のM4設計(A/B/C フィールド分類)に既に
組み込まれている。**

`planning/m4_review_workflow_design.md`で確立したフィールド分類を思い出す。

| 分類 | フィールド | 誰が変更できるか |
|---|---|---|
| A(人間編集) | `contentConfidence`・`scopeNote` | M4の`edit`アクションのみ |
| B(システム再計算) | `evidence`・`consolidation` | `sourceRefs`から常に自動導出。人間は直接編集できない |
| C(ロック) | `type`・`id`・`knowledgeKind`・`content.rawFormula`・`content.structure`・`sourceRefs` | **いかなる既存アクションからも変更不可**(sourceRefsは`sourceRefs`自体はCに属するが、「増える」ことは統合処理でのみ発生し、既存要素の書き換えは発生しない) |

**「Knowledgeの意味内容」とは、実質的に`content`(rawFormula/structure)を
指す。** `content`はCategory Cに属し、M2(生成時)以降、**いかなる既存
アクション(M4のapprove/edit/reject、および今回設計するSource統合処理)
からも変更されない**。これはPhase13で確立し、ユーザー承認済みの方針
(「definition由来のcontentをKnowledgeの正本とし、applicationはsourceRefs
としてのみ追加する」)がそのまま保証している。

したがって、**「Sourceが増える」というイベントは、現行のアーキテクチャ
上、`content`の変化を一切伴わない**。この2つの事実は、データモデルの
時点で構造的に分離されている。

> **今回の設計指針**: 「Knowledgeの意味内容そのものが変化する変更」
> (`content`の変更)は、現行のどの経路からも到達できない、将来のための
> 予約された分類として扱う。今回のSource統合設計はこの分類に一切触れず、
> 触れる経路が将来追加された場合は、その時点で改めて全承認プロセスを
> 要求する(9節で明示する)。

---

## 2. reviewStatusの意味を再定義する

前回文書は「Source統合のたびにreviewStatusを非approved状態に戻す」ことを
提案したが、これは**reviewStatusが本来何を承認しているのか**を再考する
必要性を見落としていた。

### 2-1. reviewStatusは何を承認しているのか

M4設計時点でのreviewStatusの実質的な役割は、「このKnowledgeの`content`
(計算式そのもの)と、それに対する人間の評価(`contentConfidence`・
`scopeNote`)が正しいと人間が認めた」という記録である。これはCategory A・
Cのフィールドに対する承認であり、**Category B(evidence/consolidation)は
そもそも人間が承認する対象として設計されていない**(常に自動再計算される
値であり、M4は一度もこれを人間の承認対象として扱っていない)。

1節の帰結と合わせると: **Source統合はCategory B(evidence/consolidation)
のみを変化させ、reviewStatusが実際に承認しているCategory A・Cには一切
触れない。** したがって、Source統合のたびにreviewStatusを差し戻す
ことは、**reviewStatus本来のスコープを超えた過剰な安全策**だった、
というのが今回の結論である。

### 2-2. なぜ前回この結論に至らなかったか

前回文書6節は、「統合後もreviewStatusが変化しない」ことを実データで
確認し、これを「欠陥」と表現した。しかし、これは前提が誤っていた:
「Sourceが統合された = 人間が何かを再承認すべき」という暗黙の等式を
置いていたが、2-1節の整理により、**この等式はCategory Bの変化には
当てはまらない**ことが分かった。実際に欠陥だったのは、reviewStatusが
変化しないことそのものではなく、**「変化しなくてよい理由」が明文化
されておらず、かつ意味判断(G群)を要する統合であっても無審査で
sourceRefsに反映されていた**ことである。後者は今回のB案(needs_reviewの
導入)で解決される。

---

## 3. 3分類と、それぞれの再承認要否

ユーザー提示の3分類を、1-2節の整理を踏まえて定義する。

### 分類①: F群だけで安全に処理できるSource追加(構造的に安全)

`source_confirmation_responsibility_reconsideration.md`3-3節の4条件
(F9一致・F8一意・F4解決済み・F2無矛盾)を満たすSource追加。

- **Knowledgeへの影響**: `sourceRefs`が増え、`evidence`(Category B)が
  再計算される。`content`(Category C)は無変化。
- **reviewStatusへの影響**: **変化しない(承認済みのままでよい)。**
  2-1節のとおり、reviewStatusはCategory A・Cの承認であり、Category Bの
  変化は対象外。
- **人間の関与**: なし。ただし監査証跡として、どのSourceがいつ・どの
  条件で自動統合されたかは必ず記録する(7節)。

### 分類②: テーマ横断など、統合に意味判断が必要なSource追加

3-3節の4条件を満たさないSource追加(今回はテーマ横断の
`cand-topic-9-1-app`)。

- **Knowledgeへの影響**: 分類①と同じくCategory Bのみ(`sourceRefs`・
  `evidence`)が変化しうる。**ただし、その変化を発生させてよいかどうか
  自体に意味判断(G群)が必要**、という点が分類①と異なる。
- **reviewStatusへの影響**: **Knowledge全体のreviewStatusは変化させない。**
  1節のとおり、この統合も`content`には触れないため、Knowledge全体を
  「再承認待ち」にする必要はない。**その代わり、この1件のSource追加
  そのものを、独立した承認対象として扱う**(4節)。
- **人間の関与**: 必要。ただし「Sourceとして確定するか」ではなく、
  「このSourceを、このKnowledgeの根拠として追加してよいか」という、
  Knowledge視点の問いとして提示する(6節)。

### 分類③: Knowledgeの内容そのものが変化する変更

`content`(rawFormula/structure)自体が変わる変更。1節のとおり、**現行の
どの経路(Parser・Source統合・M4の既存アクション)からも到達できない**。

- **Knowledgeへの影響**: Category Cの変更そのもの。
- **reviewStatusへの影響**: **全承認プロセスをやり直す必要がある**(新規
  Knowledge候補相当として扱うべき)。
- **人間の関与**: 必須、かつKnowledge全体の再承認。
- **現状の扱い**: この分類に到達する経路が存在しないため、今回は
  「発生した場合は必ずreviewStatusを`candidate`へ戻す」という原則を
  文書化するに留め、実装は行わない(9節)。

### 3-1. 表による整理

| | ①構造的に安全 | ②意味判断が必要 | ③内容変更 |
|---|---|---|---|
| 変化するフィールド | evidence/consolidation(B) | evidence/consolidation(B) | content(C) |
| 変化させてよいかの判断 | 機械的に確定可能(F9等) | 人間が個別に判断 | 人間が個別に判断 |
| Knowledge全体のreviewStatus | 不変 | 不変 | `candidate`へ戻す(未実装経路) |
| その追加固有の承認記録 | 自動、監査ログのみ | 人間の承認(個別) | 人間の承認(Knowledge全体) |
| 今回の実データ該当 | `cand-topic-8-2-app` | `cand-topic-9-1-app` | 該当なし |

---

## 4. 承認の単位を「Knowledge全体」から「追加候補ごと」へ

分類②の追加は、**Knowledge全体の再承認ではなく、その追加候補1件に
対する個別の承認**として扱う。これにより、以下が同時に満たされる。

- Knowledgeの`reviewStatus`は、教材が増えても「approved」のまま安定する
  (ユーザーが望む「本当に判断が必要なところだけ見る」運用と整合する)。
- 分類②の追加は、承認されるまで`sourceRefs`に反映されない(無審査での
  反映を防ぐ、前回文書で懸念した安全性は維持される)。
- 複数の分類②候補が同時に存在しても、Knowledge全体を1回ブロックする
  のではなく、**候補ごとに独立してキューイング**できる(5節のバッチ
  レビューと自然に両立する)。

### 4-1. データモデルへの反映

`teigakuho-application.json`の各candidateに、既存の`confirmationStatus`
(candidate/confirmed/rejected)に加えて、次のフィールドを追加する。

```jsonc
{
  "candidateId": "cand-topic-8-2-app",
  // ...既存のF群フィールド(変更なし)...
  "confirmationStatus": "confirmed",
  "confirmationMethod": "auto",        // 新設: "auto" | "human_reviewed"
  "autoConfirmEvaluation": {           // 新設: なぜauto/needs_reviewになったかの記録
    "sameTopicAsDefinition": true,     // F9相当
    "definitionMatchIsUnique": true,
    "restorationResolved": true,
    "noBoundaryConflict": true,
    "result": "auto_confirm"
  },
  "reviewedAt": "...",                 // 自動確定の場合はシステム処理時刻
  "reviewNote": "F9条件を満たすため自動確定"
}
```

```jsonc
{
  "candidateId": "cand-topic-9-1-app",
  // ...既存のF群フィールド(変更なし)...
  "confirmationStatus": "candidate",   // 人間の判断を待つ間はconfirmedにしない
  "confirmationMethod": null,
  "autoConfirmEvaluation": {
    "sameTopicAsDefinition": false,    // F9不成立(テーマ9→テーマ8-2)
    "definitionMatchIsUnique": true,
    "restorationResolved": true,
    "noBoundaryConflict": true,
    "result": "needs_review",
    "reason": "cross_topic"            // 機械的に導出された「なぜレビューが必要か」の分類。G群の結論(必要/不要)そのものではない
  }
}
```

**`derivedKnowledgeCandidate`(Knowledge側)には、新しいフィールドを
追加しない。** 分類①は即座に`sourceRefs`へ反映されるため中間状態を
持つ必要がなく、分類②は`teigakuho-application.json`側の
`confirmationStatus: "candidate"`のまま留め置かれるため、Knowledge側に
別途pendingリストを持たせる必要がない。**「まだKnowledgeに含まれて
いないSource候補」は、常に「application側でconfirmationStatusが
candidateのままの候補」を検索すれば取得できる**(既存データソースの
再利用であり、新しい二重管理を避けられる)。

これは前回文書8-3節で提案した`pendingSourceRefs`(Knowledge側に持たせる
案)からの変更である。application側の状態だけで表現できることが分かった
ため、より単純な設計に修正した。

---

## 5. バッチレビューの必要性

**必要。** 複数の分類②候補が同時に存在しうる(将来、複数教材・複数
テーマ横断適用が同時に見つかるケース)。ただし、**「まとめて1クリックで
全承認」という一括承認機能は今回は設けない**——各候補は個別に意味判断を
要するため、一括承認は意味判断を素通りさせるリスクがある(原則4と
矛盾しうる)。

代わりに、**同一画面上に複数の候補を並べて表示し、各候補を個別に
承認/却下できる**UIとする(6節)。ページ遷移や個別のURL操作を要さず、
1つの画面内で完結させることで、心理的な負荷(「毎回別画面を開く」)を
下げる。これは「一括処理」ではなく「一覧性の確保」であり、意味判断の
個別性は維持する。

---

## 6. UI設計方針

### 6-1. 分類①(自動確定)の表示

人間への操作要求は発生しない。ただし監査可能性(原則8)のため、M4の
Knowledge表示セクション(既存の「7. Derived Knowledge候補」)に、
**読み取り専用の情報として**次を追加する。

> 「以下のSourceは、構造的事実のみから自動的に追加根拠として統合
> されました(人間の確認は不要と判断されました)。」
> - `cand-topic-8-2-app`(テーマ8、論点8-2、定義と同一の論点内の適用例)
>   [F群の根拠を折りたたみ表示]

### 6-2. 分類②(人間レビュー)の表示・文言

既存の「[8]候補確定フェーズ」という独立セクションは廃止し、**M4の
Knowledgeセクション内に統合する**(`derivedKnowledgeCandidate`の表示に
併設)。文言は「Sourceとして確定しますか」ではなく、**Knowledge側の
帰結を問う形**にする。

> **この適用例を「定額法」Knowledgeの根拠として追加しますか?**
>
> - 検出場所: テーマ9・論点9-1(ソフトウェアの償却)
> - 内容: `架空額×（１架空単位／架空全体単位）＝架空結果`
> - この式が参照する定義: `dk-calc-formula-teigakuho`(テーマ8-2で
>   承認済み)
> - **注意**: この適用例は定義と異なるテーマ(テーマ9)で使われています。
>   同じ計算技術がテーマを越えて再利用されていることを示す候補ですが、
>   本当に同一の技術と扱ってよいかは判断が必要です。
> - F群の詳細: [parentContext / boundaryType / sameTypePatterns 等を
>   折りたたみ表示、既存の候補確定フェーズ画面から流用]
>
> [追加する] [追加しない(除外する)]

「追加する」を押すと、Source確定(`confirmCandidate`)とKnowledge統合
(`integrateApplicationSource`)を1回のアクションで同時に実行する
(ユーザーから見た操作は1回だが、内部的には既存の2つの処理をそのまま
呼び出す。新しい状態遷移は増やさない)。「追加しない」を押すと
`rejectCandidate`のみを実行し、Knowledgeには一切影響しない。

### 6-3. 複数候補がある場合の表示(5節のバッチレビュー)

分類②の候補が複数ある場合、6-2節のカードを縦に並べて全件表示する。
各カードは独立して承認/却下でき、一部を承認・一部を保留したまま画面を
離れることもできる(既存のcandidateActionsの一方向性と矛盾しない)。

---

## 7. 監査可能性の担保(reviewStatusを動かさない代わりに何を記録するか)

2節の結論(reviewStatusは動かさない)を採用する以上、**「何が・いつ・
どの根拠で統合されたか」を別の形で必ず追跡可能にする**必要がある
(CLAUDE.md原則8)。

- **各candidateの`confirmationMethod`・`autoConfirmEvaluation`・
  `reviewedAt`・`reviewNote`**(4-1節)が、Source単位の監査証跡になる。
  これは新規追加ではなく、既存の`candidateActions.mjs`が既に記録して
  いるフィールド(`reviewedAt`/`reviewNote`)を、自動確定パスでも
  一貫して埋めるだけで実現できる。
- **`evidence`・`consolidation`自体が、どのsourceRefsから計算された
  結果であるかを常に`sourceRefs`から再現可能**(既存の
  `computeEvidenceAndConsolidation`が`sourceRefs`のみを入力とする
  純粋関数であることに変わりはない)。「今のevidence/consolidationが
  なぜこの値なのか」は、`sourceRefs`をたどれば常に説明できる。
- **gateChecksでの新しい不変条件**(8節)により、「自動確定の条件を
  実際に満たしていたか」を事後的に機械的に再検証できるようにする。

これにより、reviewStatusという「1つの粗いフラグ」に頼るのではなく、
**候補ごとの記録+システム再計算可能性+gateChecks**という3層で監査可能性
を担保する。これは、reviewStatusを動かす設計より**むしろ追跡が容易**
になる(reviewStatus1つの変化には「何が原因で変化したか」の情報が
含まれないが、候補ごとの記録には含まれる)。

---

## 8. 既存設計への影響一覧

| 対象 | 影響 |
|---|---|
| `src/parser/runApplicationCandidates.mjs`(Parser) | **変更不要。** F1〜F8の記録のみを維持する。F9(topic一致)の計算はParserの外に置く(前回文書8-1節の結論を維持) |
| 新設: 候補評価モジュール(仮称`src/parser/evaluateCandidateConfirmation.mjs`) | F9計算+3-3節4条件の判定を行う。Parserの出力(F群)と`structureContext`を入力に、`autoConfirmEvaluation`を計算する純粋関数。この結果に基づき、`confirmationStatus`を`candidate`のまま留めるか`confirmed`へ自動遷移させるかを、候補生成パイプラインの直後(`runApplicationCandidates`の呼び出し元、または専用のCLIステップ)で決定する |
| `src/parser/candidateActions.mjs` | 既存の`confirmCandidate`/`rejectCandidate`はそのまま人間操作(分類②)から呼ばれる。加えて、自動確定用に`confirmationMethod: "auto"`を設定できるよう、`confirmCandidate`のオプション引数を拡張する(新しい状態遷移は追加しない、既存のcandidate→confirmedの遷移をそのまま利用) |
| `src/knowledge/integrateApplicationSource.mjs` | **前回文書の提案(reviewStatusリセット)を撤回する。** reviewStatus/reviewedAt/reviewNoteは変更しない、という**Phase13時点の元の実装のまま**でよいことが今回の再検討で確認された。ただし、なぜ変更しないかの理由(2節)をコメントとして明記し直す(前回の「Source確定が既に人間レビューを兼ねる」という理由は、分類①には当てはまらないため誤りだった。正しい理由は「reviewStatusはCategory A・Cの承認であり、sourceRefs統合はCategory Bしか変化させないため」) |
| M4(`reviewActions.mjs`・`server.mjs`) | Knowledge取得APIのレスポンスに、対応する`teigakuho-application.json`の`confirmationStatus: "candidate"`な候補(=分類②の未決候補)を関連付けて返すよう拡張する(新しいエンドポイントというより、既存の`/api/case/:caseName`のレスポンス構成の見直し、または軽量な集約エンドポイントの追加) |
| `dev-viewer/index.html` | 独立した「第2ケース: Source候補確定フェーズ」セクション(青背景)を廃止し、6節のUIをM4の「7. Derived Knowledge候補」セクション内に統合する。分類①は読み取り専用表示、分類②は承認/却下操作を持つカード形式で表示する |
| `output/cases/teigakuho-application.json`のスキーマ | 各candidateに`confirmationMethod`・`autoConfirmEvaluation`を追加(4-1節) |
| gateChecks | 新設(下記) |

### 8-1. 追加するgateChecks

- **自動確定の正当性検証**: `confirmationMethod === "auto"`な候補は、
  必ず`autoConfirmEvaluation.result === "auto_confirm"`かつ4条件を
  すべて満たしていること(候補自身が記録しているF群の値から再計算し、
  記録された評価結果と一致するか事後検証する)。
- **sourceRefsとの整合性**: `confirmationStatus === "confirmed"`な
  候補の`confirmedBlockId`は、対応するKnowledgeの`sourceRefs`に
  過不足なく存在すること。逆に、`sourceRefs`中の`application`roleを
  持つ各エントリは、対応する`confirmed`な候補が存在すること。
- **content不変性の検証**: `reviewStatus`が一度`approved`になった
  Knowledgeについて、`content.rawFormula`/`content.structure`が
  approved時点から変化していないこと(1節の前提を裏付ける回帰チェック)。
- **needs_reviewの取りこぼし検知**: `confirmationStatus === "candidate"`
  のまま一定期間放置されている候補(将来、経過時間や教材冊数の指標で
  検知する仕組みは今回は設計しない。存在の一覧化のみ、次フェーズの
  課題として申し送る)。

---

## 9. 今回扱わなかった事項(分類③関連、明示)

- 分類③(`content`自体の変更)に到達する経路は、今回のSource統合設計
  では一切追加しない。将来、Faithful Restorationの誤りが承認後に
  発覚した場合の訂正フロー等で`content`変更が必要になった際は、
  **別途、Knowledge全体を`candidate`へ戻す専用のアクションを新設し、
  今回のsourceRefs統合とは明確に別の操作として設計する**ことを申し送る。
- `autoConfirmEvaluation`の4条件(F9等)自体の妥当性は、今回の1ケース
  (2候補)でのみ確認されたものであり、他の教材・他のパターンでの
  再現性は引き続き未検証。
- 5節のバッチレビューUIの具体的なレイアウト・複数候補が10件・20件と
  増えた場合の一覧性(ページネーション等)は、今回は方針のみで、詳細な
  UI設計は行っていない。

---

## 10. 次のステップ

本ファイルの方針(reviewStatus不変・分類ごとの個別承認・M4への統合UI)に
ついて承認が得られれば、次の実装に進む。

1. `evaluateCandidateConfirmation.mjs`(新設)とそのテスト
2. `candidateActions.confirmCandidate`の`confirmationMethod`拡張
3. `integrateApplicationSource.mjs`のコメント修正(reviewStatus不変の
   理由を正しく記録し直す。ロジック自体の変更はなし)
4. M4 API・UIの統合(6節)
5. gateChecks追加(8-1節)
6. 既存の実データ(`output/cases/teigakuho-application.json`・
   `teigakuho-definition.json`、いずれも既にユーザーが確定操作を行い
   統合済み)との整合性確認(スキーマ変更に伴うマイグレーションが
   必要かどうかの確認を含む)

commit/pushはまだ行わない。

---

以上がKnowledge統合時のレビュー範囲の詳細設計である。コード変更・
commit/pushには一切進んでいない。この内容で実装へ進んでよいか、
確認をお願いしたい。
