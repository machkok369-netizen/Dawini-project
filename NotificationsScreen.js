import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl
} from 'react-native';
import { onSnapshot, query, collection, where, orderBy } from 'firebase/firestore';
import { db, auth } from './firebaseConfig';
import NotificationService from './NotificationService';
import { useTranslation } from 'react-i18next';
import { useLanguage } from './LanguageContext';
import { useTheme } from './ThemeContext';
import { Feather } from '@expo/vector-icons';

// Feather icon for each notification type
const NOTIF_ICON = {
  appointment_confirmed: 'check-circle',
  appointment_reminder:  'clock',
  appointment_cancelled: 'x-circle',
  new_appointment:       'calendar',
};

export default function NotificationsScreen({ navigation }) {
  const { t } = useTranslation('screens');
  const { isRTL } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
    await NotificationService.markAsRead(notification.id);
    if (notification.appointmentId && notification.type === 'appointment_confirmed') {
      navigation.navigate('AppointmentHistory');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'appointment_confirmed': return colors.success;
      case 'appointment_reminder':  return colors.warning;
      case 'appointment_cancelled': return colors.danger;
      case 'new_appointment':       return '#2563eb';
      default:                      return colors.textSecondary;
    }
  };

  const renderNotification = ({ item }) => {
    const color = getNotificationColor(item.type);
    return (
      <TouchableOpacity
        style={[styles.notificationCard, !item.read && styles.notificationCardUnread]}
        onPress={() => handleNotificationTap(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.notificationIcon, { backgroundColor: color + '20' }]}>
          <Feather name={NOTIF_ICON[item.type] || 'bell'} size={20} color={color} />
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
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Feather name="bell" size={32} color={colors.primary} />
          </View>
          <Text style={styles.emptyText}>{t('notifications.noNotifications')}</Text>
          <Text style={styles.emptySubtext}>{t('notifications.noNotificationsSubtext')}</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const createStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background },
  emptyIconWrap: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 4 },
  emptySubtext: { fontSize: 13, color: c.textTertiary, textAlign: 'center', paddingHorizontal: 40 },
  listContent: { paddingVertical: 12, paddingHorizontal: 12, paddingBottom: 120 },
  notificationCard: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: c.card,
    borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border,
  },
  notificationCardUnread: { backgroundColor: c.primaryLight, borderColor: c.primaryMid },
  notificationIcon: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  notificationContent: { flex: 1 },
  notificationTitle: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 3 },
  notificationMessage: { fontSize: 12, color: c.textSecondary, marginBottom: 6 },
  notificationTime: { fontSize: 11, color: c.textTertiary },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.primary, marginLeft: 8, marginTop: 2 },
});
