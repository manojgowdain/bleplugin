import React from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  StatusBar,
  TouchableOpacity
} from 'react-native';
import {
  List,
  Switch,
  Button,
  useTheme,
  Divider,
  Text,
  Surface
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAppContext } from '../Store/AppContext';
import AppHeader from './AppHeader';

export default function Settings({ navigation }) {
  const {
    deviceInfo,
    darkMode,
    setDarkMode,
    autoConnectEnabled,
    toggleAutoConnect,
    connectionStatus,
    forgetDevice,
    disconnectDevice,
  } = useAppContext();

  const theme = useTheme();

  const handleForgetDevice = () => {
    Alert.alert(
      'Forget Device',
      'Are you sure you want to forget this device? You will need to reconnect manually.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Forget', 
          style: 'destructive',
          onPress: forgetDevice 
        },
      ]
    );
  };

  const handleDisconnectDevice = () => {
    Alert.alert(
      'Disconnect Device',
      'Are you sure you want to disconnect from this device?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Disconnect', 
          style: 'destructive',
          onPress: disconnectDevice 
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#121625" barStyle="light-content" />
      
      <AppHeader 
        rightIcon="cog"
      />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* <Text style={styles.title}>Settings</Text> */}
        
        {/* Appearance Settings */}
        {/* <Surface style={styles.settingsCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Appearance</Text>
          </View>
          
          <View style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Icon name={darkMode ? "weather-night" : "weather-sunny"} size={22} color="#6c5ce7" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Dark Mode</Text>
              <Text style={styles.settingDescription}>Toggle between light and dark theme</Text>
            </View>
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              color="#6c5ce7"
            />
          </View>
        </Surface> */}

        {/* Device Settings */}
        <Surface style={styles.settingsCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Device Connection</Text>
          </View>
          
          <View style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Icon name="refresh" size={22} color="#6c5ce7" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Auto-Reconnect</Text>
              <Text style={styles.settingDescription}>
                {autoConnectEnabled ? "Automatically reconnect to saved device" : "Manual connection required"}
              </Text>
            </View>
            <Switch
              value={autoConnectEnabled}
              onValueChange={toggleAutoConnect}
              color="#6c5ce7"
            />
          </View>
          
          <Divider style={styles.divider} />
          
          {deviceInfo ? (
            <>
              <View style={styles.settingItem}>
                <View style={styles.settingIcon}>
                  <Icon name="bluetooth-connect" size={22} color="#00b894" />
                </View>
                <View style={styles.settingContent}>
                  <Text style={styles.settingTitle}>Connected Device</Text>
                  <Text style={styles.settingDescription}>
                    {`${deviceInfo.name} • ${connectionStatus}`}
                  </Text>
                </View>
              </View>
              
              <Divider style={styles.divider} />
              
              <View style={styles.deviceActions}>
                <Button
                  mode="outlined"
                  onPress={handleDisconnectDevice}
                  style={[styles.deviceButton, { borderColor: '#a0a5b1' }]}
                  contentStyle={styles.buttonContent}
                  icon={({size, color}) => <Icon name="bluetooth-off" size={size} color={color} />}
                  textColor="#a0a5b1"
                >
                  Disconnect
                </Button>
                <Button
                  mode="contained"
                  onPress={handleForgetDevice}
                  style={[styles.deviceButton, { backgroundColor: '#e74c3c' }]}
                  contentStyle={styles.buttonContent}
                  icon={({size, color}) => <Icon name="delete" size={size} color={color} />}
                >
                  Forget Device
                </Button>
              </View>
            </>
          ) : (
            <>
              <View style={styles.settingItem}>
                <View style={styles.settingIcon}>
                  <Icon name={connectionStatus === 'reconnecting' ? "bluetooth-audio" : "bluetooth-off"} size={22} color="#a0a5b1" />
                </View>
                <View style={styles.settingContent}>
                  <Text style={styles.settingTitle}>No Device Connected</Text>
                  <Text style={styles.settingDescription}>
                    {connectionStatus === 'reconnecting' ? 'Trying to reconnect...' : 'Connect a fitness tracker to get started'}
                  </Text>
                </View>
              </View>
              
              <Divider style={styles.divider} />
              
              <Button
                mode="contained"
                onPress={() => navigation.navigate('Connect')}
                style={styles.connectButton}
                contentStyle={styles.buttonContent}
                icon={({size, color}) => <Icon name="bluetooth" size={size} color={color} />}
                buttonColor="#6c5ce7"
              >
                Connect Device
              </Button>
            </>
          )}
        </Surface>

        {/* Notifications Settings */}
        {/* <Surface style={styles.settingsCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Notifications</Text>
          </View>
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Icon name="trophy" size={22} color="#f39c12" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Goal Achievements</Text>
              <Text style={styles.settingDescription}>Get notified when you reach your daily goals</Text>
            </View>
            <Switch
              value={true}
              onValueChange={() => {}}
              color="#6c5ce7"
            />
          </TouchableOpacity>
          
          <Divider style={styles.divider} />
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Icon name="heart-pulse" size={22} color="#e74c3c" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Health Alerts</Text>
              <Text style={styles.settingDescription}>Receive alerts for unusual health readings</Text>
            </View>
            <Switch
              value={false}
              onValueChange={() => {}}
              color="#6c5ce7"
            />
          </TouchableOpacity>
          
          <Divider style={styles.divider} />
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Icon name="bluetooth-connect" size={22} color="#3498db" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Connection Status</Text>
              <Text style={styles.settingDescription}>Notify when device connects/disconnects</Text>
            </View>
            <Switch
              value={true}
              onValueChange={() => {}}
              color="#6c5ce7"
            />
          </TouchableOpacity>
          
          <Divider style={styles.divider} />
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Icon name="battery-low" size={22} color="#f1c40f" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Low Battery</Text>
              <Text style={styles.settingDescription}>Alert when device battery is low</Text>
            </View>
            <Switch
              value={true}
              onValueChange={() => {}}
              color="#6c5ce7"
            />
          </TouchableOpacity>
        </Surface> */}

        {/* Data & Privacy */}
        <Surface style={styles.settingsCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Data & Privacy</Text>
          </View>
          
          {/* <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Icon name="download" size={22} color="#00b894" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Export Data</Text>
              <Text style={styles.settingDescription}>Download your fitness data</Text>
            </View>
            <Icon name="chevron-right" size={22} color="#a0a5b1" />
          </TouchableOpacity> */}
          
          {/* <Divider style={styles.divider} /> */}
          
          {/* <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Icon name="delete" size={22} color="#e74c3c" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Clear All Data</Text>
              <Text style={styles.settingDescription}>Remove all stored fitness data</Text>
            </View>
            <Icon name="chevron-right" size={22} color="#a0a5b1" />
          </TouchableOpacity>
           */}
          <Divider style={styles.divider} />
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Icon name="shield-account" size={22} color="#6c5ce7" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Privacy Policy</Text>
              <Text style={styles.settingDescription}>View our privacy policy</Text>
            </View>
            <Icon name="chevron-right" size={22} color="#a0a5b1" />
          </TouchableOpacity>
        </Surface>

        {/* About */}
        <Surface style={styles.settingsCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>About</Text>
          </View>
          
          <View style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Icon name="information" size={22} color="#3498db" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Version</Text>
              <Text style={styles.settingDescription}>1.0.1</Text>
            </View>
          </View>
          
          <Divider style={styles.divider} />
          
          <View style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Icon name="account" size={22} color="#6c5ce7" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Developed By</Text>
              <Text style={styles.settingDescription}>Skoegle Iot Innovations PVT LTD</Text>
            </View>
          </View>
          
          <Divider style={styles.divider} />
          
          <View style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Icon name="calendar" size={22} color="#f39c12" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Last Updated</Text>
              <Text style={styles.settingDescription}>2025-03-12</Text>
            </View>
          </View>
          
          <Divider style={styles.divider} />
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Icon name="star" size={22} color="#f39c12" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Rate App</Text>
              <Text style={styles.settingDescription}>Help us improve by rating the app</Text>
            </View>
            <Icon name="chevron-right" size={22} color="#a0a5b1" />
          </TouchableOpacity>
          
          <Divider style={styles.divider} />
{/*           
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Icon name="github" size={22} color="#a0a5b1" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>GitHub Repository</Text>
              <Text style={styles.settingDescription}>View source code and contribute</Text>
            </View>
            <Icon name="chevron-right" size={22} color="#a0a5b1" />
          </TouchableOpacity> */}
        </Surface>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121625', // Dark navy background
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 24,
  },
  settingsCard: {
    backgroundColor: '#1e2637',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  settingIcon: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#242c3d',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'white',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: '#a0a5b1',
  },
  divider: {
    backgroundColor: '#2d3748',
    height: 1,
  },
  deviceActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    margin: 16,
  },
  deviceButton: {
    flex: 1,
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 6,
  },
  connectButton: {
    margin: 16,
    borderRadius: 8,
    backgroundColor: '#6c5ce7',
  },
});