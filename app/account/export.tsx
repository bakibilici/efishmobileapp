import { Stack } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";

import { usePushedPageOptions } from "@/components/navigation/stackOptions";
import { exportUserData } from "@/components/profile/accountActions";
import { PageHero } from "@/components/profile/PageHero";
import { formatClock } from "@/components/profile/profileFormat";
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

/** The "Dosya hazırlandı" line under the button, with the bar's gap over it. */
const STATUS_LINE_HEIGHT = 18 + 8;

const ROUTES_DETAIL =
  "başlangıç ve varış noktaları, şarj durakları ve batarya seviyeleri, varsa mola önerileri, mesafe, süre, tarihler ve rota çizgisi";

function routesSubtitle(count: number | null): string {
  if (count === null) return ROUTES_DETAIL.charAt(0).toUpperCase() + ROUTES_DETAIL.slice(1);
  if (count === 0) return "Henüz kayıtlı rota yok";
  return `${count} rota: ${ROUTES_DETAIL}`;
}

/**
 * Verilerimi dışa aktar (KVKK m.11): says what the file will hold and where
 * it goes before anything happens. Only the pinned button writes the file.
 */
export default function ExportDataScreen() {
  const palette = usePagePalette();
  const options = usePushedPageOptions("Verilerimi dışa aktar");
  const bottomInset = useBottomActionBarInset();
  const { user } = useUser();

  // Read only: how many routes the file would hold.
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

  const [exporting, setExporting] = useState(false);
  const [preparedAt, setPreparedAt] = useState<Date | null>(null);

  const handleExport = async () => {
    if (!user || exporting) return;
    setExporting(true);
    try {
      await exportUserData(user);
      setPreparedAt(new Date());
    } catch (err) {
      console.warn(err);
      Alert.alert("Dışa aktarma başarısız", "Dosya oluşturulamadı. Lütfen tekrar deneyin.");
    } finally {
      setExporting(false);
    }
  };

  if (!user) return null;

  const scrollBottom = bottomInset + (preparedAt ? STATUS_LINE_HEIGHT : 0);

  return (
    <>
      <Stack.Screen options={options} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={{ paddingBottom: scrollBottom }}
        scrollIndicatorInsets={{ bottom: scrollBottom }}
      >
        <PageHero
          palette={palette}
          symbol="square.and.arrow.up.fill"
          color={palette.green}
          title="Verilerinizin bir kopyası"
          body="Profilinizi ve kayıtlı rotalarınızı tek bir dosyada toplar. Dosyayı nereye kaydedeceğinize ya da kiminle paylaşacağınıza siz karar verirsiniz."
        />

        <SectionHeader title="DOSYADA YER ALANLAR" palette={palette} />
        <ListGroup palette={palette}>
          <Row
            palette={palette}
            title="Profil bilgileri"
            subtitle="Ad, soyad, telefonun ülke kodu ve son dört hanesi, ilgi alanları"
            tile={{ symbol: "person.fill", color: palette.blue }}
          />
          <Row
            palette={palette}
            title="Onay kaydı"
            subtitle="Onayladığınız metin sürümü, onay tarihi ve hesabın açıldığı tarih"
            tile={{ symbol: "checkmark.seal.fill", color: palette.orange }}
          />
          <Row
            palette={palette}
            title="Kayıtlı rotalar"
            subtitle={routesSubtitle(routeCount)}
            tile={{ symbol: "map.fill", color: palette.teal }}
          />
        </ListGroup>
        <GroupFooter
          palette={palette}
          text="Görünüm, konum paylaşımı ve “AKBA” komutu gibi cihaz ayarları, mola tercihleriniz ve son aramalarınız dosyaya eklenmez."
        />

        <SectionHeader title="PAYLAŞIM" palette={palette} />
        <SectionParagraph
          palette={palette}
          text="Dosya JSON biçiminde bu telefonda oluşturulur, ardından paylaşım ekranı açılır; Dosyalar'a kaydedebilir ya da seçtiğiniz bir uygulamayla gönderebilirsiniz. AKBA dosyayı hiçbir sunucuya göndermez. Oluşturulan her dosyanın bir kopyası uygulamanın klasöründe kalır ve hesabınızı silseniz de silinmez."
        />

        <SectionHeader title="KVKK" palette={palette} />
        <SectionParagraph
          palette={palette}
          text="Bu dosya, 6698 sayılı KVKK'nın 11. maddesindeki haklarınızı kullanabilmeniz için hazırlanır. AKBA sunucusundaki oturum özetleri dosyada yer almaz; bunlar için info@uptecra.com adresine yazabilirsiniz."
        />
      </ScrollView>

      <BottomActionBar>
        <GlassCapsuleButton
          title="Dosyayı oluştur ve paylaş"
          loading={exporting}
          loadingTitle="Hazırlanıyor…"
          accessibilityHint="JSON dosyası oluşturur ve paylaşım ekranını açar"
          onPress={() => void handleExport()}
        />
        {/* Under the button, where the bar's background is already opaque:
            above it, the fade would let the list show through the line. */}
        {preparedAt ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.status, { color: palette.secondaryLabel }]}
          >
            {`Dosya hazırlandı · ${formatClock(preparedAt)}`}
          </Text>
        ) : null}
      </BottomActionBar>
    </>
  );
}

const styles = StyleSheet.create({
  status: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
});
