import Ionicons from "@expo/vector-icons/Ionicons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  DeviceEventEmitter,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";

export default function QRScannerModal() {
  const { colors } = useTheme();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleClose = () => {
    router.back();
  };

  const handleBarcodeScanned = async ({
    type,
    data,
  }: {
    type: string;
    data: string;
  }) => {
    if (scanned) return;
    setScanned(true);

    // Debug: Log raw QR data
    console.log('=== QR RETURN ===');
    console.log('Type:', type);
    console.log('Raw Data:', data);
    console.log('=================');

    // QR contains a URL - we need to fetch data from it
    try {
      const response = await fetch(data);
      const result = await response.json();

      console.log('=== QR API RESPONSE ===');
      console.log(JSON.stringify(result, null, 2));
      console.log('=======================');

      if (result.success && result.data?.socket?.uuid) {
        // Success - emit socket UUID to mainpage
        const socketUuid = result.data.socket.uuid;
        DeviceEventEmitter.emit('evt_QR_SCANNED', { socketUuid });

        // Close scanner
        closeScanner();
      } else if (result.message_key === 'qr_code.not_plugged') {
        // Cable not plugged - emit event to show modal
        DeviceEventEmitter.emit('evt_QR_NOT_PLUGGED', {});
        closeScanner();
      } else {
        // Unknown error
        console.log('QR Scan Error:', result.message_key || 'Unknown error');
        setScanned(false); // Allow retry
      }
    } catch (error) {
      console.log('QR API Error:', error);
      setScanned(false); // Allow retry
    }
  };

  const closeScanner = () => {
    if (router.canDismiss()) {
      router.dismiss();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/mainpage");
    }
  };

  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <Pressable style={styles.closeTextButton} onPress={handleClose}>
            <Text style={styles.closeText}>Kapat</Text>
          </Pressable>
        </View>
        <View style={styles.contentContainer}>
          <Ionicons name="camera-outline" size={80} color="#002331" />
          <Text style={styles.title}>Kamera İzni Gerekli</Text>
          <Text style={styles.subtitle}>
            QR kod taramak için kamera erişimine izin vermen gerekiyor.
          </Text>
          <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={requestPermission}>
            <Text style={styles.buttonText}>İzin Ver</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      {/* Overlay System - Masking */}
      <View style={styles.overlay}>
        {/* Top Dark Overlay */}
        <View style={styles.overlayTop}>
          <SafeAreaView style={styles.safeHeader}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }} />
              <Text style={styles.scanTitle}>Scan QR</Text>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Pressable
                  style={styles.closeTextButton}
                  onPress={handleClose}
                >
                  <Text style={[styles.closeTextWhite, { color: colors.primary }]}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        </View>

        {/* Middle Section */}
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySide} />
          {/* Scanner Box */}
          <View style={styles.scanBox}>
            {/* Green Corners */}
            <View style={[styles.corner, styles.topLeft, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.topRight, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.bottomLeft, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.bottomRight, { borderColor: colors.primary }]} />
          </View>
          <View style={styles.overlaySide} />
        </View>

        {/* Bottom Dark Overlay */}
        <View style={styles.overlayBottom}>
          <Text style={styles.instructionText}>
            Place QR Code here.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, backgroundColor: "#000" },
  permissionContainer: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, backgroundColor: "#000" },

  // Header & Permissions
  header: {
    paddingTop: 16,
    paddingHorizontal: 20,
    alignItems: "flex-end",
  },
  contentContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  title: { fontSize: 28, fontWeight: "800", color: "#002331" },
  subtitle: {
    fontSize: 16,
    color: "#3c4a5b",
    textAlign: "center",
    paddingHorizontal: 24,
  },
  button: {
    marginTop: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#0093C9",
  },
  buttonText: { color: "#ffffff", fontWeight: "800", fontSize: 16 },
  closeTextButton: {
    backgroundColor: "#ffffff",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  closeText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#007AFF",
  },
  closeTextWhite: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0093C9",
  },

  // Overlay System
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: "rgba(0, 147, 201, 0.2)",
  },
  overlayMiddle: {
    flexDirection: "row",
    height: 260, // Fixed scan box size
  },
  overlaySide: {
    flex: 1,
    backgroundColor: "rgba(0, 147, 201, 0.2)",
  },
  scanBox: {
    width: 260,
    height: 260,
    backgroundColor: "transparent",
    position: "relative",
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: "rgba(0, 147, 201, 0.2)",
    alignItems: "center",
    paddingTop: 40,
  },

  // Scan Box UI
  corner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderColor: "#0093C9",
    borderWidth: 5,
    borderRadius: 4,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderBottomWidth: 0,
    borderRightWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },

  // Header Elements
  safeHeader: {
    flex: 1,
    justifyContent: "flex-start",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    height: 44,
  },
  scanTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  instructionText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontWeight: "500",
  },
});
