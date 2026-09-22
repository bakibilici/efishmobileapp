import { Stack } from "expo-router";
import React from "react";

import { useTabRootStackOptions } from "@/components/navigation/stackOptions";

const INDEX_OPTIONS = { title: "Oturumlar" };

/**
 * Oturumlar is a stack of its own inside the tab, so its page gets the
 * native large title and the search field under it.
 */
export default function SessionsLayout() {
  const screenOptions = useTabRootStackOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={INDEX_OPTIONS} />
    </Stack>
  );
}
