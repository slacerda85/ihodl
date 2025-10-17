import { Platform } from 'react-native'
import ListIOS from './List.ios'
import ListAndroid from './List.android'

const List = Platform.OS === 'ios' ? ListIOS : ListAndroid

export default List
