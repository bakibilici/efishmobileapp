import React, { useCallback, useRef, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { LEGAL_TEXTS, LegalTextKey } from "@/constants/legalTexts";

const END_TOLERANCE_PX = 24;

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

/** Read-only modal used from the profile screen ("Sözleşmeler"). */
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
  const [atEnd, setAtEnd] = useState(false);
  if (!documentKey) return null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={[styles.modal, { backgroundColor: colors.card }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>{LEGAL_TEXTS[documentKey].title}</Text>
          <Pressable onPress={onClose} accessibilityLabel="Kapat" style={[styles.close, { backgroundColor: colors.backgroundSecondary }]}>
            <Ionicons name="close" size={18} color={colors.text} />
          </Pressable>
        </View>
        <LegalScrollText documentKey={documentKey} colors={colors} onReachEnd={() => setAtEnd(true)} />
        <Text style={[styles.footer, { color: colors.textSecondary }]}>
          {atEnd ? "Metnin tamamı görüntülendi." : "Tamamını okumak için aşağı kaydırın."}
        </Text>
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
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  footer: { textAlign: "center", fontSize: 12, padding: 12 },
});
