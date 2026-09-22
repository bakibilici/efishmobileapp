import { Stack, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet } from "react-native";

import { usePushedPageOptions } from "@/components/navigation/stackOptions";
import { deleteAccount } from "@/components/profile/accountActions";
import { PageHero } from "@/components/profile/PageHero";
import {
  BottomActionBar,
  GlassCapsuleButton,
  useBottomActionBarInset,
} from "@/components/ui/GlassCapsuleButton";
import {
  GroupFooter,
  ListGroup,
  Row,
  SectionHeader,
  SectionParagraph,
} from "@/components/ui/GroupedList";
import { usePagePalette } from "@/components/ui/pagePalette";
import { useUser } from "@/context/UserContext";
import { DriveSessionHistoryStorage } from "@/services/driveSessionHistory";

function routesSubtitle(count: number | null): string {
  if (count === null) return "Rotalar ve ayrıntıları";
  if (count === 0) return "Kayıtlı rota yok";
  return `${count} rota ve ayrıntıları`;
}

/**
 * Hesabımı sil (KVKK m.11): what goes, what stays and what the server does,
 * before the one button, which still asks once more (a system alert).
 * Nothing is deleted by opening the page.
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const palette = usePagePalette();
  const bottomInset = useBottomActionBarInset();
  const { user, logout } = useUser();

  const [deleting, setDeleting] = useState(false);
  const baseOptions = usePushedPageOptions("Hesabımı sil");
  // No way back mid-deletion: the page ends by going to the sign-in screen.
  const options = useMemo(
    () => ({ ...baseOptions, gestureEnabled: !deleting, headerBackVisible: !deleting }),
    [baseOptions, deleting],
  );

  // Read only: how many routes would go.
  const [routeCount, setRouteCount] = useState<number | null>(null);
  const userId = user?.id;
  useEffect(() => {
    if (userId == null) return;
    let active = true;
    void DriveSessionHistoryStorage.listSessions(userId).then((rows) => {
      if (active) setRouteCount(rows.length);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const run = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      // On success logout has already replaced the stack with "/": no state to set.
      await deleteAccount(user, logout);
    } catch (error) {
      console.warn(error);
      setDeleting(false);
      Alert.alert("Hesap silinemedi", "Lütfen tekrar deneyin.");
    }
  };

  const confirm = () => {
    Alert.alert(
      "Hesabınız silinsin mi?",
      "Profiliniz ve kayıtlı rotalarınız bu telefondan hemen silinir. Bu işlem geri alınamaz.",
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Hesabımı sil", style: "destructive", onPress: () => void run() },
      ],
    );
  };

  // The person can be signed out mid-flow (the deletion itself does it).
  if (!user) return null;

  return (
    <>
      <Stack.Screen options={options} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        scrollIndicatorInsets={{ bottom: bottomInset }}
      >
        <PageHero
          palette={palette}
          symbol="trash.fill"
          color={palette.red}
          title="Hesabınızı silmeden önce"
          body="Silme işlemi geri alınamaz. Aşağıda nelerin silineceğini ve nelerin bu telefonda kalacağını görebilirsiniz."
        />

        <SectionHeader title="BU TELEFONDAN SİLİNECEKLER" palette={palette} />
        <ListGroup palette={palette}>
          <Row
            palette={palette}
            title="Profiliniz"
            subtitle="Ad, soyad, telefon bilgisi, ilgi alanları ve onay kaydı"
            tile={{ symbol: "person.fill", color: palette.gray }}
          />
          <Row
            palette={palette}
            title="Kayıtlı rotalarınız"
            subtitle={routesSubtitle(routeCount)}
            tile={{ symbol: "map.fill", color: palette.teal }}
          />
          <Row
            palette={palette}
            title="Mola tercihleriniz"
            subtitle="AKBA'ya önermemesini söylediğiniz mola türleri"
            tile={{ symbol: "nosign", color: palette.orange }}
          />
          <Row
            palette={palette}
            title="Giriş bilgileri"
            subtitle="Bu telefondaki girişiniz kapatılır"
            tile={{ symbol: "key.fill", color: palette.gray }}
          />
        </ListGroup>

        <SectionHeader title="SUNUCUDA" palette={palette} />
        <ListGroup palette={palette}>
          <Row
            palette={palette}
            title="Oturum özetleri"
            subtitle="AKBA sunucusundan en geç 30 gün içinde kaldırılır"
            tile={{ symbol: "server.rack", color: palette.indigo }}
          />
        </ListGroup>

        <SectionHeader title="BU TELEFONDA KALANLAR" palette={palette} />
        <SectionParagraph
          palette={palette}
          text="Görünüm, konum paylaşımı, “AKBA” komutu ve batarya ayarları gibi cihaz ayarları, son aramalar ve daha önce dışa aktardığınız dosyalar bu telefonda kalır. Bunlar, uygulamayı telefonunuzdan kaldırdığınızda silinir."
        />

        <ListGroup palette={palette} style={styles.exportGroup}>
          <Row
            palette={palette}
            title="Önce verilerimi dışa aktar"
            tile={{ symbol: "square.and.arrow.up.fill", color: palette.green }}
            disabled={deleting}
            onPress={() => router.push("/account/export")}
          />
        </ListGroup>
        <GroupFooter palette={palette} text="Silme tamamlanınca giriş ekranına dönersiniz." />
      </ScrollView>

      <BottomActionBar>
        <GlassCapsuleButton
          title="Hesabımı sil"
          tone="destructive"
          loading={deleting}
          loadingTitle="Siliniyor…"
          accessibilityHint="Son bir onaydan sonra hesabınızı bu telefondan siler"
          onPress={confirm}
        />
      </BottomActionBar>
    </>
  );
}

const styles = StyleSheet.create({
  // A group without a header after a paragraph: the space a header would take.
  exportGroup: {
    marginTop: 28,
  },
});
