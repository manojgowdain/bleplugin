package expo.modules.blekit

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class BlekitModule : Module() {

  private var bluetoothManager: BluetoothManager? = null
  private var bluetoothAdapter: BluetoothAdapter? = null
  private var bluetoothLeScanner: BluetoothLeScanner? = null

  private val scannedDevices = ConcurrentHashMap<String, BluetoothDevice>()
  private val activeGatts = ConcurrentHashMap<String, BluetoothGatt>()
  private val deviceMtus = ConcurrentHashMap<String, Int>()

  // Counters and ID maps for GATT objects
  private val servicesMap = ConcurrentHashMap<Int, BluetoothGattService>()
  private val characteristicsMap = ConcurrentHashMap<Int, BluetoothGattCharacteristic>()
  private val descriptorsMap = ConcurrentHashMap<Int, BluetoothGattDescriptor>()
  private var nextId = 1

  // Async promises
  private val connectionPromises = ConcurrentHashMap<String, Promise>()
  private val discoveryPromises = ConcurrentHashMap<String, Promise>()
  private val readCharPromises = ConcurrentHashMap<Int, Promise>()
  private val writeCharPromises = ConcurrentHashMap<Int, Promise>()
  private val readDescPromises = ConcurrentHashMap<Int, Promise>()
  private val writeDescPromises = ConcurrentHashMap<Int, Promise>()
  private val rssiPromises = ConcurrentHashMap<String, Promise>()
  private val mtuPromises = ConcurrentHashMap<String, Promise>()

  private val activeTransactions = ConcurrentHashMap<String, () -> Unit>()

  private var isScanning = false
  private var scanCallback: ScanCallback? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  @Synchronized
  private fun getServiceId(service: BluetoothGattService): Int {
    for ((id, s) in servicesMap) {
      if (s === service) return id
    }
    val id = nextId++
    servicesMap[id] = service
    return id
  }

  @Synchronized
  private fun getCharacteristicId(characteristic: BluetoothGattCharacteristic): Int {
    for ((id, c) in characteristicsMap) {
      if (c === characteristic) return id
    }
    val id = nextId++
    characteristicsMap[id] = characteristic
    return id
  }

  @Synchronized
  private fun getDescriptorId(descriptor: BluetoothGattDescriptor): Int {
    for ((id, d) in descriptorsMap) {
      if (d === descriptor) return id
    }
    val id = nextId++
    descriptorsMap[id] = descriptor
    return id
  }

  override fun definition() = ModuleDefinition {
    Name("Blekit")

    Events(
      "onStateChange",
      "onDeviceDiscovered",
      "onCharacteristicNotification",
      "onDeviceDisconnected",
      "onChange"
    )

    Function("hello") {
      "Hello world! 👋"
    }

    AsyncFunction("setValueAsync") { value: String ->
      sendEvent("onChange", mapOf(
        "value" to value
      ))
    }

    AsyncFunction("createClient") { restoreIdentifier: String?, promise: Promise ->
      val context = appContext.reactContext ?: appContext.reactContext?.applicationContext
      if (context == null) {
        promise.reject("ContextUnavailable", "Android context is unavailable", null)
        return@AsyncFunction
      }
      bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      bluetoothAdapter = bluetoothManager?.adapter
      promise.resolve()
    }

    AsyncFunction("destroyClient") { promise: Promise ->
      stopScanInternal()
      for ((_, gatt) in activeGatts) {
        gatt.disconnect()
        gatt.close()
      }
      activeGatts.clear()
      scannedDevices.clear()
      deviceMtus.clear()
      servicesMap.clear()
      characteristicsMap.clear()
      descriptorsMap.clear()
      promise.resolve()
    }

    AsyncFunction("getBluetoothState") { promise: Promise ->
      promise.resolve(getBluetoothStateString())
    }

    AsyncFunction("enable") { transactionId: String?, promise: Promise ->
      // Standard Android method to enable bluetooth programmatically (deprecated in newer SDKs, but supported here)
      @Suppress("DEPRECATION")
      if (bluetoothAdapter?.enable() == true) {
        promise.resolve(getBluetoothStateString())
      } else {
        promise.reject("EnableFailed", "Failed to enable Bluetooth", null)
      }
    }

    AsyncFunction("disable") { transactionId: String?, promise: Promise ->
      @Suppress("DEPRECATION")
      if (bluetoothAdapter?.disable() == true) {
        promise.resolve(getBluetoothStateString())
      } else {
        promise.reject("DisableFailed", "Failed to disable Bluetooth", null)
      }
    }

    AsyncFunction("setLogLevel") { logLevel: String, promise: Promise ->
      promise.resolve(logLevel)
    }

    AsyncFunction("logLevel") { promise: Promise ->
      promise.resolve("None")
    }

    AsyncFunction("cancelTransaction") { transactionId: String, promise: Promise ->
      activeTransactions.remove(transactionId)?.invoke()
      promise.resolve()
    }

    AsyncFunction("startDeviceScan") { filteredUUIDs: List<String>?, options: Map<String, Any>?, promise: Promise ->
      val adapter = bluetoothAdapter
      if (adapter == null || !adapter.isEnabled) {
        promise.reject("BluetoothPoweredOff", "Bluetooth is powered off or unavailable", null)
        return@AsyncFunction
      }

      bluetoothLeScanner = adapter.bluetoothLeScanner
      val scanner = bluetoothLeScanner
      if (scanner == null) {
        promise.reject("ScanStartFailed", "LeScanner not available", null)
        return@AsyncFunction
      }

      stopScanInternal()

      val filters = mutableListOf<ScanFilter>()
      if (filteredUUIDs != null) {
        for (uuidStr in filteredUUIDs) {
          filters.add(ScanFilter.Builder().setServiceUuid(ParcelUuid.fromString(uuidStr)).build())
        }
      }

      val scanMode = when ((options?.get("scanMode") as? Double)?.toInt()) {
        -1 -> ScanSettings.SCAN_MODE_OPPORTUNISTIC
        1 -> ScanSettings.SCAN_MODE_BALANCED
        2 -> ScanSettings.SCAN_MODE_LOW_LATENCY
        else -> ScanSettings.SCAN_MODE_LOW_POWER
      }

      val settings = ScanSettings.Builder()
        .setScanMode(scanMode)
        .build()

      scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
          val device = result.device
          scannedDevices[device.address] = device
          val devMap = serializeDevice(device, result.rssi, result.scanRecord)
          sendEvent("onDeviceDiscovered", mapOf("device" to devMap))
        }

        override fun onScanFailed(errorCode: Int) {
          // Can report failure
        }
      }

      scanner.startScan(filters, settings, scanCallback)
      isScanning = true
      promise.resolve()
    }

    AsyncFunction("stopDeviceScan") { promise: Promise ->
      stopScanInternal()
      promise.resolve()
    }

    AsyncFunction("connectToDevice") { deviceAddress: String, options: Map<String, Any>?, promise: Promise ->
      val context = appContext.reactContext ?: appContext.reactContext?.applicationContext
      val adapter = bluetoothAdapter
      if (context == null || adapter == null) {
        promise.reject("BluetoothUnavailable", "Bluetooth unavailable", null)
        return@AsyncFunction
      }

      val device = scannedDevices[deviceAddress] ?: adapter.getRemoteDevice(deviceAddress)
      if (device == null) {
        promise.reject("DeviceNotFound", "Device $deviceAddress not found", null)
        return@AsyncFunction
      }

      val autoConnect = options?.get("autoConnect") as? Boolean ?: false

      connectionPromises[deviceAddress] = promise

      mainHandler.post {
        val gatt = device.connectGatt(context, autoConnect, gattCallback, BluetoothDevice.TRANSPORT_LE)
        if (gatt != null) {
          activeGatts[deviceAddress] = gatt
        } else {
          connectionPromises.remove(deviceAddress)
          promise.reject("ConnectionFailed", "connectGatt returned null", null)
        }
      }
    }

    AsyncFunction("cancelDeviceConnection") { deviceAddress: String, promise: Promise ->
      val gatt = activeGatts[deviceAddress]
      if (gatt == null) {
        promise.reject("DeviceNotConnected", "Device $deviceAddress is not connected", null)
        return@AsyncFunction
      }
      connectionPromises[deviceAddress] = promise
      gatt.disconnect()
    }

    AsyncFunction("isDeviceConnected") { deviceAddress: String, promise: Promise ->
      val manager = bluetoothManager
      val adapter = bluetoothAdapter
      if (manager == null || adapter == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      val device = adapter.getRemoteDevice(deviceAddress)
      val state = manager.getConnectionState(device, BluetoothProfile.GATT)
      promise.resolve(state == BluetoothProfile.STATE_CONNECTED)
    }

    AsyncFunction("discoverAllServicesAndCharacteristicsForDevice") { deviceAddress: String, transactionId: String?, promise: Promise ->
      val gatt = activeGatts[deviceAddress]
      if (gatt == null) {
        promise.reject("DeviceNotConnected", "Device $deviceAddress is not connected", null)
        return@AsyncFunction
      }

      discoveryPromises[deviceAddress] = promise

      if (transactionId != null) {
        activeTransactions[transactionId] = {
          discoveryPromises.remove(deviceAddress)
          promise.reject("OperationCancelled", "Operation cancelled", null)
        }
      }

      mainHandler.post {
        if (!gatt.discoverServices()) {
          discoveryPromises.remove(deviceAddress)
          promise.reject("DiscoveryFailed", "Failed to start service discovery", null)
        }
      }
    }

    AsyncFunction("servicesForDevice") { deviceAddress: String, promise: Promise ->
      val gatt = activeGatts[deviceAddress]
      if (gatt == null) {
        promise.reject("DeviceNotConnected", "Device $deviceAddress not connected", null)
        return@AsyncFunction
      }
      val list = gatt.services.map { serializeService(it, deviceAddress) }
      promise.resolve(list)
    }

    AsyncFunction("characteristicsForDevice") { deviceAddress: String, serviceUUID: String, promise: Promise ->
      val gatt = activeGatts[deviceAddress]
      if (gatt == null) {
        promise.reject("DeviceNotConnected", "Device $deviceAddress not connected", null)
        return@AsyncFunction
      }
      val service = gatt.getService(UUID.fromString(serviceUUID))
      if (service == null) {
        promise.reject("ServiceNotFound", "Service $serviceUUID not found", null)
        return@AsyncFunction
      }
      val list = service.characteristics.map { serializeCharacteristic(it, service, deviceAddress) }
      promise.resolve(list)
    }

    AsyncFunction("descriptorsForDevice") { deviceAddress: String, serviceUUID: String, characteristicUUID: String, promise: Promise ->
      val gatt = activeGatts[deviceAddress]
      if (gatt == null) {
        promise.reject("DeviceNotConnected", "Device $deviceAddress not connected", null)
        return@AsyncFunction
      }
      val service = gatt.getService(UUID.fromString(serviceUUID))
      val characteristic = service?.getCharacteristic(UUID.fromString(characteristicUUID))
      if (characteristic == null) {
        promise.reject("CharacteristicNotFound", "Characteristic not found", null)
        return@AsyncFunction
      }
      val list = characteristic.descriptors.map { serializeDescriptor(it, characteristic, service, deviceAddress) }
      promise.resolve(list)
    }

    AsyncFunction("readCharacteristicForDevice") { deviceAddress: String, serviceUUID: String, characteristicUUID: String, transactionId: String?, promise: Promise ->
      val gatt = activeGatts[deviceAddress]
      val service = gatt?.getService(UUID.fromString(serviceUUID))
      val characteristic = service?.getCharacteristic(UUID.fromString(characteristicUUID))
      if (gatt == null || characteristic == null) {
        promise.reject("CharacteristicNotFound", "Characteristic not found", null)
        return@AsyncFunction
      }

      val charId = getCharacteristicId(characteristic)
      readCharPromises[charId] = promise

      if (transactionId != null) {
        activeTransactions[transactionId] = {
          readCharPromises.remove(charId)
          promise.reject("OperationCancelled", "Operation cancelled", null)
        }
      }

      mainHandler.post {
        if (!gatt.readCharacteristic(characteristic)) {
          readCharPromises.remove(charId)
          promise.reject("ReadFailed", "Failed to initiate read characteristic", null)
        }
      }
    }

    AsyncFunction("writeCharacteristicForDevice") { deviceAddress: String, serviceUUID: String, characteristicUUID: String, valueBase64: String, withResponse: Boolean, transactionId: String?, promise: Promise ->
      val gatt = activeGatts[deviceAddress]
      val service = gatt?.getService(UUID.fromString(serviceUUID))
      val characteristic = service?.getCharacteristic(UUID.fromString(characteristicUUID))
      if (gatt == null || characteristic == null) {
        promise.reject("CharacteristicNotFound", "Characteristic not found", null)
        return@AsyncFunction
      }

      val valueBytes = Base64.decode(valueBase64, Base64.NO_WRAP)
      characteristic.value = valueBytes
      characteristic.writeType = if (withResponse) {
        BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
      } else {
        BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
      }

      val charId = getCharacteristicId(characteristic)

      if (withResponse) {
        writeCharPromises[charId] = promise

        if (transactionId != null) {
          activeTransactions[transactionId] = {
            writeCharPromises.remove(charId)
            promise.reject("OperationCancelled", "Operation cancelled", null)
          }
        }
      }

      mainHandler.post {
        if (!gatt.writeCharacteristic(characteristic)) {
          if (withResponse) writeCharPromises.remove(charId)
          promise.reject("WriteFailed", "Failed to initiate write characteristic", null)
        } else if (!withResponse) {
          promise.resolve(serializeCharacteristic(characteristic, service, deviceAddress))
        }
      }
    }

    AsyncFunction("monitorCharacteristicForDevice") { deviceAddress: String, serviceUUID: String, characteristicUUID: String, transactionId: String?, promise: Promise ->
      val gatt = activeGatts[deviceAddress]
      val service = gatt?.getService(UUID.fromString(serviceUUID))
      val characteristic = service?.getCharacteristic(UUID.fromString(characteristicUUID))
      if (gatt == null || characteristic == null) {
        promise.reject("CharacteristicNotFound", "Characteristic not found", null)
        return@AsyncFunction
      }

      val charId = getCharacteristicId(characteristic)

      mainHandler.post {
        setCharacteristicMonitoring(gatt, characteristic, true)

        if (transactionId != null) {
          activeTransactions[transactionId] = {
            setCharacteristicMonitoring(gatt, characteristic, false)
          }
        }

        promise.resolve(charId)
      }
    }

    AsyncFunction("stopMonitoringCharacteristicForDevice") { deviceAddress: String, serviceUUID: String, characteristicUUID: String, promise: Promise ->
      val gatt = activeGatts[deviceAddress]
      val service = gatt?.getService(UUID.fromString(serviceUUID))
      val characteristic = service?.getCharacteristic(UUID.fromString(characteristicUUID))
      if (gatt == null || characteristic == null) {
        promise.reject("CharacteristicNotFound", "Characteristic not found", null)
        return@AsyncFunction
      }

      mainHandler.post {
        setCharacteristicMonitoring(gatt, characteristic, false)
        promise.resolve()
      }
    }

    AsyncFunction("readCharacteristic") { characteristicId: Int, transactionId: String?, promise: Promise ->
      val characteristic = characteristicsMap[characteristicId]
      if (characteristic == null) {
        promise.reject("CharacteristicNotFound", "Characteristic not found", null)
        return@AsyncFunction
      }

      val service = characteristic.service
      val gatt = activeGatts.values.firstOrNull { it.services.contains(service) }
      if (gatt == null) {
        promise.reject("DeviceNotConnected", "Gatt not found for characteristic", null)
        return@AsyncFunction
      }

      readCharPromises[characteristicId] = promise

      if (transactionId != null) {
        activeTransactions[transactionId] = {
          readCharPromises.remove(characteristicId)
          promise.reject("OperationCancelled", "Operation cancelled", null)
        }
      }

      mainHandler.post {
        if (!gatt.readCharacteristic(characteristic)) {
          readCharPromises.remove(characteristicId)
          promise.reject("ReadFailed", "Failed to initiate read characteristic", null)
        }
      }
    }

    AsyncFunction("writeCharacteristic") { characteristicId: Int, valueBase64: String, withResponse: Boolean, transactionId: String?, promise: Promise ->
      val characteristic = characteristicsMap[characteristicId]
      if (characteristic == null) {
        promise.reject("CharacteristicNotFound", "Characteristic not found", null)
        return@AsyncFunction
      }

      val service = characteristic.service
      val gatt = activeGatts.values.firstOrNull { it.services.contains(service) }
      if (gatt == null) {
        promise.reject("DeviceNotConnected", "Gatt not found for characteristic", null)
        return@AsyncFunction
      }

      val valueBytes = Base64.decode(valueBase64, Base64.NO_WRAP)
      characteristic.value = valueBytes
      characteristic.writeType = if (withResponse) {
        BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
      } else {
        BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
      }

      if (withResponse) {
        writeCharPromises[characteristicId] = promise

        if (transactionId != null) {
          activeTransactions[transactionId] = {
            writeCharPromises.remove(characteristicId)
            promise.reject("OperationCancelled", "Operation cancelled", null)
          }
        }
      }

      mainHandler.post {
        if (!gatt.writeCharacteristic(characteristic)) {
          if (withResponse) writeCharPromises.remove(characteristicId)
          promise.reject("WriteFailed", "Failed to initiate write characteristic", null)
        } else if (!withResponse) {
          promise.resolve(serializeCharacteristic(characteristic, service, gatt.device.address))
        }
      }
    }

    AsyncFunction("monitorCharacteristic") { characteristicId: Int, transactionId: String?, promise: Promise ->
      val characteristic = characteristicsMap[characteristicId]
      if (characteristic == null) {
        promise.reject("CharacteristicNotFound", "Characteristic not found", null)
        return@AsyncFunction
      }

      val service = characteristic.service
      val gatt = activeGatts.values.firstOrNull { it.services.contains(service) }
      if (gatt == null) {
        promise.reject("DeviceNotConnected", "Gatt not found for characteristic", null)
        return@AsyncFunction
      }

      mainHandler.post {
        setCharacteristicMonitoring(gatt, characteristic, true)

        if (transactionId != null) {
          activeTransactions[transactionId] = {
            setCharacteristicMonitoring(gatt, characteristic, false)
          }
        }

        promise.resolve()
      }
    }

    AsyncFunction("stopMonitoringCharacteristic") { characteristicId: Int, promise: Promise ->
      val characteristic = characteristicsMap[characteristicId]
      if (characteristic == null) {
        promise.reject("CharacteristicNotFound", "Characteristic not found", null)
        return@AsyncFunction
      }

      val service = characteristic.service
      val gatt = activeGatts.values.firstOrNull { it.services.contains(service) }
      if (gatt == null) {
        promise.reject("DeviceNotConnected", "Gatt not found for characteristic", null)
        return@AsyncFunction
      }

      mainHandler.post {
        setCharacteristicMonitoring(gatt, characteristic, false)
        promise.resolve()
      }
    }

    AsyncFunction("readDescriptorForDevice") { deviceAddress: String, serviceUUID: String, characteristicUUID: String, descriptorUUID: String, transactionId: String?, promise: Promise ->
      val gatt = activeGatts[deviceAddress]
      val service = gatt?.getService(UUID.fromString(serviceUUID))
      val characteristic = service?.getCharacteristic(UUID.fromString(characteristicUUID))
      val descriptor = characteristic?.getDescriptor(UUID.fromString(descriptorUUID))
      if (gatt == null || descriptor == null) {
        promise.reject("DescriptorNotFound", "Descriptor not found", null)
        return@AsyncFunction
      }

      val descId = getDescriptorId(descriptor)
      readDescPromises[descId] = promise

      if (transactionId != null) {
        activeTransactions[transactionId] = {
          readDescPromises.remove(descId)
          promise.reject("OperationCancelled", "Operation cancelled", null)
        }
      }

      mainHandler.post {
        if (!gatt.readDescriptor(descriptor)) {
          readDescPromises.remove(descId)
          promise.reject("ReadFailed", "Failed to initiate read descriptor", null)
        }
      }
    }

    AsyncFunction("writeDescriptorForDevice") { deviceAddress: String, serviceUUID: String, characteristicUUID: String, descriptorUUID: String, valueBase64: String, transactionId: String?, promise: Promise ->
      val gatt = activeGatts[deviceAddress]
      val service = gatt?.getService(UUID.fromString(serviceUUID))
      val characteristic = service?.getCharacteristic(UUID.fromString(characteristicUUID))
      val descriptor = characteristic?.getDescriptor(UUID.fromString(descriptorUUID))
      if (gatt == null || descriptor == null) {
        promise.reject("DescriptorNotFound", "Descriptor not found", null)
        return@AsyncFunction
      }

      val valueBytes = Base64.decode(valueBase64, Base64.NO_WRAP)
      descriptor.value = valueBytes

      val descId = getDescriptorId(descriptor)
      writeDescPromises[descId] = promise

      if (transactionId != null) {
        activeTransactions[transactionId] = {
          writeDescPromises.remove(descId)
          promise.reject("OperationCancelled", "Operation cancelled", null)
        }
      }

      mainHandler.post {
        if (!gatt.writeDescriptor(descriptor)) {
          writeDescPromises.remove(descId)
          promise.reject("WriteFailed", "Failed to initiate write descriptor", null)
        }
      }
    }

    AsyncFunction("readDescriptor") { descriptorId: Int, transactionId: String?, promise: Promise ->
      val descriptor = descriptorsMap[descriptorId]
      if (descriptor == null) {
        promise.reject("DescriptorNotFound", "Descriptor not found", null)
        return@AsyncFunction
      }

      val characteristic = descriptor.characteristic
      val service = characteristic.service
      val gatt = activeGatts.values.firstOrNull { it.services.contains(service) }
      if (gatt == null) {
        promise.reject("DeviceNotConnected", "Gatt not found for descriptor", null)
        return@AsyncFunction
      }

      readDescPromises[descriptorId] = promise

      if (transactionId != null) {
        activeTransactions[transactionId] = {
          readDescPromises.remove(descriptorId)
          promise.reject("OperationCancelled", "Operation cancelled", null)
        }
      }

      mainHandler.post {
        if (!gatt.readDescriptor(descriptor)) {
          readDescPromises.remove(descriptorId)
          promise.reject("ReadFailed", "Failed to initiate read descriptor", null)
        }
      }
    }

    AsyncFunction("writeDescriptor") { descriptorId: Int, valueBase64: String, transactionId: String?, promise: Promise ->
      val descriptor = descriptorsMap[descriptorId]
      if (descriptor == null) {
        promise.reject("DescriptorNotFound", "Descriptor not found", null)
        return@AsyncFunction
      }

      val characteristic = descriptor.characteristic
      val service = characteristic.service
      val gatt = activeGatts.values.firstOrNull { it.services.contains(service) }
      if (gatt == null) {
        promise.reject("DeviceNotConnected", "Gatt not found for descriptor", null)
        return@AsyncFunction
      }

      val valueBytes = Base64.decode(valueBase64, Base64.NO_WRAP)
      descriptor.value = valueBytes

      writeDescPromises[descriptorId] = promise

      if (transactionId != null) {
        activeTransactions[transactionId] = {
          writeDescPromises.remove(descriptorId)
          promise.reject("OperationCancelled", "Operation cancelled", null)
        }
      }

      mainHandler.post {
        if (!gatt.writeDescriptor(descriptor)) {
          writeDescPromises.remove(descriptorId)
          promise.reject("WriteFailed", "Failed to initiate write descriptor", null)
        }
      }
    }

    AsyncFunction("requestMTUForDevice") { deviceAddress: String, mtu: Int, transactionId: String?, promise: Promise ->
      val gatt = activeGatts[deviceAddress]
      if (gatt == null) {
        promise.reject("DeviceNotConnected", "Device $deviceAddress not connected", null)
        return@AsyncFunction
      }

      mtuPromises[deviceAddress] = promise

      if (transactionId != null) {
        activeTransactions[transactionId] = {
          mtuPromises.remove(deviceAddress)
          promise.reject("OperationCancelled", "Operation cancelled", null)
        }
      }

      mainHandler.post {
        if (!gatt.requestMtu(mtu)) {
          mtuPromises.remove(deviceAddress)
          promise.reject("MtuRequestFailed", "Failed to initiate MTU request", null)
        }
      }
    }

    AsyncFunction("requestConnectionPriorityForDevice") { deviceAddress: String, connectionPriority: Int, transactionId: String?, promise: Promise ->
      val gatt = activeGatts[deviceAddress]
      if (gatt == null) {
        promise.reject("DeviceNotConnected", "Device $deviceAddress not connected", null)
        return@AsyncFunction
      }

      val priority = when (connectionPriority) {
        1 -> BluetoothGatt.CONNECTION_PRIORITY_HIGH
        2 -> BluetoothGatt.CONNECTION_PRIORITY_LOW_POWER
        else -> BluetoothGatt.CONNECTION_PRIORITY_BALANCED
      }

      mainHandler.post {
        if (gatt.requestConnectionPriority(priority)) {
          promise.resolve(serializeDevice(gatt.device))
        } else {
          promise.reject("ConnectionPriorityFailed", "Failed to request connection priority", null)
        }
      }
    }

    AsyncFunction("readRSSIForDevice") { deviceAddress: String, transactionId: String?, promise: Promise ->
      val gatt = activeGatts[deviceAddress]
      if (gatt == null) {
        promise.reject("DeviceNotConnected", "Device $deviceAddress not connected", null)
        return@AsyncFunction
      }

      rssiPromises[deviceAddress] = promise

      if (transactionId != null) {
        activeTransactions[transactionId] = {
          rssiPromises.remove(deviceAddress)
          promise.reject("OperationCancelled", "Operation cancelled", null)
        }
      }

      mainHandler.post {
        if (!gatt.readRemoteRssi()) {
          rssiPromises.remove(deviceAddress)
          promise.reject("RssiReadFailed", "Failed to initiate RSSI read", null)
        }
      }
    }
  }

  private fun stopScanInternal() {
    val scanner = bluetoothLeScanner
    val callback = scanCallback
    if (isScanning && scanner != null && callback != null) {
      try {
        scanner.stopScan(callback)
      } catch (e: SecurityException) {
        // Handle permissions exception gracefully
      }
    }
    scanCallback = null
    isScanning = false
  }

  private fun setCharacteristicMonitoring(
    gatt: BluetoothGatt,
    characteristic: BluetoothGattCharacteristic,
    enabled: Boolean
  ): Boolean {
    if (!gatt.setCharacteristicNotification(characteristic, enabled)) {
      return false
    }

    val cccd = characteristic.getDescriptor(UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"))
      ?: return true

    cccd.value = if (enabled) {
      val properties = characteristic.properties
      if ((properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0) {
        BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
      } else {
        BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
      }
    } else {
      BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE
    }

    return gatt.writeDescriptor(cccd)
  }

  private val gattCallback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      val address = gatt.device.address
      if (newState == BluetoothProfile.STATE_CONNECTED) {
        deviceMtus[address] = 23
        connectionPromises.remove(address)?.resolve(serializeDevice(gatt.device))
      } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
        activeGatts.remove(address)
        deviceMtus.remove(address)
        
        val errorMap = if (status != BluetoothGatt.GATT_SUCCESS) {
          mapOf("reason" to "GATT error status $status", "errorCode" to 201)
        } else null

        sendEvent("onDeviceDisconnected", mapOf(
          "deviceId" to address,
          "error" to errorMap
        ))

        connectionPromises.remove(address)?.reject("Disconnected", "Device disconnected with status $status", null)
      }
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      val address = gatt.device.address
      val promise = discoveryPromises.remove(address)
      if (status == BluetoothGatt.GATT_SUCCESS) {
        promise?.resolve(serializeDevice(gatt.device))
      } else {
        promise?.reject("DiscoveryFailed", "Service discovery failed with status $status", null)
      }
    }

    override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      val charId = getCharacteristicId(characteristic)
      val promise = readCharPromises.remove(charId)
      if (status == BluetoothGatt.GATT_SUCCESS) {
        promise?.resolve(serializeCharacteristic(characteristic, characteristic.service, gatt.device.address))
      } else {
        promise?.reject("ReadFailed", "Characteristic read failed with status $status", null)
      }
    }

    override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      val charId = getCharacteristicId(characteristic)
      val promise = writeCharPromises.remove(charId)
      if (status == BluetoothGatt.GATT_SUCCESS) {
        promise?.resolve(serializeCharacteristic(characteristic, characteristic.service, gatt.device.address))
      } else {
        promise?.reject("WriteFailed", "Characteristic write failed with status $status", null)
      }
    }

    @Deprecated("Deprecated in Java")
    override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
      onCharacteristicChangedNotification(gatt, characteristic)
    }

    // Support newer Android API levels
    override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
      onCharacteristicChangedNotification(gatt, characteristic)
    }

    private fun onCharacteristicChangedNotification(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
      val charId = getCharacteristicId(characteristic)
      val valueBase64 = Base64.encodeToString(characteristic.value, Base64.NO_WRAP)
      sendEvent("onCharacteristicNotification", mapOf(
        "characteristicId" to charId,
        "characteristic" to serializeCharacteristic(characteristic, characteristic.service, gatt.device.address),
        "value" to valueBase64,
        "error" to null
      ))
    }

    override fun onDescriptorRead(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
      val descId = getDescriptorId(descriptor)
      val promise = readDescPromises.remove(descId)
      if (status == BluetoothGatt.GATT_SUCCESS) {
        promise?.resolve(serializeDescriptor(descriptor, descriptor.characteristic, descriptor.characteristic.service, gatt.device.address))
      } else {
        promise?.reject("ReadFailed", "Descriptor read failed with status $status", null)
      }
    }

    override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
      val descId = getDescriptorId(descriptor)
      val promise = writeDescPromises.remove(descId)
      if (status == BluetoothGatt.GATT_SUCCESS) {
        promise?.resolve(serializeDescriptor(descriptor, descriptor.characteristic, descriptor.characteristic.service, gatt.device.address))
      } else {
        promise?.reject("WriteFailed", "Descriptor write failed with status $status", null)
      }
    }

    override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
      val address = gatt.device.address
      val promise = mtuPromises.remove(address)
      if (status == BluetoothGatt.GATT_SUCCESS) {
        deviceMtus[address] = mtu
        promise?.resolve(serializeDevice(gatt.device))
      } else {
        promise?.reject("MtuRequestFailed", "MTU request failed with status $status", null)
      }
    }

    override fun onReadRemoteRssi(gatt: BluetoothGatt, rssi: Int, status: Int) {
      val address = gatt.device.address
      val promise = rssiPromises.remove(address)
      if (status == BluetoothGatt.GATT_SUCCESS) {
        promise?.resolve(serializeDevice(gatt.device, rssi))
      } else {
        promise?.reject("RssiReadFailed", "RSSI read failed with status $status", null)
      }
    }
  }

  private fun getBluetoothStateString(): String {
    val adapter = bluetoothAdapter
    if (adapter == null) return "Unsupported"
    if (!adapter.isEnabled) return "PoweredOff"
    return "PoweredOn"
  }

  private fun serializeDevice(device: BluetoothDevice, rssi: Int? = null, scanRecord: ScanRecord? = null): Map<String, Any?> {
    val map = mutableMapOf<String, Any?>()
    map["id"] = device.address
    map["name"] = device.name ?: scanRecord?.deviceName
    map["rssi"] = rssi
    map["mtu"] = deviceMtus[device.address] ?: 23
    
    map["manufacturerData"] = scanRecord?.manufacturerSpecificData?.let { msd ->
      val bos = ByteArrayOutputStream()
      for (i in 0 until msd.size()) {
        val key = msd.keyAt(i)
        val bytes = msd.valueAt(i)
        bos.write(key and 0xFF)
        bos.write((key shr 8) and 0xFF)
        bos.write(bytes)
      }
      Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP)
    }
    
    map["serviceUUIDs"] = scanRecord?.serviceUuids?.map { it.uuid.toString() }
    
    map["serviceData"] = scanRecord?.serviceData?.let { sd ->
      val sdMap = mutableMapOf<String, String>()
      for ((uuid, bytes) in sd) {
        sdMap[uuid.toString()] = Base64.encodeToString(bytes, Base64.NO_WRAP)
      }
      sdMap
    }
    
    map["txPowerLevel"] = scanRecord?.txPowerLevel
    map["solicitedServiceUUIDs"] = null
    map["overflowServiceUUIDs"] = null
    map["localName"] = scanRecord?.deviceName ?: device.name
    
    return map
  }

  private fun serializeService(service: BluetoothGattService, deviceAddress: String): Map<String, Any?> {
    val id = getServiceId(service)
    return mapOf(
      "id" to id,
      "uuid" to service.uuid.toString(),
      "deviceID" to deviceAddress,
      "isPrimary" to (service.type == BluetoothGattService.SERVICE_TYPE_PRIMARY)
    )
  }

  private fun serializeCharacteristic(characteristic: BluetoothGattCharacteristic, service: BluetoothGattService, deviceAddress: String): Map<String, Any?> {
    val charId = getCharacteristicId(characteristic)
    val serviceId = getServiceId(service)
    val props = characteristic.properties
    return mapOf(
      "id" to charId,
      "uuid" to characteristic.uuid.toString(),
      "serviceID" to serviceId,
      "serviceUUID" to service.uuid.toString(),
      "deviceID" to deviceAddress,
      "isReadable" to ((props and BluetoothGattCharacteristic.PROPERTY_READ) != 0),
      "isWritableWithResponse" to ((props and BluetoothGattCharacteristic.PROPERTY_WRITE) != 0),
      "isWritableWithoutResponse" to ((props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0),
      "isNotifiable" to ((props and BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0),
      "isIndicatable" to ((props and BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0),
      "value" to (characteristic.value?.let { Base64.encodeToString(it, Base64.NO_WRAP) })
    )
  }

  private fun serializeDescriptor(descriptor: BluetoothGattDescriptor, characteristic: BluetoothGattCharacteristic, service: BluetoothGattService, deviceAddress: String): Map<String, Any?> {
    val descId = getDescriptorId(descriptor)
    val charId = getCharacteristicId(characteristic)
    val serviceId = getServiceId(service)
    return mapOf(
      "id" to descId,
      "uuid" to descriptor.uuid.toString(),
      "characteristicID" to charId,
      "characteristicUUID" to characteristic.uuid.toString(),
      "serviceID" to serviceId,
      "serviceUUID" to service.uuid.toString(),
      "deviceID" to deviceAddress,
      "value" to (descriptor.value?.let { Base64.encodeToString(it, Base64.NO_WRAP) })
    )
  }
}
