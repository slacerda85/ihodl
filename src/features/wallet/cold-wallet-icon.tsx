import Ionicons from '@expo/vector-icons/Ionicons'
import colors from '@/shared/theme/colors'
import { useColorScheme } from 'react-native'

export default function ColdWalletIcon() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <Ionicons
      name="lock-closed-outline"
      size={24}
      color={isDark ? colors.background.light : colors.background.dark}
    />
  )
}
