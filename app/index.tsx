import { brandBlue, brandNavy, brandSlate } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { sendOtp, setAuthToken, verifyOtp } from "@/services/api";
import { saveTokens } from "@/services/tokenStorage";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// Theme constants are now handled via useTheme hook inside the component

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const len = digits.length;
  if (len === 0) return "";
  if (len < 4) return `(${digits}`;
  if (len < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)} ${digits.slice(6)}`;
};

export default function LoginScreen() {
  const router = useRouter();
  const { user, setUser, refreshProfile, isLoading: isUserLoading } = useUser();
  const { colors, themeScheme } = useTheme();

  // State
  const [step, setStep] = useState<"PHONE" | "OTP">("PHONE");
  const [countryCode, setCountryCode] = useState("+90");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: "",
  });

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const otpInputRef = useRef<TextInput>(null);

  useEffect(() => {
    // Entrance Animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const pathname = usePathname(); // Add usePathname hook

  // Auto-redirect if already logged in AND we are on the login screen
  const hasRedirected = useRef(false);
  useEffect(() => {
    // Check if we are actually on the login screen ("/" or "/index")
    const isLoginScreen = pathname === "/" || pathname === "/index";

    if (isLoginScreen && !isUserLoading && user && !hasRedirected.current) {
      hasRedirected.current = true;
      console.log("Login screen: User found, redirecting to mainpage");
      router.replace("/(tabs)/mainpage");
    }
  }, [user, isUserLoading, pathname, router]);

  const isPhoneValid = useMemo(
    () => phone.replace(/\D/g, "").length >= 10,
    [phone],
  );

  const showToast = (message: string) => {
    setToast({ visible: true, message });
    setTimeout(() => setToast({ visible: false, message: "" }), 3000);
  };

  const handlePhoneChange = (text: string) => {
    setPhone(formatPhone(text));
  };

  const handleContinue = async () => {
    if (!isPhoneValid) {
      showToast("Please enter a valid phone number");
      return;
    }

    setIsLoading(true);
    try {
      const cleanPhone = phone.replace(/\D/g, "");
      const fullPhone = countryCode.replace("+", "") + cleanPhone;

      // Call Send OTP API
      await sendOtp(fullPhone);

      setIsLoading(false);
      // Smooth layout transition between steps
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setStep("OTP");
    } catch (error: any) {
      setIsLoading(false);
      const msg = error.response?.data?.message || "Failed to send OTP";
      showToast(msg);
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6) {
      showToast("Please enter a 6-digit code");
      return;
    }

    setIsLoading(true);
    try {
      const cleanPhone = phone.replace(/\D/g, "");
      const fullPhone = countryCode.replace("+", "") + cleanPhone;

      const response = await verifyOtp(fullPhone, otp);
      console.log(
        "verifyOtp FULL response:",
        JSON.stringify(response, null, 2),
      );

      setIsLoading(false);

      if (response.message_key === "auth.otp.verified_for_register") {
        // Navigate to Register Screen
        router.push({
          pathname: "/auth/register",
          params: {
            phone_number: cleanPhone,
            phone_code: countryCode.replace("+", ""),
            registered_token: response.registered_token, // Pass the token
          },
        });
      } else {
        // Login Success
        console.log("Login flow - checking for tokens...");
        console.log("response.data:", response.data);
        console.log("response.access_token:", response.access_token);

        // Try both response.data.access_token and response.access_token
        const accessToken =
          response.data?.access_token || response.access_token;
        const refreshToken =
          response.data?.refresh_token || response.refresh_token;
        const userData = response.data?.user || response.user;

        console.log("accessToken found:", !!accessToken);
        console.log("refreshToken found:", !!refreshToken);

        if (accessToken && refreshToken) {
          console.log("Saving tokens...");
          await saveTokens(accessToken, refreshToken);

          // Set in-memory token immediately
          setAuthToken(accessToken);

          console.log("Tokens saved!");

          // Small delay to ensure SecureStore write completes
          await new Promise((resolve) => setTimeout(resolve, 100));

          if (userData) {
            console.log("Setting user from response:", userData);
            setUser(userData);
          } else {
            console.log("No user in response, calling refreshProfile...");
            await refreshProfile();
          }
        } else {
          console.log("WARNING: No tokens found in response!");
        }

        if (router.canGoBack()) {
          router.dismissAll();
        }
        router.replace({
          pathname: "/(tabs)/mainpage",
          params: { showLoginSuccess: "true" },
        });
      }
    } catch (error: any) {
      setIsLoading(false);
      const msg = error.response?.data?.message || "Invalid verification code";
      showToast(msg);
    }
  };

  const handleBackToPhone = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStep("PHONE");
    setOtp("");
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <StatusBar
        barStyle={themeScheme === "dark" ? "light-content" : "dark-content"}
      />

      {/* Background Patterns */}
      <View pointerEvents="none" style={styles.patternTopWrapper}>
        <Image
          source={require("@/assets/images/efishpatterns.png")}
          style={styles.patternTop}
        />
      </View>
      <View pointerEvents="none" style={styles.patternBottomWrapper}>
        <Image
          source={require("@/assets/images/efishpatterns.png")}
          style={styles.patternBottom}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.container}
        >
          <Animated.View
            style={[
              styles.contentWrap,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* Header / Logo */}
            <View style={styles.header}>
              <View
                style={[
                  styles.langPill,
                  { backgroundColor: colors.backgroundSecondary },
                ]}
              >
                <Text style={[styles.langText, { color: colors.text }]}>
                  EN
                </Text>
              </View>
              <Image
                source={require("@/assets/images/app_logo.png")}
                style={[styles.logo]}
                resizeMode="contain"
              />
            </View>

            {/* Main Card */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.cardBorder,
                  shadowColor: colors.shadow,
                },
              ]}
            >
              <View style={styles.titleBlock}>
                <Text style={[styles.welcomeTitle, { color: colors.text }]}>
                  {step === "PHONE" ? "Welcome Back" : "Verify It's You"}
                </Text>
                <Text
                  style={[
                    styles.welcomeSubtitle,
                    { color: colors.textSecondary },
                  ]}
                >
                  {step === "PHONE"
                    ? "Enter your mobile number"
                    : `Enter code sent to ${countryCode} ${phone}`}
                </Text>
              </View>

              {step === "PHONE" ? (
                <View style={styles.formGroup}>
                  <View
                    style={[
                      styles.phoneInputWrap,
                      {
                        backgroundColor: colors.inputBackground,
                        borderColor: colors.inputBorder,
                      },
                    ]}
                  >
                    <Pressable
                      style={[
                        styles.countryBadge,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => setShowCountryPicker(!showCountryPicker)}
                    >
                      <Text
                        style={[styles.countryText, { color: colors.text }]}
                      >
                        TR {countryCode}
                      </Text>
                    </Pressable>
                    {/* Simple Picker Modal Overlay - keeping it inside mainly for simplicity or use absolute */}
                    {showCountryPicker && (
                      <View
                        style={{
                          position: "absolute",
                          top: 50,
                          left: 0,
                          backgroundColor: colors.card,
                          borderRadius: 12,
                          padding: 4,
                          elevation: 10,
                          shadowColor: colors.shadow,
                          shadowOpacity: 0.1,
                          shadowRadius: 10,
                          zIndex: 100,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        {["+90", "+1", "+44", "+49"].map((code) => (
                          <Pressable
                            key={code}
                            style={{ padding: 10 }}
                            onPress={() => {
                              setCountryCode(code);
                              setShowCountryPicker(false);
                            }}
                          >
                            <Text
                              style={{ fontWeight: "600", color: colors.text }}
                            >
                              {code}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}

                    <TextInput
                      placeholder="(5••) ••• ••••"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="phone-pad"
                      style={[styles.phoneInput, { color: colors.text }]}
                      value={phone}
                      onChangeText={handlePhoneChange}
                      autoFocus
                    />
                  </View>

                  <View
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "flex-start",
                      justifyContent: "flex-start",
                    }}
                  >
                    <Pressable
                      onPress={() => setKeepSignedIn((prev) => !prev)}
                      style={styles.checkboxRow}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          {
                            borderColor:
                              themeScheme === "dark" && keepSignedIn
                                ? colors.primary
                                : colors.text,
                          },
                          keepSignedIn && {
                            backgroundColor:
                              themeScheme === "dark"
                                ? colors.primary
                                : colors.text,
                          },
                        ]}
                      >
                        {keepSignedIn && (
                          <Ionicons
                            name="checkmark"
                            size={12}
                            color={
                              themeScheme === "dark" ? "#000" : colors.card
                            }
                          />
                        )}
                      </View>
                      <Text
                        style={[styles.checkboxText, { color: colors.text }]}
                      >
                        Keep me signed in
                      </Text>
                    </Pressable>
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryButton,
                      {
                        backgroundColor:
                          themeScheme === "dark"
                            ? colors.primary
                            : colors.secondary,
                      },
                      !isPhoneValid && [
                        styles.buttonDisabled,
                        {
                          backgroundColor:
                            themeScheme === "dark"
                              ? colors.cardBorder
                              : "#e2e8f0",
                        },
                      ],
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={handleContinue}
                    disabled={!isPhoneValid || isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator color={colors.primaryText} />
                    ) : (
                      <>
                        <Text
                          style={[
                            styles.primaryButtonText,
                            { color: colors.primaryText },
                            !isPhoneValid && { color: colors.textTertiary },
                          ]}
                        >
                          Continue
                        </Text>
                        <Ionicons
                          name="arrow-forward"
                          size={18}
                          color={
                            isPhoneValid
                              ? colors.primaryText
                              : colors.textTertiary
                          }
                        />
                      </>
                    )}
                  </Pressable>
                </View>
              ) : (
                <View style={styles.formGroup}>
                  {/* Segmented OTP Input */}
                  <Pressable
                    style={styles.otpContainer}
                    onPress={() => {
                      otpInputRef.current?.focus();
                    }}
                  >
                    <TextInput
                      ref={otpInputRef}
                      style={styles.otpHiddenInput}
                      keyboardType="number-pad"
                      maxLength={6}
                      value={otp}
                      onChangeText={(t) => {
                        setOtp(t);
                        if (t.length === 6) {
                          // Optional: Auto-submit call logic can go here
                        }
                      }}
                      autoFocus
                    />
                    <View style={styles.otpBoxesContainer} pointerEvents="none">
                      {Array.from({ length: 6 }).map((_, idx) => (
                        <View
                          key={idx}
                          style={[
                            styles.otpBox,
                            {
                              backgroundColor: colors.inputBackground,
                              borderColor: colors.inputBorder,
                            },
                            otp.length === idx && [
                              styles.otpBoxActive,
                              {
                                borderColor: colors.primary,
                                backgroundColor: colors.card,
                                shadowColor: colors.primary,
                              },
                            ],
                            otp.length > idx && [
                              styles.otpBoxFilled,
                              {
                                borderColor: colors.text,
                                backgroundColor: colors.card,
                              },
                            ],
                          ]}
                        >
                          <Text
                            style={[
                              styles.otpText,
                              { color: colors.text },
                              otp.length === idx && { color: colors.primary },
                            ]}
                          >
                            {otp[idx] || ""}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryButton,
                      {
                        backgroundColor:
                          themeScheme === "dark"
                            ? colors.primary
                            : colors.secondary,
                      },
                      (otp.length !== 6 || isLoading) && [
                        styles.buttonDisabled,
                        {
                          backgroundColor:
                            themeScheme === "dark"
                              ? colors.cardBorder
                              : "#e2e8f0",
                        },
                      ],
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={handleVerify}
                    disabled={otp.length !== 6 || isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text
                        style={[
                          styles.primaryButtonText,
                          { color: colors.primaryText },
                          otp.length !== 6 && styles.buttonTextDisabled,
                        ]}
                      >
                        Verify & Login
                      </Text>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={handleBackToPhone}
                    style={styles.textLink}
                  >
                    <Text style={styles.textLinkContent}>Change Number</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* Footer */}
            <View style={styles.footer}></View>
          </Animated.View>
        </KeyboardAvoidingView>
      </ScrollView>

      {/* Custom Toast */}
      {toast.visible && (
        <View style={styles.toast}>
          <Ionicons name="information-circle" size={20} color="#fff" />
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  contentWrap: {
    gap: 32,
  },
  patternTopWrapper: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 250,
    height: 250,
    opacity: 0.7,
    transform: [{ rotate: "180deg" }],
  },
  patternTop: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
  },
  patternBottomWrapper: {
    position: "absolute",
    bottom: -60,
    left: -40,
    width: 280,
    height: 280,
    opacity: 0.7,
  },
  patternBottom: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
  },
  header: {
    alignItems: "center",
  },
  logo: {
    width: 140,
    height: 70,
  },
  langPill: {
    position: "absolute",
    right: 0,
    top: 0,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  langText: {
    fontSize: 12,
    fontWeight: "700",
    color: brandNavy,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 36,
    padding: 32,
    shadowColor: brandNavy,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 12,
    borderWidth: 1,
    borderColor: "#f8fafc",
    gap: 28,
  },
  titleBlock: {
    alignItems: "center",
    gap: 8,
  },
  welcomeTitle: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  welcomeSubtitle: {
    fontSize: 15,
    fontWeight: "500",
  },
  formGroup: {
    gap: 20,
  },
  phoneInputWrap: {
    height: 60,
    borderRadius: 20,
    backgroundColor: "#f8f9fa",
    borderWidth: 1.5,
    borderColor: "#e9ecef",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  countryBadge: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  countryText: {
    fontWeight: "700",
    color: brandNavy,
    fontSize: 13,
  },
  phoneInput: {
    flex: 1,
    height: "100%",
    fontSize: 18,
    fontWeight: "600",
    color: brandNavy,
    letterSpacing: 0.5,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: brandNavy,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxChecked: {
    backgroundColor: brandNavy,
    borderColor: brandNavy,
  },
  checkboxText: {
    color: brandNavy,
    fontWeight: "600",
    fontSize: 14,
  },
  primaryButton: {
    height: 60,
    borderRadius: 20,
    backgroundColor: brandNavy,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: brandNavy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  buttonDisabled: {
    backgroundColor: "#e2e8f0",
    shadowOpacity: 0,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  buttonTextDisabled: {
    color: "#94a3b8",
  },
  otpContainer: {
    height: 60,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  otpHiddenInput: {
    position: "absolute",
    width: "100%",
    height: "100%",
    opacity: 0,
    zIndex: 10, // Ensure it's on top
  },
  otpBoxesContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignSelf: "center",
    width: "100%",
    gap: 6,
  },
  otpBox: {
    flex: 1,
    height: 60,
    borderRadius: 14,
    backgroundColor: "#f8f9fa",
    borderWidth: 1.5,
    borderColor: "#e9ecef",
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxActive: {
    borderColor: brandBlue,
    backgroundColor: "#fff",
    borderWidth: 2,
    shadowColor: brandBlue,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    transform: [{ scale: 1.05 }],
  },
  otpBoxFilled: {
    borderColor: brandNavy,
    backgroundColor: "#fff",
  },
  otpText: {
    fontSize: 24,
    fontWeight: "700",
    color: brandNavy,
  },
  textLink: {
    alignItems: "center",
    paddingVertical: 8,
  },
  textLinkContent: {
    color: brandSlate,
    fontWeight: "600",
    fontSize: 14,
  },
  footer: {
    alignItems: "center",
  },
  guestLink: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    opacity: 0.8,
  },
  guestText: {
    color: brandNavy,
    fontSize: 15,
    fontWeight: "700",
    opacity: 0.8,
  },
  toast: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    backgroundColor: "#0f231c",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 100,
  },
  toastText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
});
