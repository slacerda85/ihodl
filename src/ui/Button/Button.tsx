import { Button as AndroidButton, ButtonProps } from '@expo/ui/jetpack-compose'

export default function Button(props: ButtonProps) {
  return <AndroidButton {...props}>{props.children}</AndroidButton>
}
