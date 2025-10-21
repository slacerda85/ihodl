import { Picker, Host, PickerProps } from '@expo/ui/swift-ui'
import { useSettings } from '../../features/store'
import colors from '../colors'

export default function PickerIOS(props: PickerProps) {
  const { isDark } = useSettings()

  return (
    <Host matchContents style={{ flex: 1 }}>
      <Picker {...props} />
    </Host>
  )
}
