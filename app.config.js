// Permission copy shared by the Info.plist keys and the speech plugin, so the
// two can never disagree. The wake-word listener only runs on-device (see
// patches/expo-speech-recognition+3.1.3.patch); search dictation does not.
const MIC_PERMISSION = "Electrip AIRouting ile sesli konuşabilmen için mikrofon erişimi gerekiyor.";
const SPEECH_PERMISSION =
  "“Electrip” diye seslendiğinde seni duyabilmek (bu dinleme telefonunda yapılır) ve aramaya sesle yazabilmek için konuşma tanıma izni gerekiyor.";
// The packages' own defaults read "Allow $(PRODUCT_NAME) to …", which names
// the Xcode target (TubitakAppDemo in an older local ios/ folder) instead of
// the app. Written out here so every dialog says Electrip AIRouting, in Turkish.
const LOCATION_PERMISSION =
  "Electrip AIRouting, çevrendeki şarj istasyonlarını gösterebilmek, rotanı bulunduğun yerden planlayabilmek ve sürüşte olduğunu anlayabilmek için konumunu kullanır.";
const MOTION_PERMISSION =
  "Electrip AIRouting, yürüdüğünü ya da araçta olduğunu anlayabilmek için hareket verisini kullanır.";
const FACE_ID_PERMISSION =
  "Electrip AIRouting, telefonunda sakladığı giriş bilgilerini Face ID ile koruyabilir.";

export default ({ config }) => ({
  ...config,
  name: "Electrip AIRouting",
  slug: "tubitak-app",
  // The EAS project lives under the uptecra account. Without this the CLI
  // resolves the project by id alone, which is how the previous project ended
  // up unreachable from a different login.
  owner: "uptecra",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/electrip_icon.png",
  scheme: "tubitak",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    infoPlist: {
      CFBundleDisplayName: "Electrip AIRouting",
      CFBundleName: "Electrip AIRouting",
      ITSAppUsesNonExemptEncryption: false,
      NSMicrophoneUsageDescription:
        MIC_PERMISSION,
      NSSpeechRecognitionUsageDescription:
        SPEECH_PERMISSION,
      NSPhotoLibraryUsageDescription:
        "Profil fotoğrafı ve araç fotoğrafı ekleyebilmeniz için galeriye erişim izni gereklidir.",
      NSCameraUsageDescription:
        "Profil fotoğrafı ve araç fotoğrafı çekebilmeniz için kameraya erişim izni gereklidir.",
      NSLocationWhenInUseUsageDescription: LOCATION_PERMISSION,
      NSLocationAlwaysAndWhenInUseUsageDescription: LOCATION_PERMISSION,
      NSLocationAlwaysUsageDescription: LOCATION_PERMISSION,
      NSMotionUsageDescription: MOTION_PERMISSION,
      NSFaceIDUsageDescription: FACE_ID_PERMISSION,
      // Keep the Atlas voice session alive while the screen is locked in the car
      UIBackgroundModes: ["audio"],
    },
    supportsTablet: true,
    bundleIdentifier: "com.tubitak.uptecra",
    config: {
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY,
    },
  },
  android: {
    package: "com.tubitak.uptecra",
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
      "android.permission.INTERNET",
    ],
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
        imageWidth: 220,
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
        project: "tubitak-mobile",
        organization: "uptecra-teknoloji-anonim-sirke",
      },
    ],
    "expo-secure-store",
    "@react-native-voice/voice",
    [
      // On-device "AKBA" wake word. Same permission strings as above, so the
      // two plugins cannot overwrite each other with different copy.
      "expo-speech-recognition",
      {
        microphonePermission: MIC_PERMISSION,
        speechRecognitionPermission:
          SPEECH_PERMISSION,
        androidSpeechServicePackages: [
          "com.google.android.as",
          "com.google.android.googlequicksearchbox",
        ],
      },
    ],
    "expo-localization",
    [
      "expo-build-properties",
      {
        android: {
          enableJetifier: true,
        },
        ios: {
          buildReactNativeFromSource: true,
        },
      },
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
      projectId: "43827cb3-1c90-4a47-a0b2-f8934cbdb005",
    },
  },
});
