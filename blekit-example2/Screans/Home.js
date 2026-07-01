import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Dimensions,
  StatusBar
} from 'react-native';
import {
  Text,
  Surface,
  Button,
  useTheme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAppContext } from '../Store/AppContext';
import AppHeader from './AppHeader';

// StatCard Component with design matching the image
function StatCard({ value, label, iconName, color, max = 100, unit = '', hasGraph = false, theme }) {
  // Special handling for blood pressure
  if (label === "Blood Pressure" && value && value.includes("-")) {
    const [systolic, diastolic] = value.split("-");
    return (
      <Surface style={styles.statCard}>
        <View style={styles.iconContainer}>
          <Icon name={iconName} size={16} color={color} />
          <Text style={styles.statCardLabel}>{label}</Text>
        </View>
        <View style={styles.percentContainer}>
          <Text style={[styles.percentText, { color }]}>0%</Text>
        </View>
        <Text style={styles.statCardValue}>{value}{unit}</Text>
        <Text style={styles.statCardSubtext}>Systolic/Diastolic mmHg</Text>
      </Surface>
    );
  }
  
  // Special handling for sleep state
  if (label === "Sleep") {
    const isSleeping = value.toUpperCase() === "YES";
    const sleepStatusText = isSleeping ? "Sleeping" : "Awake";
    
    return (
      <Surface style={styles.statCard}>
        <View style={styles.iconContainer}>
          <Icon name={iconName} size={16} color={color} />
          <Text style={styles.statCardLabel}>{label}</Text>
        </View>
        <View style={styles.percentContainer}>
          <Text style={[styles.percentText, { color }]}>-</Text>
        </View>
        <Text style={styles.statCardValue}>{sleepStatusText}</Text>
      </Surface>
    );
  }
  
  // Regular handling for numeric values
  const numericVal = Number(value);
  const pct = Math.min(
    100,
    Math.max(0, isNaN(numericVal) ? 0 : Math.round((numericVal / max) * 100))
  );

  return (
    <Surface style={styles.statCard}>
      <View style={styles.iconContainer}>
        <Icon name={iconName} size={16} color={color} />
        <Text style={styles.statCardLabel}>{label}</Text>
      </View>
      <View style={styles.percentContainer}>
        <Text style={[styles.percentText, { color }]}>{pct}%</Text>
      </View>
      <Text style={styles.statCardValue}>
        {isNaN(numericVal) ? '--' : numericVal}{unit}
      </Text>
    </Surface>
  );
}

// Data parsing function
function parseReadingData(data) {
  if (!data) return {
    stepCount: "0",
    calories: "0",
    distance: "0",
    heartRate: "0",
    spo2: "0",
    batteryPercent: "0",
    bp: "0/0",
    status: "Not Connected",
    sleep: "NO",
    stress: "0"
  };
  
  // If data is an object with multiple properties, extract the main data string
  let dataString = data;
  if (typeof data === 'object' && data.data) {
    dataString = data.data;
  }
  
  // Split by comma with optional spaces
  const values = dataString.split(/\s*,\s*/);
  
  // Ensure we have all values, even if some are missing
  const [
    stepCount = "0",
    calories = "0",
    distance = "0",
    heartRate = "0",
    spo2 = "0",
    batteryPercent = "0",
    bp = "0/0",
    status = "Idle",
    sleep = "NO",
    stress = "0"
  ] = values;

  return {
    stepCount,
    calories,
    distance,
    heartRate,
    spo2,
    batteryPercent,
    bp: bp || "0/0",
    status: status || "Idle",
    sleep: sleep || "NO",
    stress: stress || "0"
  };
}

export default function Home({ navigation }) {
  const {
    deviceInfo,
    readings,
    connectionStatus,
    autoConnectEnabled,
    sendCommand,
  } = useAppContext();

  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [parsedData, setParsedData] = useState({
    stepCount: "0",
    calories: "0",
    distance: "0",
    heartRate: "0",
    spo2: "0",
    batteryPercent: "0",
    bp: "0/0",
    status: "Not Connected",
    sleep: "NO",
    stress: "0"
  });

  // Parse the readings data when it changes
  useEffect(() => {
    // Convert readings to a comma-separated string if it's coming in as separate fields
    let dataString = '';
    
    if (readings && typeof readings === 'object') {
      if (readings.data) {
        // If there's a data field, use that directly
        dataString = readings.data;
        console.log("Using readings.data:", readings);
      } else {
        // Try to reconstruct the data string from individual fields
        const steps = readings.steps || "0";
        const calories = readings.calories || "0";
        const distance = readings.distance || "0";
        const heartRate = readings.heartRate || "0";
        const spo2 = readings.spo2 || "0";
        const battery = readings.battery || "0";
        const bp = readings.bp || "0/0";
        const status = readings.status || "Idle";
        const sleep = readings.sleep || "NO";
        const stress = readings.stress || "0";

        dataString = `${steps},${calories},${distance},${heartRate},${spo2},${battery},${bp},${status},${sleep},${stress}`;
      }
    } else if (typeof readings === 'string') {
      dataString = readings;
    }
    
    const newData = parseReadingData(dataString);
    setParsedData(newData);
  }, [readings]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Simulate refresh - in real app, this could trigger data sync
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  const statCards = [
    { key: 'stepCount', label: 'Steps', iconName: 'shoe-print', color: '#6c5ce7', max: 12000, unit: '', hasGraph: false },
    { key: 'calories', label: 'Calories', iconName: 'fire', color: '#e74c3c', max: 4000, unit: ' kcal', hasGraph: false },
    { key: 'distance', label: 'Distance', iconName: 'map-marker-distance', color: '#3498db', max: 20, unit: 'm', hasGraph: false },
    { key: 'heartRate', label: 'Heart Rate', iconName: 'heart-pulse', color: '#e84393', max: 200, unit: ' bpm', hasGraph: false },
    { key: 'spo2', label: 'SpO₂', iconName: 'lungs', color: '#00b894', max: 100, unit: '%', hasGraph: false },
    { key: 'batteryPercent', label: 'Battery', iconName: 'battery', color: '#f1c40f', max: 100, unit: '%', hasGraph: false },
    { key: 'bp', label: 'Blood Pressure', iconName: 'blood-bag', color: '#e74c3c', unit: ' mmHg', hasGraph: false },
    { key: 'sleep', label: 'Sleep', iconName: 'sleep', color: '#6c5ce7', hasGraph: false }
  ];

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#121625" barStyle="light-content" />
      
      <AppHeader 
        rightIcon={connectionStatus === 'connected' ? "bluetooth-connect" : "bluetooth-off"} 
        onRightIconPress={() => navigation.navigate('Connect')}
      />
      
      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={['#6c5ce7']} 
            tintColor="#6c5ce7"
          />
        }
      >
        {/* Main Title Section */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>Your Fitness Data</Text>
          <Text style={styles.subtitle}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {statCards.slice(0, 8).map(card => (
            <StatCard
              key={card.key}
              value={parsedData[card.key]}
              label={card.label}
              iconName={card.iconName}
              color={card.color}
              max={card.max}
              unit={card.unit}
              hasGraph={card.hasGraph}
              theme={theme}
            />
          ))}
        </View>

        {/* Action Buttons - only show when connected */}
        {deviceInfo && connectionStatus === 'connected' && (
          <View style={styles.actionButtons}>
            <Button
              mode="contained"
              onPress={() => sendCommand(0x01, 'Reset')}
              style={[styles.actionButton, { backgroundColor: '#e74c3c' }]}
              contentStyle={styles.buttonContent}
              icon={({size, color}) => (
                <Icon name="refresh" size={size} color={color} />
              )}
            >
              Reset
            </Button>
            <Button
              mode="contained"
              onPress={() => sendCommand(0x02, 'Heart Rate + SpO₂')}
              style={[styles.actionButton, { backgroundColor: '#6c5ce7' }]}
              contentStyle={styles.buttonContent}
              icon={({size, color}) => (
                <Icon name="heart-pulse" size={size} color={color} />
              )}
            >
              Measure
            </Button>
          </View>
        )}

        {/* Device Info Panel - only show when connected */}
        {deviceInfo ? (
          <Surface style={styles.devicePanel}>
            <Text style={styles.panelTitle}>Device Information</Text>
            
            <View style={styles.deviceInfo}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Device Name</Text>
                <Text style={styles.infoValue}>
                  {deviceInfo.name || 'Unnamed Device'}
                </Text>
              </View>
              
              <View style={styles.divider} />
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Device ID</Text>
                <Text style={styles.infoValue}>
                  {deviceInfo.id ? `${deviceInfo.id.slice(0, 8)}...` : 'Unknown'}
                </Text>
              </View>
              
              <View style={styles.divider} />
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Connection Status</Text>
                <View style={styles.connectionStatus}>
                  <View style={[styles.statusIndicator, { backgroundColor: 
                    connectionStatus === 'connected' ? '#00b894' : 
                    connectionStatus === 'connecting' || connectionStatus === 'reconnecting' ? '#f39c12' : 
                    '#e74c3c' 
                  }]} />
                  <Text style={styles.infoValue}>
                    {connectionStatus === 'connected' ? 'Connected' :
                     connectionStatus === 'connecting' ? 'Connecting...' :
                     connectionStatus === 'reconnecting' ? 'Reconnecting...' :
                     'Disconnected'}
                  </Text>
                </View>
              </View>
              
              <View style={styles.divider} />
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Battery Level</Text>
                <Text style={styles.infoValue}>
                  <Icon name="battery" size={16} color="#f1c40f" />
                  {" "}{parsedData.batteryPercent ? `${parsedData.batteryPercent}%` : 'Unknown'}
                </Text>
              </View>
              
              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Last Updated</Text>
                <Text style={styles.infoValue}>
                  {readings.lastUpdated ? new Date(readings.lastUpdated).toLocaleTimeString() : 'Never'}
                </Text>
              </View>
            </View>

            {parsedData.status && (
              <View style={styles.systemStatus}>
                <View style={styles.statusHeader}>
                  <Icon name="information-outline" size={16} color="#6c5ce7" />
                  <Text style={styles.statusHeaderText}>
                    System Status
                  </Text>
                </View>
                <Text style={styles.statusContent}>
                  {parsedData.status}
                </Text>
              </View>
            )}
          </Surface>
        ) : (
          <Surface style={styles.connectPrompt}>
            <Icon 
              name={connectionStatus === 'reconnecting' ? "bluetooth-connect" : "bluetooth-off"} 
              size={60} 
              color={connectionStatus === 'reconnecting' ? "#6c5ce7" : "#95a5a6"} 
            />
            <Text style={styles.connectTitle}>
              {connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Connect Your Device'}
            </Text>
            <Text style={styles.connectText}>
              {connectionStatus === 'reconnecting' ? 
                'Attempting to reconnect to your saved device...' :
                'Pair your fitness tracker to view real-time health metrics'
              }
            </Text>
            {connectionStatus !== 'reconnecting' && (
              <Button
                mode="contained"
                onPress={() => navigation.navigate('Connect')}
                style={styles.connectButton}
                icon={({size, color}) => (
                  <Icon name="bluetooth" size={size} color={color} />
                )}
                buttonColor="#6c5ce7"
              >
                Connect Now
              </Button>
            )}
          </Surface>
        )}
      </ScrollView>
    </View>
  );
}

const { width } = Dimensions.get('window');
const cardWidth = (width - 48) / 2; // 2 cards per row with margins

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121625',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  titleSection: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#a0a5b1',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: cardWidth,
    backgroundColor: '#1e2637',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
  },
  iconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statCardLabel: {
    color: '#a0a5b1',
    fontSize: 14,
    marginLeft: 8,
  },
  percentContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  percentText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statCardValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  statCardSubtext: {
    fontSize: 11,
    color: '#a0a5b1',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 8,
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  devicePanel: {
    backgroundColor: '#1e2637',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 16,
  },
  deviceInfo: {
    marginTop: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#a0a5b1',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: 'white',
  },
  divider: {
    height: 1,
    backgroundColor: '#2d3748',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  systemStatus: {
    marginTop: 20,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#242c3d',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusHeaderText: {
    marginLeft: 8,
    fontWeight: '600',
    fontSize: 14,
    color: 'white',
  },
  statusContent: {
    fontSize: 13,
    lineHeight: 18,
    color: '#a0a5b1',
  },
  connectPrompt: {
    backgroundColor: '#1e2637',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  connectTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  connectText: {
    fontSize: 14,
    color: '#a0a5b1',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  connectButton: {
    minWidth: 160,
    borderRadius: 8,
  },
});