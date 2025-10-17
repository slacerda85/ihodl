import { Platform } from 'react-native'
import { IconSymbol as IconSymbolIOS } from './IconSymbol.ios'
import { IconSymbol as IconSymbolAndroid } from './IconSymbol.android'

const IconSymbol = Platform.OS === 'ios' ? IconSymbolIOS : IconSymbolAndroid

export default IconSymbol
