import React from "react";
import { View, Text } from "react-native";

// Scenario: the everyday ways text appears inside <Text>
export default function BasicText() {
  return (
    <View>
      <Text>Welcome to the demo</Text>
      <Text>{"Tap a card to learn more"}</Text>
      <Text>{`Swipe left to dismiss`}</Text>
      <Text>
        This sentence is split
        across two lines
      </Text>
      <Text>
        Terms apply. <Text>Read the full policy</Text>
      </Text>
    </View>
  );
}
