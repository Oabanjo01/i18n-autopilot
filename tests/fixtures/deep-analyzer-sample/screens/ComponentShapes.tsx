import React from "react";
import { View, Text } from "react-native";

// Scenario: different function-component shapes, several per file

// Arrow function with an implicit return
export const EmptyState = () => <Text>Nothing here yet</Text>;

// Arrow function with a block body
export const ErrorBanner = () => {
  return <Text>Could not load your data</Text>;
};

// Function declaration using props alongside static text
export default function Greeting({ name }: { name: string }) {
  return (
    <View>
      <Text>Good morning</Text>
      <Text>{name}</Text>
    </View>
  );
}
