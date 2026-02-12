import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Text, TextInput } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { ThemeProvider as AppThemeProvider, useTheme } from "@/context/ThemeContext";
import { UserProvider, useUser } from "@/context/UserContext";
import { PaymentProvider } from "@/context/payment/PaymentContext";
import { useRouter } from "expo-router";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
}

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
    if (!TextInputWithDefault.defaultProps) TextInputWithDefault.defaultProps = {};

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
      <ThemeProvider
        value={themeScheme === "dark" ? DarkTheme : DefaultTheme}
      >
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="modal"
            options={{
              presentation: "transparentModal",
              headerShown: false,
              animation: 'slide_from_bottom',
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
        <StatusBar style={themeScheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    </BottomSheetModalProvider>
  );
}
