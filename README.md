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

## Installation

```bash
npm install blekit
# or
yarn add blekit
```

### Expo Configuration

Because this module contains custom native code, it cannot run in the standard Expo Go client. You must use **Development Builds**.

Add permissions to your Expo `app.json` or `app.config.js`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-build-properties",
        {
          "ios": {
            "deploymentTarget": "16.4"
          }
        }
      ]
    ],
    "ios": {
      "infoPlist": {
        "NSBluetoothAlwaysUsageDescription": "This app uses Bluetooth to connect to BLE devices."
      }
    },
    "android": {
      "permissions": [
        "android.permission.BLUETOOTH",
        "android.permission.BLUETOOTH_ADMIN",
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.ACCESS_FINE_LOCATION"
      ]
    }
  }
}
```

Then prebuild and run:

```bash
npx expo prebuild
npx expo run:ios
npx expo run:android
```

---

## Usage

Here is a quick example showing how to initialize the manager, scan for devices, connect, and read/write values.

```typescript
import { BleManager, Device, Characteristic } from 'blekit';

// Initialize the manager (create it only once, usually as a singleton)
const manager = new BleManager();

// 1. Monitor Bluetooth state changes
const stateSub = manager.onStateChange((state) => {
  console.log('Bluetooth state changed:', state); // e.g., 'PoweredOn'
}, true);

// 2. Scan for devices
manager.startDeviceScan(null, null, (error, device) => {
  if (error) {
    console.error('Scan error:', error);
    return;
  }
  
  if (device) {
    console.log(`Discovered device: ${device.name} (${device.id})`);
    
    // Stop scanning when your target device is found
    if (device.name === 'MyBLEDevice') {
      manager.stopDeviceScan();
      connectToDevice(device);
    }
  }
});

// 3. Connect to device and discover services & characteristics
async function connectToDevice(device: Device) {
  try {
    console.log('Connecting...');
    const connectedDevice = await device.connect();
    console.log('Connected! Discovering services and characteristics...');
    
    await connectedDevice.discoverAllServicesAndCharacteristics();
    console.log('Discovered everything!');
    
    // Read a value
    const serviceUUID = '12345678-1234-5678-1234-567812345678';
    const charUUID = '87654321-4321-8765-4321-876543210987';
    
    const characteristic = await connectedDevice.readCharacteristicForService(
      serviceUUID,
      charUUID
    );
    console.log('Read base64 value:', characteristic.value);
    
    // Write a value (base64 encoded)
    const base64Value = 'SGVsbG8='; // 'Hello'
    await connectedDevice.writeCharacteristicWithResponseForService(
      serviceUUID,
      charUUID,
      base64Value
    );
    console.log('Write completed!');
    
    // Monitor characteristic value updates
    const monitorSub = connectedDevice.monitorCharacteristicForService(
      serviceUUID,
      charUUID,
      (err, char) => {
        if (err) {
          console.error('Notification error:', err);
          return;
        }
        console.log('New notified value:', char?.value);
      }
    );
    
  } catch (err) {
    console.error('Connection/GATT operations failed:', err);
  }
}

// 4. Cleanup when the manager is no longer needed
// manager.destroy();
```

---

## API Difference from `react-native-ble-plx`

`blekit` maintains complete compatibility with the `react-native-ble-plx` API structure. You can replace:

```typescript
import { BleManager } from 'react-native-ble-plx';
```

with:

```typescript
import { BleManager } from 'blekit';
```

The underlying library takes care of translating your calls to native Swift/Kotlin commands without any third-party framework overhead.
