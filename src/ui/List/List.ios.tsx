import { Host, List, ListProps } from '@expo/ui/swift-ui'

export default function ListIOS(props: ListProps) {
  return (
    <Host matchContents>
      <List {...props} />
    </Host>
  )
}
