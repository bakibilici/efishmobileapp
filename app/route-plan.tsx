import { useTheme } from "@/context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

interface RouteFormState {
  origin: { latitude: number; longitude: number } | null;
  originLabel: string;
  originName: string;
  destination: { latitude: number; longitude: number } | null;
  destinationLabel: string;
  destinationName: string;
  started: number; // 0–100
  destinationCharge: number; // 10–80
  acIncluded: boolean;
  mode: "normal";
  vehicleId: string | number;
  passengers: number;
  lang: string;
  datetime: number | null;
}

export default function RoutePlanScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ vehicleId?: string }>();

  // Initial Form State
  const [form, setForm] = useState<RouteFormState>({
    origin: { latitude: 39.9208, longitude: 32.8541 }, // Mock initial location
    originLabel: "Konumunuz",
    originName: "Konumunuz",
    destination: null,
    destinationLabel: "",
    destinationName: "",
    started: 80,
    destinationCharge: 20,
    acIncluded: false,
    mode: "normal",
    vehicleId: params.vehicleId || "unknown",
    passengers: 0,
    lang: "tr-TR",
    datetime: null,
  });

  const handleCreateRoute = () => {
    // In a real app, we'd set the timestamp here
    const finalForm = {
      ...form,
      datetime: Math.floor(Date.now() / 1000),
    };
    console.log("Creating Route with state:", JSON.stringify(finalForm, null, 2));
    // simulate backend call success
    alert("Rota Oluşturuluyor...");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Rota Planla</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Section: Locations */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>KONUMLAR</Text>
            
            {/* Origin (ReadOnly) */}
            <View style={[styles.locationRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <View style={styles.locationInfo}>
                <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>Nereden</Text>
                <Text style={[styles.locationValue, { color: colors.text }]}>Konumunuz</Text>
              </View>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textTertiary} />
            </View>

            <View style={[styles.connector, { backgroundColor: colors.border }]} />

            {/* Destination Select */}
            <Pressable 
              style={[styles.locationRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => console.log("Open Google Autocomplete")}
            >
              <View style={[styles.dot, { backgroundColor: "#FF3B30" }]} />
              <View style={styles.locationInfo}>
                <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>Nereye</Text>
                <Text style={[styles.locationValue, { color: form.destinationName ? colors.text : colors.textTertiary }]}>
                  {form.destinationName || "Hedef ara..."}
                </Text>
              </View>
              <Ionicons name="search" size={20} color={colors.primary} />
            </Pressable>
          </View>

          {/* Section: Battery */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>PİL AYARLARI</Text>
            
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Başlangıç Pil Durumu</Text>
                <Text style={[styles.settingSub, { color: colors.textSecondary }]}>Mevcut pil yüzdesi</Text>
              </View>
              <View style={[styles.inputBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={String(form.started)}
                  onChangeText={(v) => {
                    const num = parseInt(v) || 0;
                    if (num >= 0 && num <= 100) setForm({...form, started: num});
                  }}
                  keyboardType="numeric"
                  maxLength={3}
                />
                <Text style={{ color: colors.textSecondary }}>%</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Hedef Pil Durumu</Text>
                <Text style={[styles.settingSub, { color: colors.textSecondary }]}>Varışta istediğiniz min. pil (10-80)</Text>
              </View>
              <View style={[styles.inputBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={String(form.destinationCharge)}
                  onChangeText={(v) => {
                    const num = parseInt(v) || 0;
                    if (num >= 0 && num <= 80) setForm({...form, destinationCharge: num});
                  }}
                  keyboardType="numeric"
                  maxLength={2}
                />
                <Text style={{ color: colors.textSecondary }}>%</Text>
              </View>
            </View>
          </View>

          {/* Section: Options */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>ROTA SEÇENEKLERİ</Text>
            
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>AC dahil edilsin mi</Text>
                <Text style={[styles.settingSub, { color: colors.textSecondary }]}>Yavaş şarj istasyonlarını göster</Text>
              </View>
              <Switch
                value={form.acIncluded}
                onValueChange={(val) => setForm({...form, acIncluded: val})}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={Platform.OS === 'ios' ? undefined : (form.acIncluded ? "#fff" : "#f4f3f4")}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer Button */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Pressable 
          style={({ pressed }) => [
            styles.submitButton, 
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.9 }
          ]}
          onPress={handleCreateRoute}
        >
          <Text style={styles.submitButtonText}>Rota Oluştur</Text>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: Platform.OS === 'ios' ? 110 : 80,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 16,
    letterSpacing: 1,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 16,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 2,
  },
  locationValue: {
    fontSize: 15,
    fontWeight: "600",
  },
  connector: {
    width: 2,
    height: 20,
    marginLeft: 20,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  settingSub: {
    fontSize: 13,
  },
  inputBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 80,
  },
  input: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "right",
    marginRight: 4,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: "#eee",
    marginVertical: 16,
  },
  footer: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    backgroundColor: "#fff",
  },
  submitButton: {
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
});
