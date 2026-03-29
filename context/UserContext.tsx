import {
  DemoUserProfile,
  LocalUserStorage,
} from "@/services/localUserStorage";
import { clearTokens } from "@/services/tokenStorage";
import * as Sentry from "@sentry/react-native";
import { useRouter } from "expo-router";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type UserContextType = {
  user: DemoUserProfile | null;
  isLoading: boolean;
  setUser: (user: DemoUserProfile | null) => void;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUserState] = useState<DemoUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasInitialized = useRef(false);
  const router = useRouter();

  // Wrapper for setUser that also marks as initialized
  const setUser = (newUser: DemoUserProfile | null) => {
    console.log("setUser called with:", newUser?.id);
    setUserState(newUser);
    if (newUser) {
      Sentry.setUser({
        id: String(newUser.id),
        username: newUser.username,
      });
      void LocalUserStorage.setCurrentUserId(newUser.id);
    } else {
      Sentry.setUser(null);
    }
    hasInitialized.current = true;
  };

  const fetchProfile = async () => {
    try {
      const profileData = await LocalUserStorage.getCurrentUser();
      console.log("fetchProfile - local profile exists:", !!profileData);

      if (profileData) {
        setUserState(profileData);

        Sentry.setUser({
          id: String(profileData.id),
          username: profileData.username,
        });

        hasInitialized.current = true;
      } else {
        console.log("fetchProfile - no local user, setting user to null");
        setUserState(null);
        Sentry.setUser(null);
      }
    } catch (error: any) {
      console.log("Failed to fetch profile", error);
      setUserState(null);
      Sentry.setUser(null);
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
    await LocalUserStorage.clearCurrentUserId();
    await clearTokens();
    setUser(null);
    Sentry.setUser(null);
    if (router.canDismiss()) {
      router.dismissAll();
    }
    router.replace("/");
  };

  return (
    <UserContext.Provider
      value={{ user, isLoading, setUser, refreshProfile, logout }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
