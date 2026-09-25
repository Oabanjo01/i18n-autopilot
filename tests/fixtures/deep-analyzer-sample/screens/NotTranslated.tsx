import React from "react";
import { View, Text, TextInput, Image } from "react-native";

// Scenario: values that must be left exactly as they are
export default function NotTranslated({ name, count }: { name: string; count: number }) {
  return (
    <View testID="not-translated-screen" accessibilityLabel="Screen container">
      <Text>42</Text>
      <Text>—</Text>
      <Text>x</Text>
      <Text>{`Hello, ${name}`}</Text>
      <Text>{count}</Text>
      <TextInput placeholder="Search products" />
      <Image source={{ uri: "https://example.com/logo.png" }} />
    </View>
  );
}
