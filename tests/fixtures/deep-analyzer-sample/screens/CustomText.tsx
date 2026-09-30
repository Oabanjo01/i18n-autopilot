import React from "react";
import { View } from "react-native";
import { AppText, Label, ThemedText } from "../components/Typography";

// Scenario: custom Text wrappers. ThemedText and AppText are entered at the
// "Custom Text component names" prompt; Label is not, so it stays untouched.
export default function CustomText() {
  return (
    <View>
      <ThemedText>Your profile is complete</ThemedText>
      <AppText>Notifications are turned on</AppText>
      <Label>Unlisted wrapper text</Label>
    </View>
  );
}
