import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { Platform } from "react-native";

import { isIOS26 } from "../ui/glass";
import { getPagePalette, usePagePalette, type PagePalette } from "../ui/pagePalette";

/**
 * Native navigation bars for full pages, as in iOS Settings: a large title
 * on a tab's first page that collapses as the list scrolls, a plain title on
 * pages pushed from it, and a chevron-only back button.
 *
 * On iOS the bar is see-through over the grouped background. iOS 26 draws
 * its own Liquid Glass bar items and scroll-edge blur; older iOS gets the
 * system chrome material once content scrolls under it. Android keeps a
 * solid bar in the page's own colour.
 *
 * The hooks return the same object until the palette or the title changes:
 * a <Stack.Screen options> applies them again whenever they change.
 */
function buildOptions(palette: PagePalette, largeTitle: boolean): NativeStackNavigationOptions {
  const contentStyle = { backgroundColor: palette.background };

  if (Platform.OS !== "ios") {
    return {
      headerStyle: { backgroundColor: palette.background },
      headerShadowVisible: false,
      headerTintColor: palette.label,
      headerTitleStyle: { color: palette.label },
      contentStyle,
    };
  }

  return {
    headerLargeTitleEnabled: largeTitle,
    headerTransparent: true,
    headerShadowVisible: false,
    headerLargeTitleShadowVisible: false,
    headerBlurEffect: isIOS26 ? undefined : "systemChromeMaterial",
    headerTintColor: palette.label,
    headerTitleStyle: { color: palette.label },
    headerLargeTitleStyle: { color: palette.label },
    headerBackButtonDisplayMode: "minimal",
    contentStyle,
  };
}

// Built once per scheme: every tab root shares the same object.
const TAB_ROOT_OPTIONS = {
  light: buildOptions(getPagePalette(false), true),
  dark: buildOptions(getPagePalette(true), true),
};

/** A tab's first page (Oturumlar, Hesabım): the large title. */
export function useTabRootStackOptions(): NativeStackNavigationOptions {
  const palette = usePagePalette();
  return palette.isDark ? TAB_ROOT_OPTIONS.dark : TAB_ROOT_OPTIONS.light;
}

/** A page pushed on top of a tab or the app (Kişisel bilgiler, Görünüm…): a plain title. */
export function usePushedPageOptions(title: string): NativeStackNavigationOptions {
  const palette = usePagePalette();
  return useMemo(() => ({ ...buildOptions(palette, false), title }), [palette, title]);
}
