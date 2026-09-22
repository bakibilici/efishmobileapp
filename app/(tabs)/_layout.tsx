import { Tabs, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Animated, DeviceEventEmitter, Keyboard, Platform } from "react-native";

import { GlassTabBar } from "@/components/navigation/GlassTabBar";
import { DriveSessionStore, DriveSessionState } from "@/services/DriveSessionStore";

/** Car mode covers the map from the start of a drive; the bar goes further down to stay out of it. */
const DRIVING_OFFSET = 200;
const COVERED_OFFSET = 150;
const DRIVING_SLIDE_MS = 500;
const COVERED_SLIDE_MS = 350;

const isDriving = (state: DriveSessionState) =>
  state !== DriveSessionState.IDLE && state !== DriveSessionState.PROMPTING;

export default function TabLayout() {
  const router = useRouter();

  // Why the bar is away, kept apart so one reason ending (a sheet closing)
  // cannot bring the bar back while another (a drive) still holds.
  const [driving, setDriving] = useState(() => isDriving(DriveSessionStore.getState()));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [keyboardUp, setKeyboardUp] = useState(false);

  const offset = driving ? DRIVING_OFFSET : sheetOpen || keyboardUp ? COVERED_OFFSET : 0;
  const hidden = offset > 0;

  const [tabBarAnim] = useState(() => new Animated.Value(offset));
  const lastDriving = useRef(driving);

  useEffect(() => {
    const sheetSub = DeviceEventEmitter.addListener("toggleBottomSheet", (isOpen: boolean) =>
      setSheetOpen(!!isOpen),
    );
    const unsubDrive = DriveSessionStore.onStateChange((state) => setDriving(isDriving(state)));
    // Android: with edge-to-edge on, the window does not resize for the
    // keyboard, so the keyboard covers the bar as on iOS. It still steps
    // aside, as before, so TalkBack does not reach it under the keyboard.
    const keyboardSubs =
      Platform.OS === "android"
        ? [
            Keyboard.addListener("keyboardDidShow", () => setKeyboardUp(true)),
            Keyboard.addListener("keyboardDidHide", () => setKeyboardUp(false)),
          ]
        : [];

    return () => {
      sheetSub.remove();
      unsubDrive();
      keyboardSubs.forEach((sub) => sub.remove());
    };
  }, []);

  useEffect(() => {
    const drivingChanged = lastDriving.current !== driving;
    lastDriving.current = driving;
    Animated.timing(tabBarAnim, {
      toValue: offset,
      duration: drivingChanged ? DRIVING_SLIDE_MS : COVERED_SLIDE_MS,
      useNativeDriver: true,
    }).start();
  }, [offset, driving, tabBarAnim]);

  return (
    <Tabs
      initialRouteName="mainpage"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <GlassTabBar
          {...props}
          translateY={tabBarAnim}
          hidden={hidden}
          onStartPress={() => router.push("/qr-scanner")}
        />
      )}
    >
      <Tabs.Screen name="mainpage" options={{ title: "Sürüş" }} />
      <Tabs.Screen name="sessions" options={{ title: "Oturumlar" }} />
      {/* Never drawn as a tab: the bar's QR circle starts a charge. Kept for its route. */}
      <Tabs.Screen
        name="start"
        listeners={() => ({
          tabPress: (e) => {
            e.preventDefault();
            router.push("/qr-scanner");
          },
        })}
        options={{ title: "Başlat" }}
      />
      <Tabs.Screen name="profile" options={{ title: "Hesabım" }} />
    </Tabs>
  );
}
