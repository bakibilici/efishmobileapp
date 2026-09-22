import { usePreventRemove } from "@react-navigation/native";
import { Stack, useNavigation, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePushedPageOptions } from "@/components/navigation/stackOptions";
import { FieldRow } from "@/components/profile/FieldRow";
import { formatPhoneInput } from "@/components/profile/profileFormat";
import {
  BottomActionBar,
  GlassCapsuleButton,
  useBottomActionBarInset,
} from "@/components/ui/GlassCapsuleButton";
import { GroupFooter, ListGroup, Row, SectionHeader, SIDE_MARGIN } from "@/components/ui/GroupedList";
import { usePagePalette } from "@/components/ui/pagePalette";
import { useUser } from "@/context/UserContext";
import { LocalUserStorage } from "@/services/localUserStorage";

/** Room between the lifted button and the keyboard. */
const KEYBOARD_GAP = 8;

/**
 * How far the pinned button rises while the keyboard is up, so "Kaydet"
 * stays in reach while typing. A transform only: the button is glass.
 *
 * Android needs it too: with edge-to-edge on, `adjustResize` no longer
 * shrinks the React Native view, so the keyboard would cover the bar. There
 * only the Did events fire, and their height leaves out the system
 * navigation bar under the keyboard (ReactRootView: ime minus systemBars),
 * so it is added back.
 */
function useKeyboardLift(): Animated.Value {
  const insets = useSafeAreaInsets();
  const [lift] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // The bar already keeps the home indicator's (or navigation bar's) room under the button.
    const barBottom = Math.max(insets.bottom, 16);
    const keyboardExtra = Platform.OS === "android" ? insets.bottom : 0;
    const move = (toValue: number, duration: number) =>
      Animated.timing(lift, {
        toValue,
        duration: duration || 250,
        // Close to the keyboard's own curve.
        easing: Easing.bezier(0.17, 0.59, 0.4, 0.77),
        useNativeDriver: true,
      }).start();
    const [showEvent, hideEvent] =
      Platform.OS === "ios"
        ? (["keyboardWillShow", "keyboardWillHide"] as const)
        : (["keyboardDidShow", "keyboardDidHide"] as const);
    const subs = [
      Keyboard.addListener(showEvent, (e) =>
        move(
          -Math.max(e.endCoordinates.height + keyboardExtra + KEYBOARD_GAP - barBottom, 0),
          e.duration,
        ),
      ),
      Keyboard.addListener(hideEvent, (e) => move(0, e.duration)),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, [insets.bottom, lift]);

  return lift;
}

/**
 * Kişisel bilgiler: the name and the phone number, edited in place as in
 * Contacts and saved with the pinned "Kaydet". Leaving with unsaved edits
 * (back button, swipe, Android back) asks first.
 *
 * "Kaydet" is not a navigation bar item: react-native-screens 4.16 on
 * iOS 26 stretches a custom bar item's glass far past its content, so it
 * would read as a broken pill. It is the pinned glass capsule the other
 * Hesabım pages use.
 */
export default function PersonalDetailsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const palette = usePagePalette();
  const options = usePushedPageOptions("Kişisel bilgiler");
  const bottomInset = useBottomActionBarInset();
  const keyboardLift = useKeyboardLift();
  const { user, setUser } = useUser();

  const [firstName, setFirstName] = useState(() => user?.first_name ?? "");
  const [lastName, setLastName] = useState(() => user?.last_name ?? "");
  const [phone, setPhone] = useState("");
  // The length error waits for the field to be left (or for a digit too
  // many), so it does not scold a number still being typed.
  const [phoneLeft, setPhoneLeft] = useState(false);
  // Stays on after a successful save, so leaving is not taken for discarding.
  const [saving, setSaving] = useState(false);

  const lastNameInput = useRef<TextInput>(null);
  const phoneInput = useRef<TextInput>(null);

  const phoneDigits = phone.replace(/\D/g, "");
  const nameMissing = !firstName.trim() || !lastName.trim();
  const phoneInvalid = phoneDigits.length > 0 && phoneDigits.length !== 10;
  const showPhoneError = phoneInvalid && (phoneLeft || phoneDigits.length > 10);
  const dirty =
    user != null &&
    (firstName.trim() !== user.first_name.trim() ||
      lastName.trim() !== user.last_name.trim() ||
      phoneDigits.length > 0);
  const canSave = dirty && !nameMissing && !phoneInvalid;

  const save = async () => {
    if (!user || !canSave || saving) return;
    setSaving(true);
    try {
      const cleaned = phone.replace(/\D/g, "");
      const updated = await LocalUserStorage.updateUser(user.id, {
        firstName,
        lastName,
        phoneNumber: cleaned.length === 10 ? cleaned : undefined,
        phoneCode: user.phone_code,
        interests: user.interests,
      });
      if (updated) setUser(updated);
      router.back();
    } catch (error) {
      console.warn(error);
      setSaving(false);
      Alert.alert("Profil güncellenemedi", "Lütfen tekrar deneyin.");
    }
  };

  usePreventRemove(dirty && !saving, ({ data }) => {
    Alert.alert("Değişiklikler kaydedilmedi", "Çıkarsanız yaptığınız değişiklikler kaybolur.", [
      { text: "Düzenlemeye devam et", style: "cancel" },
      {
        text: "Kaydetmeden çık",
        style: "destructive",
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  if (!user) return null;

  return (
    <>
      <Stack.Screen options={options} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        scrollIndicatorInsets={{ bottom: bottomInset }}
      >
        <SectionHeader title="AD SOYAD" palette={palette} />
        <ListGroup palette={palette} separatorInset={16}>
          <FieldRow
            palette={palette}
            label="Ad"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="givenName"
            autoComplete="name-given"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => lastNameInput.current?.focus()}
          />
          <FieldRow
            ref={lastNameInput}
            palette={palette}
            label="Soyad"
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="familyName"
            autoComplete="name-family"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => phoneInput.current?.focus()}
          />
        </ListGroup>
        {nameMissing ? (
          <Text style={[styles.error, { color: palette.red }]}>Ad ve soyad boş bırakılamaz.</Text>
        ) : null}

        <SectionHeader title="TELEFON" palette={palette} />
        <ListGroup palette={palette} separatorInset={16}>
          <Row palette={palette} title="Kayıtlı numara" value={user.phone_number} />
          <FieldRow
            ref={phoneInput}
            palette={palette}
            label="Yeni numara"
            value={phone}
            onChangeText={(text) => setPhone(formatPhoneInput(text))}
            onBlur={() => setPhoneLeft(true)}
            onFocus={() => setPhoneLeft(false)}
            placeholder="5XX XXX XX XX"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
          />
        </ListGroup>
        {showPhoneError ? (
          <Text style={[styles.error, { color: palette.red }]}>
            Telefon numarası 10 haneli olmalıdır.
          </Text>
        ) : null}
        <GroupFooter
          palette={palette}
          text="Numaranızın tamamı bu telefonda saklanmadığı için yalnızca son dört hanesi gösterilir. Yeni bir numara girerseniz sonraki girişlerde bu numarayı kullanırsınız."
        />
      </ScrollView>

      <Animated.View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, { transform: [{ translateY: keyboardLift }] }]}
      >
        <BottomActionBar>
          <GlassCapsuleButton
            title="Kaydet"
            disabled={!canSave}
            loading={saving}
            loadingTitle="Kaydediliyor…"
            accessibilityHint="Adınızı ve telefon numaranızı kaydeder"
            onPress={() => void save()}
          />
        </BottomActionBar>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  // A group footer's metrics in red: GroupFooter itself is always grey.
  error: {
    marginTop: 7,
    marginHorizontal: SIDE_MARGIN + 16,
    fontSize: 13,
    lineHeight: 18,
  },
});
