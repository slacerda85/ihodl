import { ExpoConfig, ConfigContext } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'ihodl',
  slug: 'ihodl',
  scheme: 'ihodl',
  version: '1.0.0',
  orientation: 'portrait',
  owner: 'slacerda85',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    infoPlist: {
      NSFaceIDUsageDescription: 'This app uses Face ID to secure your data',
      ITSAppUsesNonExemptEncryption: false,
    },
    bundleIdentifier: 'app.ihodl.wallet',
    config: {
      usesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#ffffff',
    },
    permissions: ['android.permission.USE_BIOMETRIC', 'android.permission.USE_FINGERPRINT'],
    package: 'app.ihodl.wallet',
    splash: {
      image: './assets/splash_screen_white.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
      dark: {
        image: './assets/splash_screen_dark.png',
        resizeMode: 'contain',
        backgroundColor: '#000000',
      },
    },
  },
  web: {
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Allow $(PRODUCT_NAME) to use Face ID.',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash_screen_white.png',
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        dark: {
          image: './assets/splash_screen_dark.png',
          resizeMode: 'contain',
          backgroundColor: '#000000',
        },
      },
    ],
    [
      'expo-secure-store',
      {
        configureAndroidBackup: true,
        faceIDPermission: 'Allow $(PRODUCT_NAME) to access your Face ID biometric data.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {
      origin: false,
    },
    eas: {
      projectId: 'e8ba22be-1b9a-41d5-aded-20d2c498eb5c',
    },
  },
})
