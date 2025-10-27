import { View } from 'react-native'

type DimensionValue = number | `${number}%`

interface DividerProps {
  orientation?: 'horizontal' | 'vertical'
  color?: string
  width?: DimensionValue
  height?: DimensionValue
}

export default function Divider({
  orientation = 'horizontal',
  color = '#cccccc',
  width,
  height,
}: DividerProps) {
  return (
    <View
      style={{
        backgroundColor: color,
        width: orientation === 'horizontal' ? width || '100%' : 1,
        height: orientation === 'horizontal' ? 1 : height || '100%',
      }}
    />
  )
}
