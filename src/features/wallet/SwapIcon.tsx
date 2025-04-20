import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import colors from '@/shared/theme/colors'

export default function SwapIcon({
  color = colors.primary,
  size = 24,
}: {
  color: string
  size: number
}) {
  return <MaterialCommunityIcons name="menu-swap" size={size} color={color} />
}
