import { StyleSheet, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { useAuth } from './AuthProvider'

export default function InactivityOverlay() {
  const { inactive } = useAuth()

  return inactive ? (
    <View style={styles.container}>
      <BlurView intensity={100} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.7)' }]} />
    </View>
  ) : null
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
})
