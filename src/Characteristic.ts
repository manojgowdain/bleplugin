import { BleManager } from './BleManager';
import { Base64, UUID, DeviceId, Identifier, TransactionId, Subscription } from './Blekit.types';
import { NativeCharacteristic } from './BlekitModule';
import { Descriptor } from './Descriptor';

export class Characteristic {
  id: Identifier;
  uuid: UUID;
  serviceID: Identifier;
  serviceUUID: UUID;
  deviceID: DeviceId;
  isReadable: boolean;
  isWritableWithResponse: boolean;
  isWritableWithoutResponse: boolean;
  isNotifiable: boolean;
  isIndicatable: boolean;
  value: Base64 | null;

  private _manager: BleManager;

  constructor(nativeCharacteristic: NativeCharacteristic, manager: BleManager) {
    this.id = nativeCharacteristic.id;
    this.uuid = nativeCharacteristic.uuid;
    this.serviceID = nativeCharacteristic.serviceID;
    this.serviceUUID = nativeCharacteristic.serviceUUID;
    this.deviceID = nativeCharacteristic.deviceID;
    this.isReadable = nativeCharacteristic.isReadable;
    this.isWritableWithResponse = nativeCharacteristic.isWritableWithResponse;
    this.isWritableWithoutResponse = nativeCharacteristic.isWritableWithoutResponse;
    this.isNotifiable = nativeCharacteristic.isNotifiable;
    this.isIndicatable = nativeCharacteristic.isIndicatable;
    this.value = nativeCharacteristic.value;
    this._manager = manager;
  }

  async read(transactionId?: TransactionId): Promise<Characteristic> {
    return this._manager.readCharacteristic(this.id, transactionId);
  }

  async writeWithResponse(
    valueBase64: Base64,
    transactionId?: TransactionId
  ): Promise<Characteristic> {
    return this._manager.writeCharacteristic(this.id, valueBase64, true, transactionId);
  }

  async writeWithoutResponse(
    valueBase64: Base64,
    transactionId?: TransactionId
  ): Promise<Characteristic> {
    return this._manager.writeCharacteristic(this.id, valueBase64, false, transactionId);
  }

  monitor(
    listener: (error: Error | null, characteristic: Characteristic | null) => void,
    transactionId?: TransactionId
  ): Subscription {
    return this._manager.monitorCharacteristic(this.id, listener, transactionId);
  }

  async descriptors(): Promise<Descriptor[]> {
    return this._manager.descriptorsForDevice(this.deviceID, this.serviceUUID, this.uuid);
  }

  async readDescriptor(descriptorUUID: UUID, transactionId?: TransactionId): Promise<Descriptor> {
    return this._manager.readDescriptorForDevice(
      this.deviceID,
      this.serviceUUID,
      this.uuid,
      descriptorUUID,
      transactionId
    );
  }

  async writeDescriptor(
    descriptorUUID: UUID,
    valueBase64: Base64,
    transactionId?: TransactionId
  ): Promise<Descriptor> {
    return this._manager.writeDescriptorForDevice(
      this.deviceID,
      this.serviceUUID,
      this.uuid,
      descriptorUUID,
      valueBase64,
      transactionId
    );
  }
}
