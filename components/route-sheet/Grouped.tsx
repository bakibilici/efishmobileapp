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
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";

import { SHEET_BACK_INSET, SHEET_CLOSE_INSET, useSheetMotion } from "./sheetMotion";
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

/** A grouped cell of its own holding one red action, as iOS lists end with "Delete …". */
export const DestructiveRow = memo(function DestructiveRow({
  label,
  accessibilityHint,
  onPress,
  palette,
}: {
  label: string;
  accessibilityHint?: string;
  onPress: () => void;
  palette: SheetPalette;
}) {
  return (
    <View style={[styles.group, styles.destructiveGroup, { backgroundColor: palette.cell }]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        style={({ pressed }) => [
          styles.destructiveRow,
          pressed && { backgroundColor: palette.cellPressed },
        ]}
      >
        <Text style={[styles.destructiveText, { color: palette.red }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
});

/** A detail page's header tile, a little larger than a row's. */
const TITLE_TILE_SIZE = 36;

/**
 * Large title (at most two lines, cut with "…", never shrunk) above the
 * groups, then an optional address line and one secondary line; `tile`
 * puts a category tile before it (a detail page's header).
 *
 * The sheet's own back button stands at the left of this block when it
 * shows. When the panel has a way back the block keeps the button's room
 * free at its right at every stop and slides right into it with the sheet's
 * position (sheetMotion): a translation only, so the title never wraps again
 * mid-drag. A sheet with a Close button at its top-trailing corner keeps
 * that room free too.
 */
export const TitleBlock = memo(function TitleBlock({
  title,
  address,
  subtitle,
  tile,
  palette,
}: {
  title: string;
  /** The full address when the title is only part of it. */
  address?: string | null;
  subtitle?: string | null;
  tile?: { glyph: IoniconName; color: string } | null;
  palette: SheetPalette;
}) {
  const motion = useSheetMotion();
  const noShift = useSharedValue(0);
  const shift = motion?.titleShift ?? noShift;
  // Only a translation follows the sheet: the width stays, so the title
  // keeps its lines while it slides into the room kept free for it.
  const shiftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }] }));

  const copy = (
    <View style={[styles.titleCopy, tile && styles.titleCopyBesideTile]}>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: palette.label }]}
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {title}
      </Text>
      {address ? (
        <Text
          style={[styles.subtitle, { color: palette.secondaryLabel }]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {address}
        </Text>
      ) : null}
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

  return (
    <Animated.View
      style={[
        styles.titleBlock,
        {
          paddingRight:
            (motion?.hasBack ? SHEET_BACK_INSET : 0) + (motion?.hasClose ? SHEET_CLOSE_INSET : 0),
        },
        shiftStyle,
      ]}
    >
      {tile ? (
        <View style={styles.titleRow}>
          <IconTile glyph={tile.glyph} color={tile.color} size={TITLE_TILE_SIZE} />
          {copy}
        </View>
      ) : (
        copy
      )}
    </Animated.View>
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
  destructiveGroup: {
    marginTop: 28,
  },
  destructiveRow: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  destructiveText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "400",
    letterSpacing: -0.4,
  },
  titleBlock: {
    marginHorizontal: SIDE_MARGIN,
    marginTop: 2,
    marginBottom: 14,
  },
  titleCopy: {
    gap: 3,
  },
  titleCopyBesideTile: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
