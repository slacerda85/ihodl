import {
  hasHardwareAsync,
  getEnrolledLevelAsync,
  authenticateAsync,
} from 'expo-local-authentication'

export const checkHardware = async () => await hasHardwareAsync()
export const checkPermissions = async () => await getEnrolledLevelAsync()
export const authenticate = async () =>
  await authenticateAsync({
    promptMessage: 'Autentique-se para continuar',
    biometricsSecurityLevel: 'weak',
    cancelLabel: 'Cancelar',
    disableDeviceFallback: false,
  })
