import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import type { PagePalette } from "@/components/ui/pagePalette";

/**
 * What Oturumlar shows without rows, inside the list so it sits below the
 * large title and the search field: no trips yet, or none for the search.
 */
export const SessionsEmptyState = memo(function SessionsEmptyState({
  palette,
  query,
}: {
  palette: PagePalette;
  /** The search that found nothing; empty when there are no trips at all. */
  query: string;
}) {
  const search = query.trim();
  const noMatches = search.length > 0;

  return (
    <View style={styles.container} accessible>
      <IconSymbol
        name={noMatches ? "magnifyingglass" : "clock.arrow.circlepath"}
        size={44}
        color={palette.tertiaryLabel}
      />
      <Text style={[styles.title, { color: palette.label }]}>
        {noMatches ? `“${search}” için sonuç yok` : "Henüz oturum yok"}
      </Text>
      <Text style={[styles.body, { color: palette.secondaryLabel }]}>
        {noMatches
          ? "Yazımı kontrol edin ya da başka bir arama deneyin."
          : "AKBA ile planladığınız rotalar burada listelenir."}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignSelf: "center",
    alignItems: "center",
    maxWidth: 300,
    paddingTop: 80,
    paddingHorizontal: 16,
  },
  title: {
    marginTop: 14,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "600",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  body: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400",
    letterSpacing: -0.2,
    textAlign: "center",
  },
});
