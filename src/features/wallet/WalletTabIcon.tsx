// import { IconSymbol } from '@/ui/icon-symbol'
import Ionicons from '@expo/vector-icons/Ionicons'

export default function WalletTabIcon({
  color,
  filled = false,
}: {
  color: string
  filled?: boolean
}) {
  return <Ionicons name={`wallet${!filled ? '-outline' : ''}`} size={24} color={color} />
}
