import React from "react";
import { View, Text } from "react-native";

// Pattern E — array of objects with index access
const STEPS = [
  { text: "Step one: Install dependencies" },
  { text: "Step two: Configure your project" },
  { text: "Step three: Run the app" },
];

// Pattern F — JS Map with string entries
const LABELS = new Map([
  ["home", "Home"],
  ["back", "Go Back"],
  ["next", "Continue"],
]);

export default function PatternEF() {
  return (
    <View>
      <Text>{STEPS[0].text}</Text>
      <Text>{STEPS[1].text}</Text>
      <Text>{LABELS.get("home")}</Text>
      <Text>{LABELS.get("back")}</Text>
      {Array.from(LABELS.values()).map((label) => (
        <Text key={label}>{label}</Text>
      ))}
    </View>
  );
}
