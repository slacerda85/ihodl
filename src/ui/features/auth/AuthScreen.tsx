import { useAuth } from '@/ui/features/auth/AuthProvider'
import { Modal } from 'react-native'
import { useState, useMemo } from 'react'
import { Text, View, StyleSheet, Pressable, Animated } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import colors from '@/ui/colors'
import { useIsDark } from '@/ui/features/settings'
import IHodlLogoBorderLess from '@/ui/assets/ihodl-logo-borderless'

export default function AuthScreen() {
  const { auth, authenticated } = useAuth()
  const isDark = useIsDark()
  const [isUnlocked, setIsUnlocked] = useState(false)
  const rotateAnim = useMemo(() => new Animated.Value(0), [])

  const handleAuth = () => {
    setIsUnlocked(true)
    Animated.timing(rotateAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start(async () => {
      const success = await auth()
      if (!success) {
        setIsUnlocked(false)
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start()
      }
    })
  }

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-15deg'],
  })

  return (
    <Modal visible={!authenticated} animationType="fade" transparent={true}>
      <View style={[styles.container, isDark && styles.containerDark]}>
        <View
          style={{
            // backgroundColor: 'red',
            flexDirection: 'row',
            padding: 8,
            // alignItems: 'center',
          }}
        >
          <Text style={[styles.title, isDark && styles.titleDark]}>i</Text>
          <IHodlLogoBorderLess width={64} height={64} />
          <Text style={[styles.title, isDark && styles.titleDark]}>odl</Text>
        </View>
        <Pressable onPress={handleAuth} style={styles.buttonContainer}>
          <Animated.View style={{ transform: [{ rotate: rotation }] }}>
            <View style={styles.iconButton}>
              <Ionicons
                name={isUnlocked ? 'lock-open-outline' : 'lock-closed-outline'}
                size={32}
                color={colors.primary}
              />
            </View>
          </Animated.View>
          <Text style={styles.buttonText}>Unlock</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    backgroundColor: colors.background.light,
    justifyContent: 'center',
    alignItems: 'center',
  },
  containerDark: {
    backgroundColor: colors.background.dark,
  },
  title: {
    fontWeight: 'bold',
    fontSize: 64,
    color: colors.textSecondary.light,
  },
  titleDark: {
    color: colors.textSecondary.dark,
  },
  loader: {
    marginTop: 16,
  },
  buttonContainer: {
    // borderWidth: 2,
    // borderColor: colors.primary,
    // borderRadius: '50%',
    alignItems: 'center',
    padding: 16,
  },
  iconButton: {
    // backgroundColor: colors.primary,
    // width: 72,
    // height: 72,
    justifyContent: 'center',
    alignItems: 'center',
    color: colors.primary,
    paddingBottom: 4,
    /* elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2, */
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
})
