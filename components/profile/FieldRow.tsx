import React, { type Ref } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import type { PagePalette } from "@/components/ui/pagePalette";

const LABEL_WIDTH = 96;

/**
 * An editable grouped cell, as in Contacts: the field's name at a fixed
 * width, then the text field filling the rest. The whole cell is the field's
 * touch area, and VoiceOver reads the field by its name.
 *
 * Spell-check is off unless a caller turns it on: these fields hold names and
 * numbers, and iOS selects a word it flags (a lowercase "furkan"), so the
 * next key would replace it.
 */
export function FieldRow({
  palette,
  label,
  ref,
  ...inputProps
}: {
  palette: PagePalette;
  label: string;
  /** The text field, to move focus to it from the field before. */
  ref?: Ref<TextInput>;
} & Omit<TextInputProps, "style" | "placeholderTextColor" | "accessibilityLabel">) {
  return (
    <View style={styles.row}>
      <Text
        style={[styles.label, { color: palette.label }]}
        numberOfLines={1}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {label}
      </Text>
      <TextInput
        spellCheck={false}
        {...inputProps}
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={palette.tertiaryLabel}
        selectionColor={palette.accent}
        style={[styles.input, { color: palette.label }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
  },
  label: {
    width: LABEL_WIDTH,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "400",
    letterSpacing: -0.4,
  },
  // The field is as tall as the cell, so a tap anywhere right of the label focuses it.
  input: {
    flex: 1,
    alignSelf: "stretch",
    minHeight: 44,
    paddingRight: 16,
    paddingVertical: 11,
    fontSize: 17,
    letterSpacing: -0.4,
  },
});
