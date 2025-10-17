import { View } from 'react-native'

interface DividerProps {
  orientation?: 'horizontal' | 'vertical'
  color?: string
}

export default function Divider({ orientation = 'horizontal', color = '#cccccc' }: DividerProps) {
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
