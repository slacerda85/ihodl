// import IconSymbol from '@/ui/components/IconSymbol'
import Ionicons from '@expo/vector-icons/Ionicons'

export default function BlockchainTabIcon({
  color,
  filled = false,
}: {
  color: string
  filled?: boolean
}) {
  return <Ionicons name={`cube${!filled ? '-outline' : ''}`} size={24} color={color} />
}
