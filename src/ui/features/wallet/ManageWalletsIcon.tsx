// import IconSymbol from '@/ui/components/IconSymbol'
import Ionicons from '@expo/vector-icons/Ionicons'
import Entypo from '@expo/vector-icons/Entypo'
import { View } from 'react-native'
import colors from '@/ui/colors'
import { useIsDark } from '@/ui/features/app-provider'

export default function ManageWalletsIcon({
  size = 24,
  color,
  filled = false,
}: {
  size?: number
  color: string
  filled?: boolean
}) {
  const isDark = useIsDark()
  const iconBgColor = isDark ? colors.background.dark : colors.background.light

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <Ionicons
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          zIndex: 1,
        }}
        name={`wallet${!filled ? '-outline' : ''}`}
        size={size}
        color={color}
      />
      {/* a white circular view to render on top of first icon, aligned at bottom left */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          zIndex: 2,
          width: size * 0.6,
          height: size * 0.6,
          borderRadius: size * 0.25,
          backgroundColor: iconBgColor,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Entypo
          name="cycle"
          size={size * 0.5} // half the size of the outer icon
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            zIndex: 2,
          }}
          color={color}
        />
      </View>
    </View>
  )
}
