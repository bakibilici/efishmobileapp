import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import React, { memo, useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { BreakExclusions } from "../../services/breakExclusions";
import type {
  RoutePlanHighlightAlternative,
  RoutePlanInterestHighlight,
  RoutePlanLocation,
} from "../../services/DriveSessionStore";
import { getRoutePlanGatewayUrl } from "../../services/routePlanGateway";
import {
  alternativeName,
  alternativeTitle,
  chargeFitLine,
  listedAlternatives,
  mapsSearchUrl,
  mapsWebUrl,
  photoCredit,
  placeName,
  placePhotoUri,
  shortWalkDistance,
  stopCoordinates,
  walkLine,
} from "./breakDetail";
import { alternativeTile, breakTile } from "./breakSuggestion";
import { Group, GroupFooter, IconTile, SectionHeader, TABULAR, TitleBlock } from "./Grouped";
import { spoken, spokenStationCharge, stationChargeLine, stationHardware } from "./routeFormat";
import type { SheetPalette } from "./sheetPalette";

const MAPS_HINT =
  Platform.OS === "android"
    ? "Google Haritalar'da bu yeri durağın yakınında arar."
    : "Apple Haritalar'da bu yeri durağın yakınında arar.";

/** Read once: EXPO_PUBLIC_ vars are inlined at build time. */
const GATEWAY_URL = getRoutePlanGatewayUrl();

const AlternativeRow = memo(function AlternativeRow({
  alternative,
  divided,
  palette,
}: {
  alternative: RoutePlanHighlightAlternative;
  divided: boolean;
  palette: SheetPalette;
}) {
  const tile = alternativeTile(alternative, palette);
  const name = alternativeName(alternative) || alternativeTitle(alternative) || "Mola yeri";
  const kind = alternativeTitle(alternative);
  const meta = [kind !== name ? kind : null, shortWalkDistance(alternative.distanceM)]
    .filter(Boolean)
    .join(" · ");
  const reason = alternative.reason?.trim();
  const accessibilityLabel = [name, meta ? spoken(meta) : null, reason]
    .filter(Boolean)
    .join(", ");

  return (
    <View style={styles.row} accessible accessibilityLabel={accessibilityLabel}>
      <View style={styles.tileSlot}>
        <IconTile glyph={tile.glyph} color={tile.color} />
      </View>
      <View
        style={[
          styles.copy,
          divided && {
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: palette.separator,
          },
        ]}
      >
        <Text style={[styles.rowTitle, { color: palette.label }]}>{name}</Text>
        {meta ? (
          <Text style={[styles.line, TABULAR, { color: palette.secondaryLabel }]}>{meta}</Text>
        ) : null}
        {reason ? (
          <Text style={[styles.line, { color: palette.secondaryLabel }]}>{reason}</Text>
        ) : null}
      </View>
    </View>
  );
});

/**
 * One break suggestion in full, pushed inside the sheet like the stations
 * panel: the category and title, the place with its walk, "Haritalar'da aç",
 * the stop it belongs to and how it fits the charge, the ranker's reason and
 * every other option. Nothing is cut; the screen's back button leads back to
 * where it was opened from.
 */
function BreakDetailPanelComponent({
  highlight,
  station,
  palette,
}: {
  highlight: RoutePlanInterestHighlight;
  /** The charging stop that carries it, when it can be found in the plan. */
  station: RoutePlanLocation | null;
  palette: SheetPalette;
}) {
  // Also covers a plan that was stored before the driver ruled a kind out,
  // and an option whose kind only its title gives (as its tile reads it).
  const excludedKinds = useSyncExternalStore(BreakExclusions.subscribe, BreakExclusions.get);
  const alternatives = listedAlternatives(highlight.alternatives, excludedKinds);

  const title = highlight.title?.trim() || "Mola önerisi";
  const place = placeName(highlight);
  const walk = place ? walkLine(highlight.distanceM) : null;
  const stationName = station?.name?.trim() || highlight.stationName?.trim() || null;
  const charge = station ? stationChargeLine(station) : null;
  const hardware = station ? stationHardware(station) : null;
  const fit = chargeFitLine(place ? highlight.distanceM : undefined, station?.charge_duration);
  const reason = highlight.message?.trim();
  const heroUri = useMemo(() => placePhotoUri(highlight, GATEWAY_URL), [highlight]);
  // Nothing is drawn under the photo strip here, unlike the row's tile, so a
  // photo that never arrives — no network on a mountain road, a rotated key, a
  // reference Google no longer knows — would leave a grey block with a credit
  // under it. The URL that failed is remembered instead, and the strip and its
  // credit both go; a different suggestion carries a different URL and starts
  // clean, so no reset is needed.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const hero = heroUri && heroUri !== failedUri ? heroUri : null;
  const onHeroError = useCallback(() => setFailedUri(hero), [hero]);
  const credit = hero ? photoCredit(highlight) : null;

  const openInMaps = useCallback(() => {
    if (!place) return;
    const near = stopCoordinates(station);
    Linking.openURL(mapsSearchUrl(Platform.OS, place, near)).catch(() => {
      Linking.openURL(mapsWebUrl(Platform.OS, place, near)).catch(() => undefined);
    });
  }, [place, station]);

  return (
    <>
      <TitleBlock title={title} tile={breakTile(highlight, palette)} palette={palette} />

      {place ? (
        <>
          <Group palette={palette}>
            {/* The group clips to its own corners, so the photo rounds at the
                top and its bottom edge becomes the divider above the name.
                Nothing is drawn at all when there is no photo. */}
            {hero ? (
              <View
                style={[styles.hero, { backgroundColor: palette.fill }]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Image
                  source={{ uri: hero }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={220}
                  cachePolicy="memory-disk"
                  recyclingKey={hero}
                  onError={onHeroError}
                  accessible={false}
                />
              </View>
            ) : null}
            <View
              style={styles.placeCell}
              accessible
              accessibilityLabel={[place, walk ? spoken(walk) : null].filter(Boolean).join(", ")}
            >
              <Text style={[styles.placeName, { color: palette.label }]}>{place}</Text>
              {walk ? (
                <Text style={[styles.placeMeta, TABULAR, { color: palette.secondaryLabel }]}>
                  {walk}
                </Text>
              ) : null}
            </View>
            <View style={[styles.separator, { backgroundColor: palette.separator }]} />
            <Pressable
              onPress={openInMaps}
              accessibilityRole="link"
              accessibilityLabel="Haritalar'da aç"
              accessibilityHint={MAPS_HINT}
              style={({ pressed }) => [
                styles.actionRow,
                pressed && { backgroundColor: palette.cellPressed },
              ]}
            >
              <Ionicons name="map-outline" size={20} color={palette.blue} />
              <Text style={[styles.actionText, { color: palette.blue }]} numberOfLines={1}>
                Haritalar&apos;da aç
              </Text>
              <Ionicons name="open-outline" size={16} color={palette.tertiaryLabel} />
            </Pressable>
          </Group>
          {credit ? <GroupFooter text={`Fotoğraf: ${credit}`} palette={palette} /> : null}
        </>
      ) : null}

      {stationName ? (
        <>
          <SectionHeader title="ŞARJ DURAĞI" palette={palette} />
          <Group palette={palette}>
            <View
              style={styles.row}
              accessible
              accessibilityLabel={[
                stationName,
                station ? spokenStationCharge(station) : null,
                hardware ? spoken(hardware) : null,
              ]
                .filter(Boolean)
                .join(", ")}
            >
              <View style={styles.tileSlot}>
                <IconTile glyph="flash" color={palette.station} />
              </View>
              <View style={styles.copy}>
                <Text style={[styles.rowTitle, { color: palette.label }]}>{stationName}</Text>
                {charge ? (
                  <Text style={[styles.line, TABULAR, { color: palette.secondaryLabel }]}>
                    {charge}
                  </Text>
                ) : null}
                {hardware ? (
                  <Text style={[styles.line, TABULAR, { color: palette.secondaryLabel }]}>
                    {hardware}
                  </Text>
                ) : null}
              </View>
            </View>
          </Group>
          {fit ? <GroupFooter text={fit} palette={palette} /> : null}
        </>
      ) : null}

      {reason ? (
        <>
          <SectionHeader title="NEDEN BU MOLA" palette={palette} />
          <Group palette={palette}>
            <Text style={[styles.reason, { color: palette.label }]}>{reason}</Text>
          </Group>
        </>
      ) : null}

      {alternatives.length ? (
        <>
          <SectionHeader title="DİĞER SEÇENEKLER" palette={palette} />
          <Group palette={palette}>
            {alternatives.map((alternative, index) => (
              <AlternativeRow
                key={`${alternative.name}-${index}`}
                alternative={alternative}
                divided={index > 0}
                palette={palette}
              />
            ))}
          </Group>
        </>
      ) : null}
    </>
  );
}

export const BreakDetailPanel = memo(BreakDetailPanelComponent);

const styles = StyleSheet.create({
  // The place card's photo strip: the group's full width, 180 tall — about
  // 2:1 on a phone, low enough that the name and "Haritalar'da aç" stay above
  // the fold at the middle detent. cover crops, so it is never letterboxed.
  // A plain height, not aspectRatio + maxHeight: when the ratio's height is
  // clamped Yoga derives the width back from the ratio, and the photo stops
  // short of the group's right edge.
  hero: {
    width: "100%",
    height: 180,
  },
  placeCell: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 3,
  },
  placeName: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  placeMeta: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400",
    letterSpacing: -0.2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  actionRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  actionText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "400",
    letterSpacing: -0.4,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: 16,
  },
  // Centres the 30 pt tile on the title's first line.
  tileSlot: {
    paddingTop: 7,
    marginRight: 12,
  },
  copy: {
    flex: 1,
    paddingTop: 12,
    paddingBottom: 12,
    paddingRight: 16,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  line: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  },
  reason: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400",
    letterSpacing: -0.2,
  },
});
