import {
  Injectable,
  inject,
  Injector,
  runInInjectionContext,
} from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
} from '@angular/fire/firestore';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Manages notifications for new messages:
 * - plays a sound when a new message arrives
 * - tracks per chat (channel ID or user ID) whether there are unread messages,
 *   so the contact bar can display a blinking indicator.
 */
@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  /** ID of the currently open chat (channel ID or chat partner UID). */
  private activeChatId: string | null = null;
  /** UID of the currently logged-in user. */
  private activeUserId: string | null = null;
  /**
   * True if the active user is a guest account (anonymous, empty uEmail).
   * Guests are excluded from persisting uLastSeen.
   */
  private isGuest = false;
  /** Channel IDs the user is a member of (for relevant notifications). */
  private memberChannelIds = new Set<string>();

  /**
   * Point in time from which messages count as "new". Loaded on start from
   * users/<uid>.uLastRead, so that messages missed during offline/logout
   * periods are also recognized as unread.
   */
  private startTime = Timestamp.now();

  /** Interval (ms) at which uLastSeen is updated (heartbeat). */
  private readonly heartbeatMs = 20000;
  /**
   * Time window (ms) within which a user counts as "online" based on their
   * last heartbeat (uLastSeen). If the last heartbeat is older than this,
   * the user is treated as offline – even if uStatus is still true (e.g.
   * when the browser tab was closed without an explicit logout).
   */
  static readonly ONLINE_THRESHOLD_MS = 55000;
  /** Handle of the heartbeat interval. */
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  /** Reference to the beforeunload handler (for removal in stop()). */
  private beforeUnloadHandler?: () => void;
  /**
   * Only true once loadLastSeen() + listeners had time to load missed
   * messages. Prevents a setActiveChat() call right after start() from
   * writing uLastSeen=now() (race -> messages swallowed).
   */
  private readyToPersist = false;

  /** Set of all chats (channel ID / user ID) with unread messages. */
  private unreadSubject = new BehaviorSubject<Set<string>>(new Set());
  /** Observable with the IDs of all chats that have unread messages. */
  readonly unread$: Observable<Set<string>> = this.unreadSubject.asObservable();

  private unsubMessages?: () => void;
  private unsubChannels?: () => void;
  private audio?: HTMLAudioElement;

  /** Prepare the audio element (lazily, so it only happens in the browser). */
  private getAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio('assets/sounds/new-message-sound.wav');
      this.audio.preload = 'auto';
    }
    return this.audio;
  }

  /**
   * Starts the real-time monitoring of new messages for the active user.
   * Should be called once after login (e.g. in the MainContent component)
   * with the user's own UID. First reads the last "seen" timestamp, so that
   * messages missed while offline are captured as well.
   */
  async start(activeUserId: string | null): Promise<void> {
    if (!activeUserId) return;
    this.activeUserId = activeUserId;
    this.readyToPersist = false;
    this.isGuest = await this.checkIsGuest(activeUserId);
    this.startTime = await this.loadLastRead(activeUserId);
    this.listenForChannels();
    this.listenForMessages();
    this.startHeartbeat();
    // Give the listeners a brief moment to load missed messages before
    // uLastRead may be overwritten for the first time.
    setTimeout(() => (this.readyToPersist = true), 2000);
  }

  /** Stops the monitoring and resets the state. */
  stop(): void {
    // On explicit stop (e.g. logout) only persist the read marker; the
    // presence heartbeat is intentionally left to age out.
    this.persistLastRead();
    this.stopHeartbeat();
    this.unsubMessages?.();
    this.unsubMessages = undefined;
    this.unsubChannels?.();
    this.unsubChannels = undefined;
    this.memberChannelIds.clear();
    this.unreadSubject.next(new Set());
    this.activeUserId = null;
    this.isGuest = false;
    this.readyToPersist = false;
  }

  /**
   * Checks whether the given user is a guest account. Guests are anonymous
   * users with an empty uEmail and should be excluded from persisting
   * uLastSeen.
   */
  private async checkIsGuest(uid: string): Promise<boolean> {
    try {
      const ref = doc(this.firestore, 'users', uid);
      const snap = await getDoc(ref);
      return snap.data()?.['uEmail'] === '';
    } catch {
      return false;
    }
  }

  /**
   * Loads the last stored "read" timestamp from the users doc. This marks the
   * point in time up to which the user has seen all messages, so messages
   * created after it (and missed while offline) are recognized as unread.
   * Fallback is the current time (no doc / no field -> nothing missed).
   */
  private async loadLastRead(uid: string): Promise<Timestamp> {
    try {
      const ref = doc(this.firestore, 'users', uid);
      const snap = await getDoc(ref);
      const lastRead = snap.data()?.['uLastRead'];
      if (lastRead instanceof Timestamp) return lastRead;
    } catch {
      /* Ignore read errors -> fallback now() */
    }
    return Timestamp.now();
  }

  /**
   * Writes the current time as uLastSeen into the users doc. This is the
   * presence heartbeat and runs on every tick so that other clients can tell
   * whether the user is still online (last heartbeat younger than
   * ONLINE_THRESHOLD_MS). It writes regardless of unread messages – the
   * "missed messages" protection is handled separately via the startTime
   * marker, not by withholding the heartbeat.
   *
   * Guest accounts are excluded so that orphaned guest docs are not kept
   * alive by a heartbeat.
   */
  private persistLastSeen(): void {
    if (!this.activeUserId) return;
    // Guest accounts are excluded from persisting uLastSeen.
    if (this.isGuest) return;
    if (!this.readyToPersist) return;
    const uid = this.activeUserId;
    runInInjectionContext(this.injector, () => {
      const ref = doc(this.firestore, 'users', uid);
      // updateDoc (NOT setDoc/merge) so a deleted/missing user doc is never
      // re-created as a partial "ghost" document containing only presence
      // fields. If the doc no longer exists the write simply fails silently.
      updateDoc(ref, { uLastSeen: Timestamp.now() }).catch(() => {
        /* Ignore write errors (e.g. doc deleted / missing permissions) */
      });
    });
    // Active usage also advances the "read" marker (when nothing is unread).
    this.persistLastRead();
  }

  /**
   * Writes the current time as uLastRead into the users doc – but ONLY when
   * there are no unread messages. Otherwise messages not yet read would be
   * swallowed on the next start (the read marker must not move past unread
   * messages). This is independent of the presence heartbeat (uLastSeen).
   */
  private persistLastRead(): void {
    if (!this.activeUserId) return;
    if (this.isGuest) return;
    if (!this.readyToPersist) return;
    if (this.unreadSubject.value.size > 0) return;
    const uid = this.activeUserId;
    runInInjectionContext(this.injector, () => {
      const ref = doc(this.firestore, 'users', uid);
      // updateDoc (NOT setDoc/merge) so a deleted/missing user doc is never
      // re-created as a partial "ghost" document containing only presence
      // fields.
      updateDoc(ref, { uLastRead: Timestamp.now() }).catch(() => {
        /* Ignore write errors (e.g. doc deleted / missing permissions) */
      });
    });
  }

  /**
   * Determines whether a user is currently online based on their last
   * heartbeat (uLastSeen). A user counts as online when their last heartbeat
   * is younger than ONLINE_THRESHOLD_MS. This is more reliable than uStatus,
   * because it also catches users who closed the tab without logging out.
   *
   * Falls back to the legacy uStatus flag only when no uLastSeen is present
   * (e.g. for users that never sent a heartbeat yet).
   */
  static isUserOnline(user: {
    uStatus?: unknown;
    uLastSeen?: unknown;
  } | null | undefined): boolean {
    if (!user) return false;
    const lastSeenMs = NotificationService.toMillis(user.uLastSeen);
    if (lastSeenMs === null) {
      return user.uStatus === true || user.uStatus === 'true';
    }
    return Date.now() - lastSeenMs < NotificationService.ONLINE_THRESHOLD_MS;
  }

  /**
   * Normalizes a Firestore Timestamp (or compatible value) into milliseconds.
   * Returns null when the value cannot be interpreted as a point in time.
   */
  private static toMillis(value: unknown): number | null {
    if (value instanceof Timestamp) return value.toMillis();
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as { seconds?: unknown }).seconds === 'number'
    ) {
      return (value as { seconds: number }).seconds * 1000;
    }
    return null;
  }

  /** Starts the periodic heartbeat + beforeunload safeguard. */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    // First heartbeat NOT immediately: listeners need a moment to load
    // missed messages (otherwise race -> now() -> messages lost).
    this.heartbeatTimer = setInterval(
      () => this.persistLastSeen(),
      this.heartbeatMs
    );
    // On tab close we deliberately do NOT refresh the heartbeat: letting
    // uLastSeen age out is what marks the user offline after the threshold.
    this.beforeUnloadHandler = () => this.persistLastRead();
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  /** Stops the heartbeat and removes the beforeunload handler. */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = undefined;
    }
  }

  /**
   * Tells the service which chat is currently open. For this chat no sound
   * is played and the unread indicator is removed.
   */
  setActiveChat(
    chatType: 'private' | 'channel' | 'thread' | 'new',
    chatId: string | null
  ): void {
    this.activeChatId = chatType === 'new' ? null : chatId;
    if (this.activeChatId) {
      this.markAsRead(this.activeChatId);
    }
    // Switching chat = active usage -> update heartbeat + read marker.
    this.persistLastSeen();
  }

  /** Removes the unread indicator of a chat. */
  markAsRead(chatId: string): void {
    const current = this.unreadSubject.value;
    if (current.has(chatId)) {
      const updated = new Set(current);
      updated.delete(chatId);
      this.unreadSubject.next(updated);
    }
  }

  /**
   * Keeps the list of channels the user is a member of up to date.
   * Notifications are only triggered for these channels.
   */
  private listenForChannels(): void {
    this.unsubChannels?.();
    this.unsubChannels = runInInjectionContext(this.injector, () => {
      const col = collection(this.firestore, 'channels');
      const q = query(
        col,
        where('cUserIds', 'array-contains', this.activeUserId)
      );
      return onSnapshot(q, (snap) => {
        this.memberChannelIds = new Set(snap.docs.map((d) => d.id));
      });
    });
  }

  /**
   * Listens for all new messages created after the start that are addressed
   * to the active user (DM to me or channel message).
   */
  private listenForMessages(): void {
    this.unsubMessages?.();
    this.unsubMessages = runInInjectionContext(this.injector, () => {
      const col = collection(this.firestore, 'messages');
      const q = query(
        col,
        where('mTime', '>', this.startTime),
        orderBy('mTime', 'asc')
      );
      return onSnapshot(q, (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            this.handleNewMessage(change.doc.data());
          }
        });
      });
    });
  }

  /** Processes a single newly arrived message. */
  private handleNewMessage(data: any): void {
    const senderId: string | null = data?.mSenderId ?? null;
    // Own messages do not trigger a notification.
    if (!senderId || senderId === this.activeUserId) return;

    const chatId = this.resolveChatId(data);
    if (!chatId) return;

    // Active chat -> no sound, no blinking.
    if (chatId === this.activeChatId) return;

    this.addUnread(chatId);
    this.playSound();
  }

  /**
   * Determines the ID of the chat (for the indicator in the contact bar).
   * - DM to me -> ID of the sender (that's the chat's name in the DM list)
   * - channel message -> channel ID
   */
  private resolveChatId(data: any): string | null {
    if (data?.mThreadId) return null; // Ignore thread replies
    if (data?.mChannelId) {
      // Only consider channels the user is a member of.
      return this.memberChannelIds.has(data.mChannelId)
        ? (data.mChannelId as string)
        : null;
    }
    if (data?.mUserId === this.activeUserId) {
      return (data?.mSenderId as string) ?? null;
    }
    return null;
  }

  private addUnread(chatId: string): void {
    const current = this.unreadSubject.value;
    if (!current.has(chatId)) {
      const updated = new Set(current);
      updated.add(chatId);
      this.unreadSubject.next(updated);
    }
  }

  /** Plays the notification sound (errors are ignored). */
  private playSound(): void {
    try {
      const audio = this.getAudio();
      audio.currentTime = 0;
      audio.play().catch(() => {
        /* Autoplay possibly blocked by the browser – ignore */
      });
    } catch {
      /* Audio not available – ignore */
    }
  }
}
