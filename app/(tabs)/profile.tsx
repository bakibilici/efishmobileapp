import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useUser();
  const { colors, themePreference, setThemePreference } = useTheme();

  const handleLogout = async () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
          } catch (error) {
            console.error("Logout failed", error);
          }
        },
      },
    ]);
  };

  const displayName = user
    ? `${user.first_name} ${user.last_name}`
    : "Guest User";
  const displayEmail = user
    ? user.email ||
    (user.phone_number?.length === 10
      ? `+${user.phone_code} (${user.phone_number.slice(0, 3)}) ${user.phone_number.slice(3, 6)} ${user.phone_number.slice(6)}`
      : `+${user.phone_code} ${user.phone_number}`)
    : "guest@efish.app";

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.profileCard,
            { backgroundColor: colors.backgroundSecondary },
          ]}
        >
          {user ? (
            <>
              <View style={styles.avatarContainer}>
                <View
                  style={[
                    styles.avatarGradient,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Ionicons
                    name="person"
                    size={36}
                    color={colors.primaryText}
                  />
                </View>
                <View
                  style={[
                    styles.editBadge,
                    {
                      backgroundColor: colors.icon,
                      borderColor: colors.backgroundSecondary,
                    },
                  ]}
                >
                  <Ionicons name="pencil" size={12} color="#fff" />
                </View>
              </View>
              <Text style={[styles.name, { color: colors.text }]}>
                {displayName}
              </Text>
              <Text style={[styles.email, { color: colors.textSecondary }]}>
                {displayEmail}
              </Text>
            </>
          ) : (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                paddingHorizontal: 10,
                marginBottom: 10,
              }}
            >
              <Text style={[styles.name, { color: colors.text }]}>
                Guest User
              </Text>
              <Pressable
                onPress={() => {
                  if (router.canDismiss()) {
                    router.dismissAll();
                  }
                  router.replace("/");
                }}
                style={{
                  backgroundColor: colors.primary,
                  paddingHorizontal: 20,
                  paddingVertical: 8,
                  borderRadius: 20,
                }}
              >
                <Text
                  style={{
                    color: colors.primaryText,
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  Log In
                </Text>
              </Pressable>
            </View>
          )}

          <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.text }]}>
                24
              </Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>
                Sessions
              </Text>
            </View>
            <View
              style={[styles.statDivider, { backgroundColor: colors.border }]}
            />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.text }]}>
                342
              </Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>
                kWh
              </Text>
            </View>
            <View
              style={[styles.statDivider, { backgroundColor: colors.border }]}
            />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.text }]}>
                ₺2.8k
              </Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>
                Spent
              </Text>
            </View>
          </View>
        </View>

        {/* Settings Groups */}
        {/* Settings Groups */}
        {user && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
              Account
            </Text>
            <View style={[styles.group, { backgroundColor: colors.card }]}>
              <SettingsItem
                icon="person-outline"
                title="My Profile"
                subtitle="Edit your information"
                color="#2cdb9b"
                isFirst
                colors={colors}
              />
              <SettingsItem
                icon="hardware-chip-outline"
                title="Devices"
                subtitle="Manage connected devices"
                color="#007AFF"
                onPress={() => router.push("/devices")}
                colors={colors}
              />
              <SettingsItem
                icon="car-sport-outline"
                title="My Vehicles"
                subtitle="Manage your vehicles"
                color="#AF52DE"
                onPress={() => router.push("/vehicles")} // Changed from /devices/vehicles to /vehicles based on plan
                colors={colors}
              />
              <SettingsItem
                icon="card-outline"
                title="Payment Methods"
                subtitle="Cards and billing"
                color="#5856D6"
                isLast
                onPress={() => router.push("/payment-methods")}
                colors={colors}
              />
            </View>
          </>
        )}

        <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
          Preferences
        </Text>
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          <SettingsItem
            icon="notifications-outline"
            title="Notifications"
            subtitle="Push and email alerts"
            color="#FF9500"
            isFirst
            colors={colors}
          />
          <SettingsItem
            icon="globe-outline"
            title="Language"
            value="English"
            color="#34C759"
            colors={colors}
          />
          <AppearanceSelector
            preference={themePreference}
            onChange={setThemePreference}
            colors={colors}
          />
          <SettingsItem
            icon="chatbox-ellipses-outline"
            title="Give Feedback"
            subtitle="Report a bug or suggest a feature"
            color="#FF9500" // Orange color often used for feedback/warnings
            isLast
            onPress={() => {
              Sentry.showFeedbackWidget();
            }}
            colors={colors}
          />
        </View>

        {user && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
              Security
            </Text>
            <View style={[styles.group, { backgroundColor: colors.card }]}>
              <SettingsItem
                icon="shield-checkmark-outline"
                title="Privacy"
                color="#34C759"
                isFirst
                colors={colors}
              />
              <SettingsItem
                icon="lock-closed-outline"
                title="Change Password"
                color="#FF3B30"
                isLast
                colors={colors}
              />
            </View>
          </>
        )}

        {user && (
          <View style={[styles.group, { backgroundColor: colors.card }]}>
            <SettingsItem
              icon="log-out-outline"
              title="Log Out"
              color="#FF3B30"
              isFirst
              isLast
              hideChevron
              destructive
              onPress={handleLogout}
              colors={colors}
            />
          </View>
        )}

        <Text style={[styles.version, { color: colors.textTertiary }]}>
          efish v1.0.0 (Build 124)
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function AppearanceSelector({
  preference,
  onChange,
  colors,
  isLast,
}: {
  preference: "system" | "light" | "dark";
  onChange: (v: "system" | "light" | "dark") => void;
  colors: any;
  isLast?: boolean;
}) {
  const [modalVisible, setModalVisible] = useState(false);

  const getLabel = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

  return (
    <>
      <Pressable
        onPress={() => setModalVisible(true)}
        style={({ pressed }) => [
          styles.itemContainer,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
          isLast && styles.itemLast,
          pressed && {
            backgroundColor: colors.highlight || colors.backgroundSecondary,
          },
        ]}
      >
        <View style={styles.itemContent}>
          <View style={[styles.iconBox, { backgroundColor: "#8E8E93" }]}>
            <Ionicons name="moon-outline" size={20} color="#fff" />
          </View>
          <View style={styles.itemTextContainer}>
            <Text style={[styles.itemTitle, { color: colors.text }]}>
              Appearance
            </Text>
            <View style={styles.rightContainer}>
              <Text
                style={[
                  styles.itemValue,
                  { color: colors.textSecondary, marginRight: 8 },
                ]}
              >
                {getLabel(preference)}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textTertiary}
              />
            </View>
          </View>
        </View>
      </Pressable>

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[styles.modalContent, { backgroundColor: colors.card }]}
              >
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Select Appearance
                </Text>
                {(["system", "light", "dark"] as const).map(
                  (opt, index, arr) => (
                    <Pressable
                      key={opt}
                      onPress={() => {
                        onChange(opt);
                        setModalVisible(false);
                      }}
                      style={({ pressed }) => [
                        styles.modalOption,
                        { borderBottomColor: colors.border },
                        index === arr.length - 1 && styles.noBorder,
                        pressed && {
                          backgroundColor: colors.backgroundSecondary,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalOptionText,
                          { color: colors.text },
                          preference === opt && {
                            color: colors.primary,
                            fontWeight: "700",
                          },
                        ]}
                      >
                        {getLabel(opt)}
                      </Text>
                      {preference === opt && (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={colors.primary}
                        />
                      )}
                    </Pressable>
                  ),
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
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
  onPress,
  colors,
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
  onPress?: () => void;
  colors: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.itemContainer,
        { backgroundColor: colors.card, borderBottomColor: colors.border },
        isFirst && styles.itemFirst,
        isLast && styles.itemLast,
        pressed && {
          backgroundColor: colors.highlight || colors.backgroundSecondary,
        }, // Fallback logic
      ]}
    >
      <View style={styles.itemContent}>
        <View style={[styles.iconBox, { backgroundColor: color }]}>
          <Ionicons name={icon} size={20} color="#fff" />
        </View>

        <View style={styles.itemTextContainer}>
          <View style={styles.titleContainer}>
            <Text
              style={[
                styles.itemTitle,
                { color: colors.text },
                destructive && { color: colors.danger },
              ]}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                style={[styles.itemSubtitle, { color: colors.textTertiary }]}
              >
                {subtitle}
              </Text>
            )}
          </View>

          {!destructive && (
            <View style={styles.rightContainer}>
              {value && (
                <Text
                  style={[styles.itemValue, { color: colors.textSecondary }]}
                >
                  {value}
                </Text>
              )}
              {!hideChevron && (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textTertiary}
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
  safeArea: { flex: 1 },
  container: { paddingBottom: 40 },

  profileCard: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 24,
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
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
  },
  name: {
    fontSize: 22,
    fontWeight: "700",
  },
  email: {
    fontSize: 14,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
  },
  statItem: {
    alignItems: "center",
    paddingHorizontal: 20,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
  },

  // Section Title
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginLeft: 32,
    marginBottom: 8,
    marginTop: 8,
  },

  // Grouped List
  group: {
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 20,
    overflow: "hidden",
  },
  itemContainer: {
    paddingLeft: 14,
    minHeight: 60,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  itemFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  itemLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomWidth: 0,
  },
  itemContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingVertical: 12,
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
    paddingRight: 14,
    paddingVertical: 8,
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
  },
  itemSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  rightContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  itemValue: {
    fontSize: 15,
  },

  version: {
    textAlign: "center",
    fontSize: 12,
    marginTop: 8,
  },

  // Appearance Selector
  segmentContainer: {
    flexDirection: "row",
    backgroundColor: "transparent",
    gap: 4,
  },
  segmentBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    textAlign: "center",
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: "500",
  },
});
