import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarGradient}>
              <Ionicons name="person" size={36} color="#fff" />
            </View>
            <View style={styles.editBadge}>
              <Ionicons name="pencil" size={12} color="#fff" />
            </View>
          </View>
          <Text style={styles.name}>Guest User</Text>
          <Text style={styles.email}>guest@efish.app</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>24</Text>
              <Text style={styles.statLabel}>Sessions</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>342</Text>
              <Text style={styles.statLabel}>kWh</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>₺2.8k</Text>
              <Text style={styles.statLabel}>Spent</Text>
            </View>
          </View>
        </View>

        {/* Settings Groups */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.group}>
          <SettingsItem
            icon="person-outline"
            title="My Profile"
            subtitle="Edit your information"
            color="#2cdb9b"
            isFirst
          />
          <SettingsItem
            icon="hardware-chip-outline"
            title="Devices"
            subtitle="Manage connected devices"
            color="#007AFF"
          />
          <SettingsItem
            icon="card-outline"
            title="Payment Methods"
            subtitle="Cards and billing"
            color="#5856D6"
            isLast
          />
        </View>

        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.group}>
          <SettingsItem
            icon="notifications-outline"
            title="Notifications"
            subtitle="Push and email alerts"
            color="#FF9500"
            isFirst
          />
          <SettingsItem
            icon="globe-outline"
            title="Language"
            value="English"
            color="#34C759"
          />
          <SettingsItem
            icon="moon-outline"
            title="Appearance"
            value="System"
            color="#8E8E93"
            isLast
          />
        </View>

        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.group}>
          <SettingsItem
            icon="shield-checkmark-outline"
            title="Privacy"
            color="#34C759"
            isFirst
          />
          <SettingsItem
            icon="lock-closed-outline"
            title="Change Password"
            color="#FF3B30"
            isLast
          />
        </View>

        <View style={styles.group}>
          <SettingsItem
            icon="log-out-outline"
            title="Log Out"
            color="#FF3B30"
            isFirst
            isLast
            hideChevron
            destructive
          />
        </View>

        <Text style={styles.version}>efish v1.0.0 (Build 124)</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsItem({
  icon,
  title,
  subtitle,
  color,
  isFirst,
  isLast,
  value,
  hideChevron,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  color: string;
  isFirst?: boolean;
  isLast?: boolean;
  value?: string;
  hideChevron?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.itemContainer,
        isFirst && styles.itemFirst,
        isLast && styles.itemLast,
        pressed && styles.itemPressed,
      ]}
    >
      <View style={styles.itemContent}>
        <View style={[styles.iconBox, { backgroundColor: color }]}>
          <Ionicons name={icon} size={20} color="#fff" />
        </View>

        <View style={[styles.itemTextContainer, isLast && styles.noBorder]}>
          <View style={styles.titleContainer}>
            <Text
              style={[styles.itemTitle, destructive && { color: "#FF3B30" }]}
            >
              {title}
            </Text>
            {subtitle && <Text style={styles.itemSubtitle}>{subtitle}</Text>}
          </View>

          {!destructive && (
            <View style={styles.rightContainer}>
              {value && <Text style={styles.itemValue}>{value}</Text>}
              {!hideChevron && (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color="#C7C7CC"
                  style={{ marginLeft: 4 }}
                />
              )}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFFFFF" },
  container: { paddingBottom: 40 },

  // Profile Card
  profileCard: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 24,
    backgroundColor: "#F8FAF9",
    borderRadius: 24,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 16,
  },
  avatarGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#2cdb9b",
    alignItems: "center",
    justifyContent: "center",
  },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#0f231c",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#F8FAF9",
  },
  name: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f231c",
  },
  email: {
    fontSize: 14,
    color: "#8E8E93",
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E8EBE9",
  },
  statItem: {
    alignItems: "center",
    paddingHorizontal: 20,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f231c",
  },
  statLabel: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#E8EBE9",
  },

  // Section Title
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginLeft: 32,
    marginBottom: 8,
    marginTop: 8,
  },

  // Grouped List
  group: {
    backgroundColor: "#FAFAFA",
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 20,
    overflow: "hidden",
  },
  itemContainer: {
    backgroundColor: "#FAFAFA",
    paddingLeft: 14,
    minHeight: 60,
  },
  itemFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  itemLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  itemPressed: {
    backgroundColor: "#F0F0F0",
  },
  itemContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  itemTextContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E8E8",
    paddingVertical: 14,
    paddingRight: 14,
  },
  noBorder: {
    borderBottomWidth: 0,
  },
  titleContainer: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#0f231c",
  },
  itemSubtitle: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 2,
  },
  rightContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  itemValue: {
    fontSize: 15,
    color: "#8E8E93",
  },

  version: {
    textAlign: "center",
    color: "#C7C7CC",
    fontSize: 12,
    marginTop: 8,
  },
});
