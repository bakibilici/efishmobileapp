import React, { Children, Fragment, isValidElement, memo, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  GROUP_RADIUS,
  SIDE_MARGIN,
  TABULAR,
  TEXT_INSET,
} from "../route-sheet/Grouped";
import { IconSymbol, type IconSymbolName } from "./icon-symbol";
import type { PagePalette } from "./pagePalette";

/*
 * Inset grouped lists for full pages, as in iOS Settings. The metrics and the
 * header, footer and destructive cells are the route sheet's own, so a page
 * and the sheet read as one app; rows here take SF Symbols (IconSymbol) so
 * Android gets the mapped Material icon.
 */
export {
  DestructiveRow,
  GROUP_RADIUS,
  GroupFooter,
  SectionHeader,
  SIDE_MARGIN,
  TABULAR,
  TEXT_INSET,
} from "../route-sheet/Grouped";

type Tile = { symbol: IconSymbolName; color: string };

/**
 * A paragraph that stands in for a group under a SectionHeader (a section
 * that only explains). A footer's text, without the footer's top margin, so
 * it sits under its header the way a group does.
 */
export const SectionParagraph = memo(function SectionParagraph({
  text,
  palette,
}: {
  text: string;
  palette: PagePalette;
}) {
  return <Text style={[styles.paragraph, { color: palette.secondaryLabel }]}>{text}</Text>;
});

/** Rounded-square tile with a white glyph, as in Settings. */
export const SymbolTile = memo(function SymbolTile({
  symbol,
  color,
  size = 30,
}: {
  symbol: IconSymbolName;
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
      <IconSymbol
        name={symbol}
        size={Math.round(size * 0.6)}
        weight="medium"
        color="#FFFFFF"
      />
    </View>
  );
});

/**
 * One inset group. Hairlines are drawn between its rows at `separatorInset`
 * (the text's start after a tile by default; 16 for rows without tiles).
 * Null children (a row shown only sometimes) get no separator.
 */
export const ListGroup = memo(function ListGroup({
  palette,
  children,
  separatorInset = TEXT_INSET,
  style,
}: {
  palette: PagePalette;
  children: ReactNode;
  separatorInset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // toArray drops null children and keys the rest by their original place,
  // so a row that comes and goes does not remount the rows after it.
  const rows = Children.toArray(children);
  return (
    <View style={[styles.group, { backgroundColor: palette.cell }, style]}>
      {rows.map((row, index) => (
        <Fragment key={isValidElement(row) && row.key != null ? row.key : index}>
          {index > 0 ? (
            <View
              style={[
                styles.separator,
                { marginLeft: separatorInset, backgroundColor: palette.separator },
              ]}
            />
          ) : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
});

/** The tile and the title with its subtitle: shared by Row and SwitchRow. */
function RowLabel({
  palette,
  title,
  subtitle,
  tile,
  titleColor,
}: {
  palette: PagePalette;
  title: string;
  subtitle?: string | null;
  tile?: Tile | null;
  titleColor: string;
}) {
  return (
    <>
      {tile ? <SymbolTile symbol={tile.symbol} color={tile.color} /> : null}
      <View style={[styles.copy, tile && styles.copyAfterTile]}>
        <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
        {/* Never cut: subtitles here explain what is shared, exported or deleted. */}
        {subtitle ? (
          <Text style={[styles.subtitle, { color: palette.secondaryLabel }]}>{subtitle}</Text>
        ) : null}
      </View>
    </>
  );
}

/**
 * A grouped cell: an optional tile, the title (and a subtitle under it), a
 * value at the right, then a chevron (it opens something) or a checkmark (it
 * is the chosen option). With `onPress` it is a button and shows a chevron
 * unless `accessory` says otherwise; without it, one element VoiceOver reads
 * whole.
 */
export const Row = memo(function Row({
  palette,
  title,
  subtitle,
  value,
  tabularValue = false,
  tile,
  accessory,
  destructive = false,
  onPress,
  disabled = false,
  accessibilityRole,
  accessibilityState,
  accessibilityLabel,
  accessibilityHint,
}: {
  palette: PagePalette;
  title: string;
  subtitle?: string | null;
  value?: string | null;
  /** Tabular figures: a value that changes in place must not shift its digits. */
  tabularValue?: boolean;
  tile?: Tile | null;
  accessory?: "chevron" | "check" | "none";
  destructive?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const shownAccessory = accessory ?? (onPress ? "chevron" : "none");
  const titleColor = disabled
    ? palette.tertiaryLabel
    : destructive
      ? palette.red
      : palette.label;
  const label =
    accessibilityLabel ?? [title, value, subtitle].filter((part) => !!part).join(", ");

  const content = (
    <>
      <RowLabel
        palette={palette}
        title={title}
        subtitle={subtitle}
        tile={tile}
        titleColor={titleColor}
      />
      {value ? (
        <Text
          style={[styles.value, tabularValue && TABULAR, { color: palette.secondaryLabel }]}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}
      {shownAccessory === "chevron" ? (
        <IconSymbol
          name="chevron.right"
          size={13}
          weight="semibold"
          color={palette.tertiaryLabel}
          style={styles.accessory}
        />
      ) : shownAccessory === "check" ? (
        <IconSymbol
          name="checkmark"
          size={17}
          weight="semibold"
          color={palette.accent}
          style={styles.accessory}
        />
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityRole={accessibilityRole}
        accessibilityState={accessibilityState}
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        style={styles.row}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole ?? "button"}
      accessibilityState={{ disabled, ...accessibilityState }}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: palette.cellPressed },
      ]}
    >
      {content}
    </Pressable>
  );
});

/**
 * A grouped cell with a switch at the right. Only the switch toggles (as in
 * Settings); it carries the title and the subtitle for VoiceOver, so the
 * text beside it is not read twice.
 */
export const SwitchRow = memo(function SwitchRow({
  palette,
  title,
  subtitle,
  tile,
  value,
  onValueChange,
  disabled = false,
  accessibilityHint,
}: {
  palette: PagePalette;
  title: string;
  subtitle?: string | null;
  tile?: Tile | null;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  return (
    <View style={styles.row}>
      <View
        style={styles.labelArea}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <RowLabel
          palette={palette}
          title={title}
          subtitle={subtitle}
          tile={tile}
          titleColor={disabled ? palette.tertiaryLabel : palette.label}
        />
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={title}
        accessibilityHint={subtitle ?? accessibilityHint}
        style={styles.switch}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  group: {
    marginHorizontal: SIDE_MARGIN,
    borderRadius: GROUP_RADIUS,
    overflow: "hidden",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  // GroupFooter's metrics (route-sheet/Grouped) with no top margin: the
  // header's own 7 pt bottom margin is the gap, as above a group.
  paragraph: {
    marginHorizontal: SIDE_MARGIN + 16,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  },
  tile: {
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  labelArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  // 16 + 30 + 12: the text starts at TEXT_INSET, where the separators start.
  copyAfterTile: {
    marginLeft: 12,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "400",
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400",
    letterSpacing: -0.2,
  },
  value: {
    maxWidth: "50%",
    marginLeft: 8,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "400",
    letterSpacing: -0.4,
    textAlign: "right",
  },
  accessory: {
    marginLeft: 8,
  },
  // RN's iOS Switch sets alignSelf "flex-start" itself: centre it in the row.
  switch: {
    alignSelf: "center",
    marginLeft: 12,
  },
});
