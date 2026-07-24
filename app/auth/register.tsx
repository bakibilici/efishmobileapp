import { LEGAL_DOCUMENTS, LegalDocumentKey } from "@/constants/legalDocuments";
import {
  PREDEFINED_USER_INTERESTS,
  USER_INTERESTS_NOTE,
} from "@/constants/userInterests";
import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { LocalUserStorage } from "@/services/localUserStorage";
import { Ionicons } from "@expo/vector-icons";
import { Asset } from "expo-asset";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

type RegisterStep = "PROFILE" | "INTERESTS";

const LEGAL_DOCUMENT_ASSETS: Record<LegalDocumentKey, number> = {
  terms: require("../../assets/documents/kullanim_kosullari.pdf"),
  privacy: require("../../assets/documents/aydinlatma_metni.pdf"),
};

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
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [visibleDocument, setVisibleDocument] =
    useState<LegalDocumentKey | null>(null);
  const [viewedDocuments, setViewedDocuments] = useState<
    Record<LegalDocumentKey, boolean>
  >({
    terms: false,
    privacy: false,
  });
  const [canAcknowledgeDocument, setCanAcknowledgeDocument] = useState(false);
  const [resolvedPdfUri, setResolvedPdfUri] = useState<string | null>(null);
  const [documentLoading, setDocumentLoading] = useState(false);

  const phoneNumber = params.phone_number || "5555555555";
  const phoneCode = params.phone_code || "90";
  const activeDocument = visibleDocument
    ? LEGAL_DOCUMENTS[visibleDocument]
    : null;
  const hasReadRequiredDocuments =
    viewedDocuments.terms && viewedDocuments.privacy;

  useEffect(() => {
    let isMounted = true;
    let enableTimer: ReturnType<typeof setTimeout> | null = null;

    const resolvePdf = async () => {
      if (!visibleDocument) {
        return;
      }

      setDocumentLoading(true);
      setResolvedPdfUri(null);
      setCanAcknowledgeDocument(false);

      try {
        const asset = Asset.fromModule(LEGAL_DOCUMENT_ASSETS[visibleDocument]);
        await asset.downloadAsync();

        if (!isMounted) {
          return;
        }

        if (!asset.localUri) {
          throw new Error("PDF localUri could not be resolved");
        }

        setResolvedPdfUri(asset.localUri);
        enableTimer = setTimeout(() => {
          if (isMounted) {
            setCanAcknowledgeDocument(true);
          }
        }, 1200);
      } catch (error) {
        console.error("Failed to load legal PDF:", error);
        if (isMounted) {
          Alert.alert(
            "Belge acilamadi",
            "PDF onizlemesi yuklenemedi. Lutfen tekrar deneyin.",
          );
          setVisibleDocument(null);
        }
      } finally {
        if (isMounted) {
          setDocumentLoading(false);
        }
      }
    };

    if (visibleDocument) {
      void resolvePdf();
    } else {
      setResolvedPdfUri(null);
      setDocumentLoading(false);
      setCanAcknowledgeDocument(false);
    }

    return () => {
      isMounted = false;
      if (enableTimer) {
        clearTimeout(enableTimer);
      }
    };
  }, [visibleDocument]);

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

  const openDocument = (documentKey: LegalDocumentKey) => {
    setVisibleDocument(documentKey);
  };

  const closeDocumentModal = () => {
    setVisibleDocument(null);
    setResolvedPdfUri(null);
    setDocumentLoading(false);
    setCanAcknowledgeDocument(false);
  };

  const handleDocumentAcknowledge = () => {
    if (!visibleDocument || !canAcknowledgeDocument) {
      return;
    }
    setViewedDocuments((current) => ({
      ...current,
      [visibleDocument]: true,
    }));
    closeDocumentModal();
  };

  const handleTermsToggle = () => {
    if (!hasReadRequiredDocuments) {
      Alert.alert(
        "Belgeleri once okuyun",
        "Devam etmeden once Kullanim Kosullari ve Aydinlatma Metni metinlerini acip sonuna kadar incelemeniz gerekir.",
      );
      return;
    }
    setAgreedToTerms((current) => !current);
  };

  const handleContinueToInterests = () => {
    if (!isProfileStepValid) {
      Alert.alert("Eksik bilgi", "Lütfen ad ve soyad bilgilerinizi girin.");
      return;
    }
    setStep("INTERESTS");
  };

  const handleCreateAccount = async () => {
    if (!agreedToTerms) {
      Alert.alert(
        "Sözleşme onayı",
        "Devam etmek için kullanım koşullarını kabul etmelisiniz.",
      );
      return;
    }
    setLoading(true);
    try {
      const existingUser = await LocalUserStorage.getUserByPhone(
        phoneNumber,
        phoneCode,
      );

      if (existingUser) {
        setLoading(false);
        Alert.alert(
          "Bu kullanıcı zaten var",
          "Bu telefon numarasıyla daha önce kayıt olunmuş. Giriş ekranından devam edebilirsiniz.",
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
      Alert.alert("Hata", "Demo kullanıcı oluşturulamadı.");
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
          Demo Hesap Oluştur
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
              Demo kaydınız cihazda tutulur. Telefon numaranız hashlenerek
              saklanır.
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
                  placeholder="Adınız"
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
                  placeholder="Soyadınız"
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
              Atlas önerilerini size göre şekillendirsin
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Seçeceğiniz ilgi alanları rota sırası ve mola önerilerinde Atlas
              için ek bağlam oluşturur.
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

            {/* Terms and Conditions Checkbox */}
            <View style={styles.termsContainer}>
              <View style={styles.checkboxRow}>
                <Pressable onPress={handleTermsToggle}>
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: agreedToTerms
                          ? colors.primary
                          : colors.border,
                        backgroundColor: agreedToTerms
                          ? colors.primary
                          : "transparent",
                      },
                    ]}
                  >
                    {agreedToTerms && (
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    )}
                  </View>
                </Pressable>
                <View style={styles.termsTextContainer}>
                  <Text
                    style={[styles.termsText, { color: colors.textSecondary }]}
                  >
                    <Text
                      onPress={() => openDocument("terms")}
                      style={{ color: colors.primary, fontWeight: "600" }}
                    >
                      Kullanim Kosullari
                    </Text>
                    {" ve "}
                    <Text
                      onPress={() => openDocument("privacy")}
                      style={{ color: colors.primary, fontWeight: "600" }}
                    >
                      Aydinlatma Metni
                    </Text>{" "}
                    metinlerini okudum ve kabul ediyorum.
                  </Text>
                  <Text
                    style={[
                      styles.termsHint,
                      {
                        color: hasReadRequiredDocuments
                          ? colors.primary
                          : colors.textTertiary,
                      },
                    ]}
                  >
                    {hasReadRequiredDocuments
                      ? "Her iki metin goruntulendi. Artik onay verebilirsiniz."
                      : "Onay verebilmek icin her iki metni de modal icinde sonuna kadar okuyun."}
                  </Text>
                </View>
              </View>
            </View>

            <Pressable
              onPress={handleCreateAccount}
              disabled={loading || !agreedToTerms}
              style={[
                styles.primaryButton,
                {
                  backgroundColor: agreedToTerms
                    ? colors.primary
                    : colors.border,
                  marginTop: 12,
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>
                    Demo Hesabı Oluştur
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

      <Modal
        animationType="slide"
        transparent
        visible={!!activeDocument}
        onRequestClose={closeDocumentModal}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismissLayer} onPress={closeDocumentModal} />
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <View
              style={[styles.modalHandle, { backgroundColor: colors.border }]}
            />
            {activeDocument ? (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalTitleBlock}>
                    <Text style={[styles.modalTitle, { color: colors.text }]}>
                      {activeDocument.title}
                    </Text>
                    <Text
                      style={[
                        styles.modalSubtitle,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {activeDocument.subtitle}
                    </Text>
                  </View>
                  <Pressable
                    onPress={closeDocumentModal}
                    style={[
                      styles.modalCloseButton,
                      { backgroundColor: colors.backgroundSecondary },
                    ]}
                  >
                    <Ionicons name="close" size={18} color={colors.text} />
                  </Pressable>
                </View>

                <View style={styles.modalWebViewContainer}>
                  {resolvedPdfUri ? (
                    <WebView
                      source={{ uri: resolvedPdfUri }}
                      style={styles.modalWebView}
                      originWhitelist={["*"]}
                      scalesPageToFit
                      allowFileAccess
                      allowingReadAccessToURL={resolvedPdfUri}
                      allowUniversalAccessFromFileURLs
                      mixedContentMode="always"
                      setSupportMultipleWindows={false}
                      onError={(event) => {
                        console.error(
                          "Legal PDF preview error:",
                          event.nativeEvent,
                        );
                      }}
                    />
                  ) : (
                    <View style={styles.modalLoading}>
                      <ActivityIndicator color={colors.primary} />
                      <Text
                        style={[
                          styles.modalLoadingText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Döküman yükleniyor...
                      </Text>
                    </View>
                  )}

                  {documentLoading ? (
                    <View style={styles.modalLoadingOverlay}>
                      <ActivityIndicator color={colors.primary} />
                      <Text
                        style={[
                          styles.modalLoadingText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        PDF onizlemesi yukleniyor...
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View
                  style={[
                    styles.modalFooter,
                    { borderTopColor: colors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.modalFooterHint,
                      { color: colors.textTertiary },
                    ]}
                  >
                    Belge onizlemesi acildiktan sonra onay verebilirsiniz.
                  </Text>
                  <Pressable
                    onPress={handleDocumentAcknowledge}
                    disabled={!canAcknowledgeDocument}
                    style={[
                      styles.modalPrimaryButton,
                      {
                        backgroundColor: canAcknowledgeDocument
                          ? colors.primary
                          : colors.border,
                      },
                    ]}
                  >
                    <Text style={styles.modalPrimaryButtonText}>
                      Okudum ve Devam Et
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
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
  termsContainer: {
    marginTop: 12,
    paddingHorizontal: 4,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  termsTextContainer: {
    flex: 1,
  },
  termsText: {
    fontSize: 14,
    lineHeight: 20,
  },
  termsHint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(5, 10, 24, 0.44)",
  },
  modalDismissLayer: {
    flex: 1,
  },
  modalCard: {
    height: "84%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 10,
  },
  modalHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  modalTitleBlock: {
    flex: 1,
    gap: 8,
  },
  modalTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
  },
  modalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 18,
  },
  modalSection: {
    gap: 8,
  },
  modalSectionHeading: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  modalSectionBody: {
    fontSize: 14,
    lineHeight: 22,
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  modalFooterHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  modalPrimaryButton: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  modalWebViewContainer: {
    flex: 1,
    minHeight: 320,
    overflow: "hidden",
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 16,
    backgroundColor: "#F8F9FC",
  },
  modalWebView: {
    flex: 1,
    backgroundColor: "#F8F9FC",
  },
  modalLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  modalLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "rgba(248, 249, 252, 0.9)",
  },
  modalLoadingText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
