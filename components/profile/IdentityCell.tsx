import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { TABULAR } from "@/components/ui/GroupedList";
import { IconSymbol } from "@/components/ui/icon-symbol";
import type { PagePalette } from "@/components/ui/pagePalette";

import { initialsOf } from "./profileFormat";

const MONOGRAM_SIZE = 60;

/**
 * The first cell of Hesabım, as the Apple Account cell heads Settings: a
 * monogram, the name as stored and the masked phone number. It opens
 * Kişisel bilgiler.
 */
export const IdentityCell = memo(function IdentityCell({
  palette,
  firstName,
  lastName,
  maskedPhone,
  onPress,
}: {
  palette: PagePalette;
  firstName: string;
  lastName: string;
  maskedPhone: string;
  onPress: () => void;
}) {
  const fullName = `${firstName} ${lastName}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Kişisel bilgiler, ${fullName}`}
      accessibilityHint="Adınızı ve telefon numaranızı düzenler"
      style={({ pressed }) => [styles.cell, pressed && { backgroundColor: palette.cellPressed }]}
    >
      <View style={[styles.monogram, { backgroundColor: palette.accent }]}>
        <Text style={styles.initials} numberOfLines={1}>
          {initialsOf(firstName, lastName)}
        </Text>
      </View>
      <View style={styles.copy}>
        <Text style={[styles.name, { color: palette.label }]} numberOfLines={1}>
          {fullName}
        </Text>
        <Text style={[styles.phone, TABULAR, { color: palette.secondaryLabel }]} numberOfLines={1}>
          {maskedPhone}
        </Text>
      </View>
      <IconSymbol
        name="chevron.right"
        size={13}
        weight="semibold"
        color={palette.tertiaryLabel}
        style={styles.chevron}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  cell: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  monogram: {
    width: MONOGRAM_SIZE,
    height: MONOGRAM_SIZE,
    borderRadius: MONOGRAM_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  copy: {
    flex: 1,
    marginLeft: 14,
    gap: 2,
  },
  name: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  phone: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400",
    letterSpacing: -0.2,
  },
  chevron: {
    marginLeft: 8,
  },
});
