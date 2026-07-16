import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '@/src/theme/theme';

type TagProps = {
  value: string | number;
  size?: 'default' | 'big';
};

// The app's signature element, redesigned as an engraved brass belt-buckle
// medallion (.tag / .tag.big) - a metallic gold-to-brass gradient with a
// beveled inner ring and the number set in bold serif, replacing the old
// flat espresso circle with a dashed border. React Native has no true inset
// box-shadow, so the CSS's `inset 0 2px 5px rgba(0,0,0,.4)` bevel is
// approximated with a second gradient layer that darkens toward the lower
// edge, plus a thin translucent ring standing in for the CSS ::before.
// The shadow lives on a separate outer wrapper because overflow:hidden
// (needed to clip the gradients to the circle) would otherwise clip the
// drop shadow too on iOS.
export function Tag({ value, size = 'default' }: TagProps) {
  const big = size === 'big';
  return (
    <View style={[styles.shadowWrap, big && styles.shadowWrapBig]}>
      <View style={[styles.tag, big && styles.tagBig]}>
        <LinearGradient
          colors={[colors.brassLight, colors.brass, '#6E5119']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)']}
          start={{ x: 0.5, y: 0.3 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.innerRing, big && styles.innerRingBig]} />
        <Text style={[styles.text, big && styles.textBig]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  shadowWrapBig: { width: 96, height: 96, borderRadius: 48 },
  tag: {
    flex: 1,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#4A3813',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tagBig: { borderRadius: 48 },
  innerRing: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  innerRingBig: { top: 8, left: 8, right: 8, bottom: 8, borderRadius: 42 },
  text: {
    fontFamily: fonts.display,
    color: '#2A2005',
    fontSize: 15,
    textShadowColor: 'rgba(255,255,255,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  textBig: { fontSize: 26 },
});
