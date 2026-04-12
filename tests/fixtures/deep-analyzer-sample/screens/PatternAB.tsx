import React from "react";
import { View, Text } from "react-native";

// Pattern A — array of objects rendered via .map()
const MENU_ITEMS = [
  { label: "Home", route: "/" },
  { label: "Profile", route: "/profile" },
  { label: "Settings", route: "/settings" },
];

// Pattern B — plain string array rendered via .map()
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
}
