import {
  collection, addDoc, query, where, getDocs, serverTimestamp,
  updateDoc, doc, getDoc, writeBatch
} from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

export class RatingService {

  // ✅ SUBMIT RATING
  static async submitRating(doctorId, rating) {
    try {
      const uid = auth.currentUser.uid;

      // Check if user has confirmed appointment with this doctor
      const q = query(
        collection(db, 'reservations'),
        where('doctorId', '==', doctorId),
        where('patientId', '==', uid),
        where('status', 'in', ['confirmed', 'completed'])
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        return { success: false, error: 'You must have an appointment with this doctor to rate' };
      }

      await addDoc(collection(db, 'ratings'), {
        doctorId,
        patientId: uid,
        overall: rating.overall,
        waitTime: rating.waitTime || 0,
        attitude: rating.attitude || 0,
        cleanliness: rating.cleanliness || 0,
        comment: rating.comment || '',
        createdAt: serverTimestamp(),
      });

      // Update doctor's average rating
      await this.updateDoctorRating(doctorId);

      return { success: true };
    } catch (e) {
      console.log("Submit rating error:", e);
      return { success: false, error: e.message };
    }
  }

  // ✅ UPDATE DOCTOR RATING (calculate average)
  static async updateDoctorRating(doctorId) {
    try {
      const q = query(
        collection(db, 'ratings'),
        where('doctorId', '==', doctorId)
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) return;

      let totalRating = 0;
      snapshot.forEach(doc => {
        totalRating += doc.data().overall || 0;
      });

      const averageRating = (totalRating / snapshot.size).toFixed(1);

      await updateDoc(doc(db, "users", doctorId), {
        averageRating: parseFloat(averageRating),
        totalRatings: snapshot.size,
      });
    } catch (e) {
      console.log("Update rating error:", e);
    }
  }

  // ✅ GET DOCTOR RATINGS
  static async getDoctorRatings(doctorId) {
    try {
      const q = query(
        collection(db, 'ratings'),
        where('doctorId', '==', doctorId)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
      }));
    } catch (e) {
      console.log("Get ratings error:", e);
      return [];
    }
  }

  // ✅ GET DOCTOR AVERAGE RATING
  static async getDoctorAverageRating(doctorId) {
    try {
      const userDoc = await getDoc(doc(db, "users", doctorId));
      if (!userDoc.exists()) return 0;

      return userDoc.data().averageRating || 0;
    } catch (e) {
      console.log("Get average rating error:", e);
      return 0;
    }
  }
}

export default RatingService;