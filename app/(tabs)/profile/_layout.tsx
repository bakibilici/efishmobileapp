import { Stack } from "expo-router";
import React from "react";

import { useTabRootStackOptions } from "@/components/navigation/stackOptions";

/**
 * Hesabım's own stack, so its first page gets a native large title that
 * collapses as the list scrolls. Its subpages (Kişisel bilgiler, Görünüm…)
 * live in the root stack under /account and cover the tab bar.
 */
export default function ProfileLayout() {
  const options = useTabRootStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: "Hesabım" }} />
    </Stack>
  );
}
