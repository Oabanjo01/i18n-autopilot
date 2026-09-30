import React from "react";
import { View, Text } from "react-native";

// Scenario: strings whose generated keys collide. Keys come from the first
// three meaningful words, so both "Get started…" strings map to
// get_started_your; the second must get its own suffixed key.
export default function KeyCollisions() {
  return (
    <View>
      <Text>Get started with your app</Text>
      <Text>Get started with your account</Text>
      <Text>Save</Text>
      <Text>Save</Text>
    </View>
  );
}
