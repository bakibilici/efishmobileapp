import { useTheme } from "@/context/ThemeContext";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    Dimensions,
    FlatList,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

type CustomDatePickerProps = {
    visible: boolean;
    onClose: () => void;
    onSelect: (date: Date) => void;
    initialDate?: Date;
};

const ITEM_HEIGHT = 50;
const VISIBLE_ITEMS = 5;
const SCREEN_HEIGHT = Dimensions.get('window').height;

const navy = "#0f2f4f";
const primary = "#2CDD9D";

const WheelPicker = ({
    data,
    selectedItem,
    onItemSelected,
    label,
    colors
}: {
    data: any[];
    selectedItem: any;
    onItemSelected: (item: any) => void;
    label: string,
    colors: any
}) => {
    // Add empty items for padding
    const paddedData = useMemo(() => ["", "", ...data, "", ""], [data]);
    const flatListRef = useRef<FlatList>(null);

    // Initial Scroll
    useEffect(() => {
        if (flatListRef.current) {
            const index = data.indexOf(selectedItem);
            if (index > -1) {
                // Wait for layout
                setTimeout(() => {
                    flatListRef.current?.scrollToIndex({
                        index: index,
                        animated: false,
                        viewPosition: 0
                    });
                }, 50);
            }
        }
    }, []);

    const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = event.nativeEvent.contentOffset.y;
        const index = Math.round(y / ITEM_HEIGHT);
        // The index in 'data' corresponds to index in paddedData minus padding (2)
        // But since we scroll to index representing the item at the TOP of the viewable area...
        // Wait, normally we want the item in the CENTER. 
        // With 5 items visible, the center item is index 2 (0,1,2,3,4).
        // If we add 2 padding items at top, index 0 in data is at paddedData[2].
        // If scrollY is 0, paddedData[0] is at top, paddedData[2] is at center.
        // So scrollY=0 selects data[0].

        const clampedIndex = Math.max(0, Math.min(index, data.length - 1));
        const item = data[clampedIndex];

        if (item !== selectedItem) {
            onItemSelected(item);
        }
    };

    return (
        <View style={styles.column}>
            <Text style={styles.colLabel}>{label}</Text>
            <View style={styles.listContainer}>
                <FlatList
                    ref={flatListRef}
                    data={paddedData}
                    keyExtractor={(item, index) => `${label}-${index}`}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    renderItem={({ item, index }) => {
                        // The item is "selected" if it's the one currently in the middle
                        // We calculate selection based on state passed down, not index here for render
                        const isSelected = item === selectedItem;
                        return (
                            <View style={styles.item}>
                                {item !== "" && (
                                    <Text style={[styles.itemText, { color: colors.textTertiary }, isSelected && { color: colors.text, fontWeight: '700', fontSize: 19 }]}>
                                        {item}
                                    </Text>
                                )}
                            </View>
                        );
                    }}
                    getItemLayout={(data, index) => ({
                        length: ITEM_HEIGHT,
                        offset: ITEM_HEIGHT * index,
                        index,
                    })}
                    onMomentumScrollEnd={onMomentumScrollEnd}
                    initialNumToRender={15}
                    maxToRenderPerBatch={15}
                    windowSize={5}
                />
            </View>
        </View>
    );
};


export default function CustomDatePicker({
    visible,
    onClose,
    onSelect,
    initialDate = new Date(),
}: CustomDatePickerProps) {
    const { colors, themeScheme } = useTheme();
    const [selectedYear, setSelectedYear] = useState(initialDate.getFullYear());
    const [selectedMonthIndex, setSelectedMonthIndex] = useState(initialDate.getMonth());
    const [selectedDay, setSelectedDay] = useState(initialDate.getDate());

    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                })
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: SCREEN_HEIGHT,
                    duration: 250,
                    useNativeDriver: true,
                })
            ]).start();
        }
    }, [visible]);

    const currentYear = new Date().getFullYear();
    const years = useMemo(() => Array.from({ length: 120 }, (_, i) => currentYear - i), [currentYear]);
    const months = useMemo(() => [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ], []);

    const getDaysInMonth = (monthIndex: number, year: number) => {
        return new Date(year, monthIndex + 1, 0).getDate();
    };

    const daysInMonth = useMemo(() => getDaysInMonth(selectedMonthIndex, selectedYear), [selectedMonthIndex, selectedYear]);
    const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

    // Auto-correct day selection
    useEffect(() => {
        if (selectedDay > daysInMonth) {
            setSelectedDay(daysInMonth);
        }
    }, [selectedMonthIndex, selectedYear, daysInMonth]);

    const handleConfirm = () => {
        const date = new Date(selectedYear, selectedMonthIndex, selectedDay);
        onSelect(date);
        onClose();
    };

    if (!visible) return null;

    return (
        <Modal transparent visible={visible} animationType="none">
            <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
                <Pressable style={styles.overlayPress} onPress={onClose} />
            </Animated.View>

            <Animated.View
                style={[
                    styles.container,
                    { backgroundColor: colors.card },
                    { transform: [{ translateY: slideAnim }] },
                ]}
            >
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                    <Pressable onPress={onClose} style={styles.headerBtn} hitSlop={15}>
                        <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
                    </Pressable>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Select Birthday</Text>
                    <Pressable onPress={handleConfirm} style={styles.headerBtn} hitSlop={15}>
                        <Text style={[styles.confirmText, { color: colors.primary }]}>Confirm</Text>
                    </Pressable>
                </View>

                <View style={styles.pickerBody}>
                    <View style={[styles.selectionOverlay, { backgroundColor: themeScheme === 'dark' ? colors.border : colors.backgroundSecondary }]} pointerEvents="none">
                        <View style={styles.selectionLine} />
                    </View>

                    <WheelPicker
                        label="Day"
                        data={days}
                        selectedItem={selectedDay}
                        onItemSelected={setSelectedDay}
                        colors={colors}
                    />
                    <WheelPicker
                        label="Month"
                        data={months}
                        selectedItem={months[selectedMonthIndex]}
                        onItemSelected={(item) => setSelectedMonthIndex(months.indexOf(item))}
                        colors={colors}
                    />
                    <WheelPicker
                        label="Year"
                        data={years}
                        selectedItem={selectedYear}
                        onItemSelected={setSelectedYear}
                        colors={colors}
                    />
                </View>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.4)",
        zIndex: 1,
    },
    overlayPress: {
        flex: 1,
    },
    container: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "#ffffff",
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -5 },
        shadowOpacity: 0.1,
        shadowRadius: 15,
        elevation: 20,
        zIndex: 2,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#f1f5f9",
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: "700",
        color: navy,
    },
    headerBtn: {
        padding: 4,
    },
    cancelText: {
        fontSize: 16,
        color: "#64748b",
        fontWeight: "500",
    },
    confirmText: {
        fontSize: 16,
        color: primary,
        fontWeight: "700",
    },
    pickerBody: {
        flexDirection: "row",
        height: ITEM_HEIGHT * VISIBLE_ITEMS,
        marginTop: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    column: {
        flex: 1,
        alignItems: "center",
        height: "100%",
    },
    listContainer: {
        height: ITEM_HEIGHT * VISIBLE_ITEMS,
        width: '100%',
    },
    colLabel: {
        fontSize: 11,
        fontWeight: "700",
        color: "#94a3b8",
        textTransform: "uppercase",
        marginBottom: 8,
        textAlign: 'center',
        position: 'absolute',
        top: -24,
        width: '100%',
    },
    item: {
        height: ITEM_HEIGHT,
        justifyContent: "center",
        alignItems: "center",
    },
    itemText: {
        fontSize: 17,
        color: "#cbd5e1",
        fontWeight: "500",
    },
    selectedItemText: {
        color: navy,
        fontWeight: "700",
        fontSize: 19,
    },
    selectionOverlay: {
        position: 'absolute',
        top: (ITEM_HEIGHT * VISIBLE_ITEMS - ITEM_HEIGHT) / 2,
        left: 16,
        right: 16,
        height: ITEM_HEIGHT,
        backgroundColor: '#f1f5f9',
        borderRadius: 12,
        zIndex: -1,
    },
    selectionLine: {
        display: 'none',  // Using background color instead of lines for cleaner look
    }
});
