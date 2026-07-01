import React, { useState } from "react";
import {
  View,
  Platform,
  PermissionsAndroid,
  Alert,
  FlatList,
  StyleSheet,
  StatusBar,
  TouchableOpacity
} from "react-native";
import {
  Button,
  Text,
  Surface,
  ActivityIndicator,
  Portal,
  Dialog,
  Divider,
  IconButton,
} from "react-native-paper";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import Toast from "react-native-toast-message";
import { useAppContext } from "../Store/AppContext";
import AppHeader from './AppHeader';


export default function Connect({ navigation }) {
  const {
    deviceInfo,
    connectionStatus,
    autoConnectEnabled,
    bleManagerRef,
    connectToDevice,
    disconnectDevice,
    forgetDevice,
    sendCommand,
    toggleAutoConnect,
  } = useAppContext();

  const [isScanning, setIsScanning] = useState(false);
  const [scannedDevices, setScannedDevices] = useState([]);
  const [showDeviceList, setShowDeviceList] = useState(false);
  const [showConnectOptions, setShowConnectOptions] = useState(false);
  const [connectingDevice, setConnectingDevice] = useState(null);
  const [showConnectingDialog, setShowConnectingDialog] = useState(false);

  const handleForgetDevice = async () => {
    try {
      if (isScanning) {
        bleManagerRef.current.stopDeviceScan();
        setIsScanning(false);
      }
      
      setShowConnectOptions(false);
      setShowDeviceList(false);
      setShowConnectingDialog(false);
      setConnectingDevice(null);
      
      Toast.show({
        type: 'info',
        text1: 'Forgetting device...',
      });
      
      await forgetDevice();
      
      Toast.show({
        type: 'success',
        text1: 'Device forgotten',
        text2: 'Ready to scan for new devices',
      });
      
      setTimeout(() => {
        scanForDevices();
      }, 500);
    } catch (error) {
      console.error('Error forgetting device:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to forget device',
      });
    }
  };

  const requestAndroidPermissions = async () => {
    try {
      if (Platform.Version >= 31) {
        const bluetoothScanGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          {
            title: "Bluetooth Scan Permission",
            message:
              "App needs bluetooth scan permission to find your fitness device",
            buttonPositive: "OK",
          }
        );

        const bluetoothConnectGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          {
            title: "Bluetooth Connect Permission",
            message:
              "App needs bluetooth connect permission to connect to your fitness device",
            buttonPositive: "OK",
          }
        );

        return (
          bluetoothScanGranted === PermissionsAndroid.RESULTS.GRANTED &&
          bluetoothConnectGranted === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const locationGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "App needs location permission for Bluetooth scanning",
            buttonPositive: "OK",
          }
        );

        return locationGranted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      return false;
    }
  };

  const scanForDevices = async () => {
    console.log("Starting device scan...");
    if (!bleManagerRef.current) {
      Alert.alert("Error", "BLE Manager not initialized");
      return;
    }

    try {
      setIsScanning(true);
      setScannedDevices([]);

      let permissionsGranted = true;

      if (Platform.OS === "android") {
        permissionsGranted = await requestAndroidPermissions();
      }

      if (!permissionsGranted) {
        Alert.alert(
          "Permission Required",
          "Bluetooth permissions are required to scan for devices"
        );
        setIsScanning(false);
        return;
      }

      console.log("Starting BLE scan...");

      bleManagerRef.current.startDeviceScan(null, null, (error, device) => {
        if (error) {
          setIsScanning(false);
          return;
        }

        if (device && device.name) {
          console.log("Found device:", device.name, device.id);

          setScannedDevices((prevDevices) => {
            if (!prevDevices.some((d) => d.id === device.id)) {
              return [...prevDevices, device];
            }
            return prevDevices;
          });
        }
      });

      setShowDeviceList(true);

      setTimeout(() => {
        if (isScanning) {
          bleManagerRef.current.stopDeviceScan();
          setIsScanning(false);
        }
      }, 10000);
    } catch (error) {
      setIsScanning(false);
    }
  };

  const handleDeviceConnect = async (device) => {
    // First stop scanning
    if (isScanning && bleManagerRef.current) {
      bleManagerRef.current.stopDeviceScan();
      setIsScanning(false);
    }
    
    // Close the device list dialog
    setShowDeviceList(false);
    
    // Set the connecting device and show connecting dialog
    setConnectingDevice(device);
    setShowConnectingDialog(true);
    
    // Show connecting feedback
    Toast.show({
      type: 'info',
      text1: `Connecting to ${device.name || 'device'}...`,
      position: 'bottom'
    });
    
    // Connect to device
    const success = await connectToDevice(device);

    // Hide the connecting dialog
    setShowConnectingDialog(false);
    setConnectingDevice(null);

    if (success) {
      Toast.show({
        type: 'success',
        text1: 'Connected successfully',
        text2: `Connected to ${device.name || 'device'}`,
        position: 'bottom'
      });
      navigation.navigate("Home");
    } else {
      Toast.show({
        type: 'error',
        text1: 'Connection failed',
        text2: 'Unable to connect to device',
        position: 'bottom'
      });
    }
  };

  const getSignalStrengthColor = (rssi) => {
    if (rssi > -60) return "#00b894";
    if (rssi > -80) return "#f39c12";
    return "#e74c3c";
  };

  const getSignalStrengthIcon = (rssi) => {
    if (rssi > -60) return "signal-cellular-3";
    if (rssi > -80) return "signal-cellular-2";
    return "signal-cellular-1";
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case "connected": return "#00b894";
      case "connecting":
      case "reconnecting": return "#f39c12";
      default: return "#e74c3c";
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case "connected": return "Connected";
      case "connecting": return "Connecting...";
      case "reconnecting": return "Reconnecting...";
      default: return "Disconnected";
    }
  };

  const renderDeviceItem = ({ item }) => (
    <TouchableOpacity 
      activeOpacity={0.7}
      onPress={() => handleDeviceConnect(item)}
      style={styles.deviceItemTouchable}
    >
      <Surface style={styles.deviceCard}>
        <View style={styles.deviceItemContent}>
          <View style={styles.deviceIconContainer}>
            <Icon name="bluetooth" size={20} color="#6c5ce7" />
          </View>
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>
              {item.name || "Unknown Device"}
            </Text>
            <Text style={styles.deviceId}>
              {item.id}
            </Text>
          </View>
          <View style={styles.deviceRssi}>
            <View style={[styles.signalBadge, { backgroundColor: getSignalStrengthColor(item.rssi) + "30" }]}>
              <Text style={[styles.signalText, { color: getSignalStrengthColor(item.rssi) }]}>
                {item.rssi ? `${item.rssi} dBm` : "N/A"}
              </Text>
            </View>
            <Icon
              name={getSignalStrengthIcon(item.rssi)}
              size={16}
              color={getSignalStrengthColor(item.rssi)}
              style={{ marginTop: 4 }}
            />
          </View>
        </View>
      </Surface>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#121625" barStyle="light-content" />
      
      <AppHeader 
        rightIcon={connectionStatus === 'connected' ? "bluetooth-connect" : "bluetooth-off"}
      />
      
      <View style={styles.content}>
        {/* <Text style={styles.title}>Connect Device</Text> */}
        
        {deviceInfo ? (
          <Surface style={styles.connectedCard}>
            <View style={styles.connectedContent}>
              <View style={styles.connectionIconContainer}>
                <Icon
                  name="bluetooth-connect"
                  size={40}
                  color={getConnectionStatusColor()}
                />
              </View>
              
              <Text style={styles.connectedTitle}>
                {getConnectionStatusText()}
              </Text>
              
              <Text style={styles.connectedName}>
                {deviceInfo.name}
              </Text>
              
              <View style={styles.deviceDetail}>
                <Text style={styles.deviceDetailLabel}>Device ID:</Text>
                <Text style={styles.deviceDetailValue}>{deviceInfo.id ? `${deviceInfo.id.slice(0, 12)}...` : 'Unknown'}</Text>
              </View>

              <Surface style={styles.autoConnectInfo}>
                <View style={styles.autoConnectRow}>
                  <View style={styles.autoConnectIcon}>
                    <Icon name="refresh" size={18} color="#6c5ce7" />
                  </View>
                  <View style={styles.autoConnectTextContainer}>
                    <Text style={styles.autoConnectText}>
                      Auto-reconnect
                    </Text>
                    <Text style={styles.autoConnectDescription}>
                      {autoConnectEnabled
                        ? "Device will automatically reconnect when available"
                        : "Manual connection required"}
                    </Text>
                  </View>
                  <IconButton
                    icon={
                      autoConnectEnabled ? "toggle-switch" : "toggle-switch-off"
                    }
                    iconColor={
                      autoConnectEnabled
                        ? "#6c5ce7"
                        : "#a0a5b1"
                    }
                    size={28}
                    onPress={() => toggleAutoConnect(!autoConnectEnabled)}
                  />
                </View>
              </Surface>

              <View style={styles.connectionActions}>
                <Button
                  mode="contained"
                  onPress={() => setShowConnectOptions(true)}
                  style={styles.actionButton}
                  contentStyle={styles.buttonContent}
                  icon={({size, color}) => <Icon name="cog" size={size} color={color} />}
                  buttonColor="#6c5ce7"
                  disabled={connectionStatus !== "connected"}
                >
                  Device Options
                </Button>

                <Button
                  mode="outlined"
                  onPress={handleForgetDevice}
                  style={[styles.actionButton, { borderColor: '#e74c3c' }]}
                  contentStyle={styles.buttonContent}
                  icon={({size, color}) => <Icon name="delete" size={size} color={color} />}
                  textColor="#e74c3c"
                >
                  Forget Device
                </Button>
              </View>
            </View>
          </Surface>
        ) : (
          <Surface style={styles.noConnectionCard}>
            <View style={styles.noConnectionContent}>
              <View style={styles.noConnectionIconContainer}>
                <Icon
                  name={
                    connectionStatus === "reconnecting"
                      ? "bluetooth-audio"
                      : "bluetooth-off"
                  }
                  size={40}
                  color={
                    connectionStatus === "reconnecting"
                      ? "#6c5ce7"
                      : "#a0a5b1"
                  }
                />
              </View>
              
              <Text style={styles.noConnectionTitle}>
                {connectionStatus === "reconnecting"
                  ? "Reconnecting..."
                  : "No Device Connected"}
              </Text>
              
              <Text style={styles.noConnectionText}>
                {connectionStatus === "reconnecting"
                  ? "Attempting to reconnect to your saved device..."
                  : "Scan for nearby fitness trackers to connect and start monitoring your health data"}
              </Text>

              {connectionStatus === "reconnecting" ? (
                <>
                  <View style={styles.reconnectingIndicator}>
                    <ActivityIndicator size="small" color="#6c5ce7" />
                    <Text style={styles.reconnectingText}>Please wait...</Text>
                  </View>
                  
                  {/* Cancel Reconnection button - using handleForgetDevice */}
                  <Button
                    mode="outlined"
                    onPress={handleForgetDevice}
                    style={[styles.cancelReconnectButton, { borderColor: '#e74c3c' }]}
                    contentStyle={styles.buttonContent}
                    icon={({size, color}) => <Icon name="close-circle" size={size} color={color} />}
                    textColor="#e74c3c"
                  >
                    Cancel & Scan New
                  </Button>
                </>
              ) : (
                <Button
                  mode="contained"
                  onPress={scanForDevices}
                  style={styles.scanButton}
                  contentStyle={styles.buttonContent}
                  icon={isScanning ? null : ({size, color}) => <Icon name="bluetooth-audio" size={size} color={color} />}
                  buttonColor="#6c5ce7"
                  disabled={isScanning}
                >
                  {isScanning ? (
                    <View style={styles.scanningContent}>
                      <ActivityIndicator size="small" color="white" />
                      <Text style={styles.scanningText}>Scanning...</Text>
                    </View>
                  ) : (
                    "Scan for Devices"
                  )}
                </Button>
              )}
            </View>
          </Surface>
        )}
      </View>

      {/* Device List Dialog */}
      <Portal>
        <Dialog
          visible={showDeviceList}
          onDismiss={() => {
            setShowDeviceList(false);
            if (isScanning) {
              bleManagerRef.current.stopDeviceScan();
              setIsScanning(false);
            }
          }}
          style={styles.deviceListDialog}
        >
          <Dialog.Title style={styles.dialogTitle}>Available Devices</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            {isScanning && (
              <Surface style={styles.scanningIndicator}>
                <ActivityIndicator size="small" color="#6c5ce7" />
                <Text style={styles.scanningIndicatorText}>
                  Scanning for devices...
                </Text>
              </Surface>
            )}

            {scannedDevices.length > 0 ? (
              <FlatList
                data={scannedDevices}
                renderItem={renderDeviceItem}
                keyExtractor={(item) => item.id}
                style={styles.deviceList}
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              />
            ) : (
              <Surface style={styles.noDevices}>
                <Icon name="bluetooth-off" size={32} color="#a0a5b1" style={{ marginBottom: 12 }} />
                <Text style={styles.noDevicesText}>
                  {isScanning ? "Looking for devices..." : "No devices found"}
                </Text>
                <Text style={styles.noDevicesHint}>
                  Make sure your fitness device is nearby and in pairing mode
                </Text>
              </Surface>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => {
                if (isScanning) {
                  bleManagerRef.current.stopDeviceScan();
                  setIsScanning(false);
                } else {
                  scanForDevices();
                }
              }}
              textColor="#6c5ce7"
            >
              {isScanning ? "Stop Scanning" : "Scan Again"}
            </Button>
            <Button
              onPress={() => {
                setShowDeviceList(false);
                if (isScanning) {
                  bleManagerRef.current.stopDeviceScan();
                  setIsScanning(false);
                }
              }}
              textColor="#6c5ce7"
            >
              Cancel
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Connect Options Dialog */}
      <Portal>
        <Dialog
          visible={showConnectOptions}
          onDismiss={() => setShowConnectOptions(false)}
          style={styles.optionsDialog}
        >
          <Dialog.Title style={styles.dialogTitle}>Device Options</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            {deviceInfo && (
              <Surface style={styles.modalDeviceInfo}>
                <View style={styles.modalDeviceHeader}>
                  <Icon name="bluetooth-connect" size={22} color="#00b894" style={styles.modalHeaderIcon} />
                  <Text style={styles.modalHeaderText}>{deviceInfo.name}</Text>
                </View>
                
                <Divider style={styles.modalDivider} />
                
                <TouchableOpacity 
                  style={styles.modalOption} 
                  onPress={() => {
                    sendCommand(0x02, "Heart Rate + SpO₂");
                    setShowConnectOptions(false);
                  }}
                >
                  <View style={[styles.modalOptionIcon, { backgroundColor: '#6c5ce720' }]}>
                    <Icon name="heart-pulse" size={20} color="#6c5ce7" />
                  </View>
                  <View style={styles.modalOptionContent}>
                    <Text style={styles.modalOptionTitle}>Measure Vitals</Text>
                    <Text style={styles.modalOptionDesc}>Start heart rate and SpO₂ measurement</Text>
                  </View>
                  <Icon name="chevron-right" size={20} color="#a0a5b1" />
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.modalOption} 
                  onPress={() => {
                    sendCommand(0x01, "Reset");
                    setShowConnectOptions(false);
                  }}
                >
                  <View style={[styles.modalOptionIcon, { backgroundColor: '#e74c3c20' }]}>
                    <Icon name="refresh" size={20} color="#e74c3c" />
                  </View>
                  <View style={styles.modalOptionContent}>
                    <Text style={styles.modalOptionTitle}>Reset Data</Text>
                    <Text style={styles.modalOptionDesc}>Clear all fitness data</Text>
                  </View>
                  <Icon name="chevron-right" size={20} color="#a0a5b1" />
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.modalOption} 
                  onPress={() => {
                    disconnectDevice();
                    setShowConnectOptions(false);
                  }}
                >
                  <View style={[styles.modalOptionIcon, { backgroundColor: '#a0a5b120' }]}>
                    <Icon name="bluetooth-off" size={20} color="#a0a5b1" />
                  </View>
                  <View style={styles.modalOptionContent}>
                    <Text style={styles.modalOptionTitle}>Disconnect Device</Text>
                    <Text style={styles.modalOptionDesc}>Disconnect from current device</Text>
                  </View>
                  <Icon name="chevron-right" size={20} color="#a0a5b1" />
                </TouchableOpacity>
              </Surface>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowConnectOptions(false)} textColor="#6c5ce7">Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Connecting Dialog */}
      <Portal>
        <Dialog
          visible={showConnectingDialog}
          onDismiss={() => {}}  // Prevent dismiss by tapping outside
          style={styles.connectingDialog}
        >
          <Dialog.Title style={styles.dialogTitle}>Connecting</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <View style={styles.connectingDialogContent}>
              <ActivityIndicator size="large" color="#6c5ce7" style={styles.connectingIndicator} />
              <Text style={styles.connectingText}>
                Connecting to {connectingDevice?.name || 'device'}...
              </Text>
              <Text style={styles.connectingSubText}>
                This may take a few moments
              </Text>
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button 
              onPress={handleForgetDevice} 
              textColor="#e74c3c"
              icon={({size, color}) => <Icon name="close-circle" size={size} color={color} />}
            >
              Cancel
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121625',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 24,
  },
  connectedCard: {
    backgroundColor: '#1e2637',
    borderRadius: 16,
    elevation: 2,
    overflow: 'hidden',
  },
  connectedContent: {
    alignItems: "center",
    padding: 24,
  },
  connectionIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#242c3d',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  connectedTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: 'white',
    marginBottom: 8,
  },
  connectedName: {
    fontSize: 18,
    fontWeight: "600",
    color: 'white',
    marginBottom: 12,
  },
  deviceDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  deviceDetailLabel: {
    color: '#a0a5b1',
    marginRight: 8,
    fontSize: 14,
  },
  deviceDetailValue: {
    color: '#a0a5b1',
    fontSize: 14,
  },
  autoConnectInfo: {
    width: "100%",
    padding: 16,
    marginBottom: 24,
    borderRadius: 12,
    backgroundColor: '#242c3d',
  },
  autoConnectRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  autoConnectIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6c5ce720',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  autoConnectTextContainer: {
    flex: 1,
  },
  autoConnectText: {
    fontSize: 16,
    fontWeight: "500",
    color: 'white',
    marginBottom: 4,
  },
  autoConnectDescription: {
    fontSize: 12,
    color: '#a0a5b1',
  },
  connectionActions: {
    width: "100%",
    gap: 12,
  },
  actionButton: {
    marginVertical: 4,
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 6,
  },
  noConnectionCard: {
    backgroundColor: '#1e2637',
    borderRadius: 16,
    elevation: 2,
    overflow: 'hidden',
  },
  noConnectionContent: {
    alignItems: "center",
    padding: 24,
  },
  noConnectionIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#242c3d',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  noConnectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: 'white',
    marginBottom: 12,
  },
  noConnectionText: {
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
    color: '#a0a5b1',
    paddingHorizontal: 16,
  },
  reconnectingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#242c3d',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginBottom: 16,
  },
  reconnectingText: {
    marginLeft: 8,
    color: '#a0a5b1',
  },
  cancelReconnectButton: {
    minWidth: 180,
    borderRadius: 8,
    marginTop: 8,
  },
  scanButton: {
    minWidth: 180,
    borderRadius: 8,
    marginTop: 8,
  },
  scanningContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  scanningText: {
    color: "white",
    marginLeft: 8,
  },
  deviceListDialog: {
    backgroundColor: '#1e2637',
    borderRadius: 16,
    margin: 24,
  },
  dialogTitle: {
    color: 'white',
  },
  dialogContent: {
    backgroundColor: '#1e2637',
  },
  optionsDialog: {
    backgroundColor: '#1e2637',
    borderRadius: 16,
    margin: 24,
  },
  connectingDialog: {
    backgroundColor: '#1e2637',
    borderRadius: 16,
    margin: 24,
  },
  connectingDialogContent: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  connectingIndicator: {
    marginBottom: 20,
  },
  connectingText: {
    fontSize: 16,
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  connectingSubText: {
    fontSize: 14,
    color: '#a0a5b1',
    textAlign: 'center',
  },
  scanningIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: '#242c3d',
  },
  scanningIndicatorText: {
    marginLeft: 12,
    color: '#a0a5b1',
  },
  deviceList: {
    maxHeight: 300,
  },
  deviceItemTouchable: {
    marginVertical: 4,
  },
  deviceCard: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#242c3d',
  },
  deviceItemContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  deviceIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6c5ce720',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  deviceInfo: {
    flex: 1,
    marginLeft: 4,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "bold",
    color: 'white',
  },
  deviceId: {
    fontSize: 12,
    marginTop: 2,
    color: '#a0a5b1',
  },
  deviceRssi: {
    alignItems: "center",
  },
  signalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  signalText: {
    fontSize: 10,
    fontWeight: '500',
  },
  noDevices: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: '#242c3d',
  },
  noDevicesText: {
    textAlign: "center",
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  noDevicesHint: {
    textAlign: "center",
    color: '#a0a5b1',
    fontSize: 13,
  },
  modalDeviceInfo: {
    borderRadius: 12,
    padding: 0,
    backgroundColor: '#242c3d',
    overflow: 'hidden',
  },
  modalDeviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  modalHeaderIcon: {
    marginRight: 12,
  },
  modalHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#2d3748',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  modalOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  modalOptionContent: {
    flex: 1,
  },
  modalOptionTitle: {
    fontSize: 16,
    color: 'white',
    marginBottom: 2,
  },
  modalOptionDesc: {
    fontSize: 13,
    color: '#a0a5b1',
  },
});