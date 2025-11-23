import { Platform } from 'react-native'
import SwitchIOS from './Switch.ios'
import SwitchAndroid from './Switch.android'

const Switch = Platform.OS === 'ios' ? SwitchIOS : SwitchAndroid

export default Switch
