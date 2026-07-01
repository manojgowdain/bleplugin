import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Provider as PaperProvider, MD3DarkTheme } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Linking
} from 'react-native';

import Toast from 'react-native-toast-message';
import { SafeAreaView } from 'react-native-safe-area-context';

import Home from './Screans/Home';
import Connect from './Screans/Connect';
import Settings from './Screans/Settings';

import { AppProvider, useAppContext } from './Store/AppContext';

const Tab = createBottomTabNavigator();

const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#6c5ce7',
    secondary: '#94A3B8',
    surface: '#1e2637',
    background: '#121625',
    onBackground: '#FFFFFF',
    onSurface: '#FFFFFF',
    error: '#e74c3c',
  },
};

function BluetoothRequiredScreen() {

  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {

    const timer = setTimeout(() => {
      setConfirmed(true);
    }, 3000);

    return () => clearTimeout(timer);

  }, []);

  return (
    <View style={styles.loadingContainer}>

      <View style={styles.appLogoContainer}>
        <Text style={styles.appLogoText}>SK</Text>
      </View>

      <Text style={styles.appName}>SKO-Fit</Text>

      <ActivityIndicator
        size="large"
        color="#6c5ce7"
        style={styles.loadingIndicator}
      />

      {!confirmed && (
        <Text style={styles.bleText}>
          Checking Bluetooth status...
        </Text>
      )}

      {confirmed && (
        <>
          <Text style={styles.bleText}>
            Bluetooth is required to use this device.
          </Text>

          <TouchableOpacity
            style={styles.button}
            onPress={() => Linking.openSettings()}
          >
            <Text style={styles.buttonText}>Open Bluetooth Settings</Text>
          </TouchableOpacity>
        </>
      )}

    </View>
  );
}

function AppNavigator() {

  const { connectionStatus, isInitializing } = useAppContext();

  // 🚨 BLOCK APP IF BLE OFF
  if (isInitializing) {
    return <BluetoothRequiredScreen />;
  }

  const getConnectionStatusIcon = () => {

    switch (connectionStatus) {

      case 'connected':
        return 'bluetooth-connect';

      case 'connecting':
      case 'reconnecting':
        return 'bluetooth-audio';

      default:
        return 'bluetooth-off';
    }
  };

  const getConnectionStatusColor = () => {

    switch (connectionStatus) {

      case 'connected':
        return '#00b894';

      case 'connecting':
      case 'reconnecting':
        return '#f39c12';

      default:
        return '#a0a5b1';
    }
  };

  return (
    <PaperProvider theme={darkTheme}>

      <NavigationContainer>

        <StatusBar style="light" />

        <Tab.Navigator
          screenOptions={({ route }) => ({

            tabBarIcon: ({ focused, color, size }) => {

              let iconName;

              if (route.name === 'Home') {
                iconName = 'view-dashboard';
              }

              else if (route.name === 'Connect') {

                iconName = getConnectionStatusIcon();

                if (!focused) {
                  color = getConnectionStatusColor();
                }

              }

              else if (route.name === 'Settings') {
                iconName = 'cog';
              }

              return <Icon name={iconName} size={size} color={color} />;

            },

            tabBarActiveTintColor: '#6c5ce7',
            tabBarInactiveTintColor: '#a0a5b1',

            tabBarStyle: {
              backgroundColor: '#1e2637',
              borderTopWidth: 0,
              elevation: 8,
              height: 60,
              paddingBottom: 8,
              paddingTop: 8,
            },

            headerShown: false,

          })}
        >

          <Tab.Screen
            name="Home"
            component={Home}
            options={{ title: 'Dashboard' }}
          />

          <Tab.Screen
            name="Connect"
            component={Connect}
            options={{
              title: connectionStatus === 'connected'
                ? 'Connected'
                : 'Connect',
            }}
          />

          <Tab.Screen
            name="Settings"
            component={Settings}
            options={{ title: 'Settings' }}
          />

        </Tab.Navigator>

        <Toast />

      </NavigationContainer>

    </PaperProvider>
  );
}

export default function App() {

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <AppProvider>
        <AppNavigator />
      </AppProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121625',
  },

  appLogoContainer: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: '#6c5ce7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },

  appLogoText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 32,
  },

  appName: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },

  loadingIndicator: {
    marginTop: 10,
    marginBottom: 20,
  },

  bleText: {
    color: '#a0a5b1',
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    paddingHorizontal: 40,
  },

  button: {
    backgroundColor: '#6c5ce7',
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 8,
  },

  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },

});