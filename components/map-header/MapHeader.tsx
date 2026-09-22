import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, BackHandler, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Station, StationType } from "../../constants/stations";
import type { HeaderMode } from "../../hooks/useHeaderAutoCollapse";
import { usePagePalette } from "../ui/pagePalette";
import { ActivityCapsule } from "./ActivityCapsule";
import { FilterPopover } from "./FilterPopover";
import { GlassIconButton } from "./GlassIconButton";
import { MapSearchField, type MapSearchFieldHandle } from "./MapSearchField";
import type { Coords } from "./stationSearch";
import { TierChips } from "./TierChips";
import { accentOnGlass } from "./tiers";

/** The header's top: 8 under the safe area, the route sheet's floating button's anchor. */
const ANCHOR_GAP = 8;
const SIDE = 16;
/** Before the first layout: the top row and the chips (48 + 4 + 44). */
const CONTROLS_FALLBACK = 96;
/** Before the first layout: the whole header, full. */
const GROUP_FALLBACK = 144;

export type MapHeaderProps = {
  mode: HeaderMode;
  /** Slid off the top (the full-screen charging sheet is open). */
  hidden: boolean;
  onExpand: () => void;
  isSignedIn: boolean;
  onSignIn: () => void;
  stations: readonly Station[];
  userCoords: Coords | null;
  /** The pin-name filter the field committed ("" for none). */
  stationQuery: string;
  onStationQueryChange: (query: string) => void;
  onSelectStation: (station: Station) => void;
  onSelectPlace: (coords: Coords | null, description: string) => void;
  onSearchActiveChange: (active: boolean) => void;
  tierFilters: readonly StationType[];
  onToggleTier: (tier: StationType) => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  showOnlyAkba: boolean;
  onlyAkba: boolean;
  onOnlyAkbaChange: (value: boolean) => void;
  onOpenTierList: (tier: StationType) => void;
  /** Under the status capsule (the minimised charge). */
  footer?: ReactNode;
};

/**
 * The map screen's header: separate Liquid Glass shapes floating over the
 * map, no band behind them. The search capsule with the filter circle (a ✕
 * while searching), the tier chips, and the status capsule; compact, only
 * the status capsule at the top. It moves by transforms alone: glass under
 * a changing opacity stops drawing (expo/expo#41024).
 */
export function MapHeader({
  mode,
  hidden,
  onExpand,
  isSignedIn,
  onSignIn,
  stations,
  userCoords,
  stationQuery,
  onStationQueryChange,
  onSelectStation,
  onSelectPlace,
  onSearchActiveChange,
  tierFilters,
  onToggleTier,
  filtersOpen,
  onToggleFilters,
  showOnlyAkba,
  onlyAkba,
  onOnlyAkbaChange,
  onOpenTierList,
  footer,
}: MapHeaderProps) {
  const palette = usePagePalette();
  const { top: safeTop } = useSafeAreaInsets();
  const searchRef = useRef<MapSearchFieldHandle>(null);
  const [searchActive, setSearchActive] = useState(false);
  const [controlsHeight, setControlsHeight] = useState(0);
  const [groupHeight, setGroupHeight] = useState(0);
  const compact = mode === "COMPACT";
  const showStatus = !searchActive && !filtersOpen;

  // The latest callbacks, for effects that must not re-run when a parent
  // passes a new function on every render.
  const onSearchActiveChangeRef = useRef(onSearchActiveChange);
  const onToggleFiltersRef = useRef(onToggleFilters);
  useEffect(() => {
    onSearchActiveChangeRef.current = onSearchActiveChange;
    onToggleFiltersRef.current = onToggleFilters;
  });

  useEffect(() => {
    onSearchActiveChangeRef.current(searchActive);
  }, [searchActive]);

  // Compact: the controls slide up off the screen and the status capsule up
  // to the anchor. The controls move farther, so the two never overlap.
  const [collapse] = useState(() => new Animated.Value(compact ? 1 : 0));
  useEffect(() => {
    Animated.spring(collapse, {
      toValue: compact ? 1 : 0,
      speed: 16,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  }, [collapse, compact]);
  const controls = controlsHeight || CONTROLS_FALLBACK;
  const controlsY = collapse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -(controls + safeTop + 16)],
  });
  const statusY = collapse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -(controls + 4)],
  });

  // Hidden: the whole header slides a measured distance off the top.
  const hiddenOffset = -(safeTop + ANCHOR_GAP + (groupHeight || GROUP_FALLBACK) + 16);
  const [slide] = useState(() => new Animated.Value(hidden ? hiddenOffset : 0));
  useEffect(() => {
    Animated.spring(slide, {
      toValue: hidden ? hiddenOffset : 0,
      speed: 12,
      bounciness: hidden ? 0 : 6,
      useNativeDriver: true,
    }).start();
  }, [slide, hidden, hiddenOffset]);

  // Android's back key closes the popover or ends the search first.
  useFocusEffect(
    useCallback(() => {
      if (!filtersOpen && !searchActive) return undefined;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (filtersOpen) onToggleFiltersRef.current();
        else searchRef.current?.dismiss();
        return true;
      });
      return () => subscription.remove();
    }, [filtersOpen, searchActive]),
  );

  const scrim = palette.isDark
    ? (["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"] as const)
    : (["rgba(255,255,255,0.55)", "rgba(255,255,255,0)"] as const);

  return (
    <>
      {/* The map runs under the status bar: a static scrim keeps it legible. */}
      <LinearGradient
        pointerEvents="none"
        colors={scrim}
        style={[styles.scrim, { height: safeTop + ANCHOR_GAP }]}
      />
      <Animated.View
        pointerEvents={hidden ? "none" : "box-none"}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
        onLayout={(event) => setGroupHeight(Math.round(event.nativeEvent.layout.height))}
        style={[
          styles.group,
          { top: safeTop + ANCHOR_GAP, transform: [{ translateY: slide }] },
        ]}
      >
        <Animated.View
          pointerEvents={compact ? "none" : "box-none"}
          accessibilityElementsHidden={compact}
          importantForAccessibility={compact ? "no-hide-descendants" : "auto"}
          onLayout={(event) => setControlsHeight(Math.round(event.nativeEvent.layout.height))}
          style={{ transform: [{ translateY: controlsY }] }}
        >
          <View pointerEvents="box-none" style={styles.topRow}>
            <MapSearchField
              ref={searchRef}
              stations={stations}
              userCoords={userCoords}
              committedQuery={stationQuery}
              onCommitQuery={onStationQueryChange}
              onSelectStation={onSelectStation}
              onSelectPlace={onSelectPlace}
              onActiveChange={setSearchActive}
            />
            {searchActive ? (
              <GlassIconButton
                symbol="xmark"
                accessibilityLabel="Aramayı kapat"
                onPress={() => searchRef.current?.dismiss()}
              />
            ) : (
              <GlassIconButton
                symbol="line.3.horizontal.decrease"
                accessibilityLabel="Filtreler"
                accessibilityHint="Filtreleri ve istasyon listelerini açar"
                accessibilityState={{ expanded: filtersOpen }}
                tintColor={filtersOpen ? palette.accent : undefined}
                glyphColor={
                  !filtersOpen && onlyAkba && showOnlyAkba
                    ? accentOnGlass(palette.isDark)
                    : undefined
                }
                onPress={onToggleFilters}
              />
            )}
            {isSignedIn ? null : (
              <GlassIconButton
                symbol="person.crop.circle.fill"
                accessibilityLabel="Giriş yap"
                accessibilityHint="Giriş ekranını açar"
                onPress={onSignIn}
              />
            )}
          </View>
          {showStatus ? (
            <TierChips selected={tierFilters} onToggle={onToggleTier} style={styles.chips} />
          ) : null}
          {filtersOpen && !searchActive ? (
            <FilterPopover
              showOnlyAkba={showOnlyAkba}
              onlyAkba={onlyAkba}
              onOnlyAkbaChange={onOnlyAkbaChange}
              onOpenList={onOpenTierList}
            />
          ) : null}
        </Animated.View>
        {showStatus ? (
          <Animated.View
            pointerEvents="box-none"
            style={[styles.status, { transform: [{ translateY: statusY }] }]}
          >
            <ActivityCapsule compact={compact} onExpand={onExpand} />
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Animated.View>
        ) : null}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  group: {
    position: "absolute",
    left: SIDE,
    right: SIDE,
    zIndex: 80,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  chips: {
    marginTop: 4,
  },
  status: {
    marginTop: 4,
    gap: 8,
  },
  footer: {
    alignSelf: "stretch",
  },
});
