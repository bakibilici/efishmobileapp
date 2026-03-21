import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useCarModeNavigation } from '../hooks/useCarModeNavigation';
import { ActivityStateMachine } from '../services/ActivityStateMachine';

interface CarModeModalProps {
  fsm: ActivityStateMachine;
}

/**
 * Presentational component that consumes our custom navigation hook.
 * This can be placed at the root layout of your app so it can trigger anywhere.
 */
export function CarModeModal({ fsm }: CarModeModalProps) {
  const { isModalVisible, onConfirm, onDismiss } = useCarModeNavigation({ fsm });

  if (!isModalVisible) return null;

  return (
    <Modal visible={isModalVisible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>Nereye gidiyorsun?</Text>
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onDismiss}>
              <Text style={styles.cancelText}>İptal</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
              <Text style={styles.confirmText}>Route Plan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 12,
    width: '80%',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 24,
    color: '#333',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  confirmButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  cancelText: {
    color: '#666',
    fontWeight: '500',
  },
  confirmText: {
    color: 'white',
    fontWeight: '500',
  },
});
