import { Host, Switch, SwitchProps } from '@expo/ui/swift-ui'

export default function SwitchIOS(props: SwitchProps) {
  return (
    <Host matchContents>
      <Switch {...props} />
    </Host>
  )
}
