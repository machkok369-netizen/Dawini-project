import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl
} from 'react-native';
import { auth } from './firebaseConfig';
import AppointmentService from './AppointmentService';

export default function AppointmentHistoryScreen({ navigation }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    setFetchError(false);
    try {
      const userDoc = await auth.currentUser;
      if (!userDoc) return;

      // Try to get as patient first
      const appointments = await AppointmentService.getPatientAppointmentHistory(userDoc.uid);
      setAppointments(appointments);
    } catch (e) {
      console.log("Fetch error:", e);
      setFetchError(true);
      Alert.alert('Connection Error', 'Could not load appointments. Check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAppointments();
    setRefreshing(false);
  };

  const handleCancel = (appointment) => {
    Alert.alert(
      'Cancel Appointment',
      `Cancel appointment with Dr. ${appointment.doctorName}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            const result = await AppointmentService.cancelAppointment(appointment.id, 'patient');
            if (result.success) {
              Alert.alert('Cancelled', 'Appointment has been cancelled');
              fetchAppointments();
            } else {
              Alert.alert('Error', result.error);
            }
          }
        }
      ]
    );
  };

  const handleReschedule = (appointment) => {
    Alert.prompt(
      'Reschedule',
      'This feature coming soon',
      [{ text: 'OK' }]
    );
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'confirmed': return '#059669';
      case 'pending': return '#f59e0b';
      case 'completed': return '#2563eb';
      case 'cancelled': return '#dc2626';
      case 'no_show': return '#6b7280';
      default: return '#334155';
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'confirmed': return '✅';
      case 'pending': return '⏳';
      case 'completed': return '✓';
      case 'cancelled': return '✕';
      case 'no_show': return '—';
      default: return '?';
    }
  };

  const renderAppointment = ({ item }) => {
    const date = item.date;
    const dateStr = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const isUpcoming = item.date > new Date() && ['confirmed', 'pending'].includes(item.status);

    return (
      <View style={[styles.appointmentCard, isUpcoming && styles.appointmentCardUpcoming]}>
        <View style={styles.appointmentHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.appointmentDoctor}>Dr. {item.doctorName}</Text>
            <Text style={styles.appointmentTime}>{item.time}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20', borderColor: getStatusColor(item.status) }]}>
            <Text style={[styles.statusIcon, { color: getStatusColor(item.status) }]}>{getStatusIcon(item.status)}</Text>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
          </View>
        </View>

        <Text style={styles.appointmentDate}>{dateStr}</Text>

        {item.note && <Text style={styles.appointmentNote}>Note: {item.note}</Text>}

        {isUpcoming && (
          <View style={styles.appointmentActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleReschedule(item)}>
              <Text style={styles.actionBtnText}>📅 Reschedule</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => handleCancel(item)}>
              <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>❌ Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  if (fetchError) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>⚠️</Text>
        <Text style={styles.emptyText}>Could not load appointments</Text>
        <TouchableOpacity style={styles.searchBtn} onPress={() => { setLoading(true); fetchAppointments(); }}>
          <Text style={styles.searchBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {appointments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={styles.emptyText}>No appointments yet</Text>
          <TouchableOpacity style={styles.searchBtn} onPress={() => navigation.navigate('PatientMap')}>
            <Text style={styles.searchBtnText}>Search Doctors →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={appointments}
          renderItem={renderAppointment}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 20,
  },
  searchBtn: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  searchBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  listContent: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  appointmentCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  appointmentCardUpcoming: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  appointmentDoctor: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  appointmentTime: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  statusIcon: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  appointmentDate: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 8,
  },
  appointmentNote: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
    marginBottom: 12,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#e2e8f0',
  },
  appointmentActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    alignItems: 'center',
  },
  actionBtnDanger: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  actionBtnText: {
    color: '#059669',
    fontWeight: '600',
    fontSize: 12,
  },
  actionBtnDangerText: {
    color: '#dc2626',
  },
});