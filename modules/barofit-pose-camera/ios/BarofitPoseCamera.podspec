require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'BarofitPoseCamera'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { :git => 'https://github.com/Barofit-team/frontend.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'MediaPipeTasksVision', '1.0.0'

  s.resources = ['pose_landmarker_full.task']

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'OTHER_LDFLAGS' => '$(inherited) -lc++'
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
