import AVFoundation
import ExpoModulesCore

/**
 Apple's microphone modes (Standard, Voice Isolation, Wide Spectrum) are chosen
 by the user in Control Center while an app is using the microphone for a call.
 An app cannot set them; it can only open that picker and read the choice.
 */
public class MicModeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MicMode")

    // Both APIs are iOS 15+, which is also the deployment floor (podspec).

    /// Opens the system microphone-mode picker.
    AsyncFunction("showMicModePicker") { () -> Bool in
      AVCaptureDevice.showSystemUserInterface(.microphoneModes)
      return true
    }
    .runOnQueue(.main)

    /// The mode the user picked for this app's calls.
    Function("activeMicMode") { () -> String in
      switch AVCaptureDevice.activeMicrophoneMode {
      case .standard:
        return "standard"
      case .voiceIsolation:
        return "voiceIsolation"
      case .wideSpectrum:
        return "wideSpectrum"
      @unknown default:
        return "unknown"
      }
    }
  }
}
