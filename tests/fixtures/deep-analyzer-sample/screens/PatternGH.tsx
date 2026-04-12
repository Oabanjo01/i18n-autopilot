import React, { useState } from "react";
import { View, Text } from "react-native";

// Pattern G — one-level variable indirection
const ITEMS = [
  { label: "First item", route: "/first" },
  { label: "Second item", route: "/second" },
];

// Pattern H — conditional render from object
const MESSAGES = {
  success: "Operation completed successfully",
  error: "Something went wrong, please try again",
};

export default function PatternGH() {
  const [isSuccess, setIsSuccess] = useState(true);

  // Pattern G: variable assigned from array element, then property accessed
  const firstItem = ITEMS[0];

  return (
    <View>
      <Text>{firstItem.label}</Text>
      <Text>{isSuccess ? MESSAGES.success : MESSAGES.error}</Text>
    </View>
  );
}
