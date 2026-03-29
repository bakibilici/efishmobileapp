import React, { useMemo, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useTheme } from "../context/ThemeContext";
import { DriveSessionStore, RoutePlanLocation } from "../services/DriveSessionStore";

// ── Color constants ──
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

// ── Battery Bar ──
const BatteryBar = ({ locations }: { locations: RoutePlanLocation[] }) => {
  if (!locations || locations.length < 2) return null;
  
  const originBattery = locations[0]?.battery_status?.from || 100;
  const destBattery = locations[locations.length - 1]?.battery_status?.to || 0;
  const consumedPct = originBattery - destBattery;
  
  return (
    <View style={batteryStyles.container}>
      <View style={batteryStyles.labelsRow}>
         <Text style={batteryStyles.labelText}>Başlangıç: <Text style={batteryStyles.labelValue}>%{originBattery}</Text></Text>
         <Text style={batteryStyles.labelText}>Varış (Tahmini): <Text style={batteryStyles.labelValue}>%{destBattery}</Text></Text>
      </View>
      <View style={batteryStyles.barBg}>
        {/* Remaining battery (green/teal) */}
        <View style={[batteryStyles.barFill, { width: `${destBattery}%`, backgroundColor: COLORS.batteryFrom }]} />
        {/* Consumed portion (red/orange) */}
        <View style={[batteryStyles.barConsumed, { width: `${consumedPct}%`, backgroundColor: COLORS.batteryTo }]} />
      </View>
    </View>
  );
};

const batteryStyles = StyleSheet.create({
  container: { paddingHorizontal: 20, marginBottom: 16 },
  labelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  labelText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  labelValue: {
    color: COLORS.textPrimary,
    fontWeight: "700",
  },
  barBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E2E8F0",
    flexDirection: "row",
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 4 },
  barConsumed: { height: "100%" },
});

// ── Summary Card ──
const SummaryCard = ({
  icon,
  label,
  value,
  isDark,
  iconColor = COLORS.primary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  isDark: boolean;
  iconColor?: string;
}) => (
  <View style={[summaryStyles.card, { backgroundColor: isDark ? COLORS.cardBgDark : COLORS.cardBg, borderColor: isDark ? COLORS.borderDark : COLORS.border }]}>
    <View style={[summaryStyles.iconContainer, { backgroundColor: iconColor + "15" }]}>
      <Ionicons name={icon} size={20} color={iconColor} />
    </View>
    <View style={summaryStyles.textContainer}>
      <Text style={[summaryStyles.label, { color: isDark ? COLORS.textSecondaryDark : COLORS.textSecondary }]}>{label}</Text>
      <Text style={[summaryStyles.value, { color: isDark ? COLORS.textPrimaryDark : COLORS.textPrimary }]}>{value}</Text>
    </View>
  </View>
);

const summaryStyles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: { flex: 1, gap: 2 },
  label: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  value: { fontSize: 16, fontWeight: "800" },
});

// ── Timeline Dot ──
const TimelineDot = ({ type }: { type: 'origin' | 'station' | 'destination' }) => {
  const color = type === 'station' ? COLORS.station : COLORS.origin;
  const iconName =
    type === "origin"
      ? "navigate"
      : type === "station"
        ? "flash"
        : "flag";
  return (
    <View style={[timelineStyles.dot, { backgroundColor: color }]}>
      <Ionicons name={iconName} size={13} color="#FFFFFF" />
    </View>
  );
};

const timelineStyles = StyleSheet.create({
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
});

// ── Timeline Segment (the dashed line + travel info between stops) ──
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
    <View style={segmentStyles.container}>
      <View style={segmentStyles.lineContainer}>
        <View style={[segmentStyles.verticalLine, { borderColor: COLORS.timeline }]} />
      </View>
      
      <View style={segmentStyles.infoContainer}>
        <View style={segmentStyles.mainRow}>
          <Text style={[segmentStyles.travelText, { color: textColor }]}>
            {duration} dk - {distance} km
          </Text>
          {weather && (
            <View style={segmentStyles.weatherRow}>
              <Image source={{ uri: weather.icon }} style={segmentStyles.weatherIcon} />
              <Text style={[segmentStyles.weatherText, { color: subtextColor }]}>{weather.temp}°</Text>
            </View>
          )}
        </View>

        <View style={segmentStyles.batteryRow}>
          <Text style={[segmentStyles.batteryText, { color: COLORS.batteryFrom }]}>
            {batteryFrom}%
          </Text>
          <Ionicons
            name="arrow-forward"
            size={14}
            color={subtextColor}
            style={segmentStyles.arrowIcon}
          />
          <Text style={[segmentStyles.batteryText, { color: COLORS.batteryTo }]}>
            {batteryTo}%
          </Text>
        </View>
      </View>
    </View>
  );
};

const segmentStyles = StyleSheet.create({
  container: { flexDirection: "row", minHeight: 70 },
  lineContainer: {
    width: 28,
    alignItems: "center",
  },
  verticalLine: {
    flex: 1,
    width: 0,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
  },
  infoContainer: {
    flex: 1,
    paddingLeft: 16,
    paddingVertical: 10,
    justifyContent: "center",
    gap: 6,
  },
  mainRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  travelText: { fontSize: 14, fontWeight: "700" },
  weatherRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  weatherIcon: { width: 22, height: 22 },
  weatherText: { fontSize: 13, fontWeight: "600" },
  batteryRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  batteryText: { fontSize: 14, fontWeight: "800" },
  arrowIcon: { opacity: 0.65 },
});

// ── Station Card (for charging stops) ──
const StationCard = ({
  location,
  isDark,
}: {
  location: RoutePlanLocation;
  isDark: boolean;
}) => {
  const bgColor = isDark ? COLORS.cardBgDark : COLORS.cardBg;
  const borderColor = isDark ? COLORS.borderDark : COLORS.border;
  const textColor = isDark ? COLORS.textPrimaryDark : COLORS.textPrimary;
  const subtextColor = isDark ? COLORS.textSecondaryDark : COLORS.textSecondary;

  return (
    <View style={[stationStyles.card, { backgroundColor: bgColor, borderColor }]}>
      <View style={stationStyles.header}>
        <View style={stationStyles.nameContainer}>
          <Text style={[stationStyles.name, { color: textColor }]} numberOfLines={2}>
            {location.name}
          </Text>
          <View style={stationStyles.badgeRow}>
             {location.dc_count ? (
               <View style={[stationStyles.dcBadge, { backgroundColor: COLORS.batteryCharge + "15" }]}>
                 <Text style={[stationStyles.dcText, { color: COLORS.batteryCharge }]}>DC</Text>
               </View>
             ) : null}
             {location.brand && (
               <Text style={[stationStyles.brandText, { color: subtextColor }]}>{location.brand}</Text>
             )}
          </View>
        </View>
        <Image 
          source={{ uri: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Zorlu_Energy_Solutions_Logo.png/640px-Zorlu_Energy_Solutions_Logo.png" }} 
          style={stationStyles.brandLogo} 
          resizeMode="contain"
        />
      </View>
      <View style={stationStyles.footer}>
        <View style={stationStyles.batteryInfo}>
          <Text style={[stationStyles.batteryText, { color: COLORS.batteryTo }]}>
            {location.battery_status?.from}%
          </Text>
          <Ionicons
            name="arrow-forward"
            size={14}
            color={subtextColor}
            style={stationStyles.arrowIcon}
          />
          <Text style={[stationStyles.batteryText, { color: COLORS.batteryCharge }]}>
            {location.battery_status?.to}%
          </Text>
        </View>
        {location.charge_duration ? (
          <View style={stationStyles.chargeTime}>
             <View style={[stationStyles.chargeIconContainer, { backgroundColor: COLORS.station + "15" }]}>
                <Ionicons
                  name="flash"
                  size={12}
                  color={COLORS.station}
                />
             </View>
            <Text style={[stationStyles.chargeText, { color: textColor }]}>
              {location.charge_duration} dk
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};

const stationStyles = StyleSheet.create({
  card: {
    marginLeft: 44,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nameContainer: { flex: 1, marginRight: 8, gap: 4 },
  name: { fontSize: 13, fontWeight: "700" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dcBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  dcText: { fontSize: 10, fontWeight: "800" },
  brandText: { fontSize: 11, fontWeight: "600" },
  brandLogo: { width: 40, height: 20 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
  },
  batteryInfo: { flexDirection: "row", alignItems: "center", gap: 4 },
  batteryText: { fontSize: 15, fontWeight: "800" },
  arrowIcon: { opacity: 0.55 },
  chargeTime: { flexDirection: "row", alignItems: "center", gap: 6 },
  chargeIconContainer: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  chargeText: { fontSize: 14, fontWeight: "800" },
});

// ══════════════════════════════════════════════════════════
// RoutePlanSheet — Main Export
// ══════════════════════════════════════════════════════════
export function RoutePlanSheet({
  onSheetIndexChange,
}: {
  onSheetIndexChange?: (index: number) => void;
}) {
  const { themeScheme } = useTheme();
  const isDark = themeScheme === "dark";
  const bottomSheetRef = useRef<BottomSheet>(null);
  const lastHandledRouteIdRef = useRef<string | null>(null);
  
  const snapPoints = useMemo(() => ["15%", "55%", "85%"], []);

  // Use state to make the component reactive to store changes
  const [routePlanData, setRoutePlanData] = React.useState(DriveSessionStore.getRoutePlanData());

  const handleSheetChange = useCallback((index: number) => {
    onSheetIndexChange?.(index);
    if (index === -1) {
      // Sheet dismissed — nothing special for now
    }
  }, [onSheetIndexChange]);

  // Listen for data changes to auto-open and re-render
  useEffect(() => {
    const unsub = DriveSessionStore.onStateChange(() => {
      const context = DriveSessionStore.getContext();
      const planData = context?.routePlanData;
      const currentRouteId = context?.route?.routeId || null;

      setRoutePlanData(planData); // Trigger re-render
      
      if (planData && currentRouteId && currentRouteId !== lastHandledRouteIdRef.current) {
        lastHandledRouteIdRef.current = currentRouteId;
        
        // Snap to the middle snap point (55%) only when a FRESH route arrives
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

  if (!routePlanData) {
    // console.log("[RoutePlanSheet] No routePlanData, rendering null");
    return null;
  }

  const { locations, summary } = routePlanData;
  if (!locations || locations.length < 2) {
    // console.log("[RoutePlanSheet] Insufficient locations, rendering null");
    return null;
  }

  const textColor = isDark ? COLORS.textPrimaryDark : COLORS.textPrimary;
  const surfaceBg = isDark ? COLORS.surfaceBgDark : COLORS.surfaceBg;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={1}
      snapPoints={snapPoints}
      onChange={handleSheetChange}
      enablePanDownToClose={false}
      backgroundStyle={[styles.sheetBackground, { backgroundColor: surfaceBg }]}
      handleIndicatorStyle={[styles.handleIndicator, { backgroundColor: isDark ? "#475569" : "#CBD5E1" }]}
      style={styles.sheet}
    >
      <BottomSheetScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Battery Bar */}
        <BatteryBar locations={locations} />

        {/* Summary Cards Row 1 */}
        <View style={styles.summaryRow}>
          <SummaryCard
            icon="time-outline"
            label="Sürüş süresi"
            value={`${summary.total_travel_duration} dk`}
            isDark={isDark}
            iconColor="#06B6D4" // Cyan
          />
          <SummaryCard
            icon="resize-outline"
            label="Toplam mesafe"
            value={`${summary.total_travel_length} km`}
            isDark={isDark}
            iconColor="#3B82F6" // Blue
          />
        </View>

        {/* Summary Cards Row 2 */}
        <View style={styles.summaryRow}>
          <SummaryCard
            icon="flash-outline"
            label="Şarj süresi"
            value={summary.total_charge_duration > 0 ? `${summary.total_charge_duration} dk` : "—"}
            isDark={isDark}
            iconColor="#F59E0B" // Amber
          />
          <SummaryCard
            icon="battery-charging-outline"
            label="Şarj noktası"
            value={`${summary.total_station_count}`}
            isDark={isDark}
            iconColor="#6366F1" // Indigo
          />
        </View>

        {/* Timeline */}
        <View style={styles.timeline}>
          {locations.map((loc, idx) => {
            const isLast = idx === locations.length - 1;
            const nextLoc = idx < locations.length - 1 ? locations[idx + 1] : null;
            
            return (
              <React.Fragment key={idx}>
                {/* Location dot + name */}
                <View style={styles.timelineRow}>
                  <TimelineDot type={loc.type} />
                  <Text
                    style={[
                      styles.locationName,
                      { color: textColor },
                      loc.type === 'destination' && styles.locationNameBold,
                    ]}
                    numberOfLines={2}
                  >
                    {loc.name}
                  </Text>
                </View>

                {/* Station card (only for charging stops) */}
                {loc.type === 'station' && (
                  <StationCard location={loc} isDark={isDark} />
                )}

                {/* Segment between this location and the next */}
                {!isLast && nextLoc && (
                  <TimelineSegment
                    duration={nextLoc.travel_duration || loc.travel_duration || 0}
                    distance={nextLoc.travel_length || loc.travel_length || 0}
                    weather={loc.weather}
                    batteryFrom={loc.battery_status?.to ?? loc.battery_status?.from ?? 0}
                    batteryTo={nextLoc.battery_status?.from ?? 0}
                    isDark={isDark}
                  />
                )}
              </React.Fragment>
            );
          })}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: isDark ? COLORS.textSecondaryDark : COLORS.textSecondary }]}>
            Electrip Maps © 2026
          </Text>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    zIndex: 2000,
    elevation: 20,
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
  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 12,
  },
  timeline: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
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
  footer: {
    alignItems: "center",
    paddingVertical: 32,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
    marginTop: 20,
    marginHorizontal: 40,
  },
  footerText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    opacity: 0.5,
  },
});
