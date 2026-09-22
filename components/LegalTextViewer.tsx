import React, { useCallback, useRef } from "react";
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GlassSurface } from "@/components/ui/glass";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { usePagePalette } from "@/components/ui/pagePalette";
import { LEGAL_TEXTS, LegalTextKey } from "@/constants/legalTexts";

const END_TOLERANCE_PX = 24;
/** The sheet's close button: the smallest touch target (HIG). */
const CLOSE_SIZE = 44;

type Colors = { text: string; textSecondary: string; card: string; border: string; primary: string; backgroundSecondary: string };

/**
 * Renders a legal document natively and reports when the reader has reached
 * its end. Unlike the previous PDF preview, "Okudum" cannot be tapped before
 * the last paragraph has been on screen.
 */
export function LegalScrollText({
  documentKey,
  colors,
  onReachEnd,
}: {
  documentKey: LegalTextKey;
  colors: Colors;
  onReachEnd?: () => void;
}) {
  const doc = LEGAL_TEXTS[documentKey];
  const reached = useRef(false);
  const layoutHeight = useRef(0);

  const fire = useCallback(() => {
    if (reached.current) return;
    reached.current = true;
    onReachEnd?.();
  }, [onReachEnd]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - END_TOLERANCE_PX) fire();
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      onScroll={onScroll}
      scrollEventThrottle={100}
      onLayout={(e) => { layoutHeight.current = e.nativeEvent.layout.height; }}
      onContentSizeChange={(_w, h) => { if (layoutHeight.current && h <= layoutHeight.current + END_TOLERANCE_PX) fire(); }}
    >
      {doc.paragraphs.map((p, i) => {
        const heading = p.length < 90 && p === p.toLocaleUpperCase("tr-TR") && /[A-ZÇĞİÖŞÜ]/.test(p);
        return (
          <Text
            key={i}
            style={[heading ? styles.heading : styles.paragraph, { color: heading ? colors.text : colors.textSecondary }]}
          >
            {p}
          </Text>
        );
      })}
      <Text style={[styles.endMark, { color: colors.textSecondary }]}>— Metnin sonu —</Text>
    </ScrollView>
  );
}

/**
 * Read-only sheet used from Hesabım. Reading here unlocks nothing, so it
 * has no progress footer. The close button is the sheet's one control and
 * so the one piece of Liquid Glass (GlassSurface falls back to a frosted or
 * opaque circle); the text itself stays plain.
 */
export function LegalTextModal({
  documentKey,
  visible,
  onClose,
  colors,
}: {
  documentKey: LegalTextKey | null;
  visible: boolean;
  onClose: () => void;
  colors: Colors;
}) {
  const palette = usePagePalette();
  if (!documentKey) return null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={[styles.modal, { backgroundColor: colors.card }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>
            {LEGAL_TEXTS[documentKey].title}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" style={styles.close}>
            <GlassSurface radius={CLOSE_SIZE / 2} interactive style={styles.closeGlass}>
              <IconSymbol name="xmark" size={17} weight="semibold" color={palette.label} />
            </GlassSurface>
          </Pressable>
        </View>
        <LegalScrollText documentKey={documentKey} colors={colors} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  heading: { fontSize: 14, fontWeight: "700", marginTop: 8 },
  paragraph: { fontSize: 14, lineHeight: 21 },
  endMark: { textAlign: "center", fontSize: 12, marginTop: 16 },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: "600", letterSpacing: -0.4 },
  close: { width: CLOSE_SIZE, height: CLOSE_SIZE },
  closeGlass: { flex: 1, alignItems: "center", justifyContent: "center" },
});
