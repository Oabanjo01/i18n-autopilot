import React from "react";
import { View } from "react-native";
import PatternAB from "./screens/PatternAB";
import PatternCD from "./screens/PatternCD";
import PatternEF from "./screens/PatternEF";
import PatternGH from "./screens/PatternGH";

export default function App() {
  return (
    <View>
      <PatternAB />
      <PatternCD />
      <PatternEF />
      <PatternGH />
    </View>
  );
}
