import { SafeAreaView, StyleSheet } from "react-native";
import NetworkLogger, {
  startNetworkLogging,
} from "react-native-network-logger";
import { useEffect } from "react";

export default function NetworkLoggerScreen() {
  useEffect(() => {
    if (__DEV__) {
      // Başlatmayı sadece development ortamında tutuyoruz
      startNetworkLogging();
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <NetworkLogger />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

