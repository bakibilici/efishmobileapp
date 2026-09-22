import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
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
 * The place's photograph at the leading edge of its header. 56 is the height
 * of the title's line plus one line under it, so the photo reads as part of
 * the name rather than as a band of its own; the trailing edge is not an
 * option, since the sheet's Close button lives there at every stop.
 *
 * A photograph and a category tile are the two forms of the same slot, so
 * they share the ratio IconTile rounds its own corners by.
 */
const TITLE_PHOTO_SIZE = 56;
const TITLE_PHOTO_RADIUS = Math.round(TITLE_PHOTO_SIZE * 0.24);

/** What the header shows of a place's photograph. */
export type TitlePhoto = {
  uri: string;
  /** The photographer Google names, when it names one: shown as "Fotoğraf: …". */
  credit?: string | null;
  /** The photo could not be loaded (an expired signature, no network): drop it. */
  onError?: () => void;
};

/**
 * Large title (at most two lines, cut with "…", never shrunk) above the
 * groups, then an optional address line and one secondary line; `tile`
 * puts a category tile before it (a detail page's header) and `photo` the
 * place's own photograph, with its credit as the copy's last line.
 *
 * Without a photo nothing about this block changes: the tile and bare
 * branches, and every style they use, are what they have always been, so a
 * plan that carries no photograph reserves no room for one.
 *
 * The sheet's own back button stands at the left of this block when it
 * shows. When the panel has a way back the block keeps the button's room
 * free at its right at every stop and slides right into it with the sheet's
 * position (sheetMotion): a translation only, so the title never wraps again
 * mid-drag — the photo is inside the block, so it slides with it. A sheet
 * with a Close button at its top-trailing corner keeps that room free too.
 */
export const TitleBlock = memo(function TitleBlock({
  title,
  address,
  subtitle,
  tile,
  photo,
  palette,
}: {
  title: string;
  /** The full address when the title is only part of it. */
  address?: string | null;
  subtitle?: string | null;
  tile?: { glyph: IoniconName; color: string } | null;
  photo?: TitlePhoto | null;
  palette: SheetPalette;
}) {
  const motion = useSheetMotion();
  const noShift = useSharedValue(0);
  const shift = motion?.titleShift ?? noShift;
  // Only a translation follows the sheet: the width stays, so the title
  // keeps its lines while it slides into the room kept free for it.
  const shiftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }] }));

  // Google asks for its credit wherever the photo is shown. Beside the copy it
  // is literally next to the photograph, and it costs a line only when Google
  // actually names a photographer — for most places it sends none. Whether a
  // name is worth showing at all is the caller's rule (destinationPhotoCredit).
  const credit = (photo ? photo.credit?.trim() : null) || null;

  const copy = (
    <View style={[styles.titleCopy, (tile || photo) && styles.titleCopyBesideTile]}>
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
      {credit ? (
        // secondaryLabel, not the quieter tertiary: a credit that cannot be
        // read is not a credit — and uncapped for that same reason, as the
        // break page's credit is (GroupFooter, no line cap). Google asks for
        // the attribution to be shown, and the gateway already drops whole
        // contributors rather than cut one mid-word (attributionText); a line
        // cap here would put that cut straight back, and "Fotoğraf: Ahmet
        // Yılmaz, Mehmet De…" credits the second photographer with nothing.
        // Two names, or one long name at a large text size, cost a second
        // line — 16 pt, well inside what the medium detent has to spare.
        <Text style={[styles.titleCredit, { color: palette.secondaryLabel }]}>
          {`Fotoğraf: ${credit}`}
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
      {photo ? (
        // Top-aligned, not centred as the tile row is: the copy beside it is
        // three or four lines tall, and a photograph floating at the middle of
        // them belongs to none of them.
        <View style={styles.titlePhotoRow}>
          <View
            style={[styles.titlePhoto, { backgroundColor: palette.fill }]}
            // The header already names the place; the photograph adds nothing
            // to read out, and an image of it would only be one more stop.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Image
              source={{ uri: photo.uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={180}
              cachePolicy="memory-disk"
              recyclingKey={photo.uri}
              onError={photo.onError}
              accessible={false}
            />
            {/* Keeps a white or a dark photo's edge against the sheet. */}
            <View
              pointerEvents="none"
              style={[
                styles.titlePhotoEdge,
                {
                  borderColor: palette.isDark
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(0,0,0,0.08)",
                },
              ]}
            />
          </View>
          {copy}
        </View>
      ) : tile ? (
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
  // The tile row's gap, so the copy starts at the same place either way.
  titlePhotoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  // Fixed and clipped, so the photo is the slot; the 2 drops its top edge onto
  // the title's cap, which sits that far inside its 29 pt line.
  titlePhoto: {
    width: TITLE_PHOTO_SIZE,
    height: TITLE_PHOTO_SIZE,
    marginTop: 2,
    borderRadius: TITLE_PHOTO_RADIUS,
    overflow: "hidden",
  },
  titlePhotoEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TITLE_PHOTO_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
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
  // A caption under the lines it belongs to, as the break page's credit is
  // under its photo: one step down from the subtitle, never two lines.
  titleCredit: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    letterSpacing: 0,
  },
});
