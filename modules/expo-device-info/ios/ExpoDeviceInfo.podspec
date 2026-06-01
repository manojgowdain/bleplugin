require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'ExpoDeviceInfo'
  s.module_name = 'ExpoDeviceInfo'
  s.version = package['version']
  s.summary = 'Expo native module for Bluetooth device info'
  s.description = 'A custom Expo module that exposes Bluetooth device scanning and GATT control APIs.'
  s.license = 'MIT'
  s.homepage = 'https://expo.dev'
  s.author = 'Expo'
  s.platform = :ios, '15.1'
  s.source = { :path => '.' }
  s.source_files = '**/*.{h,m,mm,swift}'
  s.dependency 'ExpoModulesCore'
end