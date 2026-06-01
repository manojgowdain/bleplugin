import { EventEmitter, requireNativeModule } from "expo-modules-core";
import { PermissionsAndroid, Platform } from "react-native";

import {
  normalizeDevice,
  normalizeError,
  toByteArray,
  toUint8Array,
} from "./utils";

const nativeModule = requireNativeModule("ExpoDeviceInfo");
const rawEmitter = new EventEmitter(nativeModule);
const publicEmitter = new EventEmitter();

rawEmitter.addListener("deviceFound", (device) => {
  publicEmitter.emit("deviceFound", normalizeDevice(device));
});

rawEmitter.addListener("connected", (event) => {
  publicEmitter.emit("connected", event);
});

rawEmitter.addListener("disconnected", (event) => {
  publicEmitter.emit("disconnected", event);
});

rawEmitter.addListener("characteristicChanged", (event) => {
  publicEmitter.emit("characteristicChanged", {
    ...event,
    value: toUint8Array(event.value),
  });
});

rawEmitter.addListener("bluetoothStateChanged", (event) => {
  publicEmitter.emit("bluetoothStateChanged", event);
});

rawEmitter.addListener("error", (event) => {
  publicEmitter.emit("error", event);
});

function getAndroidPermissions() {
  if (Platform.OS !== "android") {
    return [];
  }

  if (Number(Platform.Version) >= 31) {
    return [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ];
  }

  return [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
}

class BLEClient {
  async requestPermissions() {
    if (Platform.OS === "android") {
      const permissions = getAndroidPermissions();

      if (permissions.length > 0) {
        try {
          await PermissionsAndroid.requestMultiple(permissions);
        } catch (error) {
          throw normalizeError(error);
        }
      }
    }

    return nativeModule.requestPermissions();
  }

  async isEnabled() {
    return nativeModule.isEnabled();
  }

  async startScan(options = {}) {
    return nativeModule.startScan(options);
  }

  async stopScan() {
    return nativeModule.stopScan();
  }

  async connect(deviceId) {
    return nativeModule.connect(deviceId);
  }

  async disconnect(deviceId) {
    return nativeModule.disconnect(deviceId);
  }

  async read(deviceId, serviceUUID, characteristicUUID) {
    return toUint8Array(
      await nativeModule.read(deviceId, serviceUUID, characteristicUUID),
    );
  }

  async write(deviceId, serviceUUID, characteristicUUID, value) {
    return nativeModule.write(
      deviceId,
      serviceUUID,
      characteristicUUID,
      toByteArray(value),
    );
  }

  async startNotifications(deviceId, serviceUUID, characteristicUUID) {
    return nativeModule.startNotifications(
      deviceId,
      serviceUUID,
      characteristicUUID,
    );
  }

  async stopNotifications(deviceId, serviceUUID, characteristicUUID) {
    return nativeModule.stopNotifications(
      deviceId,
      serviceUUID,
      characteristicUUID,
    );
  }

  addListener(eventName, callback) {
    return publicEmitter.addListener(eventName, callback);
  }

  removeListener(subscription) {
    subscription.remove();
  }

  emitError(error) {
    publicEmitter.emit("error", normalizeError(error));
  }
}

const BLE = new BLEClient();

export default BLE;
