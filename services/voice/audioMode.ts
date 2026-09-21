import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";

/**
 * The one expo-av audio mode the car-mode sounds (the route-planning hold loop
 * and the listen earcons) play under. Kept in one place because every call
 * rewrites the process-wide audio session that LiveKit and the wake-word
 * recognizer also use; two diverging copies would fight each other.
 */
export async function applyAkbaAudioMode(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    // This call mutates the process-wide AVAudioSession that LiveKit
    // configured, and nothing restores it afterwards. Leaving it false is
    // what lets iOS tear the call's audio down the moment the screen locks
    // — right after a route is planned, which is exactly when the driver
    // puts the phone away. UIBackgroundModes already declares "audio".
    staysActiveInBackground: true,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: false,
  });
}
