import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";

// Scenario: a screen that already uses t(); only the one new literal should
// be converted and useTranslation must not be added a second time.
export default function AlreadyTranslated() {
  const { t } = useTranslation();
  return (
    <View>
      <Text>{t("existing_title")}</Text>
      <Text>Newly added subtitle</Text>
    </View>
  );
}
