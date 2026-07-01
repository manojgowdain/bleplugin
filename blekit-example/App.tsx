import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, FlatList } from 'react-native';
import BlekitModule, { BleManager, Device } from 'blekit';

export default function App() {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState('Ready');

  const startScan = () => {
    setStatus('Scanning...');
    setIsScanning(true);
    
    // Get the BleManager instance
    const bleManager = BlekitModule.getBleManager();
    
    // Reset devices list
    setDevices([]);
    
    // Start scanning for BLE devices
    bleManager.startDeviceScan(null, (error: any, device: Device) => {
      if (error) {
        console.error('Error during scan:', error);
        setStatus('Scan Error');
        setIsScanning(false);
        return;
      }
      
      if (device) {
        // Add new device or update existing one
        setDevices(prev => {
          const existingIndex = prev.findIndex(d => d.id === device.id);
          if (existingIndex >= 0) {
            // Update existing device
            const updated = [...prev];
            updated[existingIndex] = device;
            return updated;
          } else {
            // Add new device
            return [...prev, device];
          }
        });
      }
    });
    
    // Stop scanning after 10 seconds
    setTimeout(() => {
      bleManager.stopDeviceScan();
      setIsScanning(false);
      setStatus('Scan Complete');
    }, 10000);
  };

  const connectToDevice = (device: Device) => {
    setStatus(`Connecting to ${device.name || device.id}...`);
    
    const bleManager = BlekitModule.getBleManager();
    
    bleManager.connectToDevice(device.id)
      .then(() => {
        setStatus('Connected');
        console.log('Connected to device');
      })
      .catch((error: any) => {
        setStatus(`Connection Error: ${error.message}`);
        console.error('Connection error:', error);
      });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BLE Device Scanner</Text>
      <Text style={styles.status}>{status}</Text>
      
      <Button 
        title={isScanning ? "Scanning..." : "Start Scan"} 
        onPress={startScan} 
        disabled={isScanning}
      />
      
      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.deviceItem}>
            <Text style={styles.deviceName}>{item.name || 'Unknown Device'}</Text>
            <Text style={styles.deviceId}>ID: {item.id}</Text>
            <Text style={styles.deviceRssi}>RSSI: {item.rssi}</Text>
            <Button 
              title="Connect" 
              onPress={() => connectToDevice(item)} 
              disabled={!item.id}
            />
          </View>
        )}
      />
      
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  status: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  deviceItem: {
    padding: 15,
    marginVertical: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  deviceName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  deviceId: {
    fontSize: 12,
    color: '#666',
  },
  deviceRssi: {
    fontSize: 14,
    color: '#333',
  },
});
