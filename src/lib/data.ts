

import { collection, getDocs, getFirestore, Timestamp, doc, addDoc as firebaseAddDoc, updateDoc as firebaseUpdateDoc, deleteDoc as firebaseDeleteDoc, setDoc as firebaseSetDoc, deleteField, serverTimestamp, query, orderBy, getDoc, writeBatch, where, onSnapshot, arrayUnion, limit, type DocumentReference, type CollectionReference } from 'firebase/firestore';
import { firebaseApp } from './firebase';
import type { Booking, User, Service, Notification, NotificationType, Provider, ProviderPayment, Agency, Settlement, Guide, Vehicle, DailyAssignment, GuidePayment, CsvImportBatch, SettlementBooking, ChatMessage, ChatWithUnread, TicketLedgerEntry, TicketLedgerAction } from './types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const db = getFirestore(firebaseApp);

// --- Patched Firestore Functions ---

const addDoc = async (ref: CollectionReference, data: any) => {
  try {
    return await firebaseAddDoc(ref, data);
  } catch (error: any) {
    if (error.code === 'permission-denied') {
      const permissionError = new FirestorePermissionError({
        path: ref.path,
        operation: 'create',
        requestResourceData: data,
      });
      errorEmitter.emit('permission-error', permissionError);
    }
    // Re-throw other errors
    throw error;
  }
}

const updateDoc = async (ref: DocumentReference, data: any) => {
  try {
    return await firebaseUpdateDoc(ref, data);
  } catch (error: any) {
     if (error.code === 'permission-denied') {
      const permissionError = new FirestorePermissionError({
        path: ref.path,
        operation: 'update',
        requestResourceData: data,
      });
      errorEmitter.emit('permission-error', permissionError);
    }
    throw error;
  }
}

const setDoc = async (ref: DocumentReference, data: any, options?: { merge?: boolean }) => {
    try {
        return await firebaseSetDoc(ref, data, options || {});
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
                path: ref.path,
                operation: options?.merge ? 'update' : 'create',
                requestResourceData: data,
            });
            errorEmitter.emit('permission-error', permissionError);
        }
        throw error;
    }
}

const deleteDoc = async (ref: DocumentReference) => {
    try {
        return await firebaseDeleteDoc(ref);
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
                path: ref.path,
                operation: 'delete',
            });
            errorEmitter.emit('permission-error', permissionError);
        }
        throw error;
    }
}

const commitBatch = async (batch: ReturnType<typeof writeBatch>) => {
    try {
        return await batch.commit();
    } catch (error: any) {
         if (error.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
                path: 'batched write',
                operation: 'write',
                requestResourceData: { note: 'Una o más operaciones en el lote fallaron debido a las reglas de seguridad.' },
            });
            errorEmitter.emit('permission-error', permissionError);
        }
        throw error;
    }
}


export { db, collection, getDocs, doc, deleteField, getDoc, writeBatch, query, where, Timestamp, onSnapshot, arrayUnion };
export { addDoc, updateDoc, setDoc, deleteDoc, commitBatch };

export async function getTicketLedgerEntry(reservationId: string, action: TicketLedgerAction): Promise<TicketLedgerEntry | null> {
  const q = query(
    collection(db, "ticket_ledger"),
    where("reservationId", "==", reservationId),
    where("action", "==", action),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const entryDoc = snapshot.docs[0];
  const data = entryDoc.data();
  return {
    id: entryDoc.id,
    ...data,
    createdAt: data.createdAt && data.createdAt instanceof Timestamp ? data.createdAt.toDate() : (data.createdAt || new Date()),
  } as TicketLedgerEntry;
}

export async function createTicketLedgerEntry(entry: Omit<TicketLedgerEntry, "id" | "createdAt">) {
  return addDoc(collection(db, "ticket_ledger"), {
    ...entry,
    createdAt: Timestamp.now(),
  });
}


// Function to generate a short, unique reservation ID
export function generateReservationId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}


export async function getAgencies(): Promise<Agency[]> {
  const querySnapshot = await getDocs(collection(db, "agencies"));
  const agencies: Agency[] = [];
  querySnapshot.forEach((doc) => {
    agencies.push({ id: doc.id, ...doc.data() } as Agency);
  });
  return agencies;
}

export async function getBookings(): Promise<Booking[]> {
    const querySnapshot = await getDocs(collection(db, "bookings"));
    const bookings: Booking[] = [];
    querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Convert Firestore Timestamp to JS Date
        const bookingData: { [key: string]: any } = { ...data };
        if (data.date && data.date instanceof Timestamp) {
            bookingData.date = data.date.toDate();
        }
        if (data.originalData?.date && data.originalData.date instanceof Timestamp) {
          bookingData.originalData.date = data.originalData.date.toDate();
        }

        if (data.settlementId) {
            bookingData.paymentStatus = 'Settled';
        } else if (data.individualReceiptUrl) {
            bookingData.paymentStatus = 'Paid';
        } else if (data.isPrePurchase) {
            bookingData.paymentStatus = 'Pre-Purchase';
        } else if (data.paymentAtDoor) {
            bookingData.paymentStatus = 'Payment at Door';
        } else {
            bookingData.paymentStatus = 'Pending';
        }
        
        bookings.push({ id: doc.id, ...bookingData } as Booking);
    });
    return bookings;
}


export async function getUsers(): Promise<User[]> {
  const querySnapshot = await getDocs(collection(db, "users"));
  const users: User[] = [];
  querySnapshot.forEach((doc) => {
    users.push({ id: doc.id, ...doc.data() } as User);
  });
  return users;
}

export function subscribeToUsers(callback: (users: User[]) => void): () => void {
    const usersColRef = collection(db, "users");
    const unsubscribe = onSnapshot(usersColRef, (querySnapshot) => {
        const users: User[] = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            users.push({
                id: doc.id,
                ...data,
                lastSeen: data.lastSeen ? (data.lastSeen as Timestamp).toDate() : undefined,
            } as User);
        });
        callback(users);
    });
    return unsubscribe;
}


export async function getServices(): Promise<Service[]> {
  const querySnapshot = await getDocs(collection(db, "services"));
  const services: Service[] = [];
  querySnapshot.forEach((doc) => {
    services.push({ id: doc.id, ...doc.data() } as Service);
  });
  return services;
}

export async function getProviders(): Promise<Provider[]> {
    const querySnapshot = await getDocs(collection(db, "providers"));
    const providers: Provider[] = [];
    for (const doc of querySnapshot.docs) {
        const providerData = { id: doc.id, ...doc.data() } as Provider;
        providers.push(providerData);
    }
    return providers;
}

export async function getProviderPayments(providerId: string): Promise<ProviderPayment[]> {
    const q = query(collection(db, `providers/${providerId}/payments`), orderBy("date", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            providerId, // Add providerId to the payment object
            date: (data.date as Timestamp).toDate(),
        } as ProviderPayment;
    });
}


export async function getNotifications(): Promise<Notification[]> {
    const q = query(collection(db, "notifications"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    const notifications: Notification[] = [];
    querySnapshot.forEach((doc) => {
        const data = doc.data();
        notifications.push({ 
            id: doc.id, 
            ...data,
            timestamp: (data.timestamp as Timestamp).toDate(),
        } as Notification);
    });
    return notifications;
}

export async function createNotification(
    type: NotificationType, 
    message: string,
    metadata: Omit<Partial<Notification>, 'id' | 'type' | 'message' | 'timestamp' | 'isRead'>
): Promise<void> {
    try {
        await addDoc(collection(db, "notifications"), {
            type,
            message,
            ...metadata,
            timestamp: serverTimestamp(),
            isRead: false
        });
    } catch (error) {
        console.error("Error creating notification: ", error);
    }
}

async function _getAllSettlements(): Promise<Settlement[]> {
    const querySnapshot = await getDocs(collection(db, "settlements"));
    const settlements: Settlement[] = [];
    querySnapshot.forEach((doc) => {
        const data = doc.data();
        
        const bookingsWithDates: SettlementBooking[] = (data.bookings || []).map((b: any) => ({
            ...b,
            date: b.date && b.date instanceof Timestamp ? b.date.toDate() : ( b.date || new Date() ),
        }));

        const itemsWithDates = (data.items || []).map((item: any) => ({
            ...item,
            usePrePurchaseOriginal: item.usePrePurchaseOriginal ?? item.usePrePurchase ?? false,
            date: item.date && item.date instanceof Timestamp ? item.date.toDate() : (item.date || new Date()),
            manualEdits: (item.manualEdits || []).map((edit: any) => ({
                ...edit,
                createdAt: edit.createdAt && edit.createdAt instanceof Timestamp ? edit.createdAt.toDate() : (edit.createdAt || new Date()),
            })),
        }));

        const adjustmentsWithDates = (data.adjustments || []).map((adjustment: any) => ({
            ...adjustment,
            createdAt: adjustment.createdAt && adjustment.createdAt instanceof Timestamp ? adjustment.createdAt.toDate() : (adjustment.createdAt || new Date()),
        }));

        settlements.push({
            id: doc.id,
            ...data,
            dateFrom: data.dateFrom instanceof Timestamp ? data.dateFrom.toDate() : new Date(),
            dateTo: data.dateTo instanceof Timestamp ? data.dateTo.toDate() : new Date(),
            dateGenerated: data.dateGenerated instanceof Timestamp ? data.dateGenerated.toDate() : new Date(),
            datePaid: data.datePaid && data.datePaid instanceof Timestamp ? data.datePaid.toDate() : undefined,
            bookings: bookingsWithDates,
            items: itemsWithDates,
            adjustments: adjustmentsWithDates,
        } as Settlement);
    });
    return settlements;
}

export async function getSettlements(): Promise<Settlement[]> {
    const allSettlements = await _getAllSettlements();
    return allSettlements.filter(s => s.status !== "Archivado");
}

export async function getArchivedSettlements(): Promise<Settlement[]> {
    const allSettlements = await _getAllSettlements();
    return allSettlements.filter(s => s.status === "Archivado");
}

export async function getGuides(): Promise<Guide[]> {
    const querySnapshot = await getDocs(collection(db, "guides"));
    return querySnapshot.docs.map(doc => {
        const data = doc.data();
        const availableDates = (data.availableDates || []).map((d: any) => {
            if (d && typeof d.toDate === 'function') {
                return d.toDate();
            }
            return d;
        });
        return { 
            id: doc.id, 
            ...data,
            availableDates,
        } as Guide;
    });
}

export async function getGuidePayments(guideId: string): Promise<GuidePayment[]> {
    const q = query(collection(db, `guides/${guideId}/payments`), orderBy("date", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            date: (data.date as Timestamp).toDate(),
        } as GuidePayment;
    });
}

export async function getVehicles(): Promise<Vehicle[]> {
    const querySnapshot = await getDocs(collection(db, "vehicles"));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle));
}

export async function getDailyAssignments(): Promise<DailyAssignment[]> {
    const querySnapshot = await getDocs(collection(db, "dailyAssignments"));
    const assignments: DailyAssignment[] = [];
    querySnapshot.forEach((doc) => {
        assignments.push({ id: doc.id, ...doc.data() } as DailyAssignment);
    });
    return assignments;
}

export async function getCsvImportBatches(): Promise<CsvImportBatch[]> {
    const q = query(collection(db, "csvImportBatches"), orderBy("importDate", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            importDate: (data.importDate as Timestamp).toDate(),
        } as CsvImportBatch;
    });
}

export async function getPaymentAccounts(): Promise<PaymentAccount[]> {
  const querySnapshot = await getDocs(collection(db, "paymentAccounts"));
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentAccount));
}
    
export function getChatMessages(chatId: string, callback: (messages: ChatMessage[]) => void): () => void {
  const messagesColRef = collection(db, "chats", chatId, "messages");
  const q = query(messagesColRef, orderBy("timestamp", "asc"));

  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const messages: ChatMessage[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      messages.push({
        id: doc.id,
        ...data,
        timestamp: (data.timestamp as Timestamp).toDate(),
      } as ChatMessage);
    });
    callback(messages);
  }, (error) => {
      // This is a read operation, handle potential permission errors
      handlePermissionError(messagesColRef, 'list');
  });

  return unsubscribe;
}

export async function sendChatMessage(chatId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<void> {
    const messagesColRef = collection(db, "chats", chatId, "messages");
    await addDoc(messagesColRef, {
      ...message,
      timestamp: serverTimestamp(),
    });
}

export async function markMessagesAsRead(chatId: string, userId: string) {
    const messagesRef = collection(db, "chats", chatId, "messages");
    const q = query(messagesRef, where("userId", "!=", userId), where("isRead", "==", false));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) return;

    const batch = writeBatch(db);
    querySnapshot.forEach(doc => {
        batch.update(doc.ref, { isRead: true });
    });

    await commitBatch(batch);
}

export function subscribeToUserChats(userId: string, callback: (chats: ChatWithUnread[]) => void): () => void {
    const usersUnsubscribe = subscribeToUsers((allUsers) => {
        const otherUsers = allUsers.filter(u => u.id !== userId);
        const unsubscribes: (() => void)[] = [];

        const processChats = async () => {
            const chatPromises = otherUsers.map(otherUser => {
                const chatId = [userId, otherUser.id].sort().join('_');
                const messagesRef = collection(db, 'chats', chatId, 'messages');
                const q = query(messagesRef, where('isRead', '==', false), where('userId', '==', otherUser.id));
                return getDocs(q).then(snapshot => ({
                    chatId,
                    otherUserId: otherUser.id,
                    unreadCount: snapshot.size,
                }));
            });

            try {
                const chats = await Promise.all(chatPromises);
                callback(chats);
            } catch (error) {
                console.error("Error processing chats:", error);
            }
        };
        
        processChats(); // Initial fetch

        otherUsers.forEach(otherUser => {
            const chatId = [userId, otherUser.id].sort().join('_');
            const messagesRef = collection(db, 'chats', chatId, 'messages');
            const q = query(messagesRef);
            const unsubscribe = onSnapshot(q, processChats, (error) => {
                console.error(`Error listening to chat ${chatId}:`, error);
            });
            unsubscribes.push(unsubscribe);
        });

        return () => unsubscribes.forEach(unsub => unsub());
    });

    return usersUnsubscribe;
}
