import * as Sentry from "@sentry/react-native";
import * as Application from "expo-application";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";

import { LegalTextModal } from "@/components/LegalTextViewer";
import { useTabBarContentInset } from "@/components/navigation/tabBarMetrics";
import { useTabScrollToTop } from "@/components/navigation/useTabScrollToTop";
import { IdentityCell } from "@/components/profile/IdentityCell";
import { formatLongDate } from "@/components/profile/profileFormat";
import {
  DestructiveRow,
  GroupFooter,
  ListGroup,
  Row,
  SectionHeader,
  SwitchRow,
} from "@/components/ui/GroupedList";
import { usePagePalette } from "@/components/ui/pagePalette";
import type { LegalTextKey } from "@/constants/legalTexts";
import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { LocalUserStorage } from "@/services/localUserStorage";

const APPEARANCE_LABELS = { system: "Sistem", light: "Açık", dark: "Koyu" } as const;

// Fixed for the life of a build: read once.
const VERSION_LINE =
  Application.nativeApplicationVersion && Application.nativeBuildVersion
    ? `Electrip AIRouting ${Application.nativeApplicationVersion} (${Application.nativeBuildVersion})`
    : null;

/**
 * Hesabım, as iOS Settings: the person's own cell, then preferences, privacy
 * and data (KVKK m.11: the legal texts point here as "Hesabım ekranı"), the
 * legal texts, support, and signing out. Every row that changes something
 * beyond a switch opens its own page; nothing acts on the first tap.
 */
export default function AccountScreen() {
  const router = useRouter();
  const palette = usePagePalette();
  const { colors, themePreference } = useTheme();
  const { user, logout } = useUser();
  const bottomInset = useTabBarContentInset();
  // Tapping Hesabım again scrolls back to the top, as iOS tab bars do.
  const scrollRef = useRef<ScrollView>(null);
  const scrollToTopProps = useTabScrollToTop(scrollRef);

  // The document stays set while the sheet slides away; only `legalOpen` closes it.
  const [legalDoc, setLegalDoc] = useState<LegalTextKey | null>(null);
  const [legalOpen, setLegalOpen] = useState(false);
  const openLegal = (key: LegalTextKey) => {
    setLegalDoc(key);
    setLegalOpen(true);
  };

  const [shareLocation, setShareLocation] = useState(true);
  useEffect(() => {
    void LocalUserStorage.getPreference("share_location").then((v) => setShareLocation(v !== "off"));
  }, [user?.id]);

  const toggleShareLocation = async (value: boolean) => {
    setShareLocation(value);
    await LocalUserStorage.setPreference("share_location", value ? "on" : "off");
  };

  // On by default; car mode picks a change up at once (onPreferenceChange).
  const [wakeWord, setWakeWord] = useState(true);
  useEffect(() => {
    void LocalUserStorage.getPreference("wake_word").then((v) => setWakeWord(v !== "off"));
  }, [user?.id]);

  const toggleWakeWord = async (value: boolean) => {
    setWakeWord(value);
    await LocalUserStorage.setPreference("wake_word", value ? "on" : "off");
  };

  const confirmLogout = () => {
    Alert.alert("Çıkış yapılsın mı?", "Kayıtlı rotalarınız ve tercihleriniz bu telefonda kalır.", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Çıkış yap", style: "destructive", onPress: () => void logout() },
    ]);
  };

  if (!user) return null;

  const interestCount = user.interests.length;
  const consentFooter = user.consent_at
    ? `Kullanım Koşulları'nı ve Aydınlatma Metni'ni ${formatLongDate(user.consent_at)} tarihinde onayladınız.`
    : user.consent_version
      ? "Kullanım Koşulları'nı ve Aydınlatma Metni'ni kayıt sırasında onayladınız."
      : null;

  return (
    <>
      <ScrollView
        ref={scrollRef}
        {...scrollToTopProps}
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        scrollIndicatorInsets={{ bottom: bottomInset }}
      >
        <ListGroup palette={palette} style={styles.identityGroup}>
          <IdentityCell
            palette={palette}
            firstName={user.first_name}
            lastName={user.last_name}
            maskedPhone={user.phone_number}
            onPress={() => router.push("/account/details")}
          />
        </ListGroup>

        <SectionHeader title="TERCİHLER" palette={palette} />
        <ListGroup palette={palette}>
          <Row
            palette={palette}
            title="İlgi alanları"
            tile={{ symbol: "heart.fill", color: palette.pink }}
            value={interestCount > 0 ? String(interestCount) : "Seçilmedi"}
            onPress={() => router.push("/account/interests")}
          />
          <Row
            palette={palette}
            title="Görünüm"
            tile={{ symbol: "sun.max.fill", color: palette.blue }}
            value={APPEARANCE_LABELS[themePreference]}
            onPress={() => router.push("/account/appearance")}
          />
          <SwitchRow
            palette={palette}
            title="“Electrip” komutunu dinle"
            tile={{ symbol: "waveform", color: palette.indigo }}
            value={wakeWord}
            onValueChange={toggleWakeWord}
            accessibilityHint="Sürüş sırasında “Electrip” diyerek konuşmayı başlatır"
          />
        </ListGroup>
        <GroupFooter
          palette={palette}
          text="Açıkken, sürüş sırasında “Electrip” diyerek konuşmayı başlatabilirsiniz. Dinleme telefonunuzda yapılır; siz seslenmeden ses telefondan çıkmaz."
        />

        <SectionHeader title="GİZLİLİK VE VERİLER" palette={palette} />
        {/* The switch's explanation is its group's footer, as in Settings, so the cell stays one line. */}
        <ListGroup palette={palette}>
          <SwitchRow
            palette={palette}
            title="Konum paylaşımı"
            tile={{ symbol: "location.fill", color: palette.blue }}
            value={shareLocation}
            onValueChange={toggleShareLocation}
            accessibilityHint="Kapalıyken konumunuz Electrip'e gönderilmez"
          />
        </ListGroup>
        <GroupFooter
          palette={palette}
          text="Kapalıyken konumunuz Electrip'e gönderilmez ve rotalar bulunduğunuz yerden planlanamaz."
        />

        <ListGroup palette={palette} style={styles.headerlessGroup}>
          <Row
            palette={palette}
            title="Verilerimi dışa aktar"
            tile={{ symbol: "square.and.arrow.up.fill", color: palette.green }}
            onPress={() => router.push("/account/export")}
          />
          <Row
            palette={palette}
            title="Hesabımı sil"
            tile={{ symbol: "trash.fill", color: palette.red }}
            onPress={() => router.push("/account/delete")}
          />
        </ListGroup>

        <SectionHeader title="YASAL" palette={palette} />
        <ListGroup palette={palette}>
          <Row
            palette={palette}
            title="Aydınlatma Metni"
            tile={{ symbol: "doc.text.fill", color: palette.gray }}
            onPress={() => openLegal("privacy")}
          />
          <Row
            palette={palette}
            title="Kullanım Koşulları"
            tile={{ symbol: "doc.plaintext.fill", color: palette.gray }}
            onPress={() => openLegal("terms")}
          />
        </ListGroup>
        {consentFooter ? <GroupFooter palette={palette} text={consentFooter} /> : null}

        <SectionHeader title="DESTEK" palette={palette} />
        <ListGroup palette={palette}>
          <Row
            palette={palette}
            title="Geri bildirim gönder"
            tile={{ symbol: "exclamationmark.bubble.fill", color: palette.orange }}
            accessory="none"
            onPress={() => Sentry.showFeedbackWidget()}
          />
        </ListGroup>

        <DestructiveRow label="Çıkış yap" onPress={confirmLogout} palette={palette} />

        {VERSION_LINE ? (
          <Text style={[styles.version, { color: palette.tertiaryLabel }]}>{VERSION_LINE}</Text>
        ) : null}
      </ScrollView>

      {/* After the list: a tab's first page keeps its scroll view first, for the large title. */}
      <LegalTextModal
        documentKey={legalDoc}
        visible={legalOpen}
        onClose={() => setLegalOpen(false)}
        colors={colors}
      />
    </>
  );
}

const styles = StyleSheet.create({
  identityGroup: {
    marginTop: 8,
  },
  // A group without a header after a footer: the destructive row's spacing.
  headerlessGroup: {
    marginTop: 28,
  },
  version: {
    marginTop: 24,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
});
