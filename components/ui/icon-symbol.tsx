// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;

/**
 * SF Symbols to Material Icons. Only a name listed here type-checks as an
 * `IconSymbolName`, so a symbol can never render as nothing on Android.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'bolt.car.fill': 'electric-car',

  // Tab bar and navigation
  'clock.arrow.circlepath': 'history',
  'person.crop.circle.fill': 'account-circle',
  'qrcode.viewfinder': 'qr-code-scanner',
  xmark: 'close',
  checkmark: 'check',

  // Hesabım
  'heart.fill': 'favorite',
  'sun.max.fill': 'wb-sunny',
  waveform: 'graphic-eq',
  'location.fill': 'near-me',
  'doc.text.fill': 'description',
  'doc.plaintext.fill': 'article',
  'square.and.arrow.up.fill': 'ios-share',
  'trash.fill': 'delete',
  'exclamationmark.bubble.fill': 'feedback',

  // Export and delete pages
  'person.fill': 'person',
  'checkmark.seal.fill': 'verified',
  'map.fill': 'map',
  nosign: 'block',
  'key.fill': 'vpn-key',
  'server.rack': 'dns',

  // Oturumlar
  'arrow.triangle.turn.up.right.diamond.fill': 'directions',
  'bolt.fill': 'bolt',
  magnifyingglass: 'search',

  // Map header
  'line.3.horizontal.decrease': 'filter-list',
  'mic.fill': 'mic',
  'xmark.circle.fill': 'cancel',
  'car.fill': 'directions-car',
  'mappin.circle.fill': 'place',
} as const satisfies Partial<IconMapping>;

export type IconSymbolName = keyof typeof MAPPING;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
