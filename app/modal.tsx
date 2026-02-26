import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type Params = { name?: string; lat?: string; lng?: string };

const appColors = {
  apple: '#000000',
  google: '#4285F4',
  yandex: '#FC3F1D',
};

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

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Navigate with</Text>
        <Text style={styles.subtitle}>{name || 'Selected Station'}</Text>

        <View style={styles.appsGrid}>
          {Platform.OS === 'ios' && (
            <AppIcon
              label="Apple Maps"
              icon="logo-apple"
              color={appColors.apple}
              onPress={openAppleMaps}
              library="Ionicons"
            />
          )}
          <AppIcon
            label="Google Maps"
            icon="logo-google"
            color={appColors.google}
            onPress={openGoogleMaps}
            library="Ionicons"
          />
          <AppIcon
            label="Yandex"
            icon="compass"
            color={appColors.yandex}
            onPress={openYandex}
            library="Ionicons"
          />
        </View>

        <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AppIcon({
  label,
  icon,
  color,
  onPress,
  library
}: {
  label: string;
  icon: any;
  color: string;
  onPress: () => void;
  library?: string
}) {
  return (
    <Pressable style={styles.appItem} onPress={onPress}>
      <View style={[styles.iconBox, { backgroundColor: color }]}>
        <Ionicons name={icon} size={32} color="#fff" />
      </View>
      <Text style={styles.appLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent', // User requested removing the dark overlay
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f231c',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6e7f8d',
    marginBottom: 32,
    textAlign: 'center',
  },
  appsGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 40,
    width: '100%',
  },
  appItem: {
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 18, // App icon shape (Squircle-ish)
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  appLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f231c',
  },
  cancelBtn: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 100,
    backgroundColor: '#F5F5F5',
    width: '100%',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF3B30', // Destructive/Cancel color
  },
});
