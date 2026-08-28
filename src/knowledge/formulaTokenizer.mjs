// M2: 用語ベース計算式のトークン化(このケース専用、汎用数式パーサーではない)
//
// `source_derived_knowledge_design_proposal.md`5-2節で確定済みの5トークン
// 種別(term/operator/fraction/group/power)のうち、今回の定額法の式
// 「（A－B）×（C／D）＝E」という1つの形状のみを対象にする。
// `planning/m2_derived_knowledge_candidate_design.md`7節の方針どおり、
// 汎用的な数式パーサーへは発展させない。想定外の形状はfail-closedで
// 例外を投げ、無理に構造化しない(CLAUDE.md原則4)。

const SUBTRACT_FRACTION_FORMULA = /^（([^（）－]+)－([^（）－]+)）×（([^（）／]+)／([^（）／]+)）＝(.+)$/;

/**
 * 「（A－B）×（C／D）＝E」という形の忠実な表現を、5トークン語彙で構造化する。
 * @param {string} rawFormula
 * @returns {{ kind: "sequence", tokens: object[] }}
 */
export function tokenizeSubtractFractionFormula(rawFormula) {
  const match = rawFormula.match(SUBTRACT_FRACTION_FORMULA);
  if (!match) {
    throw new Error(
      `想定している"（A－B）×（C／D）＝E"という形状に一致しないため、構造化しない` +
        `(fail-closed、汎用パーサーへのフォールバックはしない): ${rawFormula}`,
    );
  }
  const [, termA, termB, numerator, denominator, result] = match;

  return {
    kind: "sequence",
    tokens: [
      {
        kind: "group",
        tokens: [
          { kind: "term", value: termA },
          { kind: "operator", value: "－" },
          { kind: "term", value: termB },
        ],
      },
      { kind: "operator", value: "×" },
      {
        kind: "group",
        tokens: [
          {
            kind: "fraction",
            numerator: [{ kind: "term", value: numerator }],
            denominator: [{ kind: "term", value: denominator }],
          },
        ],
      },
      { kind: "operator", value: "＝" },
      { kind: "term", value: result },
    ],
  };
}

const BARE_NUMBER_FRACTION_FORMULA = /^([０-９0-9,，]+)×（([^（）／]+)／([^（）／]+)）＝(.+)$/;

/**
 * 「N×（C／D）＝E」という形(残存価額がゼロのため減算部分が教材上省略される
 * 適用例。第2ケースの実データ検証で判明、
 * `planning/case2_readiness_and_generalization_analysis.md`5節1項)を、
 * 5トークン語彙で構造化する。定義式(`tokenizeSubtractFractionFormula`)とは
 * 別関数のままにする(2つの形状を1つの正規表現・分岐で無理に統一しない、
 * 実データ2件の範囲だけ汎化する方針)。
 * @param {string} rawFormula
 * @returns {{ kind: "sequence", tokens: object[] }}
 */
export function tokenizeBareNumberFractionFormula(rawFormula) {
  const match = rawFormula.match(BARE_NUMBER_FRACTION_FORMULA);
  if (!match) {
    throw new Error(
      `想定している"N×（C／D）＝E"という形状に一致しないため、構造化しない` +
        `(fail-closed、汎用パーサーへのフォールバックはしない): ${rawFormula}`,
    );
  }
  const [, amount, numerator, denominator, result] = match;

  return {
    kind: "sequence",
    tokens: [
      { kind: "term", value: amount },
      { kind: "operator", value: "×" },
      {
        kind: "group",
        tokens: [
          {
            kind: "fraction",
            numerator: [{ kind: "term", value: numerator }],
            denominator: [{ kind: "term", value: denominator }],
          },
        ],
      },
      { kind: "operator", value: "＝" },
      { kind: "term", value: result },
    ],
  };
}

const PLAIN_TERM_FORMULA = /^([^×＝]+)×([^×＝]+)＝(.+)$/;

/**
 * 「A×B＝C」という、括弧(減算)も分数も伴わない最も単純な形の忠実な表現を、
 * 5トークン語彙(のうちterm/operatorのみ)で構造化する(第5ケース、テーマ11
 * 外貨建取引の定義式・適用例で確認した形状。`tokenizeSubtractFractionFormula`
 * ・`tokenizeBareNumberFractionFormula`とは別関数のままにする、2形状を
 * 1つの正規表現・分岐で無理に統一しない既存方針を踏襲する)。
 * @param {string} rawFormula
 * @returns {{ kind: "sequence", tokens: object[] }}
 */
export function tokenizePlainTermFormula(rawFormula) {
  const match = rawFormula.match(PLAIN_TERM_FORMULA);
  if (!match) {
    throw new Error(
      `想定している"A×B＝C"という形状に一致しないため、構造化しない` +
        `(fail-closed、汎用パーサーへのフォールバックはしない): ${rawFormula}`,
    );
  }
  const [, termA, termB, result] = match;

  return {
    kind: "sequence",
    tokens: [
      { kind: "term", value: termA },
      { kind: "operator", value: "×" },
      { kind: "term", value: termB },
      { kind: "operator", value: "＝" },
      { kind: "term", value: result },
    ],
  };
}

const ADDITION_FRACTION_FORMULA =
  /^（([^（）＋]+)＋([^（）＋]+)）×（([^（）／]+)／（([^（）＋]+)＋([^（）＋]+)））＝(.+)$/;

/**
 * 「（A＋B）×（C／（D＋E）)＝F」という形(第6ケース、テーマ7-10 仕入諸掛の
 * 按分計算〈平均法〉で確認した形状)を、5トークン語彙で構造化する。
 * `tokenizeSubtractFractionFormula`(先頭グループが減算)とは、グループ内の
 * 演算子(＋/－)が異なるため別関数のままにする(既存方針を踏襲)。
 *
 * この形状で新たに確認できた性質: 分数の分母が単一の項ではなく、それ自体が
 * 演算(＋)を含む式である(教材の元の版面では分数線の下に2行で印字され、
 * 括弧は無い)。5トークン語彙自体(fraction.numerator/denominatorが元々
 * トークン配列であること)は変更せずに表現できるが、分母を線形テキストへ
 * 書き起こす際、括弧を補わないと「Ｃ／Ｄ＋Ｅ」は数式の優先順位上
 * 「(Ｃ／Ｄ)＋Ｅ」と紛らわしくなる。分数線という視覚的な区切りを線形
 * テキストへ書き起こす際の補いとして、複数トークンからなる分子/分母には
 * 括弧を付す(`renderTokens`のfraction分岐を参照。単一項の場合は既存どおり
 * 括弧を付けない、既存の往復整合性を壊さない)。
 * @param {string} rawFormula
 * @returns {{ kind: "sequence", tokens: object[] }}
 */
export function tokenizeAdditionFractionFormula(rawFormula) {
  const match = rawFormula.match(ADDITION_FRACTION_FORMULA);
  if (!match) {
    throw new Error(
      `想定している"（A＋B）×（C／（D＋E）)＝F"という形状に一致しないため、構造化しない` +
        `(fail-closed、汎用パーサーへのフォールバックはしない): ${rawFormula}`,
    );
  }
  const [, termA, termB, numerator, termD, termE, result] = match;

  return {
    kind: "sequence",
    tokens: [
      {
        kind: "group",
        tokens: [
          { kind: "term", value: termA },
          { kind: "operator", value: "＋" },
          { kind: "term", value: termB },
        ],
      },
      { kind: "operator", value: "×" },
      {
        kind: "group",
        tokens: [
          {
            kind: "fraction",
            numerator: [{ kind: "term", value: numerator }],
            denominator: [
              { kind: "term", value: termD },
              { kind: "operator", value: "＋" },
              { kind: "term", value: termE },
            ],
          },
        ],
      },
      { kind: "operator", value: "＝" },
      { kind: "term", value: result },
    ],
  };
}

const LABEL_FRACTION_FORMULA = /^([^＝／]+)＝([^／＝]+)／([^／＝]+)$/;

/**
 * 「A＝B／C」という、被定義項(A)が左辺、分数(B／C)が右辺という形(既存の
 * 4形状はいずれも右辺が被定義項〈結果〉だったのに対し、逆順になる。
 * Phase C、テーマ7-4 原価率の定義式`原価率＝原価／売価`で確認した形状)を、
 * 5トークン語彙で構造化する。この式には括弧も乗算も無いため、fractionを
 * groupで包まずそのままsequenceへ並べる(既存の全形状とは別関数のまま、
 * 既存方針を踏襲)。
 * @param {string} rawFormula
 * @returns {{ kind: "sequence", tokens: object[] }}
 */
export function tokenizeLabelFractionFormula(rawFormula) {
  const match = rawFormula.match(LABEL_FRACTION_FORMULA);
  if (!match) {
    throw new Error(
      `想定している"A＝B／C"という形状に一致しないため、構造化しない` +
        `(fail-closed、汎用パーサーへのフォールバックはしない): ${rawFormula}`,
    );
  }
  const [, label, numerator, denominator] = match;

  return {
    kind: "sequence",
    tokens: [
      { kind: "term", value: label },
      { kind: "operator", value: "＝" },
      {
        kind: "fraction",
        numerator: [{ kind: "term", value: numerator }],
        denominator: [{ kind: "term", value: denominator }],
      },
    ],
  };
}

const SUBTRACT_GROUP_FORMULA =
  /^([^（）＋－]+)－（([^（）＋－]+)＋([^（）＋－]+)－([^（）＋－]+)）＝(.+)$/;

/**
 * 「A－（B＋C－D）＝E」という、先頭が減算で括弧グループの中に加算と減算が
 * 混在する形(Phase C、テーマ7-2 総記法の算定式
 * `売上高－（期首商品＋当期仕入高－期末商品）＝商品販売益`で確認した形状)を、
 * 5トークン語彙で構造化する。既存の`tokenizeSubtractFractionFormula`
 * (先頭グループが減算、分数を伴う)とは、グループの位置(先頭ではなく2番目)・
 * グループ内演算子(＋と－が混在)が異なるため別関数のままにする(既存方針を
 * 踏襲)。
 * @param {string} rawFormula
 * @returns {{ kind: "sequence", tokens: object[] }}
 */
export function tokenizeSubtractGroupFormula(rawFormula) {
  const match = rawFormula.match(SUBTRACT_GROUP_FORMULA);
  if (!match) {
    throw new Error(
      `想定している"A－（B＋C－D）＝E"という形状に一致しないため、構造化しない` +
        `(fail-closed、汎用パーサーへのフォールバックはしない): ${rawFormula}`,
    );
  }
  const [, termA, termB, termC, termD, result] = match;

  return {
    kind: "sequence",
    tokens: [
      { kind: "term", value: termA },
      { kind: "operator", value: "－" },
      {
        kind: "group",
        tokens: [
          { kind: "term", value: termB },
          { kind: "operator", value: "＋" },
          { kind: "term", value: termC },
          { kind: "operator", value: "－" },
          { kind: "term", value: termD },
        ],
      },
      { kind: "operator", value: "＝" },
      { kind: "term", value: result },
    ],
  };
}

const SUBTRACT_GROUP_DIVIDE_FORMULA =
  /^（([^（）－]+)－([^（）－]+)－([^（）－]+)）÷([^（）÷＝]+)＝(.+)$/;

/**
 * 「（A－B－C）÷D＝E」という、括弧グループの中に減算が2回現れ、除算記号
 * 「÷」を使う形(Phase C、テーマ8-8 償却方法の変更の算定式
 * `（取得原価－期首減価償却累計額－残存価額）÷残存耐用年数＝減価償却費`で
 * 確認した形状)を、5トークン語彙で構造化する。fraction種別は「／」を使う
 * 分数表記(視覚的な分数として印字される)専用として扱ってきたため、
 * 「÷」は別途operatorとして表現し、既存のfraction種別とは混同しない
 * (既存方針を踏襲)。
 * @param {string} rawFormula
 * @returns {{ kind: "sequence", tokens: object[] }}
 */
export function tokenizeSubtractGroupDivideFormula(rawFormula) {
  const match = rawFormula.match(SUBTRACT_GROUP_DIVIDE_FORMULA);
  if (!match) {
    throw new Error(
      `想定している"（A－B－C）÷D＝E"という形状に一致しないため、構造化しない` +
        `(fail-closed、汎用パーサーへのフォールバックはしない): ${rawFormula}`,
    );
  }
  const [, termA, termB, termC, divisor, result] = match;

  return {
    kind: "sequence",
    tokens: [
      {
        kind: "group",
        tokens: [
          { kind: "term", value: termA },
          { kind: "operator", value: "－" },
          { kind: "term", value: termB },
          { kind: "operator", value: "－" },
          { kind: "term", value: termC },
        ],
      },
      { kind: "operator", value: "÷" },
      { kind: "term", value: divisor },
      { kind: "operator", value: "＝" },
      { kind: "term", value: result },
    ],
  };
}

const SUBTRACT_GROUP_TIMES_TERM_FORMULA = /^（([^（）－]+)－([^（）－]+)）×([^×＝]+)＝(.+)$/;

/**
 * 「（A－B）×C＝D」という、先頭が減算グループだが乗算の相手が分数ではなく
 * 単純な項である形(Phase C、テーマ8-8 償却方法の変更の算定式
 * `（取得原価－期首減価償却累計額）×定率法償却率＝減価償却費`で確認した
 * 形状)を、5トークン語彙で構造化する。`tokenizeSubtractFractionFormula`
 * (乗算の相手が分数)とは右辺の構造が異なるため別関数のままにする(既存
 * 方針を踏襲)。
 * @param {string} rawFormula
 * @returns {{ kind: "sequence", tokens: object[] }}
 */
export function tokenizeSubtractGroupTimesTermFormula(rawFormula) {
  const match = rawFormula.match(SUBTRACT_GROUP_TIMES_TERM_FORMULA);
  if (!match) {
    throw new Error(
      `想定している"（A－B）×C＝D"という形状に一致しないため、構造化しない` +
        `(fail-closed、汎用パーサーへのフォールバックはしない): ${rawFormula}`,
    );
  }
  const [, termA, termB, termC, result] = match;

  return {
    kind: "sequence",
    tokens: [
      {
        kind: "group",
        tokens: [
          { kind: "term", value: termA },
          { kind: "operator", value: "－" },
          { kind: "term", value: termB },
        ],
      },
      { kind: "operator", value: "×" },
      { kind: "term", value: termC },
      { kind: "operator", value: "＝" },
      { kind: "term", value: result },
    ],
  };
}

/**
 * トークン構造を文字列へ復元する(往復整合性の検証用)。
 * `power`種別はこのケースで使用されないため実装しない
 * (`m2_derived_knowledge_candidate_design.md`7節、未使用の道を作らない)。
 * @param {object} node
 * @returns {string}
 */
export function renderTokens(node) {
  switch (node.kind) {
    case "sequence":
      return node.tokens.map(renderTokens).join("");
    case "group":
      return `（${node.tokens.map(renderTokens).join("")}）`;
    case "term":
    case "operator":
      return node.value;
    case "fraction": {
      // 分子/分母が複数トークンからなる場合(第6ケース、分母が演算を含む式に
      // なるケースで確認)、線形テキストでは演算子の優先順位が曖昧になるため
      // 括弧で補う。単一項の場合(既存の全ケース)は括弧を付けない挙動を
      // 維持する(既存の往復整合性を壊さない)。
      const numeratorText = renderTokenList(node.numerator);
      const denominatorText = renderTokenList(node.denominator);
      const wrappedNumerator = node.numerator.length > 1 ? `（${numeratorText}）` : numeratorText;
      const wrappedDenominator =
        node.denominator.length > 1 ? `（${denominatorText}）` : denominatorText;
      return `${wrappedNumerator}／${wrappedDenominator}`;
    }
    default:
      throw new Error(
        `renderTokens: このケース専用の実装では未対応のkindです: "${node.kind}"`,
      );
  }
}

function renderTokenList(tokens) {
  return tokens.map(renderTokens).join("");
}
