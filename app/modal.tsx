import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

type Params = { name?: string; lat?: string; lng?: string };

const brandGreen = '#2CDD9D';

export default function NavigationModal() {
  const router = useRouter();
  const { name, lat, lng } = useLocalSearchParams<Params>();
  const latitude = Number(lat);
  const longitude = Number(lng);

  const openUrl = async (url: string) => {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      Linking.openURL(url);
    } else {
      // eslint-disable-next-line no-console
      console.warn('Cannot open maps URL', url);
    }
  };

  const openAppleMaps = () => {
    const url = `http://maps.apple.com/?daddr=${latitude},${longitude}&q=${encodeURIComponent(name || 'efish station')}`;
    openUrl(url);
  };

  const openGoogleMaps = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
    openUrl(url);
  };

  const openYandex = () => {
    const native = `yandexnavi://build_route_on_map?lat_to=${latitude}&lon_to=${longitude}`;
    const fallback = `https://yandex.com/maps/?rtext=~${latitude}%2C${longitude}&rtt=auto`;
    openUrl(native).catch(() => openUrl(fallback));
  };

  const quickStart =
    Platform.OS === 'ios' ? openAppleMaps : Platform.OS === 'android' ? openGoogleMaps : openGoogleMaps;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Take me there</Text>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={26} color="#0f231c" />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>{name || 'efish station'}</Text>
        <View style={styles.card}>
          <Pressable style={styles.primary} onPress={quickStart}>
            <Ionicons name="navigate" size={18} color="#0b2319" />
            <Text style={styles.primaryText}>Start navigation</Text>
          </Pressable>
          <View style={styles.row}>
            <ActionButton label="Apple Maps" icon="logo-apple" onPress={openAppleMaps} />
            <ActionButton label="Google Maps" icon="logo-google" onPress={openGoogleMaps} />
            <ActionButton label="Yandex" icon="compass" onPress={openYandex} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.option} onPress={onPress}>
      <Ionicons name={icon} size={20} color="#0f231c" />
      <Text style={styles.optionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7fdfb' },
  container: { flex: 1, padding: 20, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#0f231c' },
  subtitle: { color: '#4a5a66', marginBottom: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 5,
  },
  primary: {
    backgroundColor: brandGreen,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryText: { fontWeight: '800', color: '#0b2319', fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  option: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#e2f1eb',
    alignItems: 'center',
    gap: 6,
  },
  optionLabel: { fontWeight: '700', color: '#0f231c' },
});
