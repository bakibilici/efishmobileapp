import React from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { Flash, TicketDiscount, Wallet2, InfoCircle, ArrowLeft } from 'iconsax-react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

const MOCK_NOTIFICATIONS = [
  {
    id: "1",
    type: "charge",
    title: "Charging Completed",
    description: "Your vehicle has reached 100% battery at HPC Station #A12. Please move your car to avoid idle fees.",
    time: "10 min ago",
    unread: true
  },
  {
    id: "2",
    type: "offer",
    title: "Weekend Discount!",
    description: "Enjoy 20% off on all AC charging sessions this weekend. Tap to claim your voucher.",
    time: "2 hours ago",
    unread: true
  },
  {
    id: "3",
    type: "wallet",
    title: "efish Coins Earned",
    description: "You just earned 150 efish coins from your last green charge session.",
    time: "1 day ago",
    unread: false
  },
  {
    id: "4",
    type: "info",
    title: "New Station Nearby",
    description: "A new 300kW HPC station has opened just 5km away from your saved Home location.",
    time: "2 days ago",
    unread: false
  },
  {
    id: "5",
    type: "charge",
    title: "Session Started",
    description: "Charging session initiated at DC Station #C04. We'll notify you when it's complete.",
    time: "3 days ago",
    unread: false
  }
];

export default function NotificationsScreen() {
  const router = useRouter();
  const { themeScheme, colors } = useTheme();
  const isDark = themeScheme === 'dark';
  const insets = useSafeAreaInsets();

  const getIcon = (type: string) => {
    switch(type) {
      case 'charge': return <Flash size={24} color="#7C4DFF" variant="Bold" />;
      case 'offer': return <TicketDiscount size={24} color="#FF9500" variant="Bold" />;
      case 'wallet': return <Wallet2 size={24} color="#34C759" variant="Bold" />;
      case 'info': return <InfoCircle size={24} color="#007AFF" variant="Bold" />;
      default: return <InfoCircle size={24} color={colors.textTertiary} variant="Bold" />;
    }
  };

  const getIconBackground = (type: string) => {
    switch(type) {
      case 'charge': return isDark ? "#7C4DFF20" : "#7C4DFF15";
      case 'offer': return isDark ? "#FF950020" : "#FF950015";
      case 'wallet': return isDark ? "#34C75920" : "#34C75915";
      case 'info': return isDark ? "#007AFF20" : "#007AFF15";
      default: return isDark ? "#fff2" : "#0001";
    }
  };

  const renderItem = ({ item, index }: { item: typeof MOCK_NOTIFICATIONS[0], index: number }) => (
    <Animated.View
      entering={FadeInDown.duration(350).delay(index * 60)}
      exiting={FadeOutUp}
    >
      <Pressable style={({ pressed }) => [
        styles.notificationCard,
        {
          backgroundColor: isDark ? (item.unread ? "#1E1E1E" : "#111") : (item.unread ? "#FFFFFF" : "#F8F8F8"),
          borderColor: isDark ? (item.unread ? "rgba(255,255,255,0.1)" : "transparent") : (item.unread ? "rgba(0,0,0,0.05)" : "transparent"),
          borderWidth: 1,
          opacity: pressed ? 0.9 : 1,
        }
      ]}>
        <View style={styles.cardContent}>
          <View style={[styles.iconBox, { backgroundColor: getIconBackground(item.type) }]}>
            {getIcon(item.type)}
            {item.unread && <View style={styles.unreadDot} />}
          </View>
          <View style={styles.textContainer}>
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.time, { color: colors.textTertiary }]}>{item.time}</Text>
            </View>
            <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
              {item.description}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable 
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            { 
              backgroundColor: isDark ? "#1E1E1E" : "#FFFFFF",
              borderColor: isDark ? "#333" : "#F0F0F0",
              opacity: pressed ? 0.7 : 1
            }
          ]}
        >
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
        <View style={{ width: 44 }} />
      </View>

      <FlatList
        data={MOCK_NOTIFICATIONS}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 12,
  },
  notificationCard: {
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardContent: {
    flexDirection: 'row',
    gap: 14,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  time: {
    fontSize: 12,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF3B30',
    borderWidth: 2,
    borderColor: '#FFF',
  }
});
