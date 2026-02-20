import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs, useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, DeviceEventEmitter, Image, Pressable, View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { useTheme } from "@/context/ThemeContext";
import { Profile, SmartCar } from "iconsax-react-native";



export default function TabLayout() {
  const { colors, themeScheme } = useTheme();
  const router = useRouter();

  const isDark = themeScheme === 'dark';

  const tabBarAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('toggleBottomSheet', (isOpen: boolean) => {
      Animated.timing(tabBarAnim, {
        toValue: isOpen ? 150 : 0, // Slide down out of view
        duration: 350,
        useNativeDriver: true,
      }).start();
    });

    return () => sub.remove();
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
          backgroundColor: isDark ? "rgba(30, 30, 30, 0.85)" : "rgba(255, 255, 255, 0.95)", // Semi-transparent for glass effect
          borderTopWidth: 0,
          elevation: 0, // Remove heavy shadow for cleaner look
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.03, // Very subtle shadow
          shadowRadius: 8,
          height: 96, // Taller and spacious
          paddingTop: 10,
          paddingBottom: 34, // Safe area
          borderTopLeftRadius: 10, // More rounded
          borderTopRightRadius: 10,
          transform: [{ translateY: tabBarAnim }]
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
        options={({ navigation }) => ({
          title: "Sessions",
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
            <SmartCar size={28} variant={focused ? "Bold" : "Outline"} color={color} />
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
                width: 54,
                height: 54,
                borderRadius: 27,
                backgroundColor: focused ? colors.primary : colors.card,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: focused ? colors.primary : "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: focused ? 0.3 : 0.05,
                shadowRadius: 8,
                elevation: focused ? 6 : 2,
                overflow: "hidden",
              }}
            >
              <Image
                source={require("@/assets/images/efishjuste.png")}
                style={{
                  width: 64,
                  height: 64,
                  resizeMode: "contain",
                  tintColor: focused ? "#fff" : undefined,
                }}
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
            <Profile size={28} variant={focused ? "Bold" : "Outline"} color={color} />
          ),
        })}
      />
    </Tabs >
  );
}
