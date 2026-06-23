import {
  Base64,
  UUID,
  DeviceId,
  TransactionId,
  Subscription,
  State,
  LogLevel,
  ScanOptions,
  ConnectionOptions,
  BleManagerOptions,
  BleError,
  BleErrorCode,
} from './Blekit.types';
import BleModule, { NativeDevice, NativeCharacteristic } from './BlekitModule';
import { Characteristic } from './Characteristic';
import { Descriptor } from './Descriptor';
import { Device } from './Device';
import { Service } from './Service';

export class BleManager {
  private _scanListener: Subscription | null = null;
  private _notificationListener: Subscription | null = null;
  private _disconnectionListener: Subscription | null = null;
  private _restoreListener: Subscription | null = null;

  private _notificationListeners = new Map<
    number,
    Set<(error: BleError | null, characteristic: Characteristic | null) => void>
  >();
  private _disconnectionListeners = new Map<
    string,
    Set<(error: BleError | null, device: Device | null) => void>
  >();

  static sharedInstance: BleManager | null = null;

  constructor(options: BleManagerOptions = {}) {
    if (BleManager.sharedInstance) {
      return BleManager.sharedInstance;
    }

    BleModule.createClient(options.restoreStateIdentifier || null);

    if (options.restoreStateFunction) {
      this._restoreListener = BleModule.addListener('onStateChange', () => {
        // Expo doesn't support state restoration automatically here, but we invoke callback with null/empty
        options.restoreStateFunction?.(null);
      });
    }

    // Set up global listeners
    this._notificationListener = BleModule.addListener('onCharacteristicNotification', (event) => {
      const { characteristicId, value, error } = event;
      const listeners = this._notificationListeners.get(characteristicId);
      if (listeners) {
        let bleError: BleError | null = null;
        let charObj: Characteristic | null = null;
        if (error) {
          bleError = new BleError(error);
        } else {
          // Recreate characteristic object with value
          const nativeChar: NativeCharacteristic = {
            id: characteristicId,
            uuid: '', // native doesn't necessarily send full details for notification, but we can mock
            serviceID: 0,
            serviceUUID: '',
            deviceID: '',
            isReadable: true,
            isWritableWithResponse: false,
            isWritableWithoutResponse: false,
            isNotifiable: true,
            isIndicatable: false,
            value,
          };
          charObj = new Characteristic(nativeChar, this);
        }

        for (const listener of listeners) {
          listener(bleError, charObj);
        }
      }
    });

    this._disconnectionListener = BleModule.addListener('onDeviceDisconnected', (event) => {
      const { deviceId, error } = event;
      const listeners = this._disconnectionListeners.get(deviceId);
      if (listeners) {
        const bleError = error
          ? new BleError(error)
          : new BleError({
              errorCode: BleErrorCode.DeviceDisconnected,
              attErrorCode: null,
              iosErrorCode: null,
              androidErrorCode: null,
              reason: 'Device disconnected',
            });
        const nativeDevice: NativeDevice = {
          id: deviceId,
          name: null,
          rssi: null,
          mtu: 23,
          manufacturerData: null,
          serviceUUIDs: null,
          serviceData: null,
          txPowerLevel: null,
          solicitedServiceUUIDs: null,
          overflowServiceUUIDs: null,
          localName: null,
        };
        const deviceObj = new Device(nativeDevice, this);
        for (const listener of listeners) {
          listener(bleError, deviceObj);
        }
      }
    });

    BleManager.sharedInstance = this;
  }

  destroy(): void {
    BleModule.destroyClient();
    this._scanListener?.remove();
    this._notificationListener?.remove();
    this._disconnectionListener?.remove();
    this._restoreListener?.remove();

    this._notificationListeners.clear();
    this._disconnectionListeners.clear();

    if (BleManager.sharedInstance === this) {
      BleManager.sharedInstance = null;
    }
  }

  // State operations
  async state(): Promise<State> {
    return BleModule.getBluetoothState();
  }

  onStateChange(listener: (state: State) => void, emitCurrentState?: boolean): Subscription {
    if (emitCurrentState) {
      this.state()
        .then(listener)
        .catch(() => {});
    }
    return BleModule.addListener('onStateChange', (event) => {
      listener(event.state);
    });
  }

  async enable(transactionId?: TransactionId): Promise<State> {
    return BleModule.enable(transactionId || null);
  }

  async disable(transactionId?: TransactionId): Promise<State> {
    return BleModule.disable(transactionId || null);
  }

  // Logging
  async setLogLevel(logLevel: LogLevel): Promise<LogLevel> {
    return BleModule.setLogLevel(logLevel);
  }

  async logLevel(): Promise<LogLevel> {
    return BleModule.logLevel();
  }

  // Transactions
  async cancelTransaction(transactionId: string): Promise<void> {
    return BleModule.cancelTransaction(transactionId);
  }

  // Scanning
  startDeviceScan(
    filteredUUIDs: UUID[] | null,
    options: ScanOptions | null,
    listener: (error: BleError | null, scannedDevice: Device | null) => void
  ): void {
    this._scanListener?.remove();
    this._scanListener = BleModule.addListener('onDeviceDiscovered', (event) => {
      listener(null, new Device(event.device, this));
    });

    BleModule.startDeviceScan(filteredUUIDs, options).catch((err) => {
      listener(new BleError(err), null);
    });
  }

  stopDeviceScan(): void {
    this._scanListener?.remove();
    this._scanListener = null;
    BleModule.stopDeviceScan().catch(() => {});
  }

  // Connections
  async connectToDevice(deviceAddress: DeviceId, options?: ConnectionOptions): Promise<Device> {
    const nativeDev = await BleModule.connectToDevice(deviceAddress, options || null);
    return new Device(nativeDev, this);
  }

  async cancelDeviceConnection(deviceAddress: DeviceId): Promise<Device> {
    const nativeDev = await BleModule.cancelDeviceConnection(deviceAddress);
    return new Device(nativeDev, this);
  }

  async isDeviceConnected(deviceAddress: DeviceId): Promise<boolean> {
    return BleModule.isDeviceConnected(deviceAddress);
  }

  onDeviceDisconnected(
    deviceAddress: DeviceId,
    listener: (error: BleError | null, device: Device | null) => void
  ): Subscription {
    let listeners = this._disconnectionListeners.get(deviceAddress);
    if (!listeners) {
      listeners = new Set();
      this._disconnectionListeners.set(deviceAddress, listeners);
    }
    listeners.add(listener);

    return {
      remove: () => {
        const list = this._disconnectionListeners.get(deviceAddress);
        if (list) {
          list.delete(listener);
          if (list.size === 0) {
            this._disconnectionListeners.delete(deviceAddress);
          }
        }
      },
    };
  }

  // Service and Characteristic Discovery
  async discoverAllServicesAndCharacteristicsForDevice(
    deviceAddress: DeviceId,
    transactionId?: TransactionId
  ): Promise<Device> {
    const nativeDev = await BleModule.discoverAllServicesAndCharacteristicsForDevice(
      deviceAddress,
      transactionId || null
    );
    return new Device(nativeDev, this);
  }

  async servicesForDevice(deviceAddress: DeviceId): Promise<Service[]> {
    const nativeServices = await BleModule.servicesForDevice(deviceAddress);
    return nativeServices.map((ns) => new Service(ns, this));
  }

  async characteristicsForDevice(
    deviceAddress: DeviceId,
    serviceUUID: UUID
  ): Promise<Characteristic[]> {
    const nativeChars = await BleModule.characteristicsForDevice(deviceAddress, serviceUUID);
    return nativeChars.map((nc) => new Characteristic(nc, this));
  }

  async descriptorsForDevice(
    deviceAddress: DeviceId,
    serviceUUID: UUID,
    characteristicUUID: UUID
  ): Promise<Descriptor[]> {
    const nativeDescs = await BleModule.descriptorsForDevice(
      deviceAddress,
      serviceUUID,
      characteristicUUID
    );
    return nativeDescs.map((nd) => new Descriptor(nd, this));
  }

  // UUID-based GATT operations
  async readCharacteristicForDevice(
    deviceAddress: DeviceId,
    serviceUUID: UUID,
    characteristicUUID: UUID,
    transactionId?: TransactionId
  ): Promise<Characteristic> {
    const nc = await BleModule.readCharacteristicForDevice(
      deviceAddress,
      serviceUUID,
      characteristicUUID,
      transactionId || null
    );
    return new Characteristic(nc, this);
  }

  async writeCharacteristicWithResponseForDevice(
    deviceAddress: DeviceId,
    serviceUUID: UUID,
    characteristicUUID: UUID,
    valueBase64: Base64,
    transactionId?: TransactionId
  ): Promise<Characteristic> {
    const nc = await BleModule.writeCharacteristicForDevice(
      deviceAddress,
      serviceUUID,
      characteristicUUID,
      valueBase64,
      true,
      transactionId || null
    );
    return new Characteristic(nc, this);
  }

  async writeCharacteristicWithoutResponseForDevice(
    deviceAddress: DeviceId,
    serviceUUID: UUID,
    characteristicUUID: UUID,
    valueBase64: Base64,
    transactionId?: TransactionId
  ): Promise<Characteristic> {
    const nc = await BleModule.writeCharacteristicForDevice(
      deviceAddress,
      serviceUUID,
      characteristicUUID,
      valueBase64,
      false,
      transactionId || null
    );
    return new Characteristic(nc, this);
  }

  monitorCharacteristicForDevice(
    deviceAddress: DeviceId,
    serviceUUID: UUID,
    characteristicUUID: UUID,
    listener: (error: BleError | null, characteristic: Characteristic | null) => void,
    transactionId?: TransactionId
  ): Subscription {
    let charId: number | null = null;
    let subscriptionRemoved = false;

    BleModule.monitorCharacteristicForDevice(
      deviceAddress,
      serviceUUID,
      characteristicUUID,
      transactionId || null
    )
      .then((id) => {
        charId = id;
        if (subscriptionRemoved) {
          // Subscription was removed before promise resolved
          this._removeNotificationListener(id, listener);
          return;
        }
        this._addNotificationListener(id, listener);
      })
      .catch((err) => {
        listener(new BleError(err), null);
      });

    return {
      remove: () => {
        subscriptionRemoved = true;
        if (charId !== null) {
          this._removeNotificationListener(charId, listener);
        }
      },
    };
  }

  // ID-based GATT operations
  async readCharacteristic(
    characteristicId: number,
    transactionId?: TransactionId
  ): Promise<Characteristic> {
    const nc = await BleModule.readCharacteristic(characteristicId, transactionId || null);
    return new Characteristic(nc, this);
  }

  async writeCharacteristic(
    characteristicId: number,
    valueBase64: Base64,
    withResponse: boolean,
    transactionId?: TransactionId
  ): Promise<Characteristic> {
    const nc = await BleModule.writeCharacteristic(
      characteristicId,
      valueBase64,
      withResponse,
      transactionId || null
    );
    return new Characteristic(nc, this);
  }

  monitorCharacteristic(
    characteristicId: number,
    listener: (error: BleError | null, characteristic: Characteristic | null) => void,
    transactionId?: TransactionId
  ): Subscription {
    this._addNotificationListener(characteristicId, listener);
    BleModule.monitorCharacteristic(characteristicId, transactionId || null).catch((err) => {
      listener(new BleError(err), null);
    });

    return {
      remove: () => {
        this._removeNotificationListener(characteristicId, listener);
      },
    };
  }

  // Descriptor operations
  async readDescriptorForDevice(
    deviceAddress: DeviceId,
    serviceUUID: UUID,
    characteristicUUID: UUID,
    descriptorUUID: UUID,
    transactionId?: TransactionId
  ): Promise<Descriptor> {
    const nd = await BleModule.readDescriptorForDevice(
      deviceAddress,
      serviceUUID,
      characteristicUUID,
      descriptorUUID,
      transactionId || null
    );
    return new Descriptor(nd, this);
  }

  async writeDescriptorForDevice(
    deviceAddress: DeviceId,
    serviceUUID: UUID,
    characteristicUUID: UUID,
    descriptorUUID: UUID,
    valueBase64: Base64,
    transactionId?: TransactionId
  ): Promise<Descriptor> {
    const nd = await BleModule.writeDescriptorForDevice(
      deviceAddress,
      serviceUUID,
      characteristicUUID,
      descriptorUUID,
      valueBase64,
      transactionId || null
    );
    return new Descriptor(nd, this);
  }

  async readDescriptor(descriptorId: number, transactionId?: TransactionId): Promise<Descriptor> {
    const nd = await BleModule.readDescriptor(descriptorId, transactionId || null);
    return new Descriptor(nd, this);
  }

  async writeDescriptor(
    descriptorId: number,
    valueBase64: Base64,
    transactionId?: TransactionId
  ): Promise<Descriptor> {
    const nd = await BleModule.writeDescriptor(descriptorId, valueBase64, transactionId || null);
    return new Descriptor(nd, this);
  }

  // Extras
  async requestMTUForDevice(
    deviceAddress: DeviceId,
    mtu: number,
    transactionId?: TransactionId
  ): Promise<Device> {
    const nativeDev = await BleModule.requestMTUForDevice(
      deviceAddress,
      mtu,
      transactionId || null
    );
    return new Device(nativeDev, this);
  }

  async requestConnectionPriorityForDevice(
    deviceAddress: DeviceId,
    connectionPriority: number,
    transactionId?: TransactionId
  ): Promise<Device> {
    const nativeDev = await BleModule.requestConnectionPriorityForDevice(
      deviceAddress,
      connectionPriority,
      transactionId || null
    );
    return new Device(nativeDev, this);
  }

  async readRSSIForDevice(deviceAddress: DeviceId, transactionId?: TransactionId): Promise<Device> {
    const nativeDev = await BleModule.readRSSIForDevice(deviceAddress, transactionId || null);
    return new Device(nativeDev, this);
  }

  // Internal listener helper methods
  private _addNotificationListener(
    charId: number,
    listener: (error: BleError | null, characteristic: Characteristic | null) => void
  ) {
    let set = this._notificationListeners.get(charId);
    if (!set) {
      set = new Set();
      this._notificationListeners.set(charId, set);
    }
    set.add(listener);
  }

  private _removeNotificationListener(
    charId: number,
    listener: (error: BleError | null, characteristic: Characteristic | null) => void
  ) {
    const set = this._notificationListeners.get(charId);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this._notificationListeners.delete(charId);
      }
    }
  }
}
