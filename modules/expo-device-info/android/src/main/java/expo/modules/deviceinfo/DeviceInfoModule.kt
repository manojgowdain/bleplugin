package expo.modules.deviceinfo

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

private const val MODULE_NAME = "ExpoDeviceInfo"
private val CLIENT_CHARACTERISTIC_CONFIG_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

class DeviceInfoModule : Module() {
  private val bluetoothAdapter: BluetoothAdapter?
    get() = appContext.reactContext
      ?.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      ?.adapter

  private val mainHandler = Handler(Looper.getMainLooper())
  private val discoveredDevices = ConcurrentHashMap<String, BluetoothDevice>()
  private val gattConnections = ConcurrentHashMap<String, BluetoothGatt>()
  private val notificationCallbacks = ConcurrentHashMap<String, BluetoothGattCallback>()
  private var scanCallback: ScanCallback? = null
  private var bluetoothStateReceiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name(MODULE_NAME)
    Events(
      "deviceFound",
      "connected",
      "disconnected",
      "characteristicChanged",
      "bluetoothStateChanged",
      "error"
    )

    OnCreate {
      registerBluetoothStateReceiver()
      emitBluetoothState()
    }

    OnDestroy {
      unregisterBluetoothStateReceiver()
      stopScanInternal()
      gattConnections.values.forEach { it.close() }
      gattConnections.clear()
    }

    AsyncFunction("requestPermissions") {
      makePermissionResponse(hasRequiredPermissions())
    }

    AsyncFunction("isEnabled") {
      bluetoothAdapter?.isEnabled == true
    }

    AsyncFunction("startScan") { options: Map<String, Any?>? ->
      startScanInternal(options)
    }

    Function("stopScan") {
      stopScanInternal()
    }

    AsyncFunction("connect") { deviceId: String ->
      connectInternal(deviceId)
    }

    AsyncFunction("disconnect") { deviceId: String ->
      disconnectInternal(deviceId)
    }

    AsyncFunction("read") { deviceId: String, serviceUUID: String, characteristicUUID: String ->
      readInternal(deviceId, serviceUUID, characteristicUUID)
    }

    AsyncFunction("write") { deviceId: String, serviceUUID: String, characteristicUUID: String, value: List<Int> ->
      writeInternal(deviceId, serviceUUID, characteristicUUID, value)
    }

    AsyncFunction("startNotifications") { deviceId: String, serviceUUID: String, characteristicUUID: String ->
      startNotificationsInternal(deviceId, serviceUUID, characteristicUUID)
    }

    AsyncFunction("stopNotifications") { deviceId: String, serviceUUID: String, characteristicUUID: String ->
      stopNotificationsInternal(deviceId, serviceUUID, characteristicUUID)
    }
  }

  private fun makePermissionResponse(granted: Boolean): Map<String, Any> {
    return mapOf(
      "status" to if (granted) "granted" else "denied",
      "granted" to granted,
      "canAskAgain" to true,
      "expires" to "never"
    )
  }

  private fun hasRequiredPermissions(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      return true
    }

    val context = appContext.reactContext ?: return false
    val scanPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN)
    val connectPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT)
    return scanPermission == android.content.pm.PackageManager.PERMISSION_GRANTED &&
      connectPermission == android.content.pm.PackageManager.PERMISSION_GRANTED
  }

  private fun registerBluetoothStateReceiver() {
    if (bluetoothStateReceiver != null) {
      return
    }

    val context = appContext.reactContext ?: return
    bluetoothStateReceiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        emitBluetoothState()
      }
    }

    context.registerReceiver(
      bluetoothStateReceiver,
      IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
    )
  }

  private fun unregisterBluetoothStateReceiver() {
    val context = appContext.reactContext ?: return
    bluetoothStateReceiver?.let {
      try {
        context.unregisterReceiver(it)
      } catch (_: Exception) {
      }
    }
    bluetoothStateReceiver = null
  }

  private fun emitBluetoothState() {
    sendEvent(
      "bluetoothStateChanged",
      mapOf(
        "available" to (bluetoothAdapter != null),
        "poweredOn" to (bluetoothAdapter?.isEnabled == true)
      )
    )
  }

  @SuppressLint("MissingPermission")
  private fun startScanInternal(options: Map<String, Any?>?) {
    val scanner = bluetoothAdapter?.bluetoothLeScanner ?: throw IllegalStateException("Bluetooth LE scanner is unavailable.")
    stopScanInternal()

    val filters = buildScanFilters(options)
    val settings = ScanSettings.Builder()
      .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
      .build()

    scanCallback = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        val device = result.device
        discoveredDevices[device.address] = device
        sendEvent(
          "deviceFound",
          mapOf(
            "id" to device.address,
            "name" to device.name,
            "connected" to false,
            "services" to emptyList<String>()
          )
        )
      }

      override fun onScanFailed(errorCode: Int) {
        sendEvent("error", mapOf("code" to "scan_failed", "message" to "BLE scan failed with code $errorCode", "details" to errorCode))
      }
    }

    scanner.startScan(filters, settings, scanCallback)
  }

  @SuppressLint("MissingPermission")
  private fun stopScanInternal() {
    val scanner = bluetoothAdapter?.bluetoothLeScanner ?: return
    scanCallback?.let { scanner.stopScan(it) }
    scanCallback = null
  }

  private fun buildScanFilters(options: Map<String, Any?>?): List<ScanFilter> {
    val serviceUUIDs = (options?.get("serviceUUIDs") as? List<*>)?.mapNotNull { it?.toString() }.orEmpty()
    if (serviceUUIDs.isEmpty()) {
      return emptyList()
    }

    return serviceUUIDs.map { uuid ->
      ScanFilter.Builder().setServiceUuid(android.os.ParcelUuid(UUID.fromString(uuid))).build()
    }
  }

  @SuppressLint("MissingPermission")
  private fun connectInternal(deviceId: String) {
    val device = discoveredDevices[deviceId] ?: bluetoothAdapter?.getRemoteDevice(deviceId)
      ?: throw IllegalStateException("Device $deviceId is not available. Start a scan first.")

    discoveredDevices[device.address] = device

    val gatt = device.connectGatt(appContext.reactContext, false, object : BluetoothGattCallback() {
      override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
        if (newState == BluetoothProfile.STATE_CONNECTED) {
          gattConnections[device.address] = gatt
          sendEvent("connected", mapOf("deviceId" to device.address, "connected" to true))
          gatt.discoverServices()
        } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
          gattConnections.remove(device.address)
          sendEvent("disconnected", mapOf("deviceId" to device.address, "connected" to false))
        }
      }

      override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
        if (status != BluetoothGatt.GATT_SUCCESS) {
          sendEvent("error", mapOf("code" to "services_discovery_failed", "message" to "Failed to discover services for $deviceId", "details" to status))
        }
      }

      override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
        if (status == BluetoothGatt.GATT_SUCCESS) {
          sendEvent(
            "characteristicChanged",
            mapOf(
              "deviceId" to device.address,
              "serviceUUID" to characteristic.service.uuid.toString(),
              "characteristicUUID" to characteristic.uuid.toString(),
              "value" to characteristic.value.map { it.toInt() and 0xFF }
            )
          )
        }
      }

      override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
        sendEvent(
          "characteristicChanged",
          mapOf(
            "deviceId" to device.address,
            "serviceUUID" to characteristic.service.uuid.toString(),
            "characteristicUUID" to characteristic.uuid.toString(),
            "value" to characteristic.value.map { it.toInt() and 0xFF }
          )
        )
      }
    })

    gattConnections[device.address] = gatt
  }

  @SuppressLint("MissingPermission")
  private fun disconnectInternal(deviceId: String) {
    val gatt = gattConnections.remove(deviceId) ?: return
    gatt.disconnect()
    gatt.close()
    sendEvent("disconnected", mapOf("deviceId" to deviceId, "connected" to false))
  }

  @SuppressLint("MissingPermission")
  private fun readInternal(deviceId: String, serviceUUID: String, characteristicUUID: String): List<Int> {
    val characteristic = getCharacteristic(deviceId, serviceUUID, characteristicUUID)
    return characteristic.value?.map { it.toInt() and 0xFF }.orEmpty()
  }

  @SuppressLint("MissingPermission")
  private fun writeInternal(deviceId: String, serviceUUID: String, characteristicUUID: String, value: List<Int>) {
    val characteristic = getCharacteristic(deviceId, serviceUUID, characteristicUUID)
    characteristic.value = value.map { it.toByte() }.toByteArray()
    characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
    gattConnections[deviceId]?.writeCharacteristic(characteristic)
  }

  @SuppressLint("MissingPermission")
  private fun startNotificationsInternal(deviceId: String, serviceUUID: String, characteristicUUID: String) {
    val characteristic = getCharacteristic(deviceId, serviceUUID, characteristicUUID)
    val gatt = gattConnections[deviceId] ?: throw IllegalStateException("Device $deviceId is not connected.")
    gatt.setCharacteristicNotification(characteristic, true)
    characteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG_UUID)?.let { descriptor ->
      descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
      gatt.writeDescriptor(descriptor)
    }
  }

  @SuppressLint("MissingPermission")
  private fun stopNotificationsInternal(deviceId: String, serviceUUID: String, characteristicUUID: String) {
    val characteristic = getCharacteristic(deviceId, serviceUUID, characteristicUUID)
    val gatt = gattConnections[deviceId] ?: return
    gatt.setCharacteristicNotification(characteristic, false)
    characteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG_UUID)?.let { descriptor ->
      descriptor.value = BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE
      gatt.writeDescriptor(descriptor)
    }
  }

  private fun getCharacteristic(deviceId: String, serviceUUID: String, characteristicUUID: String): BluetoothGattCharacteristic {
    val gatt = gattConnections[deviceId] ?: throw IllegalStateException("Device $deviceId is not connected.")
    val service: BluetoothGattService = gatt.getService(UUID.fromString(serviceUUID))
      ?: throw IllegalStateException("Service $serviceUUID is not available on $deviceId.")
    return service.getCharacteristic(UUID.fromString(characteristicUUID))
      ?: throw IllegalStateException("Characteristic $characteristicUUID is not available on $deviceId.")
  }
}