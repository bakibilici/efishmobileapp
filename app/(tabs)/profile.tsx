import {
  PREDEFINED_USER_INTERESTS,
  USER_INTERESTS_NOTE,
} from "@/constants/userInterests";
import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { DriveSessionHistoryStorage } from "@/services/driveSessionHistory";
import { LocalUserStorage } from "@/services/localUserStorage";
import { Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, setUser, logout } = useUser();
  const { colors, themePreference, setThemePreference } = useTheme();

  const [sessionCount, setSessionCount] = useState(0);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [interestsModalVisible, setInterestsModalVisible] = useState(false);
  const [firstNameDraft, setFirstNameDraft] = useState("");
  const [lastNameDraft, setLastNameDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [interestDraft, setInterestDraft] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    setFirstNameDraft(user.first_name);
    setLastNameDraft(user.last_name);
    setInterestDraft(user.interests || []);
    setPhoneDraft("");
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const loadStats = async () => {
        const sessions = await DriveSessionHistoryStorage.listSessions();
        if (!isMounted) return;
        setSessionCount(sessions.length);
      };

      void loadStats();

      return () => {
        isMounted = false;
      };
    }, []),
  );

  const handleLogout = async () => {
    Alert.alert("Cikis yapilsin mi?", "Demo oturumu kapatilacak.", [
      { text: "Vazgec", style: "cancel" },
      {
        text: "Cikis Yap",
        style: "destructive",
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    if (!firstNameDraft.trim() || !lastNameDraft.trim()) {
      Alert.alert("Eksik bilgi", "Ad ve soyad alanlarini doldurun.");
      return;
    }

    const cleanedPhone = phoneDraft.replace(/\D/g, "");
    if (cleanedPhone.length > 0 && cleanedPhone.length !== 10) {
      Alert.alert("Gecersiz numara", "Telefon numarasi 10 haneli olmali.");
      return;
    }

    try {
      const updatedUser = await LocalUserStorage.updateUser(user.id, {
        firstName: firstNameDraft,
        lastName: lastNameDraft,
        phoneNumber: cleanedPhone.length === 10 ? cleanedPhone : undefined,
        phoneCode: user.phone_code,
        interests: user.interests,
      });

      if (updatedUser) {
        setUser(updatedUser);
      }
      setProfileModalVisible(false);
      setPhoneDraft("");
    } catch (error) {
      console.error(error);
      Alert.alert("Hata", "Profil guncellenemedi.");
    }
  };

  const handleSaveInterests = async () => {
    if (!user) return;

    try {
      const updatedUser = await LocalUserStorage.updateUser(user.id, {
        firstName: user.first_name,
        lastName: user.last_name,
        phoneCode: user.phone_code,
        interests: interestDraft,
      });

      if (updatedUser) {
        setUser(updatedUser);
      }
      setInterestsModalVisible(false);
    } catch (error) {
      console.error(error);
      Alert.alert("Hata", "İlgi alanları güncellenemedi.");
    }
  };

  const toggleInterest = (interest: string) => {
    setInterestDraft((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest],
    );
  };

  const displayName = user
    ? `${user.first_name} ${user.last_name}`
    : "Guest User";
  const displayPhone = user ? user.phone_number : "Demo user";

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
          <View style={styles.avatarContainer}>
            <View
              style={[
                styles.avatarGradient,
                { backgroundColor: colors.primary },
              ]}
            >
              <Ionicons name="person" size={36} color={colors.primaryText} />
            </View>
          </View>

          <Text style={[styles.name, { color: colors.text }]}>
            {displayName}
          </Text>
          <Text style={[styles.email, { color: colors.textSecondary }]}>
            {displayPhone}
          </Text>

          <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.text }]}>
                {sessionCount}
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
                {user?.interests?.length ?? 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>
                Interests
              </Text>
            </View>
            <View
              style={[styles.statDivider, { backgroundColor: colors.border }]}
            />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.text }]}>
                AI
              </Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>
                Ready
              </Text>
            </View>
          </View>
        </View>

        {user ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
              Account
            </Text>
            <View style={[styles.group, { backgroundColor: colors.card }]}>
              <SettingsItem
                icon="person-outline"
                title="My Profile"
                subtitle="Ad, soyad ve telefon bilgilerinizi duzenleyin"
                color="#0093C9"
                isFirst
                onPress={() => setProfileModalVisible(true)}
                colors={colors}
              />
              <SettingsItem
                icon="sparkles-outline"
                title="My Interests"
                subtitle={
                  user.interests.length > 0
                    ? user.interests.join(", ")
                    : "Atlas icin ilgi alanlari secin"
                }
                color="#7C4DFF"
                isLast
                onPress={() => setInterestsModalVisible(true)}
                colors={colors}
              />
            </View>

            <View
              style={[
                styles.notePanel,
                {
                  backgroundColor: colors.backgroundSecondary,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons
                name="sparkles-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.noteText, { color: colors.textSecondary }]}>
                {USER_INTERESTS_NOTE}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.guestRow}>
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
              style={[styles.loginButton, { backgroundColor: colors.primary }]}
            >
              <Text
                style={[styles.loginButtonText, { color: colors.primaryText }]}
              >
                Log In
              </Text>
            </Pressable>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
          Preferences
        </Text>
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          <AppearanceSelector
            preference={themePreference}
            onChange={setThemePreference}
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
            onPress={() => router.push("/vehicles")}
            colors={colors}
          />
          <SettingsItem
            icon="card-outline"
            title="Payment Methods"
            subtitle="Cards and billing"
            color="#0093C9"
            onPress={() => router.push("/payment-methods")}
            colors={colors}
          />
          <SettingsItem
            icon="chatbox-ellipses-outline"
            title="Give Feedback"
            subtitle="Report a bug or suggest a feature"
            color="#FF9500"
            isLast
            onPress={() => {
              Sentry.showFeedbackWidget();
            }}
            colors={colors}
          />
        </View>

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
          Demo build with local AI profile storage
        </Text>
      </ScrollView>

      <EditProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        onSave={handleSaveProfile}
        firstName={firstNameDraft}
        lastName={lastNameDraft}
        phone={phoneDraft}
        onChangeFirstName={setFirstNameDraft}
        onChangeLastName={setLastNameDraft}
        onChangePhone={setPhoneDraft}
        currentPhoneMasked={displayPhone}
        colors={colors}
      />

      <EditInterestsModal
        visible={interestsModalVisible}
        onClose={() => setInterestsModalVisible(false)}
        onSave={handleSaveInterests}
        selectedInterests={interestDraft}
        onToggleInterest={toggleInterest}
        colors={colors}
      />
    </SafeAreaView>
  );
}

function EditProfileModal({
  visible,
  onClose,
  onSave,
  firstName,
  lastName,
  phone,
  onChangeFirstName,
  onChangeLastName,
  onChangePhone,
  currentPhoneMasked,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  firstName: string;
  lastName: string;
  phone: string;
  onChangeFirstName: (value: string) => void;
  onChangeLastName: (value: string) => void;
  onChangePhone: (value: string) => void;
  currentPhoneMasked: string;
  colors: any;
}) {
  return (
    <Modal transparent animationType="fade" visible={visible}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View
              style={[styles.modalContent, { backgroundColor: colors.card }]}
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                My Profile
              </Text>

              <View style={styles.modalField}>
                <Text
                  style={[styles.modalLabel, { color: colors.textSecondary }]}
                >
                  Ad
                </Text>
                <TextInput
                  value={firstName}
                  onChangeText={onChangeFirstName}
                  style={[
                    styles.modalInput,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                      color: colors.text,
                    },
                  ]}
                />
              </View>

              <View style={styles.modalField}>
                <Text
                  style={[styles.modalLabel, { color: colors.textSecondary }]}
                >
                  Soyad
                </Text>
                <TextInput
                  value={lastName}
                  onChangeText={onChangeLastName}
                  style={[
                    styles.modalInput,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                      color: colors.text,
                    },
                  ]}
                />
              </View>

              <View style={styles.modalField}>
                <Text
                  style={[styles.modalLabel, { color: colors.textSecondary }]}
                >
                  Telefon
                </Text>
                <TextInput
                  value={phone}
                  onChangeText={onChangePhone}
                  keyboardType="phone-pad"
                  placeholder={currentPhoneMasked}
                  placeholderTextColor={colors.textTertiary}
                  style={[
                    styles.modalInput,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                      color: colors.text,
                    },
                  ]}
                />
              </View>

              <Pressable
                style={[
                  styles.modalPrimaryButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={onSave}
              >
                <Text style={styles.modalPrimaryText}>Kaydet</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modalSecondaryButton,
                  { borderColor: colors.border },
                ]}
                onPress={onClose}
              >
                <Text
                  style={[styles.modalSecondaryText, { color: colors.text }]}
                >
                  Vazgec
                </Text>
              </Pressable>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function EditInterestsModal({
  visible,
  onClose,
  onSave,
  selectedInterests,
  onToggleInterest,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  selectedInterests: string[];
  onToggleInterest: (interest: string) => void;
  colors: any;
}) {
  return (
    <Modal transparent animationType="fade" visible={visible}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View
              style={[styles.modalContent, { backgroundColor: colors.card }]}
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                My Interests
              </Text>
              <Text
                style={[
                  styles.interestsSubtitle,
                  { color: colors.textSecondary },
                ]}
              >
                {USER_INTERESTS_NOTE}
              </Text>

              <View style={styles.interestsWrap}>
                {PREDEFINED_USER_INTERESTS.map((interest) => {
                  const selected = selectedInterests.includes(interest);
                  return (
                    <Pressable
                      key={interest}
                      onPress={() => onToggleInterest(interest)}
                      style={[
                        styles.interestChip,
                        {
                          backgroundColor: selected
                            ? colors.primary
                            : colors.backgroundSecondary,
                          borderColor: selected
                            ? colors.primary
                            : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.interestChipText,
                          { color: selected ? "#FFFFFF" : colors.text },
                        ]}
                      >
                        {interest}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={[
                  styles.modalPrimaryButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={onSave}
              >
                <Text style={styles.modalPrimaryText}>Kaydet</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modalSecondaryButton,
                  { borderColor: colors.border },
                ]}
                onPress={onClose}
              >
                <Text
                  style={[styles.modalSecondaryText, { color: colors.text }]}
                >
                  Vazgec
                </Text>
              </Pressable>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
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
  const getLabel = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1);

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
          <View style={[styles.iconBox, { backgroundColor: "#587A99" }]}>
            <Ionicons name="moon-outline" size={20} color="#fff" />
          </View>
          <View style={styles.itemTextContainer}>
            <Text style={[styles.itemTitle, { color: colors.text }]}>
              Appearance
            </Text>
            <View style={styles.rightContainer}>
              <Text style={[styles.itemValue, { color: colors.textSecondary }]}>
                {getLabel(preference)}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textTertiary}
                style={{ marginLeft: 6 }}
              />
            </View>
          </View>
        </View>
      </Pressable>

      <Modal transparent animationType="fade" visible={modalVisible}>
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
                  (option, index, array) => (
                    <Pressable
                      key={option}
                      onPress={() => {
                        onChange(option);
                        setModalVisible(false);
                      }}
                      style={[
                        styles.modalOption,
                        { borderBottomColor: colors.border },
                        index === array.length - 1 && styles.noBorder,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalOptionText,
                          { color: colors.text },
                          preference === option && {
                            color: colors.primary,
                            fontWeight: "700",
                          },
                        ]}
                      >
                        {getLabel(option)}
                      </Text>
                      {preference === option && (
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
        },
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
            {subtitle ? (
              <Text
                style={[styles.itemSubtitle, { color: colors.textTertiary }]}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>

          {!destructive && (
            <View style={styles.rightContainer}>
              {value ? (
                <Text
                  style={[styles.itemValue, { color: colors.textSecondary }]}
                >
                  {value}
                </Text>
              ) : null}
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
  container: { paddingBottom: 200 },
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
    marginBottom: 16,
  },
  avatarGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 22,
    fontWeight: "700",
  },
  email: {
    fontSize: 14,
    marginTop: 4,
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
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginLeft: 32,
    marginBottom: 8,
    marginTop: 8,
  },
  group: {
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 20,
    overflow: "hidden",
  },
  notePanel: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  guestRow: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 24,
    gap: 12,
    alignItems: "center",
  },
  loginButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  loginButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  itemContainer: {
    paddingLeft: 14,
    minHeight: 60,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    textAlign: "center",
  },
  modalField: {
    gap: 8,
    marginBottom: 12,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  modalInput: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  modalPrimaryButton: {
    marginTop: 8,
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  modalSecondaryButton: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
  },
  interestsSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginBottom: 16,
  },
  interestsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  interestChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  interestChipText: {
    fontSize: 13,
    fontWeight: "700",
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
  noBorder: {
    borderBottomWidth: 0,
  },
});
