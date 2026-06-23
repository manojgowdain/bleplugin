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
