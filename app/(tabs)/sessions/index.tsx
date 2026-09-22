import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  SectionList,
  StyleSheet,
  type SectionListRenderItem,
} from "react-native";

import { useTabBarContentInset } from "@/components/navigation/tabBarMetrics";
import { useTabScrollToTop } from "@/components/navigation/useTabScrollToTop";
import { SessionRow } from "@/components/sessions/SessionRow";
import { SessionsEmptyState } from "@/components/sessions/SessionsEmptyState";
import {
  buildSessionSections,
  type SessionListItem,
  type SessionSection,
} from "@/components/sessions/sessionModel";
import { SectionHeader } from "@/components/ui/GroupedList";
import { usePagePalette } from "@/components/ui/pagePalette";
import { useUser } from "@/context/UserContext";
import { DriveSessionState, DriveSessionStore } from "@/services/DriveSessionStore";
import {
  DriveSessionHistoryStorage,
  type StoredDriveSessionRecord,
} from "@/services/driveSessionHistory";

/** The session on screen now, while a drive or a preview is open: its row shows as open. */
const readActiveSessionId = () =>
  DriveSessionStore.getState() !== DriveSessionState.IDLE
    ? (DriveSessionStore.getContext()?.sessionId ?? null)
    : null;

/**
 * Oturumlar: the routes planned with AKBA, newest first, grouped by day as
 * iOS lists are, with the native search field under the large title. A tap
 * opens the route on the map; a row's trailing button opens it with AKBA.
 */
export default function SessionsScreen() {
  const router = useRouter();
  const palette = usePagePalette();
  const { user } = useUser();
  const userId = user?.id ?? null;
  const bottomInset = useTabBarContentInset();

  // Null until the first load, which shows a spinner: never a flash of the empty state.
  const [rows, setRows] = useState<StoredDriveSessionRecord[] | null>(null);
  // Read again with every load, so BUGÜN and DÜN move on after midnight.
  const [now, setNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [activeSessionId, setActiveSessionId] = useState(readActiveSessionId);
  const loadSeq = useRef(0);
  // Tapping Oturumlar again scrolls back to the top, as iOS tab bars do.
  const listRef = useRef<SectionList<SessionListItem, SessionSection>>(null);
  const scrollToTopProps = useTabScrollToTop(listRef);

  /** Reloads in place: the rows on screen stay until the new ones arrive. */
  const loadSessions = useCallback(
    async (pulled = false) => {
      loadSeq.current += 1;
      const seq = loadSeq.current;
      if (pulled) setRefreshing(true);
      try {
        const next =
          userId != null ? await DriveSessionHistoryStorage.listSessions(userId) : [];
        // A later load (another focus, a pull) has the newer rows.
        if (seq !== loadSeq.current) return;
        setRows(next);
        setNow(new Date());
      } finally {
        if (pulled) setRefreshing(false);
      }
    },
    [userId],
  );

  useFocusEffect(
    useCallback(() => {
      void loadSessions();
    }, [loadSessions]),
  );

  useEffect(() => {
    const unsubscribe = DriveSessionStore.onStateChange(() =>
      setActiveSessionId(readActiveSessionId()),
    );
    return () => {
      unsubscribe();
    };
  }, []);

  const handleOpenSession = useCallback(
    (session: StoredDriveSessionRecord, reconnectVoice: boolean) => {
      DriveSessionStore.restoreSession(session, { reconnectVoice });
      router.navigate("/(tabs)/mainpage");
    },
    [router],
  );

  // The open session is already on the map: going back to it restores nothing.
  const openSession = useCallback(
    (session: StoredDriveSessionRecord, isActive: boolean) => {
      if (isActive) router.navigate("/(tabs)/mainpage");
      else handleOpenSession(session, false);
    },
    [handleOpenSession, router],
  );

  const openWithAkba = useCallback(
    (session: StoredDriveSessionRecord) => handleOpenSession(session, true),
    [handleOpenSession],
  );

  const onRefresh = useCallback(() => {
    void loadSessions(true);
  }, [loadSessions]);

  const sections = useMemo(
    () => buildSessionSections(rows ?? [], { now, activeSessionId, query }),
    [rows, now, activeSessionId, query],
  );

  // Rows stay tappable while searching (no dimming, which would make a tap
  // cancel the search instead of opening the row).
  const searchOptions = useMemo<NativeStackNavigationOptions>(
    () => ({
      headerSearchBarOptions: {
        placeholder: "Rota veya yer ara",
        placement: "stacked",
        // Always shown: a short list gives no hint that a pull reveals it.
        hideWhenScrolling: false,
        obscureBackground: false,
        autoCapitalize: "none",
        // Below iOS 26 only: iOS 26 draws the cancel button as a glyph.
        cancelButtonText: "Vazgeç",
        onChangeText: (event) => setQuery(event.nativeEvent.text),
        onCancelButtonPress: () => setQuery(""),
        onClose: () => setQuery(""),
        // Android's header search takes its colours from here, not from the theme.
        ...(Platform.OS === "android"
          ? {
              textColor: palette.label,
              hintTextColor: palette.secondaryLabel,
              headerIconColor: palette.label,
            }
          : {}),
      },
    }),
    [palette],
  );

  const renderItem = useCallback<SectionListRenderItem<SessionListItem, SessionSection>>(
    ({ item, index, section }) => (
      <SessionRow
        item={item}
        palette={palette}
        isFirst={index === 0}
        isLast={index === section.data.length - 1}
        onOpen={openSession}
        onOpenWithAkba={openWithAkba}
      />
    ),
    [palette, openSession, openWithAkba],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SessionSection }) => (
      <SectionHeader title={section.title} palette={palette} />
    ),
    [palette],
  );

  return (
    <>
      {/* First native child of the screen, so the large title collapses with it. */}
      <SectionList
        ref={listRef}
        {...scrollToTopProps}
        sections={sections}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        scrollIndicatorInsets={{ bottom: bottomInset }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.secondaryLabel}
            colors={[palette.accent]}
            progressBackgroundColor={palette.cell}
          />
        }
        ListEmptyComponent={
          rows === null ? (
            <ActivityIndicator style={styles.loading} color={palette.secondaryLabel} />
          ) : (
            // Without any trips a search has nothing to miss: say there are none.
            <SessionsEmptyState palette={palette} query={rows.length > 0 ? query : ""} />
          )
        }
      />
      <Stack.Screen options={searchOptions} />
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingTop: 80,
  },
});
