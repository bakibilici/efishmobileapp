import React, {
  Fragment,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import {
  GooglePlacesAutocomplete,
  type GooglePlacesAutocompleteRef,
} from "react-native-google-places-autocomplete";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Station } from "../../constants/stations";
import { withoutProviderNames } from "../../services/providerNames";
import { GlassSurface } from "../ui/glass";
import { GROUP_RADIUS } from "../ui/GroupedList";
import { IconSymbol } from "../ui/icon-symbol";
import { accentOnGlass, usePagePalette } from "../ui/pagePalette";
import { RESULT_SEPARATOR_INSET, ResultRow } from "./ResultRow";
import {
  buildStationIndex,
  matchStations,
  stationSubtitle,
  type Coords,
} from "./stationSearch";
import { TIER_COLORS } from "./tiers";
import { useSearchDictation } from "./useSearchDictation";

export type MapSearchFieldHandle = {
  /** Ends the search: blurs the field and cancels dictation; the text stays. */
  dismiss(): void;
};

/** The field's top: the header's anchor under the safe area. */
const ANCHOR_GAP = 8;
const FIELD_HEIGHT = 48;
const LIST_GAP = 8;

/** A Places session token: a new one makes the field fetch its text again. */
const nextToken = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

/**
 * Places looks for Turkish places only: "zes" used to come back from
 * Georgia, Spain, the Netherlands and Indonesia, "Forum" from Mexico and
 * Poland. Within the country the driver's own surroundings come first
 * (a bias, not a bound: a search for another city still finds it).
 */
const PLACES_COUNTRY = "country:tr";
const PLACES_BIAS_RADIUS_M = 50000;

/** Provider names never reach the screen; a line left empty is dropped. */
const clean = (text?: string | null) => (text ? withoutProviderNames(text) || null : null);

/** A place result's name ("Moda Sahil Yolu"), else its whole description. */
const placeName = (row: {
  description: string;
  structured_formatting?: { main_text?: string | null } | null;
}) => clean(row.structured_formatting?.main_text) ?? clean(row.description) ?? row.description;

/**
 * The map's search field: a glass capsule that finds places (Google Places,
 * in Turkish) and, above them, up to three stations by name. Dictation fills
 * the field live; when it ends the field is focused and the places for the
 * text load once. Return with station matches commits the text as the map's
 * pin-name filter. The result lists are opaque cards, never glass, and never
 * run under the keyboard.
 */
export function MapSearchField({
  ref,
  stations,
  userCoords,
  committedQuery,
  onCommitQuery,
  onSelectStation,
  onSelectPlace,
  onActiveChange,
}: {
  ref?: Ref<MapSearchFieldHandle>;
  stations: readonly Station[];
  userCoords: Coords | null;
  committedQuery: string;
  onCommitQuery: (query: string) => void;
  onSelectStation: (station: Station) => void;
  onSelectPlace: (coords: Coords | null, description: string) => void;
  onActiveChange: (active: boolean) => void;
}) {
  const palette = usePagePalette();
  const isDark = palette.isDark;
  const { top: safeTop } = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const placesRef = useRef<GooglePlacesAutocompleteRef>(null);
  const [text, setText] = useState(committedQuery);
  const [focused, setFocused] = useState(false);
  const [session, setSession] = useState(nextToken);
  /** Text set in code (dictation, a station pick): fetch its places on the next focus. */
  const needsFetchRef = useRef(false);
  const [cardHeight, setCardHeight] = useState(0);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const initialQueryRef = useRef(committedQuery);

  const onText = useCallback((spoken: string, final: boolean) => {
    placesRef.current?.setAddressText(spoken);
    setText(spoken);
    needsFetchRef.current = true;
    if (final) {
      // Set before the focus event, so the chips do not mount for a frame
      // between the end of listening and the focus.
      setFocused(true);
      placesRef.current?.focus();
    }
  }, []);
  const { listening, toggle, cancel } = useSearchDictation(onText);

  // Rounded to about a kilometre: the field refetches whenever its query
  // changes, and a raw fix would change it with every GPS update.
  const biasLocation = useMemo(
    () =>
      userCoords
        ? `${userCoords.latitude.toFixed(2)},${userCoords.longitude.toFixed(2)}`
        : null,
    [userCoords],
  );

  const index = useMemo(() => buildStationIndex(stations), [stations]);
  const matches = useMemo(
    () => matchStations(index, text, userCoords),
    [index, text, userCoords],
  );

  useEffect(() => {
    onActiveChange(focused || listening);
  }, [focused, listening, onActiveChange]);

  // The header remounts after a drive: a filter it still holds is shown again.
  useEffect(() => {
    const query = initialQueryRef.current;
    if (query) placesRef.current?.setAddressText(query);
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (event) =>
      setKeyboardTop(event.endCoordinates.screenY),
    );
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardTop(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      dismiss() {
        if (listening) void cancel();
        placesRef.current?.blur();
        Keyboard.dismiss();
      },
    }),
    [listening, cancel],
  );

  const clear = () => {
    placesRef.current?.setAddressText("");
    setText("");
    needsFetchRef.current = false;
    if (committedQuery) onCommitQuery("");
  };

  const pickStation = (station: Station) => {
    // A pick ends the search: dictation must not write over the name.
    if (listening) void cancel();
    placesRef.current?.setAddressText(station.name);
    setText(station.name);
    needsFetchRef.current = true;
    placesRef.current?.blur();
    onSelectStation(station);
  };

  const cardShown = (focused || listening) && matches.length > 0;
  const listTop =
    safeTop + ANCHOR_GAP + FIELD_HEIGHT + LIST_GAP + (cardShown ? cardHeight + LIST_GAP : 0);
  const listMaxHeight = Math.max(104, (keyboardTop ?? windowHeight - 120) - listTop - 12);
  const showMic = text === "" || listening;

  const stationCard = cardShown ? (
    <View
      onLayout={(event) => setCardHeight(Math.round(event.nativeEvent.layout.height))}
      style={[
        styles.card,
        { backgroundColor: palette.cell, borderColor: palette.separator },
      ]}
    >
      {matches.map((station, position) => {
        const subtitle = stationSubtitle(station, userCoords);
        return (
          <Fragment key={station.id}>
            {position > 0 ? (
              <View style={[styles.separator, { backgroundColor: palette.separator }]} />
            ) : null}
            <Pressable
              onPress={() => pickStation(station)}
              accessibilityRole="button"
              accessibilityLabel={`${station.name}, ${subtitle}`}
              style={({ pressed }) => [pressed && { backgroundColor: palette.cellPressed }]}
            >
              <ResultRow
                glyph={{ kind: "station", color: TIER_COLORS[station.type] }}
                title={station.name}
                subtitle={subtitle}
              />
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  ) : null;

  return (
    <View style={styles.field} pointerEvents="box-none">
      {Platform.OS === "ios" ? <GlassSurface radius={24} material="frosted" style={styles.glass} /> : null}
      <GooglePlacesAutocomplete
        ref={placesRef}
        placeholder="İstasyon veya yer ara"
        fetchDetails
        debounce={250}
        minLength={2}
        keyboardShouldPersistTaps="handled"
        keepResultsAfterBlur={false}
        isRowScrollable={false}
        listUnderlayColor={palette.cellPressed}
        query={{
          key:
            Platform.OS === "ios"
              ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY
              : process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY,
          language: "tr",
          components: PLACES_COUNTRY,
          ...(biasLocation
            ? { location: biasLocation, radius: PLACES_BIAS_RADIUS_M }
            : {}),
          sessiontoken: session,
        }}
        // What the field shows after a pick: the place's name, as its row's
        // title. A street's full description starts with its neighbourhood.
        renderDescription={placeName}
        onPress={(data, details) => {
          setText(placeName(data));
          onSelectPlace(
            details
              ? {
                  latitude: details.geometry.location.lat,
                  longitude: details.geometry.location.lng,
                }
              : null,
            data.description,
          );
        }}
        renderRow={(row) => (
          <ResultRow
            glyph={{ kind: "place" }}
            title={clean(row.structured_formatting?.main_text ?? row.description) ?? ""}
            subtitle={clean(row.structured_formatting?.secondary_text)}
          />
        )}
        renderLeftButton={() => (
          <View style={styles.leading}>
            <IconSymbol name="magnifyingglass" size={17} color={palette.secondaryLabel} />
          </View>
        )}
        renderRightButton={() =>
          showMic ? (
            <Pressable
              onPress={toggle}
              accessibilityRole="button"
              accessibilityLabel={listening ? "Dinlemeyi bitir" : "Sesle ara"}
              style={styles.trailing}
            >
              <IconSymbol
                name="mic.fill"
                size={18}
                color={listening ? accentOnGlass(isDark) : palette.secondaryLabel}
              />
            </Pressable>
          ) : (
            <Pressable
              onPress={clear}
              accessibilityRole="button"
              accessibilityLabel="Aramayı temizle"
              style={styles.trailing}
            >
              <IconSymbol name="xmark.circle.fill" size={17} color={palette.tertiaryLabel} />
            </Pressable>
          )
        }
        inbetweenCompo={stationCard}
        textInputProps={{
          placeholderTextColor: palette.secondaryLabel,
          clearButtonMode: "never",
          returnKeyType: "search",
          submitBehavior: matches.length ? "blurAndSubmit" : "submit",
          autoCorrect: false,
          autoCapitalize: "none",
          keyboardAppearance: isDark ? "dark" : "light",
          selectionColor: palette.accent,
          cursorColor: palette.accent,
          accessibilityLabel: "Ara",
          maxFontSizeMultiplier: 1.4,
          onChangeText: (typed: string) => {
            setText(typed);
            needsFetchRef.current = false;
            // Typing again after a commit lets the pins go.
            if (committedQuery && typed.trim() !== committedQuery) onCommitQuery("");
          },
          onFocus: () => {
            setFocused(true);
            if (needsFetchRef.current) {
              needsFetchRef.current = false;
              setSession(nextToken());
            }
          },
          onBlur: () => setFocused(false),
          onSubmitEditing: () => {
            if (matches.length) onCommitQuery(text.trim());
          },
        }}
        styles={{
          container: { flex: 0 },
          textInputContainer: [
            styles.inputContainer,
            Platform.OS === "android" && {
              backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
              borderRadius: 24,
              elevation: 8,
            },
          ],
          textInput: [styles.input, { color: palette.label }],
          listView: [
            styles.list,
            {
              display: text.trim().length >= 2 ? "flex" : "none",
              backgroundColor: palette.cell,
              borderColor: palette.separator,
              maxHeight: listMaxHeight,
            },
          ],
          row: styles.row,
          separator: [styles.separator, { backgroundColor: palette.separator }],
          poweredContainer: styles.powered,
          // Google's mark is a black-on-white PNG: tinted so it reads in dark mode.
          powered: isDark ? { tintColor: palette.secondaryLabel } : {},
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
  },
  glass: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: FIELD_HEIGHT,
  },
  inputContainer: {
    height: FIELD_HEIGHT,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  input: {
    height: FIELD_HEIGHT,
    marginBottom: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: "transparent",
    fontSize: 17,
  },
  leading: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4,
  },
  trailing: {
    width: 44,
    height: FIELD_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    marginTop: LIST_GAP,
    borderRadius: GROUP_RADIUS,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 12,
  },
  list: {
    marginTop: LIST_GAP,
    borderRadius: GROUP_RADIUS,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 12,
  },
  // ResultRow owns the padding.
  row: {
    backgroundColor: "transparent",
    padding: 0,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: RESULT_SEPARATOR_INSET,
  },
  powered: {
    backgroundColor: "transparent",
    borderTopWidth: 0,
  },
});
