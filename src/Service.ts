import { BleManager } from './BleManager';
import { Base64, UUID, DeviceId, Identifier, TransactionId, Subscription } from './Blekit.types';
import { NativeService } from './BlekitModule';
import { Characteristic } from './Characteristic';

export class Service {
  id: Identifier;
  uuid: UUID;
  deviceID: DeviceId;
  isPrimary: boolean;

  private _manager: BleManager;

  constructor(nativeService: NativeService, manager: BleManager) {
    this.id = nativeService.id;
    this.uuid = nativeService.uuid;
    this.deviceID = nativeService.deviceID;
    this.isPrimary = nativeService.isPrimary;
    this._manager = manager;
  }

  async characteristics(): Promise<Characteristic[]> {
    return this._manager.characteristicsForDevice(this.deviceID, this.uuid);
  }

  async readCharacteristic(
    characteristicUUID: UUID,
    transactionId?: TransactionId
  ): Promise<Characteristic> {
    return this._manager.readCharacteristicForDevice(
      this.deviceID,
      this.uuid,
      characteristicUUID,
      transactionId
    );
  }

  async writeCharacteristicWithResponse(
    characteristicUUID: UUID,
    valueBase64: Base64,
    transactionId?: TransactionId
  ): Promise<Characteristic> {
    return this._manager.writeCharacteristicWithResponseForDevice(
      this.deviceID,
      this.uuid,
      characteristicUUID,
      valueBase64,
      transactionId
    );
  }

  async writeCharacteristicWithoutResponse(
    characteristicUUID: UUID,
    valueBase64: Base64,
    transactionId?: TransactionId
  ): Promise<Characteristic> {
    return this._manager.writeCharacteristicWithoutResponseForDevice(
      this.deviceID,
      this.uuid,
      characteristicUUID,
      valueBase64,
      transactionId
    );
  }

  monitorCharacteristic(
    characteristicUUID: UUID,
    listener: (error: Error | null, characteristic: Characteristic | null) => void,
    transactionId?: TransactionId
  ): Subscription {
    return this._manager.monitorCharacteristicForDevice(
      this.deviceID,
      this.uuid,
      characteristicUUID,
      listener,
      transactionId
    );
  }
}
