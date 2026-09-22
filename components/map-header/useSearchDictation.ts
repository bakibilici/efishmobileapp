import Voice, {
  type SpeechErrorEvent,
  type SpeechResultsEvent,
} from "@react-native-voice/voice";
import * as Haptics from "expo-haptics";
import * as Localization from "expo-localization";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

/**
 * Dictation into the map's search field: the spoken text as it comes
 * (`final` false), then once more when the dictation ends (`final` true).
 *
 * The end is platform-specific. On iOS every result, partial or final,
 * arrives as both onSpeechResults and onSpeechPartialResults, and
 * onSpeechEnd follows the last one; on Android onSpeechResults is the final
 * result and onSpeechEnd comes before it. So the final text is sent from
 * onSpeechEnd on iOS and from onSpeechResults on Android, once per session.
 * An error or `cancel` ends the session without a final text.
 */
export function useSearchDictation(onText: (text: string, final: boolean) => void): {
  listening: boolean;
  toggle: () => Promise<void>;
  cancel: () => Promise<void>;
} {
  const [listening, setListening] = useState(false);
  const onTextRef = useRef(onText);
  const lastRef = useRef<string | null>(null);
  const finalizedRef = useRef(false);

  useEffect(() => {
    onTextRef.current = onText;
  });

  useEffect(() => {
    const finish = () => {
      setListening(false);
      if (!finalizedRef.current && lastRef.current) {
        finalizedRef.current = true;
        onTextRef.current(lastRef.current, true);
      }
    };
    const take = (event: SpeechResultsEvent) => {
      // A result that arrives after the session ended (cancelled, failed) is dropped.
      if (finalizedRef.current) return;
      const text = event.value?.[0];
      if (!text) return;
      lastRef.current = text;
      onTextRef.current(text, false);
    };

    Voice.onSpeechStart = () => setListening(true);
    Voice.onSpeechPartialResults = take;
    Voice.onSpeechResults = (event) => {
      take(event);
      if (Platform.OS === "android") finish();
    };
    Voice.onSpeechEnd = () => {
      // Android: the final result (or an error) is still to come.
      if (Platform.OS === "ios") finish();
    };
    Voice.onSpeechError = (event: SpeechErrorEvent) => {
      // Gracefully handle "No speech detected" timeouts
      const isNoSpeech =
        event.error?.message?.includes("No speech detected") || event.error?.code === "7";
      if (!isNoSpeech) {
        console.error("Speech Error:", event);
      }
      finalizedRef.current = true;
      setListening(false);
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (listening) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // The final text arrives through the end of the session (finish).
        await Voice.stop();
      } else {
        lastRef.current = null;
        finalizedRef.current = false;
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const locale = Localization.getLocales()[0]?.languageTag || "tr-TR";
        await Voice.start(locale);
      }
    } catch (error) {
      console.error("Toggle Listening Error:", error);
    }
  }, [listening]);

  const cancel = useCallback(async () => {
    finalizedRef.current = true;
    setListening(false);
    try {
      await Voice.cancel();
    } catch (error) {
      console.error("Cancel Listening Error:", error);
    }
  }, []);

  return { listening, toggle, cancel };
}
