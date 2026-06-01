import ExpoModulesCore
import CoreBluetooth

private let moduleName = "ExpoDeviceInfo"
private let clientCharacteristicConfigUUID = CBUUID(string: "2902")

public final class DeviceInfoModule: Module {
  private var centralManager: CBCentralManager?
  private lazy var bluetoothDelegate = BluetoothDelegateProxy(module: self)
  private var peripheralsById: [String: CBPeripheral] = [:]
  private var notificationKeys: Set<String> = []
  private var pendingConnects: [String: CheckedContinuation<Void, Error>] = [:]
  private var pendingReads: [String: CheckedContinuation<[Int], Error>] = [:]
  private var pendingWrites: [String: CheckedContinuation<Void, Error>] = [:]

  public func definition() -> ModuleDefinition {
    Name(moduleName)

    Events(
      "deviceFound",
      "connected",
      "disconnected",
      "characteristicChanged",
      "bluetoothStateChanged",
      "error"
    )

    OnCreate {
      self.ensureCentralManager()
    }

    OnDestroy {
      self.centralManager?.stopScan()
      self.centralManager = nil
      self.peripheralsById.removeAll()
      self.notificationKeys.removeAll()
      self.pendingConnects.values.forEach { $0.resume(throwing: BLEError(message: "Module destroyed.")) }
      self.pendingReads.values.forEach { $0.resume(throwing: BLEError(message: "Module destroyed.")) }
      self.pendingWrites.values.forEach { $0.resume(throwing: BLEError(message: "Module destroyed.")) }
      self.pendingConnects.removeAll()
      self.pendingReads.removeAll()
      self.pendingWrites.removeAll()
    }

    AsyncFunction("requestPermissions") {
      self.makePermissionResponse()
    }

    AsyncFunction("isEnabled") {
      self.centralManager?.state == .poweredOn
    }

    AsyncFunction("startScan") { (_ options: [String: Any]?) in
      try await self.startScan(options: options)
    }

    Function("stopScan") {
      self.centralManager?.stopScan()
    }

    AsyncFunction("connect") { (deviceId: String) in
      try await self.connect(deviceId: deviceId)
    }

    AsyncFunction("disconnect") { (deviceId: String) in
      self.disconnect(deviceId: deviceId)
    }

    AsyncFunction("read") { (deviceId: String, serviceUUID: String, characteristicUUID: String) in
      try await self.read(deviceId: deviceId, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID)
    }

    AsyncFunction("write") { (deviceId: String, serviceUUID: String, characteristicUUID: String, value: [Int]) in
      try await self.write(deviceId: deviceId, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID, value: value)
    }

    AsyncFunction("startNotifications") { (deviceId: String, serviceUUID: String, characteristicUUID: String) in
      try await self.startNotifications(deviceId: deviceId, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID)
    }

    AsyncFunction("stopNotifications") { (deviceId: String, serviceUUID: String, characteristicUUID: String) in
      self.stopNotifications(deviceId: deviceId, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID)
    }
  }

  private func ensureCentralManager() {
    if centralManager == nil {
      centralManager = CBCentralManager(delegate: bluetoothDelegate, queue: .main)
    }
  }

  private func makePermissionResponse() -> [String: Any] {
    let granted = CBCentralManager.authorization == .allowedAlways || CBCentralManager.authorization == .restricted || CBCentralManager.authorization == .notDetermined
    return [
      "status": granted ? "granted" : "denied",
      "granted": granted,
      "canAskAgain": true,
      "expires": "never"
    ]
  }

  private func emitBluetoothState() {
    self.sendEvent("bluetoothStateChanged", [
      "available": true,
      "poweredOn": self.centralManager?.state == .poweredOn
    ])
  }

  private func emitError(_ error: Error) {
    self.sendEvent("error", [
      "code": "ble_error",
      "message": error.localizedDescription,
      "details": error.localizedDescription
    ])
  }

  private func startScan(options: [String: Any]?) async throws {
    self.ensureCentralManager()
    guard let centralManager else {
      throw BLEError(message: "Bluetooth central manager is unavailable.")
    }

    if centralManager.state != .poweredOn {
      throw BLEError(message: "Bluetooth is not powered on.")
    }

    let allowDuplicates = options?["allowDuplicates"] as? Bool ?? false
    centralManager.scanForPeripherals(withServices: nil, options: [
      CBCentralManagerScanOptionAllowDuplicatesKey: allowDuplicates
    ])
  }

  private func connect(deviceId: String) async throws {
    let peripheral = try self.getPeripheral(deviceId: deviceId)
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      self.pendingConnects[deviceId] = continuation
      self.centralManager?.connect(peripheral, options: nil)
    }
  }

  private func disconnect(deviceId: String) {
    guard let peripheral = peripheralsById[deviceId] else { return }
    centralManager?.cancelPeripheralConnection(peripheral)
  }

  private func read(deviceId: String, serviceUUID: String, characteristicUUID: String) async throws -> [Int] {
    let peripheral = try getPeripheral(deviceId: deviceId)
    let characteristic = try await ensureCharacteristic(
      peripheral: peripheral,
      deviceId: deviceId,
      serviceUUID: serviceUUID,
      characteristicUUID: characteristicUUID
    )
    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[Int], Error>) in
      self.pendingReads[characteristicKey(deviceId: deviceId, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID)] = continuation
      peripheral.readValue(for: characteristic)
    }
  }

  private func write(deviceId: String, serviceUUID: String, characteristicUUID: String, value: [Int]) async throws {
    let peripheral = try getPeripheral(deviceId: deviceId)
    let characteristic = try await ensureCharacteristic(
      peripheral: peripheral,
      deviceId: deviceId,
      serviceUUID: serviceUUID,
      characteristicUUID: characteristicUUID
    )
    let data = Data(value.map { UInt8($0 & 0xff) })
    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      self.pendingWrites[self.characteristicKey(deviceId: deviceId, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID)] = continuation
      peripheral.writeValue(data, for: characteristic, type: .withResponse)
    }
  }

  private func startNotifications(deviceId: String, serviceUUID: String, characteristicUUID: String) async throws {
    let peripheral = try getPeripheral(deviceId: deviceId)
    let characteristic = try await ensureCharacteristic(
      peripheral: peripheral,
      deviceId: deviceId,
      serviceUUID: serviceUUID,
      characteristicUUID: characteristicUUID
    )
    peripheral.setNotifyValue(true, for: characteristic)
    notificationKeys.insert(characteristicKey(deviceId: deviceId, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID))
  }

  private func stopNotifications(deviceId: String, serviceUUID: String, characteristicUUID: String) {
    guard let peripheral = peripheralsById[deviceId] else {
      return
    }

    guard let characteristic = characteristic(deviceId: deviceId, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID) else {
      return
    }
    peripheral.setNotifyValue(false, for: characteristic)
    notificationKeys.remove(characteristicKey(deviceId: deviceId, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID))
  }

  private func ensureCharacteristic(peripheral: CBPeripheral, deviceId: String, serviceUUID: String, characteristicUUID: String) async throws -> CBCharacteristic {
    if let characteristic = characteristic(deviceId: deviceId, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID) {
      return characteristic
    }

    peripheral.delegate = bluetoothDelegate

    return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<CBCharacteristic, Error>) in
      let key = characteristicKey(deviceId: deviceId, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID)
      peripheralDiscoverCallbacks[key] = continuation

      let serviceCBUUID = CBUUID(string: serviceUUID)
      if peripheral.services == nil {
        peripheral.discoverServices([serviceCBUUID])
      } else if let service = peripheral.services?.first(where: { $0.uuid == serviceCBUUID }) {
        peripheral.discoverCharacteristics([CBUUID(string: characteristicUUID)], for: service)
      } else {
        peripheral.discoverServices([serviceCBUUID])
      }
    }
  }

  private var peripheralDiscoverCallbacks: [String: CheckedContinuation<CBCharacteristic, Error>] = [:]

  private func characteristic(deviceId: String, serviceUUID: String, characteristicUUID: String) -> CBCharacteristic? {
    guard let peripheral = peripheralsById[deviceId], let service = peripheral.services?.first(where: { $0.uuid == CBUUID(string: serviceUUID) }) else {
      return nil
    }
    return service.characteristics?.first(where: { $0.uuid == CBUUID(string: characteristicUUID) })
  }

  private func getPeripheral(deviceId: String) throws -> CBPeripheral {
    if let peripheral = peripheralsById[deviceId] {
      return peripheral
    }
    guard let uuid = UUID(uuidString: deviceId) else {
      throw BLEError(message: "Device \(deviceId) is not available. Start a scan first.")
    }

    let peripherals = centralManager?.retrievePeripherals(withIdentifiers: [uuid]) ?? []
    guard let peripheral = peripherals.first else {
      throw BLEError(message: "Device \(deviceId) is not available. Start a scan first.")
    }
    peripheral.delegate = bluetoothDelegate
    peripheralsById[deviceId] = peripheral
    return peripheral
  }

  private func characteristicKey(deviceId: String, serviceUUID: String, characteristicUUID: String) -> String {
    "\(deviceId):\(serviceUUID):\(characteristicUUID)"
  }

  fileprivate func centralManagerDidUpdateState(_ central: CBCentralManager) {
    self.emitBluetoothState()
  }

  fileprivate func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
    peripheralsById[peripheral.identifier.uuidString] = peripheral
    peripheral.delegate = bluetoothDelegate
    self.sendEvent("deviceFound", [
      "id": peripheral.identifier.uuidString,
      "name": peripheral.name ?? NSNull(),
      "connected": false,
      "services": []
    ])
  }

  fileprivate func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    peripheralsById[peripheral.identifier.uuidString] = peripheral
    peripheral.delegate = bluetoothDelegate
    self.sendEvent("connected", ["deviceId": peripheral.identifier.uuidString, "connected": true])
    pendingConnects.removeValue(forKey: peripheral.identifier.uuidString)?.resume()
  }

  fileprivate func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    let failure = error ?? BLEError(message: "Failed to connect to \(peripheral.identifier.uuidString).")
    pendingConnects.removeValue(forKey: peripheral.identifier.uuidString)?.resume(throwing: failure)
    emitError(failure)
  }

  fileprivate func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    self.sendEvent("disconnected", ["deviceId": peripheral.identifier.uuidString, "connected": false])
  }

  fileprivate func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if let error {
      emitError(error)
      return
    }

    guard let services = peripheral.services else { return }
    for service in services {
      let expectedKeyPrefix = "\(peripheral.identifier.uuidString):\(service.uuid.uuidString.lowercased())"
      let requestedCharacteristics = peripheralDiscoverCallbacks.keys.compactMap { key -> CBUUID? in
        guard key.hasPrefix(expectedKeyPrefix) else { return nil }
        let components = key.split(separator: ":")
        guard components.count == 3 else { return nil }
        return CBUUID(string: String(components[2]))
      }
      if !requestedCharacteristics.isEmpty {
        peripheral.discoverCharacteristics(requestedCharacteristics, for: service)
      }
    }
  }

  fileprivate func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    if let error {
      emitError(error)
      return
    }

    guard let characteristics = service.characteristics else { return }
    for characteristic in characteristics {
      let key = characteristicKey(deviceId: peripheral.identifier.uuidString, serviceUUID: service.uuid.uuidString.lowercased(), characteristicUUID: characteristic.uuid.uuidString.lowercased())
      if let continuation = peripheralDiscoverCallbacks.removeValue(forKey: key) {
        continuation.resume(returning: characteristic)
      }

      if notificationKeys.contains(key), characteristic.isNotifying {
        continue
      }
    }
  }

  fileprivate func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    if let error {
      emitError(error)
      return
    }

    guard let service = characteristic.service else {
      emitError(BLEError(message: "Characteristic service is unavailable."))
      return
    }

    let key = characteristicKey(deviceId: peripheral.identifier.uuidString, serviceUUID: service.uuid.uuidString.lowercased(), characteristicUUID: characteristic.uuid.uuidString.lowercased())
    let bytes = characteristic.value?.map { Int($0) } ?? []
    sendEvent("characteristicChanged", [
      "deviceId": peripheral.identifier.uuidString,
      "serviceUUID": service.uuid.uuidString.lowercased(),
      "characteristicUUID": characteristic.uuid.uuidString.lowercased(),
      "value": bytes
    ])

    if let continuation = pendingReads.removeValue(forKey: key) {
      continuation.resume(returning: bytes)
    }
  }

  fileprivate func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
    guard let service = characteristic.service else {
      emitError(BLEError(message: "Characteristic service is unavailable."))
      return
    }

    let key = characteristicKey(deviceId: peripheral.identifier.uuidString, serviceUUID: service.uuid.uuidString.lowercased(), characteristicUUID: characteristic.uuid.uuidString.lowercased())
    if let error {
      pendingWrites.removeValue(forKey: key)?.resume(throwing: error)
      emitError(error)
      return
    }

    pendingWrites.removeValue(forKey: key)?.resume()
  }
}

private struct BLEError: LocalizedError {
  let message: String

  var errorDescription: String? {
    message
  }
}

private final class BluetoothDelegateProxy: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
  private unowned let module: DeviceInfoModule

  init(module: DeviceInfoModule) {
    self.module = module
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    module.centralManagerDidUpdateState(central)
  }

  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
    module.centralManager(central, didDiscover: peripheral, advertisementData: advertisementData, rssi: RSSI)
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    module.centralManager(central, didConnect: peripheral)
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    module.centralManager(central, didFailToConnect: peripheral, error: error)
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    module.centralManager(central, didDisconnectPeripheral: peripheral, error: error)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    module.peripheral(peripheral, didDiscoverServices: error)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    module.peripheral(peripheral, didDiscoverCharacteristicsFor: service, error: error)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    module.peripheral(peripheral, didUpdateValueFor: characteristic, error: error)
  }

  func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
    module.peripheral(peripheral, didWriteValueFor: characteristic, error: error)
  }
}