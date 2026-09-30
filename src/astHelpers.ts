/**
 * src/astHelpers.ts — AST helpers shared by the parser and the rewriter, so
 * both agree on which strings are extracted and where `t` can come from.
 */

import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

function isComponentOrHookName(name: string): boolean {
  return /^[A-Z]/.test(name) || /^use[A-Z0-9]/.test(name);
}

function functionName(fnPath: NodePath<t.Function>): string | null {
  const node = fnPath.node;
  if (t.isFunctionDeclaration(node) && node.id) return node.id.name;

  // Unwrap memo(...), forwardRef(...), React.memo(...) and similar wrappers.
  let parent = fnPath.parentPath;
  while (parent?.isCallExpression()) parent = parent.parentPath;

  if (parent?.isVariableDeclarator() && t.isIdentifier(parent.node.id)) {
    return parent.node.id.name;
  }
  if (parent?.isExportDefaultDeclaration()) return "Default";
  return null;
}

/**
 * Returns the function component or hook that `path` renders inside — the
 * place where `useTranslation()` can legally be called. Returns null for code
 * inside class components, plain helpers, callbacks outside any component, or
 * module scope.
 */
export function findComponentFunction(
  path: NodePath,
): NodePath<t.Function> | null {
  let current: NodePath | null = path.parentPath;

  while (current) {
    if (current.isClass() || current.isClassMethod()) return null;

    if (current.isFunction()) {
      const name = functionName(current);
      if (name && isComponentOrHookName(name)) return current;
    }

    current = current.parentPath;
  }

  return null;
}

/** Converts an expression-bodied arrow function to a block body so a hook can be injected. */
export function ensureBlockBody(fn: t.Function): t.BlockStatement {
  if (!t.isBlockStatement(fn.body)) {
    fn.body = t.blockStatement([t.returnStatement(fn.body)]);
  }
  return fn.body;
}

export interface JSXTextParts {
  /** The text as React renders it, with surrounding whitespace removed. */
  value: string;
  /** React renders a space before the text. */
  leadingSpace: boolean;
  /** React renders a space after the text. */
  trailingSpace: boolean;
}

/**
 * Reads a JSXText child the way React renders it: line breaks and indentation
 * collapse to single spaces, and whitespace next to sibling elements on the
 * same line is kept.
 */
export function readJSXText(child: t.JSXText): JSXTextParts | null {
  const [rendered] = t.react.buildChildren(
    t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), [child]),
  );
  if (!rendered || !t.isStringLiteral(rendered)) return null;

  const value = rendered.value.trim();
  if (!value) return null;

  return {
    value,
    leadingSpace: /^\s/.test(rendered.value),
    trailingSpace: /\s$/.test(rendered.value),
  };
}
