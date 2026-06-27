import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, Modal, TextInput, ScrollView
} from 'react-native';
import { auth } from './firebaseConfig';
import AppointmentService from './AppointmentService';
import { useTranslation } from 'react-i18next';
import { useLanguage } from './LanguageContext';
import { useTheme } from './ThemeContext';
import i18n from './i18n';
import { Feather } from '@expo/vector-icons';

const CANCEL_REASONS = [
  { key: 'Schedule conflict', labelKey: 'cancelReasonSchedule' },
  { key: 'Feeling better', labelKey: 'cancelReasonBetter' },
  { key: 'Found another doctor', labelKey: 'cancelReasonOther_doctor' },
  { key: 'Too far away', labelKey: 'cancelReasonFar' },
  { key: 'Financial reasons', labelKey: 'cancelReasonFinancial' },
  { key: 'Other', labelKey: 'cancelReasonOther' },
];

// Feather icon name for each status
const STATUS_ICON = {
  confirmed: 'check-circle',
  pending:   'clock',
  completed: 'check',
  cancelled: 'x',
  no_show:   'minus',
};

export default function AppointmentHistoryScreen({ navigation }) {
  const { t } = useTranslation('screens');
  const { isRTL } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const [rescheduleVisible, setRescheduleVisible] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

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

  const openRescheduleModal = (appointment) => {
    const existing = appointment.date;
    const dateStr = existing instanceof Date ? existing.toISOString().split('T')[0] : '';
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
    const result = await AppointmentService.rescheduleAppointment(selectedAppointment.id, newDate, newTime);
    setRescheduling(false);
    setRescheduleVisible(false);
    if (result.success) {
      Alert.alert(i18n.t('screens:appointments.rescheduledTitle'), i18n.t('screens:appointments.rescheduledMsg'));
      fetchAppointments();
    } else {
      Alert.alert(i18n.t('common:error'), result.error || i18n.t('screens:appointments.couldNotReschedule'));
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed': return colors.success;
      case 'pending':   return colors.warning;
      case 'completed': return '#2563eb';
      case 'cancelled': return colors.danger;
      case 'no_show':   return colors.textSecondary;
      default:          return colors.textSecondary;
    }
  };

  const renderAppointment = ({ item }) => {
    const date = item.date;
    const dateStr = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const isUpcoming = item.date > new Date() && ['confirmed', 'pending'].includes(item.status);
    const statusColor = getStatusColor(item.status);

    return (
      <View style={[styles.appointmentCard, isUpcoming && styles.appointmentCardUpcoming]}>
        <View style={styles.appointmentHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.appointmentDoctor}>Dr. {item.doctorName}</Text>
            <Text style={styles.appointmentTime}>{item.time}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor }]}>
            <Feather name={STATUS_ICON[item.status] || 'help-circle'} size={12} color={statusColor} />
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
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
              <Feather name="calendar" size={14} color={colors.primary} style={{ marginRight: 5 }} />
              <Text style={styles.actionBtnText}>{t('appointments.reschedule')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => openCancelModal(item)}>
              <Feather name="x" size={14} color={colors.danger} style={{ marginRight: 5 }} />
              <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>{t('appointments.cancel')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (fetchError) {
    return (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIconWrap, { backgroundColor: colors.dangerLight }]}>
          <Feather name="alert-triangle" size={30} color={colors.danger} />
        </View>
        <Text style={styles.emptyText}>{t('appointments.couldNotLoad')}</Text>
        <TouchableOpacity style={styles.searchBtn} onPress={() => { setLoading(true); fetchAppointments(); }}>
          <Text style={styles.searchBtnText}>{t('common:tryAgain')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      {appointments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Feather name="calendar" size={32} color={colors.primary} />
          </View>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* ── Reschedule Modal ── */}
      <Modal visible={rescheduleVisible} transparent animationType="slide" onRequestClose={() => setRescheduleVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalTitleRow}>
              <Feather name="calendar" size={20} color={colors.text} style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>{t('appointments.rescheduleTitle')}</Text>
            </View>
            <Text style={styles.modalSub}>Dr. {selectedAppointment?.doctorName}</Text>

            <Text style={styles.fieldLabel}>{t('appointments.newDateLabel')}</Text>
            <TextInput
              style={styles.fieldInput}
              value={newDate}
              onChangeText={setNewDate}
              placeholder={t('appointments.newDatePlaceholder')}
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
            />

            <Text style={styles.fieldLabel}>{t('appointments.newTimeLabel')}</Text>
            <TextInput
              style={styles.fieldInput}
              value={newTime}
              onChangeText={setNewTime}
              placeholder={t('appointments.newTimePlaceholder')}
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
            />

            <TouchableOpacity
              style={[styles.modalBtn, rescheduling && styles.modalBtnDisabled]}
              onPress={confirmReschedule}
              disabled={rescheduling}
            >
              {rescheduling ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>{t('appointments.confirmReschedule')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRescheduleVisible(false)}>
              <Text style={styles.modalCancelText}>{t('appointments.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Cancel with Reason Modal ── */}
      <Modal visible={cancelVisible} transparent animationType="slide" onRequestClose={() => setCancelVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalSheet}>
            <View style={styles.modalTitleRow}>
              <Feather name="x-circle" size={20} color={colors.danger} style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>{t('appointments.cancelTitle')}</Text>
            </View>
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
                placeholderTextColor={colors.placeholder}
                multiline
              />
            )}

            <TouchableOpacity
              style={[styles.modalBtnDanger, cancelling && styles.modalBtnDisabled, { marginTop: 16 }]}
              onPress={confirmCancel}
              disabled={cancelling}
            >
              {cancelling ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>{t('appointments.confirmCancellation')}</Text>}
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

const createStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background },
  emptyIconWrap: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 20 },
  searchBtn: { backgroundColor: c.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  searchBtnText: { color: '#fff', fontWeight: '700' },
  listContent: { paddingVertical: 12, paddingHorizontal: 12, paddingBottom: 120 },
  appointmentCard: {
    backgroundColor: c.card, borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: c.border,
  },
  appointmentCardUpcoming: { borderColor: c.primaryMid, backgroundColor: c.primaryLight },
  appointmentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  appointmentDoctor: { fontSize: 15, fontWeight: '700', color: c.text },
  appointmentTime: { fontSize: 13, color: c.textSecondary, marginTop: 3 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, gap: 4 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  appointmentDate: { fontSize: 12, color: c.textTertiary, marginBottom: 8 },
  appointmentNote: { fontSize: 12, color: c.textSecondary, fontStyle: 'italic', marginBottom: 6, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: c.border },
  cancelReason: { fontSize: 11, color: c.danger, fontStyle: 'italic', marginBottom: 6 },
  appointmentActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, backgroundColor: c.primaryLight, borderWidth: 1, borderColor: c.primaryMid, alignItems: 'center', justifyContent: 'center' },
  actionBtnDanger: { backgroundColor: c.dangerLight, borderColor: c.danger },
  actionBtnText: { color: c.primary, fontWeight: '600', fontSize: 12 },
  actionBtnDangerText: { color: c.danger },
  modalOverlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingBottom: 44 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: c.text },
  modalSub: { fontSize: 13, color: c.textSecondary, marginBottom: 20 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: c.textSecondary, marginBottom: 6, marginTop: 10 },
  fieldInput: { borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: c.inputBackground, color: c.text },
  modalBtn: { backgroundColor: c.primary, padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  modalBtnDanger: { backgroundColor: c.danger, padding: 15, borderRadius: 12, alignItems: 'center' },
  modalBtnDisabled: { opacity: 0.6 },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalCancelBtn: { padding: 14, alignItems: 'center', marginTop: 4 },
  modalCancelText: { color: c.textSecondary, fontSize: 15 },
  reasonBtn: { borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 13, marginBottom: 8, backgroundColor: c.inputBackground },
  reasonBtnSelected: { borderColor: c.danger, backgroundColor: c.dangerLight },
  reasonText: { fontSize: 14, color: c.text, fontWeight: '500' },
  reasonTextSelected: { color: c.danger, fontWeight: '700' },
});
