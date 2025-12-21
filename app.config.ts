import { ExpoConfig, ConfigContext } from 'expo/config'

const IS_DEV = process.env.APP_VARIANT === 'development'

const getAppName = () => {
  if (IS_DEV) {
    return 'iHodl Dev'
  }
  return 'iHodl'
}

const getUniqueIdentifier = () => {
  if (IS_DEV) {
    return 'app.ihodl.wallet.dev'
  }
  return 'app.ihodl.wallet'
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: getAppName(),
  slug: 'ihodl',
  scheme: 'ihodl',
  version: '1.0.0',
  icon: './assets/images/splash-icon.png',
  orientation: 'portrait',
  owner: 'slacerda85',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    runtimeVersion: {
      policy: 'appVersion',
    },
    icon: './assets/images/icon.png',
    supportsTablet: true,
    infoPlist: {
      NSFaceIDUsageDescription: 'This app uses Face ID to secure your data',
      ITSAppUsesNonExemptEncryption: false,
    },
    bundleIdentifier: getUniqueIdentifier(),
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
    runtimeVersion: '1.0.0',
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
      dark: {
        image: './assets/images/splash-icon.png',
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
    'expo-font',
    'expo-background-task',
    [
      'expo-sqlite',
      {
        // Full-text search para busca de nodes/channels por alias
        enableFTS: true,
        // SQLCipher para criptografia de dados sensíveis (lightning.db)
        // gossip.db usa SQLite padrão (dados públicos)
        useSQLCipher: true,
      },
    ],
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Allow $(PRODUCT_NAME) to use Face ID.',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        backgroundColor: '#ffffff',
        dark: {
          image: './assets/images/splash-icon.png',
          backgroundColor: '#000000',
        },
        imageWidth: 200,
      },
    ],
    [
      'expo-secure-store',
      {
        configureAndroidBackup: true,
        faceIDPermission: 'Allow $(PRODUCT_NAME) to access your Face ID biometric data.',
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/images/icon.png',
        color: '#ffffff',
        // sounds: ['./assets/sounds/notification.wav'], // Removido - usando som padrão do sistema
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
  updates: {
    url: 'https://u.expo.dev/e8ba22be-1b9a-41d5-aded-20d2c498eb5c',
  },
})
