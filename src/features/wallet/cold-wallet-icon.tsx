// import { IconSymbol } from '@/shared/ui/icon-symbol'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'

export default function ImportWalletIcon({
  size = 24,
  color,
  filled = false,
}: {
  size?: number
  color: string
  filled?: boolean
}) {
  return (
    <MaterialCommunityIcons
      name={`shield-lock${!filled ? '-outline' : ''}`}
      size={size}
      color={color}
    />
  )
}
