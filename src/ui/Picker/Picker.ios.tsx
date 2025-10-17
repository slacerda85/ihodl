import { Picker, Host, PickerProps } from '@expo/ui/swift-ui'

export default function PickerIOS(props: PickerProps) {
  return (
    <Host matchContents style={{ flex: 1 }}>
      <Picker {...props} />
    </Host>
  )
}
