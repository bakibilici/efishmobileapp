import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { CommonActions } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { GlassSurface } from "../ui/glass";
import { IconSymbol, type IconSymbolName } from "../ui/icon-symbol";
import { accentOnGlass, usePagePalette } from "../ui/pagePalette";
import { TAB_BAR_HEIGHT, useTabBarBottomOffset } from "./tabBarMetrics";

/**
 * The tabs the bar draws, in order, looked up by route name (never by
 * index): the `start` route stays declared for its QR listener but is
 * reached through the action circle, not drawn as a tab.
 */
const TABS: readonly { name: string; title: string; symbol: IconSymbolName }[] = [
  { name: "mainpage", title: "Sürüş", symbol: "bolt.car.fill" },
  { name: "sessions", title: "Oturumlar", symbol: "clock.arrow.circlepath" },
  { name: "profile", title: "Hesabım", symbol: "person.crop.circle.fill" },
];

const SIDE_INSET = 20;
const ACTION_GAP = 12;
const PILL_RADIUS = TAB_BAR_HEIGHT / 2;
const PLATTER_INSET = 4;
const PLATTER_SPRING = { damping: 22, stiffness: 260, mass: 0.9 };
/**
 * The selected tab's tint in light mode: the brand blue a step darker. The
 * brand blue itself reads about 2.5:1 on the light glass over the sea on the
 * map, under the 3:1 a control's label needs. Dark mode keeps the brand blue.
 */

type Props = BottomTabBarProps & {
  /** The bar's slide: moved off screen while driving, under a sheet or the keyboard. */
  translateY: Animated.Value;
  hidden: boolean;
  onStartPress: () => void;
};

/**
 * The app's tab bar, as iOS 26 draws one: a floating Liquid Glass pill with
 * the three tabs and a sliding selection platter, and beside it a glass
 * circle in the brand blue that starts a charge (QR code). Older iOS gets
 * frosted glass, Android an opaque bar (GlassSurface).
 *
 * It slides away (a transform only: glass under a changing opacity stops
 * drawing) and, while away, takes no touches and is hidden from
 * VoiceOver and TalkBack.
 */
export function GlassTabBar({
  state,
  descriptors,
  navigation,
  translateY,
  hidden,
  onStartPress,
}: Props) {
  const palette = usePagePalette();
  const bottomOffset = useTabBarBottomOffset();
  const [itemWidth, setItemWidth] = useState(0);

  const tabs = TABS.flatMap((tab) => {
    const route = state.routes.find((r) => r.name === tab.name);
    return route ? [{ ...tab, route }] : [];
  });
  const focusedKey = state.routes[state.index]?.key;
  const selectedIndex = tabs.findIndex((tab) => tab.route.key === focusedKey);

  const platterX = useSharedValue(0);
  const platterPlaced = useSharedValue(false);
  useEffect(() => {
    if (itemWidth <= 0 || selectedIndex < 0) return;
    const target = selectedIndex * itemWidth;
    // The first placement jumps; later tab changes slide.
    if (!platterPlaced.value) {
      platterPlaced.value = true;
      platterX.value = target;
    } else {
      platterX.value = withSpring(target, PLATTER_SPRING);
    }
  }, [itemWidth, selectedIndex, platterPlaced, platterX]);
  const platterStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: platterX.value }],
  }));

  const onPillLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setItemWidth(tabs.length > 0 ? width / tabs.length : 0);
  };

  const platterFill = palette.isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.07)";

  return (
    <Animated.View
      pointerEvents={hidden ? "none" : "box-none"}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
      style={[
        styles.root,
        { paddingBottom: bottomOffset, transform: [{ translateY }] },
      ]}
    >
      <View style={styles.row} pointerEvents="box-none">
        <GlassSurface radius={PILL_RADIUS} interactive style={styles.pill}>
          <View style={styles.items} onLayout={onPillLayout} accessibilityRole="tablist">
            {itemWidth > 0 && selectedIndex >= 0 ? (
              <Reanimated.View
                pointerEvents="none"
                style={[
                  styles.platter,
                  { width: itemWidth - PLATTER_INSET * 2, backgroundColor: platterFill },
                  platterStyle,
                ]}
              />
            ) : null}
            {tabs.map((tab, index) => {
              const selected = index === selectedIndex;
              // The brand blue is too dim on dark glass over a dark map and too
              // dark on light glass: accentOnGlass gives each scheme a tone that reads.
              const color = selected ? accentOnGlass(palette.isDark) : palette.label;
              const onPress = () => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: tab.route.key,
                  canPreventDefault: true,
                });
                // Emitted on a re-tap too: the tab's stack pops to its first page.
                if (!selected && !event.defaultPrevented) {
                  if (Platform.OS === "ios") void Haptics.selectionAsync();
                  navigation.dispatch({
                    ...CommonActions.navigate(tab.route),
                    target: state.key,
                  });
                }
              };
              const onLongPress = () => {
                navigation.emit({ type: "tabLongPress", target: tab.route.key });
              };
              const options = descriptors[tab.route.key]?.options;
              return (
                <Pressable
                  key={tab.route.key}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={options?.tabBarAccessibilityLabel ?? tab.title}
                  style={styles.item}
                >
                  <IconSymbol name={tab.symbol} size={24} weight="medium" color={color} />
                  <Text style={[styles.label, { color }]} numberOfLines={1}>
                    {tab.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </GlassSurface>

        <Pressable
          onPress={() => {
            if (Platform.OS === "ios") {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            onStartPress();
          }}
          accessibilityRole="button"
          accessibilityLabel="Şarj başlat"
          accessibilityHint="Şarj soketindeki QR kodu okutmak için kamerayı açar"
          style={styles.action}
        >
          <GlassSurface
            radius={PILL_RADIUS}
            interactive
            tintColor={palette.accent}
            style={styles.actionGlass}
          >
            <IconSymbol name="qrcode.viewfinder" size={24} weight="semibold" color="#FFFFFF" />
          </GlassSurface>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SIDE_INSET,
  },
  row: {
    height: TAB_BAR_HEIGHT,
    flexDirection: "row",
    gap: ACTION_GAP,
  },
  pill: {
    flex: 1,
  },
  items: {
    flex: 1,
    flexDirection: "row",
  },
  platter: {
    position: "absolute",
    top: PLATTER_INSET,
    bottom: PLATTER_INSET,
    left: PLATTER_INSET,
    borderRadius: PILL_RADIUS - PLATTER_INSET,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  action: {
    width: TAB_BAR_HEIGHT,
    height: TAB_BAR_HEIGHT,
  },
  actionGlass: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
