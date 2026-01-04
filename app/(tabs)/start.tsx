import React from "react";
import { View } from "react-native";

// Bu component asla render edilmeyecek çünkü _layout.tsx içinde
// tabPress listener ile engellenip direkt modal açılıyor.
// Ancak Tab Bar'da butonun görünmesi için bu dosyanın var olması gerekiyor.
export default function StartScreenPlaceholder() {
  return <View />;
}
