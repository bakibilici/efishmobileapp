import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
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

const navy = "#0f2f4f";
const body = "#3c4a5b";
const field = "#f1f4f7";
const border = "#dbe1ea";
const disabled = "#cfd6de";

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
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const isFormValid = useMemo(
    () => phone.replace(/\D/g, "").length === 10 && password.length >= 4,
    [password.length, phone]
  );

  const handlePhoneChange = (text: string) => {
    setPhone(formatPhone(text));
  };

  const handleSignIn = () => {
    if (!isFormValid) {
      Alert.alert(
        "Eksik bilgi",
        "Lütfen telefon numarası ve şifreyi kontrol edin."
      );
      return;
    }
    router.replace("/(tabs)");
  };

  const handleContinueAsGuest = () => {
    router.replace("/(tabs)");
  };

  const handleForgotPassword = () => {
    Alert.alert(
      "Şifre sıfırlama",
      "Şifre sıfırlama bağlantısı e-posta veya SMS ile gönderilecek."
    );
  };

  const handleSignUp = () => {
    Alert.alert(
      "Kayıt ol",
      "Kayıt işlemi yakında eklenecek. Şimdilik misafir olarak devam edebilirsiniz."
    );
    handleContinueAsGuest();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

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
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.container}
        >
          <View style={styles.languagePill}>
            <Text style={styles.languageText}>EN</Text>
          </View>

          <Image
            source={require("@/assets/images/efishlogo.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <View style={styles.titleBlock}>
            <Text style={styles.welcomeTitle}>Welcome</Text>
            <Text style={styles.welcomeSubtitle}>
              If you're ready to boost your energy with efish, let's get
              started!
            </Text>
          </View>

          <View style={styles.inputStack}>
            <View style={styles.phoneRow}>
              <Pressable style={styles.countrySelector}>
                <Text style={styles.countryCode}>+90</Text>
                <Ionicons name="chevron-down" size={18} color={navy} />
              </Pressable>
              <TextInput
                placeholder="(5xx) xxx xx xx"
                placeholderTextColor="#6a7789"
                keyboardType="phone-pad"
                style={styles.phoneInput}
                value={phone}
                onChangeText={handlePhoneChange}
              />
            </View>

            <View style={styles.passwordRow}>
              <TextInput
                placeholder="Password"
                placeholderTextColor="#6a7789"
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
              />
              <Pressable
                onPress={() => setShowPassword((prev) => !prev)}
                hitSlop={10}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color={navy}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.helperRow}>
            <Pressable
              onPress={() => setRememberMe((prev) => !prev)}
              style={styles.rememberRow}
            >
              <View
                style={[styles.checkbox, rememberMe && styles.checkboxChecked]}
              >
                {rememberMe && (
                  <Ionicons name="checkmark" size={16} color="#ffffff" />
                )}
              </View>
              <Text style={styles.rememberText}>Remember Me</Text>
            </Pressable>

            <Pressable onPress={handleForgotPassword}>
              <Text style={styles.forgotLink}>Forgot Password</Text>
            </Pressable>
          </View>

          <Pressable onPress={handleContinueAsGuest} style={styles.guestLink}>
            <Text style={styles.guestText}>Continue As a Guest &gt;&gt;</Text>
          </Pressable>

          <View style={styles.actionButtons}>
            <Pressable onPress={handleSignUp} style={styles.signUpButton}>
              <Text style={styles.signUpText}>Sign up</Text>
            </Pressable>
            <Pressable
              onPress={handleSignIn}
              disabled={!isFormValid}
              style={[
                styles.signInButton,
                isFormValid
                  ? styles.signInButtonActive
                  : styles.signInButtonDisabled,
              ]}
            >
              <Text
                style={[
                  styles.signInText,
                  isFormValid
                    ? styles.signInTextActive
                    : styles.signInTextDisabled,
                ]}
              >
                Sign in
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </ScrollView>
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
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 18,
  },
  patternTopWrapper: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 140,
    height: 140,
    zIndex: 0,
    transform: [{ rotate: "180deg" }],
    opacity: 0.3,
  },
  patternTop: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  patternBottomWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 180,
    height: 180,
    zIndex: 0,
    opacity: 0.3,
  },
  patternBottom: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  languagePill: {
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#eef2f6",
    borderRadius: 999,
    zIndex: 1,
  },
  languageText: {
    color: navy,
    fontWeight: "700",
  },
  logo: {
    alignSelf: "center",
    width: 140,
    height: 60,
    marginTop: 12,
  },
  titleBlock: {
    gap: 6,
    zIndex: 1,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: navy,
    marginTop: 24,
  },
  welcomeSubtitle: {
    fontSize: 17,
    color: body,
    lineHeight: 24,
  },
  inputStack: {
    gap: 14,
    zIndex: 1,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  countrySelector: {
    height: 58,
    minWidth: 96,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: field,
    borderWidth: 1,
    borderColor: border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  countryCode: {
    color: navy,
    fontWeight: "700",
    fontSize: 16,
  },
  phoneInput: {
    flex: 1,
    height: 58,
    borderRadius: 20,
    backgroundColor: field,
    borderWidth: 1,
    borderColor: border,
    paddingHorizontal: 16,
    fontSize: 16,
    color: navy,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 58,
    borderRadius: 20,
    backgroundColor: field,
    borderWidth: 1,
    borderColor: border,
    paddingHorizontal: 14,
  },
  passwordInput: {
    flex: 1,
    fontSize: 16,
    color: navy,
  },
  eyeButton: {
    paddingHorizontal: 6,
  },
  helperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 1,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: navy,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  checkboxChecked: {
    backgroundColor: navy,
    borderColor: navy,
  },
  rememberText: {
    color: navy,
    fontWeight: "700",
  },
  forgotLink: {
    color: navy,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  guestLink: {
    alignItems: "center",
    paddingVertical: 8,
    zIndex: 1,
  },
  guestText: {
    color: navy,
    fontSize: 16,
    fontWeight: "800",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
    zIndex: 1,
  },
  signUpButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "#2cdb9b",
    alignItems: "center",
    justifyContent: "center",
  },
  signUpText: {
    color: "#2cdb9b",
    fontWeight: "800",
    fontSize: 15,
  },
  signInButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  signInText: {
    color: navy,
    fontWeight: "800",
    fontSize: 16,
  },
  signInButtonDisabled: {
    backgroundColor: "#d6dde6",
    borderWidth: 1,
    borderColor: "#c4ccd7",
  },
  signInTextDisabled: {
    color: "#7f8b99",
  },
  signInButtonActive: {
    backgroundColor: "#2cdb9b",
    borderWidth: 0,
  },
  signInTextActive: {
    color: "#ffffff",
  },
});
