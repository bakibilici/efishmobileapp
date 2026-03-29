import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs, useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  DeviceEventEmitter,
  Image,
  Platform,
  Pressable,
  View,
} from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { useTheme } from "@/context/ThemeContext";
import { Profile, SmartCar } from "iconsax-react-native";

import { DriveSessionStore, DriveSessionState } from "@/services/DriveSessionStore";

export default function TabLayout() {
  const { colors, themeScheme } = useTheme();
  const router = useRouter();

  const isDark = themeScheme === "dark";

  const tabBarAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      "toggleBottomSheet",
      (isOpen: boolean) => {
        Animated.timing(tabBarAnim, {
          toValue: isOpen ? 150 : 0,
          duration: 350,
          useNativeDriver: true,
        }).start();
      },
    );

    const unsubDrive = DriveSessionStore.onStateChange((state) => {
      const isCarMode = state !== DriveSessionState.IDLE && state !== DriveSessionState.PROMPTING;
      Animated.timing(tabBarAnim, {
        toValue: isCarMode ? 200 : 0,
        duration: 500,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      sub.remove();
      unsubDrive();
    };
  }, [tabBarAnim]);

  return (
    <Tabs
      initialRouteName="mainpage"
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: isDark
            ? "rgba(30, 30, 30, 0.85)"
            : "rgba(255, 255, 255, 0.95)", // Semi-transparent for glass effect
          borderTopWidth: 0,
          elevation: 0, // Remove heavy shadow for cleaner look
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.03, // Very subtle shadow
          shadowRadius: 8,
          height: Platform.OS === "ios" ? 106 : 96, // Taller and spacious
          paddingTop: 10,
          paddingBottom: Platform.OS === "ios" ? 34 : 16, // Safe area for system nav bar
          borderTopLeftRadius: 24, // More rounded
          borderTopRightRadius: 24,
          transform: [{ translateY: tabBarAnim }],
        },
        tabBarItemStyle: { paddingVertical: 4 },
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: { fontWeight: "600", fontSize: 12, marginTop: 16 },
      }}
    >
      <Tabs.Screen
        name="mainpage"
        options={{
          tabBarButton: () => null,
          tabBarItemStyle: { width: 0, display: "none" },
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={() => ({
          title: "Sessions",
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <SmartCar
              size={28}
              variant={focused ? "Bold" : "Outline"}
              color={color}
            />
          ),
        })}
      />
      <Tabs.Screen
        name="start"
        listeners={() => ({
          tabPress: (e) => {
            e.preventDefault();
            router.push("/qr-scanner");
          },
        })}
        options={{
          title: "Start",
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: focused ? colors.primary : colors.card,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: focused ? colors.primary : "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: focused ? 0.3 : 0.05,
                shadowRadius: 8,
                elevation: focused ? 6 : 2,
                overflow: "visible",
                marginTop: -20, // Make it pop out of the tab bar
              }}
            >
              <Image
                source={require("../../assets/images/app_logo.png")}
                style={{
                  width: 36,
                  height: 36,
                  tintColor: focused ? "#fff" : colors.primary,
                }}
                resizeMode="contain"
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={({ navigation }) => ({
          title: "Profile",
          headerShown: true,
          headerTitle: "",
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable
              hitSlop={12}
              onPress={() => navigation.navigate("mainpage")}
              style={{ paddingHorizontal: 4 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
          ),
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          tabBarIcon: ({ color, focused }) => (
            <Profile
              size={28}
              variant={focused ? "Bold" : "Outline"}
              color={color}
            />
          ),
        })}
      />
    </Tabs>
  );
}
