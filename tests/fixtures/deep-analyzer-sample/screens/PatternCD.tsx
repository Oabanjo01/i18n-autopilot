import React from "react";
import { View, Text } from "react-native";

// Pattern C — plain object with direct property access
const CONFIG = {
  title: "Welcome",
  subtitle: "Get started with your app",
};

// Pattern D — nested object, one level deep
const SCREEN = {
  header: {
    title: "Profile",
    subtitle: "Your account details",
  },
};

export default function PatternCD() {
  return (
    <View>
      <Text>{CONFIG.title}</Text>
      <Text>{CONFIG.subtitle}</Text>
      <Text>{SCREEN.header.title}</Text>
      <Text>{SCREEN.header.subtitle}</Text>
    </View>
  );
}
