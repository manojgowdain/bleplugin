import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';

const AppHeader = ({ rightIcon, onRightIconPress, showBackButton = false }) => {
  const navigation = useNavigation();
  
  return (
    <View style={styles.header}>
      <View style={styles.leftContainer}>
        {showBackButton ? (
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => navigation.goBack()}
          >
            <Icon name="arrow-left" size={24} color="white" />
          </TouchableOpacity>
        ) : (
          <View style={styles.appIdentity}>
            <View style={styles.appLogo}>
              <Text style={styles.appLogoText}>SK</Text>
            </View>
            <Text style={styles.appName}>SKO-Fit</Text>
          </View>
        )}
      </View>
      
      <TouchableOpacity 
        style={styles.statusIcon}
        onPress={onRightIconPress}
      >
        <Icon name={rightIcon || 'dots-vertical'} size={24} color="#6c5ce7" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#121625',
    height: 70,
  },
  leftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e2637',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appLogo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#6c5ce7',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  appLogoText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18,
  },
  appName: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e2637',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AppHeader;