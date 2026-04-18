import {
  collection, addDoc, updateDoc, doc, getDocs, query, where,
  serverTimestamp, increment, getDoc, orderBy, writeBatch, deleteDoc, setDoc, limit
} from 'firebase/firestore';
import { db, auth } from './firebaseConfig';
import NotificationService from './NotificationService';

export class AppointmentService {

  // ✅ CREATE APPOINTMENT
  static async createAppointment(appointmentData) {
    try {
      const { doctorId, patientId, date, time, note } = appointmentData;

      const doctorDoc = await getDoc(doc(db, "users", doctorId));
      const doctorData = doctorDoc.data();

      const patientDoc = await getDoc(doc(db, "users", patientId));
      const patientData = patientDoc.data();

      const dateKey = new Date(date).toISOString().split('T')[0];
      const acceptMode = doctorData.acceptMode || 'manual';

      const appointment = {
        doctorId,
        patientId,
        doctorName: doctorData?.fullName || 'Doctor',
        patientName: patientData?.fullName || 'Patient',
        patientPhone: patientData?.phone || '',
        patientAge: patientData?.age || null,
        date: new Date(date),
        time,
        note,
        status: acceptMode === 'auto' ? 'confirmed' : 'pending',
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'reservations'), appointment);

      // Increment booked slots
      try {
        await updateDoc(doc(db, 'slots', `${doctorId}_${dateKey}`), {
          booked: increment(1)
        });
      } catch (e) {
        // Slot doc doesn't exist yet, create it
        await addDoc(collection(db, 'slots'), {
          doctorId,
          date: dateKey,
          booked: 1,
          max: 10,
        });
      }

      // Send notification
      await NotificationService.notifyAppointmentConfirmed({
        ...appointment,
        id: docRef.id,
      });

      return {
        success: true,
        appointmentId: docRef.id,
        status: appointment.status,
      };
    } catch (error) {
      console.log("Create appointment error:", error);
      return { success: false, error: error.message };
    }
  }

  // ✅ CANCEL APPOINTMENT
  static async cancelAppointment(appointmentId, cancelledBy = 'patient') {
    try {
      const appointmentRef = doc(db, 'reservations', appointmentId);
      const appointmentDoc = await getDoc(appointmentRef);
      const appointmentData = appointmentDoc.data();

      if (!appointmentData) {
        throw new Error('Appointment not found');
      }

      await updateDoc(appointmentRef, {
        status: 'cancelled',
        cancelledBy,
        cancelledAt: serverTimestamp(),
      });

      const dateKey = appointmentData.date.toDate
        ? appointmentData.date.toDate().toISOString().split('T')[0]
        : appointmentData.date.split('T')[0];

      try {
        await updateDoc(doc(db, 'slots', `${appointmentData.doctorId}_${dateKey}`), {
          booked: increment(-1)
        });
      } catch (e) {}

      await NotificationService.notifyAppointmentCancelled(appointmentData, cancelledBy);

      return { success: true };
    } catch (error) {
      console.log("Cancel appointment error:", error);
      return { success: false, error: error.message };
    }
  }

  // ✅ RESCHEDULE APPOINTMENT
  static async rescheduleAppointment(appointmentId, newDate, newTime) {
    try {
      const appointmentRef = doc(db, 'reservations', appointmentId);
      const appointmentDoc = await getDoc(appointmentRef);
      const appointmentData = appointmentDoc.data();

      const oldDateKey = appointmentData.date.toDate
        ? appointmentData.date.toDate().toISOString().split('T')[0]
        : appointmentData.date.split('T')[0];

      const newDateKey = new Date(newDate).toISOString().split('T')[0];

      await updateDoc(appointmentRef, {
        date: new Date(newDate),
        time: newTime,
        rescheduledAt: serverTimestamp(),
      });

      if (oldDateKey !== newDateKey) {
        try {
          await updateDoc(doc(db, 'slots', `${appointmentData.doctorId}_${oldDateKey}`), {
            booked: increment(-1)
          });

          await updateDoc(doc(db, 'slots', `${appointmentData.doctorId}_${newDateKey}`), {
            booked: increment(1)
          });
        } catch (e) {}
      }

      return { success: true };
    } catch (error) {
      console.log("Reschedule error:", error);
      return { success: false, error: error.message };
    }
  }

  // ✅ GET PATIENT APPOINTMENT HISTORY
  static async getPatientAppointmentHistory(patientId) {
    try {
      const q = query(
        collection(db, 'reservations'),
        where('patientId', '==', patientId),
        orderBy('date', 'desc'),
        limit(100)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate ? doc.data().date.toDate() : new Date(doc.data().date),
      }));
    } catch (e) {
      console.log("Get history error:", e);
      return [];
    }
  }

  // ✅ GET DOCTOR APPOINTMENT HISTORY
  static async getDoctorAppointmentHistory(doctorId) {
    try {
      const q = query(
        collection(db, 'reservations'),
        where('doctorId', '==', doctorId),
        orderBy('date', 'desc'),
        limit(100)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate ? doc.data().date.toDate() : new Date(doc.data().date),
      }));
    } catch (e) {
      console.log("Get history error:", e);
      return [];
    }
  }

  // ✅ COMPLETE APPOINTMENT
  static async completeAppointment(appointmentId) {
    try {
      const appointmentRef = doc(db, 'reservations', appointmentId);
      const appointmentSnap = await getDoc(appointmentRef);
      const appointmentData = appointmentSnap.exists() ? appointmentSnap.data() : null;

      await updateDoc(appointmentRef, {
        status: 'completed',
        completedAt: serverTimestamp(),
      });

      if (appointmentData?.doctorId) {
        let transactionAmount = appointmentData.visitCost;
        if (!transactionAmount || transactionAmount <= 0) {
          const doctorSnap = await getDoc(doc(db, 'users', appointmentData.doctorId));
          transactionAmount = doctorSnap.exists() ? doctorSnap.data()?.visitCost : 0;
        }

        await setDoc(doc(db, 'doctor_earnings', appointmentData.doctorId), {
          doctorId: appointmentData.doctorId,
          totalCompletedAppointments: increment(1),
          updatedAt: serverTimestamp(),
        }, { merge: true });

        if (transactionAmount > 0) {
          await addDoc(collection(db, 'payment_transactions'), {
            doctorId: appointmentData.doctorId,
            appointmentId,
            amount: transactionAmount,
            status: 'pending_bank_transfer',
            paymentMethod: 'el_dahabya_placeholder',
            createdAt: serverTimestamp(),
            integrationNote: 'Reserved for El Dahabya bank integration',
          });
        }
      }

      return { success: true };
    } catch (error) {
      console.log("Complete appointment error:", error);
      return { success: false, error: error.message };
    }
  }

  // ✅ MARK NO-SHOW
  static async markNoShow(appointmentId) {
    try {
      await updateDoc(doc(db, 'reservations', appointmentId), {
        status: 'no_show',
        noShowAt: serverTimestamp(),
      });
      return { success: true };
    } catch (error) {
      console.log("No show error:", error);
      return { success: false, error: error.message };
    }
  }

  // ✅ GET TODAY'S APPOINTMENTS FOR DOCTOR
  static async getTodayAppointments(doctorId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const q = query(
        collection(db, 'reservations'),
        where('doctorId', '==', doctorId),
        where('date', '>=', today),
        where('date', '<', tomorrow),
        where('status', 'in', ['pending', 'confirmed']),
        orderBy('time', 'asc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate ? doc.data().date.toDate() : new Date(doc.data().date),
      }));
    } catch (e) {
      console.log("Get today error:", e);
      return [];
    }
  }
}

export default AppointmentService;
