// import IconSymbol from '@/ui/components/IconSymbol'
import Ionicons from '@expo/vector-icons/Ionicons'

export default function CreateWalletIcon({
  size = 24,
  color,
  filled = false,
}: {
  size?: number
  color: string
  filled?: boolean
}) {
  return <Ionicons name={`add${!filled ? '-outline' : ''}`} size={size} color={color} />
}
