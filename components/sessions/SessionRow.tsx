import React, { memo, useCallback } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from "react-native";

import type { StoredDriveSessionRecord } from "@/services/driveSessionHistory";
import {
  GROUP_RADIUS,
  SIDE_MARGIN,
  SymbolTile,
  TABULAR,
  TEXT_INSET,
} from "@/components/ui/GroupedList";
import { IconSymbol } from "@/components/ui/icon-symbol";
import type { PagePalette } from "@/components/ui/pagePalette";

import type { SessionListItem } from "./sessionModel";

const AKBA_ACTIONS = [{ name: "akba", label: "AKBA ile aç" }];

/**
 * One trip in Oturumlar, a cell of an inset group like a Mail or Notes row:
 * a tile, the destination, then one line with when, how far, how long and
 * how many stops. A tap opens the route on the map; the trailing button opens
 * it and connects AKBA. The open session only takes the driver back to the
 * map, so it has no AKBA button.
 */
export const SessionRow = memo(function SessionRow({
  item,
  palette,
  isFirst,
  isLast,
  onOpen,
  onOpenWithAkba,
}: {
  item: SessionListItem;
  palette: PagePalette;
  isFirst: boolean;
  isLast: boolean;
  onOpen: (session: StoredDriveSessionRecord, isActive: boolean) => void;
  onOpenWithAkba: (session: StoredDriveSessionRecord) => void;
}) {
  const { session, isActive } = item;
  const open = useCallback(() => onOpen(session, isActive), [onOpen, session, isActive]);
  const openWithAkba = useCallback(() => onOpenWithAkba(session), [onOpenWithAkba, session]);
  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === "akba") openWithAkba();
    },
    [openWithAkba],
  );

  return (
    <View
      style={[
        styles.cell,
        { backgroundColor: palette.cell },
        isFirst && styles.first,
        isLast && styles.last,
      ]}
    >
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={item.spokenLabel}
        accessibilityHint={isActive ? "Haritaya döner" : "Rotayı haritada açar"}
        // The AKBA button inside is hidden from VoiceOver by the row; this is its way in.
        accessibilityActions={isActive ? undefined : AKBA_ACTIONS}
        onAccessibilityAction={isActive ? undefined : onAccessibilityAction}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.cellPressed }]}
      >
        <SymbolTile
          symbol={
            item.hasCharging ? "bolt.fill" : "arrow.triangle.turn.up.right.diamond.fill"
          }
          color={item.hasCharging ? palette.green : palette.blue}
        />
        <View style={styles.copy}>
          <Text
            style={[styles.title, { color: palette.label }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.title}
          </Text>
          {/* One line at the default text size; larger sizes may take two. */}
          <Text style={[styles.meta, { color: palette.secondaryLabel }]} numberOfLines={2}>
            {isActive ? <Text style={{ color: palette.green }}>Şu an açık · </Text> : null}
            {item.meta}
          </Text>
        </View>
        {isActive ? null : (
          <Pressable
            onPress={openWithAkba}
            accessibilityRole="button"
            accessibilityLabel="AKBA ile aç"
            accessibilityHint="Rotayı açar ve AKBA'yı bağlar"
            style={({ pressed }) => [styles.akbaButton, pressed && styles.akbaPressed]}
          >
            <View style={[styles.akbaCircle, { backgroundColor: palette.accentFill }]}>
              <IconSymbol name="waveform" size={15} weight="semibold" color={palette.accent} />
            </View>
          </Pressable>
        )}
      </Pressable>
      {isFirst ? null : (
        <View
          pointerEvents="none"
          style={[styles.separator, { backgroundColor: palette.separator }]}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  cell: {
    marginHorizontal: SIDE_MARGIN,
    overflow: "hidden",
  },
  first: {
    borderTopLeftRadius: GROUP_RADIUS,
    borderTopRightRadius: GROUP_RADIUS,
  },
  last: {
    borderBottomLeftRadius: GROUP_RADIUS,
    borderBottomRightRadius: GROUP_RADIUS,
  },
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 8,
  },
  // 16 + 30 + 12: the text starts at TEXT_INSET, where the separators start.
  copy: {
    flex: 1,
    marginLeft: 12,
    gap: 1,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  meta: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400",
    letterSpacing: -0.2,
    ...TABULAR,
  },
  akbaButton: {
    width: 44,
    height: 44,
    marginLeft: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  akbaPressed: {
    opacity: 0.5,
  },
  akbaCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  separator: {
    position: "absolute",
    top: 0,
    left: TEXT_INSET,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
});
