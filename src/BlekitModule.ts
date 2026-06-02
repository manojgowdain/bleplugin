import { NativeModule, requireNativeModule } from 'expo';

import { State, LogLevel, ScanMode, ScanCallbackType } from './Blekit.types';

export type NativeDevice = {
  id: string;
  name: string | null;
  rssi: number | null;
  mtu: number;
  manufacturerData: string | null;
  serviceUUIDs: string[] | null;
  serviceData: Record<string, string> | null;
  txPowerLevel: number | null;
  solicitedServiceUUIDs: string[] | null;
  overflowServiceUUIDs: string[] | null;
  localName: string | null;
};

export type NativeService = {
  id: number;
  uuid: string;
  deviceID: string;
  isPrimary: boolean;
};

export type NativeCharacteristic = {
  id: number;
  uuid: string;
  serviceID: number;
  serviceUUID: string;
  deviceID: string;
  isReadable: boolean;
  isWritableWithResponse: boolean;
  isWritableWithoutResponse: boolean;
  isNotifiable: boolean;
  isIndicatable: boolean;
  value: string | null;
};

export type NativeDescriptor = {
  id: number;
  uuid: string;
  characteristicID: number;
  characteristicUUID: string;
  serviceID: number;
  serviceUUID: string;
  deviceID: string;
  value: string | null;
};

export type NativeBleRestoredState = {
  connectedPeripherals: NativeDevice[];
};

export type BlekitModuleEvents = {
  onStateChange: (params: { state: State }) => void;
  onDeviceDiscovered: (params: { device: NativeDevice }) => void;
  onCharacteristicNotification: (params: {
    characteristicId: number;
    value: string | null;
    error: any | null;
  }) => void;
  onDeviceDisconnected: (params: { deviceId: string; error: any | null }) => void;
  // Included to keep backwards compatibility for event template
  onChange: (params: { value: string }) => void;
};

declare class BlekitModule extends NativeModule<BlekitModuleEvents> {
  // Client lifecycle
  createClient(restoreIdentifier: string | null): Promise<void>;
  destroyClient(): Promise<void>;

  // State operations
  getBluetoothState(): Promise<State>;
  enable(transactionId: string | null): Promise<State>;
  disable(transactionId: string | null): Promise<State>;

  // Logging
  setLogLevel(logLevel: LogLevel): Promise<LogLevel>;
  logLevel(): Promise<LogLevel>;

  // Transactions
  cancelTransaction(transactionId: string): Promise<void>;

  // Scanning
  startDeviceScan(
    filteredUUIDs: string[] | null,
    options: {
      allowDuplicates?: boolean;
      scanMode?: ScanMode;
      callbackType?: ScanCallbackType;
      legacyScan?: boolean;
    } | null
  ): Promise<void>;
  stopDeviceScan(): Promise<void>;

  // Connection
  connectToDevice(
    deviceAddress: string,
    options: {
      autoConnect?: boolean;
      requestMTU?: number;
      refreshGatt?: 'OnConnected';
      timeout?: number;
    } | null
  ): Promise<NativeDevice>;
  cancelDeviceConnection(deviceAddress: string): Promise<NativeDevice>;
  isDeviceConnected(deviceAddress: string): Promise<boolean>;

  // Discovery
  discoverAllServicesAndCharacteristicsForDevice(
    deviceAddress: string,
    transactionId: string | null
  ): Promise<NativeDevice>;

  // Service / Characteristic retrieval
  servicesForDevice(deviceAddress: string): Promise<NativeService[]>;
  characteristicsForDevice(
    deviceAddress: string,
    serviceUUID: string
  ): Promise<NativeCharacteristic[]>;
  descriptorsForDevice(
    deviceAddress: string,
    serviceUUID: string,
    characteristicUUID: string
  ): Promise<NativeDescriptor[]>;

  // UUID-based GATT operations
  readCharacteristicForDevice(
    deviceAddress: string,
    serviceUUID: string,
    characteristicUUID: string,
    transactionId: string | null
  ): Promise<NativeCharacteristic>;
  writeCharacteristicForDevice(
    deviceAddress: string,
    serviceUUID: string,
    characteristicUUID: string,
    valueBase64: string,
    withResponse: boolean,
    transactionId: string | null
  ): Promise<NativeCharacteristic>;
  monitorCharacteristicForDevice(
    deviceAddress: string,
    serviceUUID: string,
    characteristicUUID: string,
    transactionId: string | null
  ): Promise<number>; // returns characteristic ID

  // ID-based GATT operations
  readCharacteristic(
    characteristicId: number,
    transactionId: string | null
  ): Promise<NativeCharacteristic>;
  writeCharacteristic(
    characteristicId: number,
    valueBase64: string,
    withResponse: boolean,
    transactionId: string | null
  ): Promise<NativeCharacteristic>;
  monitorCharacteristic(characteristicId: number, transactionId: string | null): Promise<void>;

  // Descriptor operations
  readDescriptorForDevice(
    deviceAddress: string,
    serviceUUID: string,
    characteristicUUID: string,
    descriptorUUID: string,
    transactionId: string | null
  ): Promise<NativeDescriptor>;
  writeDescriptorForDevice(
    deviceAddress: string,
    serviceUUID: string,
    characteristicUUID: string,
    descriptorUUID: string,
    valueBase64: string,
    transactionId: string | null
  ): Promise<NativeDescriptor>;
  readDescriptor(descriptorId: number, transactionId: string | null): Promise<NativeDescriptor>;
  writeDescriptor(
    descriptorId: number,
    valueBase64: string,
    transactionId: string | null
  ): Promise<NativeDescriptor>;

  // Extras
  requestMTUForDevice(
    deviceAddress: string,
    mtu: number,
    transactionId: string | null
  ): Promise<NativeDevice>;
  requestConnectionPriorityForDevice(
    deviceAddress: string,
    connectionPriority: number,
    transactionId: string | null
  ): Promise<NativeDevice>;
  readRSSIForDevice(deviceAddress: string, transactionId: string | null): Promise<NativeDevice>;

  // Backwards compatibility template function
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

export default requireNativeModule<BlekitModule>('Blekit');
export { BlekitModule };
