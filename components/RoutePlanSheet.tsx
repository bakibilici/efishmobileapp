import Ionicons from "@expo/vector-icons/Ionicons";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useTheme } from "../context/ThemeContext";
import { DriveSessionStore, RoutePlanLocation } from "../services/DriveSessionStore";

const COLORS = {
  primary: "#0093C9",
  origin: "#0093C9",
  station: "#FF6B35",
  destination: "#0093C9",
  batteryFrom: "#22C55E",
  batteryTo: "#F97316",
  batteryCharge: "#0EA5E9",
  timeline: "#CBD5E1",
  cardBg: "#FFFFFF",
  cardBgDark: "#1E293B",
  surfaceBg: "#F8FAFC",
  surfaceBgDark: "#0F172A",
  textPrimary: "#0F172A",
  textPrimaryDark: "#F1F5F9",
  textSecondary: "#64748B",
  textSecondaryDark: "#94A3B8",
  border: "#E2E8F0",
  borderDark: "#334155",
};

const PANEL_WIDTH = Dimensions.get("window").width - 24;

const getSegmentDuration = (
  currentLocation: RoutePlanLocation,
  nextLocation: RoutePlanLocation | null,
) => currentLocation.travel_duration || nextLocation?.travel_duration || 0;

const getSegmentDistance = (
  currentLocation: RoutePlanLocation,
  nextLocation: RoutePlanLocation | null,
) => currentLocation.travel_length || nextLocation?.travel_length || 0;

const getSegmentBatteryFrom = (currentLocation: RoutePlanLocation) => {
  if (currentLocation.type === "station") {
    return (
      currentLocation.battery_status?.to ??
      currentLocation.battery_status?.from ??
      0
    );
  }

  return (
    currentLocation.battery_status?.from ??
    currentLocation.battery_status?.to ??
    0
  );
};

const getSegmentBatteryTo = (
  currentLocation: RoutePlanLocation,
  nextLocation: RoutePlanLocation | null,
) => {
  if (!nextLocation) {
    return (
      currentLocation.battery_status?.to ??
      currentLocation.battery_status?.from ??
      0
    );
  }

  if (nextLocation.type === "station") {
    return (
      nextLocation.battery_status?.from ??
      nextLocation.battery_status?.to ??
      0
    );
  }

  return (
    nextLocation.battery_status?.to ??
    nextLocation.battery_status?.from ??
    currentLocation.battery_status?.to ??
    0
  );
};

const formatDistanceLabel = (distance: number) =>
  `${distance.toFixed(distance >= 100 ? 0 : 1)} km`;

const BatteryHero = ({
  locations,
  isDark,
}: {
  locations: RoutePlanLocation[];
  isDark: boolean;
}) => {
  if (!locations || locations.length < 2) return null;

  const firstLoc = locations[0];
  const lastLoc = locations[locations.length - 1];
  const originBattery = firstLoc?.battery_status?.from ?? 100;
  const destinationBattery =
    lastLoc?.battery_status?.to ?? lastLoc?.battery_status?.from ?? 0;
  const stationCount = locations.filter(
    (location) => location.type === "station",
  ).length;

  return (
    <View
      style={[
        styles.energyHero,
        {
          backgroundColor: isDark ? COLORS.cardBgDark : COLORS.cardBg,
          borderColor: isDark ? COLORS.borderDark : COLORS.border,
        },
      ]}
    >
      <View style={styles.energyHeroHeader}>
        <View>
          <Text
            style={[
              styles.energyHeroEyebrow,
              { color: isDark ? COLORS.textSecondaryDark : COLORS.textSecondary },
            ]}
          >
            Enerji Planı
          </Text>
          <Text
            style={[
              styles.energyHeroTitle,
              { color: isDark ? COLORS.textPrimaryDark : COLORS.textPrimary },
            ]}
          >
            Rota batarya görünümü
          </Text>
        </View>

        <View
          style={[
            styles.energyHeroPill,
            {
              backgroundColor: isDark
                ? "rgba(14,165,233,0.18)"
                : "rgba(14,165,233,0.08)",
            },
          ]}
        >
          <Ionicons name="flash-outline" size={14} color="#0EA5E9" />
          <Text style={styles.energyHeroPillText}>
            {stationCount} şarj durağı
          </Text>
        </View>
      </View>

      <View style={styles.energyHeroStats}>
        <View
          style={[
            styles.energyHeroStatCard,
            {
              backgroundColor: isDark
                ? "rgba(148,163,184,0.08)"
                : "rgba(248,250,252,0.96)",
              borderColor: isDark ? COLORS.borderDark : COLORS.border,
            },
          ]}
        >
          <Text
            style={[
              styles.energyHeroStatLabel,
              { color: isDark ? COLORS.textSecondaryDark : COLORS.textSecondary },
            ]}
          >
            Başlangıç
          </Text>
          <Text
            style={[
              styles.energyHeroStatValue,
              { color: isDark ? COLORS.textPrimaryDark : COLORS.textPrimary },
            ]}
          >
            %{originBattery}
          </Text>
        </View>

        <View style={styles.energyHeroArrowWrap}>
          <Ionicons
            name="arrow-forward"
            size={16}
            color={isDark ? COLORS.textSecondaryDark : COLORS.textSecondary}
          />
        </View>

        <View
          style={[
            styles.energyHeroStatCard,
            {
              backgroundColor: isDark
                ? "rgba(148,163,184,0.08)"
                : "rgba(248,250,252,0.96)",
              borderColor: isDark ? COLORS.borderDark : COLORS.border,
            },
          ]}
        >
          <Text
            style={[
              styles.energyHeroStatLabel,
              { color: isDark ? COLORS.textSecondaryDark : COLORS.textSecondary },
            ]}
          >
            Varış
          </Text>
          <Text
            style={[
              styles.energyHeroStatValue,
              { color: isDark ? COLORS.textPrimaryDark : COLORS.textPrimary },
            ]}
          >
            %{destinationBattery}
          </Text>
        </View>
      </View>

      <View style={styles.energyTrackBlock}>
        <View
          style={[
            styles.energyTrackBackground,
            {
              backgroundColor: isDark
                ? "rgba(148,163,184,0.16)"
                : "rgba(226,232,240,0.9)",
            },
          ]}
        >
          <View
            style={[
              styles.energyTrackFill,
              { width: `${Math.max(0, Math.min(destinationBattery, 100))}%` },
            ]}
          />
        </View>
        <View style={styles.energyTrackMeta}>
          <Text
            style={[
              styles.energyTrackLabel,
              { color: isDark ? COLORS.textSecondaryDark : COLORS.textSecondary },
            ]}
          >
            Rota sonunda kalan tahmini seviye
          </Text>
          <Text style={styles.energyTrackPercent}>%{destinationBattery}</Text>
        </View>
      </View>
    </View>
  );
};

const SummaryCard = ({
  icon,
  label,
  value,
  isDark,
  iconColor = COLORS.primary,
  onPress,
  disabled = false,
  showChevron = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  isDark: boolean;
  iconColor?: string;
  onPress?: () => void;
  disabled?: boolean;
  showChevron?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress || disabled}
    style={({ pressed }) => [
      styles.summaryCard,
      {
        backgroundColor: isDark ? COLORS.cardBgDark : COLORS.cardBg,
        borderColor: isDark ? COLORS.borderDark : COLORS.border,
        opacity: disabled ? 0.5 : pressed ? 0.92 : 1,
      },
    ]}
  >
    <View
      style={[
        styles.summaryIconContainer,
        { backgroundColor: `${iconColor}15` },
      ]}
    >
      <Ionicons name={icon} size={20} color={iconColor} />
    </View>
    <View style={styles.summaryTextContainer}>
      <Text
        style={[
          styles.summaryLabel,
          { color: isDark ? COLORS.textSecondaryDark : COLORS.textSecondary },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.summaryValue,
          { color: isDark ? COLORS.textPrimaryDark : COLORS.textPrimary },
        ]}
      >
        {value}
      </Text>
    </View>
    {showChevron ? (
      <Ionicons
        name="chevron-forward"
        size={18}
        color={isDark ? COLORS.textSecondaryDark : COLORS.textSecondary}
      />
    ) : null}
  </Pressable>
);

const TimelineDot = ({
  type,
}: {
  type: "origin" | "station" | "destination";
}) => {
  const color = type === "station" ? COLORS.station : COLORS.origin;
  const iconName =
    type === "origin" ? "navigate" : type === "station" ? "flash" : "flag";

  return (
    <View style={[styles.timelineDot, { backgroundColor: color }]}>
      <Ionicons name={iconName} size={13} color="#FFFFFF" />
    </View>
  );
};

const TimelineSegment = ({
  duration,
  distance,
  weather,
  batteryFrom,
  batteryTo,
  isDark,
}: {
  duration: number;
  distance: number;
  weather?: { icon: string; temp: number; text: string };
  batteryFrom: number;
  batteryTo: number;
  isDark: boolean;
}) => {
  const textColor = isDark ? COLORS.textPrimaryDark : COLORS.textPrimary;
  const subtextColor = isDark ? COLORS.textSecondaryDark : COLORS.textSecondary;

  return (
    <View style={styles.segmentContainer}>
      <View style={styles.segmentLineContainer}>
        <View
          style={[styles.segmentVerticalLine, { borderColor: COLORS.timeline }]}
        />
      </View>

      <View style={styles.segmentInfoContainer}>
        <View style={styles.segmentMainRow}>
          <Text style={[styles.segmentTravelText, { color: textColor }]}>
            {duration} dk · {distance} km
          </Text>
          {weather ? (
            <View style={styles.segmentWeatherRow}>
              <Image
                source={{ uri: weather.icon }}
                style={styles.segmentWeatherIcon}
              />
              <Text
                style={[styles.segmentWeatherText, { color: subtextColor }]}
              >
                {weather.temp}°
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.segmentBatteryRow}>
          <Text style={[styles.segmentBatteryText, { color: COLORS.batteryFrom }]}>
            {batteryFrom}%
          </Text>
          <Ionicons
            name="arrow-forward"
            size={14}
            color={subtextColor}
            style={styles.segmentArrowIcon}
          />
          <Text style={[styles.segmentBatteryText, { color: COLORS.batteryTo }]}>
            {batteryTo}%
          </Text>
        </View>
      </View>
    </View>
  );
};

const StationCard = ({
  location,
  isDark,
}: {
  location: RoutePlanLocation;
  isDark: boolean;
}) => {
  const textColor = isDark ? COLORS.textPrimaryDark : COLORS.textPrimary;
  const subtextColor = isDark ? COLORS.textSecondaryDark : COLORS.textSecondary;
  const highlight = location.interest_highlight;

  return (
    <View
      style={[
        styles.stationCard,
        {
          backgroundColor: isDark ? COLORS.cardBgDark : COLORS.cardBg,
          borderColor: isDark ? COLORS.borderDark : COLORS.border,
        },
      ]}
    >
      <View style={styles.stationHeader}>
        <View style={styles.stationNameContainer}>
          <Text
            style={[styles.stationName, { color: textColor }]}
            numberOfLines={2}
          >
            {location.name}
          </Text>
          <View style={styles.stationBadgeRow}>
            {location.cp_type ? (
              <View
                style={[
                  styles.stationTypeBadge,
                  {
                    backgroundColor: isDark
                      ? "rgba(14,165,233,0.16)"
                      : "rgba(14,165,233,0.08)",
                  },
                ]}
              >
                <Text style={styles.stationTypeBadgeText}>
                  {location.cp_type}
                </Text>
              </View>
            ) : null}
            {location.brand ? (
              <Text style={[styles.stationBrandText, { color: subtextColor }]}>
                {location.brand}
              </Text>
            ) : null}
          </View>
        </View>

        {location.max_power ? (
          <View
            style={[
              styles.stationPowerPill,
              {
                backgroundColor: isDark
                  ? "rgba(245,158,11,0.18)"
                  : "rgba(245,158,11,0.1)",
              },
            ]}
          >
            <Ionicons name="flash-outline" size={12} color="#F59E0B" />
            <Text style={styles.stationPowerText}>{location.max_power} kW</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.stationFooter}>
        <View style={styles.stationBatteryInfo}>
          <Text style={[styles.stationBatteryText, { color: COLORS.batteryTo }]}>
            {location.battery_status?.from}%
          </Text>
          <Ionicons
            name="arrow-forward"
            size={14}
            color={subtextColor}
            style={styles.stationArrowIcon}
          />
          <Text
            style={[styles.stationBatteryText, { color: COLORS.batteryCharge }]}
          >
            {location.battery_status?.to}%
          </Text>
        </View>
        {location.charge_duration ? (
          <View style={styles.stationChargeTime}>
            <Ionicons name="time-outline" size={13} color={subtextColor} />
            <Text style={[styles.stationChargeText, { color: textColor }]}>
              {location.charge_duration} dk
            </Text>
          </View>
        ) : null}
      </View>

      {highlight ? (
        <View
          style={[
            styles.highlightCard,
            {
              backgroundColor: isDark
                ? "rgba(15,118,110,0.16)"
                : "rgba(20,184,166,0.08)",
              borderColor: isDark
                ? "rgba(94,234,212,0.18)"
                : "rgba(13,148,136,0.12)",
            },
          ]}
        >
          <View
            style={[
              styles.highlightIconWrap,
              {
                backgroundColor: isDark
                  ? "rgba(94,234,212,0.14)"
                  : "rgba(13,148,136,0.1)",
              },
            ]}
          >
            <Ionicons
              name={highlight.icon as keyof typeof Ionicons.glyphMap}
              size={16}
              color={isDark ? "#5EEAD4" : "#0F766E"}
            />
          </View>
          <View style={styles.highlightTextWrap}>
            <View style={styles.highlightMetaRow}>
              <View
                style={[
                  styles.highlightPremiumBadge,
                  {
                    backgroundColor: isDark
                      ? "rgba(94,234,212,0.14)"
                      : "rgba(13,148,136,0.1)",
                    borderColor: isDark
                      ? "rgba(94,234,212,0.18)"
                      : "rgba(13,148,136,0.14)",
                  },
                ]}
              >
                <Ionicons
                  name="sparkles-outline"
                  size={10}
                  color={isDark ? "#99F6E4" : "#0F766E"}
                />
                <Text
                  style={[
                    styles.highlightPremiumText,
                    { color: isDark ? "#99F6E4" : "#0F766E" },
                  ]}
                >
                  AI ÖNERİSİ
                </Text>
              </View>
            </View>
            <Text style={[styles.highlightTitle, { color: textColor }]}>
              {highlight.title}
            </Text>
            {highlight.poiName ? (
              <Text style={[styles.highlightPoi, { color: subtextColor }]}>
                {highlight.poiName}
                {highlight.distanceM != null
                  ? ` · ~${Math.round(highlight.distanceM)} m`
                  : ""}
              </Text>
            ) : null}
            <Text style={[styles.highlightMessage, { color: subtextColor }]}>
              {highlight.message}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
};

const StationDetailCard = ({
  location,
  isDark,
}: {
  location: RoutePlanLocation;
  isDark: boolean;
}) => {
  const textColor = isDark ? COLORS.textPrimaryDark : COLORS.textPrimary;
  const subtextColor = isDark ? COLORS.textSecondaryDark : COLORS.textSecondary;
  const chargeFrom = location.battery_status?.from ?? 0;
  const chargeTo = location.battery_status?.to ?? 0;
  const chargeAdded = Math.max(0, chargeTo - chargeFrom);
  const totalConnectors =
    (location.ac_count ?? 0) +
    (location.dc_count ?? 0) +
    (location.hpc_count ?? 0);

  return (
    <View
      style={[
        styles.detailCard,
        {
          backgroundColor: isDark ? COLORS.cardBgDark : COLORS.cardBg,
          borderColor: isDark ? COLORS.borderDark : COLORS.border,
        },
      ]}
    >
      <View style={styles.detailTopRow}>
        <View style={styles.detailTitleWrap}>
          <Text style={[styles.detailTitle, { color: textColor }]}>
            {location.name}
          </Text>
          {location.address ? (
            <Text
              style={[styles.detailAddress, { color: subtextColor }]}
              numberOfLines={2}
            >
              {location.address}
            </Text>
          ) : null}
        </View>
        <View
          style={[
            styles.detailTypePill,
            {
              backgroundColor: isDark
                ? "rgba(59,130,246,0.16)"
                : "rgba(59,130,246,0.08)",
            },
          ]}
        >
          <Text style={styles.detailTypeText}>{location.cp_type || "Şarj"}</Text>
        </View>
      </View>

      <View style={styles.detailMetaRow}>
        {location.brand ? (
          <View style={styles.detailMetaPill}>
            <Ionicons name="business-outline" size={14} color={subtextColor} />
            <Text style={[styles.detailMetaText, { color: subtextColor }]}>
              {location.brand}
            </Text>
          </View>
        ) : null}
        {location.max_power ? (
          <View style={styles.detailMetaPill}>
            <Ionicons name="flash-outline" size={14} color="#F59E0B" />
            <Text style={[styles.detailMetaText, { color: subtextColor }]}>
              {location.max_power} kW
            </Text>
          </View>
        ) : null}
        <View style={styles.detailMetaPill}>
          <Ionicons name="hardware-chip-outline" size={14} color={subtextColor} />
          <Text style={[styles.detailMetaText, { color: subtextColor }]}>
            {totalConnectors} soket
          </Text>
        </View>
      </View>

      <View style={styles.detailEnergyGrid}>
        <View style={styles.detailEnergyMetric}>
          <Text style={[styles.detailEnergyLabel, { color: subtextColor }]}>
            Geliş
          </Text>
          <Text style={[styles.detailEnergyValue, { color: textColor }]}>
            %{chargeFrom}
          </Text>
        </View>
        <View style={styles.detailEnergyMetric}>
          <Text style={[styles.detailEnergyLabel, { color: subtextColor }]}>
            Ayrılış
          </Text>
          <Text style={[styles.detailEnergyValue, { color: textColor }]}>
            %{chargeTo}
          </Text>
        </View>
        <View style={styles.detailEnergyMetric}>
          <Text style={[styles.detailEnergyLabel, { color: subtextColor }]}>
            Dolum
          </Text>
          <Text style={[styles.detailEnergyValue, { color: "#0EA5E9" }]}>
            +%{chargeAdded}
          </Text>
        </View>
        <View style={styles.detailEnergyMetric}>
          <Text style={[styles.detailEnergyLabel, { color: subtextColor }]}>
            Süre
          </Text>
          <Text style={[styles.detailEnergyValue, { color: textColor }]}>
            {location.charge_duration ? `${location.charge_duration} dk` : "—"}
          </Text>
        </View>
      </View>

      {location.interest_highlight ? (
        <View
          style={[
            styles.detailAiCard,
            {
              backgroundColor: isDark
                ? "rgba(15,118,110,0.16)"
                : "rgba(20,184,166,0.08)",
              borderColor: isDark
                ? "rgba(94,234,212,0.18)"
                : "rgba(13,148,136,0.12)",
            },
          ]}
        >
          <Ionicons
            name={
              location.interest_highlight.icon as keyof typeof Ionicons.glyphMap
            }
            size={18}
            color={isDark ? "#5EEAD4" : "#0F766E"}
          />
          <View style={styles.detailAiCopy}>
            <Text style={[styles.detailAiTitle, { color: textColor }]}>
              {location.interest_highlight.title}
            </Text>
            <Text style={[styles.detailAiBody, { color: subtextColor }]}>
              {location.interest_highlight.message}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
};

export function RoutePlanSheet({
  onSheetIndexChange,
}: {
  onSheetIndexChange?: (index: number) => void;
}) {
  const { themeScheme } = useTheme();
  const isDark = themeScheme === "dark";
  const bottomSheetRef = useRef<BottomSheet>(null);
  const lastHandledRouteIdRef = useRef<string | null>(null);
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslate = useRef(new Animated.Value(0)).current;

  const snapPoints = useMemo(() => ["15%", "55%", "85%"], []);
  const [routePlanData, setRoutePlanData] = useState(
    DriveSessionStore.getRoutePlanData(),
  );
  const [activePanel, setActivePanel] = useState<"overview" | "stations">(
    "overview",
  );

  const handleSheetChange = useCallback(
    (index: number) => {
      onSheetIndexChange?.(index);
    },
    [onSheetIndexChange],
  );

  useEffect(() => {
    const unsub = DriveSessionStore.onStateChange(() => {
      const context = DriveSessionStore.getContext();
      const planData = context?.routePlanData;
      const currentRouteId = context?.route?.routeId || null;

      setRoutePlanData(planData);

      if (
        planData &&
        currentRouteId &&
        currentRouteId !== lastHandledRouteIdRef.current
      ) {
        lastHandledRouteIdRef.current = currentRouteId;
        setActivePanel("overview");
        setTimeout(() => {
          onSheetIndexChange?.(1);
          bottomSheetRef.current?.snapToIndex(1);
        }, 300);
      }
    });
    return unsub;
  }, [onSheetIndexChange]);

  useEffect(() => {
    onSheetIndexChange?.(1);
  }, [onSheetIndexChange, routePlanData]);

  const animatePanelChange = useCallback(
    (nextPanel: "overview" | "stations", direction: "forward" | "backward") => {
      if (nextPanel === activePanel) return;

      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslate, {
          toValue: direction === "forward" ? -18 : 18,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setActivePanel(nextPanel);
        contentTranslate.setValue(direction === "forward" ? 18 : -18);
        Animated.parallel([
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(contentTranslate, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();
      });
    },
    [activePanel, contentOpacity, contentTranslate],
  );

  if (!routePlanData) return null;

  const { locations, summary } = routePlanData;
  if (!locations || locations.length < 2) return null;

  const textColor = isDark ? COLORS.textPrimaryDark : COLORS.textPrimary;
  const subtextColor = isDark ? COLORS.textSecondaryDark : COLORS.textSecondary;
  const surfaceBg = isDark ? COLORS.surfaceBgDark : COLORS.surfaceBg;
  const highlights = routePlanData.interest_highlights ?? [];
  const optimizationSummary = routePlanData.route_optimization_summary ?? "";
  const hasPremiumInsights = highlights.length > 0;
  const stationLocations = locations.filter(
    (location): location is RoutePlanLocation => location.type === "station",
  );
  const hasStations = stationLocations.length > 0;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={1}
      snapPoints={snapPoints}
      onChange={handleSheetChange}
      enablePanDownToClose={false}
      backgroundStyle={[
        styles.sheetBackground,
        { backgroundColor: surfaceBg },
      ]}
      handleIndicatorStyle={[
        styles.handleIndicator,
        { backgroundColor: isDark ? "#475569" : "#CBD5E1" },
      ]}
      style={styles.sheet}
    >
      <BottomSheetScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: contentOpacity,
            transform: [{ translateX: contentTranslate }],
            width: PANEL_WIDTH,
            alignSelf: "center",
          }}
        >
          {activePanel === "overview" ? (
            <>
              <BatteryHero locations={locations} isDark={isDark} />

              <View style={styles.summaryRow}>
                <SummaryCard
                  icon="time-outline"
                  label="Sürüş süresi"
                  value={`${summary.total_travel_duration} dk`}
                  isDark={isDark}
                  iconColor="#06B6D4"
                />
                <SummaryCard
                  icon="resize-outline"
                  label="Toplam mesafe"
                  value={formatDistanceLabel(summary.total_travel_length)}
                  isDark={isDark}
                  iconColor="#3B82F6"
                />
              </View>

              <View style={styles.summaryRow}>
                <SummaryCard
                  icon="flash-outline"
                  label="Şarj süresi"
                  value={
                    summary.total_charge_duration > 0
                      ? `${summary.total_charge_duration} dk`
                      : "—"
                  }
                  isDark={isDark}
                  iconColor="#F59E0B"
                />
                <SummaryCard
                  icon="battery-charging-outline"
                  label="Şarj durakları"
                  value={`${summary.total_station_count}`}
                  isDark={isDark}
                  iconColor="#6366F1"
                  onPress={() => animatePanelChange("stations", "forward")}
                  disabled={!hasStations}
                  showChevron
                />
              </View>

              {hasPremiumInsights ? (
                <View
                  style={[
                    styles.personalizationPanel,
                    {
                      backgroundColor: isDark
                        ? "rgba(15, 23, 42, 0.72)"
                        : "#FFFFFF",
                      borderColor: isDark ? COLORS.borderDark : COLORS.border,
                    },
                  ]}
                >
                  <View style={styles.personalizationHeader}>
                    <View
                      style={[
                        styles.personalizationIcon,
                        {
                          backgroundColor: isDark
                            ? "rgba(16, 185, 129, 0.16)"
                            : "rgba(16, 185, 129, 0.1)",
                        },
                      ]}
                    >
                      <Ionicons
                        name="sparkles-outline"
                        size={16}
                        color={isDark ? "#6EE7B7" : "#059669"}
                      />
                    </View>
                    <View style={styles.personalizationCopy}>
                      <Text
                        style={[
                          styles.personalizationTitle,
                          { color: textColor },
                        ]}
                      >
                        AKBA AI Plus
                      </Text>
                      <Text
                        style={[
                          styles.personalizationSubtitle,
                          { color: subtextColor },
                        ]}
                      >
                        İlgi alanlarınıza göre seçilen akıllı mola önerileri.
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.personalizationBadge,
                        {
                          backgroundColor: isDark
                            ? "rgba(94, 234, 212, 0.12)"
                            : "rgba(15, 118, 110, 0.08)",
                          borderColor: isDark
                            ? "rgba(94, 234, 212, 0.18)"
                            : "rgba(13, 148, 136, 0.12)",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.personalizationBadgeText,
                          { color: isDark ? "#99F6E4" : "#0F766E" },
                        ]}
                      >
                        PREMIUM
                      </Text>
                    </View>
                  </View>

                  {optimizationSummary ? (
                    <View
                      style={[
                        styles.personalizationSummaryCard,
                        {
                          backgroundColor: isDark
                            ? "rgba(8, 47, 73, 0.58)"
                            : "rgba(236, 253, 245, 0.9)",
                          borderColor: isDark
                            ? "rgba(34, 211, 238, 0.16)"
                            : "rgba(16, 185, 129, 0.12)",
                        },
                      ]}
                    >
                      <Ionicons
                        name="sparkles-outline"
                        size={14}
                        color={isDark ? "#67E8F9" : "#0F766E"}
                      />
                      <Text
                        style={[
                          styles.personalizationSummaryText,
                          { color: textColor },
                        ]}
                      >
                        {optimizationSummary}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.personalizationList}>
                    {highlights.map((highlight) => (
                      <View
                        key={highlight.id}
                        style={[
                          styles.personalizationItem,
                          {
                            backgroundColor: isDark
                              ? "rgba(30, 41, 59, 0.9)"
                              : "rgba(248, 250, 252, 0.96)",
                            borderColor: isDark
                              ? "rgba(148, 163, 184, 0.14)"
                              : "rgba(226, 232, 240, 0.9)",
                          },
                        ]}
                      >
                        <Ionicons
                          name={
                            highlight.icon as keyof typeof Ionicons.glyphMap
                          }
                          size={16}
                          color={isDark ? "#5EEAD4" : "#0F766E"}
                        />
                        <View style={styles.personalizationItemText}>
                          <Text
                            style={[
                              styles.personalizationItemTitle,
                              { color: textColor },
                            ]}
                          >
                            {highlight.stationName}
                          </Text>
                          <Text
                            style={[
                              styles.personalizationItemSubtitle,
                              { color: subtextColor },
                            ]}
                          >
                            {highlight.title}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: textColor }]}>
                  Rota akışı
                </Text>
                <Text
                  style={[styles.sectionSubtitle, { color: subtextColor }]}
                >
                  Duraklar ve beklenen enerji geçişleri
                </Text>
              </View>

              <View style={styles.timeline}>
                {locations.map((loc, idx) => {
                  const isLast = idx === locations.length - 1;
                  const nextLoc =
                    idx < locations.length - 1 ? locations[idx + 1] : null;

                  return (
                    <React.Fragment key={`${loc.type}-${loc.name}-${idx}`}>
                      <View style={styles.timelineRow}>
                        <TimelineDot type={loc.type} />
                        <Text
                          style={[
                            styles.locationName,
                            { color: textColor },
                            loc.type === "destination" && styles.locationNameBold,
                          ]}
                          numberOfLines={2}
                        >
                          {loc.name}
                        </Text>
                      </View>

                      {loc.type === "station" ? (
                        <StationCard location={loc} isDark={isDark} />
                      ) : null}

                      {!isLast && nextLoc ? (
                        <TimelineSegment
                          duration={getSegmentDuration(loc, nextLoc)}
                          distance={getSegmentDistance(loc, nextLoc)}
                          weather={loc.weather}
                          batteryFrom={getSegmentBatteryFrom(loc)}
                          batteryTo={getSegmentBatteryTo(loc, nextLoc)}
                          isDark={isDark}
                        />
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </View>
            </>
          ) : (
            <>
              <View style={styles.stationPanelHeader}>
                <Pressable
                  onPress={() => animatePanelChange("overview", "backward")}
                  style={({ pressed }) => [
                    styles.stationBackButton,
                    { opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Ionicons name="chevron-back" size={18} color={textColor} />
                </Pressable>
                <View style={styles.stationPanelCopy}>
                  <Text
                    style={[styles.stationPanelTitle, { color: textColor }]}
                  >
                    Şarj noktaları
                  </Text>
                  <Text
                    style={[
                      styles.stationPanelSubtitle,
                      { color: subtextColor },
                    ]}
                  >
                    Dolum planı ve istasyon detayları
                  </Text>
                </View>
              </View>

              {hasStations ? (
                <View style={styles.stationDetailList}>
                  {stationLocations.map((location, index) => (
                    <StationDetailCard
                      key={`${location.name}-${index}`}
                      location={location}
                      isDark={isDark}
                    />
                  ))}
                </View>
              ) : (
                <View
                  style={[
                    styles.emptyStationCard,
                    {
                      backgroundColor: isDark ? COLORS.cardBgDark : COLORS.cardBg,
                      borderColor: isDark ? COLORS.borderDark : COLORS.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="battery-dead-outline"
                    size={24}
                    color={subtextColor}
                  />
                  <Text
                    style={[styles.emptyStationTitle, { color: textColor }]}
                  >
                    Şarj durağı gerekmiyor
                  </Text>
                  <Text
                    style={[styles.emptyStationBody, { color: subtextColor }]}
                  >
                    Bu rota için ek şarj noktası planlanmadı.
                  </Text>
                </View>
              )}
            </>
          )}
        </Animated.View>

        <View style={styles.footer}>
          <Text
            style={[
              styles.footerText,
              {
                color: isDark
                  ? COLORS.textSecondaryDark
                  : COLORS.textSecondary,
              },
            ]}
          >
            Electrip Maps © 2026
          </Text>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    zIndex: 20000,
    elevation: 80,
  },
  sheetBackground: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
  handleIndicator: {
    width: 44,
    height: 4,
    borderRadius: 999,
  },
  scrollContent: {
    paddingBottom: 60,
  },
  energyHero: {
    marginHorizontal: 12,
    marginBottom: 16,
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
    gap: 16,
  },
  energyHeroHeader: {
    gap: 10,
    alignItems: "flex-start",
  },
  energyHeroEyebrow: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontWeight: "700",
  },
  energyHeroTitle: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  energyHeroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  energyHeroPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0369A1",
  },
  energyHeroStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  energyHeroStatCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  energyHeroArrowWrap: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  energyHeroStatLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  energyHeroStatValue: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  energyTrackBlock: {
    gap: 8,
  },
  energyTrackBackground: {
    height: 12,
    borderRadius: 999,
    overflow: "hidden",
  },
  energyTrackFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: COLORS.batteryFrom,
  },
  energyTrackMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  energyTrackLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  energyTrackPercent: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.batteryFrom,
  },
  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  summaryIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTextContainer: {
    flex: 1,
    gap: 2,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "800",
  },
  personalizationPanel: {
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  personalizationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  personalizationIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  personalizationCopy: {
    flex: 1,
    gap: 2,
  },
  personalizationBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  personalizationBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  personalizationTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  personalizationSubtitle: {
    fontSize: 12,
    fontWeight: "500",
  },
  personalizationSummaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  personalizationSummaryText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  personalizationList: {
    gap: 10,
  },
  personalizationItem: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  personalizationItemText: {
    flex: 1,
    gap: 2,
  },
  personalizationItemTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  personalizationItemSubtitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  sectionHeader: {
    paddingHorizontal: 12,
    marginTop: 20,
    marginBottom: 10,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: "500",
  },
  timeline: {
    paddingHorizontal: 12,
    marginTop: 4,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  locationName: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    letterSpacing: -0.2,
  },
  locationNameBold: {
    fontSize: 17,
    fontWeight: "800",
  },
  segmentContainer: {
    flexDirection: "row",
    minHeight: 70,
  },
  segmentLineContainer: {
    width: 28,
    alignItems: "center",
  },
  segmentVerticalLine: {
    flex: 1,
    width: 0,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  segmentInfoContainer: {
    flex: 1,
    paddingLeft: 16,
    paddingVertical: 10,
    justifyContent: "center",
    gap: 6,
  },
  segmentMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  segmentTravelText: {
    fontSize: 14,
    fontWeight: "700",
  },
  segmentWeatherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  segmentWeatherIcon: {
    width: 22,
    height: 22,
  },
  segmentWeatherText: {
    fontSize: 13,
    fontWeight: "600",
  },
  segmentBatteryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  segmentBatteryText: {
    fontSize: 14,
    fontWeight: "800",
  },
  segmentArrowIcon: {
    opacity: 0.65,
  },
  stationCard: {
    marginLeft: 44,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  stationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  stationNameContainer: {
    flex: 1,
    gap: 6,
  },
  stationName: {
    fontSize: 14,
    fontWeight: "800",
  },
  stationBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  stationTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  stationTypeBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0EA5E9",
  },
  stationBrandText: {
    fontSize: 11,
    fontWeight: "600",
  },
  stationPowerPill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stationPowerText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#B45309",
  },
  stationFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
  },
  stationBatteryInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stationBatteryText: {
    fontSize: 15,
    fontWeight: "800",
  },
  stationArrowIcon: {
    opacity: 0.55,
  },
  stationChargeTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stationChargeText: {
    fontSize: 14,
    fontWeight: "800",
  },
  highlightCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  highlightIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  highlightTextWrap: {
    flex: 1,
    gap: 4,
  },
  highlightMetaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  highlightPremiumBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  highlightPremiumText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  highlightTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  highlightPoi: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  highlightMessage: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  stationPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  stationBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148,163,184,0.12)",
  },
  stationPanelCopy: {
    flex: 1,
    gap: 2,
  },
  stationPanelTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  stationPanelSubtitle: {
    fontSize: 13,
    fontWeight: "500",
  },
  stationDetailList: {
    paddingHorizontal: 12,
    gap: 14,
  },
  detailCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 3,
  },
  detailTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  detailTitleWrap: {
    flex: 1,
    gap: 4,
  },
  detailTitle: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  detailAddress: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  detailTypePill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  detailTypeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#2563EB",
  },
  detailMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  detailMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.08)",
  },
  detailMetaText: {
    fontSize: 12,
    fontWeight: "700",
  },
  detailEnergyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  detailEnergyMetric: {
    width: "48%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "rgba(148,163,184,0.08)",
    gap: 4,
  },
  detailEnergyLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  detailEnergyValue: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  detailAiCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  detailAiCopy: {
    flex: 1,
    gap: 4,
  },
  detailAiTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  detailAiBody: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  emptyStationCard: {
    marginHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyStationTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  emptyStationBody: {
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 18,
  },
  footer: {
    alignItems: "center",
    paddingVertical: 32,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
    marginTop: 20,
    marginHorizontal: 20,
  },
  footerText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    opacity: 0.5,
  },
});
