import { Button, ButtonProps, Host } from '@expo/ui/swift-ui'

export default function HapticTabIOS(props: ButtonProps) {
  return (
    <Host matchContents>
      <Button {...props} />
    </Host>
  )
}
