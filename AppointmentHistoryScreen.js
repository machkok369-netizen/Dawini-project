import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, Modal, TextInput, ScrollView
} from 'react-native';
import { auth } from './firebaseConfig';
import AppointmentService from './AppointmentService';
import { useTranslation } from 'react-i18next';
import { useLanguage } from './LanguageContext';
import i18n from './i18n';

const CANCEL_REASONS = [
  { key: 'Schedule conflict', labelKey: 'cancelReasonSchedule' },
  { key: 'Feeling better', labelKey: 'cancelReasonBetter' },
  { key: 'Found another doctor', labelKey: 'cancelReasonOther_doctor' },
  { key: 'Too far away', labelKey: 'cancelReasonFar' },
  { key: 'Financial reasons', labelKey: 'cancelReasonFinancial' },
  { key: 'Other', labelKey: 'cancelReasonOther' },
];

export default function AppointmentHistoryScreen({ navigation }) {
  const { t } = useTranslation('screens');
  const { isRTL } = useLanguage();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // Reschedule modal state
  const [rescheduleVisible, setRescheduleVisible] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  // Cancel with reason modal state
  const [cancelVisible, setCancelVisible] = useState(false);
  const [cancelAppointment, setCancelAppointment] = useState(null);
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    setFetchError(false);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const data = await AppointmentService.getPatientAppointmentHistory(user.uid);
      setAppointments(data);
    } catch (e) {
      console.log("Fetch error:", e);
      setFetchError(true);
      Alert.alert(i18n.t('screens:appointments.couldNotLoad'), i18n.t('screens:appointments.connectionError'));
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAppointments();
    setRefreshing(false);
  };

  // ── Cancel flow ──────────────────────────────────────────────────────────
  const openCancelModal = (appointment) => {
    setCancelAppointment(appointment);
    setSelectedReason('');
    setCustomReason('');
    setCancelVisible(true);
  };

  const confirmCancel = async () => {
    const reason = selectedReason === 'Other' ? customReason.trim() : selectedReason;
    if (!reason) {
      Alert.alert(i18n.t('screens:appointments.selectReasonTitle'), i18n.t('screens:appointments.selectReasonMsg'));
      return;
    }
    setCancelling(true);
    const result = await AppointmentService.cancelAppointment(cancelAppointment.id, 'patient', reason);
    setCancelling(false);
    setCancelVisible(false);
    if (result.success) {
      Alert.alert(i18n.t('screens:appointments.cancelledTitle'), i18n.t('screens:appointments.cancelledMsg'));
      fetchAppointments();
    } else {
      Alert.alert(i18n.t('common:error'), result.error);
    }
  };

  // ── Reschedule flow ───────────────────────────────────────────────────────
  const openRescheduleModal = (appointment) => {
    const existing = appointment.date;
    const dateStr = existing instanceof Date
      ? existing.toISOString().split('T')[0]
      : '';
    setNewDate(dateStr);
    setNewTime(appointment.time || '');
    setSelectedAppointment(appointment);
    setRescheduleVisible(true);
  };

  const confirmReschedule = async () => {
    if (!newDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert(i18n.t('screens:appointments.rescheduleTitle'), i18n.t('screens:appointments.invalidDateMsg'));
      return;
    }
    if (!newTime.match(/^\d{2}:\d{2}$/)) {
      Alert.alert(i18n.t('screens:appointments.rescheduleTitle'), i18n.t('screens:appointments.invalidTimeMsg'));
      return;
    }
    const parsed = new Date(newDate);
    if (isNaN(parsed.getTime()) || parsed < new Date()) {
      Alert.alert(i18n.t('screens:appointments.rescheduleTitle'), i18n.t('screens:appointments.pastDateMsg'));
      return;
    }
    setRescheduling(true);
    const result = await AppointmentService.rescheduleAppointment(
      selectedAppointment.id, newDate, newTime
    );
    setRescheduling(false);
    setRescheduleVisible(false);
    if (result.success) {
      Alert.alert(i18n.t('screens:appointments.rescheduledTitle'), i18n.t('screens:appointments.rescheduledMsg'));
      fetchAppointments();
    } else {
      Alert.alert(i18n.t('common:error'), result.error || i18n.t('screens:appointments.couldNotReschedule'));
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed': return '#059669';
      case 'pending':   return '#f59e0b';
      case 'completed': return '#2563eb';
      case 'cancelled': return '#dc2626';
      case 'no_show':   return '#6b7280';
      default:          return '#334155';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'confirmed': return '✅';
      case 'pending':   return '⏳';
      case 'completed': return '✓';
      case 'cancelled': return '✕';
      case 'no_show':   return '—';
      default:          return '?';
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
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

        {item.note && <Text style={styles.appointmentNote}>{t('appointments.notePrefix')}{item.note}</Text>}

        {item.cancellationReason && (
          <Text style={styles.cancelReason}>{t('appointments.reasonPrefix')}{item.cancellationReason}</Text>
        )}

        {isUpcoming && (
          <View style={styles.appointmentActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => openRescheduleModal(item)}>
              <Text style={styles.actionBtnText}>📅 {t('appointments.reschedule')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => openCancelModal(item)}>
              <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>❌ {t('appointments.cancel')}</Text>
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
        <Text style={styles.emptyText}>{t('appointments.couldNotLoad')}</Text>
        <TouchableOpacity style={styles.searchBtn} onPress={() => { setLoading(true); fetchAppointments(); }}>
          <Text style={styles.searchBtnText}>{t('appointments.reschedule')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      {appointments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={styles.emptyText}>{t('appointments.noAppointments')}</Text>
          <TouchableOpacity style={styles.searchBtn} onPress={() => navigation.navigate('PatientMap')}>
            <Text style={styles.searchBtnText}>{t('appointments.searchDoctors')}</Text>
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

      {/* ── Reschedule Modal ──────────────────────────────────────────────── */}
      <Modal visible={rescheduleVisible} transparent animationType="slide" onRequestClose={() => setRescheduleVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>📅 {t('appointments.rescheduleTitle')}</Text>
            <Text style={styles.modalSub}>Dr. {selectedAppointment?.doctorName}</Text>

            <Text style={styles.fieldLabel}>{t('appointments.newDateLabel')}</Text>
            <TextInput
              style={styles.fieldInput}
              value={newDate}
              onChangeText={setNewDate}
              placeholder={t('appointments.newDatePlaceholder')}
              keyboardType="numeric"
            />

            <Text style={styles.fieldLabel}>{t('appointments.newTimeLabel')}</Text>
            <TextInput
              style={styles.fieldInput}
              value={newTime}
              onChangeText={setNewTime}
              placeholder={t('appointments.newTimePlaceholder')}
              keyboardType="numeric"
            />

            <TouchableOpacity
              style={[styles.modalBtn, rescheduling && styles.modalBtnDisabled]}
              onPress={confirmReschedule}
              disabled={rescheduling}
            >
              {rescheduling
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.modalBtnText}>{t('appointments.confirmReschedule')}</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRescheduleVisible(false)}>
              <Text style={styles.modalCancelText}>{t('appointments.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Cancel with Reason Modal ──────────────────────────────────────── */}
      <Modal visible={cancelVisible} transparent animationType="slide" onRequestClose={() => setCancelVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalSheet}>
            <Text style={styles.modalTitle}>❌ {t('appointments.cancelTitle')}</Text>
            <Text style={styles.modalSub}>Dr. {cancelAppointment?.doctorName} — {t('appointments.cancelSubtitle')}</Text>

            {CANCEL_REASONS.map(r => (
              <TouchableOpacity
                key={r.key}
                style={[styles.reasonBtn, selectedReason === r.key && styles.reasonBtnSelected]}
                onPress={() => setSelectedReason(r.key)}
              >
                <Text style={[styles.reasonText, selectedReason === r.key && styles.reasonTextSelected]}>{t('appointments.' + r.labelKey)}</Text>
              </TouchableOpacity>
            ))}

            {selectedReason === 'Other' && (
              <TextInput
                style={[styles.fieldInput, { marginTop: 8 }]}
                value={customReason}
                onChangeText={setCustomReason}
                placeholder={t('appointments.customReasonPlaceholder')}
                multiline
              />
            )}

            <TouchableOpacity
              style={[styles.modalBtnDanger, cancelling && styles.modalBtnDisabled, { marginTop: 16 }]}
              onPress={confirmCancel}
              disabled={cancelling}
            >
              {cancelling
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.modalBtnText}>{t('appointments.confirmCancellation')}</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setCancelVisible(false)}>
              <Text style={styles.modalCancelText}>{t('appointments.cancel')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
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
    marginBottom: 6,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#e2e8f0',
  },
  cancelReason: {
    fontSize: 11,
    color: '#dc2626',
    fontStyle: 'italic',
    marginBottom: 6,
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
  // Modal shared
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    paddingBottom: 44,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 10,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fafafa',
  },
  modalBtn: {
    backgroundColor: '#059669',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  modalBtnDanger: {
    backgroundColor: '#dc2626',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnDisabled: {
    opacity: 0.6,
  },
  modalBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  modalCancelBtn: {
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  modalCancelText: {
    color: '#6b7280',
    fontSize: 15,
  },
  // Cancel reasons
  reasonBtn: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 13,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
  },
  reasonBtnSelected: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  reasonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  reasonTextSelected: {
    color: '#dc2626',
    fontWeight: '700',
  },
});
