import { Colors } from '@/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as _useColorScheme } from 'react-native';

type ThemePreference = 'system' | 'light' | 'dark';
type ThemeScheme = 'light' | 'dark';

type ThemeContextType = {
    themePreference: ThemePreference;
    themeScheme: ThemeScheme;
    setThemePreference: (pref: ThemePreference) => void;
    colors: typeof Colors.light;
};

const THEME_PREF_KEY = 'user_theme_preference';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const systemScheme = _useColorScheme() as ThemeScheme || 'light';
    const [themePreference, setThemePreference] = useState<ThemePreference>('system');
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        // Load persisted preference
        const loadPref = async () => {
            try {
                const saved = await AsyncStorage.getItem(THEME_PREF_KEY);
                if (saved && (saved === 'system' || saved === 'light' || saved === 'dark')) {
                    setThemePreference(saved as ThemePreference);
                }
            } catch (e) {
                console.warn('Failed to load theme preference', e);
            } finally {
                setLoaded(true);
            }
        };
        loadPref();
    }, []);

    const setTheme = async (pref: ThemePreference) => {
        setThemePreference(pref);
        try {
            await AsyncStorage.setItem(THEME_PREF_KEY, pref);
        } catch (e) {
            console.warn('Failed to save theme preference', e);
        }
    };

    // Derived actual scheme
    const effectiveScheme: ThemeScheme =
        themePreference === 'system' ? systemScheme : themePreference;

    const colors = Colors[effectiveScheme];

    if (!loaded) {
        return null; // Or a splash screen placeholder
    }

    return (
        <ThemeContext.Provider value={{
            themePreference,
            themeScheme: effectiveScheme,
            setThemePreference: setTheme,
            colors
        }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
