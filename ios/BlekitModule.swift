import ExpoModulesCore
import CoreBluetooth

public class BlekitModule: Module {
  private var manager: BlekitManager?

  public func definition() -> ModuleDefinition {
    Name("Blekit")

    // Event definition
    Events(
      "onStateChange",
      "onDeviceDiscovered",
      "onCharacteristicNotification",
      "onDeviceDisconnected",
      "onChange" // template compatibility
    )

    // Backwards compatibility template function
    Function("hello") {
      return "Hello world! 👋"
    }

    AsyncFunction("setValueAsync") { (value: String) in
      self.sendEvent("onChange", [
        "value": value
      ])
    }

    // Client lifecycle
    AsyncFunction("createClient") { (restoreIdentifier: String?, promise: Promise) in
      if self.manager == nil {
        self.manager = BlekitManager(module: self, restoreIdentifier: restoreIdentifier)
      }
      promise.resolve()
    }

    AsyncFunction("destroyClient") { (promise: Promise) in
      self.manager?.invalidate()
      self.manager = nil
      promise.resolve()
    }

    // State operations
    AsyncFunction("getBluetoothState") { (promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }
      let stateStr = manager.getBluetoothStateString(manager.centralManager.state)
      promise.resolve(stateStr)
    }

    AsyncFunction("enable") { (transactionId: String?, promise: Promise) in
      // iOS does not support enabling/disabling Bluetooth programmatically
      promise.reject("Unsupported", "Enabling bluetooth is unsupported on iOS")
    }

    AsyncFunction("disable") { (transactionId: String?, promise: Promise) in
      // iOS does not support enabling/disabling Bluetooth programmatically
      promise.reject("Unsupported", "Disabling bluetooth is unsupported on iOS")
    }

    // Logging
    AsyncFunction("setLogLevel") { (logLevel: String, promise: Promise) in
      // Stub
      promise.resolve(logLevel)
    }

    AsyncFunction("logLevel") { (promise: Promise) in
      promise.resolve("None")
    }

    // Transactions
    AsyncFunction("cancelTransaction") { (transactionId: String, promise: Promise) in
      if let manager = self.manager {
        if let cancelAction = manager.activeTransactions.removeValue(forKey: transactionId) {
          cancelAction()
        }
      }
      promise.resolve()
    }

    // Scanning
    AsyncFunction("startDeviceScan") { (filteredUUIDs: [String]?, options: [String: Any]?, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }
      
      if manager.centralManager.state != .poweredOn {
        promise.reject("BluetoothPoweredOff", "Bluetooth is not powered on.")
        return
      }

      var scanOptions: [String: Any] = [:]
      if let options = options {
        if let allowDuplicates = options["allowDuplicates"] as? Bool {
          scanOptions[CBCentralManagerScanOptionAllowDuplicatesKey] = allowDuplicates
        }
      }

      var serviceCBUUIDs: [CBUUID]? = nil
      if let filteredUUIDs = filteredUUIDs {
        serviceCBUUIDs = filteredUUIDs.compactMap { CBUUID(string: $0) }
      }

      manager.centralManager.scanForPeripherals(withServices: serviceCBUUIDs, options: scanOptions)
      manager.isScanning = true
      promise.resolve()
    }

    AsyncFunction("stopDeviceScan") { (promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }
      manager.centralManager.stopScan()
      manager.isScanning = false
      promise.resolve()
    }

    // Connections
    AsyncFunction("connectToDevice") { (deviceAddress: String, options: [String: Any]?, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }

      guard let uuid = UUID(uuidString: deviceAddress), let peripheral = manager.peripherals[uuid] else {
        promise.reject("DeviceNotFound", "Device \(deviceAddress) not found.")
        return
      }

      manager.connectionPromises[uuid] = (
        resolve: { result in promise.resolve(result) },
        reject: { err in promise.reject("ConnectionFailed", err) }
      )

      manager.centralManager.connect(peripheral, options: nil)
    }

    AsyncFunction("cancelDeviceConnection") { (deviceAddress: String, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }

      guard let uuid = UUID(uuidString: deviceAddress), let peripheral = manager.peripherals[uuid] else {
        promise.reject("DeviceNotFound", "Device \(deviceAddress) not found.")
        return
      }

      manager.connectionPromises[uuid] = (
        resolve: { result in promise.resolve(result) },
        reject: { err in promise.reject("DisconnectionFailed", err) }
      )

      manager.centralManager.cancelPeripheralConnection(peripheral)
    }

    AsyncFunction("isDeviceConnected") { (deviceAddress: String, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }

      guard let uuid = UUID(uuidString: deviceAddress), let peripheral = manager.peripherals[uuid] else {
        promise.resolve(false)
        return
      }

      promise.resolve(peripheral.state == .connected)
    }

    // Discovery
    AsyncFunction("discoverAllServicesAndCharacteristicsForDevice") { (deviceAddress: String, transactionId: String?, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }

      guard let uuid = UUID(uuidString: deviceAddress), let peripheral = manager.peripherals[uuid] else {
        promise.reject("DeviceNotFound", "Device \(deviceAddress) not found.")
        return
      }

      if peripheral.state != .connected {
        promise.reject("DeviceNotConnected", "Device is not connected.")
        return
      }

      manager.discoveryPromises[uuid] = (
        resolve: { result in promise.resolve(result) },
        reject: { err in promise.reject("DiscoveryFailed", err) }
      )

      if let transactionId = transactionId {
        manager.activeTransactions[transactionId] = {
          manager.discoveryPromises.removeValue(forKey: uuid)
          promise.reject("OperationCancelled", "Operation cancelled")
        }
      }

      peripheral.discoverServices(nil)
    }

    // Retrievals
    AsyncFunction("servicesForDevice") { (deviceAddress: String, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }

      guard let uuid = UUID(uuidString: deviceAddress), let peripheral = manager.peripherals[uuid] else {
        promise.reject("DeviceNotFound", "Device \(deviceAddress) not found.")
        return
      }

      guard let services = peripheral.services else {
        promise.resolve([])
        return
      }

      let list = services.map { manager.serializeService($0, for: peripheral) }
      promise.resolve(list)
    }

    AsyncFunction("characteristicsForDevice") { (deviceAddress: String, serviceUUID: String, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }

      guard let uuid = UUID(uuidString: deviceAddress), let peripheral = manager.peripherals[uuid] else {
        promise.reject("DeviceNotFound", "Device \(deviceAddress) not found.")
        return
      }

      guard let services = peripheral.services,
            let service = services.first(where: { $0.uuid.uuidString.lowercased() == serviceUUID.lowercased() }),
            let chars = service.characteristics else {
        promise.resolve([])
        return
      }

      let list = chars.map { manager.serializeCharacteristic($0, for: peripheral) }
      promise.resolve(list)
    }

    AsyncFunction("descriptorsForDevice") { (deviceAddress: String, serviceUUID: String, characteristicUUID: String, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }

      guard let uuid = UUID(uuidString: deviceAddress), let peripheral = manager.peripherals[uuid] else {
        promise.reject("DeviceNotFound", "Device \(deviceAddress) not found.")
        return
      }

      guard let services = peripheral.services,
            let service = services.first(where: { $0.uuid.uuidString.lowercased() == serviceUUID.lowercased() }),
            let chars = service.characteristics,
            let char = chars.first(where: { $0.uuid.uuidString.lowercased() == characteristicUUID.lowercased() }),
            let descs = char.descriptors else {
        promise.resolve([])
        return
      }

      let list = descs.map { manager.serializeDescriptor($0, for: peripheral) }
      promise.resolve(list)
    }

    // UUID-based GATT operations
    AsyncFunction("readCharacteristicForDevice") { (deviceAddress: String, serviceUUID: String, characteristicUUID: String, transactionId: String?, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }

      guard let uuid = UUID(uuidString: deviceAddress), let peripheral = manager.peripherals[uuid] else {
        promise.reject("DeviceNotFound", "Device \(deviceAddress) not found.")
        return
      }

      guard let services = peripheral.services,
            let service = services.first(where: { $0.uuid.uuidString.lowercased() == serviceUUID.lowercased() }),
            let chars = service.characteristics,
            let char = chars.first(where: { $0.uuid.uuidString.lowercased() == characteristicUUID.lowercased() }) else {
        promise.reject("CharacteristicNotFound", "Characteristic not found.")
        return
      }

      let charId = manager.getCharacteristicId(char, for: service, for: peripheral)
      manager.readCharPromises[charId] = (
        resolve: { result in promise.resolve(result) },
        reject: { err in promise.reject("ReadFailed", err) }
      )

      if let transactionId = transactionId {
        manager.activeTransactions[transactionId] = {
          manager.readCharPromises.removeValue(forKey: charId)
          promise.reject("OperationCancelled", "Operation cancelled")
        }
      }

      peripheral.readValue(for: char)
    }

    AsyncFunction("writeCharacteristicForDevice") { (deviceAddress: String, serviceUUID: String, characteristicUUID: String, valueBase64: String, withResponse: Bool, transactionId: String?, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }

      guard let uuid = UUID(uuidString: deviceAddress), let peripheral = manager.peripherals[uuid] else {
        promise.reject("DeviceNotFound", "Device \(deviceAddress) not found.")
        return
      }

      guard let services = peripheral.services,
            let service = services.first(where: { $0.uuid.uuidString.lowercased() == serviceUUID.lowercased() }),
            let chars = service.characteristics,
            let char = chars.first(where: { $0.uuid.uuidString.lowercased() == characteristicUUID.lowercased() }),
            let data = Data(base64Encoded: valueBase64) else {
        promise.reject("WriteFailed", "Invalid state or value.")
        return
      }

      let charId = manager.getCharacteristicId(char, for: service, for: peripheral)
      let writeType: CBCharacteristicWriteType = withResponse ? .withResponse : .withoutResponse

      if withResponse {
        manager.writeCharPromises[charId] = (
          resolve: { result in promise.resolve(result) },
          reject: { err in promise.reject("WriteFailed", err) }
        )

        if let transactionId = transactionId {
          manager.activeTransactions[transactionId] = {
            manager.writeCharPromises.removeValue(forKey: charId)
            promise.reject("OperationCancelled", "Operation cancelled")
          }
        }
      }

      peripheral.writeValue(data, for: char, type: writeType)

      if !withResponse {
        promise.resolve(manager.serializeCharacteristic(char, for: peripheral))
      }
    }

    AsyncFunction("monitorCharacteristicForDevice") { (deviceAddress: String, serviceUUID: String, characteristicUUID: String, transactionId: String?, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }

      guard let uuid = UUID(uuidString: deviceAddress), let peripheral = manager.peripherals[uuid] else {
        promise.reject("DeviceNotFound", "Device \(deviceAddress) not found.")
        return
      }

      guard let services = peripheral.services,
            let service = services.first(where: { $0.uuid.uuidString.lowercased() == serviceUUID.lowercased() }),
            let chars = service.characteristics,
            let char = chars.first(where: { $0.uuid.uuidString.lowercased() == characteristicUUID.lowercased() }) else {
        promise.reject("CharacteristicNotFound", "Characteristic not found.")
        return
      }

      let charId = manager.getCharacteristicId(char, for: service, for: peripheral)
      peripheral.setNotifyValue(true, for: char)

      if let transactionId = transactionId {
        manager.activeTransactions[transactionId] = {
          peripheral.setNotifyValue(false, for: char)
        }
      }

      promise.resolve(charId)
    }

    AsyncFunction("stopMonitoringCharacteristicForDevice") { (deviceAddress: String, serviceUUID: String, characteristicUUID: String, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }

      guard let uuid = UUID(uuidString: deviceAddress), let peripheral = manager.peripherals[uuid] else {
        promise.reject("DeviceNotFound", "Device \(deviceAddress) not found.")
        return
      }

      guard let services = peripheral.services,
            let service = services.first(where: { $0.uuid.uuidString.lowercased() == serviceUUID.lowercased() }),
            let chars = service.characteristics,
            let char = chars.first(where: { $0.uuid.uuidString.lowercased() == characteristicUUID.lowercased() }) else {
        promise.reject("CharacteristicNotFound", "Characteristic not found.")
        return
      }

      peripheral.setNotifyValue(false, for: char)
      promise.resolve()
    }

    // ID-based GATT operations
    AsyncFunction("readCharacteristic") { (characteristicId: Int, transactionId: String?, promise: Promise) in
      guard let manager = self.manager, let char = manager.characteristicsById[characteristicId] else {
        promise.reject("CharacteristicNotFound", "Characteristic \(characteristicId) not found.")
        return
      }

      guard let peripheral = manager.peripherals.values.first(where: { p in p.services?.contains(where: { s in s.characteristics?.contains(char) ?? false }) ?? false }) else {
        promise.reject("DeviceNotFound", "Device not found.")
        return
      }

      manager.readCharPromises[characteristicId] = (
        resolve: { result in promise.resolve(result) },
        reject: { err in promise.reject("ReadFailed", err) }
      )

      if let transactionId = transactionId {
        manager.activeTransactions[transactionId] = {
          manager.readCharPromises.removeValue(forKey: characteristicId)
          promise.reject("OperationCancelled", "Operation cancelled")
        }
      }

      peripheral.readValue(for: char)
    }

    AsyncFunction("writeCharacteristic") { (characteristicId: Int, valueBase64: String, withResponse: Bool, transactionId: String?, promise: Promise) in
      guard let manager = self.manager,
            let char = manager.characteristicsById[characteristicId],
            let data = Data(base64Encoded: valueBase64) else {
        promise.reject("WriteFailed", "Characteristic not found or invalid base64.")
        return
      }

      guard let peripheral = manager.peripherals.values.first(where: { p in p.services?.contains(where: { s in s.characteristics?.contains(char) ?? false }) ?? false }) else {
        promise.reject("DeviceNotFound", "Device not found.")
        return
      }

      let writeType: CBCharacteristicWriteType = withResponse ? .withResponse : .withoutResponse

      if withResponse {
        manager.writeCharPromises[characteristicId] = (
          resolve: { result in promise.resolve(result) },
          reject: { err in promise.reject("WriteFailed", err) }
        )

        if let transactionId = transactionId {
          manager.activeTransactions[transactionId] = {
            manager.writeCharPromises.removeValue(forKey: characteristicId)
            promise.reject("OperationCancelled", "Operation cancelled")
          }
        }
      }

      peripheral.writeValue(data, for: char, type: writeType)

      if !withResponse {
        promise.resolve(manager.serializeCharacteristic(char, for: peripheral))
      }
    }

    AsyncFunction("monitorCharacteristic") { (characteristicId: Int, transactionId: String?, promise: Promise) in
      guard let manager = self.manager, let char = manager.characteristicsById[characteristicId] else {
        promise.reject("CharacteristicNotFound", "Characteristic \(characteristicId) not found.")
        return
      }

      guard let peripheral = manager.peripherals.values.first(where: { p in p.services?.contains(where: { s in s.characteristics?.contains(char) ?? false }) ?? false }) else {
        promise.reject("DeviceNotFound", "Device not found.")
        return
      }

      peripheral.setNotifyValue(true, for: char)

      if let transactionId = transactionId {
        manager.activeTransactions[transactionId] = {
          peripheral.setNotifyValue(false, for: char)
        }
      }

      promise.resolve()
    }

    AsyncFunction("stopMonitoringCharacteristic") { (characteristicId: Int, promise: Promise) in
      guard let manager = self.manager, let char = manager.characteristicsById[characteristicId] else {
        promise.reject("CharacteristicNotFound", "Characteristic \(characteristicId) not found.")
        return
      }

      guard let peripheral = manager.peripherals.values.first(where: { p in p.services?.contains(where: { s in s.characteristics?.contains(char) ?? false }) ?? false }) else {
        promise.reject("DeviceNotFound", "Device not found.")
        return
      }

      peripheral.setNotifyValue(false, for: char)
      promise.resolve()
    }

    // Descriptor operations
    AsyncFunction("readDescriptorForDevice") { (deviceAddress: String, serviceUUID: String, characteristicUUID: String, descriptorUUID: String, transactionId: String?, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }

      guard let uuid = UUID(uuidString: deviceAddress), let peripheral = manager.peripherals[uuid] else {
        promise.reject("DeviceNotFound", "Device \(deviceAddress) not found.")
        return
      }

      guard let services = peripheral.services,
            let service = services.first(where: { $0.uuid.uuidString.lowercased() == serviceUUID.lowercased() }),
            let chars = service.characteristics,
            let char = chars.first(where: { $0.uuid.uuidString.lowercased() == characteristicUUID.lowercased() }),
            let descs = char.descriptors,
            let desc = descs.first(where: { $0.uuid.uuidString.lowercased() == descriptorUUID.lowercased() }) else {
        promise.reject("DescriptorNotFound", "Descriptor not found.")
        return
      }

      let descId = manager.getDescriptorId(desc, for: char, for: peripheral)
      manager.readDescPromises[descId] = (
        resolve: { result in promise.resolve(result) },
        reject: { err in promise.reject("ReadFailed", err) }
      )

      if let transactionId = transactionId {
        manager.activeTransactions[transactionId] = {
          manager.readDescPromises.removeValue(forKey: descId)
          promise.reject("OperationCancelled", "Operation cancelled")
        }
      }

      peripheral.readValue(for: desc)
    }

    AsyncFunction("writeDescriptorForDevice") { (deviceAddress: String, serviceUUID: String, characteristicUUID: String, descriptorUUID: String, valueBase64: String, transactionId: String?, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }

      guard let uuid = UUID(uuidString: deviceAddress), let peripheral = manager.peripherals[uuid] else {
        promise.reject("DeviceNotFound", "Device \(deviceAddress) not found.")
        return
      }

      guard let services = peripheral.services,
            let service = services.first(where: { $0.uuid.uuidString.lowercased() == serviceUUID.lowercased() }),
            let chars = service.characteristics,
            let char = chars.first(where: { $0.uuid.uuidString.lowercased() == characteristicUUID.lowercased() }),
            let descs = char.descriptors,
            let desc = descs.first(where: { $0.uuid.uuidString.lowercased() == descriptorUUID.lowercased() }),
            let data = Data(base64Encoded: valueBase64) else {
        promise.reject("WriteFailed", "Descriptor not found or invalid base64.")
        return
      }

      let descId = manager.getDescriptorId(desc, for: char, for: peripheral)
      manager.writeDescPromises[descId] = (
        resolve: { result in promise.resolve(result) },
        reject: { err in promise.reject("WriteFailed", err) }
      )

      if let transactionId = transactionId {
        manager.activeTransactions[transactionId] = {
          manager.writeDescPromises.removeValue(forKey: descId)
          promise.reject("OperationCancelled", "Operation cancelled")
        }
      }

      peripheral.writeValue(data, for: desc)
    }

    AsyncFunction("readDescriptor") { (descriptorId: Int, transactionId: String?, promise: Promise) in
      guard let manager = self.manager, let desc = manager.descriptorsById[descriptorId] else {
        promise.reject("DescriptorNotFound", "Descriptor \(descriptorId) not found.")
        return
      }

      guard let peripheral = manager.peripherals.values.first(where: { p in p.services?.contains(where: { s in s.characteristics?.contains(where: { c in c.descriptors?.contains(desc) ?? false }) ?? false }) ?? false }) else {
        promise.reject("DeviceNotFound", "Device not found.")
        return
      }

      manager.readDescPromises[descriptorId] = (
        resolve: { result in promise.resolve(result) },
        reject: { err in promise.reject("ReadFailed", err) }
      )

      if let transactionId = transactionId {
        manager.activeTransactions[transactionId] = {
          manager.readDescPromises.removeValue(forKey: descriptorId)
          promise.reject("OperationCancelled", "Operation cancelled")
        }
      }

      peripheral.readValue(for: desc)
    }

    AsyncFunction("writeDescriptor") { (descriptorId: Int, valueBase64: String, transactionId: String?, promise: Promise) in
      guard let manager = self.manager,
            let desc = manager.descriptorsById[descriptorId],
            let data = Data(base64Encoded: valueBase64) else {
        promise.reject("WriteFailed", "Descriptor not found or invalid base64.")
        return
      }

      guard let peripheral = manager.peripherals.values.first(where: { p in p.services?.contains(where: { s in s.characteristics?.contains(where: { c in c.descriptors?.contains(desc) ?? false }) ?? false }) ?? false }) else {
        promise.reject("DeviceNotFound", "Device not found.")
        return
      }

      manager.writeDescPromises[descriptorId] = (
        resolve: { result in promise.resolve(result) },
        reject: { err in promise.reject("WriteFailed", err) }
      )

      if let transactionId = transactionId {
        manager.activeTransactions[transactionId] = {
          manager.writeDescPromises.removeValue(forKey: descriptorId)
          promise.reject("OperationCancelled", "Operation cancelled")
        }
      }

      peripheral.writeValue(data, for: desc)
    }

    // Extras
    AsyncFunction("requestMTUForDevice") { (deviceAddress: String, mtu: Int, transactionId: String?, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }

      guard let uuid = UUID(uuidString: deviceAddress), let peripheral = manager.peripherals[uuid] else {
        promise.reject("DeviceNotFound", "Device \(deviceAddress) not found.")
        return
      }

      // iOS handles MTU negotiation automatically. We return the negotiated maximum write length without response.
      promise.resolve(manager.serializeDevice(peripheral, rssi: nil, advData: nil))
    }

    AsyncFunction("requestConnectionPriorityForDevice") { (deviceAddress: String, connectionPriority: Int, transactionId: String?, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }

      guard let uuid = UUID(uuidString: deviceAddress), let peripheral = manager.peripherals[uuid] else {
        promise.reject("DeviceNotFound", "Device \(deviceAddress) not found.")
        return
      }

      // iOS does not support programmatically setting connection priority. We just resolve.
      promise.resolve(manager.serializeDevice(peripheral, rssi: nil, advData: nil))
    }

    AsyncFunction("readRSSIForDevice") { (deviceAddress: String, transactionId: String?, promise: Promise) in
      guard let manager = self.manager else {
        promise.reject("BleManagerNotCreated", "BleManager was not created. Call createClient first.")
        return
      }

      guard let uuid = UUID(uuidString: deviceAddress), let peripheral = manager.peripherals[uuid] else {
        promise.reject("DeviceNotFound", "Device \(deviceAddress) not found.")
        return
      }

      manager.rssiPromises[uuid] = (
        resolve: { rssi in
          promise.resolve(manager.serializeDevice(peripheral, rssi: rssi, advData: nil))
        },
        reject: { err in
          promise.reject("RSSIReadFailed", err)
        }
      )

      if let transactionId = transactionId {
        manager.activeTransactions[transactionId] = {
          manager.rssiPromises.removeValue(forKey: uuid)
          promise.reject("OperationCancelled", "Operation cancelled")
        }
      }

      peripheral.readRSSI()
    }
  }
}

final class BlekitManager: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
  weak var module: BlekitModule?
  var centralManager: CBCentralManager!
  var peripherals: [UUID: CBPeripheral] = [:]
  var activeTransactions: [String: () -> Void] = [:]

  var connectionPromises: [UUID: (resolve: ([String: Any?]) -> Void, reject: (String) -> Void)] = [:]
  var discoveryPromises: [UUID: (resolve: ([String: Any?]) -> Void, reject: (String) -> Void)] = [:]
  var readCharPromises: [Int: (resolve: ([String: Any?]) -> Void, reject: (String) -> Void)] = [:]
  var writeCharPromises: [Int: (resolve: ([String: Any?]) -> Void, reject: (String) -> Void)] = [:]
  var readDescPromises: [Int: (resolve: ([String: Any?]) -> Void, reject: (String) -> Void)] = [:]
  var writeDescPromises: [Int: (resolve: ([String: Any?]) -> Void, reject: (String) -> Void)] = [:]
  var rssiPromises: [UUID: (resolve: (NSNumber) -> Void, reject: (String) -> Void)] = [:]

  var isScanning = false
  var characteristicsById: [Int: CBCharacteristic] = [:]
  var descriptorsById: [Int: CBDescriptor] = [:]

  private var servicesById: [Int: CBService] = [:]
  private var idsByObject = [ObjectIdentifier: Int]()
  private var nextId = 1
  private var advertisementDataByPeripheral: [UUID: [String: Any]] = [:]
  private var rssiByPeripheral: [UUID: NSNumber] = [:]
  private var pendingDiscoveryServices: [UUID: Set<ObjectIdentifier>] = [:]
  private var pendingDiscoveryCharacteristics: [UUID: Set<ObjectIdentifier>] = [:]

  init(module: BlekitModule, restoreIdentifier: String?) {
    self.module = module
    super.init()
    var options: [String: Any]? = nil
    if let restoreIdentifier = restoreIdentifier {
      options = [CBCentralManagerOptionRestoreIdentifierKey: restoreIdentifier]
    }
    centralManager = CBCentralManager(delegate: self, queue: nil, options: options)
  }

  func invalidate() {
    if isScanning {
      centralManager.stopScan()
    }
    for peripheral in peripherals.values where peripheral.state == .connected || peripheral.state == .connecting {
      centralManager.cancelPeripheralConnection(peripheral)
    }
    activeTransactions.removeAll()
    connectionPromises.removeAll()
    discoveryPromises.removeAll()
    readCharPromises.removeAll()
    writeCharPromises.removeAll()
    readDescPromises.removeAll()
    writeDescPromises.removeAll()
    rssiPromises.removeAll()
    pendingDiscoveryServices.removeAll()
    pendingDiscoveryCharacteristics.removeAll()
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    module?.sendEvent("onStateChange", ["state": getBluetoothStateString(central.state)])
  }

  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
    peripheral.delegate = self
    peripherals[peripheral.identifier] = peripheral
    advertisementDataByPeripheral[peripheral.identifier] = advertisementData
    rssiByPeripheral[peripheral.identifier] = RSSI
    module?.sendEvent("onDeviceDiscovered", [
      "device": serializeDevice(peripheral, rssi: RSSI, advData: advertisementData)
    ])
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    peripheral.delegate = self
    peripherals[peripheral.identifier] = peripheral
    connectionPromises.removeValue(forKey: peripheral.identifier)?.resolve(serializeDevice(peripheral, rssi: rssiByPeripheral[peripheral.identifier], advData: advertisementDataByPeripheral[peripheral.identifier]))
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    connectionPromises.removeValue(forKey: peripheral.identifier)?.reject(error?.localizedDescription ?? "Connection failed")
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    if let promise = connectionPromises.removeValue(forKey: peripheral.identifier) {
      promise.resolve(serializeDevice(peripheral, rssi: rssiByPeripheral[peripheral.identifier], advData: advertisementDataByPeripheral[peripheral.identifier]))
    }

    let errorMap: [String: Any?]? = error.map {
      [
        "errorCode": 201,
        "attErrorCode": nil,
        "iosErrorCode": ($0 as NSError).code,
        "androidErrorCode": nil,
        "reason": $0.localizedDescription,
        "deviceID": peripheral.identifier.uuidString
      ]
    }
    module?.sendEvent("onDeviceDisconnected", [
      "deviceId": peripheral.identifier.uuidString,
      "error": errorMap as Any
    ])
  }

  func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
    if let restored = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral] {
      for peripheral in restored {
        peripheral.delegate = self
        peripherals[peripheral.identifier] = peripheral
      }
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if let error = error {
      discoveryPromises.removeValue(forKey: peripheral.identifier)?.reject(error.localizedDescription)
      return
    }

    let services = peripheral.services ?? []
    if services.isEmpty {
      discoveryPromises.removeValue(forKey: peripheral.identifier)?.resolve(serializeDevice(peripheral, rssi: rssiByPeripheral[peripheral.identifier], advData: advertisementDataByPeripheral[peripheral.identifier]))
      return
    }

    pendingDiscoveryServices[peripheral.identifier] = Set(services.map { ObjectIdentifier($0) })
    for service in services {
      peripheral.discoverCharacteristics(nil, for: service)
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    if let error = error {
      discoveryPromises.removeValue(forKey: peripheral.identifier)?.reject(error.localizedDescription)
      return
    }

    for characteristic in service.characteristics ?? [] {
      _ = getCharacteristicId(characteristic, for: service, for: peripheral)
      peripheral.discoverDescriptors(for: characteristic)
    }

    pendingDiscoveryServices[peripheral.identifier]?.remove(ObjectIdentifier(service))
    let characteristics = service.characteristics ?? []
    if !characteristics.isEmpty {
      var pending = pendingDiscoveryCharacteristics[peripheral.identifier] ?? Set<ObjectIdentifier>()
      for characteristic in characteristics {
        pending.insert(ObjectIdentifier(characteristic))
      }
      pendingDiscoveryCharacteristics[peripheral.identifier] = pending
    }

    finishDiscoveryIfReady(for: peripheral)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverDescriptorsFor characteristic: CBCharacteristic, error: Error?) {
    if let error = error {
      discoveryPromises.removeValue(forKey: peripheral.identifier)?.reject(error.localizedDescription)
      return
    }

    for descriptor in characteristic.descriptors ?? [] {
      _ = getDescriptorId(descriptor, for: characteristic, for: peripheral)
    }
    pendingDiscoveryCharacteristics[peripheral.identifier]?.remove(ObjectIdentifier(characteristic))
    finishDiscoveryIfReady(for: peripheral)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    let charId = getCharacteristicId(characteristic, for: characteristic.service, for: peripheral)
    if let promise = readCharPromises.removeValue(forKey: charId) {
      if let error = error {
        promise.reject(error.localizedDescription)
      } else {
        promise.resolve(serializeCharacteristic(characteristic, for: peripheral))
      }
      return
    }

    let errorMap = error.map { bleError($0, code: 402, deviceID: peripheral.identifier.uuidString, characteristicUUID: characteristic.uuid.uuidString) }
    module?.sendEvent("onCharacteristicNotification", [
      "characteristicId": charId,
      "characteristic": serializeCharacteristic(characteristic, for: peripheral),
      "value": characteristic.value?.base64EncodedString(),
      "error": errorMap as Any
    ])
  }

  func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
    let charId = getCharacteristicId(characteristic, for: characteristic.service, for: peripheral)
    guard let promise = writeCharPromises.removeValue(forKey: charId) else { return }
    if let error = error {
      promise.reject(error.localizedDescription)
    } else {
      promise.resolve(serializeCharacteristic(characteristic, for: peripheral))
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor descriptor: CBDescriptor, error: Error?) {
    guard let characteristic = descriptor.characteristic else { return }
    let descId = getDescriptorId(descriptor, for: characteristic, for: peripheral)
    guard let promise = readDescPromises.removeValue(forKey: descId) else { return }
    if let error = error {
      promise.reject(error.localizedDescription)
    } else {
      promise.resolve(serializeDescriptor(descriptor, for: peripheral))
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didWriteValueFor descriptor: CBDescriptor, error: Error?) {
    guard let characteristic = descriptor.characteristic else { return }
    let descId = getDescriptorId(descriptor, for: characteristic, for: peripheral)
    guard let promise = writeDescPromises.removeValue(forKey: descId) else { return }
    if let error = error {
      promise.reject(error.localizedDescription)
    } else {
      promise.resolve(serializeDescriptor(descriptor, for: peripheral))
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didReadRSSI RSSI: NSNumber, error: Error?) {
    guard let promise = rssiPromises.removeValue(forKey: peripheral.identifier) else { return }
    if let error = error {
      promise.reject(error.localizedDescription)
    } else {
      rssiByPeripheral[peripheral.identifier] = RSSI
      promise.resolve(RSSI)
    }
  }

  func getBluetoothStateString(_ state: CBManagerState) -> String {
    switch state {
    case .unknown:
      return "Unknown"
    case .resetting:
      return "Resetting"
    case .unsupported:
      return "Unsupported"
    case .unauthorized:
      return "Unauthorized"
    case .poweredOff:
      return "PoweredOff"
    case .poweredOn:
      return "PoweredOn"
    @unknown default:
      return "Unknown"
    }
  }

  func serializeDevice(_ peripheral: CBPeripheral, rssi: NSNumber?, advData: [String: Any]?) -> [String: Any?] {
    let serviceUUIDs = (advData?[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID])?.map { $0.uuidString }
    let overflowUUIDs = (advData?[CBAdvertisementDataOverflowServiceUUIDsKey] as? [CBUUID])?.map { $0.uuidString }
    let solicitedUUIDs = (advData?[CBAdvertisementDataSolicitedServiceUUIDsKey] as? [CBUUID])?.map { $0.uuidString }
    let manufacturerData = (advData?[CBAdvertisementDataManufacturerDataKey] as? Data)?.base64EncodedString()
    let serviceData = (advData?[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data])?.reduce(into: [String: String]()) { result, item in
      result[item.key.uuidString] = item.value.base64EncodedString()
    }
    let localName = advData?[CBAdvertisementDataLocalNameKey] as? String
    let txPower = advData?[CBAdvertisementDataTxPowerLevelKey] as? NSNumber

    return [
      "id": peripheral.identifier.uuidString,
      "name": peripheral.name ?? localName,
      "rssi": rssi,
      "mtu": peripheral.maximumWriteValueLength(for: .withoutResponse),
      "manufacturerData": manufacturerData,
      "serviceUUIDs": serviceUUIDs,
      "serviceData": serviceData,
      "txPowerLevel": txPower,
      "solicitedServiceUUIDs": solicitedUUIDs,
      "overflowServiceUUIDs": overflowUUIDs,
      "localName": localName
    ]
  }

  func serializeService(_ service: CBService, for peripheral: CBPeripheral) -> [String: Any?] {
    return [
      "id": getServiceId(service),
      "uuid": service.uuid.uuidString,
      "deviceID": peripheral.identifier.uuidString,
      "isPrimary": service.isPrimary
    ]
  }

  func serializeCharacteristic(_ characteristic: CBCharacteristic, for peripheral: CBPeripheral) -> [String: Any?] {
    let props = characteristic.properties
    return [
      "id": getCharacteristicId(characteristic, for: characteristic.service, for: peripheral),
      "uuid": characteristic.uuid.uuidString,
      "serviceID": getServiceId(characteristic.service),
      "serviceUUID": characteristic.service.uuid.uuidString,
      "deviceID": peripheral.identifier.uuidString,
      "isReadable": props.contains(.read),
      "isWritableWithResponse": props.contains(.write),
      "isWritableWithoutResponse": props.contains(.writeWithoutResponse),
      "isNotifiable": props.contains(.notify),
      "isIndicatable": props.contains(.indicate),
      "value": characteristic.value?.base64EncodedString()
    ]
  }

  func serializeDescriptor(_ descriptor: CBDescriptor, for peripheral: CBPeripheral) -> [String: Any?] {
    guard let characteristic = descriptor.characteristic else {
      return [
        "id": getObjectId(descriptor),
        "uuid": descriptor.uuid.uuidString,
        "characteristicID": 0,
        "characteristicUUID": "",
        "serviceID": 0,
        "serviceUUID": "",
        "deviceID": peripheral.identifier.uuidString,
        "value": descriptorValueBase64(descriptor.value)
      ]
    }

    return [
      "id": getDescriptorId(descriptor, for: characteristic, for: peripheral),
      "uuid": descriptor.uuid.uuidString,
      "characteristicID": getCharacteristicId(characteristic, for: characteristic.service, for: peripheral),
      "characteristicUUID": characteristic.uuid.uuidString,
      "serviceID": getServiceId(characteristic.service),
      "serviceUUID": characteristic.service.uuid.uuidString,
      "deviceID": peripheral.identifier.uuidString,
      "value": descriptorValueBase64(descriptor.value)
    ]
  }

  func getCharacteristicId(_ characteristic: CBCharacteristic, for service: CBService, for peripheral: CBPeripheral) -> Int {
    let id = getObjectId(characteristic)
    characteristicsById[id] = characteristic
    _ = getServiceId(service)
    return id
  }

  func getDescriptorId(_ descriptor: CBDescriptor, for characteristic: CBCharacteristic, for peripheral: CBPeripheral) -> Int {
    let id = getObjectId(descriptor)
    descriptorsById[id] = descriptor
    _ = getCharacteristicId(characteristic, for: characteristic.service, for: peripheral)
    return id
  }

  private func getServiceId(_ service: CBService) -> Int {
    let id = getObjectId(service)
    servicesById[id] = service
    return id
  }

  private func getObjectId(_ object: AnyObject) -> Int {
    let key = ObjectIdentifier(object)
    if let id = idsByObject[key] {
      return id
    }
    let id = nextId
    nextId += 1
    idsByObject[key] = id
    return id
  }

  private func finishDiscoveryIfReady(for peripheral: CBPeripheral) {
    let servicePending = !(pendingDiscoveryServices[peripheral.identifier]?.isEmpty ?? true)
    let characteristicPending = !(pendingDiscoveryCharacteristics[peripheral.identifier]?.isEmpty ?? true)
    if !servicePending && !characteristicPending {
      pendingDiscoveryServices.removeValue(forKey: peripheral.identifier)
      pendingDiscoveryCharacteristics.removeValue(forKey: peripheral.identifier)
      discoveryPromises.removeValue(forKey: peripheral.identifier)?.resolve(serializeDevice(peripheral, rssi: rssiByPeripheral[peripheral.identifier], advData: advertisementDataByPeripheral[peripheral.identifier]))
    }
  }

  private func descriptorValueBase64(_ value: Any?) -> String? {
    if let data = value as? Data {
      return data.base64EncodedString()
    }
    if let string = value as? String {
      return string.data(using: .utf8)?.base64EncodedString()
    }
    if let number = value as? NSNumber {
      return "\(number)".data(using: .utf8)?.base64EncodedString()
    }
    return nil
  }

  private func bleError(_ error: Error, code: Int, deviceID: String? = nil, characteristicUUID: String? = nil) -> [String: Any?] {
    return [
      "errorCode": code,
      "attErrorCode": nil,
      "iosErrorCode": (error as NSError).code,
      "androidErrorCode": nil,
      "reason": error.localizedDescription,
      "deviceID": deviceID,
      "characteristicUUID": characteristicUUID
    ]
  }
}
