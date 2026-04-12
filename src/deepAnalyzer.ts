/**
 * Deep static analysis for container-based strings.
 *
 * This module traces object literals, arrays, and Maps from their declaration
 * sites to JSX render sites so `--deep` can translate values that are not
 * written inline inside a `<Text>` element.
 */

import * as babelParser from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { ScannedFile } from "./scanner";
import { ExtractedString } from "./parser";

export interface DeepAnalyzerOptions {
  textComponents: string[]; // e.g. ["Text", "CustomText"]
  dryRun: boolean;
}

export interface DeepAnalyzerResult {
  extracted: ExtractedString[];
  skippedFiles: Array<{ filePath: string; reason: string }>;
  stats: {
    sourceObjectsAnalyzed: number;
    translatablePropertiesFound: number;
    filesSkipped: number;
  };
}

interface SourceObject {
  varName: string;
  kind: "object" | "objectArray" | "stringArray" | "map";
  entries: Map<string, string>; // dotted key path → string value
  scope: "module" | "function";
  isExported: boolean;
  node: any; // t.VariableDeclarator
}

interface TranslatableProperty {
  sourceVar: string;
  keyPath: string; // e.g. "label", "header.title", "[0].text", map key
  value: string;
  filePath: string;
  nodeType: "ObjectProperty" | "ArrayElement";
}

type SourceObjectMap = Map<string, SourceObject>;
type IndirectionMap = Map<string, { sourceVar: string; keyPath: string }>;

function isTranslatableString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length < 2) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (/^[^a-zA-Z]+$/.test(trimmed)) return false;
  return true;
}

/**
 * Build a map of statically analyzable string containers declared in a file.
 *
 * The deep analyzer uses this catalogue later when it sees those containers
 * referenced from JSX render paths.
 */
export function collectSourceObjects(
  ast: t.File,
  filePath: string,
): SourceObjectMap {
  const map: SourceObjectMap = new Map();

  traverse(ast, {
    VariableDeclarator(path) {
      const node = path.node;
      if (!t.isIdentifier(node.id)) return;
      const varName = node.id.name;
      const init = node.init;
      if (!init) return;

      const declarationPath = path.parentPath; // VariableDeclaration
      const scope: "module" | "function" =
        declarationPath && t.isProgram(declarationPath.parent)
          ? "module"
          : "function";
      const isExported =
        declarationPath != null &&
        (t.isExportNamedDeclaration(declarationPath.parent) ||
          t.isExportDefaultDeclaration(declarationPath.parent));

      if (t.isObjectExpression(init)) {
        const entries = new Map<string, string>();
        for (const prop of init.properties) {
          if (!t.isObjectProperty(prop)) continue;
          const key = propKey(prop);
          if (key === null) continue;

          if (t.isStringLiteral(prop.value)) {
            if (isTranslatableString(prop.value.value)) {
              entries.set(key, prop.value.value);
            }
          } else if (t.isObjectExpression(prop.value)) {
            for (const nested of prop.value.properties) {
              if (!t.isObjectProperty(nested)) continue;
              const nestedKey = propKey(nested);
              if (nestedKey === null) continue;
              if (t.isStringLiteral(nested.value)) {
                if (isTranslatableString(nested.value.value)) {
                  entries.set(`${key}.${nestedKey}`, nested.value.value);
                }
              }
            }
          }
        }
        if (entries.size > 0) {
          map.set(varName, {
            varName,
            kind: "object",
            entries,
            scope,
            isExported,
            node,
          });
        }
        return;
      }

      if (t.isArrayExpression(init)) {
        const elements = init.elements.filter(
          (e): e is t.Expression => e != null,
        );
        if (elements.length === 0) return;

        const allObjects = elements.every((e) => t.isObjectExpression(e));
        const allStrings = elements.every((e) => t.isStringLiteral(e));

        if (allObjects) {
          const entries = new Map<string, string>();
          for (const elem of elements as t.ObjectExpression[]) {
            for (const prop of elem.properties) {
              if (!t.isObjectProperty(prop)) continue;
              const key = propKey(prop);
              if (key === null) continue;
              if (t.isStringLiteral(prop.value)) {
                if (isTranslatableString(prop.value.value)) {
                  entries.set(key, prop.value.value);
                }
              }
            }
          }
          if (entries.size > 0) {
            map.set(varName, {
              varName,
              kind: "objectArray",
              entries,
              scope,
              isExported,
              node,
            });
          }
          return;
        }

        if (allStrings) {
          const entries = new Map<string, string>();
          (elements as t.StringLiteral[]).forEach((elem, idx) => {
            if (isTranslatableString(elem.value)) {
              entries.set(String(idx), elem.value);
            }
          });
          if (entries.size > 0) {
            map.set(varName, {
              varName,
              kind: "stringArray",
              entries,
              scope,
              isExported,
              node,
            });
          }
          return;
        }

        return;
      }

      if (
        t.isNewExpression(init) &&
        t.isIdentifier(init.callee) &&
        init.callee.name === "Map" &&
        init.arguments.length === 1 &&
        t.isArrayExpression(init.arguments[0])
      ) {
        const entries = new Map<string, string>();
        const pairs = (init.arguments[0] as t.ArrayExpression).elements;
        for (const pair of pairs) {
          if (!t.isArrayExpression(pair)) continue;
          const elems = pair.elements;
          if (elems.length !== 2) continue;
          const k = elems[0];
          const v = elems[1];
          if (!t.isStringLiteral(k) || !t.isStringLiteral(v)) continue;
          if (isTranslatableString(v.value)) {
            entries.set(k.value, v.value);
          }
        }
        if (entries.size > 0) {
          map.set(varName, {
            varName,
            kind: "map",
            entries,
            scope,
            isExported,
            node,
          });
        }
        return;
      }
    },
  });

  return map;
}

/** Extract a static object key name when one is available. */
function propKey(prop: t.ObjectProperty): string | null {
  if (t.isIdentifier(prop.key)) return prop.key.name;
  if (t.isStringLiteral(prop.key)) return prop.key.value;
  return null;
}

/**
 * Track one-level aliases such as `const item = ITEMS[0]`.
 *
 * These aliases allow the render-site detector to resolve later expressions
 * like `item.label` back to the original source container.
 */
export function collectIndirections(
  ast: t.File,
  sourceObjectMap: SourceObjectMap,
): IndirectionMap {
  const map: IndirectionMap = new Map();

  traverse(ast, {
    VariableDeclarator(path) {
      const node = path.node;

      if (!t.isIdentifier(node.id)) return;
      const varName = node.id.name;

      const init = node.init;
      if (!t.isMemberExpression(init)) return;

      if (!t.isIdentifier(init.object)) return;
      const sourceVar = init.object.name;
      if (!sourceObjectMap.has(sourceVar)) return;

      const declarationPath = path.parentPath;
      if (!declarationPath || !t.isVariableDeclaration(declarationPath.node))
        return;
      const kind = declarationPath.node.kind;
      if (kind !== "const" && kind !== "let") return;

      let keyPath: string | null = null;

      if (init.computed) {
        if (t.isNumericLiteral(init.property)) {
          keyPath = `[${init.property.value}]`;
        }
      } else {
        if (t.isIdentifier(init.property)) {
          keyPath = init.property.name;
        }
      }

      if (keyPath === null) return;

      map.set(varName, { sourceVar, keyPath });
    },
  });

  return map;
}

/**
 * Walk the file and collect deep-analysis matches that are actually rendered.
 *
 * The detector only considers configured text components and iterable render
 * paths that ultimately feed those components.
 */
export function detectRenderSites(
  ast: t.File,
  sourceObjectMap: SourceObjectMap,
  indirectionMap: IndirectionMap,
  textComponents: string[],
  filePath: string,
): TranslatableProperty[] {
  const results: TranslatableProperty[] = [];

  traverse(ast, {
    JSXElement(path) {
      const openingEl = path.node.openingElement;
      const nameNode = openingEl.name;

      let componentName: string | null = null;
      if (t.isJSXIdentifier(nameNode)) {
        componentName = nameNode.name;
      }

      if (!componentName || !textComponents.includes(componentName)) return;

      for (const child of path.node.children) {
        if (!t.isJSXExpressionContainer(child)) continue;
        const expr = child.expression;
        if (t.isJSXEmptyExpression(expr)) continue;

        const found = dispatchExpression(
          expr,
          sourceObjectMap,
          indirectionMap,
          textComponents,
          filePath,
        );
        results.push(...found);
      }
    },

    JSXExpressionContainer(path) {
      const expr = path.node.expression;
      if (t.isJSXEmptyExpression(expr)) return;
      if (!t.isCallExpression(expr)) return;

      const callee = expr.callee;
      if (!t.isMemberExpression(callee)) return;
      if (!t.isIdentifier(callee.property)) return;
      const methodName = callee.property.name;
      if (methodName !== "map") return;

      const parentJSX = path.parentPath?.node;
      if (t.isJSXElement(parentJSX)) {
        const parentName = (parentJSX as t.JSXElement).openingElement.name;
        if (
          t.isJSXIdentifier(parentName) &&
          textComponents.includes(parentName.name)
        ) {
          return;
        }
      }

      const found = dispatchExpression(
        expr,
        sourceObjectMap,
        indirectionMap,
        textComponents,
        filePath,
      );
      results.push(...found);
    },
  });

  return results;
}

/**
 * Match a JSX expression against the supported deep-analysis patterns.
 */
export function dispatchExpression(
  expr: t.Expression | t.JSXEmptyExpression,
  sourceObjectMap: SourceObjectMap,
  indirectionMap: IndirectionMap,
  textComponents: string[],
  filePath: string,
): TranslatableProperty[] {
  if (t.isJSXEmptyExpression(expr)) return [];

  if (t.isConditionalExpression(expr)) {
    return matchPatternH(
      expr,
      sourceObjectMap,
      indirectionMap,
      textComponents,
      filePath,
    );
  }

  if (t.isCallExpression(expr)) {
    return matchCallExpression(
      expr,
      sourceObjectMap,
      indirectionMap,
      textComponents,
      filePath,
    );
  }

  if (t.isMemberExpression(expr)) {
    return matchMemberExpression(
      expr,
      sourceObjectMap,
      indirectionMap,
      filePath,
    );
  }

  return [];
}

function matchPatternH(
  expr: t.ConditionalExpression,
  sourceObjectMap: SourceObjectMap,
  indirectionMap: IndirectionMap,
  textComponents: string[],
  filePath: string,
): TranslatableProperty[] {
  const results: TranslatableProperty[] = [];
  results.push(
    ...dispatchExpression(
      expr.consequent,
      sourceObjectMap,
      indirectionMap,
      textComponents,
      filePath,
    ),
  );
  results.push(
    ...dispatchExpression(
      expr.alternate,
      sourceObjectMap,
      indirectionMap,
      textComponents,
      filePath,
    ),
  );
  return results;
}

function matchCallExpression(
  expr: t.CallExpression,
  sourceObjectMap: SourceObjectMap,
  indirectionMap: IndirectionMap,
  textComponents: string[],
  filePath: string,
): TranslatableProperty[] {
  const callee = expr.callee;

  if (!t.isMemberExpression(callee)) return [];

  const methodProp = callee.property;
  if (!t.isIdentifier(methodProp)) return [];
  const methodName = methodProp.name;

  if (methodName === "get") {
    return matchPatternFGet(expr, callee, sourceObjectMap, filePath);
  }

  if (methodName === "map") {
    const arrayFromResult = tryMatchArrayFromMapValues(
      callee.object,
      sourceObjectMap,
      filePath,
    );
    if (arrayFromResult !== null) {
      return arrayFromResult;
    }

    return matchPatternAB(
      expr,
      callee,
      sourceObjectMap,
      textComponents,
      filePath,
    );
  }

  return [];
}

function matchPatternFGet(
  expr: t.CallExpression,
  callee: t.MemberExpression,
  sourceObjectMap: SourceObjectMap,
  filePath: string,
): TranslatableProperty[] {
  if (!t.isIdentifier(callee.object)) return [];
  const mapVarName = callee.object.name;
  const sourceObj = sourceObjectMap.get(mapVarName);
  if (!sourceObj || sourceObj.kind !== "map") return [];

  if (expr.arguments.length === 0) return [];
  const keyArg = expr.arguments[0];
  if (!t.isStringLiteral(keyArg)) return [];
  const key = keyArg.value;

  const value = sourceObj.entries.get(key);
  if (value === undefined) return [];

  return [
    {
      sourceVar: mapVarName,
      keyPath: key,
      value,
      filePath,
      nodeType: "ObjectProperty",
    },
  ];
}

/**
 * Resolve `Array.from(MAP.values())` and return the map values when matched.
 */
function tryMatchArrayFromMapValues(
  node: t.Expression | t.V8IntrinsicIdentifier,
  sourceObjectMap: SourceObjectMap,
  filePath: string,
): TranslatableProperty[] | null {
  if (!t.isCallExpression(node)) return null;
  const callee = node.callee;
  if (!t.isMemberExpression(callee)) return null;
  if (!t.isIdentifier(callee.object) || callee.object.name !== "Array")
    return null;
  if (!t.isIdentifier(callee.property) || callee.property.name !== "from")
    return null;

  if (node.arguments.length === 0) return null;
  const arg = node.arguments[0];
  if (!t.isCallExpression(arg)) return null;
  const argCallee = arg.callee;
  if (!t.isMemberExpression(argCallee)) return null;
  if (!t.isIdentifier(argCallee.object)) return null;
  if (
    !t.isIdentifier(argCallee.property) ||
    argCallee.property.name !== "values"
  )
    return null;

  const mapVarName = argCallee.object.name;
  const sourceObj = sourceObjectMap.get(mapVarName);
  if (!sourceObj || sourceObj.kind !== "map") return null;

  const results: TranslatableProperty[] = [];
  for (const [key, value] of sourceObj.entries) {
    results.push({
      sourceVar: mapVarName,
      keyPath: key,
      value,
      filePath,
      nodeType: "ObjectProperty",
    });
  }
  return results;
}

function matchPatternAB(
  expr: t.CallExpression,
  callee: t.MemberExpression,
  sourceObjectMap: SourceObjectMap,
  textComponents: string[],
  filePath: string,
): TranslatableProperty[] {
  if (!t.isIdentifier(callee.object)) return [];
  const arrVarName = callee.object.name;
  const sourceObj = sourceObjectMap.get(arrVarName);
  if (!sourceObj) return [];
  if (sourceObj.kind !== "objectArray" && sourceObj.kind !== "stringArray")
    return [];

  if (expr.arguments.length === 0) return [];
  const cb = expr.arguments[0];
  if (!t.isArrowFunctionExpression(cb) && !t.isFunctionExpression(cb))
    return [];

  if (cb.params.length === 0) return [];
  const param = cb.params[0];
  if (!t.isIdentifier(param)) return [];
  const paramName = param.name;

  const results: TranslatableProperty[] = [];

  for (const innerExpr of collectTextExpressions(cb.body, textComponents)) {

    if (sourceObj.kind === "objectArray") {
      if (
        t.isMemberExpression(innerExpr) &&
        t.isIdentifier(innerExpr.object) &&
        innerExpr.object.name === paramName &&
        !innerExpr.computed &&
        t.isIdentifier(innerExpr.property)
      ) {
        const propName = innerExpr.property.name;
        for (const value of getObjectArrayPropertyValues(sourceObj, propName)) {
          results.push({
            sourceVar: arrVarName,
            keyPath: propName,
            value,
            filePath,
            nodeType: "ObjectProperty",
          });
        }
      }
    } else {
      if (t.isIdentifier(innerExpr) && innerExpr.name === paramName) {
        for (const value of getStringArrayValues(sourceObj)) {
          results.push({
            sourceVar: arrVarName,
            keyPath: "",
            value,
            filePath,
            nodeType: "ArrayElement",
          });
        }
      }
    }
  }

  return results;
}

/** Walk a Babel subtree recursively. */
function walkNode(node: any, visitor: (node: any) => void): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walkNode(child, visitor);
    return;
  }
  if (typeof node.type !== "string") return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "loc" || key === "start" || key === "end")
      continue;
    walkNode((node as any)[key], visitor);
  }
}

function collectTextExpressions(
  node: any,
  textComponents: string[],
): t.Expression[] {
  const expressions: t.Expression[] = [];

  walkNode(node, (current) => {
    if (!t.isJSXElement(current)) return;
    const nameNode = current.openingElement.name;
    if (!t.isJSXIdentifier(nameNode)) return;
    if (!textComponents.includes(nameNode.name)) return;

    for (const child of current.children) {
      if (!t.isJSXExpressionContainer(child)) continue;
      if (t.isJSXEmptyExpression(child.expression)) continue;
      expressions.push(child.expression);
    }
  });

  return expressions;
}

function getObjectArrayPropertyValues(
  sourceObj: SourceObject,
  propName: string,
): string[] {
  if (sourceObj.kind !== "objectArray") return [];
  const init = sourceObj.node.init;
  if (!t.isArrayExpression(init)) return [];

  const values: string[] = [];
  for (const element of init.elements) {
    if (!t.isObjectExpression(element)) continue;
    for (const prop of element.properties) {
      if (!t.isObjectProperty(prop)) continue;
      const key = propKey(prop);
      if (key !== propName) continue;
      if (!t.isStringLiteral(prop.value)) continue;
      if (!isTranslatableString(prop.value.value)) continue;
      values.push(prop.value.value);
    }
  }

  return values;
}

function getObjectArrayValueAtIndex(
  sourceObj: SourceObject,
  index: number,
  propName: string,
): string | undefined {
  if (sourceObj.kind !== "objectArray") return undefined;
  const init = sourceObj.node.init;
  if (!t.isArrayExpression(init)) return undefined;

  const element = init.elements[index];
  if (!t.isObjectExpression(element)) return undefined;

  for (const prop of element.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = propKey(prop);
    if (key !== propName) continue;
    if (!t.isStringLiteral(prop.value)) return undefined;
    if (!isTranslatableString(prop.value.value)) return undefined;
    return prop.value.value;
  }

  return undefined;
}

function getStringArrayValues(sourceObj: SourceObject): string[] {
  if (sourceObj.kind !== "stringArray") return [];
  const init = sourceObj.node.init;
  if (!t.isArrayExpression(init)) return [];

  const values: string[] = [];
  for (const element of init.elements) {
    if (!t.isStringLiteral(element)) continue;
    if (!isTranslatableString(element.value)) continue;
    values.push(element.value);
  }

  return values;
}

function matchMemberExpression(
  expr: t.MemberExpression,
  sourceObjectMap: SourceObjectMap,
  indirectionMap: IndirectionMap,
  filePath: string,
): TranslatableProperty[] {
  if (t.isIdentifier(expr.object)) {
    const indirEntry = indirectionMap.get(expr.object.name);
    if (indirEntry) {
      return matchPatternG(expr, indirEntry, sourceObjectMap, filePath);
    }
  }

  if (
    t.isMemberExpression(expr.object) &&
    expr.object.computed &&
    t.isNumericLiteral(expr.object.property) &&
    t.isIdentifier(expr.object.object)
  ) {
    return matchPatternE(expr, sourceObjectMap, filePath);
  }

  if (
    t.isMemberExpression(expr.object) &&
    !expr.object.computed &&
    t.isIdentifier(expr.object.object)
  ) {
    return matchPatternD(expr, sourceObjectMap, filePath);
  }

  if (t.isIdentifier(expr.object)) {
    return matchPatternC(expr, sourceObjectMap, filePath);
  }

  return [];
}

function matchPatternC(
  expr: t.MemberExpression,
  sourceObjectMap: SourceObjectMap,
  filePath: string,
): TranslatableProperty[] {
  if (!t.isIdentifier(expr.object)) return [];
  const objName = expr.object.name;
  const sourceObj = sourceObjectMap.get(objName);
  if (!sourceObj) return [];
  if (sourceObj.kind !== "object" && sourceObj.kind !== "objectArray")
    return [];

  if (expr.computed || !t.isIdentifier(expr.property)) return [];
  const propName = expr.property.name;

  const value = sourceObj.entries.get(propName);
  if (value === undefined) return [];

  return [
    {
      sourceVar: objName,
      keyPath: propName,
      value,
      filePath,
      nodeType: "ObjectProperty",
    },
  ];
}

function matchPatternD(
  expr: t.MemberExpression,
  sourceObjectMap: SourceObjectMap,
  filePath: string,
): TranslatableProperty[] {
  if (!t.isMemberExpression(expr.object)) return [];
  if (!t.isIdentifier(expr.object.object)) return [];
  if (expr.object.computed) return [];
  if (!t.isIdentifier(expr.object.property)) return [];
  if (expr.computed || !t.isIdentifier(expr.property)) return [];

  const objName = expr.object.object.name;
  const nestedKey = expr.object.property.name;
  const propName = expr.property.name;
  const dottedKey = `${nestedKey}.${propName}`;

  const sourceObj = sourceObjectMap.get(objName);
  if (!sourceObj) return [];
  if (sourceObj.kind !== "object") return [];

  const value = sourceObj.entries.get(dottedKey);
  if (value === undefined) return [];

  return [
    {
      sourceVar: objName,
      keyPath: dottedKey,
      value,
      filePath,
      nodeType: "ObjectProperty",
    },
  ];
}

function matchPatternE(
  expr: t.MemberExpression,
  sourceObjectMap: SourceObjectMap,
  filePath: string,
): TranslatableProperty[] {
  if (!t.isMemberExpression(expr.object)) return [];
  if (!expr.object.computed) return [];
  if (!t.isNumericLiteral(expr.object.property)) return [];
  if (!t.isIdentifier(expr.object.object)) return [];
  if (expr.computed || !t.isIdentifier(expr.property)) return [];

  const arrName = expr.object.object.name;
  const index = expr.object.property.value;
  const propName = expr.property.name;

  const sourceObj = sourceObjectMap.get(arrName);
  if (!sourceObj || sourceObj.kind !== "objectArray") return [];

  const value = getObjectArrayValueAtIndex(sourceObj, index, propName);
  if (value === undefined) return [];

  return [
    {
      sourceVar: arrName,
      keyPath: propName,
      value,
      filePath,
      nodeType: "ObjectProperty",
    },
  ];
}

function matchPatternG(
  expr: t.MemberExpression,
  indirEntry: { sourceVar: string; keyPath: string },
  sourceObjectMap: SourceObjectMap,
  filePath: string,
): TranslatableProperty[] {
  if (!t.isIdentifier(expr.object)) return [];
  const varName = expr.object.name;

  const sourceObj = sourceObjectMap.get(indirEntry.sourceVar);
  if (!sourceObj) {
    const line = expr.loc?.start.line ?? 0;
    console.warn(
      `[deepAnalyzer] ${filePath}: cannot resolve indirection for '${varName}' at line ${line}`,
    );
    return [];
  }

  if (expr.computed || !t.isIdentifier(expr.property)) return [];
  const propName = expr.property.name;

  const kp = indirEntry.keyPath;

  if (/^\[\d+\]$/.test(kp)) {
    if (sourceObj.kind !== "objectArray") return [];
    const index = Number(kp.slice(1, -1));
    const value = getObjectArrayValueAtIndex(sourceObj, index, propName);
    if (value === undefined) return [];
    return [
      {
        sourceVar: indirEntry.sourceVar,
        keyPath: propName,
        value,
        filePath,
        nodeType: "ObjectProperty",
      },
    ];
  }

  if (sourceObj.kind !== "object") return [];
  const dottedKey = `${kp}.${propName}`;
  const value = sourceObj.entries.get(dottedKey);
  if (value !== undefined) {
    return [
      {
        sourceVar: indirEntry.sourceVar,
        keyPath: dottedKey,
        value,
        filePath,
        nodeType: "ObjectProperty",
      },
    ];
  }

  const flatValue = sourceObj.entries.get(propName);
  if (flatValue !== undefined) {
    return [
      {
        sourceVar: indirEntry.sourceVar,
        keyPath: propName,
        value: flatValue,
        filePath,
        nodeType: "ObjectProperty",
      },
    ];
  }

  const line = expr.loc?.start.line ?? 0;
  console.warn(
    `[deepAnalyzer] ${filePath}: cannot resolve indirection for '${varName}' at line ${line}`,
  );
  return [];
}

function buildExtractedStrings(
  props: TranslatableProperty[],
): ExtractedString[] {
  return props.map((p) => ({
    key: "",
    value: p.value,
    filePath: p.filePath,
    nodeType: p.nodeType,
  }));
}

export function deepAnalyzeFiles(
  files: ScannedFile[],
  options: DeepAnalyzerOptions,
): DeepAnalyzerResult {
  const { textComponents } = options;
  const allExtracted: ExtractedString[] = [];
  const skippedFiles: Array<{ filePath: string; reason: string }> = [];
  let sourceObjectsAnalyzed = 0;

  for (const file of files) {
    try {
      const ast = babelParser.parse(file.source, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      });

      const sourceObjectMap = collectSourceObjects(ast, file.filePath);
      sourceObjectsAnalyzed += sourceObjectMap.size;

      // Warn and skip exported module-scope objects
      for (const [, srcObj] of sourceObjectMap) {
        if (srcObj.scope === "module" && srcObj.isExported) {
          console.warn(
            `[deepAnalyzer] ${file.filePath}: skipping exported module-scope variable '${srcObj.varName}' — manual review required`,
          );
          skippedFiles.push({
            filePath: file.filePath,
            reason: `Exported module-scope variable '${srcObj.varName}' requires manual review`,
          });
        }
      }

      const indirectionMap = collectIndirections(ast, sourceObjectMap);
      const translatableProps = detectRenderSites(
        ast,
        sourceObjectMap,
        indirectionMap,
        textComponents,
        file.filePath,
      );

      const extracted = buildExtractedStrings(translatableProps);
      allExtracted.push(...extracted);
    } catch (err: any) {
      console.warn(
        `[deepAnalyzer] Could not parse: ${file.filePath} — ${err.message}`,
      );
      skippedFiles.push({
        filePath: file.filePath,
        reason: `Parse error: ${err.message}`,
      });
    }
  }

  return {
    extracted: allExtracted,
    skippedFiles,
    stats: {
      sourceObjectsAnalyzed,
      translatablePropertiesFound: allExtracted.length,
      filesSkipped: skippedFiles.length,
    },
  };
}
