import CustomDatePicker from "@/components/CustomDatePicker";
import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { register, setAuthToken } from "@/services/api";
import { saveTokens } from "@/services/tokenStorage";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View
} from "react-native";

const navy = "#0f2f4f";
const field = "#f8f9fa";
const border = "#e9ecef";
const primary = "#2CDD9D";

export default function RegisterScreen() {
    const router = useRouter();
    const { setUser } = useUser();
    const { colors, themeScheme } = useTheme();
    const [loading, setLoading] = useState(false);

    // Form State
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");

    // Date Picker State
    const [birthday, setBirthday] = useState(new Date("1990-01-01"));
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [isTurkish, setIsTurkish] = useState(true);

    // Condtional Fields
    const [tckn, setTckn] = useState("");
    const [passportNumber, setPassportNumber] = useState("");


    // Get params from previous screen
    const params = useLocalSearchParams();
    const phoneNumber = params.phone_number as string;
    const phoneCode = params.phone_code as string;
    const registeredToken = params.registered_token as string;

    const onDateSelect = (date: Date) => {
        setBirthday(date);
    };

    const formatDate = (date: Date) => {
        const d = date.getDate().toString().padStart(2, '0');
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const y = date.getFullYear();
        return `${d}-${m}-${y}`;
    };

    const formatDateForApi = (date: Date) => {
        const d = date.getDate().toString().padStart(2, '0');
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const y = date.getFullYear();
        return `${y}-${m}-${d}`;
    }


    const handleRegister = async () => {
        // Basic Validation
        if (!firstName || !lastName) {
            Alert.alert("Error", "Please fill in all personal details.");
            return;
        }

        if (isTurkish && tckn.length !== 11) {
            Alert.alert("Error", "Please enter a valid 11-digit TCKN.");
            return;
        }

        if (!isTurkish && !passportNumber) {
            Alert.alert("Error", "Please enter your passport number.");
            return;
        }

        setLoading(true);
        try {
            const response = await register({
                first_name: firstName,
                last_name: lastName,
                phone_code: phoneCode || "90",
                phone_number: phoneNumber || "5555555555",
                birthday: formatDateForApi(birthday),
                is_turkish: isTurkish,
                tckn: isTurkish ? tckn : undefined,
                passport_number: !isTurkish ? passportNumber : undefined,
                registered_token: registeredToken
            });

            console.log("Register response:", JSON.stringify(response, null, 2));

            // Handle nested response structure: response.data.data
            const responseData = response.data?.data || response.data;
            const accessToken = responseData?.access_token;
            const refreshToken = responseData?.refresh_token;
            const userData = responseData?.user;

            console.log("Extracted tokens - access:", !!accessToken, "refresh:", !!refreshToken);


            if (accessToken && refreshToken) {
                console.log("Saving tokens after registration...");
                await saveTokens(accessToken, refreshToken);

                // Set in-memory token immediately
                setAuthToken(accessToken);

                console.log("Tokens saved successfully!");

                if (userData) {
                    console.log("Setting user:", userData);
                    setUser(userData);
                } else {
                    console.log("No user data, will fetch profile");
                }
            } else {
                console.error("ERROR: No tokens in registration response!");
            }

            setLoading(false);
            // Navigate directly to mainpage
            router.replace({
                pathname: "/(tabs)/mainpage",
                params: { showLoginSuccess: "true" }
            });

        } catch (error: any) {
            setLoading(false);
            console.error(error);
            const msg = error.response?.data?.message || "Registration failed";
            Alert.alert("Error", msg);
        }
    };

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
            <StatusBar barStyle={themeScheme === 'dark' ? 'light-content' : 'dark-content'} />
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <Pressable onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </Pressable>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Create Account</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.form}>
                    <Text style={[styles.sectionTitle, { color: colors.primary }]}>Personal Info</Text>

                    <View style={styles.row}>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>First Name</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                                placeholder="Name"
                                value={firstName}
                                onChangeText={setFirstName}
                                placeholderTextColor={colors.textTertiary}
                            />
                        </View>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Last Name</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                                placeholder="Surname"
                                value={lastName}
                                onChangeText={setLastName}
                                placeholderTextColor={colors.textTertiary}
                            />
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Birthday</Text>
                        <Pressable
                            style={[styles.pickerTrigger, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                            onPress={() => setShowDatePicker(true)}
                        >
                            <Text style={[styles.pickerText, { color: colors.text }]}>{formatDate(birthday)}</Text>
                            <Ionicons name="calendar-outline" size={20} color={colors.icon} />
                        </Pressable>

                        <CustomDatePicker
                            visible={showDatePicker}
                            onClose={() => setShowDatePicker(false)}
                            onSelect={onDateSelect}
                            initialDate={birthday}
                        />
                    </View>

                    <View style={[styles.divider, { backgroundColor: colors.border }]} />

                    <View style={[styles.switchRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                        <View>
                            <Text style={[styles.switchLabel, { color: colors.text }]}>Turkish Citizen</Text>
                            <Text style={[styles.switchSub, { color: colors.textSecondary }]}>I have a T.C. Identity Number</Text>
                        </View>
                        <Switch
                            trackColor={{ false: colors.border, true: colors.primary }}
                            thumbColor={"#fff"}
                            ios_backgroundColor={colors.border}
                            onValueChange={setIsTurkish}
                            value={isTurkish}
                        />
                    </View>

                    {isTurkish ? (
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>TCKN</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                                placeholder="TCKN (Identity Number)"
                                value={tckn}
                                onChangeText={setTckn}
                                keyboardType="numeric"
                                maxLength={11}
                                placeholderTextColor={colors.textTertiary}
                            />
                        </View>
                    ) : (
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Passport Number</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
                                placeholder="A12345678"
                                value={passportNumber}
                                onChangeText={setPassportNumber}
                                placeholderTextColor={colors.textTertiary}
                            />
                        </View>
                    )}

                    <Pressable
                        style={({ pressed }) => [
                            styles.submitBtn,
                            { backgroundColor: colors.primary, shadowColor: colors.primary },
                            pressed && styles.btnPressed
                        ]}
                        onPress={handleRegister}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color={colors.primaryText} />
                        ) : (
                            <Text style={[styles.submitBtnText, { color: colors.primaryText }]}>Complete Registration</Text>
                        )}
                    </Pressable>

                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#ffffff",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#f1f5f9",
    },
    backBtn: {
        padding: 8,
        marginLeft: -8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: navy,
        marginLeft: 8,
    },
    scrollContent: {
        padding: 24,
    },
    form: {
        gap: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: navy,
        marginBottom: 4,
    },
    row: {
        flexDirection: "row",
        gap: 16,
    },
    inputGroup: {
        gap: 8,
    },
    label: {
        fontSize: 14,
        fontWeight: "600",
        color: "#475569",
    },
    input: {
        height: 50,
        backgroundColor: field,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: border,
        paddingHorizontal: 16,
        fontSize: 16,
        color: navy,
        fontWeight: "500",
    },
    divider: {
        height: 1,
        backgroundColor: "#e2e8f0",
        marginVertical: 10,
    },
    switchRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#f8fafc",
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: border,
    },
    switchLabel: {
        fontSize: 16,
        fontWeight: "700",
        color: navy,
    },
    switchSub: {
        fontSize: 13,
        color: "#64748b",
    },
    submitBtn: {
        height: 56,
        backgroundColor: navy,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 12,
        shadowColor: navy,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 6,
    },
    btnPressed: {
        transform: [{ scale: 0.98 }],
        opacity: 0.9,
    },
    submitBtnText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "700",
    },
    pickerTrigger: {
        height: 50,
        backgroundColor: field,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: border,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    pickerText: {
        fontSize: 16,
        color: navy,
        fontWeight: "500",
    },
});


