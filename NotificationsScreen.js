import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert
} from 'react-native';
import { onSnapshot, query, collection, where, orderBy } from 'firebase/firestore';
import { db, auth } from './firebaseConfig';
import NotificationService from './NotificationService';
import { useTranslation } from 'react-i18next';
import { useLanguage } from './LanguageContext';

export default function NotificationsScreen({ navigation }) {
  const { t } = useTranslation('screens');
  const { isRTL } = useLanguage();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'notifications'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
      ),
      (snapshot) => {
        const notifs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
        }));
        setNotifications(notifs);
        setLoading(false);
      },
      (error) => {
        console.log('Notification listener error:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleNotificationTap = async (notification) => {
    // Mark as read
    await NotificationService.markAsRead(notification.id);

    // Navigate if appointment-related
    if (notification.appointmentId && notification.type === 'appointment_confirmed') {
      navigation.navigate('AppointmentHistory');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // Refresh will happen automatically via listener
    setTimeout(() => setRefreshing(false), 1000);
  };

  const getNotificationIcon = (type) => {
    switch(type) {
      case 'appointment_confirmed': return '✅';
      case 'appointment_reminder': return '⏰';
      case 'appointment_cancelled': return '❌';
      case 'new_appointment': return '📅';
      default: return '📢';
    }
  };

  const getNotificationColor = (type) => {
    switch(type) {
      case 'appointment_confirmed': return '#059669';
      case 'appointment_reminder': return '#f59e0b';
      case 'appointment_cancelled': return '#dc2626';
      case 'new_appointment': return '#2563eb';
      default: return '#6b7280';
    }
  };

  const renderNotification = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.notificationCard,
        !item.read && styles.notificationCardUnread
      ]}
      onPress={() => handleNotificationTap(item)}
    >
      <View style={[styles.notificationIcon, { backgroundColor: getNotificationColor(item.type) + '20' }]}>
        <Text style={styles.notificationIconText}>{getNotificationIcon(item.type)}</Text>
      </View>

      <View style={styles.notificationContent}>
        <Text style={styles.notificationTitle}>{item.title}</Text>
        <Text style={styles.notificationMessage}>{item.message}</Text>
        <Text style={styles.notificationTime}>
          {item.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>

      {!item.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyText}>{t('notifications.noNotifications')}</Text>
          <Text style={styles.emptySubtext}>{t('notifications.noNotificationsSubtext')}</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotification}
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
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#94a3b8',
  },
  listContent: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  notificationCardUnread: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  notificationIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificationIconText: {
    fontSize: 20,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 3,
  },
  notificationMessage: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 6,
  },
  notificationTime: {
    fontSize: 11,
    color: '#94a3b8',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#059669',
    marginLeft: 8,
    marginTop: 2,
  },
});