import { ScrollView } from 'react-native'

export default function ListAndroid(props: any) {
  return <ScrollView style={{ flex: 1 }}>{props.children}</ScrollView>
}
