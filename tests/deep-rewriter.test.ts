import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { deepAnalyzeFiles } from "../src/deepAnalyzer";
import { rewriteDeepFiles } from "../src/rewriter";
import { ScannedFile } from "../src/scanner";

function toKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function runDeepRewrite(fileName: string, source: string): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-autopilot-"));
  const filePath = path.join(tempDir, fileName);
  fs.writeFileSync(filePath, source, "utf8");

  const files: ScannedFile[] = [
    {
      filePath,
      source,
      fileType: "component",
    },
  ];

  const analyzed = deepAnalyzeFiles(files, {
    textComponents: ["Text"],
    dryRun: false,
  });

  const extracted = analyzed.extracted.map((entry) => ({
    ...entry,
    key: toKey(entry.value),
  }));

  rewriteDeepFiles({
    projectPath: tempDir,
    extracted,
    textComponents: ["Text"],
    dryRun: false,
  });

  return fs.readFileSync(filePath, "utf8");
}

const patternABSource = `import React from "react";
import { View, Text } from "react-native";

const MENU_ITEMS = [
  { label: "Home", route: "/" },
  { label: "Profile", route: "/profile" },
  { label: "Settings", route: "settings" },
];

const TAGS = ["React Native", "TypeScript", "JavaScript"];

export default function PatternAB() {
  return (
    <View>
      {MENU_ITEMS.map((item) => (
        <Text key={item.route}>{item.label}</Text>
      ))}
      {TAGS.map((tag) => (
        <Text key={tag}>{tag}</Text>
      ))}
    </View>
  );
}`;

const patternABOutput = runDeepRewrite("PatternAB.tsx", patternABSource);

assert.match(patternABOutput, /const MENU_ITEMS = .*=> \[/);
assert.match(patternABOutput, /label: t\("home"\)/);
assert.match(patternABOutput, /label: t\("profile"\)/);
assert.match(patternABOutput, /label: t\("settings"\)/);
assert.match(
  patternABOutput,
  /const TAGS = .*=> \[t\("react_native"\), t\("typescript"\), t\("javascript"\)\]/,
);
assert.match(patternABOutput, /MENU_ITEMS\(t\)\.map/);
assert.match(patternABOutput, /TAGS\(t\)\.map/);
assert.doesNotMatch(patternABOutput, /route: t\(/);

const patternGHSource = `import React, { useState } from "react";
import { View, Text } from "react-native";

const ITEMS = [
  { label: "First item", route: "/first" },
  { label: "Second item", route: "/second" },
];

const MESSAGES = {
  success: "Operation completed successfully",
  error: "Something went wrong",
};

export default function PatternGH() {
  const [isSuccess, setIsSuccess] = useState(true);
  const firstItem = ITEMS[0];

  return (
    <View>
      <Text>{firstItem.label}</Text>
      <Text>{isSuccess ? MESSAGES.success : MESSAGES.error}</Text>
    </View>
  );
}`;

const patternGHOutput = runDeepRewrite("PatternGH.tsx", patternGHSource);

assert.match(patternGHOutput, /const ITEMS = .*=> \[/);
assert.match(patternGHOutput, /label: t\("first_item"\)/);
assert.match(patternGHOutput, /label: "Second item"/);
assert.doesNotMatch(patternGHOutput, /route: t\(/);
assert.match(patternGHOutput, /const firstItem = ITEMS\(t\)\[0\]/);
assert.match(
  patternGHOutput,
  /isSuccess \? MESSAGES\(t\)\.success : MESSAGES\(t\)\.error/,
);

console.log("deep rewriter regression passed");
