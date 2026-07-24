import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  StyleSheet as RNStyleSheet,
} from "react-native";
import { BlurView } from "expo-blur";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { DriveSessionStore, DriveSessionState } from "../services/DriveSessionStore";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ── Battery Selector Component ──
const BatterySelector = ({ 
  label, 
  value, 
  onValueChange, 
  isDark, 
  colors 
}: { 
  label: string; 
  value: number; 
  onValueChange: (val: number) => void;
  isDark: boolean;
  colors: any;
}) => {
  const handleDecrement = () => {
    onValueChange(Math.max(0, value - 5));
  };
  const handleIncrement = () => {
    onValueChange(Math.min(100, value + 5));
  };

  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: isDark ? "#A1A1AA" : "#71717A", marginBottom: 8 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? "#121214" : "#F4F4F5", borderRadius: 12, padding: 6 }}>
        <TouchableOpacity 
          onPress={handleDecrement}
          activeOpacity={0.7}
          style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: isDark ? "#27272A" : "#E4E4E7", justifyContent: 'center', alignItems: 'center' }}
        >
          <Ionicons name="remove" size={20} color={isDark ? "#FFF" : "#000"} />
        </TouchableOpacity>
        
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: colors.primary }}>%{value}</Text>
        </View>

        <TouchableOpacity 
          onPress={handleIncrement}
          activeOpacity={0.7}
          style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}
        >
          <Ionicons name="add" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export function DrivingBatterySettingsModal() {
  const { colors, themeScheme } = useTheme();
  const isDark = themeScheme === "dark";
  const [isVisible, setIsVisible] = useState(false);
  
  // Battery preferences state
  const [startBattery, setStartBattery] = useState(75);
  const [arrivalBattery, setArrivalBattery] = useState(10);
  
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);

  const resetState = useCallback(() => {
    opacity.value = 0;
    scale.value = 0.9;
  }, [opacity, scale]);

  useEffect(() => {
    const unsub = DriveSessionStore.onStateChange((state) => {
      if (state === DriveSessionState.PROMPTING) {
        const p = DriveSessionStore.getBatteryPreferences();
        setStartBattery(p.start);
        setArrivalBattery(p.arrival);
        setIsVisible(true);
        opacity.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) });
        scale.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.exp) });
      } else if (state === DriveSessionState.CAR_SESSION_ACTIVE) {
        setIsVisible(false);
        resetState();
      } else {
        if (isVisible && state === DriveSessionState.IDLE) {
          setIsVisible(false);
          resetState();
        }
      }
    });
    return unsub;
  }, [isVisible, resetState, opacity, scale]);

  const handleStartAtlas = () => {
    // 1. Save preferences
    DriveSessionStore.setBatteryPreferences(startBattery, arrivalBattery);
    
    // 2. Start the session (this will hide the modal and trigger Atlas)
    DriveSessionStore.startSession();
  };

  const handleDismiss = () => {
    DriveSessionStore.endSession();
  };

  const animatedContentStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!isVisible) return null;

  return (
    <Modal transparent visible={isVisible} animationType="none">
      <View style={styles.overlay}>
        <BlurView intensity={30} tint={isDark ? "dark" : "light"} style={RNStyleSheet.absoluteFill} />
        
        <Animated.View style={[
          styles.modalContent, 
          { backgroundColor: isDark ? "rgba(28, 28, 30, 0.92)" : "rgba(255, 255, 255, 0.95)" },
          animatedContentStyle
        ]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Sürüş Öncesi Hazırlık</Text>
            <View style={styles.iconContainer}>
               <Ionicons name="battery-charging" size={32} color={colors.primary} />
            </View>
          </View>

          <View style={styles.descriptionContainer}>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Şu anki şarjınızı ve varışta hedeflediğiniz şarjı belirleyin. Rota detaylarını birazdan Atlas&apos;a sesli olarak söyleyebilirsiniz.
            </Text>
          </View>

          <View style={styles.preferencesSection}>
            <BatterySelector 
              label="Başlangıç Pil Durumu"
              value={startBattery}
              onValueChange={setStartBattery}
              isDark={isDark}
              colors={colors}
            />
            <BatterySelector 
              label="Varış Noktası Durumu"
              value={arrivalBattery}
              onValueChange={setArrivalBattery}
              isDark={isDark}
              colors={colors}
            />
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.actionButton, styles.dismissButton]} onPress={handleDismiss}>
              <Text style={styles.dismissText}>İptal</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.actionButton, styles.goButton, { backgroundColor: colors.primary }]} onPress={handleStartAtlas}>
              <Text style={styles.goText}>Sürüşü Başlat</Text>
              <Ionicons name="mic" size={20} color="#fff" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalContent: {
    width: SCREEN_WIDTH * 0.9,
    borderRadius: 40,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
    overflow: "visible",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  iconContainer: {
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  descriptionContainer: {
    marginBottom: 24,
  },
  description: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "500",
  },
  preferencesSection: {
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    height: 56,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  dismissButton: {
    backgroundColor: "rgba(120, 120, 128, 0.16)",
  },
  goButton: {
  },
  dismissText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#8E8E93",
  },
  goText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
});
