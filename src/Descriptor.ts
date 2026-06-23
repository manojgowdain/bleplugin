import { BleManager } from './BleManager';
import { Base64, UUID, DeviceId, Identifier, TransactionId } from './Blekit.types';
import { NativeDescriptor } from './BlekitModule';

export class Descriptor {
  id: Identifier;
  uuid: UUID;
  characteristicID: Identifier;
  characteristicUUID: UUID;
  serviceID: Identifier;
  serviceUUID: UUID;
  deviceID: DeviceId;
  value: Base64 | null;

  private _manager: BleManager;

  constructor(nativeDescriptor: NativeDescriptor, manager: BleManager) {
    this.id = nativeDescriptor.id;
    this.uuid = nativeDescriptor.uuid;
    this.characteristicID = nativeDescriptor.characteristicID;
    this.characteristicUUID = nativeDescriptor.characteristicUUID;
    this.serviceID = nativeDescriptor.serviceID;
    this.serviceUUID = nativeDescriptor.serviceUUID;
    this.deviceID = nativeDescriptor.deviceID;
    this.value = nativeDescriptor.value;
    this._manager = manager;
  }

  async read(transactionId?: TransactionId): Promise<Descriptor> {
    return this._manager.readDescriptor(this.id, transactionId);
  }

  async write(valueBase64: Base64, transactionId?: TransactionId): Promise<Descriptor> {
    return this._manager.writeDescriptor(this.id, valueBase64, transactionId);
  }
}
