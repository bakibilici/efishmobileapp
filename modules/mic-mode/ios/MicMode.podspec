Pod::Spec.new do |s|
  s.name           = 'MicMode'
  s.version        = '1.0.0'
  s.summary        = 'Opens the system microphone-mode picker (Voice Isolation) during a call.'
  s.description    = 'Local Expo module of the AKBA app: AVCaptureDevice microphone modes.'
  s.license        = 'UNLICENSED'
  s.author         = 'Uptecra'
  s.homepage       = 'https://github.com/uptecra'
  s.platforms      = {
    :ios => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
