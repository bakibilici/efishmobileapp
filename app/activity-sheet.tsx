import { useFocusEffect, useRouter } from "expo-router";
import * as Location from "expo-location";
import { Pedometer } from "expo-sensors";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSharedValue } from "react-native-reanimated";

import {
  DETECTION_EXPLANATION,
  driveSummary,
  formatCount,
  formatHoldDuration,
  formatSpeed,
  opensSettings,
  permissionFooter,
  permissionKind,
  permissionLabel,
  stepBreakdown,
  type DriveSummary,
  type PermissionKind,
} from "@/components/activity-sheet/activitySheetModel";
import { supportsNativeActivitySheet } from "@/components/activity-sheet/nativeActivitySheet";
import { activityStatus } from "@/components/map-header/activityStatus";
import { SIDE_MARGIN, TitleBlock } from "@/components/route-sheet/Grouped";
import {
  SHEET_CLOSE_SIZE,
  SheetMotionContext,
  type SheetMotion,
} from "@/components/route-sheet/sheetMotion";
import { getNativeSheetPalette } from "@/components/route-sheet/sheetPalette";
import { GlassNavButton } from "@/components/ui/GlassNavButton";
import {
  GroupFooter,
  ListGroup,
  Row,
  SectionHeader,
  SectionParagraph,
} from "@/components/ui/GroupedList";
import type { IconSymbolName } from "@/components/ui/icon-symbol";
import { usePagePalette, type PagePalette } from "@/components/ui/pagePalette";
import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { useActivityState } from "@/hooks/useActivityState";
import { toDisplayKmh, useSpeed } from "@/hooks/useSpeed";
import { useStepCount } from "@/hooks/useStepCount";
import { ActivityState } from "@/services/ActivityStateMachine";
import { ActivityStateDuration } from "@/services/ActivityStateDuration";
import { DriveSessionHistoryStorage } from "@/services/driveSessionHistory";

/**
 * "Hareket Durumu": what the map's status capsule is saying, in full.
 *
 * Every line is read from a store the app already keeps — the activity state
 * machine, the step store, the drive history, the phone's own permissions —
 * and a store with no answer is printed as such ("Bu oturumda değişmedi",
 * "Henüz ölçülmedi", "—"). Nothing here is estimated, and nothing is drawn
 * that the app does not measure: no charts, no daily goal.
 *
 * It is presented as the route panel is: the system's own sheet on iOS 26
 * (components/activity-sheet/nativeActivitySheet.ts), a modal page elsewhere.
 * react-native-screens 4.16 lays a form sheet's scroll view out right only
 * when it is the screen's one top-level view, so the Close button is the
 * scroll view's first child, pinned as a sticky header (app/route-sheet.tsx).
 */

/** Room under the system grabber before the button and the title, as the route sheet has it. */
const TOP_PADDING = 22;
/** Around the button inside its sticky slot, so its 44 pt touch area stays inside. */
const BUTTON_SLOT_SLACK = 6;
/** The sticky slot's own height, before the safe area a modal page adds to it. */
const BUTTON_SLOT_H = TOP_PADDING + SHEET_CLOSE_SIZE + BUTTON_SLOT_SLACK;
const STICKY_BUTTON_SLOT = [0];
/** The held state is shown in minutes: a slow tick keeps it true while the sheet is open. */
const HOLD_TICK_MS = 30_000;

type StateLook = { glyph: "car-sport" | "walk" | "footsteps" | "flash" | "moon"; symbol: IconSymbolName; color: string };

/**
 * The tile for a state. The fill is a palette colour rather than the
 * capsule's glyph colour: a tile is a white glyph on a filled square (the
 * app's own SymbolTile), and the capsule's mint and yellow carry no white.
 */
function stateLook(state: ActivityState, palette: PagePalette): StateLook {
  switch (state) {
    case ActivityState.CAR:
      return { glyph: "car-sport", symbol: "car.fill", color: palette.orange };
    case ActivityState.WALKING:
      return { glyph: "walk", symbol: "figure.walk", color: palette.green };
    case ActivityState.RUNNING:
      return { glyph: "footsteps", symbol: "figure.run", color: palette.indigo };
    case ActivityState.CHARGING:
      return { glyph: "flash", symbol: "bolt.batteryblock.fill", color: palette.teal };
    default:
      return { glyph: "moon", symbol: "moon.zzz.fill", color: palette.gray };
  }
}

type DrivesState =
  | { kind: "loading" }
  | { kind: "no-user" }
  | { kind: "error" }
  | { kind: "ready"; summary: DriveSummary };

export default function ActivitySheetScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const native = supportsNativeActivitySheet();
  const { colors, themeScheme } = useTheme();
  const { user } = useUser();
  const page = usePagePalette();

  // The system sheet draws its own material, and the opaque white of a page
  // cell vanishes on its opaque top: on that path the screen wears the route
  // sheet's whole palette (the same values app/route-sheet.tsx uses), keeping
  // only the page's background, accent and accentFill, which the sheet
  // palette does not carry.
  const palette = useMemo<PagePalette>(
    () => (native ? { ...page, ...getNativeSheetPalette(page.isDark) } : page),
    [native, page],
  );

  const activityState = useActivityState();
  const steps = useStepCount();
  const speed = useSpeed();
  const displaySpeed = toDisplayKmh(speed);
  const status = activityStatus(activityState, displaySpeed, colors, themeScheme === "dark");
  const look = stateLook(activityState, palette);
  const breakdown = stepBreakdown(steps);
  const speedText = formatSpeed(displaySpeed);

  // How long the state has held, in whole minutes: it only needs a slow tick.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    ActivityStateDuration.start();
    const timer = setInterval(() => setNow(Date.now()), HOLD_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const holdText =
    formatHoldDuration(ActivityStateDuration.heldMs(activityState, now)) ??
    "Bu oturumda değişmedi";

  const [drives, setDrives] = useState<DrivesState>({ kind: "loading" });
  const [motion, setMotion] = useState<PermissionKind>("unknown");
  const [location, setLocation] = useState<PermissionKind>("unknown");

  const userId = user?.id ?? null;

  // Read again on every focus: a trip to Ayarlar and back must show the
  // permission that was just changed, and a drive finished meanwhile counts.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      if (userId == null) {
        setDrives({ kind: "no-user" });
      } else {
        // A read that throws (a locked database, a row the app cannot parse)
        // says so, as the two permission reads below do; it never leaves the
        // section spinning on a promise nobody is waiting for.
        void DriveSessionHistoryStorage.listSessions(userId)
          .then((records) => {
            if (active) setDrives({ kind: "ready", summary: driveSummary(records, new Date()) });
          })
          .catch(() => active && setDrives({ kind: "error" }));
      }

      // Read only: neither call asks for a permission, they only report one.
      void Pedometer.getPermissionsAsync()
        .then((response) => active && setMotion(permissionKind(response)))
        .catch(() => active && setMotion("unknown"));
      void Location.getForegroundPermissionsAsync()
        .then((response) => active && setLocation(permissionKind(response)))
        .catch(() => active && setLocation("unknown"));

      return () => {
        active = false;
      };
    }, [userId]),
  );

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const close = useCallback(() => router.back(), [router]);

  // The route sheet's title mechanics: the title keeps the Close button's
  // room free beside its first line (Grouped/TitleBlock reads this).
  const topProgress = useSharedValue(1);
  const titleShift = useSharedValue(0);
  const sheetMotion = useMemo<SheetMotion>(
    () => ({ topProgress, hasBack: false, hasClose: true, titleShift }),
    [topProgress, titleShift],
  );

  // The sheet's own formatters, not the capsule's. The capsule prints
  // "? km/sa" for a car with no fix yet (activityStatus, which belongs to the
  // detection); this screen does not hold a question mark up as a value — an
  // unmeasured speed simply drops out here and the Hız row speaks to it.
  const subtitle = [status.label, speedText, status.showSteps ? `${formatCount(breakdown.total)} adım` : null]
    .filter((part): part is string => !!part)
    .join(" · ");

  const permissionRow = (
    title: string,
    kind: PermissionKind,
    tile: { symbol: IconSymbolName; color: string },
  ) => {
    const canOpen = opensSettings(kind);
    return (
      <Row
        palette={palette}
        title={title}
        value={permissionLabel(kind)}
        tile={tile}
        accessory={canOpen ? "chevron" : "none"}
        onPress={canOpen ? openSettings : undefined}
        accessibilityHint={canOpen ? "Ayarlar uygulamasını açar." : undefined}
      />
    );
  };

  return (
    <SheetMotionContext.Provider value={sheetMotion}>
      {/* The screen's one top-level view. On the system sheet it has no
          background (the glass shows through); as a modal page it paints
          the grouped background itself. */}
      <ScrollView
        style={native ? undefined : { backgroundColor: palette.background }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={STICKY_BUTTON_SLOT}
        onAccessibilityEscape={close}
      >
        {/* The safe area belongs to the slot's height as well as its padding:
            a modal page starts under the status bar, and a slot that kept the
            native height would draw the button below its own box, on top of
            the title the negative margin pulls up. */}
        <View
          style={[
            styles.buttonSlot,
            {
              paddingTop: TOP_PADDING + (native ? 0 : insets.top),
              height: BUTTON_SLOT_H + (native ? 0 : insets.top),
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.buttonRow} pointerEvents="box-none">
            <View />
            <GlassNavButton
              symbol="xmark"
              size={SHEET_CLOSE_SIZE}
              onPress={close}
              onAccessibilityEscape={close}
              accessibilityLabel="Kapat"
              accessibilityHint="Hareket durumunu gizler."
            />
          </View>
        </View>

        <View style={styles.panel}>
          <TitleBlock
            title="Hareket Durumu"
            subtitle={subtitle}
            tile={{ glyph: look.glyph, color: look.color }}
            palette={palette}
          />

          <SectionHeader title="DURUM" palette={palette} />
          <ListGroup palette={palette}>
            <Row
              palette={palette}
              title="Durum"
              value={status.label}
              tile={{ symbol: look.symbol, color: look.color }}
            />
            <Row
              palette={palette}
              title="Bu durumda"
              value={holdText}
              tile={{ symbol: "timer", color: palette.gray }}
            />
            <Row
              palette={palette}
              title="Hız"
              value={speedText ?? "Henüz ölçülmedi"}
              tile={{ symbol: "speedometer", color: palette.blue }}
            />
          </ListGroup>
          {speedText ? null : (
            <GroupFooter
              palette={palette}
              text="Hız yalnızca konum servisinden gelir; kapalı alanlarda ya da yeni başlayan bir harekette bir süre boş kalabilir."
            />
          )}

          <SectionHeader title="BUGÜNKÜ ADIMLAR" palette={palette} />
          <ListGroup palette={palette}>
            <Row
              palette={palette}
              title="Toplam"
              value={formatCount(breakdown.total)}
              tabularValue
              tile={{ symbol: "figure.walk", color: palette.green }}
            />
            <Row
              palette={palette}
              title="Sensörden gelen"
              value={formatCount(breakdown.raw)}
              tabularValue
              tile={{ symbol: "waveform", color: palette.gray }}
            />
            {breakdown.bonus > 0 ? (
              <Row
                palette={palette}
                title="Şarj ikramı"
                value={`+${formatCount(breakdown.bonus)}`}
                tabularValue
                tile={{ symbol: "bolt.fill", color: palette.orange }}
              />
            ) : null}
            <Row
              palette={palette}
              title="Şarj durumu"
              value={breakdown.isCharging ? "Bağlı" : "Bağlı değil"}
              tile={{
                symbol: "bolt.batteryblock.fill",
                color: breakdown.isCharging ? palette.green : palette.gray,
              }}
            />
          </ListGroup>
          <GroupFooter
            palette={palette}
            text={
              breakdown.isEmpty
                ? "Bugün henüz adım kaydedilmedi. Telefonunuz şarjdayken atılan adımlar iki kat sayılır."
                : "Telefonunuz şarjdayken atılan adımlar iki kat sayılır."
            }
          />

          <SectionHeader title="BUGÜNKÜ SÜRÜŞLER" palette={palette} />
          {drives.kind === "loading" ? (
            <SectionParagraph palette={palette} text="Sürüş geçmişi okunuyor…" />
          ) : drives.kind === "error" ? (
            <SectionParagraph
              palette={palette}
              text="Sürüş geçmişi şu anda okunamıyor. Ekranı kapatıp yeniden açtığınızda tekrar denenir."
            />
          ) : drives.kind === "no-user" ? (
            <SectionParagraph
              palette={palette}
              text="Sürüş geçmişi hesabınıza kayıtlıdır. Giriş yaptığınızda burada görünür."
            />
          ) : drives.summary.count === 0 ? (
            <SectionParagraph palette={palette} text="Bugün kayıtlı sürüş yok." />
          ) : (
            <ListGroup palette={palette}>
              <Row
                palette={palette}
                title="Sürüş sayısı"
                value={formatCount(drives.summary.count)}
                tabularValue
                tile={{ symbol: "car.fill", color: palette.orange }}
              />
              <Row
                palette={palette}
                title="Toplam mesafe"
                value={drives.summary.distanceText}
                tabularValue
                tile={{ symbol: "ruler", color: palette.teal }}
              />
              {drives.summary.last ? (
                <Row
                  palette={palette}
                  title={drives.summary.last.title}
                  subtitle={`Son sürüş · ${drives.summary.last.timeText}`}
                  tile={{ symbol: "clock.arrow.circlepath", color: palette.indigo }}
                />
              ) : null}
            </ListGroup>
          )}

          <SectionHeader title="İZİNLER" palette={palette} />
          <ListGroup palette={palette}>
            {permissionRow("Hareket ve Fitness", motion, {
              symbol: "figure.walk",
              color: palette.green,
            })}
            {permissionRow("Konum", location, { symbol: "location.fill", color: palette.blue })}
          </ListGroup>
          <GroupFooter palette={palette} text={permissionFooter(motion, location)} />

          <SectionHeader title="AKBA NASIL KARAR VERİYOR" palette={palette} />
          <SectionParagraph palette={palette} text={DETECTION_EXPLANATION} />
        </View>
      </ScrollView>
    </SheetMotionContext.Provider>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 60,
  },
  // The sheet's width, the Close button at its trailing edge over the title's
  // first line. Sized explicitly: a sticky header gives its child flex 1,
  // which without a height stretches the slot over the whole sheet.
  buttonSlot: {
    pointerEvents: "box-none",
    height: BUTTON_SLOT_H,
    paddingHorizontal: SIDE_MARGIN,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  // Up beside the pinned button: the title's first line centres on it.
  panel: {
    marginTop: -(SHEET_CLOSE_SIZE + BUTTON_SLOT_SLACK),
  },
});
