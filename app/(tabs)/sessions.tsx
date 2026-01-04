import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type StationType = "AC" | "DC" | "HPC";

const typeColors: Record<StationType, string> = {
  HPC: "#7C4DFF",
  DC: "#FF8A1F",
  AC: "#4BACE4",
};

const typeLightningCount: Record<StationType, number> = {
  AC: 1,
  DC: 2,
  HPC: 3,
};

// Mock data generator
const generateMockSessions = (startId: number, count: number) => {
  const stations = [
    "Metro Market Dudullu",
    "Meydan AVM Ümraniye",
    "Kalamış Park",
    "Zorlu Center",
    "Akasya AVM",
    "İstinyePark",
    "Cevahir AVM",
    "Kanyon AVM",
    "Trump Towers",
    "Maslak 1453",
    "Emaar Square",
    "Vadistanbul",
  ];
  const types: StationType[] = ["AC", "DC", "HPC"];

  return Array.from({ length: count }, (_, i) => {
    const id = startId + i;
    const type = types[Math.floor(Math.random() * types.length)];
    const energy = Math.floor(Math.random() * 50) + 5;
    const cost = Math.floor(energy * 8.2);
    const daysAgo = Math.floor(Math.random() * 60);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);

    return {
      id: String(id),
      station: stations[Math.floor(Math.random() * stations.length)],
      date: date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      energy: `${energy} kWh`,
      cost: `₺${cost}`,
      type,
      typeColor: typeColors[type],
      duration: `${Math.floor(Math.random() * 90) + 10} min`,
      connector: `Connector ${Math.floor(Math.random() * 4) + 1}`,
    };
  });
};

const INITIAL_COUNT = 15;
const LOAD_MORE_COUNT = 8;

export default function SessionsScreen() {
  const [sessions] = useState(() => generateMockSessions(1, INITIAL_COUNT));
  const [displayedSessions, setDisplayedSessions] = useState(() =>
    sessions.slice(0, 10)
  );
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilters, setTypeFilters] = useState<StationType[]>([
    "AC",
    "DC",
    "HPC",
  ]);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const heightAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const toggleFilters = () => {
    const toValue = filtersExpanded ? 0 : 1;
    
    Animated.parallel([
      Animated.spring(rotateAnim, {
        toValue,
        useNativeDriver: true,
        friction: 8,
      }),
      Animated.timing(heightAnim, {
        toValue,
        duration: 300,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }),
      Animated.timing(opacityAnim, {
        toValue,
        duration: 250,
        useNativeDriver: false,
      }),
    ]).start();
    
    setFiltersExpanded((prev) => !prev);
  };

  const chevronRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const filterContentHeight = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 140],
  });

  const filterContentOpacity = opacityAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const toggleType = (type: StationType) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTypeFilters((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const filteredSessions = useMemo(() => {
    return displayedSessions.filter((session) => {
      const matchesType = typeFilters.includes(session.type);
      const matchesSearch = session.station
        .toLowerCase()
        .includes(search.toLowerCase().trim());
      return matchesType && matchesSearch;
    });
  }, [displayedSessions, typeFilters, search]);

  const loadMore = useCallback(() => {
    if (loading || displayedSessions.length >= sessions.length) return;
    setLoading(true);

    setTimeout(() => {
      const nextBatch = sessions.slice(
        displayedSessions.length,
        displayedSessions.length + LOAD_MORE_COUNT
      );
      setDisplayedSessions((prev) => [...prev, ...nextBatch]);
      setLoading(false);
    }, 600);
  }, [loading, displayedSessions.length, sessions]);

  const renderSession = useCallback(
    ({ item }: { item: (typeof sessions)[0] }) => (
      <Pressable style={styles.card}>
        {/* Left Accent Bar */}
        <View style={[styles.accentBar, { backgroundColor: item.typeColor }]} />

        <View style={styles.cardContent}>
          {/* Header Row */}
          <View style={styles.cardHeader}>
            <View style={styles.stationInfo}>
              <Text style={styles.station} numberOfLines={1}>
                {item.station}
              </Text>
              <View style={styles.metaRow}>
                <Ionicons name="calendar-outline" size={12} color="#8E8E93" />
                <Text style={styles.metaText}>{item.date}</Text>
                <Text style={styles.metaDot}>•</Text>
                <Text style={styles.metaText}>{item.connector}</Text>
              </View>
            </View>

            {/* Type Badge with overlapping icons */}
            <View
              style={[styles.typeBadge, { backgroundColor: item.typeColor }]}
            >
              <View style={styles.lightningContainer}>
                {Array.from({
                  length: typeLightningCount[item.type],
                }).map((_, idx) => (
                  <View
                    key={idx}
                    style={{
                      marginLeft: idx > 0 ? -7 : 0,
                      zIndex: idx,
                    }}
                  >
                    <Ionicons name="flash" size={12} color="#fff" />
                  </View>
                ))}
              </View>
              <Text style={styles.typeText}>{item.type}</Text>
            </View>
          </View>

          {/* Stats Row */}
          <View style={styles.cardStats}>
            <View style={styles.statsLeft}>
              <View style={styles.stat}>
                <View style={styles.statIcon}>
                  <Ionicons name="flash" size={14} color="#2cdb9b" />
                </View>
                <Text style={styles.statValue}>{item.energy}</Text>
              </View>
              <View style={styles.stat}>
                <View style={[styles.statIcon, { backgroundColor: "#F0F0F5" }]}>
                  <Ionicons name="time" size={14} color="#8E8E93" />
                </View>
                <Text style={styles.statValue}>{item.duration}</Text>
              </View>
            </View>
            <Text style={styles.cost}>{item.cost}</Text>
          </View>
        </View>
      </Pressable>
    ),
    []
  );

  const renderFooter = useCallback(() => {
    if (!loading) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#2cdb9b" />
      </View>
    );
  }, [loading]);


  return (
    <SafeAreaView style={styles.safeArea}>
      <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
      <View style={styles.header}>
        <Text style={styles.title}>Sessions</Text>
        <Text style={styles.subtitle}>Your charging history</Text>
      </View>

      {/* Filter Section - Outside FlatList to prevent keyboard issues */}
      <View style={styles.filterWrapper}>
        <View style={styles.filtersSection}>
          {/* Collapsible Header */}
          <Pressable style={styles.filterToggle} onPress={toggleFilters}>
            <View style={styles.filterToggleLeft}>
              <Ionicons name="options-outline" size={18} color="#0f231c" />
              <Text style={styles.filterToggleText}>Filters</Text>
              {(typeFilters.length < 3 || search.length > 0) && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>
                    {3 - typeFilters.length + (search.length > 0 ? 1 : 0)}
                  </Text>
                </View>
              )}
            </View>
            <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
              <Ionicons name="chevron-down" size={20} color="#8E8E93" />
            </Animated.View>
          </Pressable>

          {/* Collapsible Content */}
          <Animated.View
            style={[
              styles.filterContent,
              {
                height: filterContentHeight,
                opacity: filterContentOpacity,
                overflow: "hidden",
              },
            ]}
          >
            {/* Search */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color="#8E8E93" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search station..."
                placeholderTextColor="#C7C7CC"
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")}>
                  <Ionicons name="close-circle" size={18} color="#C7C7CC" />
                </Pressable>
              )}
            </View>

            {/* Type Chips */}
            <View style={styles.typeChips}>
              {(["AC", "DC", "HPC"] as StationType[]).map((type) => {
                const active = typeFilters.includes(type);
                const color = typeColors[type];
                return (
                  <Pressable
                    key={type}
                    onPress={() => toggleType(type)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? color : "#F5F5F5",
                        borderColor: active ? color : "#E0E0E0",
                      },
                    ]}
                  >
                    <View style={styles.chipIcons}>
                      {Array.from({ length: typeLightningCount[type] }).map(
                        (_, idx) => (
                          <View
                            key={idx}
                            style={{
                              marginLeft: idx > 0 ? -7 : 0,
                              zIndex: idx,
                            }}
                          >
                            <Ionicons
                              name="flash"
                              size={14}
                              color={active ? "#fff" : color}
                            />
                          </View>
                        )
                      )}
                    </View>
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? "#fff" : "#333" },
                      ]}
                    >
                      {type}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        </View>
      </View>

      <FlatList
        data={filteredSessions}
        keyExtractor={(item) => item.id}
        renderItem={renderSession}
        contentContainerStyle={styles.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color="#C7C7CC" />
            <Text style={styles.emptyText}>No sessions found</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
  },
  filterWrapper: {
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#0f231c",
  },
  subtitle: {
    fontSize: 15,
    color: "#8E8E93",
    marginTop: 2,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },

  // Filters Section
  filtersSection: {
    backgroundColor: "#FFFFFF",
    marginBottom: 16,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 0.5,
    borderColor: "#E0E0E0",
  },
  filterToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  filterToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterToggleText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f231c",
  },
  filterBadge: {
    backgroundColor: "#2cdb9b",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  filterBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 14,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F8F8",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#0f231c",
  },
  typeChips: {
    flexDirection: "row",
    gap: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 0,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  chipIcons: {
    flexDirection: "row",
  },
  chipText: {
    fontSize: 14,
    fontWeight: "700",
  },

  // Session Card
  card: {
    flexDirection: "row",
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    marginBottom: 10,
    overflow: "hidden",
  },
  accentBar: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    padding: 14,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  stationInfo: {
    flex: 1,
    marginRight: 10,
  },
  station: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f231c",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: "#8E8E93",
  },
  metaDot: {
    color: "#C7C7CC",
    fontSize: 10,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  lightningContainer: {
    flexDirection: "row",
  },
  typeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  cardStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statsLeft: {
    flexDirection: "row",
    gap: 16,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#E8F9F1",
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f231c",
  },
  cost: {
    fontSize: 20,
    fontWeight: "800",
    color: "#2cdb9b",
  },
  footer: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: "#8E8E93",
  },
});
