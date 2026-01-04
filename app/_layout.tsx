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

import { useColorScheme } from "@/hooks/use-color-scheme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    "Gilroy-Regular": require("@/assets/fonts/gilroy/Gilroy-Regular.ttf"),
    "Gilroy-Medium": require("@/assets/fonts/gilroy/Gilroy-Medium.ttf"),
    "Gilroy-SemiBold": require("@/assets/fonts/gilroy/Gilroy-SemiBold.ttf"),
    "Gilroy-Bold": require("@/assets/fonts/gilroy/Gilroy-Bold.ttf"),
  });
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!fontsLoaded || appliedRef.current) return;

    // Set global defaults so all text inputs render with Gilroy.
    const TextWithDefault = Text as typeof Text & {
      defaultProps?: { style?: any };
    };
    const TextInputWithDefault = TextInput as typeof TextInput & {
      defaultProps?: { style?: any };
    };

    if (!TextWithDefault.defaultProps) {
      TextWithDefault.defaultProps = {};
    }
    if (!TextInputWithDefault.defaultProps) {
      TextInputWithDefault.defaultProps = {};
    }

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
    // Diagnostics: confirm fonts applied once (change the message to see it clearly).
    console.log(
      "Default font mapping set -> Gilroy-Regular for Text/TextInput"
    );

    SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded || !defaultsApplied) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="modal"
              options={{ presentation: "modal", headerShown: false }}
            />
            <Stack.Screen
              name="qr-scanner"
              options={{ presentation: "modal", headerShown: false }}
            />
          </Stack>
          <StatusBar style="dark" />
        </ThemeProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
