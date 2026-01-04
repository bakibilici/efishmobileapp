import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        tabBarActiveTintColor: "#0f2f4f",
        tabBarInactiveTintColor: "#9aa5b3",
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
          backgroundColor: "#ffffff",
          borderTopWidth: 0,
          shadowColor: "#000",
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
        name="index"
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
              onPress={() => navigation.navigate("index")}
              style={{ paddingHorizontal: 4 }}
            >
              <Ionicons name="chevron-back" size={24} color="#0f2f4f" />
            </Pressable>
          ),
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
                shadowColor: "#000",
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
              onPress={() => navigation.navigate("index")}
              style={{ paddingHorizontal: 4 }}
            >
              <Ionicons name="chevron-back" size={24} color="#0f2f4f" />
            </Pressable>
          ),
          tabBarIcon: ({ color }) => (
            <Ionicons size={26} name="person-circle" color={color} />
          ),
        })}
      />
    </Tabs>
  );
}
