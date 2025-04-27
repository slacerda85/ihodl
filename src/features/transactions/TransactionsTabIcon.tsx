// import { IconSymbol } from '@/shared/ui/icon-symbol'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'

export default function TransactionsTabIcon({
  color,
  filled = false,
}: {
  color: string
  filled?: boolean
}) {
  return (
    <MaterialCommunityIcons
      name={`swap-horizontal${filled ? '-bold' : ''}`}
      size={24}
      color={color}
    />
  )
}
