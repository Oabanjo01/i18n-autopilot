import React from "react";
import { Text } from "react-native";

// Scenario: class components are not supported (hooks can't be used in them).
// The tool must leave this file compiling — ideally untouched.
export default class LegacyBanner extends React.Component {
  render() {
    return <Text>Legacy banner text</Text>;
  }
}
