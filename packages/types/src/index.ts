/**
 * @purim/types
 *
 * Canonical Firestore schema interfaces for the Purim distribution platform.
 *
 * Design rules:
 *  - All types are framework-agnostic. Do NOT import from firebase/firestore or
 *    firebase-admin here — consumers cast to these interfaces at the boundary.
 *  - Monetary values are stored as integers in the smallest currency unit
 *    (agorot for ILS, cents for USD/EUR) to avoid floating-point errors.
 *  - Timestamps use FirestoreTimestamp (see below) — never raw Date objects.
 *  - String-literal unions are used instead of TypeScript enums so that values
 *    survive JSON round-trips and Firestore serialisation unchanged.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Primitive helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Firestore Timestamp shape.
 * Compatible with both `firebase/firestore` Timestamp and
 * `firebase-admin/firestore` Timestamp — assign either to this interface
 * without importing the SDK classes into this package.
 */
export interface FirestoreTimestamp {
  /** Whole seconds since Unix epoch (integer ≥ 0) */
  seconds: number;
  /** Sub-second nanoseconds (integer, 0 – 999 999 999) */
  nanoseconds: number;
}

/** ISO 4217 currency codes supported by the platform */
export type CurrencyCode = "ILS" | "USD" | "EUR";

// ─────────────────────────────────────────────────────────────────────────────
// String-literal "enums"
// ─────────────────────────────────────────────────────────────────────────────

/** Platform roles that determine feature access */
export type UserRole = "admin" | "coordinator" | "volunteer" | "recipient";

/** Delivery lifecycle state for a single address */
export type DeliveryStatus =
  | "pending"      // not yet attempted
  | "dispatched"   // volunteer is on their way
  | "delivered"    // confirmed drop-off
  | "failed"       // delivery attempted but unsuccessful
  | "skipped";     // explicitly excluded from this campaign

/** Lifecycle state of a volunteer dispatch run */
export type DispatchStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

/** Direction / classification of a monetary transaction */
export type TransactionType =
  | "donation"   // money coming in
  | "expense"    // money going out
  | "refund"     // reversal of a donation
  | "transfer";  // internal reallocation between groups

/** Settlement state of a transaction */
export type TransactionStatus =
  | "pending"
  | "completed"
  | "failed"
  | "reversed";

/** Settlement state of a cost-split record */
export type SplitStatus = "open" | "settled" | "cancelled";

/** Outcome of a logged phone call */
export type CallStatus =
  | "answered"
  | "missed"
  | "voicemail"
  | "busy"
  | "no_answer";

/** Target audience for a platform announcement */
export type AnnouncementAudience =
  | "all"
  | "coordinators"
  | "volunteers"
  | "recipients";

/** Discriminant tag for activity feed items */
export type FeedItemType =
  | "dispatch_created"
  | "dispatch_completed"
  | "delivery_completed"
  | "donation_received"
  | "announcement_posted"
  | "user_joined"
  | "binder_assigned"
  | "call_made"
  | "split_created"
  | "split_settled";

// ─────────────────────────────────────────────────────────────────────────────
// Firestore document interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A physical delivery address.
 *
 * Firestore path: /addresses/{addressId}
 */
export interface Address {
  /** Firestore document ID */
  id: string;
  recipientName: string;
  street: string;
  /** Building or house number (stored separately to support geocoding) */
  houseNumber: string;
  /** Optional apartment / floor / unit descriptor */
  apartment?: string;
  city: string;
  /** Postal / ZIP code */
  zip: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "IL" */
  country: string;
  /** Free-text delivery instructions (gate codes, dog on premises, etc.) */
  notes?: string;
  /** WGS-84 latitude — populated after geocoding (float) */
  latitude?: number;
  /** WGS-84 longitude — populated after geocoding (float) */
  longitude?: number;
  deliveryStatus: DeliveryStatus;
  /** Reference to the Binder that owns this address */
  binderId: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

/**
 * A registered platform user (any role).
 *
 * Firestore path: /users/{uid}
 */
export interface User {
  /** Firebase Auth UID — also the Firestore document ID */
  uid: string;
  email: string;
  displayName: string;
  /** E.164 phone number; null if not provided */
  phoneNumber: string | null;
  photoUrl: string | null;
  role: UserRole;
  /** Group the user belongs to; null if not yet assigned */
  groupId: string | null;
  /**
   * Per-campaign participation record.
   * Keyed by year string, e.g. { "2025": { participated: true, addressesDelivered: 12 } }
   */
  campaignHistory: Record<
    string,
    { participated: boolean; addressesDelivered: number }
  >;
  /** False = soft-deleted / suspended */
  isActive: boolean;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

/**
 * A named volunteer delivery group, managed by one coordinator.
 *
 * Firestore path: /groups/{groupId}
 */
export interface Group {
  /** Firestore document ID */
  id: string;
  name: string;
  description?: string;
  /** UID of the coordinator who owns this group */
  coordinatorId: string;
  /** UIDs of all volunteer members */
  memberIds: string[];
  /** Binder currently assigned to this group; null if unassigned */
  binderId: string | null;
  /** Target number of deliveries for the current campaign (integer) */
  targetDeliveries: number;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

/**
 * A delivery route binder — a named, ordered collection of addresses
 * assigned to a group for a specific campaign year.
 *
 * Firestore path: /binders/{binderId}
 */
export interface Binder {
  /** Firestore document ID */
  id: string;
  name: string;
  /** The Group responsible for delivering this binder; null if unassigned */
  groupId: string | null;
  /** Ordered array of Address document IDs */
  addressIds: string[];
  /** Total number of addresses in this binder (integer; mirrors addressIds.length) */
  totalAddresses: number;
  /** Running count of delivered addresses (integer) */
  deliveredCount: number;
  /** Gregorian year this binder belongs to (integer, e.g. 2025) */
  campaignYear: number;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

/**
 * A single delivery dispatch run — one volunteer (or pair) going out with
 * a subset of addresses from a binder.
 *
 * Firestore path: /dispatches/{dispatchId}
 */
export interface Dispatch {
  /** Firestore document ID */
  id: string;
  binderId: string;
  /** UID of the primary volunteer */
  volunteerId: string;
  /** UIDs of additional co-volunteers on this run */
  coVolunteerIds: string[];
  /** Subset of Address IDs included in this dispatch run */
  addressIds: string[];
  status: DispatchStatus;
  /** Number of addresses successfully completed in this run (integer) */
  completedCount: number;
  /** When the volunteer was sent out */
  dispatchedAt: FirestoreTimestamp;
  /** When the run was marked complete; null while still in progress */
  completedAt: FirestoreTimestamp | null;
  /** Optional notes from the volunteer */
  notes?: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

/**
 * A financial transaction (donation received, expense logged, etc.).
 *
 * Firestore path: /transactions/{transactionId}
 */
export interface Transaction {
  /** Firestore document ID */
  id: string;
  /** UID of the user associated with this transaction */
  userId: string;
  type: TransactionType;
  status: TransactionStatus;
  /**
   * Amount in the smallest currency unit (integer).
   * ILS → agorot (1 ₪ = 100 agorot)
   * USD/EUR → cents
   */
  amountMinorUnits: number;
  currency: CurrencyCode;
  /** External payment processor reference (e.g. Stripe charge ID) */
  externalRef?: string;
  /** Human-readable memo */
  description?: string;
  /** Campaign year this transaction is attributed to (integer) */
  campaignYear: number;
  /** Arbitrary key-value metadata for extensibility */
  metadata: Record<string, string | number | boolean>;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

/**
 * One participant's share within a cost-split.
 */
export interface SplitParticipant {
  userId: string;
  /** Amount this participant owes (integer, minor units) */
  amountMinorUnits: number;
  isPaid: boolean;
  /** When this participant settled their share; null if still unpaid */
  paidAt: FirestoreTimestamp | null;
}

/**
 * A cost-split record — divides a shared expense or donation among
 * multiple participants.
 *
 * Firestore path: /splits/{splitId}
 */
export interface Split {
  /** Firestore document ID */
  id: string;
  /** The parent Transaction being split */
  transactionId: string;
  status: SplitStatus;
  /** Total amount being split (integer, minor units — matches Transaction.amountMinorUnits) */
  totalAmountMinorUnits: number;
  currency: CurrencyCode;
  participants: SplitParticipant[];
  createdAt: FirestoreTimestamp;
  /** When all participants settled; null while open */
  settledAt: FirestoreTimestamp | null;
}

/**
 * A logged phone call between two platform users.
 *
 * Firestore path: /calls/{callId}
 */
export interface Call {
  /** Firestore document ID */
  id: string;
  /** UID of the caller */
  callerId: string;
  /** UID of the recipient */
  recipientId: string;
  status: CallStatus;
  /** Call duration in whole seconds (integer); 0 if the call was not answered */
  durationSeconds: number;
  /** URL to call recording, if available and consented */
  recordingUrl?: string;
  /** Optional link to a related Address */
  relatedAddressId?: string;
  /** Optional link to a related Dispatch */
  relatedDispatchId?: string;
  /** When the call attempt began */
  startedAt: FirestoreTimestamp;
  /** When the call ended; null if still ongoing */
  endedAt: FirestoreTimestamp | null;
  createdAt: FirestoreTimestamp;
}

/**
 * Global configuration for a single campaign year.
 * There is exactly one document per year.
 *
 * Firestore path: /campaignSettings/{year}   (e.g. /campaignSettings/2025)
 */
export interface CampaignSettings {
  /** Year string used as the Firestore document ID, e.g. "2025" */
  id: string;
  /** Gregorian year (integer) */
  year: number;
  /** Display name shown in the UI, e.g. "Purim 5785 – 2025" */
  displayName: string;
  /** ISO 8601 date — when volunteer sign-ups open, e.g. "2025-02-01" */
  signUpStartDate: string;
  /** ISO 8601 date — the Purim delivery day */
  deliveryDate: string;
  /** ISO 8601 date — when the campaign officially closes */
  endDate: string;
  /** Whether this campaign is the currently active one */
  isActive: boolean;
  /** Fundraising goal in minor units (integer) */
  donationGoalMinorUnits: number;
  currency: CurrencyCode;
  /** Campaign rules / instructions shown to volunteers (markdown) */
  rules?: string;
  /** Maximum number of volunteers allowed per group (integer) */
  maxVolunteersPerGroup: number;
  /** Maximum number of addresses per binder (integer) */
  maxAddressesPerBinder: number;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

/**
 * A platform-wide announcement pushed to a target audience.
 *
 * Firestore path: /announcements/{announcementId}
 */
export interface Announcement {
  /** Firestore document ID */
  id: string;
  title: string;
  /** Announcement body (markdown supported) */
  body: string;
  /** UID of the admin or coordinator who authored this */
  authorId: string;
  targetAudience: AnnouncementAudience;
  /** After this timestamp the announcement is considered expired; null = never */
  expiresAt: FirestoreTimestamp | null;
  /** Whether the announcement is pinned at the top of the feed */
  isPinned: boolean;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

// ─────────────────────────────────────────────────────────────────────────────
// Feed item — discriminated union payload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type-safe payload for each FeedItemType.
 * Narrow on `FeedItem.type` (or `payload.type`) before accessing payload fields.
 */
export type FeedItemPayload =
  | {
      type: "dispatch_created";
      dispatchId: string;
      binderId: string;
      /** Number of addresses in the dispatch (integer) */
      addressCount: number;
    }
  | {
      type: "dispatch_completed";
      dispatchId: string;
      binderId: string;
      /** Number of addresses successfully delivered (integer) */
      completedCount: number;
    }
  | {
      type: "delivery_completed";
      addressId: string;
      recipientName: string;
    }
  | {
      type: "donation_received";
      transactionId: string;
      /** Amount in minor units (integer) */
      amountMinorUnits: number;
      currency: CurrencyCode;
    }
  | {
      type: "announcement_posted";
      announcementId: string;
      title: string;
    }
  | {
      type: "user_joined";
      userId: string;
      role: UserRole;
    }
  | {
      type: "binder_assigned";
      binderId: string;
      groupId: string;
    }
  | {
      type: "call_made";
      callId: string;
      /** Duration in seconds (integer) */
      durationSeconds: number;
    }
  | {
      type: "split_created";
      splitId: string;
      /** Number of participants in the split (integer) */
      participantCount: number;
    }
  | {
      type: "split_settled";
      splitId: string;
    };

/**
 * A single entry in the global activity feed.
 * Feeds are rendered in reverse-chronological order.
 *
 * Firestore path: /feedItems/{feedItemId}
 */
export interface FeedItem {
  /** Firestore document ID */
  id: string;
  type: FeedItemType;
  /** UID of the user who triggered this event */
  actorId: string;
  /**
   * Denormalised actor display name for fast rendering without extra reads.
   * Must be kept in sync when User.displayName changes.
   */
  actorDisplayName: string;
  payload: FeedItemPayload;
  /** Campaign year this feed item is scoped to (integer) */
  campaignYear: number;
  createdAt: FirestoreTimestamp;
}
