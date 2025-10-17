import { List, ListProps, Host } from '@expo/ui/swift-ui'

export default function DataListIOS(props: ListProps) {
  return (
    <Host matchContents>
      <List {...props} />
    </Host>
  )
}
