// react native divider component
import { View } from 'react-native'
import colors from '@/ui/colors'

interface DividerProps {
  orientation?: 'horizontal' | 'vertical'
  color?: string
}

export default function Divider({
  orientation = 'horizontal',
  color = colors.border.light,
}: DividerProps) {
  return (
    <View
      style={{
        backgroundColor: color,
        width: orientation === 'horizontal' ? '100%' : 1,
        height: orientation === 'horizontal' ? 1 : '100%',
      }}
    />
  )
}
