import { BleManager } from './BleManager';
import {
  Base64,
  UUID,
  DeviceId,
  TransactionId,
  Subscription,
  ConnectionOptions,
} from './Blekit.types';
import { NativeDevice } from './BlekitModule';
import { Characteristic } from './Characteristic';
import { Service } from './Service';

export class Device {
  id: DeviceId;
  name: string | null;
  rssi: number | null;
  mtu: number;
  manufacturerData: Base64 | null;
  serviceUUIDs: UUID[] | null;
  serviceData: Record<UUID, Base64> | null;
  txPowerLevel: number | null;
  solicitedServiceUUIDs: UUID[] | null;
  overflowServiceUUIDs: UUID[] | null;
  localName: string | null;

  private _manager: BleManager;

  constructor(nativeDevice: NativeDevice, manager: BleManager) {
    this.id = nativeDevice.id;
    this.name = nativeDevice.name;
    this.rssi = nativeDevice.rssi;
    this.mtu = nativeDevice.mtu;
    this.manufacturerData = nativeDevice.manufacturerData;
    this.serviceUUIDs = nativeDevice.serviceUUIDs;
    this.serviceData = nativeDevice.serviceData;
    this.txPowerLevel = nativeDevice.txPowerLevel;
    this.solicitedServiceUUIDs = nativeDevice.solicitedServiceUUIDs;
    this.overflowServiceUUIDs = nativeDevice.overflowServiceUUIDs;
    this.localName = nativeDevice.localName;
    this._manager = manager;
  }

  async connect(options?: ConnectionOptions): Promise<Device> {
    return this._manager.connectToDevice(this.id, options);
  }

  async disconnect(): Promise<Device> {
    return this._manager.cancelDeviceConnection(this.id);
  }

  async isConnected(): Promise<boolean> {
    return this._manager.isDeviceConnected(this.id);
  }

  async discoverAllServicesAndCharacteristics(transactionId?: TransactionId): Promise<Device> {
    return this._manager.discoverAllServicesAndCharacteristicsForDevice(this.id, transactionId);
  }

  async services(): Promise<Service[]> {
    return this._manager.servicesForDevice(this.id);
  }

  async characteristics(serviceUUID: UUID): Promise<Characteristic[]> {
    return this._manager.characteristicsForDevice(this.id, serviceUUID);
  }

  async readCharacteristicForService(
    serviceUUID: UUID,
    characteristicUUID: UUID,
    transactionId?: TransactionId
  ): Promise<Characteristic> {
    return this._manager.readCharacteristicForDevice(
      this.id,
      serviceUUID,
      characteristicUUID,
      transactionId
    );
  }

  async writeCharacteristicWithResponseForService(
    serviceUUID: UUID,
    characteristicUUID: UUID,
    valueBase64: Base64,
    transactionId?: TransactionId
  ): Promise<Characteristic> {
    return this._manager.writeCharacteristicWithResponseForDevice(
      this.id,
      serviceUUID,
      characteristicUUID,
      valueBase64,
      transactionId
    );
  }

  async writeCharacteristicWithoutResponseForService(
    serviceUUID: UUID,
    characteristicUUID: UUID,
    valueBase64: Base64,
    transactionId?: TransactionId
  ): Promise<Characteristic> {
    return this._manager.writeCharacteristicWithoutResponseForDevice(
      this.id,
      serviceUUID,
      characteristicUUID,
      valueBase64,
      transactionId
    );
  }

  monitorCharacteristicForService(
    serviceUUID: UUID,
    characteristicUUID: UUID,
    listener: (error: Error | null, characteristic: Characteristic | null) => void,
    transactionId?: TransactionId
  ): Subscription {
    return this._manager.monitorCharacteristicForDevice(
      this.id,
      serviceUUID,
      characteristicUUID,
      listener,
      transactionId
    );
  }

  async readRSSI(transactionId?: TransactionId): Promise<Device> {
    return this._manager.readRSSIForDevice(this.id, transactionId);
  }

  async requestMTU(mtu: number, transactionId?: TransactionId): Promise<Device> {
    return this._manager.requestMTUForDevice(this.id, mtu, transactionId);
  }
}
