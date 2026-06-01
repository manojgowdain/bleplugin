const { AndroidConfig, createRunOncePlugin, withInfoPlist } = require('@expo/config-plugins');

const pkg = require('../package.json');

const ANDROID_PERMISSIONS = [
	'android.permission.BLUETOOTH_SCAN',
	'android.permission.BLUETOOTH_CONNECT',
	'android.permission.ACCESS_FINE_LOCATION',
];

function withExpoDeviceInfo(config) {
	config = withInfoPlist(config, (config) => {
		config.modResults.NSBluetoothAlwaysUsageDescription =
			config.modResults.NSBluetoothAlwaysUsageDescription ||
			'Allow $(PRODUCT_NAME) to scan for and connect to nearby Bluetooth devices.';
		config.modResults.NSBluetoothPeripheralUsageDescription =
			config.modResults.NSBluetoothPeripheralUsageDescription ||
			'Allow $(PRODUCT_NAME) to access Bluetooth peripherals.';
		return config;
	});

	config = AndroidConfig.Permissions.withPermissions(config, ANDROID_PERMISSIONS);

	return config;
}

module.exports = createRunOncePlugin(withExpoDeviceInfo, pkg.name, pkg.version);