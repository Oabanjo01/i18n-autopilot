/**
 * Rewrite source files to use i18next translation calls.
 *
 * The rewriter replaces extracted string literals with `t("key")`, adds the
 * `useTranslation` import when required, and injects the hook into component
 * bodies that now depend on it.
 */

import fs from "fs";
import path from "path";
import * as babelParser from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
import { ExtractedString } from "./parser";
import {
  ensureBlockBody,
  findComponentFunction,
  readJSXText,
} from "./astHelpers";

import { execSync } from "child_process";
import chalk from "chalk";
import inquirer from "inquirer";
import { log } from "./reporter";

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

function buildValueKeyMap(
  extracted: ExtractedString[],
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

function hasUseTranslationImport(ast: t.File): boolean {
  for (const node of ast.program.body) {
    if (t.isImportDeclaration(node) && node.source.value === "react-i18next") {
      return node.specifiers.some(
        (specifier) =>
          t.isImportSpecifier(specifier) &&
          t.isIdentifier(specifier.imported) &&
          specifier.imported.name === "useTranslation",
      );
    }
  }
  return false;
}

function addUseTranslationImport(ast: t.File): void {
  for (const node of ast.program.body) {
    if (t.isImportDeclaration(node) && node.source.value === "react-i18next") {
      const hasSpecifier = node.specifiers.some(
        (specifier) =>
          t.isImportSpecifier(specifier) &&
          t.isIdentifier(specifier.imported) &&
          specifier.imported.name === "useTranslation",
      );

      if (!hasSpecifier) {
        node.specifiers.push(
          t.importSpecifier(
            t.identifier("useTranslation"),
            t.identifier("useTranslation"),
          ),
        );
      }
      return;
    }
  }

  const importDeclaration = t.importDeclaration(
    [
      t.importSpecifier(
        t.identifier("useTranslation"),
        t.identifier("useTranslation"),
      ),
    ],
    t.stringLiteral("react-i18next"),
  );

  // Insert after the last existing import
  let lastImportIndex = -1;
  ast.program.body.forEach((node, index) => {
    if (t.isImportDeclaration(node)) lastImportIndex = index;
  });

  // Babel also records a comment that sits below the last import as that
  // import's trailing comment; keep only same-line ones so the comment stays
  // attached to the code it describes instead of landing above the new import.
  const lastImport = ast.program.body[lastImportIndex];
  if (lastImport?.trailingComments && lastImport.loc) {
    const importEndLine = lastImport.loc.end.line;
    lastImport.trailingComments = lastImport.trailingComments.filter(
      (c) => c.loc?.start.line === importEndLine,
    );
  }

  ast.program.body.splice(lastImportIndex + 1, 0, importDeclaration);
}

function hasUseTranslationHook(funcBody: t.BlockStatement): boolean {
  return funcBody.body.some(
    (node) =>
      t.isVariableDeclaration(node) &&
      node.declarations.some(
        (decl) =>
          t.isVariableDeclarator(decl) &&
          t.isCallExpression(decl.init) &&
          t.isIdentifier((decl.init as t.CallExpression).callee) &&
          ((decl.init as t.CallExpression).callee as t.Identifier).name ===
            "useTranslation",
      ),
  );
}

function injectUseTranslationHook(funcBody: t.BlockStatement): void {
  const hookDeclaration = t.variableDeclaration("const", [
    t.variableDeclarator(
      t.objectPattern([
        t.objectProperty(t.identifier("t"), t.identifier("t"), false, true),
      ]),
      t.callExpression(t.identifier("useTranslation"), []),
    ),
  ]);

  // Inject as the first statement in the function body
  funcBody.body.unshift(hookDeclaration);
}

function buildTCall(key: string): t.CallExpression {
  return t.callExpression(t.identifier("t"), [t.stringLiteral(key)]);
}

function buildTFactoryCall(varName: string): t.CallExpression {
  return t.callExpression(t.identifier(varName), [t.identifier("t")]);
}

function rewriteComponentFile(
  source: string,
  filePath: string,
  fileValueMap: Map<string, string>,
  textComponents: string[],
): string | null {
  const ast = babelParser.parse(source, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  let modified = false;
  const functionsNeedingHook = new Set<t.Function>();

  traverse(ast, {
    JSXElement(path) {
      const openingEl = path.node.openingElement;
      if (!t.isJSXIdentifier(openingEl.name)) return;

      const isTextComponent = textComponents.includes(openingEl.name.name);
      if (!isTextComponent) return;

      const component = findComponentFunction(path);
      if (!component) return;

      const children = path.node.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];

        // <Text>Hello world</Text>
        if (t.isJSXText(child)) {
          const text = readJSXText(child);
          const key = text && fileValueMap.get(text.value);
          if (!text || !key) continue;

          // Keep the spaces React would have rendered next to sibling elements.
          const replacement: t.JSXElement["children"] = [
            ...(text.leadingSpace ? [t.jsxText(" ")] : []),
            t.jsxExpressionContainer(buildTCall(key)),
            ...(text.trailingSpace ? [t.jsxText(" ")] : []),
          ];
          children.splice(i, 1, ...replacement);
          i += replacement.length - 1;
          modified = true;
          functionsNeedingHook.add(component.node);
          continue;
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
          functionsNeedingHook.add(component.node);
        }

        // <Text>{`Hello world`}</Text>
        if (
          t.isJSXExpressionContainer(child) &&
          t.isTemplateLiteral(child.expression) &&
          child.expression.expressions.length === 0
        ) {
          const value = child.expression.quasis[0].value.cooked?.trim() ?? "";
          const key = fileValueMap.get(value);
          if (!key) continue;

          child.expression = buildTCall(key);
          modified = true;
          functionsNeedingHook.add(component.node);
        }
      }
    },
  });

  if (!modified) return null;

  injectHooks(functionsNeedingHook);

  if (!hasUseTranslationImport(ast)) {
    addUseTranslationImport(ast);
  }

  const { code } = generate(ast, { retainLines: false }, source);
  return code;
}

function rewriteHookFile(
  source: string,
  filePath: string,
  valueKeyMap: Map<string, string>,
): string | null {
  const ast = babelParser.parse(source, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  let modified = false;
  const functionsNeedingHook = new Set<t.Function>();

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (!t.isIdentifier(callee) || callee.name !== "useState") return;

      const arg = path.node.arguments[0];
      if (!arg || !t.isStringLiteral(arg)) return;

      const value = arg.value.trim();
      const key = valueKeyMap.get(value);
      if (!key) return;

      const component = findComponentFunction(path);
      if (!component) return;

      // Replace useState("string") with useState(t('key'))
      path.node.arguments[0] = buildTCall(key);
      modified = true;
      functionsNeedingHook.add(component.node);
    },
  });

  if (!modified) return null;

  injectHooks(functionsNeedingHook);

  if (!hasUseTranslationImport(ast)) {
    addUseTranslationImport(ast);
  }

  const { code } = generate(ast, { retainLines: false }, source);
  return code;
}

function injectHooks(functions: Set<t.Function>): void {
  for (const fn of functions) {
    const body = ensureBlockBody(fn);
    if (!hasUseTranslationHook(body)) {
      injectUseTranslationHook(body);
    }
  }
}

/**
 * The top-level `const X = …` a container belongs to, if any. Only module
 * scope containers can be turned into `(t) => …` factories; anything inside a
 * class or a plain helper function has no safe way to receive `t`.
 */
function findModuleLevelDeclarator(
  path: NodePath,
): t.VariableDeclarator | null {
  const declaratorPath = path.findParent((p) =>
    p.isVariableDeclarator(),
  ) as NodePath<t.VariableDeclarator> | null;
  if (!declaratorPath || !t.isIdentifier(declaratorPath.node.id)) return null;
  if (declaratorPath.getFunctionParent()) return null;
  if (declaratorPath.findParent((p) => p.isClass())) return null;
  return declaratorPath.node;
}

export function rewriteFiles(options: RewriterOptions): RewriteResult[] {
  const { projectPath, extracted, textComponents, dryRun } = options;
  const results: RewriteResult[] = [];
  const valueKeyMap = buildValueKeyMap(extracted);

  for (const [filePath, fileValueMap] of valueKeyMap.entries()) {
    try {
      const source = fs.readFileSync(filePath, "utf-8");

      const isHook =
        filePath.includes("/hooks/") ||
        path.basename(filePath, path.extname(filePath)).startsWith("use");

      const newSource = isHook
        ? rewriteHookFile(source, filePath, fileValueMap)
        : rewriteComponentFile(source, filePath, fileValueMap, textComponents);

      if (!newSource) {
        results.push({
          filePath,
          modified: false,
          skipped: true,
          reason: "No changes needed",
        });
        continue;
      }

      if (!dryRun) {
        fs.writeFileSync(filePath, newSource, "utf-8");
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

function detectPackageManager(projectPath: string): "yarn" | "npm" {
  const resolved = path.resolve(projectPath);
  if (fs.existsSync(path.join(resolved, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(resolved, "package-lock.json"))) return "npm";
  // Default to yarn if neither lockfile found
  return "yarn";
}

function isPackageInstalled(projectPath: string, packageName: string): boolean {
  try {
    const pkgJson = JSON.parse(
      fs.readFileSync(
        path.join(path.resolve(projectPath), "package.json"),
        "utf-8",
      ),
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
  projectPath: string,
): Promise<boolean> {
  const hasI18next = isPackageInstalled(projectPath, "i18next");
  const hasReactI18next = isPackageInstalled(projectPath, "react-i18next");

  if (hasI18next && hasReactI18next) return true;

  const missing = [
    !hasI18next && "i18next",
    !hasReactI18next && "react-i18next",
  ]
    .filter(Boolean)
    .join(" ");

  const pm = detectPackageManager(projectPath);
  const installCmd =
    pm === "yarn" ? `yarn add ${missing}` : `npm install ${missing}`;

  const { permission } = await inquirer.prompt([
    {
      type: "confirm",
      name: "permission",
      message: `${missing} not found in project. Install now using ${pm}?`,
      default: true,
    },
  ]);

  if (!permission) {
    log(
      chalk.yellow(`\n  Install manually inside your project: ${installCmd}\n`),
    );
    return false;
  }

  try {
    execSync(`cd ${path.resolve(projectPath)} && ${installCmd}`, {
      stdio: "inherit",
    });
    return true;
  } catch {
    console.error(
      chalk.red(`  Failed to install. Try manually: ${installCmd}`),
    );
    return false;
  }
}

/**
 * Collect every function body in the file that renders JSX.
 *
 * These are the only places where it is valid to inject `useTranslation()`.
 */
function collectComponentFunctionBodies(ast: t.File): Set<t.BlockStatement> {
  const bodies = new Set<t.BlockStatement>();
  traverse(ast, {
    JSXElement(path) {
      let current: typeof path.parentPath | null = path.parentPath;
      while (current) {
        const node = current.node;
        if (
          (t.isFunctionDeclaration(node) ||
            t.isFunctionExpression(node) ||
            t.isArrowFunctionExpression(node)) &&
          t.isBlockStatement(node.body)
        ) {
          bodies.add(node.body);
          break;
        }
        current = current.parentPath;
      }
    },
  });
  return bodies;
}

/**
 * Rewrite deep-analysis matches for objects, arrays, and Maps.
 *
 * Function-scoped containers can be rewritten in place because `t` is available
 * in the same scope. Module-scoped containers are converted into small factory
 * functions that accept `t`, and all in-component references are updated to
 * call those factories.
 */
export function rewriteDeepFiles(options: RewriterOptions): RewriteResult[] {
  const { extracted, dryRun } = options;
  const results: RewriteResult[] = [];

  const deepRecords = extracted.filter(
    (e) => e.nodeType === "ObjectProperty" || e.nodeType === "ArrayElement",
  );

  if (deepRecords.length === 0) return results;

  const fileMap = buildValueKeyMap(deepRecords);

  for (const [filePath, fileValueMap] of fileMap.entries()) {
    try {
      const source = fs.readFileSync(filePath, "utf-8");

      const ast = babelParser.parse(source, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      });

      let modified = false;
      const functionsNeedingHook = new Set<t.Function>();
      const moduleScopeBindings = new Map<string, t.VariableDeclarator>();

      // Records where `t` will come from for a container at `path`; false when
      // there's no safe source, in which case the string is left as-is.
      const provideT = (path: NodePath): boolean => {
        const component = findComponentFunction(path);
        if (component) {
          functionsNeedingHook.add(component.node);
          return true;
        }
        const declarator = findModuleLevelDeclarator(path);
        if (declarator) {
          moduleScopeBindings.set((declarator.id as t.Identifier).name, declarator);
          return true;
        }
        return false;
      };

      traverse(ast, {
        ObjectProperty(path) {
          if (!t.isStringLiteral(path.node.value)) return;
          const value = (path.node.value as t.StringLiteral).value;
          const key = fileValueMap.get(value);
          if (!key) return;
          if (!provideT(path)) return;

          path.node.value = buildTCall(key);
          modified = true;
        },

        ArrayExpression(path) {
          const elements = path.node.elements;
          for (let i = 0; i < elements.length; i++) {
            const elem = elements[i];
            if (!t.isStringLiteral(elem)) continue;
            const value = (elem as t.StringLiteral).value;
            const key = fileValueMap.get(value);
            if (!key) continue;
            if (!provideT(path)) return;

            elements[i] = buildTCall(key);
            modified = true;
          }
        },

        NewExpression(path) {
          const node = path.node;
          if (!t.isIdentifier(node.callee) || node.callee.name !== "Map")
            return;
          if (node.arguments.length !== 1) return;
          const arg = node.arguments[0];
          if (!t.isArrayExpression(arg)) return;

          for (const pair of arg.elements) {
            if (!t.isArrayExpression(pair)) continue;
            const pairElems = pair.elements;
            if (pairElems.length !== 2) continue;
            const valueElem = pairElems[1];
            if (!t.isStringLiteral(valueElem)) continue;
            const value = (valueElem as t.StringLiteral).value;
            const key = fileValueMap.get(value);
            if (!key) continue;
            if (!provideT(path)) return;

            pairElems[1] = buildTCall(key);
            modified = true;
          }
        },
      });

      if (!modified) {
        results.push({
          filePath,
          modified: false,
          skipped: true,
          reason: "No changes needed",
        });
        continue;
      }

      // Module-scope containers cannot call `t` directly, so turn them into
      // factories and update component references to pass the hook result in.
      for (const [varName, declarator] of moduleScopeBindings.entries()) {
        if (!declarator.init) continue;
        declarator.init = t.arrowFunctionExpression(
          [t.identifier("t")],
          declarator.init,
        );

        traverse(ast, {
          Identifier(path) {
            if (path.node.name !== varName) return;
            if (!path.isReferencedIdentifier()) return;

            const parent = path.parentPath;
            if (
              parent &&
              parent.isCallExpression() &&
              parent.node.callee === path.node &&
              parent.node.arguments.length === 1 &&
              t.isIdentifier(parent.node.arguments[0]) &&
              parent.node.arguments[0].name === "t"
            ) {
              return;
            }

            const binding = path.scope.getBinding(varName);
            if (!binding || binding.path.node !== declarator) return;

            const component = findComponentFunction(path);
            if (!component) return;

            path.replaceWith(buildTFactoryCall(varName));
            functionsNeedingHook.add(component.node);
            path.skip();
          },
        });
      }

      injectHooks(functionsNeedingHook);

      if (!hasUseTranslationImport(ast)) {
        addUseTranslationImport(ast);
      }

      const { code } = generate(ast, { retainLines: false }, source);

      if (!dryRun) {
        fs.writeFileSync(filePath, code, "utf-8");
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
