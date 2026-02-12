import { getProfile, logout as logoutApi, setAuthToken, UserProfile } from '@/services/api';
import { clearTokens, getAccessToken } from '@/services/tokenStorage';
import { useRouter } from 'expo-router';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

type UserContextType = {
    user: UserProfile | null;
    isLoading: boolean;
    setUser: (user: UserProfile | null) => void;
    refreshProfile: () => Promise<void>;
    logout: () => Promise<void>;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUserState] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const hasInitialized = useRef(false);
    const router = useRouter();

    // Wrapper for setUser that also marks as initialized
    const setUser = (newUser: UserProfile | null) => {
        console.log("setUser called with:", newUser?.id);
        setUserState(newUser);
        hasInitialized.current = true;
    };

    const fetchProfile = async () => {
        try {
            const token = await getAccessToken();
            console.log("fetchProfile - token exists:", !!token);

            // Set token in API memory immediately
            setAuthToken(token);

            if (token) {
                const profileData = await getProfile();
                console.log("fetchProfile - profileData:", profileData);
                setUserState(profileData);
                hasInitialized.current = true;
            } else {
                console.log("fetchProfile - no token, setting user to null");
                setUserState(null);
            }
        } catch (error: any) {
            console.log('Failed to fetch profile', error);
            // Only clear user on 401 (unauthorized), not on 404 or other errors
            if (error.response?.status === 401) {
                setUserState(null);
            }
            // For 404 and other errors, DON'T touch user state if already set from login/register
        } finally {
            setIsLoading(false);
            hasInitialized.current = true;
        }
    };

    useEffect(() => {
        // Only run initial fetch once and only if not already initialized (e.g., from login)
        if (!hasInitialized.current) {
            fetchProfile();
        }
    }, []);

    const refreshProfile = async () => {
        setIsLoading(true);
        await fetchProfile();
    };

    const logout = async () => {
        try {
            await logoutApi();
        } catch (error) {
            console.log("Logout API call failed", error);
        }
        await clearTokens();
        setUser(null);
        if (router.canDismiss()) {
            router.dismissAll();
        }
        router.replace("/");
    };

    return (
        <UserContext.Provider value={{ user, isLoading, setUser, refreshProfile, logout }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
};
