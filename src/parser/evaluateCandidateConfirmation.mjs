// [8]候補確定フェーズを縮小し、F群の事実だけで安全に自動確定できる範囲を
// 判定する評価ロジック。Parser本体(runApplicationCandidates.mjs)の外に
// 置くことで、Parserの出力契約(F群のみ)を変更しない
// (`knowledge_integration_review_scope_design.md`8節)。
//
// ここで判定するのは「独立参照が必要か」そのもの(G群)ではなく、「その
// 判断を人間に求める必要があるかどうか」という一段手前の振り分けである。
// 3条件すべてを満たす場合のみ自動確定してよいとし、1つでも欠ければ
// needs_reviewへ回す(fail-closedの精神、原則4「推測しない」)。
//
// F9(新設・この評価ロジック内でのみ使う派生事実): 候補の所属topicと、
// F8(abstractDefinitionCandidate)が指す定義Sourceの所属topicが一致するか。
// 既存の確定済み構造との突き合わせのみで導出でき、意味判断を伴わない
// (`source_confirmation_responsibility_reconsideration.md`3-2節)。
//
// 【D3型の矛盾(教材上の境界記号はあるのに定義候補が見つからない)について】
// 当初、境界記号(F2)と定義候補の有無(F8)の矛盾を独立の条件として検討したが、
// F8が偽である時点で既にdefinitionMatchIsUniqueが偽になり自動確定しない
// ため、独立の条件を追加しても判定結果は変わらない(到達しない分岐を
// 作らない)。D3のような矛盾は、現状の3条件だけで既に安全側(needs_review)
// に倒れる。将来、これらの条件だけでは判別できない新しい矛盾パターンが
// 実データで見つかった場合に、その時点で条件を追加する。

/**
 * @param {object} candidate teigakuho-application.jsonのcandidates[]要素
 * @param {{ definitionBlockId: string, definitionBlockStructureRef: string }} definitionInfo
 * @returns {{
 *   sameTopicAsDefinition: boolean,
 *   definitionMatchIsUnique: boolean,
 *   restorationResolved: boolean,
 *   result: "auto_confirm" | "needs_review",
 *   reason: string | null
 * }}
 */
export function evaluateAutoConfirmation(candidate, { definitionBlockId, definitionBlockStructureRef }) {
  const abstractDef = candidate.abstractDefinitionCandidate;

  const sameTopicAsDefinition =
    abstractDef?.exists === true &&
    abstractDef.sourceBlockId === definitionBlockId &&
    candidate.structureRef === definitionBlockStructureRef;

  // F8の一致先が一意か。現在のParser実装(runApplicationCandidates.mjs)は
  // 候補ごとに単一のabstractDefinitionCandidateしか記録しないため、
  // existsがtrueであること自体が現時点では一意性の確認と等価である。
  // 将来、同一topic内に複数の定義候補が検出されるケースが実際に見つかった
  // 場合は、この判定を拡張する必要がある(未対応、無理に一般化しない)。
  const definitionMatchIsUnique = abstractDef?.exists === true;

  const artifacts = candidate.diag?.extraction?.artifacts ?? [];
  const restorationResolved =
    candidate.diag?.faithfulReconstruction?.performed === true &&
    artifacts.every((a) => a.resolved === true);

  const allSatisfied = sameTopicAsDefinition && definitionMatchIsUnique && restorationResolved;

  let reason = null;
  if (!allSatisfied) {
    if (!definitionMatchIsUnique) {
      // 現在の実装ではdefinitionMatchIsUniqueはabstractDefinitionCandidate.
      // existsとしか連動しないため、この分岐は「定義候補が見つからない」
      // ケースのみを表す。将来、同一topic内の複数定義候補を検出できる
      // ようになった場合は、「候補は複数あるが一意に絞れない」という
      // 別の理由をここで区別する必要がある(未対応、無理に一般化しない)。
      reason = "no_definition_candidate";
    } else if (!sameTopicAsDefinition) {
      reason = "cross_topic";
    } else {
      reason = "restoration_unresolved";
    }
  }

  return {
    sameTopicAsDefinition,
    definitionMatchIsUnique,
    restorationResolved,
    result: allSatisfied ? "auto_confirm" : "needs_review",
    reason,
  };
}
