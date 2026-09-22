import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SymbolTile } from "@/components/ui/GroupedList";
import type { IconSymbolName } from "@/components/ui/icon-symbol";
import type { PagePalette } from "@/components/ui/pagePalette";

/**
 * The centred head of an explanatory page (Verilerimi dışa aktar, Hesabımı
 * sil), as iOS opens a page that must be read before its one action: a large
 * tile, a title and a short paragraph. Content, so no glass.
 */
export const PageHero = memo(function PageHero({
  palette,
  symbol,
  color,
  title,
  body,
}: {
  palette: PagePalette;
  symbol: IconSymbolName;
  color: string;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.hero}>
      <SymbolTile symbol={symbol} color={color} size={56} />
      <Text accessibilityRole="header" style={[styles.title, { color: palette.label }]}>
        {title}
      </Text>
      <Text style={[styles.body, { color: palette.secondaryLabel }]}>{body}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 32,
  },
  title: {
    marginTop: 14,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  body: {
    marginTop: 6,
    maxWidth: 320,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400",
    letterSpacing: -0.2,
    textAlign: "center",
  },
});
