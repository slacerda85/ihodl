import { Platform } from 'react-native'
import PickerIOS from './Picker.ios'
import PickerAndroid from './Picker.android'

const Picker = Platform.OS === 'ios' ? PickerIOS : PickerAndroid

export default Picker
