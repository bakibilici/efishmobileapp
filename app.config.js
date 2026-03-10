export default ({ config }) => ({
  ...config,
  name: "efish",
  slug: "efish",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/efishjuste.png",
  scheme: "efish",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    "infoPlist": {
      ITSAppUsesNonExemptEncryption: false,
      NSMicrophoneUsageDescription: "Ses kaydı için mikrofon erişimi gerekiyor.",
      NSSpeechRecognitionUsageDescription: "Konuşmayı yazıya çevirmek için izin gerekiyor."
    },
    supportsTablet: true,
    bundleIdentifier: "com.efish.app",
    config: {
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY,
    },
  },
  android: {
    package: "com.efish.app",
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY,
      },
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    permissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.INTERNET"
    ]
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "@sentry/react-native/expo",
      {
        url: "https://sentry.io/",
        note: "Use environment variables for these in CI/CD if possible",
        project: "efish-mobile",
        organization: "uptecra-teknoloji-anonim-sirke",
      },
    ],
    "expo-secure-store",
    "@react-native-voice/voice",
    "expo-localization",
    [
      "expo-build-properties",
      {
        android: {
          enableJetifier: true,
        },
      }
    ],
    "./withAndroidSupportExclude.js",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "dde787c2-163e-4c08-b52a-c24b6e4673ce",
    },
  },
});
