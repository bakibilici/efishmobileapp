import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";

import { DriveSessionHistoryStorage } from "@/services/driveSessionHistory";
import type { DemoUserProfile } from "@/services/localUserStorage";
import { LocalUserStorage } from "@/services/localUserStorage";

/*
 * The two KVKK m.11 actions of Hesabım, moved out of the old profile screen
 * unchanged: what the file holds and what deletion removes are exactly what
 * they were. Only the pages around them changed. Both throw on failure; the
 * page tells the person.
 */

/** Writes the person's data as JSON in the app's documents folder and opens the share sheet. */
export async function exportUserData(user: DemoUserProfile): Promise<void> {
  const sessions = await DriveSessionHistoryStorage.listSessions(user.id);
  const payload = {
    exported_at: new Date().toISOString(),
    profile: {
      first_name: user.first_name,
      last_name: user.last_name,
      phone: `+${user.phone_code} ••• ${user.phone_last_four}`,
      interests: user.interests,
      consent_version: user.consent_version,
      consent_at: user.consent_at ? new Date(user.consent_at).toISOString() : null,
      created_at: new Date(user.created_at).toISOString(),
    },
    drive_sessions: sessions,
    note: "Konum bilgileri ~1 km hassasiyetine yuvarlanmış olarak saklanır.",
  };
  const uri = `${FileSystem.documentDirectory}akba-verilerim-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload, null, 2));
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/json" });
  else Alert.alert("Dışa aktarıldı", uri);
}

/**
 * A key an earlier build's payment screen wrote the card number and the CVC
 * into. That screen and everything that read the key are gone, which stops
 * new writes but cannot reach what an install already holds — so deletion
 * takes it with the rest. Nothing else in the app knows this name any more.
 */
const LEGACY_PAYMENT_CARDS_KEY = "user_payment_cards";

/** Deletes the person's saved routes and profile from this phone, then signs out (logout goes to "/"). */
export async function deleteAccount(
  user: DemoUserProfile,
  logout: () => Promise<void>,
): Promise<void> {
  await DriveSessionHistoryStorage.deleteSessionsForUser(user.id);
  await LocalUserStorage.deleteUser(user.id);
  await AsyncStorage.removeItem(LEGACY_PAYMENT_CARDS_KEY);
  await logout();
}
