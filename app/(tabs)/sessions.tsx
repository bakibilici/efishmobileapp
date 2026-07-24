import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  DriveSessionState,
  DriveSessionStore,
} from "@/services/DriveSessionStore";
import {
  DriveSessionHistoryStorage,
  StoredDriveSessionRecord,
} from "@/services/driveSessionHistory";
import { useUser } from "@/context/UserContext";
import { useTheme } from "@/context/ThemeContext";

const formatRelativeTime = (timestamp: number) => {
  const now = Date.now();
  const diffMs = Math.max(0, now - timestamp);
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "Az önce";
  if (minutes < 60) return `${minutes} dk önce`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün önce`;

  return new Date(timestamp).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDuration = (durationSeconds: number | null) => {
  if (!durationSeconds || durationSeconds <= 0) return "--";
  const totalMinutes = Math.round(durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) return `${minutes} dk`;
  return `${hours} sa ${minutes} dk`;
};

const formatDistance = (distanceKm: number | null) => {
  if (distanceKm == null || Number.isNaN(distanceKm)) return "--";
  return `${distanceKm.toFixed(distanceKm >= 100 ? 0 : 1)} km`;
};

export default function SessionsScreen() {
  const router = useRouter();
  const { colors, themeScheme } = useTheme();
  const { user } = useUser();
  const isDark = themeScheme === "dark";

  const [sessions, setSessions] = useState<StoredDriveSessionRecord[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState(
    DriveSessionStore.getContext()?.sessionId ?? null,
  );

  const loadSessions = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        if (!user?.id) {
          setSessions([]);
          return;
        }

        const rows = await DriveSessionHistoryStorage.listSessions(user.id);
        setSessions(rows);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    const unsubscribe = DriveSessionStore.onStateChange(() => {
      setActiveSessionId(DriveSessionStore.getContext()?.sessionId ?? null);
    });

    return unsubscribe;
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSessions();
    }, [loadSessions]),
  );

  const filteredSessions = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();
    if (!normalizedQuery) return sessions;

    return sessions.filter((session) => {
      const haystack = [
        session.title,
        session.originName || "",
        session.destinationName || "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [search, sessions]);

  const handleOpenSession = useCallback(
    (session: StoredDriveSessionRecord, reconnectVoice: boolean) => {
      DriveSessionStore.restoreSession(session, { reconnectVoice });
      router.navigate("/(tabs)/mainpage");
    },
    [router],
  );

  const renderSession = useCallback(
    ({ item }: { item: StoredDriveSessionRecord }) => {
      const isCurrentSession =
        activeSessionId === item.sessionId &&
        DriveSessionStore.getState() !== DriveSessionState.IDLE;
      const statusLabel = isCurrentSession
        ? "Açık oturum"
        : item.endedAt
          ? "Kaydedildi"
          : "Hazır";
      const statusColor = isCurrentSession
        ? colors.primary
        : item.endedAt
          ? "#34C759"
          : "#0A84FF";
      const routeLabel =
        item.originName && item.destinationName
          ? `${item.originName} → ${item.destinationName}`
          : item.title;

      return (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,35,28,0.06)",
              shadowOpacity: isDark ? 0 : 0.08,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleStack}>
              <View
                style={[
                  styles.statusChip,
                  { backgroundColor: `${statusColor}18` },
                ]}
              >
                <View
                  style={[styles.statusChipDot, { backgroundColor: statusColor }]}
                />
                <Text style={[styles.statusChipText, { color: statusColor }]}>
                  {statusLabel}
                </Text>
              </View>
              <Text
                style={[styles.cardTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                {item.destinationName || item.title}
              </Text>
              <Text
                style={[styles.cardSubtitle, { color: colors.textSecondary }]}
                numberOfLines={2}
              >
                {routeLabel}
              </Text>
            </View>

            <View
              style={[
                styles.routeGlyph,
                {
                  backgroundColor: isDark
                    ? "rgba(10,132,255,0.14)"
                    : "rgba(10,132,255,0.08)",
                },
              ]}
            >
              <Ionicons name="map-outline" size={18} color="#0A84FF" />
            </View>
          </View>

          <View style={styles.metricRow}>
            <View
              style={[
                styles.metricPill,
                { backgroundColor: colors.backgroundSecondary },
              ]}
            >
              <Ionicons name="navigate-outline" size={15} color={colors.primary} />
              <Text style={[styles.metricText, { color: colors.text }]}>
                {formatDistance(item.distanceKm)}
              </Text>
            </View>

            <View
              style={[
                styles.metricPill,
                { backgroundColor: colors.backgroundSecondary },
              ]}
            >
              <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
              <Text style={[styles.metricText, { color: colors.text }]}>
                {formatDuration(item.durationSeconds)}
              </Text>
            </View>

            <View
              style={[
                styles.metricPill,
                { backgroundColor: colors.backgroundSecondary },
              ]}
            >
              <Ionicons name="flash-outline" size={15} color="#FF9F0A" />
              <Text style={[styles.metricText, { color: colors.text }]}>
                {item.stationCount ?? 0} durak
              </Text>
            </View>
          </View>

          <View style={styles.footerRow}>
            <Text style={[styles.updatedAtText, { color: colors.textSecondary }]}>
              Son güncelleme: {formatRelativeTime(item.updatedAt)}
            </Text>

            <View style={styles.actionRow}>
              <Pressable
                onPress={() => handleOpenSession(item, false)}
                style={[
                  styles.secondaryAction,
                  {
                    backgroundColor: colors.backgroundSecondary,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons name="navigate-circle-outline" size={18} color={colors.text} />
                <Text
                  style={[styles.secondaryActionText, { color: colors.text }]}
                >
                  Rotayı Aç
                </Text>
              </Pressable>

              <Pressable
                onPress={() => handleOpenSession(item, true)}
                style={[
                  styles.primaryAction,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Ionicons name="mic-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryActionText}>Atlas ile Bağlan</Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    },
    [activeSessionId, colors, handleOpenSession, isDark],
  );

  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Kaydedilen oturumlar yükleniyor...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <FlatList
        data={filteredSessions}
        keyExtractor={(item) => item.sessionId}
        renderItem={renderSession}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadSessions("refresh")}
            tintColor={colors.primary}
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.headerTopRow}>
              <Pressable
                onPress={() => router.navigate("/(tabs)/mainpage")}
                style={[
                  styles.backButton,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Pressable>

              <View style={styles.headerTextBlock}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                  Atlas Sessions
                </Text>
                <Text
                  style={[styles.headerSubtitle, { color: colors.textSecondary }]}
                >
                  Kaydettiğin rotalara geri dön ve Atlas ile aynı bağlamda yeniden başla.
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.searchShell,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  shadowColor: colors.shadow,
                },
              ]}
            >
              <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Hedef veya rota ara"
                placeholderTextColor={colors.textTertiary}
                style={[styles.searchInput, { color: colors.text }]}
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")}>
                  <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                </Pressable>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View
              style={[
                styles.emptyIconWrap,
                {
                  backgroundColor: isDark
                    ? "rgba(10,132,255,0.16)"
                    : "rgba(10,132,255,0.08)",
                },
              ]}
            >
              <Ionicons name="albums-outline" size={28} color="#0A84FF" />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Henüz kaydedilmiş rota yok
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Atlas ile rota oluşturduğunuzda oturum burada görünecek.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "500",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  headerBlock: {
    paddingTop: 8,
    paddingBottom: 18,
    gap: 18,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerTextBlock: {
    flex: 1,
    gap: 4,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  headerSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  searchShell: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },
  card: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 28,
    elevation: 6,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  cardTitleStack: {
    flex: 1,
    gap: 8,
  },
  statusChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusChipDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  cardSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  routeGlyph: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  metricPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
  },
  metricText: {
    fontSize: 13,
    fontWeight: "700",
  },
  footerRow: {
    marginTop: 18,
    gap: 14,
  },
  updatedAtText: {
    fontSize: 13,
    fontWeight: "500",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: "700",
  },
  primaryAction: {
    flex: 1.2,
    minHeight: 48,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 72,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 280,
  },
});
