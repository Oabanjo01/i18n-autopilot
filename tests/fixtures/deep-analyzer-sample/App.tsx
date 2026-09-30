import React from "react";
import { View } from "react-native";
import AlreadyTranslated from "./screens/AlreadyTranslated";
import BasicText from "./screens/BasicText";
import LegacyBanner from "./screens/ClassComponent";
import Greeting, { EmptyState, ErrorBanner } from "./screens/ComponentShapes";
import CustomText from "./screens/CustomText";
import KeyCollisions from "./screens/KeyCollisions";
import NotTranslated from "./screens/NotTranslated";
import PatternAB from "./screens/PatternAB";
import PatternCD from "./screens/PatternCD";
import PatternEF from "./screens/PatternEF";
import PatternGH from "./screens/PatternGH";

export default function App() {
  return (
    <View>
      <BasicText />
      <CustomText />
      <KeyCollisions />
      <Greeting name="Ada" />
      <EmptyState />
      <ErrorBanner />
      <AlreadyTranslated />
      <LegacyBanner />
      <NotTranslated name="Ada" count={3} />
      <PatternAB />
      <PatternCD />
      <PatternEF />
      <PatternGH />
    </View>
  );
}
