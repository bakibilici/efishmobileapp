import { Stack } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet } from "react-native";

import { usePushedPageOptions } from "@/components/navigation/stackOptions";
import { GroupFooter, ListGroup, Row } from "@/components/ui/GroupedList";
import { usePagePalette } from "@/components/ui/pagePalette";
import { useTheme } from "@/context/ThemeContext";

const OPTIONS = [
  { value: "system", title: "Sistem" },
  { value: "light", title: "Açık" },
  { value: "dark", title: "Koyu" },
] as const;

/** Görünüm: a checkmark list; a choice applies at once and the page stays open. */
export default function AppearanceScreen() {
  const palette = usePagePalette();
  const options = usePushedPageOptions("Görünüm");
  const { themePreference, setThemePreference } = useTheme();

  return (
    <>
      <Stack.Screen options={options} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={styles.content}
      >
        <ListGroup palette={palette} separatorInset={16} style={styles.group}>
          {OPTIONS.map((option) => {
            const selected = themePreference === option.value;
            return (
              <Row
                key={option.value}
                palette={palette}
                title={option.title}
                accessory={selected ? "check" : "none"}
                accessibilityState={{ selected }}
                onPress={() => setThemePreference(option.value)}
              />
            );
          })}
        </ListGroup>
        <GroupFooter
          palette={palette}
          text="Sistem seçiliyse AKBA, telefonunuzun açık ya da koyu görünüm ayarını izler."
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
  group: {
    marginTop: 16,
  },
});
