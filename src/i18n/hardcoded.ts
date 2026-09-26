// Finds user-facing text written directly in components instead of src/i18n (M12a).
// Used by hardcoded.test.ts; pure so it can scan any source string.
import ts from 'typescript';

/** Props whose string value is shown to (or read out for) the user. */
const TEXT_PROPS = new Set([
  'label',
  'title',
  'placeholder',
  'accessibilityLabel',
  'accessibilityHint',
  'message',
  'emptyText',
  'header',
  'hint',
  'caption',
  'error',
  'aria-label',
]);

const hasWords = (s: string) => /[A-Za-z]{2,}/.test(s);

export interface Finding {
  line: number;
  text: string;
}

export function findHardcodedText(fileName: string, source: string): Finding[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Finding[] = [];
  const add = (node: ts.Node, text: string) =>
    out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: text.trim() });

  /** The value a text prop can take: literals, templates, and branches of ?: / ?? / + . */
  const checkValue = (at: ts.Node, e: ts.Expression): void => {
    if ((ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) && hasWords(e.text)) add(at, e.text);
    else if (ts.isTemplateExpression(e)) {
      if (hasWords(e.head.text + e.templateSpans.map((x) => x.literal.text).join(''))) add(at, e.getText(sf));
    } else if (ts.isConditionalExpression(e)) {
      checkValue(at, e.whenTrue);
      checkValue(at, e.whenFalse);
    } else if (ts.isParenthesizedExpression(e)) checkValue(at, e.expression);
    else if (
      ts.isBinaryExpression(e) &&
      [ts.SyntaxKind.PlusToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
        e.operatorToken.kind,
      )
    ) {
      checkValue(at, e.left);
      checkValue(at, e.right);
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && hasWords(node.text)) add(node, node.text);
    if (ts.isJsxAttribute(node) && TEXT_PROPS.has(node.name.getText(sf)) && node.initializer) {
      const init = node.initializer;
      if (ts.isStringLiteral(init) && hasWords(init.text)) add(node, init.text);
      if (ts.isJsxExpression(init) && init.expression) checkValue(node, init.expression);
    }
    // {'Some words'} or {`Some ${x} words`} as a JSX child
    if (ts.isJsxExpression(node) && node.expression && ts.isJsxElement(node.parent)) {
      const e = node.expression;
      if ((ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) && hasWords(e.text))
        add(node, e.text);
      if (
        ts.isTemplateExpression(e) &&
        hasWords(e.head.text + e.templateSpans.map((s) => s.literal.text).join(''))
      )
        add(node, e.getText(sf));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/**
 * Strings read from `t` while a module loads are frozen in the language active at that moment,
 * so a later language switch never reaches them. Finds top-level declarations that read `t`
 * (or an alias such as `const s = t.trips`) outside a function, getter or arrow.
 */
export function findFrozenStrings(fileName: string, source: string): Finding[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const aliases = new Set(['t']);
  const out: Finding[] = [];
  const root = (e: ts.Expression): string | null => {
    while (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) e = e.expression;
    return ts.isIdentifier(e) ? e.text : null;
  };
  // Pass 1: aliases (`const s = t.permissions;`).
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (d.initializer && ts.isIdentifier(d.name) && ts.isPropertyAccessExpression(d.initializer)) {
        const r = root(d.initializer);
        if (r && aliases.has(r)) aliases.add(d.name.text);
      }
    }
  }
  const isDeferred = (n: ts.Node) =>
    ts.isArrowFunction(n) ||
    ts.isFunctionExpression(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isGetAccessorDeclaration(n) ||
    ts.isClassDeclaration(n);
  const visit = (n: ts.Node) => {
    if (isDeferred(n)) return;
    if (
      (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) &&
      !ts.isPropertyAccessExpression(n.parent)
    ) {
      const r = root(n);
      // A bare alias object (t.x) is fine; reading a string leaf out of it is not.
      if (r && aliases.has(r) && !(ts.isVariableDeclaration(n.parent) && n.parent.initializer === n)) {
        out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, text: n.getText(sf) });
      }
      return;
    }
    ts.forEachChild(n, visit);
  };
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st))
      st.declarationList.declarations.forEach((d) => d.initializer && visit(d.initializer));
    else if (ts.isExpressionStatement(st)) visit(st.expression);
  }
  return out;
}
