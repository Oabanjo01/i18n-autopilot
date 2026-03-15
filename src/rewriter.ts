/**
 * src/rewriter.ts — The surgeon. 
 * Goes back into each file and does two things: replaces every hardcoded string with t('key'), and injects useTranslation() into the component at the right position.
 */

import fs from 'fs';
import path from 'path';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import generate from '@babel/generator';
import { ExtractedString } from './parser';

import { execSync } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { log } from './reporter';

interface RewriterOptions {
  projectPath: string;
  extracted: ExtractedString[];
  textComponents: string[];
  dryRun: boolean;
}

interface RewriteResult {
  filePath: string;
  modified: boolean;
  skipped: boolean;
  reason?: string;
}

// ─── Build a lookup map: filePath → { value → key } ─────────────────────────

function buildValueKeyMap(
  extracted: ExtractedString[]
): Map<string, Map<string, string>> {
  const map = new Map<string, Map<string, string>>();

  for (const item of extracted) {
    if (!map.has(item.filePath)) {
      map.set(item.filePath, new Map());
    }
    map.get(item.filePath)!.set(item.value, item.key);
  }

  return map;
}

// ─── Check if useTranslation is already imported ─────────────────────────────

function hasUseTranslationImport(ast: t.File): boolean {
  for (const node of ast.program.body) {
    if (
      t.isImportDeclaration(node) &&
      node.source.value === 'react-i18next'
    ) {
      return true;
    }
  }
  return false;
}

// ─── Add useTranslation import at top of file ────────────────────────────────

function addUseTranslationImport(ast: t.File): void {
  const importDeclaration = t.importDeclaration(
    [t.importSpecifier(
      t.identifier('useTranslation'),
      t.identifier('useTranslation')
    )],
    t.stringLiteral('react-i18next')
  );

  // Insert after the last existing import
  let lastImportIndex = 0;
  ast.program.body.forEach((node, index) => {
    if (t.isImportDeclaration(node)) lastImportIndex = index;
  });

  ast.program.body.splice(lastImportIndex + 1, 0, importDeclaration);
}

// ─── Check if useTranslation hook is already declared in a function ──────────

function hasUseTranslationHook(funcBody: t.BlockStatement): boolean {
  return funcBody.body.some(
    (node) =>
      t.isVariableDeclaration(node) &&
      node.declarations.some(
        (decl) =>
          t.isVariableDeclarator(decl) &&
          t.isCallExpression(decl.init) &&
          t.isIdentifier((decl.init as t.CallExpression).callee) &&
          ((decl.init as t.CallExpression).callee as t.Identifier).name === 'useTranslation'
      )
  );
}

// ─── Inject const { t } = useTranslation() into function body ────────────────

function injectUseTranslationHook(funcBody: t.BlockStatement): void {
  const hookDeclaration = t.variableDeclaration('const', [
    t.variableDeclarator(
      t.objectPattern([
        t.objectProperty(
          t.identifier('t'),
          t.identifier('t'),
          false,
          true
        ),
      ]),
      t.callExpression(t.identifier('useTranslation'), [])
    ),
  ]);

  // Inject as the first statement in the function body
  funcBody.body.unshift(hookDeclaration);
}

// ─── Build t('key') call expression ─────────────────────────────────────────

function buildTCall(key: string): t.CallExpression {
  return t.callExpression(t.identifier('t'), [t.stringLiteral(key)]);
}

// ─── Rewrite a single component file ─────────────────────────────────────────

function rewriteComponentFile(
  source: string,
  filePath: string,
  fileValueMap: Map<string, string>,
  textComponents: string[]
): string | null {
  const ast = babelParser.parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });

  let modified = false;
  const functionsNeedingHook = new Set<t.BlockStatement>();

  traverse(ast, {
    JSXElement(path) {
      const openingEl = path.node.openingElement;
      if (!t.isJSXIdentifier(openingEl.name)) return;

      const isTextComponent = textComponents.includes(openingEl.name.name);
      if (!isTextComponent) return;

      for (let i = 0; i < path.node.children.length; i++) {
        const child = path.node.children[i];

        // <Text>Hello world</Text>
        if (t.isJSXText(child)) {
          const value = child.value.trim();
          const key = fileValueMap.get(value);
          if (!key) continue;

          path.node.children[i] = t.jsxExpressionContainer(buildTCall(key));
          modified = true;

          const funcBody = findEnclosingFunctionBody(path);
          if (funcBody) functionsNeedingHook.add(funcBody);
        }

        // <Text>{'Hello world'}</Text>
        if (
          t.isJSXExpressionContainer(child) &&
          t.isStringLiteral(child.expression)
        ) {
          const value = child.expression.value.trim();
          const key = fileValueMap.get(value);
          if (!key) continue;

          child.expression = buildTCall(key);
          modified = true;

          const funcBody = findEnclosingFunctionBody(path);
          if (funcBody) functionsNeedingHook.add(funcBody);
        }

        // <Text>{`Hello world`}</Text>
        if (
          t.isJSXExpressionContainer(child) &&
          t.isTemplateLiteral(child.expression) &&
          child.expression.expressions.length === 0
        ) {
          const value = child.expression.quasis[0].value.cooked?.trim() ?? '';
          const key = fileValueMap.get(value);
          if (!key) continue;

          child.expression = buildTCall(key);
          modified = true;

          const funcBody = findEnclosingFunctionBody(path);
          if (funcBody) functionsNeedingHook.add(funcBody);
        }
      }
    },
  });

  if (!modified) return null;

  for (const funcBody of functionsNeedingHook) {
    if (!hasUseTranslationHook(funcBody)) {
      injectUseTranslationHook(funcBody);
    }
  }

  if (!hasUseTranslationImport(ast)) {
    addUseTranslationImport(ast);
  }

  const { code } = generate(ast, { retainLines: false }, source);
  return code;
}

// ─── Rewrite a single hook file ──────────────────────────────────────────────

function rewriteHookFile(
  source: string,
  filePath: string,
  valueKeyMap: Map<string, string>
): string | null {
  const ast = babelParser.parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });

  let modified = false;
  const functionsNeedingHook = new Set<t.BlockStatement>();

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (!t.isIdentifier(callee) || callee.name !== 'useState') return;

      const arg = path.node.arguments[0];
      if (!arg || !t.isStringLiteral(arg)) return;

      const value = arg.value.trim();
      const key = valueKeyMap.get(value);
      if (!key) return;

      // Replace useState("string") with useState(t('key'))
      path.node.arguments[0] = buildTCall(key);
      modified = true;

      const funcBody = findEnclosingFunctionBody(path);
      if (funcBody) functionsNeedingHook.add(funcBody);
    },
  });

  if (!modified) return null;

  for (const funcBody of functionsNeedingHook) {
    if (!hasUseTranslationHook(funcBody)) {
      injectUseTranslationHook(funcBody);
    }
  }

  if (!hasUseTranslationImport(ast)) {
    addUseTranslationImport(ast);
  }

  const { code } = generate(ast, { retainLines: false }, source);
  return code;
}

// ─── Walk up AST to find the nearest enclosing function body ─────────────────

function findEnclosingFunctionBody(path: any): t.BlockStatement | null {
  let current = path.parentPath;

  while (current) {
    const node = current.node;

    if (
      t.isFunctionDeclaration(node) ||
      t.isFunctionExpression(node) ||
      t.isArrowFunctionExpression(node)
    ) {
      if (t.isBlockStatement(node.body)) {
        return node.body;
      }
    }

    current = current.parentPath;
  }

  return null;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function rewriteFiles(options: RewriterOptions): RewriteResult[] {
  const { projectPath, extracted, textComponents, dryRun } = options;
  const results: RewriteResult[] = [];
  const valueKeyMap = buildValueKeyMap(extracted);

  for (const [filePath, fileValueMap] of valueKeyMap.entries()) {
    try {
      const source = fs.readFileSync(filePath, 'utf-8');

      const isHook =
        filePath.includes('/hooks/') ||
        path.basename(filePath, path.extname(filePath)).startsWith('use');

      const newSource = isHook
        ? rewriteHookFile(source, filePath, fileValueMap)
        : rewriteComponentFile(source, filePath, fileValueMap, textComponents);

      if (!newSource) {
        results.push({ filePath, modified: false, skipped: true, reason: 'No changes needed' });
        continue;
      }

      if (!dryRun) {
        fs.writeFileSync(filePath, newSource, 'utf-8');
      }

      results.push({ filePath, modified: true, skipped: false });
    } catch (err: any) {
      results.push({
        filePath,
        modified: false,
        skipped: true,
        reason: `Parse error: ${err.message}`,
      });
    }
  }

  return results;
}

function detectPackageManager(projectPath: string): 'yarn' | 'npm' {
  const resolved = path.resolve(projectPath);
  if (fs.existsSync(path.join(resolved, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(resolved, 'package-lock.json'))) return 'npm';
  // Default to yarn if neither lockfile found
  return 'yarn';
}

function isPackageInstalled(projectPath: string, packageName: string): boolean {
  try {
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(path.resolve(projectPath), 'package.json'), 'utf-8')
    );
    return (
      !!pkgJson.dependencies?.[packageName] ||
      !!pkgJson.devDependencies?.[packageName]
    );
  } catch {
    return false;
  }
}

export async function ensureI18nDependencies(
  projectPath: string
): Promise<boolean> {
  const hasI18next = isPackageInstalled(projectPath, 'i18next');
  const hasReactI18next = isPackageInstalled(projectPath, 'react-i18next');

  if (hasI18next && hasReactI18next) return true;

  const missing = [
    !hasI18next && 'i18next',
    !hasReactI18next && 'react-i18next',
  ].filter(Boolean).join(' ');

   const pm = detectPackageManager(projectPath);
  const installCmd = pm === 'yarn' ? `yarn add ${missing}` : `npm install ${missing}`;

   const { permission } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'permission',
      message: `${missing} not found in project. Install now using ${pm}?`,
      default: true,
    },
  ]);

  if (!permission) {
    log(chalk.yellow(`\n  Install manually inside your project: ${installCmd}\n`));
    return false;
  }

  try {
    execSync(`cd ${path.resolve(projectPath)} && ${installCmd}`, {
      stdio: 'inherit',
    });
    return true;
  } catch {
    console.error(chalk.red(`  Failed to install. Try manually: ${installCmd}`));
    return false;
  }
}