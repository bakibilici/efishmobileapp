import { CreditCard } from "@/components/payment/CreditCard";
import { useTheme } from "@/context/ThemeContext";
import { CardType, usePayment } from "@/context/payment/PaymentContext";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

export default function AddCardScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const { addCard } = usePayment();

    const [number, setNumber] = useState("");
    const [holderName, setHolderName] = useState("");
    const [expiry, setExpiry] = useState("");
    const [cvc, setCvc] = useState("");
    const [isFlipped, setIsFlipped] = useState(false);
    const [cardType, setCardType] = useState<CardType>("unknown");

    useEffect(() => {
        // Detect card type
        const num = number.replace(/\s/g, "");
        if (num.startsWith("4")) setCardType("visa");
        else if (num.startsWith("5")) setCardType("mastercard");
        else if (num.startsWith("34") || num.startsWith("37")) setCardType("amex");
        else if (num.startsWith("6")) setCardType("discover");
        else setCardType("unknown");
    }, [number]);

    const handleNumberChange = (text: string) => {
        // Digits only
        const clean = text.replace(/[^0-9]/g, "");
        setNumber(clean);
    };

    const handleExpiryChange = (text: string) => {
        // Format MM/YY
        const clean = text.replace(/[^0-9]/g, "");
        if (clean.length >= 2) {
            setExpiry(clean.substring(0, 2) + "/" + clean.substring(2, 4));
        } else {
            setExpiry(clean);
        }
    };

    const handeSave = async () => {
        if (number.length < 15 || !holderName || expiry.length < 5 || cvc.length < 3) {
            // Basic validation
            return;
        }

        await addCard({
            holderName,
            number,
            expiry,
            cvc,
            type: cardType,
        });
        router.back();
    };

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
            <Stack.Screen
                options={{
                    headerTitle: "Add New Card",
                    headerStyle: { backgroundColor: colors.background },
                    headerTintColor: colors.text,
                    headerShadowVisible: false,
                    headerBackTitle: "",
                }}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={{ flex: 1 }}
                keyboardVerticalOffset={100}
            >
                <ScrollView contentContainerStyle={styles.content}>
                    <View style={styles.cardPreview}>
                        <CreditCard
                            holderName={holderName}
                            number={number}
                            expiry={expiry}
                            cvc={cvc}
                            type={cardType}
                            flipped={isFlipped}
                        />
                    </View>

                    <View style={styles.form}>
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Card Number</Text>
                            <TextInput
                                style={[styles.input, {
                                    backgroundColor: colors.inputBackground,
                                    borderColor: colors.inputBorder,
                                    color: colors.text
                                }]}
                                placeholder="0000 0000 0000 0000"
                                placeholderTextColor={colors.textTertiary}
                                keyboardType="number-pad"
                                maxLength={19}
                                value={number}
                                onChangeText={handleNumberChange}
                                onFocus={() => setIsFlipped(false)}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Card Holder Name</Text>
                            <TextInput
                                style={[styles.input, {
                                    backgroundColor: colors.inputBackground,
                                    borderColor: colors.inputBorder,
                                    color: colors.text
                                }]}
                                placeholder="JOHN DOE"
                                placeholderTextColor={colors.textTertiary}
                                autoCapitalize="characters"
                                value={holderName}
                                onChangeText={setHolderName}
                                onFocus={() => setIsFlipped(false)}
                            />
                        </View>

                        <View style={styles.row}>
                            <View style={[styles.inputGroup, { flex: 1, marginRight: 16 }]}>
                                <Text style={[styles.label, { color: colors.textSecondary }]}>Expiry Date</Text>
                                <TextInput
                                    style={[styles.input, {
                                        backgroundColor: colors.inputBackground,
                                        borderColor: colors.inputBorder,
                                        color: colors.text
                                    }]}
                                    placeholder="MM/YY"
                                    placeholderTextColor={colors.textTertiary}
                                    keyboardType="number-pad"
                                    maxLength={5}
                                    value={expiry}
                                    onChangeText={handleExpiryChange}
                                    onFocus={() => setIsFlipped(false)}
                                />
                            </View>

                            <View style={[styles.inputGroup, { flex: 1 }]}>
                                <Text style={[styles.label, { color: colors.textSecondary }]}>CVC</Text>
                                <TextInput
                                    style={[styles.input, {
                                        backgroundColor: colors.inputBackground,
                                        borderColor: colors.inputBorder,
                                        color: colors.text
                                    }]}
                                    placeholder="123"
                                    placeholderTextColor={colors.textTertiary}
                                    keyboardType="number-pad"
                                    maxLength={4}
                                    value={cvc}
                                    onChangeText={setCvc}
                                    onFocus={() => setIsFlipped(true)}
                                    onBlur={() => setIsFlipped(false)}
                                />
                            </View>
                        </View>
                    </View>

                    <View style={styles.spacer} />

                    <Pressable
                        style={[styles.saveButton, { shadowColor: colors.primary }]}
                        onPress={handeSave}
                    >
                        <LinearGradient
                            colors={[colors.primary, '#1a9f70']}
                            style={styles.gradientButton}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            <Text style={styles.saveButtonText}>Save Card</Text>
                        </LinearGradient>
                    </Pressable>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1 },
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    cardPreview: {
        alignItems: 'center',
        marginVertical: 20,
    },
    form: {
        marginTop: 20,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 8,
        marginLeft: 4,
    },
    input: {
        height: 50,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 16,
        fontSize: 16,
    },
    row: {
        flexDirection: 'row',
    },
    spacer: {
        height: 40
    },
    saveButton: {
        borderRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    gradientButton: {
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
});
