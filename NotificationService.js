import { collection, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

export class NotificationService {
  
  // ✅ GET NOTIFICATION TOKEN
  static async getNotificationToken() {
    try {
      // For now, simple token storage
      if (auth.currentUser) {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          lastActive: serverTimestamp(),
        });
      }
      return true;
    } catch (e) {
      console.log('Token error:', e);
      return false;
    }
  }

  // ✅ SEND APPOINTMENT CONFIRMATION
  static async notifyAppointmentConfirmed(appointmentData) {
    try {
      const { patientId, doctorId, doctorName, time } = appointmentData;

      // Save to Firestore
      await addDoc(collection(db, 'notifications'), {
        userId: patientId,
        type: 'appointment_confirmed',
        title: '✅ Appointment Confirmed',
        message: `Dr. ${doctorName} at ${time}`,
        appointmentId: appointmentData.id,
        read: false,
        createdAt: serverTimestamp(),
      });

      // Notify doctor
      await addDoc(collection(db, 'notifications'), {
        userId: doctorId,
        type: 'new_appointment',
        title: '📅 New Appointment',
        message: `New appointment at ${time}`,
        appointmentId: appointmentData.id,
        read: false,
        createdAt: serverTimestamp(),
      });
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
    } catch (e) {
      console.log('Reminder error:', e);
    }
  }

  // ✅ NOTIFY APPOINTMENT CANCELLATION
  static async notifyAppointmentCancelled(appointmentData, cancelledBy) {
    try {
      const { patientId, doctorId, doctorName, patientName } = appointmentData;

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
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
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
      
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
    } catch (e) {
      console.log('Cleanup error:', e);
    }
  }
}

export default NotificationService;