# Blekit

`blekit` is a lightweight, dependency-free Bluetooth Low Energy (BLE) library for React Native and Expo. It is written in **100% pure Swift** (utilizing CoreBluetooth) on iOS and **100% pure Kotlin** (utilizing standard android.bluetooth) on Android.

It provides a drop-in replacement for the `react-native-ble-plx` API, removing all heavy reactive programming dependencies (such as RxBluetoothKit, RxAndroidBle, RxSwift, and RxJava) to deliver faster builds, a smaller bundle size, and fewer compilation issues.

## Features

- Bluetooth state monitoring.
- Device scanning with UUID filtering.
- Connection management (connect, disconnect, connection status, RSSI reading).
- GATT Service and Characteristic discovery.
- Characteristic read and write operations (with and without response).
- Characteristic monitoring (notifications and indications).
- Descriptor read and write operations.
- MTU and connection priority requests.

---
