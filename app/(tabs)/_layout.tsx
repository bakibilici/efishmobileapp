import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { useTheme } from "@/context/ThemeContext";

export default function TabLayout() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Tabs
      initialRouteName="mainpage"
      screenOptions={{
        tabBarActiveTintColor: colors.tabIconSelected,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: {
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 16,
          height: 70,
          borderRadius: 999,
          paddingVertical: 42,
          marginBottom: 24,
          marginHorizontal: 12,
          backgroundColor: colors.card,
          borderTopWidth: 0,
          shadowColor: colors.shadow,
          shadowOpacity: 0.14,
          shadowOffset: { width: 0, height: 14 },
          shadowRadius: 24,
          elevation: 18,
        },
        tabBarItemStyle: { paddingVertical: 6 },
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: { fontWeight: "800", fontSize: 12 },
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
          tabBarIcon: ({ color }) => (
            <Ionicons size={26} name="flash" color={color} />
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
                width: focused ? 72 : 64,
                height: focused ? 72 : 64,
                borderRadius: 999,
                backgroundColor: "transparent",
                alignItems: "center",
                justifyContent: "center",
                shadowColor: colors.shadow,
                shadowOpacity: focused ? 0.12 : 0.06,
                shadowOffset: { width: 0, height: 8 },
                shadowRadius: 12,
                elevation: focused ? 8 : 2,
                transform: [{ translateY: -25 }],
              }}
            >
              <Image
                source={require("@/assets/images/efishjuste.png")}
                style={{
                  width: 65,
                  height: 65,
                  resizeMode: "contain",
                  borderRadius: 999,
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
          tabBarIcon: ({ color }) => (
            <Ionicons size={26} name="person-circle" color={color} />
          ),
        })}
      />
    </Tabs>
  );
}
