import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
} from "react-native";

import BLE from "expo-device-info";

const SERVICE_UUID = "19b10000-e8f2-537e-4f6c-d104768a1214";
const CHARACTERISTIC_UUID = "19b10001-e8f2-537e-4f6c-d104768a1214";

function bytesToText(bytes) {
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

export default function App() {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [connected, setConnected] = useState(false);
  const [lastData, setLastData] = useState("");
  const [status, setStatus] = useState("Idle");

  useEffect(() => {
    const subscriptions = [
      BLE.addListener("deviceFound", (device) => {
        console.log("FOUND DEVICE:", device);

        setDevices((current) => {
          const exists = current.find((d) => d.id === device.id);

          if (exists) {
            return current;
          }

          return [...current, device];
        });
      }),

      BLE.addListener("connected", async (event) => {
        console.log("CONNECTED:", event);

        setConnected(true);
        setStatus("Connected");

        try {
          await BLE.startNotifications(
            event.deviceId,
            SERVICE_UUID,
            CHARACTERISTIC_UUID
          );

          console.log("Notifications Started");
        } catch (error) {
          console.log("Notification Error:", error);
        }
      }),

      BLE.addListener("disconnected", (event) => {
        console.log("DISCONNECTED:", event);

        setConnected(false);
        setStatus("Disconnected");
      }),

      BLE.addListener("characteristicChanged", (event) => {
        console.log("NOTIFICATION EVENT:", event);

        const text = bytesToText(event.value);
        const hex = bytesToHex(event.value);

        console.log("TEXT:", text);
        console.log("HEX:", hex);

        setLastData(text || hex);
      }),

      BLE.addListener("error", (event) => {
        console.log("BLE ERROR:", event);

        setStatus(event.message);
      }),
    ];

    return () => {
      subscriptions.forEach((s) => s.remove());
    };
  }, []);

  async function requestPermissions() {
    try {
      const result = await BLE.requestPermissions();

      console.log(result);

      setStatus(
        result.granted
          ? "Permissions Granted"
          : "Permissions Denied"
      );
    } catch (error) {
      console.log(error);
    }
  }

  async function scanDevices() {
    try {
      setDevices([]);
      setStatus("Scanning...");

      await BLE.startScan({
        acceptAllDevices: true,
        serviceUUIDs: [SERVICE_UUID],
      });
    } catch (error) {
      console.log(error);
    }
  }

  async function connectDevice() {
    if (!selectedDevice) {
      return;
    }

    try {
      setStatus("Connecting...");

      await BLE.connect(selectedDevice.id);
    } catch (error) {
      console.log(error);
    }
  }

  async function disconnectDevice() {
    if (!selectedDevice) {
      return;
    }

    try {
      await BLE.disconnect(selectedDevice.id);
    } catch (error) {
      console.log(error);
    }
  }

  async function readCharacteristic() {
    if (!selectedDevice) {
      return;
    }

    try {
      const value = await BLE.read(
        selectedDevice.id,
        SERVICE_UUID,
        CHARACTERISTIC_UUID
      );

      console.log("READ:", value);

      const text = bytesToText(value);
      const hex = bytesToHex(value);

      console.log("READ TEXT:", text);
      console.log("READ HEX:", hex);

      setLastData(text || hex);
    } catch (error) {
      console.log(error);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>

        <Text style={styles.title}>
          Expo BLE Demo
        </Text>

        <Text style={styles.status}>
          Status: {status}
        </Text>

        <Text style={styles.status}>
          Connected: {connected ? "YES" : "NO"}
        </Text>

        <Pressable
          style={styles.button}
          onPress={requestPermissions}
        >
          <Text style={styles.buttonText}>
            Request Permissions
          </Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={scanDevices}
        >
          <Text style={styles.buttonText}>
            Scan Devices
          </Text>
        </Pressable>

        <Text style={styles.section}>
          Devices
        </Text>

      {devices.map((device) => {
  console.log("RENDER DEVICE:", device);

  return (
    <Pressable
      key={device.id}
      style={[
        styles.deviceCard,
        selectedDevice?.id === device.id &&
          styles.selectedCard,
      ]}
      onPress={() => setSelectedDevice(device)}
    >
      <Text style={styles.deviceName}>
        {device.name || "Unknown Device"}
      </Text>

      <Text style={styles.deviceId}>
        {device.id}
      </Text>
    </Pressable>
  );
})}

        {selectedDevice && (
          <>
            <Text style={styles.section}>
              Selected Device
            </Text>

            <Text style={styles.deviceName}>
              {selectedDevice.name || "Unknown Device"}
            </Text>

            <Text style={styles.deviceId}>
              {selectedDevice.id}
            </Text>

            <Pressable
              style={styles.button}
              onPress={connectDevice}
            >
              <Text style={styles.buttonText}>
                Connect
              </Text>
            </Pressable>

            <Pressable
              style={styles.button}
              onPress={readCharacteristic}
            >
              <Text style={styles.buttonText}>
                Read Data
              </Text>
            </Pressable>

            <Pressable
              style={styles.button}
              onPress={disconnectDevice}
            >
              <Text style={styles.buttonText}>
                Disconnect
              </Text>
            </Pressable>
          </>
        )}

        <View style={styles.dataBox}>
          <Text style={styles.section}>
            Incoming Data
          </Text>

          <Text style={styles.dataText}>
            {lastData || "Waiting for data..."}
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d1117",
    padding: 20,
  },

  title: {
    fontSize: 28,
    color: "#fff",
    fontWeight: "bold",
    marginBottom: 10,
  },

  status: {
    color: "#ddd",
    marginBottom: 8,
  },

  section: {
    color: "#fff",
    fontSize: 18,
    marginTop: 20,
    marginBottom: 10,
    fontWeight: "600",
  },

  button: {
    backgroundColor: "#2563eb",
    padding: 14,
    borderRadius: 10,
    marginTop: 10,
  },

  buttonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "600",
  },

  deviceCard: {
    backgroundColor: "#1f2937",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },

  selectedCard: {
    borderWidth: 2,
    borderColor: "#22c55e",
  },

  deviceName: {
    color: "#fff",
    fontWeight: "600",
  },

  deviceId: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 4,
  },

  dataBox: {
    marginTop: 20,
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#111827",
  },

  dataText: {
    color: "#22c55e",
    fontSize: 16,
    marginTop: 10,
  },
});