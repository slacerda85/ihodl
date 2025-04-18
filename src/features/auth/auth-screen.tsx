import { useAuth } from '@/features/auth/auth-provider'
import React, { useState, useRef } from 'react'
import { Text, View, StyleSheet, useColorScheme, TouchableOpacity, Animated } from 'react-native'
import { Ionicons } from '@expo/vector-icons' // Assuming you have react-native-vector-icons installed
import BitcoinLogo from '@/shared/assets/bitcoin-logo'
import colors from '@/shared/theme/colors'

export default function AuthScreen() {
  const { auth } = useAuth()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const [isUnlocked, setIsUnlocked] = useState(false)
  const rotateAnim = useRef(new Animated.Value(0)).current

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
    <View style={[styles.container, isDark && styles.containerDark]}>
      <BitcoinLogo width={128} height={128} />
      <Text style={[styles.title, isDark && styles.titleDark]}>ihodl</Text>
      <TouchableOpacity onPress={handleAuth} style={styles.buttonContainer}>
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
      </TouchableOpacity>
    </View>
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
    fontSize: 48,
    color: colors.textSecondary.light,
    marginTop: 16,
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
    padding: 24,
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
