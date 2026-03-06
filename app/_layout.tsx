import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import { Accelerometer } from "expo-sensors";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { startNetworkLogging } from "react-native-network-logger";
import "react-native-reanimated";

import {
  ThemeProvider as AppThemeProvider,
  useTheme,
} from "@/context/ThemeContext";
import { UserProvider, useUser } from "@/context/UserContext";
import { PaymentProvider } from "@/context/payment/PaymentContext";
import * as Sentry from "@sentry/react-native";

Sentry.init({
  dsn: "https://96fccd63cdc72c7b4aa5e0a3874f44e8@o4510855506624512.ingest.de.sentry.io/4510905892405328",
  environment: __DEV__ ? "development" : "production",

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [
    Sentry.mobileReplayIntegration(),
    Sentry.feedbackIntegration(),
  ],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

SplashScreen.preventAutoHideAsync();

const SHAKE_THRESHOLD = 1.5; // g-force threshold for a single spike
const SHAKE_COUNT_NEEDED = 2; // number of shakes required
const SHAKE_WINDOW = 1500; // shakes must occur within this window (ms)
const SHAKE_COOLDOWN = 3000; // cooldown after trigger (ms)
const SHAKE_MIN_GAP = 200; // min ms between two counted shakes

function useShakeDetector() {
  const shakeTimestamps = useRef<number[]>([]);
  const lastTriggerTime = useRef(0);
  const wasAboveThreshold = useRef(false);

  useEffect(() => {
    Accelerometer.setUpdateInterval(80);

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const totalForce = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();

      // Cooldown check
      if (now - lastTriggerTime.current < SHAKE_COOLDOWN) return;

      // Detect a shake "peak" — only count when crossing above threshold
      if (totalForce > SHAKE_THRESHOLD && !wasAboveThreshold.current) {
        wasAboveThreshold.current = true;

        const lastTs =
          shakeTimestamps.current[shakeTimestamps.current.length - 1] ?? 0;

        // Only count if enough time passed since the last spike (avoids double-counting)
        if (now - lastTs > SHAKE_MIN_GAP) {
          // Remove old timestamps outside the window
          shakeTimestamps.current = shakeTimestamps.current.filter(
            (t) => now - t < SHAKE_WINDOW,
          );
          shakeTimestamps.current.push(now);

          if (shakeTimestamps.current.length >= SHAKE_COUNT_NEEDED) {
            shakeTimestamps.current = [];
            lastTriggerTime.current = now;
            Sentry.showFeedbackWidget();
          }
        }
      } else if (totalForce <= SHAKE_THRESHOLD) {
        wasAboveThreshold.current = false;
      }
    });

    return () => subscription.remove();
  }, []);
}

export default Sentry.wrap(function RootLayout() {
  useShakeDetector();

  useEffect(() => {
    if (__DEV__) {
      startNetworkLogging();
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <UserProvider>
        <AppThemeProvider>
          <PaymentProvider>
            <RootLayoutNav />
          </PaymentProvider>
        </AppThemeProvider>
      </UserProvider>
    </GestureHandlerRootView>
  );
});

function RootLayoutNav() {
  const { themeScheme } = useTheme();
  // ... (font loading logic remains same)
  const [fontsLoaded] = useFonts({
    "Gilroy-Regular": require("@/assets/fonts/gilroy/Gilroy-Regular.ttf"),
    "Gilroy-Medium": require("@/assets/fonts/gilroy/Gilroy-Medium.ttf"),
    "Gilroy-SemiBold": require("@/assets/fonts/gilroy/Gilroy-SemiBold.ttf"),
    "Gilroy-Bold": require("@/assets/fonts/gilroy/Gilroy-Bold.ttf"),
  });
  const { isLoading: isUserLoading, user } = useUser();
  const router = useRouter();
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!fontsLoaded || appliedRef.current) return;

    // ... font logic ...
    const TextWithDefault = Text as typeof Text & {
      defaultProps?: { style?: any };
    };
    const TextInputWithDefault = TextInput as typeof TextInput & {
      defaultProps?: { style?: any };
    };

    if (!TextWithDefault.defaultProps) TextWithDefault.defaultProps = {};
    if (!TextInputWithDefault.defaultProps)
      TextInputWithDefault.defaultProps = {};

    TextWithDefault.defaultProps.style = [
      TextWithDefault.defaultProps.style,
      { fontFamily: "Gilroy-Regular" },
    ];
    TextInputWithDefault.defaultProps.style = [
      TextInputWithDefault.defaultProps.style,
      { fontFamily: "Gilroy-Regular" },
    ];

    appliedRef.current = true;
    setDefaultsApplied(true);
  }, [fontsLoaded]);

  // Handle Splash Screen hiding and initial navigation
  useEffect(() => {
    if (fontsLoaded && defaultsApplied && !isUserLoading) {
      // If user is logged in, navigate to mainpage immediately
      if (user) {
        router.replace("/(tabs)/mainpage");
      }
      // Hide splash screen after checking user status
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, defaultsApplied, isUserLoading, user]);

  if (!fontsLoaded || !defaultsApplied) {
    return null;
  }

  return (
    <BottomSheetModalProvider>
      <ThemeProvider value={themeScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="modal"
            options={{
              presentation: "transparentModal",
              headerShown: false,
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen
            name="auth/register"
            options={{ presentation: "card", headerShown: false }}
          />
          <Stack.Screen
            name="qr-scanner"
            options={{ presentation: "modal", headerShown: false }}
          />
        </Stack>
        <StatusBar style={themeScheme === "dark" ? "light" : "dark"} />
        {__DEV__ && <DraggableDevButton />}
      </ThemeProvider>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  devBubbleWrapper: {
    position: "absolute",
    right: 16,
    bottom: 40,
  },
  devBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  devBubbleText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
});

function DraggableDevButton() {
  const router = useRouter();
  const pan = useRef(new Animated.ValueXY()).current;
  const panValue = useRef({ x: 0, y: 0 });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const listenerId = pan.addListener((value) => {
      panValue.current = value;
    });

    AsyncStorage.getItem("dev_button_pos").then((val) => {
      if (val) {
        try {
          const { x, y } = JSON.parse(val);
          pan.setValue({ x, y });
          panValue.current = { x, y };
        } catch (e) {}
      }
      setIsReady(true);
    });

    return () => {
      pan.removeListener(listenerId);
    };
  }, [pan]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          x: panValue.current.x,
          y: panValue.current.y,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        AsyncStorage.setItem(
          "dev_button_pos",
          JSON.stringify({ x: panValue.current.x, y: panValue.current.y }),
        );
      },
    }),
  ).current;

  if (!isReady) return null;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.devBubbleWrapper,
        {
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        },
      ]}
    >
      <Pressable
        onPress={() => {
          router.push("/network-logger");
        }}
        style={styles.devBubble}
      >
        <Text style={styles.devBubbleText}>NET</Text>
      </Pressable>
    </Animated.View>
  );
}
