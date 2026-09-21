import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import type { SheetPalette } from "./sheetPalette";

type IoniconName = keyof typeof Ionicons.glyphMap;

export const SIDE_MARGIN = 16;
export const GROUP_RADIUS = 14;
/** Cell content inset: 16 padding, a 30 pt tile, 12 gap. Separators start here. */
export const TEXT_INSET = 58;

export const TABULAR = { fontVariant: ["tabular-nums" as const] };

/** One inset grouped container. */
export const Group = memo(function Group({
  palette,
  children,
  style,
}: {
  palette: SheetPalette;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.group, { backgroundColor: palette.cell }, style]}>
      {children}
    </View>
  );
});

/**
 * A grouped-list header. Pass the title already in capitals: textTransform
 * "uppercase" turns the Turkish i into I.
 */
export const SectionHeader = memo(function SectionHeader({
  title,
  palette,
}: {
  title: string;
  palette: SheetPalette;
}) {
  return (
    <Text
      accessibilityRole="header"
      style={[styles.header, { color: palette.secondaryLabel }]}
    >
      {title}
    </Text>
  );
});

export const GroupFooter = memo(function GroupFooter({
  text,
  palette,
}: {
  text: string;
  palette: SheetPalette;
}) {
  return (
    <Text style={[styles.footer, { color: palette.secondaryLabel }]}>{text}</Text>
  );
});

/** Rounded-square tile with a white glyph, as in Settings. */
export const IconTile = memo(function IconTile({
  glyph,
  color,
  size = 30,
}: {
  glyph: IoniconName;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.24),
          backgroundColor: color,
        },
      ]}
    >
      <Ionicons name={glyph} size={Math.round(size * 0.58)} color="#FFFFFF" />
    </View>
  );
});

/** The sheet's back control: "‹ Oturumlar" in the preview bar, "‹ Rota" in the stations panel. */
export const BackPill = memo(function BackPill({
  label,
  accessibilityLabel,
  onPress,
  palette,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  palette: SheetPalette;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.backPill,
        {
          backgroundColor: palette.surface,
          borderColor: palette.hairline,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons name="chevron-back" size={16} color={palette.text} />
      <Text style={[styles.backPillText, { color: palette.text }]}>{label}</Text>
    </Pressable>
  );
});

/** Large title with one secondary line, above the groups. */
export const TitleBlock = memo(function TitleBlock({
  title,
  subtitle,
  palette,
}: {
  title: string;
  subtitle?: string | null;
  palette: SheetPalette;
}) {
  return (
    <View style={styles.titleBlock}>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: palette.label }]}
        numberOfLines={2}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[styles.subtitle, { color: palette.secondaryLabel }]}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  group: {
    marginHorizontal: SIDE_MARGIN,
    borderRadius: GROUP_RADIUS,
    overflow: "hidden",
  },
  header: {
    marginTop: 22,
    marginBottom: 7,
    marginHorizontal: SIDE_MARGIN + 16,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    letterSpacing: 0.2,
  },
  footer: {
    marginTop: 7,
    marginHorizontal: SIDE_MARGIN + 16,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  },
  tile: {
    alignItems: "center",
    justifyContent: "center",
  },
  backPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 2,
    height: 36,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  backPillText: {
    fontSize: 14,
    fontWeight: "600",
  },
  titleBlock: {
    marginHorizontal: SIDE_MARGIN,
    marginTop: 2,
    marginBottom: 14,
    gap: 3,
  },
  title: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400",
    letterSpacing: -0.2,
  },
});
