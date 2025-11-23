import AntDesign from '@expo/vector-icons/AntDesign'
import colors from '@/ui/colors'

export default function SwapIcon({
  color = colors.primary,
  size = 24,
}: {
  color: string
  size: number
}) {
  return <AntDesign name="swap" size={size} color={color} />
}
