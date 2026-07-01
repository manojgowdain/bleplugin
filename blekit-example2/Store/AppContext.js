import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BleManager } from 'blekit';
import Toast from 'react-native-toast-message';
import { SERVICE_UUID, CHARACTERISTICS, STORAGE_KEYS } from '../Screans/uuids';

const AppContext = createContext();

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [readings, setReadings] = useState({});
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(true);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [autoConnectEnabled, setAutoConnectEnabled] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const bleManagerRef = useRef(null);
  const deviceRef = useRef(null);
  const reconnectIntervalRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const connectionTimeoutRef = useRef(null);

  useEffect(() => {
    initializeBLE();
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (reconnectIntervalRef.current) {
      clearInterval(reconnectIntervalRef.current);
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }
    if (bleManagerRef.current) {
      bleManagerRef.current.destroy();
    }
  };

  const initializeBLE = async () => {
    try {
      bleManagerRef.current = new BleManager();
      
      const subscription = bleManagerRef.current.onStateChange((state) => {
        console.log('BLE state changed:', state);
        if (state === 'PoweredOn') {
          loadStoredDeviceAndConnect();
        } else {
          setConnectionStatus('disconnected');
        }
      }, true);

      await loadSettings();
      
      return () => subscription.remove();
    } catch (error) {
      setError('Failed to initialize Bluetooth');
      setIsInitializing(false);
    }
  };

  const loadSettings = async () => {
    try {
      const autoConnect = await AsyncStorage.getItem(STORAGE_KEYS.AUTO_CONNECT);
      if (autoConnect !== null) {
        setAutoConnectEnabled(JSON.parse(autoConnect));
      }
    } catch (error) {
      // Silently handle settings load error
    }
  };

  const loadStoredDeviceAndConnect = async () => {
    try {
      const storedDeviceData = await AsyncStorage.getItem(STORAGE_KEYS.CONNECTED_DEVICE);
      console.log('Stored device data:', storedDeviceData);
      
      if (storedDeviceData && autoConnectEnabled) {
        const deviceData = JSON.parse(storedDeviceData);
        console.log('Attempting to reconnect to:', deviceData);
        setConnectionStatus('reconnecting');
        setIsInitializing(false);
        
        // Start reconnection attempts
        attemptReconnection(deviceData);
      }
      
      setIsInitializing(false);
    } catch (error) {
      setIsInitializing(false);
    }
  };

  // Modified to use connectToDevice
  const attemptReconnection = async (deviceData, maxAttempts = 3) => {
    if (!bleManagerRef.current || !deviceData) {
      setConnectionStatus('disconnected');
      return false;
    }
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`Reconnection attempt ${attempt}/${maxAttempts} for device: ${deviceData.id}`);
        
        // Create a device-like object that connectToDevice can use
        const deviceForConnection = {
          id: deviceData.id,
          name: deviceData.name || 'Stored Device',
          connect: (options) => {
            return bleManagerRef.current.connectToDevice(deviceData.id, options);
          }
        };
        
        // Wait before trying
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Use the same connectToDevice function for reconnection
        const success = await connectToDevice(deviceForConnection, true);
        
        if (success) {
          return true;
        }
      } catch (error) {
        console.log(`Reconnection attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxAttempts) {
          console.log('All reconnection attempts failed');
          setConnectionStatus('disconnected');
          Toast.show({
            type: 'info',
            text1: 'Auto-reconnect failed',
            text2: 'Please manually connect to your device',
          });
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    return false;
  };

  const connectToDevice = async (device, isReconnecting = false) => {
    try {
      setError('');
      
      if (!isReconnecting) {
        setConnectionStatus('connecting');
      }
      
      console.log(`${isReconnecting ? 'Reconnecting' : 'Connecting'} to device:`, device.id);
      
      // Stop scanning first
      if (bleManagerRef.current) {
        bleManagerRef.current.stopDeviceScan();
      }
      
      // Wait a moment for scan to stop
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Set connection timeout
      const timeoutPromise = new Promise((_, reject) => {
        connectionTimeoutRef.current = setTimeout(() => {
          reject(new Error('Connection timeout after 15 seconds'));
        }, 15000);
      });
      
      // Attempt connection with timeout
      const connectionPromise = device.connect({
        requestMTU: 512,
        timeout: 10000,
      });
      
      const connectedDevice = await Promise.race([connectionPromise, timeoutPromise]);
      
      // Clear timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      
      // Pass any stored data for reconnection scenarios
      const storedDeviceData = isReconnecting ? { id: device.id, name: device.name } : null;
      await setupDeviceConnection(connectedDevice, storedDeviceData);
      
      return true;
    } catch (error) {
      setError(`Connection failed: ${error.message}`);
      setConnectionStatus('disconnected');
      
      // Clear timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      
      Toast.show({
        type: 'error',
        text1: 'Connection failed',
        text2: error.message,
      });
      
      return false;
    }
  };

  const setupDeviceConnection = async (device, storedDeviceData = null) => {
    try {
      console.log('Setting up device connection...');
      
      // Check if device is actually connected
      const isConnected = await device.isConnected();
      if (!isConnected) {
        throw new Error('Device connection was lost during setup');
      }
      
      deviceRef.current = device;
      setConnectedDevice(device);
      setConnectionStatus('connecting');

      console.log('Discovering services...');
      const deviceWithServices = await device.discoverAllServicesAndCharacteristics();
      
      // Check connection again
      const stillConnected = await device.isConnected();
      if (!stillConnected) {
        throw new Error('Device disconnected during service discovery');
      }
      
      const services = await deviceWithServices.services();
      console.log('Available services:', services.map(s => s.uuid));
      
      const service = services.find(s => s.uuid.toLowerCase() === SERVICE_UUID.toLowerCase());

      if (!service) {
        console.log('Required service not found. Available services:', services.map(s => s.uuid));
        
        // For testing purposes, let's continue even without the specific service
        // In production, you might want to handle this differently
        console.log('Continuing without specific service for testing...');
      } else {
        const characteristics = await service.characteristics();
        console.log('Available characteristics:', characteristics.map(c => c.uuid));
        await setupCharacteristicMonitoring(characteristics);
      }

      // Update device info
      const deviceInfo = {
        id: device.id,
        name: device.name || storedDeviceData?.name || 'Fitness Tracker',
        connectedAt: new Date().toISOString(),
      };

      setDeviceInfo(deviceInfo);
      setConnectionStatus('connected');
      reconnectAttemptsRef.current = 0;

      // Save device info to storage
      await saveDeviceToStorage(deviceInfo);

      // Setup connection monitoring
      setupConnectionMonitoring(device);

      Toast.show({
        type: 'success',
        text1: 'Device connected successfully!',
        text2: deviceInfo.name,
      });

      console.log('Device connection setup complete');
    } catch (error) {
      setConnectionStatus('disconnected');
      await disconnectDevice();
    }
  };

  const setupCharacteristicMonitoring = async (characteristics) => {
    for (const [label, uuid] of Object.entries(CHARACTERISTICS)) {
      if (label === 'reset') continue;

      try {
        const char = characteristics.find(c => c.uuid.toLowerCase() === uuid.toLowerCase());
        if (char) {
          console.log(`Setting up monitoring for ${label}`);
          await char.monitor((error, characteristic) => {
            if (error) {
              return;
            }
            
            if (characteristic.value) {
              try {
                const value = atob(characteristic.value);
                
                setReadings(prev => {
                  const newReadings = {
                     ...prev,
                     [label]: value,
                    lastUpdated: new Date().toISOString()
                  };
                  return newReadings;
                });
              } catch (decodeError) {
                // Silent error for decode issues
              }
            }
          });
        } else {
          console.warn(`Characteristic not found for ${label}:`, uuid);
        }
      } catch (err) {
        console.warn(`Could not setup monitoring for ${label}:`, err);
      }
    }
  };

  const setupConnectionMonitoring = (device) => {
    const subscription = device.onDisconnected((error, disconnectedDevice) => {
      console.log('Device disconnected:', error?.message || 'Unknown reason');
      setConnectionStatus('disconnected');
      setConnectedDevice(null);
      
      if (autoConnectEnabled && reconnectAttemptsRef.current < 5) {
        console.log('Starting automatic reconnection...');
        reconnectAttemptsRef.current++;
        setTimeout(() => {
          loadStoredDeviceAndConnect();
        }, 3000);
      } else {
        Toast.show({
          type: 'info',
          text1: 'Device disconnected',
          text2: error?.message || 'Connection lost',
        });
      }
    });
    
    return subscription;
  };

  const saveDeviceToStorage = async (deviceInfo) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CONNECTED_DEVICE, JSON.stringify(deviceInfo));
      console.log('Device saved to storage:', deviceInfo);
    } catch (error) {
      // Silent error for storage issues
    }
  };

  const disconnectDevice = async () => {
    try {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current);
      }

      if (deviceRef.current) {
        try {
          await deviceRef.current.cancelConnection();
        } catch (error) {
          console.log('Error during disconnect:', error.message);
        }
        deviceRef.current = null;
      }

      setConnectedDevice(null);
      setDeviceInfo(null);
      setReadings({});
      setConnectionStatus('disconnected');
      setError('');
      reconnectAttemptsRef.current = 0;
      
      Toast.show({
        type: 'info',
        text1: 'Device disconnected',
      });
    } catch (error) {
      // Silent error handling
    }
  };

  const forgetDevice = async () => {
    try {
      await disconnectDevice();
      await AsyncStorage.removeItem(STORAGE_KEYS.CONNECTED_DEVICE);
      
      Toast.show({
        type: 'success',
        text1: 'Device forgotten',
        text2: 'Device removed from memory',
      });
    } catch (error) {
      // Silent error handling
    }
  };

  const toggleAutoConnect = async (enabled) => {
    setAutoConnectEnabled(enabled);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.AUTO_CONNECT, JSON.stringify(enabled));
    } catch (error) {
      // Silent error handling
    }
  };

  const sendCommand = async (byteVal, label) => {
    if (!connectedDevice) {
      Toast.show({
        type: 'error',
        text1: `Cannot send ${label}: no device connected`,
      });
      return false;
    }
    
    try {
      // Check if device is still connected
      const isConnected = await connectedDevice.isConnected();
      if (!isConnected) {
        throw new Error('Device is no longer connected');
      }

      const service = await connectedDevice.services().then(services => 
        services.find(s => s.uuid.toLowerCase() === SERVICE_UUID.toLowerCase())
      );

      if (!service) {
        throw new Error('Service not found');
      }

      const characteristics = await service.characteristics();
      const resetChar = characteristics.find(c => 
        c.uuid.toLowerCase() === CHARACTERISTICS.reset.toLowerCase()
      );

      if (!resetChar) {
        throw new Error('Reset characteristic not found');
      }

      const data = btoa(String.fromCharCode(byteVal));
      await resetChar.writeWithResponse(data);

      Toast.show({
        type: 'success',
        text1: `${label} command sent successfully`,
      });

      return true;
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: `Failed to send ${label}`,
        text2: error.message,
      });
      return false;
    }
  };

  const value = {
    deviceInfo,
    setDeviceInfo,
    readings,
    setReadings,
    error,
    setError,
    darkMode,
    setDarkMode,
    connectedDevice,
    setConnectedDevice,
    connectionStatus,
    autoConnectEnabled,
    isInitializing,
    bleManagerRef,
    deviceRef,
    connectToDevice,
    disconnectDevice,
    forgetDevice,
    toggleAutoConnect,
    sendCommand,
    saveSettings: async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.AUTO_CONNECT, JSON.stringify(autoConnectEnabled));
      } catch (error) {
        // Silent error handling
      }
    },
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};