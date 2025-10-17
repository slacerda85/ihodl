import { Host, Button as IOSButton, ButtonProps } from '@expo/ui/swift-ui'

export default function Button(props: ButtonProps) {
  return (
    <Host matchContents>
      <IOSButton {...props}>{props.children}</IOSButton>
    </Host>
  )
}
