import { Button, Host, ButtonProps } from '@expo/ui/swift-ui'

export default function HapticPressableIOS(props: ButtonProps) {
  return (
    <Host matchContents>
      <Button {...props} />
    </Host>
  )
}
