import ts from 'typescript';

export interface MessageReference { file: string; line: number; key: string }
export interface DynamicReference { file: string; line: number; expression: string }

function isTranslatorCall(node: ts.CallExpression): boolean {
  const e = node.expression;
  return (ts.isIdentifier(e) && e.text === 't') || (ts.isPropertyAccessExpression(e) && e.name.text === 't');
}

function isVerifyViewDeclaration(node: ts.Node): boolean {
  if (ts.isFunctionDeclaration(node)) return node.name?.text === 'verifyView';
  return ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'verifyView' && node.initializer !== undefined && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer));
}

/** Find static catalog keys and dynamic translator calls. Results are stable regardless of input order. */
export function extractReferences(files: Readonly<Record<string, string>>): { static: MessageReference[]; dynamic: DynamicReference[] } {
  const statics: MessageReference[] = [];
  const dynamics: DynamicReference[] = [];
  for (const file of Object.keys(files).sort()) {
    const source = ts.createSourceFile(file, files[file]!, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if (isVerifyViewDeclaration(node)) return;
      if (ts.isCallExpression(node) && isTranslatorCall(node)) {
        const first = node.arguments[0];
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
          statics.push({ file, line, key: first.text });
        } else {
          dynamics.push({ file, line, expression: first ? first.getText(source) : '(missing argument)' });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const byRef = (a: MessageReference, b: MessageReference): number => a.file.localeCompare(b.file) || a.line - b.line || a.key.localeCompare(b.key);
  statics.sort(byRef);
  dynamics.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.expression.localeCompare(b.expression));
  return { static: statics, dynamic: dynamics };
}

export function unknownReferences(refs: readonly MessageReference[], catalog: Readonly<Record<string, unknown>>): MessageReference[] {
  const known = new Set(Object.keys(catalog));
  return refs.filter((r) => !known.has(r.key));
}
