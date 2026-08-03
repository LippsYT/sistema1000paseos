

export type Price = {
  adult: number;
  child: number;
  infant: number;
};

export type PrePurchase = {
  serviceId: string;
  credits: number;
  date?: Date;
}

export type TicketLedgerAction = 'CONSUME' | 'REFUND';

export type TicketLedgerEntry = {
  id: string;
  agencyId: string;
  reservationId: string;
  settlementId?: string;
  serviceId?: string;
  serviceName?: string;
  quantity: number;
  action: TicketLedgerAction;
  createdAt: Date;
  createdBy?: {
    id: string;
    name: string;
  };
  note?: string;
};

export type Pax = {
  adults: number;
  children: number;
  infants: number;
}

export type Booking = {
  id: string;
  reservationId?: string; // Short, human-readable ID
  agencyId?: string;
  agencyName?: string;
  date: Date;
  pax: Pax;
  paxTotal: number;
  paxPaid?: Pax; // Pasajeros que se pagan (no cubiertos por pre-compra)
  serviceId: string;
  serviceName: string;
  lockedPrice?: Price; // Snapshot de tarifa al confirmar la reserva
  providerId?: string | null; // ID of the provider for this service on this booking
  cost?: number; // Cost of the service from the provider for this booking
  costManuallyEdited?: boolean; // Si es true, el costo fue editado a mano y no se recalcula con la tarifa del proveedor
  providerPaidAmount?: number; // Amount paid to the provider for this specific booking
  departureTime: string;
  total: number;
  status: 'Confirmed' | 'Cancelled' | 'Pending Cancellation' | 'Pending Review' | 'Pending Confirmation' | 'Pending Quote' | 'Quote Sent' | 'Quote Rejected' | 'Missing Information';
  paymentStatus: 'Pending' | 'Paid' | 'Pre-Purchase' | 'Settled' | 'Payment at Door';
  paidAmount?: number; // For individual payments by agencies
  reservationCode?: string; // For external confirmation codes (e.g., from tango houses)
  clientName: string;
  hotel?: string;
  address?: string;
  contact: {
    countryCode?: string;
    phoneNumber?: string;
    language?: string;
  };
  paymentAtDoor: boolean;
  notes?: string;
  cancellationReason?: string;
  paymentDetails?: {
    amount: number;
    currency: string;
    method: 'Efectivo' | 'Transferencia' | 'Tarjeta de Crédito' | 'Sobre en Recepción';
    commission?: number;
    envelopePickedUp?: boolean;
  };
  receiptUrl?: string; // For pre-paid agencies
  individualReceiptUrl?: string; // For individual booking payments by agents
  freePax?: {
    adults: number;
    children: number;
    infants: number;
  };
  freePaxReason?: string;
  isPrePurchase: boolean; // Indica si la reserva usó (total o parcialmente) créditos de pre-compra
  reviewNeeded?: boolean;
  reviewNotes?: string[];
  reviewType?: 'CSV Import' | 'Agency Edit' | 'Pre-paid Confirmation' | 'Private Service Quote' | 'Reactivation Request';
  csvRow?: any;
  csvImportId?: string; // ID del lote de importación CSV
  originalData?: Partial<Booking>; // To store data before an agency edit
  noShowApplied?: boolean;
  settlementId?: string; // ID del cierre de cuenta al que pertenece

  // Fields for private service quotes
  quoteDetails?: {
    serviceId?: string;
    serviceName?: string;
    hours?: number;
    time?: string;
    guide?: boolean;
    language?: string;
    pickup?: string;
    passengers?: number;
    luggage?: boolean;
    observations?: string;
  };
  quotedPrice?: number;
  quoteStatus?: 'Pending Admin' | 'Pending Agency' | 'Approved' | 'Rejected';
};

export type User = {
    id: string;
    name: string;
    email: string;
    role: 'super-admin' | 'admin' | 'agent' | 'vendedor' | 'guia' | 'hotel';
    agencyId?: string;
    agencyName?: string;
    guideId?: string; // ID del guía en la colección 'guides' si el rol es 'guia'
    photoURL?: string;
    status?: 'online' | 'offline';
    lastSeen?: Date;
    // Hotel specific data
    hotelName?: string;
    hotelAddress?: string;
};

export type Service = {
  id: string;
  name: string;
  category: 'tour' | 'tango';
  isActive: boolean;
  requiresConfirmationCode: boolean; // If true, booking status will be 'Pending Confirmation' until code is added
  basePrice: Price;
  baseCapacity: number | null;
  providerId?: string; // Default provider for this service
  defaultDepartures?: { time: string }[];
  sharedCapacityWithServiceId?: string | null; // ID of the parent service whose capacity this service shares
  description?: string; // Short description
  details?: string; // Detailed information, markdown supported
  imageUrl?: string;
};

export type PaymentAccount = {
  id: string;
  accountName: string; // e.g., "Cuenta Principal ARS"
  accountType: 'Bank ARS' | 'PIX BRL';
  bankName?: string; // Optional for PIX
  accountNumber?: string;
  cbu?: string;
  alias?: string;
  holderName: string;
  taxId: string; // CUIT/CUIL or CPF/CNPJ
  pixKey?: string; // For PIX accounts
}

export type Agency = {
  id: string;
  name: string;
  email: string;
  contact: {
    name?: string;
    phone?: string;
  };
  address?: string;
  isVirtual: boolean;
  paymentType: 'voucher' | 'pre-pago';
  serviceAvailability: boolean;
  balanceInFavor: number;
  manualDebt: number;
  customPrices?: Array<{
    serviceId: string;
    price: Price;
  }>;
  prePurchases?: PrePurchase[];
  photoURL?: string;
};

export type Departure = {
    time: string;
    capacity: number | null;
}

export type DailyAvailability = {
    id: string; // Document ID from Firestore
    date: string; // Formato YYYY-MM-DD
    serviceId: string;
    departures: Departure[];
}

export type NotificationType = 
    | 'BOOKING_CREATED'
    | 'CANCELLATION_REQUESTED'
    | 'CANCELLATION_APPROVED'
    | 'CANCELLATION_REJECTED'
    | 'PAYMENT_NOTICE_SENT' // "se activo el boton para pagar"
    | 'PAYMENT_CONFIRMED'
    | 'AVAILABILITY_UPDATED' // "si se agrego nueva disponibilidad"
    | 'AVAILABILITY_REQUEST'
    | 'DEPARTURE_ADDED' // "las nuevas salidas que fueron publicadas"
    | 'LOW_AVAILABILITY_WARNING' // "si queda poca disponibilidad"
    | 'GENERIC';


export type Notification = {
    id: string;
    targetUserId?: string; // ID del usuario específico (ej. un guía)
    agencyId?: string; // Para filtrar notificaciones por agencia
    agencyName?: string;
    type: NotificationType;
    message: string;
    relatedBookingId?: string;
    relatedUserId: string; // El usuario que realizó la acción
    userName: string;
    timestamp: Date;
    isRead: boolean;
    // Metadata específica para ciertos tipos de notificaciones
    metadata?: {
      date?: string; // Para AVAILABILITY_REQUEST, en formato YYYY-MM-DD
      [key: string]: any;
    };
}

export type ProviderService = {
  serviceId: string;
  cost: Price;
};

export type ProviderPayment = {
  id:string;
  providerId: string;
  date: Date;
  amount: number;
  receiptUrl?: string; // URL to the uploaded receipt
  notes?: string;
  settlementId?: string; // ID del cierre de cuenta al que pertenece este pago
};

export type Provider = {
  id: string;
  name: string;
  contact: {
    name?: string;
    phone?: string;
    email?: string;
  };
  paymentDetails: {
    bankName?: string;
    accountNumber?: string;
    cbu?: string;
    alias?: string;
    holderName?: string;
    taxId?: string;
  };
  services: ProviderService[];
  balanceInOurFavor: number; // Saldo a nuestro favor
  debtToProvider: number; // Deuda manual/inicial con el proveedor
};

export type SettlementBooking = Pick<Booking, 'id' | 'date' | 'serviceName' | 'clientName' | 'paxTotal' | 'total'>;

export type SettlementItemEdit = {
  id: string;
  reason: string;
  createdAt: Date;
  userId: string;
  userName: string;
  previous: {
    netoManual?: number | null;
    pagoEnVanManual?: number | null;
    usePrePurchase: boolean;
  };
  next: {
    netoManual?: number | null;
    pagoEnVanManual?: number | null;
    usePrePurchase: boolean;
  };
};

export type SettlementAdjustment = {
  id: string;
  amount: number;
  reason: string;
  createdAt: Date;
  userId: string;
  userName: string;
};

export type SettlementItem = {
  id: string; // booking id
  date: Date;
  serviceId?: string;
  serviceName: string;
  clientName: string;
  pax: Pax;
  paxTotal: number;
  notes?: string;
  usePrePurchase: boolean;
  usePrePurchaseOriginal: boolean;
  netoAuto: number;
  pagoEnVanAuto: number;
  pagoEnVanDisplay?: string;
  saldoAuto: number;
  netoManual?: number | null;
  pagoEnVanManual?: number | null;
  manualEdits?: SettlementItemEdit[];
  lockedPrice?: Price;
};

export type Settlement = {
  id: string;
  entityId: string;
  entityName: string;
  entityType: 'agency' | 'provider';
  dateFrom: Date;
  dateTo: Date;
  dateGenerated: Date;
  datePaid?: Date;
  cashPaymentDate?: Date; // For cash payments scheduled by agent
  status: 'Pendiente' | 'Comprobante Subido' | 'Pago en Efectivo Agendado' | 'Pagado' | 'Archivado';
  receiptUrl?: string;
  amount: number;
  baseAmount?: number;
  bookings?: SettlementBooking[];
  items?: SettlementItem[];
  adjustments?: SettlementAdjustment[];
  comments?: string;
  assignedPaymentAccountIds?: string[]; // IDs of the payment accounts assigned for this specific settlement
};

export type CombinedReportData = {
    agencyPart: {
        bookings: Booking[];
        totals: ReturnType<any>;
        agency: Agency;
    };
    providerPart: {
        bookings: Booking[];
        totals: {
            totalCost: number;
            paymentsInPeriod: number;
            finalDebt: number;
        };
        provider: Provider;
    };
    netBalance: number;
}

export type GuidePrice = {
  serviceId: string;
  price: number;
}

export type GuidePayment = {
  id: string;
  date: Date;
  amount: number;
  notes?: string;
}

export type Guide = {
    id: string;
    name: string;
    contact: {
        phone?: string;
        email?: string;
    };
    languages: string[];
    isPhotographer: boolean;
    availableDates: Date[]; // Fechas específicas en las que el guía está disponible
    prices: GuidePrice[]; // Cuánto cobra por cada servicio
    balanceInOurFavor: number; // Saldo a nuestro favor (reduce la deuda)
    debtToGuide: number; // Deuda manual/inicial con el guía
    photoURL?: string;
};

export type Vehicle = {
  id: string;
  name: string;
  capacity: number;
};

export type Operativo = {
    id: string; // Unique ID for the operativo, e.g., a UUID
    name: string; // e.g., "Brenda - Van 1"
    guideId: string;
    vehicleId: string;
};

export type DailyAssignment = {
    id: string; // YYYY-MM-DD
    operativos: Operativo[];
    assignments: {
        [bookingId: string]: string; // bookingId -> operativoId
    }
}

export type CsvImportBatch = {
    id: string; // Document ID (filename + timestamp)
    fileName: string;
    importDate: Date;
    bookingCount: number;
    bookingIds: string[];
}

export type ChatMessage = {
  id: string;
  text: string;
  timestamp: Date;
  userId: string;
  userName: string;
  isRead: boolean;
};

export type ChatWithUnread = {
    chatId: string;
    otherUserId: string;
    unreadCount: number;
};
    
