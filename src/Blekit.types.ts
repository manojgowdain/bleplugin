export type Base64 = string;
export type UUID = string;
export type DeviceId = string;
export type TransactionId = string;
export type Identifier = number;

export interface Subscription {
  remove(): void;
}

export enum State {
  Unknown = 'Unknown',
  Resetting = 'Resetting',
  Unsupported = 'Unsupported',
  Unauthorized = 'Unauthorized',
  PoweredOff = 'PoweredOff',
  PoweredOn = 'PoweredOn',
}

export enum LogLevel {
  None = 'None',
  Verbose = 'Verbose',
  Debug = 'Debug',
  Info = 'Info',
  Warning = 'Warning',
  Error = 'Error',
}

export enum ConnectionPriority {
  Balanced = 0,
  High = 1,
  LowPower = 2,
}

export enum ScanMode {
  Opportunistic = -1,
  LowPower = 0,
  Balanced = 1,
  LowLatency = 2,
}

export enum ScanCallbackType {
  AllMatches = 1,
  FirstMatch = 2,
  MatchLost = 4,
}

export interface ScanOptions {
  allowDuplicates?: boolean;
  scanMode?: ScanMode;
  callbackType?: ScanCallbackType;
  legacyScan?: boolean;
}

export interface ConnectionOptions {
  autoConnect?: boolean;
  requestMTU?: number;
  refreshGatt?: 'OnConnected';
  timeout?: number;
}

export interface BleManagerOptions {
  restoreStateIdentifier?: string;
  restoreStateFunction?: (restoredState: BleRestoredState | null) => void;
  errorCodesToMessagesMapping?: BleErrorCodeMessageMapping;
}

export interface BleRestoredState {
  connectedPeripherals: any[]; // We will type this properly in Device.ts or use Device[]
}

export enum BleErrorCode {
  UnknownError = 0,
  BluetoothManagerDestroyed = 1,
  OperationCancelled = 2,
  OperationTimedOut = 3,
  OperationStartFailed = 4,
  InvalidIdentifiers = 5,
  BluetoothUnsupported = 100,
  BluetoothUnauthorized = 101,
  BluetoothPoweredOff = 102,
  BluetoothInUnknownState = 103,
  BluetoothResetting = 104,
  DeviceConnectionFailed = 200,
  DeviceDisconnected = 201,
  DeviceRSSIReadFailed = 202,
  DeviceAlreadyConnected = 203,
  DeviceNotFound = 204,
  DeviceNotConnected = 205,
  DeviceMTUChangeFailed = 206,
  ServicesDiscoveryFailed = 300,
  IncludedServicesDiscoveryFailed = 301,
  ServiceNotFound = 302,
  ServicesNotDiscovered = 303,
  CharacteristicsDiscoveryFailed = 400,
  CharacteristicWriteFailed = 401,
  CharacteristicReadFailed = 402,
  CharacteristicNotifyChangeFailed = 403,
  CharacteristicNotFound = 404,
  CharacteristicsNotDiscovered = 405,
  DescriptorsDiscoveryFailed = 500,
  DescriptorWriteFailed = 501,
  DescriptorReadFailed = 502,
  DescriptorNotFound = 503,
  DescriptorsNotDiscovered = 504,
  ScanStartFailed = 600,
  LocationServicesDisabled = 601,
}

export type BleErrorCodeMessageMapping = { [key in BleErrorCode]: string };

export const BleErrorCodeMessage: BleErrorCodeMessageMapping = {
  [BleErrorCode.UnknownError]: 'Unknown error occurred',
  [BleErrorCode.BluetoothManagerDestroyed]: 'Bluetooth manager destroyed',
  [BleErrorCode.OperationCancelled]: 'Operation cancelled',
  [BleErrorCode.OperationTimedOut]: 'Operation timed out',
  [BleErrorCode.OperationStartFailed]: 'Operation start failed',
  [BleErrorCode.InvalidIdentifiers]: 'Invalid identifiers',
  [BleErrorCode.BluetoothUnsupported]: 'Bluetooth unsupported on this device',
  [BleErrorCode.BluetoothUnauthorized]: 'Bluetooth unauthorized',
  [BleErrorCode.BluetoothPoweredOff]: 'Bluetooth is powered off',
  [BleErrorCode.BluetoothInUnknownState]: 'Bluetooth in unknown state',
  [BleErrorCode.BluetoothResetting]: 'Bluetooth is resetting',
  [BleErrorCode.DeviceConnectionFailed]: 'Device connection failed',
  [BleErrorCode.DeviceDisconnected]: 'Device disconnected',
  [BleErrorCode.DeviceRSSIReadFailed]: 'RSSI read failed',
  [BleErrorCode.DeviceAlreadyConnected]: 'Device already connected',
  [BleErrorCode.DeviceNotFound]: 'Device not found',
  [BleErrorCode.DeviceNotConnected]: 'Device not connected',
  [BleErrorCode.DeviceMTUChangeFailed]: 'MTU change failed',
  [BleErrorCode.ServicesDiscoveryFailed]: 'Services discovery failed',
  [BleErrorCode.IncludedServicesDiscoveryFailed]: 'Included services discovery failed',
  [BleErrorCode.ServiceNotFound]: 'Service not found',
  [BleErrorCode.ServicesNotDiscovered]: 'Services not discovered',
  [BleErrorCode.CharacteristicsDiscoveryFailed]: 'Characteristics discovery failed',
  [BleErrorCode.CharacteristicWriteFailed]: 'Characteristic write failed',
  [BleErrorCode.CharacteristicReadFailed]: 'Characteristic read failed',
  [BleErrorCode.CharacteristicNotifyChangeFailed]: 'Characteristic notify change failed',
  [BleErrorCode.CharacteristicNotFound]: 'Characteristic not found',
  [BleErrorCode.CharacteristicsNotDiscovered]: 'Characteristics not discovered',
  [BleErrorCode.DescriptorsDiscoveryFailed]: 'Descriptors discovery failed',
  [BleErrorCode.DescriptorWriteFailed]: 'Descriptor write failed',
  [BleErrorCode.DescriptorReadFailed]: 'Descriptor read failed',
  [BleErrorCode.DescriptorNotFound]: 'Descriptor not found',
  [BleErrorCode.DescriptorsNotDiscovered]: 'Descriptors not discovered',
  [BleErrorCode.ScanStartFailed]: 'Scan start failed',
  [BleErrorCode.LocationServicesDisabled]: 'Location services disabled',
};

export interface NativeBleError {
  errorCode: BleErrorCode;
  attErrorCode: number | null;
  iosErrorCode: number | null;
  androidErrorCode: number | null;
  reason: string | null;
  deviceID?: string;
  serviceUUID?: string;
  characteristicUUID?: string;
  descriptorUUID?: string;
}

export class BleError extends Error {
  errorCode: BleErrorCode;
  attErrorCode: number | null;
  iosErrorCode: number | null;
  androidErrorCode: number | null;
  reason: string | null;
  deviceID?: string;
  serviceUUID?: string;
  characteristicUUID?: string;
  descriptorUUID?: string;

  constructor(
    nativeBleError: NativeBleError | string,
    errorMessageMapping?: BleErrorCodeMessageMapping
  ) {
    if (typeof nativeBleError === 'string') {
      super(nativeBleError);
      this.errorCode = BleErrorCode.UnknownError;
      this.attErrorCode = null;
      this.iosErrorCode = null;
      this.androidErrorCode = null;
      this.reason = nativeBleError;
    } else if (typeof nativeBleError.errorCode === 'number') {
      const mapping = errorMessageMapping || BleErrorCodeMessage;
      const message = nativeBleError.reason || mapping[nativeBleError.errorCode] || 'Unknown error';
      super(message);
      this.errorCode = nativeBleError.errorCode;
      this.attErrorCode = nativeBleError.attErrorCode;
      this.iosErrorCode = nativeBleError.iosErrorCode;
      this.androidErrorCode = nativeBleError.androidErrorCode;
      this.reason = nativeBleError.reason;
      this.deviceID = nativeBleError.deviceID;
      this.serviceUUID = nativeBleError.serviceUUID;
      this.characteristicUUID = nativeBleError.characteristicUUID;
      this.descriptorUUID = nativeBleError.descriptorUUID;
    } else {
      const fallback = nativeBleError as Partial<Error & { message?: string; code?: string }>;
      super(fallback.message || fallback.code || 'Unknown error');
      this.errorCode = BleErrorCode.UnknownError;
      this.attErrorCode = null;
      this.iosErrorCode = null;
      this.androidErrorCode = null;
      this.reason = fallback.message || fallback.code || 'Unknown error';
    }
    Object.setPrototypeOf(this, BleError.prototype);
  }
}
