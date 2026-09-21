import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

/**
 * Apple's microphone modes for the voice session. iOS only; everywhere else,
 * and on a dev client built before this module existed, every call is a no-op.
 */

export type MicMode = "standard" | "voiceIsolation" | "wideSpectrum" | "unknown";

type MicModeNativeModule = {
  showMicModePicker(): Promise<boolean>;
  activeMicMode(): MicMode;
};

const native =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<MicModeNativeModule>("MicMode")
    : null;

/** Whether the picker can be opened on this build and device. */
export const isMicModePickerAvailable = native !== null;

/**
 * Opens the system picker (Control Center) where the driver can choose Voice
 * Isolation. Only meaningful while the microphone is in use by a call.
 * Resolves false when the picker could not be shown.
 */
export async function showMicModePicker(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.showMicModePicker();
  } catch (error) {
    console.warn("[MicMode] Could not open the microphone-mode picker:", error);
    return false;
  }
}

/** The microphone mode the driver picked for this app, or "unknown". */
export function activeMicMode(): MicMode {
  if (!native) return "unknown";
  try {
    return native.activeMicMode();
  } catch {
    return "unknown";
  }
}
