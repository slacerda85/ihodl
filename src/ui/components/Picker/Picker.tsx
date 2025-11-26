import { Text, View } from 'react-native'

interface PickerProps {
  selectedValue?: string
  onValueChange?: (value: string) => void
  // Add other props as needed based on usage
}

export default function PickerComponent(props: PickerProps) {
  // Web-compatible implementation
  return (
    <View>
      <Text>Picker not available on web. Value: {props.selectedValue}</Text>
    </View>
  )
}
