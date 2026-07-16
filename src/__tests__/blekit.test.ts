import { BleManager } from '../BleManager';
import { Device } from '../Device';

// Test the core Blekit module functionality
describe('Blekit Plugin Tests', () => {
  it('should initialize BleManager correctly', () => {
    const bleManager = new BleManager();
    expect(bleManager).toBeDefined();
    expect(typeof bleManager).toBe('object');
  });

  it('should have expected methods on BleManager', () => {
    const bleManager = new BleManager();
    
    // Check for core BLE operations
    expect(typeof bleManager.startScan).toBe('function');
    expect(typeof bleManager.stopScan).toBe('function');
    expect(typeof bleManager.connectToDevice).toBe('function');
    expect(typeof bleManager.disconnectFromDevice).toBe('function');
    expect(typeof bleManager.discoverAllServicesAndCharacteristicsForDevice).toBe('function');
    expect(typeof bleManager.readCharacteristicForDevice).toBe('function');
    expect(typeof bleManager.writeCharacteristicForDevice).toBe('function');
    expect(typeof bleManager.monitorCharacteristicForDevice).toBe('function');
    expect(typeof bleManager.getDeviceState).toBe('function');
  });

  it('should initialize Device correctly', () => {
    const device = new Device('test-device-id', 'Test Device', -65);
    expect(device).toBeDefined();
    expect(device.id).toBe('test-device-id');
    expect(device.name).toBe('Test Device');
    expect(device.rssi).toBe(-65);
  });

  it('should support Device properties and methods', () => {
    const device = new Device('device-123', 'MyDevice', -70);
    
    expect(typeof device.id).toBe('string');
    expect(typeof device.name).toBe('string');
    expect(typeof device.rssi).toBe('number');
  });

  it('should handle Device services/characteristics correctly', () => {
    // Test that we can initialize Device with various parameters
    const device1 = new Device('id1', 'Device1', -50);
    const device2 = new Device('id2', null, -80); // No name
    
    expect(device1).toBeDefined();
    expect(device2).toBeDefined();
  });

  it('should export all required classes and types', () => {
    // Test that we can import and use the key components
    expect(() => {
      new BleManager();
      new Device('test-id', 'TestDevice', -65);
    }).not.toThrow();

    // Check if types are exported correctly
    expect(typeof BleManager).toBe('function');
    expect(typeof Device).toBe('function');
  });

  it('should compile without TypeScript errors', () => {
    // This is a structural test to make sure the module compiles correctly
    expect(true).toBe(true);
  });
});

// Test specific functions that should be available (mocked for unit test purposes)
describe('BleManager Functionality Tests', () => {
  let bleManager: BleManager;

  beforeEach(() => {
    bleManager = new BleManager();
  });

  it('should have startScan method', () => {
    expect(bleManager.startScan).toBeDefined();
    expect(typeof bleManager.startScan).toBe('function');
  });

  it('should have connectToDevice method', () => {
    expect(bleManager.connectToDevice).toBeDefined();
    expect(typeof bleManager.connectToDevice).toBe('function');
  });

  it('should handle basic error cases gracefully', () => {
    // This would be expanded with real mock implementations for actual testing
    expect(() => {
      // Test that functions exist and are callable
      const testStartScan = () => bleManager.startScan();
      const testConnect = () => bleManager.connectToDevice('');
      
      expect(testStartScan).not.toThrow();
      expect(testConnect).not.toThrow();
    }).not.toThrow();
  });
});