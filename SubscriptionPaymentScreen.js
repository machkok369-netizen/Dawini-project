import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, TextInput
} from 'react-native';
import { doc, getDoc, addDoc, collection, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from './firebaseConfig';

const SUBSCRIPTION_PLANS = [
  { id: '1week',  label: '1 Week',  price: 1500, weeks: 1, months: null },
  { id: '1month', label: '1 Month', price: 5500, weeks: null, months: 1 },
];

export default function SubscriptionPaymentScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [transactionRef, setTransactionRef] = useState('');
  const [pendingRequest, setPendingRequest] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) {
          const data = snap.data();
          setProfile(data);
          if (data.subscriptionEnd) {
            const end = data.subscriptionEnd.toDate
              ? data.subscriptionEnd.toDate()
              : new Date(data.subscriptionEnd);
            setSubscriptionEnd(end);
          }
        }

        // Check for any pending renewal request
        const pendingQ = query(
          collection(db, 'subscription_requests'),
          where('doctorId', '==', uid),
          where('status', '==', 'pending')
        );
        const pendingSnap = await getDocs(pendingQ);
        if (!pendingSnap.empty) {
          setPendingRequest(pendingSnap.docs[0].data());
        }
      } catch (e) {
        console.log('Load subscription error:', e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const submitRenewalRequest = async () => {
    if (!selectedPlan) {
      Alert.alert('Select Plan', 'Please choose a subscription plan.');
      return;
    }
    if (!transactionRef.trim()) {
      Alert.alert('Missing Reference', 'Please enter the El Dahabya transaction reference number.');
      return;
    }

    Alert.alert(
      'Confirm Renewal Request',
      `Plan: ${selectedPlan.label}\nPrice: ${selectedPlan.price} DA\nTransaction Ref: ${transactionRef.trim()}\n\nThe admin will verify and activate your subscription.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            setSubmitting(true);
            try {
              const uid = auth.currentUser.uid;
              await addDoc(collection(db, 'subscription_requests'), {
                doctorId: uid,
                doctorName: profile?.fullName || '',
                doctorPhone: profile?.phone || '',
                plan: selectedPlan.id,
                planLabel: selectedPlan.label,
                price: selectedPlan.price,
                weeks: selectedPlan.weeks,
                months: selectedPlan.months,
                transactionRef: transactionRef.trim(),
                status: 'pending',
                createdAt: serverTimestamp(),
              });

              // Notify admin via notifications collection
              await addDoc(collection(db, 'notifications'), {
                userId: 'admin',
                type: 'subscription_renewal_request',
                title: '💳 Subscription Renewal',
                message: `Dr. ${profile?.fullName} submitted a renewal request (${selectedPlan.label} · ${selectedPlan.price} DA)`,
                doctorId: uid,
                read: false,
                createdAt: serverTimestamp(),
              });

              Alert.alert(
                '✅ Request Submitted',
                'Your renewal request has been sent to the admin. Your subscription will be activated once payment is verified.',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
              );
            } catch (e) {
              Alert.alert('Error', 'Could not submit request: ' + e.message);
            } finally {
              setSubmitting(false);
            }
          }
        }
      ]
    );
  };

  const isExpired = subscriptionEnd ? subscriptionEnd < new Date() : true;
  const daysLeft = subscriptionEnd
    ? Math.max(0, Math.ceil((subscriptionEnd - new Date()) / 86400000))
    : 0;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Subscription status */}
      <View style={[styles.statusCard, isExpired ? styles.statusCardExpired : styles.statusCardActive]}>
        <Text style={styles.statusIcon}>{isExpired ? '⚠️' : '✅'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>
            {isExpired ? 'Subscription Expired' : 'Active Subscription'}
          </Text>
          {subscriptionEnd && !isExpired && (
            <Text style={styles.statusSub}>
              Expires {subscriptionEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              {' · '}{daysLeft} days left
            </Text>
          )}
          {isExpired && subscriptionEnd && (
            <Text style={styles.statusSub}>
              Expired {subscriptionEnd.toLocaleDateString('en-GB')}
            </Text>
          )}
          {!subscriptionEnd && (
            <Text style={styles.statusSub}>No active subscription</Text>
          )}
        </View>
      </View>

      {/* Pending request notice */}
      {pendingRequest && (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingTitle}>⏳ Pending Renewal Request</Text>
          <Text style={styles.pendingSub}>
            Plan: {pendingRequest.planLabel} · {pendingRequest.price} DA
          </Text>
          <Text style={styles.pendingSub}>
            Ref: {pendingRequest.transactionRef}
          </Text>
          <Text style={styles.pendingNote}>
            Your request is awaiting admin verification.
          </Text>
        </View>
      )}

      {!pendingRequest && (
        <>
          {/* How it works */}
          <View style={styles.howCard}>
            <Text style={styles.howTitle}>💳 How to Renew</Text>
            <Text style={styles.howStep}>1. Choose a plan below</Text>
            <Text style={styles.howStep}>2. Send payment via El Dahabya to account: <Text style={styles.howHighlight}>0799-xxx-xxxx</Text></Text>
            <Text style={styles.howStep}>3. Enter the transaction reference number</Text>
            <Text style={styles.howStep}>4. Admin activates your subscription within 24h</Text>
          </View>

          {/* Plan selection */}
          <Text style={styles.sectionTitle}>Choose a Plan</Text>
          {SUBSCRIPTION_PLANS.map(plan => (
            <TouchableOpacity
              key={plan.id}
              style={[styles.planCard, selectedPlan?.id === plan.id && styles.planCardSelected]}
              onPress={() => setSelectedPlan(plan)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.planLabel, selectedPlan?.id === plan.id && styles.planLabelSelected]}>
                  {plan.label}
                </Text>

              </View>
              <Text style={[styles.planPrice, selectedPlan?.id === plan.id && styles.planPriceSelected]}>
                {plan.price} DA
              </Text>
              {selectedPlan?.id === plan.id && <Text style={styles.planCheck}>✅</Text>}
            </TouchableOpacity>
          ))}

          {/* Transaction reference */}
          <Text style={styles.sectionTitle}>Transaction Reference</Text>
          <TextInput
            style={styles.input}
            value={transactionRef}
            onChangeText={setTransactionRef}
            placeholder="Enter El Dahabya transaction ref..."
            autoCapitalize="characters"
          />

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, (!selectedPlan || !transactionRef.trim()) && styles.submitBtnDisabled]}
            onPress={submitRenewalRequest}
            disabled={submitting || !selectedPlan || !transactionRef.trim()}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>Submit Renewal Request</Text>
            }
          </TouchableOpacity>
        </>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 44 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 16, padding: 18, marginBottom: 16,
    borderWidth: 1.5,
  },
  statusCardActive: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  statusCardExpired: { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  statusIcon: { fontSize: 28 },
  statusTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  statusSub: { fontSize: 13, color: '#6b7280', marginTop: 3 },

  pendingCard: {
    backgroundColor: '#fefce8', borderColor: '#fde047', borderWidth: 1.5,
    borderRadius: 16, padding: 18, marginBottom: 16,
  },
  pendingTitle: { fontSize: 15, fontWeight: '700', color: '#92400e', marginBottom: 6 },
  pendingSub: { fontSize: 13, color: '#78350f', marginBottom: 2 },
  pendingNote: { fontSize: 12, color: '#a16207', marginTop: 6, fontStyle: 'italic' },

  howCard: {
    backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1.5,
    borderRadius: 16, padding: 18, marginBottom: 20,
  },
  howTitle: { fontSize: 15, fontWeight: '700', color: '#1e40af', marginBottom: 10 },
  howStep: { fontSize: 13, color: '#1e40af', marginBottom: 5, lineHeight: 20 },
  howHighlight: { fontWeight: '700', color: '#1d4ed8' },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10, marginTop: 6 },

  planCard: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 14,
    padding: 16, marginBottom: 10, backgroundColor: '#fff',
  },
  planCardSelected: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  planLabel: { fontSize: 16, fontWeight: '600', color: '#374151' },
  planLabelSelected: { color: '#16a34a' },
  planDiscount: { fontSize: 11, color: '#059669', fontWeight: '600', marginTop: 2 },
  planPrice: { fontSize: 16, fontWeight: '700', color: '#374151', marginRight: 10 },
  planPriceSelected: { color: '#16a34a' },
  planCheck: { fontSize: 16 },

  input: {
    backgroundColor: '#fff', borderColor: '#e5e7eb', borderWidth: 1,
    borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 20,
  },

  submitBtn: {
    backgroundColor: '#16a34a', paddingVertical: 16,
    borderRadius: 14, alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#9ca3af' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
