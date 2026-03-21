import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TextStyle } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  withSpring, 
  useSharedValue,
} from 'react-native-reanimated';

interface RollingNumberProps {
  value: number;
  style?: TextStyle;
  duration?: number;
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export const RollingNumber: React.FC<RollingNumberProps> = ({ value, style }) => {
  const valueString = value.toLocaleString();
  const digits = valueString.split('');

  return (
    <View style={styles.container}>
      {digits.map((digit, index) => {
        if (isNaN(parseInt(digit, 10))) {
          return <Text key={`char-${index}`} style={[styles.text, style]}>{digit}</Text>;
        }
        return (
          <Digit 
            key={`digit-${index}`} 
            digit={parseInt(digit, 10)} 
            style={style} 
          />
        );
      })}
    </View>
  );
};

interface DigitProps {
  digit: number;
  style?: TextStyle;
}

const Digit: React.FC<DigitProps> = ({ digit, style }) => {
  const animatedValue = useSharedValue(digit);
  
  useEffect(() => {
    animatedValue.value = withSpring(digit, {
      damping: 20,
      stiffness: 90,
      mass: 0.5,
    });
  }, [digit, animatedValue]);

  const animatedStyle = useAnimatedStyle(() => {
    // We multiply by a guestimated line height since we don't know the exact one yet
    // But we'll use a fixed height container to ensure consistency
    return {
      transform: [
        {
          translateY: -animatedValue.value * 20, // 20 is the height of a single digit container
        },
      ],
    };
  });

  return (
    <View style={styles.digitContainer}>
      <Animated.View style={animatedStyle}>
        {DIGITS.map((num) => (
          <View key={num} style={styles.digitWrapper}>
            <Text style={[styles.text, style]}>{num}</Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  digitContainer: {
    height: 20,
    overflow: 'hidden',
  },
  digitWrapper: {
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});
