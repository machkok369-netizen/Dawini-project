import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal,
  RefreshControl
} from 'react-native';
import {
  collection, query, where, getDocs, updateDoc, doc,
  getDoc, deleteDoc, writeBatch, addDoc, serverTimestamp, setDoc
} from 'firebase/firestore';
import { db, auth } from './firebaseConfig';

const SUPER_ADMIN_UIDS = process.env.EXPO_PUBLIC_SUPER_ADMIN_UIDS
  ? process.env.EXPO_PUBLIC_SUPER_ADMIN_UIDS.split(',').map((uid) => uid.trim()).filter(Boolean)
  : ["MQcjg6IlHUa0WTfDmfOxqzXcIbG3", "WGQ7mo55xmTBOuQrrTnN98XMI9C3"];

export default function AdminScreen({ navigation }) {
  const [currentTab, setCurrentTab] = useState('dashboard'); // dashboard, doctors, patients, reports, settings
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dashboard data
  const [stats, setStats] = useState({
    totalDoctors: 0,
    totalPatients: 0,
    totalAppointments: 0,
    pendingVerification: 0,
    activeAppointmentsToday: 0,
    totalRatings: 0,
  });

  // Doctors management
  const [doctors, setDoctors] = useState([]);
  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);

  // Patients management
  const [patients, setPatients] = useState([]);

  // Reports
  const [reportData, setReportData] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  // Check if user is admin
  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const uid = auth.currentUser?.uid;
        const userSnap = await getDoc(doc(db, 'users', uid));
        const userData = userSnap.exists() ? userSnap.data() : {};
        const superAdmin = SUPER_ADMIN_UIDS.includes(uid) || userData.adminRole === 'super_admin';
        const admin = superAdmin || userData.role === 'admin' || userData.isAdmin === true;
        if (!admin) {
          Alert.alert('Access Denied', 'You are not an admin');
          navigation.goBack();
          return;
        }
        setIsSuperAdmin(superAdmin);
        loadDashboardData();
      } catch (e) {
        Alert.alert('Error', 'Could not verify admin access');
        navigation.goBack();
      }
    };
    checkAdminAccess();
  }, []);

  const createApprovalRequest = async (type, payload = {}) => {
    await addDoc(collection(db, 'admin_approval_requests'), {
      requestedBy: auth.currentUser.uid,
      type,
      payload,
      status: 'pending',
      createdAt: serverTimestamp(),
      requiresSuperAdminUids: SUPER_ADMIN_UIDS,
    });
  };

  // ==========================================
  // 📊 DASHBOARD DATA
  // ==========================================
  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Total doctors
      const doctorsSnap = await getDocs(
        query(collection(db, 'users'), where('role', '==', 'doctor'))
      );
      const allDoctors = doctorsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Pending verification
      const pendingSnap = await getDocs(
        query(collection(db, 'users'), where('role', '==', 'doctor'), where('isVerified', '==', false))
      );

      // Total patients
      const patientsSnap = await getDocs(
        query(collection(db, 'users'), where('role', '==', 'patient'))
      );

      // Total appointments
      const appointmentsSnap = await getDocs(collection(db, 'reservations'));

      // Today's appointments
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayApptsSnap = await getDocs(
        query(
          collection(db, 'reservations'),
          where('date', '>=', today),
          where('date', '<', tomorrow),
          where('status', 'in', ['pending', 'confirmed'])
        )
      );

      // Total ratings
      const ratingsSnap = await getDocs(collection(db, 'ratings'));
      const suggestionSnap = await getDocs(query(collection(db, 'suggestions')));

      setStats({
        totalDoctors: allDoctors.length,
        totalPatients: patientsSnap.size,
        totalAppointments: appointmentsSnap.size,
        pendingVerification: pendingSnap.size,
        activeAppointmentsToday: todayApptsSnap.size,
        totalRatings: ratingsSnap.size,
      });

      setDoctors(allDoctors);
      setPendingDoctors(pendingSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setPatients(patientsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setSuggestions(suggestionSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    } catch (e) {
      console.log('Load dashboard error:', e);
      Alert.alert('Error', 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  // ==========================================
  // ✅ VERIFY DOCTOR
  // ==========================================
  const verifyDoctor = async () => {
    if (!selectedDoctor) return;
    if (!isSuperAdmin) {
      await createApprovalRequest('verify_doctor', { doctorId: selectedDoctor.id });
      Alert.alert('Approval Required', 'Verification request sent to super admin.');
      setVerifyModalVisible(false);
      return;
    }

    try {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 365); // 1 year free trial

      await updateDoc(doc(db, "users", selectedDoctor.id), {
        isVerified: true,
        subscriptionActive: true,
        subscriptionStart: new Date(),
        subscriptionEnd: endDate,
        verifiedAt: new Date(),
      });

      Alert.alert('✅ Success', `Dr. ${selectedDoctor.fullName} has been verified!\n1 year free trial activated`);
      setVerifyModalVisible(false);
      loadDashboardData();
    } catch (e) {
      Alert.alert('Error', 'Failed to verify doctor: ' + e.message);
    }
  };

  // ==========================================
  // ❌ REJECT DOCTOR
  // ==========================================
  const rejectDoctor = async (doctorId) => {
    if (!isSuperAdmin) {
      createApprovalRequest('delete_doctor', { doctorId });
      Alert.alert('Approval Required', 'Delete request sent to super admin.');
      return;
    }
    Alert.alert(
      'Reject Doctor',
      'Are you sure? This will delete their account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject & Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "users", doctorId));
              Alert.alert('Deleted', 'Doctor account has been deleted');
              loadDashboardData();
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          }
        }
      ]
    );
  };

  // ==========================================
  // 🚫 SUSPEND/BAN USER
  // ==========================================
  const suspendUser = async (userId, reason) => {
    if (!isSuperAdmin) {
      await createApprovalRequest('suspend_user', { userId, reason });
      Alert.alert('Approval Required', 'Suspend request sent to super admin.');
      return;
    }
    try {
      await updateDoc(doc(db, "users", userId), {
        isSuspended: true,
        suspendedAt: new Date(),
        suspensionReason: reason,
      });
      Alert.alert('✅ Suspended', 'User account has been suspended');
      loadDashboardData();
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  // ==========================================
  // 📊 GENERATE REPORTS
  // ==========================================
  const generateReports = async () => {
    try {
      setLoading(true);

      // Doctor statistics
      const doctorStats = {
        totalDoctors: stats.totalDoctors,
        verifiedDoctors: doctors.filter(d => d.isVerified).length,
        unverifiedDoctors: doctors.filter(d => !d.isVerified).length,
        withAppointments: doctors.filter(d => d.totalAppointments > 0).length,
        averageRating: doctors.reduce((sum, d) => sum + (d.averageRating || 0), 0) / doctors.length,
      };

      // Patient statistics
      const patientStats = {
        totalPatients: stats.totalPatients,
        activePatients: patients.filter(p => p.lastActive && new Date(p.lastActive).toDate() > new Date(Date.now() - 7*24*60*60*1000)).length,
      };

      // Appointment statistics
      const appointmentsSnap = await getDocs(collection(db, 'reservations'));
      const appointmentStats = {
        total: appointmentsSnap.size,
        confirmed: appointmentsSnap.docs.filter(d => d.data().status === 'confirmed').length,
        pending: appointmentsSnap.docs.filter(d => d.data().status === 'pending').length,
        cancelled: appointmentsSnap.docs.filter(d => d.data().status === 'cancelled').length,
        completed: appointmentsSnap.docs.filter(d => d.data().status === 'completed').length,
      };

      setReportData({
        generatedAt: new Date(),
        doctors: doctorStats,
        patients: patientStats,
        appointments: appointmentStats,
      });

      Alert.alert('✅ Report Generated', 'See the report below');
    } catch (e) {
      Alert.alert('Error', 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // 🧹 CLEANUP OLD DATA
  // ==========================================
  const cleanupOldData = async () => {
    if (!isSuperAdmin) {
      await createApprovalRequest('cleanup_old_data', {});
      Alert.alert('Approval Required', 'Cleanup request sent to super admin.');
      return;
    }
    Alert.alert(
      'Cleanup Data',
      'Delete notifications and cancelled appointments older than 30 days?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Cleanup',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);

              const thirtyDaysAgo = new Date();
              thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

              // Delete old notifications
              const notificationsSnap = await getDocs(
                query(collection(db, 'notifications'), where('createdAt', '<', thirtyDaysAgo))
              );

              const batch = writeBatch(db);
              notificationsSnap.forEach(doc => batch.delete(doc.ref));

              // Delete old cancelled appointments
              const appointmentsSnap = await getDocs(
                query(
                  collection(db, 'reservations'),
                  where('status', '==', 'cancelled'),
                  where('cancelledAt', '<', thirtyDaysAgo)
                )
              );

              appointmentsSnap.forEach(doc => batch.delete(doc.ref));

              await batch.commit();

              Alert.alert('✅ Cleanup Complete', 'Old data has been deleted');
              loadDashboardData();
            } catch (e) {
              Alert.alert('Error', e.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  // ==========================================
  // 📱 RENDER TABS
  // ==========================================

  const renderDashboard = () => (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>👨‍⚕️</Text>
          <Text style={styles.statValue}>{stats.totalDoctors}</Text>
          <Text style={styles.statLabel}>Total Doctors</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statIcon}>👥</Text>
          <Text style={styles.statValue}>{stats.totalPatients}</Text>
          <Text style={styles.statLabel}>Total Patients</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statIcon}>📅</Text>
          <Text style={styles.statValue}>{stats.totalAppointments}</Text>
          <Text style={styles.statLabel}>Appointments</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statIcon}>⏳</Text>
          <Text style={styles.statValue}>{stats.pendingVerification}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statIcon}>🟢</Text>
          <Text style={styles.statValue}>{stats.activeAppointmentsToday}</Text>
          <Text style={styles.statLabel}>Today</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statIcon}>⭐</Text>
          <Text style={styles.statValue}>{stats.totalRatings}</Text>
          <Text style={styles.statLabel}>Ratings</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <TouchableOpacity style={styles.actionBtn} onPress={generateReports}>
          <Text style={styles.actionBtnIcon}>📊</Text>
          <Text style={styles.actionBtnText}>Generate Reports</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={cleanupOldData}>
          <Text style={styles.actionBtnIcon}>🧹</Text>
          <Text style={styles.actionBtnText}>Cleanup Old Data</Text>
        </TouchableOpacity>
      </View>

      {/* System Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>System Status</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Firebase</Text>
          <View style={[styles.statusDot, { backgroundColor: '#059669' }]} />
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Firestore</Text>
          <View style={[styles.statusDot, { backgroundColor: '#059669' }]} />
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Storage</Text>
          <View style={[styles.statusDot, { backgroundColor: '#059669' }]} />
        </View>
      </View>
    </ScrollView>
  );

  const renderDoctors = () => (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {/* Pending Doctors */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⏳ Pending Verification ({pendingDoctors.length})</Text>
        {pendingDoctors.length === 0 ? (
          <Text style={styles.emptyText}>No pending doctors</Text>
        ) : (
          pendingDoctors.map(doctor => (
            <View key={doctor.id} style={styles.doctorCard}>
              <View style={styles.doctorInfo}>
                <Text style={styles.doctorName}>Dr. {doctor.fullName}</Text>
                <Text style={styles.doctorSpecialty}>{doctor.specialty}</Text>
                <Text style={styles.doctorPhone}>{doctor.phone}</Text>
              </View>
              <View style={styles.doctorActions}>
                <TouchableOpacity
                  style={styles.verifyBtn}
                  onPress={() => {
                    setSelectedDoctor(doctor);
                    setVerifyModalVisible(true);
                  }}
                >
                  <Text style={styles.verifyBtnText}>✅ Verify</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => rejectDoctor(doctor.id)}
                >
                  <Text style={styles.rejectBtnText}>❌ Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Verified Doctors */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>✅ Verified Doctors ({doctors.filter(d => d.isVerified).length})</Text>
        {doctors.filter(d => d.isVerified).map(doctor => (
          <View key={doctor.id} style={styles.doctorCard}>
            <View style={styles.doctorInfo}>
              <Text style={styles.doctorName}>Dr. {doctor.fullName}</Text>
              <Text style={styles.doctorSpecialty}>{doctor.specialty}</Text>
              <Text style={styles.doctorRating}>⭐ {doctor.averageRating || 'N/A'} ({doctor.totalRatings || 0} ratings)</Text>
            </View>
            <TouchableOpacity
              style={styles.suspendBtn}
              onPress={() => suspendUser(doctor.id, 'Admin suspension')}
            >
              <Text style={styles.suspendBtnText}>🚫 Suspend</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  const renderPatients = () => (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>All Patients ({patients.length})</Text>
        {patients.map(patient => (
          <View key={patient.id} style={styles.patientCard}>
            <View style={styles.patientInfo}>
              <Text style={styles.patientName}>{patient.fullName}</Text>
              <Text style={styles.patientPhone}>{patient.phone}</Text>
              <Text style={styles.patientAge}>Age: {patient.age}</Text>
            </View>
            <TouchableOpacity
              style={styles.suspendBtn}
              onPress={() => suspendUser(patient.id, 'Admin suspension')}
            >
              <Text style={styles.suspendBtnText}>🚫 Suspend</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  const renderReports = () => (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {reportData ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 System Report</Text>
          <Text style={styles.reportDate}>Generated: {reportData.generatedAt.toLocaleDateString()}</Text>

          {/* Doctor Stats */}
          <Text style={styles.reportSubtitle}>Doctor Statistics</Text>
          <View style={styles.reportRow}>
            <Text>Total Doctors:</Text>
            <Text style={styles.reportValue}>{reportData.doctors.totalDoctors}</Text>
          </View>
          <View style={styles.reportRow}>
            <Text>Verified:</Text>
            <Text style={styles.reportValue}>{reportData.doctors.verifiedDoctors}</Text>
          </View>
          <View style={styles.reportRow}>
            <Text>Unverified:</Text>
            <Text style={styles.reportValue}>{reportData.doctors.unverifiedDoctors}</Text>
          </View>
          <View style={styles.reportRow}>
            <Text>Average Rating:</Text>
            <Text style={styles.reportValue}>{reportData.doctors.averageRating.toFixed(1)} ⭐</Text>
          </View>

          {/* Patient Stats */}
          <Text style={styles.reportSubtitle}>Patient Statistics</Text>
          <View style={styles.reportRow}>
            <Text>Total Patients:</Text>
            <Text style={styles.reportValue}>{reportData.patients.totalPatients}</Text>
          </View>
          <View style={styles.reportRow}>
            <Text>Active (7 days):</Text>
            <Text style={styles.reportValue}>{reportData.patients.activePatients}</Text>
          </View>

          {/* Appointment Stats */}
          <Text style={styles.reportSubtitle}>Appointment Statistics</Text>
          <View style={styles.reportRow}>
            <Text>Total:</Text>
            <Text style={styles.reportValue}>{reportData.appointments.total}</Text>
          </View>
          <View style={styles.reportRow}>
            <Text>Confirmed:</Text>
            <Text style={styles.reportValue}>{reportData.appointments.confirmed}</Text>
          </View>
          <View style={styles.reportRow}>
            <Text>Pending:</Text>
            <Text style={styles.reportValue}>{reportData.appointments.pending}</Text>
          </View>
          <View style={styles.reportRow}>
            <Text>Completed:</Text>
            <Text style={styles.reportValue}>{reportData.appointments.completed}</Text>
          </View>
          <View style={styles.reportRow}>
            <Text>Cancelled:</Text>
            <Text style={styles.reportValue}>{reportData.appointments.cancelled}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <TouchableOpacity style={styles.generateBtn} onPress={generateReports}>
            <Text style={styles.generateBtnText}>📊 Generate Report</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );

  const initializePaymentPlaceholder = async () => {
    if (!isSuperAdmin) {
      await createApprovalRequest('init_payment_placeholder', {});
      Alert.alert('Approval Required', 'Payment setup request sent to super admin.');
      return;
    }
    try {
      await setDoc(doc(db, 'payment_config', 'el_dahabya'), {
        enabled: false,
        status: 'placeholder',
        provider: 'el_dahabya',
        integrationPoints: [
          'bank_account_linking',
          'transfer_confirmation_webhook',
          'daily_settlement_reconciliation',
        ],
        updatedAt: serverTimestamp(),
      }, { merge: true });
      Alert.alert('Ready', 'El Dahabya payment placeholder initialized.');
    } catch (e) {
      Alert.alert('Error', 'Could not initialize payment placeholder.');
    }
  };

  const renderSuggestions = () => (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💡 Suggestion Box ({suggestions.length})</Text>
        {suggestions.length === 0 ? (
          <Text style={styles.emptyText}>No suggestions yet</Text>
        ) : suggestions.map((item) => (
          <View key={item.id} style={styles.suggestionCard}>
            <Text style={styles.suggestionText}>{item.text || 'No content'}</Text>
            <Text style={styles.suggestionMeta}>
              {item.status || 'new'} · {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'Date pending'}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  const renderSettings = () => (
    <ScrollView>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Admin Settings</Text>
        <View style={styles.permissionBadge}>
          <Text style={styles.permissionBadgeText}>
            {isSuperAdmin ? 'Super Admin: full control' : 'Limited Admin: changes require super admin approval'}
          </Text>
        </View>

        <TouchableOpacity style={styles.settingItem} onPress={cleanupOldData}>
          <View>
            <Text style={styles.settingTitle}>🧹 Cleanup Data</Text>
            <Text style={styles.settingDesc}>Delete old notifications & appointments</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem} onPress={initializePaymentPlaceholder}>
          <View>
            <Text style={styles.settingTitle}>💳 El Dahabya Payment Placeholder</Text>
            <Text style={styles.settingDesc}>Prepare Firestore structure for bank integration</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem} onPress={() => {
          Alert.alert(
            'Logout',
            'Are you sure?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Logout',
                onPress: async () => {
                  navigation.replace('Login');
                },
                style: 'destructive'
              }
            ]
          );
        }}>
          <View>
            <Text style={[styles.settingTitle, { color: '#dc2626' }]}>🚪 Logout</Text>
            <Text style={styles.settingDesc}>Exit admin panel</Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  if (loading && currentTab === 'dashboard') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🛡️ Admin Panel</Text>
        <Text style={styles.headerSubtitle}>{isSuperAdmin ? 'Super admin control center' : 'Admin panel (approval required for critical changes)'}</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, currentTab === 'dashboard' && styles.tabActive]}
          onPress={() => setCurrentTab('dashboard')}
        >
          <Text style={[styles.tabText, currentTab === 'dashboard' && styles.tabTextActive]}>Dashboard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, currentTab === 'doctors' && styles.tabActive]}
          onPress={() => setCurrentTab('doctors')}
        >
          <Text style={[styles.tabText, currentTab === 'doctors' && styles.tabTextActive]}>Doctors</Text>
          {stats.pendingVerification > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{stats.pendingVerification}</Text></View>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, currentTab === 'patients' && styles.tabActive]}
          onPress={() => setCurrentTab('patients')}
        >
          <Text style={[styles.tabText, currentTab === 'patients' && styles.tabTextActive]}>Patients</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, currentTab === 'reports' && styles.tabActive]}
          onPress={() => setCurrentTab('reports')}
        >
          <Text style={[styles.tabText, currentTab === 'reports' && styles.tabTextActive]}>Reports</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, currentTab === 'suggestions' && styles.tabActive]}
          onPress={() => setCurrentTab('suggestions')}
        >
          <Text style={[styles.tabText, currentTab === 'suggestions' && styles.tabTextActive]}>Suggestions</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, currentTab === 'settings' && styles.tabActive]}
          onPress={() => setCurrentTab('settings')}
        >
          <Text style={[styles.tabText, currentTab === 'settings' && styles.tabTextActive]}>Settings</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {currentTab === 'dashboard' && renderDashboard()}
        {currentTab === 'doctors' && renderDoctors()}
        {currentTab === 'patients' && renderPatients()}
        {currentTab === 'reports' && renderReports()}
        {currentTab === 'suggestions' && renderSuggestions()}
        {currentTab === 'settings' && renderSettings()}
      </View>

      {/* Verify Modal */}
      <Modal visible={verifyModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Verify Doctor</Text>
            {selectedDoctor && (
              <>
                <Text style={styles.modalInfo}>Dr. {selectedDoctor.fullName}</Text>
                <Text style={styles.modalDesc}>{selectedDoctor.specialty}</Text>
                <Text style={styles.modalNote}>Grant 1 year free trial?</Text>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setVerifyModalVisible(false)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalVerifyBtn} onPress={verifyDoctor}>
                    <Text style={styles.modalVerifyText}>✅ Verify & Activate</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
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

  // Header
  header: {
    backgroundColor: '#fff',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#dc2626',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 8,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    position: 'relative',
  },
  tabActive: {
    borderBottomColor: '#dc2626',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#dc2626',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  // Content
  content: {
    flex: 1,
  },

  // Dashboard
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 10,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 6,
    textAlign: 'center',
  },

  // Section
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 10,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginTop: 12,
    marginBottom: 8,
  },

  // Doctor Card
  doctorCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  doctorInfo: {
    flex: 1,
  },
  doctorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  doctorSpecialty: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  doctorPhone: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  doctorRating: {
    fontSize: 12,
    color: '#f59e0b',
    marginTop: 2,
    fontWeight: '600',
  },
  doctorActions: {
    flexDirection: 'row',
    gap: 6,
  },
  verifyBtn: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  verifyBtnText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
  },
  rejectBtn: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  rejectBtnText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '700',
  },
  suspendBtn: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  suspendBtnText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '700',
  },

  // Patient Card
  patientCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  patientInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  patientPhone: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  patientAge: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },

  // Quick Actions
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    marginBottom: 8,
    gap: 10,
  },
  actionBtnIcon: {
    fontSize: 20,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },

  // Status
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  statusLabel: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },

  // Reports
  reportDate: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 16,
  },
  reportSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginTop: 14,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  reportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  reportValue: {
    fontWeight: '700',
    color: '#059669',
  },
  generateBtn: {
    backgroundColor: '#dc2626',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  generateBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },

  // Settings
  settingItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  settingDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 3,
  },
  permissionBadge: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  permissionBadgeText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '600',
  },
  suggestionCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
  },
  suggestionText: {
    fontSize: 13,
    color: '#1f2937',
    marginBottom: 4,
  },
  suggestionMeta: {
    fontSize: 11,
    color: '#64748b',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },
  modalInfo: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  modalDesc: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  modalNote: {
    fontSize: 13,
    color: '#059669',
    marginTop: 16,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },
  modalVerifyBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#059669',
    alignItems: 'center',
  },
  modalVerifyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },

  // Empty
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
    paddingVertical: 16,
  },
});
