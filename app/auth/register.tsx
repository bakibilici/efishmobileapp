import {
  PREDEFINED_USER_INTERESTS,
  USER_INTERESTS_NOTE,
} from "@/constants/userInterests";
import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { LocalUserStorage } from "@/services/localUserStorage";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type RegisterStep = "PROFILE" | "INTERESTS";

const formatMaskedPhone = (phoneCode: string, phoneNumber: string) =>
  `+${phoneCode} ••• ••• ${phoneNumber.slice(-4)}`;

export default function RegisterScreen() {
  const router = useRouter();
  const { setUser } = useUser();
  const { colors, themeScheme } = useTheme();
  const params = useLocalSearchParams<{
    phone_number?: string;
    phone_code?: string;
  }>();

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<RegisterStep>("PROFILE");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  const phoneNumber = params.phone_number || "5555555555";
  const phoneCode = params.phone_code || "90";

  const isProfileStepValid = useMemo(
    () => firstName.trim().length > 1 && lastName.trim().length > 1,
    [firstName, lastName],
  );

  const toggleInterest = (interest: string) => {
    setSelectedInterests((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest],
    );
  };

  const handleContinueToInterests = () => {
    if (!isProfileStepValid) {
      Alert.alert("Eksik bilgi", "Lutfen ad ve soyad bilgilerinizi girin.");
      return;
    }
    setStep("INTERESTS");
  };

  const handleCreateAccount = async () => {
    setLoading(true);
    try {
      const existingUser = await LocalUserStorage.getUserByPhone(
        phoneNumber,
        phoneCode,
      );

      if (existingUser) {
        setLoading(false);
        Alert.alert(
          "Bu kullanici zaten var",
          "Bu telefon numarasiyla daha once kayit olunmus. Giris ekranindan devam edebilirsiniz.",
        );
        router.replace("/");
        return;
      }

      const createdUser = await LocalUserStorage.createUser({
        firstName,
        lastName,
        phoneNumber,
        phoneCode,
        interests: selectedInterests,
      });

      if (!createdUser) {
        throw new Error("User creation failed");
      }

      setUser(createdUser);
      setLoading(false);
      router.replace({
        pathname: "/(tabs)/mainpage",
        params: { showLoginSuccess: "true" },
      });
    } catch (error) {
      console.error(error);
      setLoading(false);
      Alert.alert("Hata", "Demo kullanici olusturulamadi.");
    }
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <StatusBar
        barStyle={themeScheme === "dark" ? "light-content" : "dark-content"}
      />

      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() =>
            step === "INTERESTS" ? setStep("PROFILE") : router.back()
          }
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Demo Hesap Olustur
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.progressRow}>
          {(["PROFILE", "INTERESTS"] as RegisterStep[]).map((item, index) => {
            const active =
              item === step || (step === "INTERESTS" && item === "PROFILE");
            return (
              <View
                key={item}
                style={[
                  styles.progressPill,
                  {
                    backgroundColor: active ? colors.primary : colors.border,
                    opacity: item === step ? 1 : 0.45,
                    marginRight: index === 0 ? 10 : 0,
                  },
                ]}
              />
            );
          })}
        </View>

        {step === "PROFILE" ? (
          <View style={styles.section}>
            <Text style={[styles.sectionEyebrow, { color: colors.primary }]}>
              PROFIL
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>
              Atlas sizi tanıyarak başlasın
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Demo kaydiniz cihazda tutulur. Telefon numaraniz hashlenerek
              saklanir.
            </Text>

            <View
              style={[
                styles.phoneBadge,
                {
                  backgroundColor: colors.backgroundSecondary,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons name="call-outline" size={16} color={colors.primary} />
              <Text style={[styles.phoneBadgeText, { color: colors.text }]}>
                {formatMaskedPhone(phoneCode, phoneNumber)}
              </Text>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Ad
                </Text>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Adiniz"
                  placeholderTextColor={colors.textTertiary}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                      color: colors.text,
                    },
                  ]}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Soyad
                </Text>
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Soyadiniz"
                  placeholderTextColor={colors.textTertiary}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                      color: colors.text,
                    },
                  ]}
                />
              </View>
            </View>

            <Pressable
              onPress={handleContinueToInterests}
              disabled={!isProfileStepValid}
              style={[
                styles.primaryButton,
                {
                  backgroundColor: isProfileStepValid
                    ? colors.primary
                    : colors.border,
                },
              ]}
            >
              <Text style={styles.primaryButtonText}>İlgi Alanlarına Geç</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.sectionEyebrow, { color: colors.primary }]}>
              İLGİ ALANLARI
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>
              Atlas önerilerini size göre sekillendirsin
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Seçeceğiniz ilgi alanları rota sırası ve mola önerilerinde Atlas
              icin ek baglam olusturur.
            </Text>

            <View
              style={[
                styles.noteCard,
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

            <View style={styles.interestsGrid}>
              {PREDEFINED_USER_INTERESTS.map((interest) => {
                const selected = selectedInterests.includes(interest);
                return (
                  <Pressable
                    key={interest}
                    onPress={() => toggleInterest(interest)}
                    style={[
                      styles.interestChip,
                      {
                        backgroundColor: selected
                          ? colors.primary
                          : colors.backgroundSecondary,
                        borderColor: selected ? colors.primary : colors.border,
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
              onPress={handleCreateAccount}
              disabled={loading}
              style={[
                styles.primaryButton,
                { backgroundColor: colors.primary, marginTop: 12 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>
                    Demo Hesabi Olustur
                  </Text>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={18}
                    color="#FFFFFF"
                  />
                </>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 40,
  },
  progressRow: {
    flexDirection: "row",
    marginBottom: 26,
  },
  progressPill: {
    height: 6,
    borderRadius: 999,
    flex: 1,
  },
  section: {
    gap: 18,
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  phoneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  phoneBadgeText: {
    fontSize: 14,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: "500",
  },
  noteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  interestsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  interestChip: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1,
  },
  interestChipText: {
    fontSize: 14,
    fontWeight: "700",
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
