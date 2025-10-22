import { StyleSheet, View, ViewProps } from 'react-native'
import { BlurView } from 'expo-blur'

export default function LiquidGlassView({
  children,
  ...props
}: { children: React.ReactNode } & ViewProps) {
  return (
    <View style={[styles.wrapper, props.style]} {...props}>
      <BlurView style={styles.effect} intensity={20} tint="light">
        <View style={styles.tint} />
        <View style={styles.shine} />
        {children}
      </BlurView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 10,
  },
  effect: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  tint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  shine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#fff',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 1,
    elevation: 1,
  },
})
