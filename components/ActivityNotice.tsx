import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useActivityState } from "@/hooks/useActivityState";
import { ActivityState } from "@/services/ActivityStateMachine";

const AUTO_HIDE_MS = 8000;

type Notice = { icon: keyof typeof Ionicons.glyphMap; text: string };

function noticeFor(prev: ActivityState, next: ActivityState): Notice | null {
  switch (next) {
    case ActivityState.IDLE:
      return prev === ActivityState.UNKNOWN
        ? null
        : { icon: "moon", text: "Bekleme bildirimi: hareketsiz görünüyorsunuz." };
    case ActivityState.CAR:
      return { icon: "car-sport", text: "Sürüş algılandı. AKBA sürüş moduna geçiyor." };
    case ActivityState.CHARGING:
      return { icon: "flash", text: "Şarj algılandı. Adımlarınız 2 kat sayılıyor." };
    case ActivityState.WALKING:
      return prev === ActivityState.IDLE ? { icon: "walk", text: "Yürüyüş algılandı." } : null;
    case ActivityState.RUNNING:
      return { icon: "walk", text: "Koşu algılandı." };
    default:
      return null;
  }
}

/**
 * The state notifications promised for the activity FSM: shown on every
 * committed transition, dismissed by a tap anywhere on the banner or after
 * eight seconds. Purely client-side, no OS notification permission needed.
 */
export function ActivityNotice({ dark }: { dark?: boolean }) {
  const activity = useActivityState();
  const prevRef = useRef<ActivityState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = activity;
    if (prev === null || prev === activity) return; // boot state is not a transition
    const next = noticeFor(prev, activity);
    if (!next) return;
    setNotice(next);
    const timer = setTimeout(() => setNotice(null), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [activity]);

  if (!notice) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Bildirimi kapat"
      onPress={() => setNotice(null)}
      style={[styles.banner, dark ? styles.bannerDark : styles.bannerLight]}
    >
      <Ionicons name={notice.icon} size={16} color={dark ? "#fff" : "#0f172a"} />
      <Text style={[styles.text, { color: dark ? "#fff" : "#0f172a" }]} numberOfLines={2}>
        {notice.text}
      </Text>
      <Text style={[styles.dismiss, { color: dark ? "rgba(255,255,255,0.6)" : "rgba(15,23,42,0.5)" }]}>
        Kapat
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  bannerLight: { backgroundColor: "rgba(255,255,255,0.92)", borderColor: "rgba(15,23,42,0.08)" },
  bannerDark: { backgroundColor: "rgba(30,41,59,0.92)", borderColor: "rgba(255,255,255,0.12)" },
  text: { flex: 1, fontSize: 13, fontWeight: "600" },
  dismiss: { fontSize: 12, fontWeight: "600" },
});
