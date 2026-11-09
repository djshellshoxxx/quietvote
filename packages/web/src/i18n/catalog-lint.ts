import ts from 'typescript';
import { parse } from './icu.ts';

export interface CatalogValue { message: unknown; description: unknown; sensitivity: unknown; maxLength?: unknown }
export interface LintIssue { key: string; reason: string }
const keyPattern = /^qv\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;

/** Validate the English catalog data shape and its ICU messages. */
export function lintCatalog(catalog: unknown): LintIssue[] {
  const issues: LintIssue[] = [];
  if (catalog === null || typeof catalog !== 'object' || Array.isArray(catalog)) return [{ key: '$catalog', reason: 'catalog must be an object of entries' }];
  for (const key of Object.keys(catalog).sort()) {
    const value: unknown = (catalog as Record<string, unknown>)[key];
    const issue = (reason: string): void => { issues.push({ key, reason }); };
    if (!keyPattern.test(key)) issue('invalid message key');
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      issue('entry must be an object');
      continue;
    }
    const entry = value as Record<string, unknown>;
    if (typeof entry.message !== 'string' || entry.message.trim() === '') issue('message must be a non-empty string');
    else {
      try { parse(entry.message); } catch (e) { issue(`invalid ICU message: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (typeof entry.description !== 'string' || entry.description.trim() === '') issue('description must be a non-empty string');
    if (entry.sensitivity !== 'normal' && entry.sensitivity !== 'guarantee') issue('sensitivity must be normal or guarantee');
    if (entry.maxLength !== undefined && (!Number.isInteger(entry.maxLength) || (entry.maxLength as number) <= 0)) issue('maxLength must be a positive integer when present');
  }
  return issues;
}

const COPY_ATTRS = new Set(['aria-label', 'aria-description', 'aria-placeholder', 'title', 'placeholder', 'alt']);
const COPY_HELPERS = new Set(['heading', 'field', 'label', 'hint', 'error', 'badge', 'status', 'say', 'announce', 'text', 'button', 'btn', 'paragraph', 'description', 'alert', 'confirm', 'prompt']);
const isPunctuation = (s: string): boolean => /^[\s\p{P}\p{S}]*$/u.test(s);

export interface LiteralFinding { file: string; line: number; reason: string; text: string }
export interface ScanResult { findings: LiteralFinding[]; exclusions: { file: string; name: string; reason: string }[] }

function isVerifyViewDeclaration(node: ts.Node): boolean {
  if (ts.isFunctionDeclaration(node)) return node.name?.text === 'verifyView';
  return ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'verifyView' && node.initializer !== undefined && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer));
}

/** Find likely user-visible hard-coded strings in a deliberately bounded TS source set. */
export function lintLiterals(files: Readonly<Record<string, string>>): ScanResult {
  const findings: LiteralFinding[] = [];
  const exclusions: ScanResult['exclusions'] = [];
  const addFinding = (file: string, source: ts.SourceFile, node: ts.Node, reason: string, text: string): void => {
    if (text.trim() === '' || isPunctuation(text)) return;
    findings.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, reason, text });
  };
  for (const file of Object.keys(files).sort()) {
    const source = ts.createSourceFile(file, files[file]!, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const containsTranslator = (node: ts.Node): boolean => {
      if (ts.isCallExpression(node)) {
        const e = node.expression;
        if ((ts.isIdentifier(e) && e.text === 't') || (ts.isPropertyAccessExpression(e) && e.name.text === 't')) return true;
      }
      return node.getChildren(source).some(containsTranslator);
    };
    const visit = (node: ts.Node): void => {
      if (isVerifyViewDeclaration(node)) {
        exclusions.push({ file, name: 'verifyView', reason: 'restricted block excluded by scan scope' });
        return;
      }
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
        if (name === 'h') {
          // h(tag, attrs, ...children): only inspect children, never the tag or infrastructure attributes.
          for (const arg of node.arguments.slice(2)) inspectChild(arg);
        } else if ((name === 'setAttribute' || name === 'setAttributeNS') && node.arguments.length >= 2) {
          const attr = node.arguments[name === 'setAttributeNS' ? 1 : 0];
          const value = node.arguments[name === 'setAttributeNS' ? 2 : 1];
          if (attr && value && isString(attr) && COPY_ATTRS.has(attr.text)) inspectLiteral(value, `literal ${attr.text} attribute`);
        } else if (COPY_HELPERS.has(name) && node.arguments[0]) {
          inspectLiteral(node.arguments[0]!, `literal argument to ${name}()`);
          if (name === 'field' && node.arguments[2]) inspectLiteral(node.arguments[2]!, 'literal field hint');
        } else if (name === 'link' && node.arguments[1]) inspectLiteral(node.arguments[1]!, 'literal link label');
        else if (name === 'render' && node.arguments[0]) inspectLiteral(node.arguments[0]!, 'literal render title');
        // A translated value joined with literal text likely produces user-visible copy.
      }
      if (ts.isPropertyAssignment(node)) {
        const attrName = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : '';
        if (COPY_ATTRS.has(attrName)) inspectLiteral(node.initializer, `literal ${attrName} attribute`);
      }
      if (ts.isTemplateExpression(node) && containsTranslator(node) && !ts.isBinaryExpression(node.parent) && !ts.isCallExpression(node.parent)) inspectLiteral(node, 'literal text embedded with translated message');
      if (ts.isPropertyAccessExpression(node) && (node.name.text === 'textContent' || node.name.text === 'innerText' || (node.name.text === 'title' && ts.isIdentifier(node.expression) && node.expression.text === 'document')) && ts.isBinaryExpression(node.parent) && (node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken || node.parent.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken)) inspectLiteral(node.parent.right, `literal ${node.name.text} assignment`);
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'document' && node.expression.name.text === 'createTextNode' && node.arguments[0]) inspectLiteral(node.arguments[0], 'literal document.createTextNode() text');
      if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.PlusToken || node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken)) {
        if (containsTranslator(node.left) || containsTranslator(node.right)) {
          inspectLiteral(node.left, 'literal concatenated with translated message');
          inspectLiteral(node.right, 'literal concatenated with translated message');
        }
      }
      ts.forEachChild(node, visit);

      function inspectChild(child: ts.Node): void {
        inspectLiteral(child, ts.isTemplateExpression(child) && containsTranslator(child) ? 'literal text embedded with translated message' : 'literal DOM text child');
      }
      function inspectLiteral(value: ts.Node, reason: string): void {
        value = unwrap(value);
        if (isString(value)) addFinding(file, source, value, reason, value.text);
        else if (ts.isArrayLiteralExpression(value)) value.elements.forEach((x) => inspectLiteral(x, reason));
        else if (ts.isConditionalExpression(value)) { inspectLiteral(value.whenTrue, reason); inspectLiteral(value.whenFalse, reason); }
        else if (ts.isTemplateExpression(value)) {
          if (value.head.text) addFinding(file, source, value, reason, value.head.text);
          for (const span of value.templateSpans) if (span.literal.text) addFinding(file, source, span.literal, reason, span.literal.text);
        } else if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.PlusToken) {
          inspectLiteral(value.left, reason);
          inspectLiteral(value.right, reason);
        }
      }
    };
    visit(source);
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.reason.localeCompare(b.reason) || a.text.localeCompare(b.text));
  exclusions.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
  const unique = findings.filter((x, i) => i === 0 || x.file !== findings[i - 1]!.file || x.line !== findings[i - 1]!.line || x.reason !== findings[i - 1]!.reason || x.text !== findings[i - 1]!.text);
  return { findings: unique, exclusions };
}

function unwrap(node: ts.Node): ts.Node {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression;
  return node;
}

function isString(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}
