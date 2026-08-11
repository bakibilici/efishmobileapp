import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { registerGlobals } from "@livekit/react-native";

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
  AppState,
  Text,
  TextInput,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { startNetworkLogging } from "react-native-network-logger";


import "react-native-reanimated";

import { CarModeView } from "@/components/CarModeView";
import { DailyStepStore } from "@/services/sensors/DailyStepStore";

import {
  ThemeProvider as AppThemeProvider,
  useTheme,
} from "@/context/ThemeContext";
import { UserProvider, useUser } from "@/context/UserContext";
import { PaymentProvider } from "@/context/payment/PaymentContext";
import { ActivityService } from "@/services/ActivityService";
import * as Sentry from "@sentry/react-native";

// --- Polyfills required for LiveKit WebRTC on React Native ---
if (typeof global.Event === "undefined") {
  global.Event = class Event {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  } as any;
}

if (typeof global.CloseEvent === "undefined") {
  global.CloseEvent = class CloseEvent extends global.Event {
    code: number;
    reason: string;
    wasClean: boolean;

    constructor(
      type: string,
      init?: { code?: number; reason?: string; wasClean?: boolean },
    ) {
      super(type);
      this.code = init?.code ?? 0;
      this.reason = init?.reason ?? "";
      this.wasClean = init?.wasClean ?? false;
    }
  } as any;
}
// -----------------------------------------------------------------

// Wire LiveKit's WebRTC globals (getUserMedia audio config, URL polyfill,
// event shims) once at boot, before any Room is constructed.
registerGlobals();

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

    // Boot the sensor pipeline (steps, activity detection)
    DailyStepStore.bindAppState(AppState);
    ActivityService.start();
    return () => ActivityService.stop();
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
  }, [fontsLoaded, defaultsApplied, isUserLoading, user, router]);

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
            <Stack.Screen
              name="route-plan"
              options={{ headerShown: false }}
            />
          </Stack>
          <StatusBar style={themeScheme === "dark" ? "light" : "dark"} />
          {user && (
            <>
              <CarModeView />
            </>
          )}
        </ThemeProvider>
    </BottomSheetModalProvider>
  );
}

