/**
 * src/parser.ts - The detective.
 * Takes each file the scanner found, reads the code as an AST tree, and finds every hardcoded string sitting inside a <Text> component.
 */

import * as babelParser from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { ScannedFile } from "./scanner";

export interface ExtractedString {
  key: string;
  value: string;
  filePath: string;
  nodeType: "JSXText" | "StringLiteral" | "useState";
}

function parseSource(source: string) {
  return babelParser.parse(source, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });
}

function isTranslatableString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length < 2) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (/^[^a-zA-Z]+$/.test(trimmed)) return false;
  return true;
}

function extractAllTextFromJSXElement(
  element: t.JSXElement,
  results: ExtractedString[],
  filePath: string
): void {
  for (const child of element.children) {
    // <Text>Hello world</Text>
    if (t.isJSXText(child)) {
      const value = child.value.trim();
      if (isTranslatableString(value)) {
        results.push({ key: "", value, filePath, nodeType: "JSXText" });
      }
    }

    // <Text>{'Hello world'}</Text>
    if (
      t.isJSXExpressionContainer(child) &&
      t.isStringLiteral(child.expression)
    ) {
      const value = child.expression.value.trim();
      if (isTranslatableString(value)) {
        results.push({
          key: "",
          value,
          filePath,
          nodeType: "StringLiteral",
        });
      }
    }

    // <Text>{`Hello world`}</Text>
    if (
      t.isJSXExpressionContainer(child) &&
      t.isTemplateLiteral(child.expression) &&
      child.expression.expressions.length === 0
    ) {
      const value = child.expression.quasis[0].value.cooked?.trim() ?? "";
      if (isTranslatableString(value)) {
        results.push({
          key: "",
          value,
          filePath,
          nodeType: "StringLiteral",
        });
      }
    }

    // Recursively handle nested JSX elements
    if (t.isJSXElement(child)) {
      extractAllTextFromJSXElement(child, results, filePath);
    }

    // Handle JSX fragments
    if (t.isJSXFragment(child)) {
      for (const fragmentChild of child.children) {
        if (t.isJSXText(fragmentChild)) {
          const value = fragmentChild.value.trim();
          if (isTranslatableString(value)) {
            results.push({ key: "", value, filePath, nodeType: "JSXText" });
          }
        }
        if (t.isJSXElement(fragmentChild)) {
          extractAllTextFromJSXElement(fragmentChild, results, filePath);
        }
      }
    }
  }
}

function extractFromComponent(
  source: string,
  filePath: string,
  textComponents: string[],
): ExtractedString[] {
  const results: ExtractedString[] = [];
  const ast = parseSource(source);

  traverse(ast, {
    JSXElement(path) {
      const openingEl = path.node.openingElement;

      const isTextComponent =
        t.isJSXIdentifier(openingEl.name) &&
        textComponents.includes(openingEl.name.name);

      if (!isTextComponent) return;

      // Extract all text recursively
      extractAllTextFromJSXElement(path.node, results, filePath);
    },
  });

  return results;
}

function extractFromHook(source: string, filePath: string): ExtractedString[] {
  const results: ExtractedString[] = [];
  const ast = parseSource(source);

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      const isUseState = t.isIdentifier(callee) && callee.name === "useState";
      if (!isUseState) return;

      const arg = path.node.arguments[0];
      if (!arg || !t.isStringLiteral(arg)) return;

      const value = arg.value.trim();
      if (isTranslatableString(value)) {
        results.push({ key: "", value, filePath, nodeType: "useState" });
      }
    },
  });

  return results;
}

export function parseFiles(
  files: ScannedFile[],
  textComponents: string[] = ["Text"],
): ExtractedString[] {
  const results: ExtractedString[] = [];

  for (const file of files) {
    try {
      const extracted =
        file.fileType === "hook"
          ? extractFromHook(file.source, file.filePath)
          : extractFromComponent(file.source, file.filePath, textComponents);

      results.push(...extracted);
    } catch (err) {
      console.warn(`  ⚠️  Could not parse: ${file.filePath}`);
    }
  }

  return results;
}