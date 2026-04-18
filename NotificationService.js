import {
  collection, addDoc, serverTimestamp, updateDoc, doc, getDoc,
  getDocs, query, where, orderBy, limit, writeBatch
} from 'firebase/firestore';
import { db, auth } from './firebaseConfig';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export class NotificationService {

  // ✅ REGISTER FOR PUSH NOTIFICATIONS AND STORE TOKEN
  static async registerForPushNotifications() {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync();
      const pushToken = tokenData.data;

      // Store push token in Firestore only when it has changed
      if (auth.currentUser && pushToken) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.data()?.pushToken !== pushToken) {
          await updateDoc(userRef, {
            pushToken,
            lastActive: serverTimestamp(),
          });
        }
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#059669',
        });
      }

      return pushToken;
    } catch (e) {
      console.log('Push registration error:', e);
      return null;
    }
  }

  // ✅ SEND A PUSH NOTIFICATION VIA EXPO PUSH API
  static async sendPushNotification(pushToken, title, body) {
    if (!pushToken) return;
    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: pushToken,
          sound: 'default',
          title,
          body,
        }),
      });
    } catch (e) {
      console.log('Push send error:', e);
    }
  }

  // ✅ GET NOTIFICATION TOKEN (legacy — now also registers for push)
  static async getNotificationToken() {
    return await NotificationService.registerForPushNotifications();
  }

  // ✅ SEND APPOINTMENT CONFIRMATION
  static async notifyAppointmentConfirmed(appointmentData) {
    try {
      const { patientId, doctorId, doctorName, time } = appointmentData;

      // In-app notification for patient
      await addDoc(collection(db, 'notifications'), {
        userId: patientId,
        type: 'appointment_confirmed',
        title: '✅ Appointment Confirmed',
        message: `Dr. ${doctorName} at ${time}`,
        appointmentId: appointmentData.id,
        read: false,
        createdAt: serverTimestamp(),
      });

      // In-app notification for doctor
      await addDoc(collection(db, 'notifications'), {
        userId: doctorId,
        type: 'new_appointment',
        title: '📅 New Appointment',
        message: `New appointment at ${time}`,
        appointmentId: appointmentData.id,
        read: false,
        createdAt: serverTimestamp(),
      });

      // Push notification to patient (if they have a token)
      try {
        const patientDoc = await getDoc(doc(db, 'users', patientId));
        const patientToken = patientDoc.data()?.pushToken;
        await NotificationService.sendPushNotification(
          patientToken,
          '✅ Appointment Confirmed',
          `Dr. ${doctorName} at ${time}`
        );
      } catch (e) {
        // Non-critical: push token lookup failed
      }
    } catch (e) {
      console.log('Notification error:', e);
    }
  }

  // ✅ SEND APPOINTMENT REMINDER (24 hours before)
  static async notifyAppointmentReminder(appointmentData) {
    try {
      const { patientId, doctorId, doctorName, time } = appointmentData;

      await addDoc(collection(db, 'notifications'), {
        userId: patientId,
        type: 'appointment_reminder',
        title: '⏰ Appointment Tomorrow',
        message: `${time} with Dr. ${doctorName}`,
        appointmentId: appointmentData.id,
        read: false,
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'notifications'), {
        userId: doctorId,
        type: 'appointment_reminder',
        title: '⏰ Patient Appointment Tomorrow',
        message: `${time}`,
        appointmentId: appointmentData.id,
        read: false,
        createdAt: serverTimestamp(),
      });

      // Push reminder to patient
      try {
        const patientDoc = await getDoc(doc(db, 'users', patientId));
        const patientToken = patientDoc.data()?.pushToken;
        await NotificationService.sendPushNotification(
          patientToken,
          '⏰ Appointment Tomorrow',
          `${time} with Dr. ${doctorName}`
        );
      } catch (e) {
        // Non-critical
      }
    } catch (e) {
      console.log('Reminder error:', e);
    }
  }

  // ✅ NOTIFY APPOINTMENT CANCELLATION
  static async notifyAppointmentCancelled(appointmentData, cancelledBy) {
    try {
      const { patientId, doctorId, doctorName } = appointmentData;

      if (cancelledBy === 'doctor') {
        await addDoc(collection(db, 'notifications'), {
          userId: patientId,
          type: 'appointment_cancelled',
          title: '❌ Appointment Cancelled',
          message: `Dr. ${doctorName} cancelled your appointment`,
          appointmentId: appointmentData.id,
          read: false,
          createdAt: serverTimestamp(),
        });

        // Push to patient
        try {
          const patientDoc = await getDoc(doc(db, 'users', patientId));
          const patientToken = patientDoc.data()?.pushToken;
          await NotificationService.sendPushNotification(
            patientToken,
            '❌ Appointment Cancelled',
            `Dr. ${doctorName} cancelled your appointment`
          );
        } catch (e) {
          // Non-critical
        }
      } else {
        await addDoc(collection(db, 'notifications'), {
          userId: doctorId,
          type: 'appointment_cancelled',
          title: '❌ Appointment Cancelled',
          message: `Patient cancelled the appointment`,
          appointmentId: appointmentData.id,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.log('Cancellation error:', e);
    }
  }

  // ✅ GET NOTIFICATIONS
  static async getNotifications(userId) {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate() : new Date(),
      }));
    } catch (e) {
      console.log('Get notifications error:', e);
      return [];
    }
  }

  // ✅ MARK AS READ
  static async markAsRead(notificationId) {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true,
      });
    } catch (e) {
      console.log('Mark read error:', e);
    }
  }

  // ✅ CLEANUP OLD NOTIFICATIONS (30 days)
  static async cleanupOldNotifications() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const q = query(
        collection(db, 'notifications'),
        where('createdAt', '<', thirtyDaysAgo)
      );

      const snapshot = await getDocs(q);
      const batch = writeBatch(db);

      snapshot.forEach(d => {
        batch.delete(d.ref);
      });

      await batch.commit();
    } catch (e) {
      console.log('Cleanup error:', e);
    }
  }
}

export default NotificationService;