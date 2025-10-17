// import IconSymbol from '@/ui/IconSymbol'
import Ionicons from '@expo/vector-icons/Ionicons'

export default function SettingsTabIcon({
  color,
  filled = false,
}: {
  color: string
  filled?: boolean
}) {
  return <Ionicons name={`settings${!filled ? '-outline' : ''}`} size={24} color={color} />
}
