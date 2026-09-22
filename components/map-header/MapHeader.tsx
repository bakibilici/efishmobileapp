import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, BackHandler, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Station, StationType } from "../../constants/stations";
import type { HeaderMode } from "../../hooks/useHeaderAutoCollapse";
import { accentOnGlass, usePagePalette } from "../ui/pagePalette";
import { ActivityCapsule } from "./ActivityCapsule";
import { FilterPopover } from "./FilterPopover";
import { GlassIconButton } from "./GlassIconButton";
import { HeaderBackdrop } from "./HeaderBackdrop";
import {
  ANCHOR_GAP,
  CAPSULE_H,
  CHIPS_MARGIN,
  CONTROLS_FALLBACK,
  GROUP_FALLBACK,
  SIDE,
  statusCollapseOffset,
  STATUS_MARGIN,
} from "./headerMetrics";
import { MapSearchField, type MapSearchFieldHandle } from "./MapSearchField";
import type { Coords } from "./stationSearch";
import { TierChips } from "./TierChips";

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
 * The map screen's header: glass shapes over the map on a blurred band (see
 * HeaderBackdrop) that runs the width of the screen from the status bar to
 * just under the last of them. The search capsule with the filter circle (a
 * ✕ while searching), the tier chips, and the status capsule; compact, only
 * the status capsule at the top. It moves by transforms alone: glass under
 * a changing opacity stops drawing (expo/expo#41024).
 *
 * One column, one grid: every row runs from SIDE to SIDE, so the three read
 * as one group of controls rather than three floating objects. The rhythm
 * between them is deliberate — 8 pt from the search field to the chips it
 * belongs with, 12 pt before the status capsule, which is about the driver
 * and not about the search.
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
  const [statusHeight, setStatusHeight] = useState(0);
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
    outputRange: [0, statusCollapseOffset(controls)],
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

  return (
    <>
      {/* The band the whole header sits on: the map blurred and washed from
          behind the status bar down to just under the capsule. It follows the
          same collapse value, so it stops where the header stops. */}
      <HeaderBackdrop
        safeTop={safeTop}
        controlsHeight={controls}
        statusHeight={statusHeight || CAPSULE_H}
        collapse={collapse}
        slide={slide}
        visible={!hidden && showStatus}
        isDark={palette.isDark}
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
          // Only the header's own two rows are measured. The chips leave and
          // the filter popover arrives inside this container while the search
          // or the filters are up, and the band would follow that height for
          // a frame as they dismiss; the last expanded measurement is the one
          // the collapse and the band want.
          onLayout={(event) => {
            if (showStatus) setControlsHeight(Math.round(event.nativeEvent.layout.height));
          }}
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
                material="frosted"
                symbol="xmark"
                accessibilityLabel="Aramayı kapat"
                onPress={() => searchRef.current?.dismiss()}
              />
            ) : (
              <GlassIconButton
                material="frosted"
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
                material="frosted"
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
            {/* The capsule alone is measured, not the footer under it: the
                band ends just below the capsule, and a minimised charge —
                an opaque card of its own — must not push it down the map. */}
            <View
              pointerEvents="box-none"
              onLayout={(event) => setStatusHeight(Math.round(event.nativeEvent.layout.height))}
            >
              <ActivityCapsule compact={compact} onExpand={onExpand} />
            </View>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Animated.View>
        ) : null}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
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
    marginTop: CHIPS_MARGIN,
  },
  status: {
    marginTop: STATUS_MARGIN,
    gap: 8,
  },
  footer: {
    alignSelf: "stretch",
  },
});
