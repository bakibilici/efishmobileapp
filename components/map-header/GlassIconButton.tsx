import React from "react";
import {
  Pressable,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { GlassSurface, hasLiquidGlass } from "../ui/glass";
import { IconSymbol, type IconSymbolName } from "../ui/icon-symbol";
import { usePagePalette } from "../ui/pagePalette";

/**
 * A round Liquid Glass button with one SF Symbol (48 pt unless `size` says
 * otherwise), for the map's floating controls. With `tintColor` the glass is
 * tinted and the glyph white. Icon only, so it always needs
 * `accessibilityLabel`. Changing only the symbol keeps the glass view.
 */
export function GlassIconButton({
  symbol,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  onPress,
  size = 48,
  tintColor,
  glyphColor,
  glyphSize = 20,
  style,
}: {
  symbol: IconSymbolName;
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  onPress: () => void;
  size?: number;
  /** Tinted glass; the glyph is then white unless `glyphColor` says otherwise. */
  tintColor?: string;
  /** The glyph's colour: the label colour by default. */
  glyphColor?: string;
  glyphSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePagePalette();
  const color = glyphColor ?? (tintColor ? "#FFFFFF" : palette.label);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      style={({ pressed }) => [
        { width: size, height: size },
        // Liquid Glass answers a touch by itself; the fallback dims.
        !hasLiquidGlass && pressed && { opacity: 0.6 },
        style,
      ]}
    >
      <GlassSurface
        radius={size / 2}
        interactive
        tintColor={tintColor}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <IconSymbol name={symbol} size={glyphSize} weight="semibold" color={color} />
      </GlassSurface>
    </Pressable>
  );
}
