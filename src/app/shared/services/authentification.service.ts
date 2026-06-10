import { inject, Injectable, Injector, runInInjectionContext } from '@angular/core';
import { UserInterface } from '../interfaces/user.interface';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import {
  Auth,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  UserCredential,
} from '@angular/fire/auth';
import { NotificationService } from './notification.service';

/**
 * Handles all authentication flows (email/password, Google, anonymous guest)
 * and the related Firestore user-document lifecycle (creation, presence,
 * default-channel membership and cleanup of orphaned guest/ghost docs).
 *
 * Firebase APIs must run inside an Angular injection context; every async
 * block that touches Firestore/Auth is therefore wrapped in {@link runInContext}.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthentificationService {
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);
  private injector = inject(Injector);

  /** Runs the given async block inside the Angular injection context. */
  private runInContext<T>(fn: () => Promise<T>): Promise<T> {
    return runInInjectionContext(this.injector, fn);
  }

  public currentUid: string | null = null;
  public registrationData: {
    email: string;
    password: string;
    username: string;
  } | null = null;

  /** ID of the default channel that every new/logged-in user joins. */
  private readonly defaultChannelId = '4ViNXTttFDYKlytrxQw4';

  /**
   * Maximum inactivity duration (ms) for guest accounts. A guest whose last
   * heartbeat (uLastSeen) is older is considered orphaned (tab/browser closed
   * without logout) and is fully deleted on the next login of any user –
   * not just shown as offline.
   */
  private readonly guestInactivityMs = 5 * 60 * 1000;

  constructor() {}

  /**
   * Validates that the email is not already taken and stashes the registration
   * data for the multi-step sign-up flow (avatar selection happens afterwards).
   */
  async prepareRegistration(email: string, password: string, username: string): Promise<void | UserCredential> {
    return this.runInContext(async () => {
      const usersCollection = collection(this.firestore, 'users');
      const q = query(usersCollection, where('uEmail', '==', email));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) return Promise.reject('User with this email is found');
      this.registrationData = {
        email,
        password,
        username
      };
      return Promise.resolve();
    });
  }

  /**
   * Finalizes the previously prepared registration: creates the Firebase Auth
   * user, writes the Firestore user document and joins the default channel.
   */
  async completeRegistration(profilePictureUrl: string): Promise<UserCredential> {
    if (!this.registrationData) {
      return Promise.reject('No active registration available');
    }
  
    const { email, password, username } = this.registrationData;
  
    const userCredential = await this.runInContext(() =>
      createUserWithEmailAndPassword(this.auth, email, password)
    );
    const uid = userCredential.user.uid;
  
    await this.runInContext(async () => {
      const userData: UserInterface = {
        uId:            uid,
        uName:          username,
        uEmail:         email,
        uUserImage:     'assets/img/' + profilePictureUrl,
        uStatus:        false,
        uLastReactions: ['👍', '🙏🏻', '🔥'],
      };

      const userRef    = collection(this.firestore, 'users');
      const userDocRef = doc(userRef, uid);
      await setDoc(userDocRef, userData);
    });

    await this.addUserToDefaultChannel(uid);

    this.registrationData = null;
    return userCredential;
  }

  /** Signs in with email/password, cleans up stale docs and marks user online. */
  async loginWithEmail(email: string, password: string): Promise<void | UserCredential> {
    return this.runInContext(async () => {
      const result = await signInWithEmailAndPassword(this.auth, email, password);
      this.currentUid = result.user.uid;
      await this.cleanupGhostUsers(this.currentUid!);
      await this.cleanupInactiveGuests(this.currentUid!);
      const userRef = collection(this.firestore, 'users');
      const userDocRef = doc(userRef, this.currentUid!);
      await updateDoc(userDocRef, { uStatus: true });
      return result;
    });
  }

  /** Signs in via Google popup and upserts the corresponding user document. */
  async loginWithGoogle(): Promise<void | UserCredential> {
    const provider = new GoogleAuthProvider();
    return this.runInContext(async () => {
      const result = await signInWithPopup(this.auth, provider);
      this.currentUid = result.user.uid;
      await this.cleanupGhostUsers(this.currentUid!);
      await this.cleanupInactiveGuests(this.currentUid!);
      const userData: UserInterface = {
        uId: this.currentUid!,
        uName: result.user.displayName || '',
        uEmail: result.user.email || '',
        uUserImage: result.user.photoURL || 'assets/img/profile.png',
        uStatus: true,
        uLastReactions: ['👍', '🙏🏻', '🔥'],
      };
      const userRef = collection(this.firestore, 'users');
      const userDocRef = doc(userRef, result.user.uid);
      await setDoc(userDocRef, userData, { merge: true });
      await this.addUserToDefaultChannel(this.currentUid!);
      return result;
    });
  }

  /**
   * Signs in anonymously as a guest. Cleans up orphaned guests, assigns the
   * next free guest name and a stable random avatar, then joins the default
   * channel.
   */
  async loginAsGuest(): Promise<void | UserCredential> {
    return this.runInContext(async () => {
      const result = await signInAnonymously(this.auth);
      this.currentUid = result.user.uid;
      const guestName = await this.cleanupOrphanedGuests(this.currentUid!);
      const now = Timestamp.now();
      const guestData: UserInterface = {
        uId: this.currentUid!,
        uName: guestName,
        uEmail: '',
        uUserImage: this.buildGuestAvatarUrl(this.currentUid!),
        uStatus: true,
        uLastReactions: ['👍', '🙏🏻', '🔥'],
        // Set presence fields immediately so a freshly created guest is never
        // treated as "orphaned" (missing uLastSeen) and deleted by a cleanup
        // running concurrently/right afterwards (bug starting at Gast3).
        uLastSeen: now,
        uLastRead: now,
      };
      const userRef = collection(this.firestore, 'users');
      const userDocRef = doc(userRef, this.currentUid!);
      await setDoc(userDocRef, guestData, { merge: true });
      await this.addUserToDefaultChannel(this.currentUid!);
      return result;
    });
  }

  /**
   * Cleans up orphaned guest and ghost documents and determines a free,
   * sequentially numbered guest name (Gast, Gast2, Gast3 …).
   *
   * Deleted are:
   * - Ghost documents: partial documents without a name (uName missing/empty),
   *   which could arise e.g. from a trailing presence write onto an already
   *   deleted doc.
   * - ORPHANED guests (empty email) whose last activity (uLastSeen) is older
   *   than {@link guestInactivityMs}. This fully removes guest accounts whose
   *   tab/browser was closed without logout, instead of just showing them as
   *   offline.
   *
   * Still ACTIVE guests (heartbeat younger than the inactivity threshold) are
   * NOT deleted and keep their slot; the new guest gets the next free number.
   * The own document (currentUid) is never deleted.
   *
   * @param currentUid UID of the user currently signing in (never deleted).
   * @returns The guest name to assign (e.g. "Gast" or "Gast2").
   */
  private async cleanupOrphanedGuests(currentUid: string): Promise<string> {
    try {
      return await this.runInContext(async () => {
        const usersCollection = collection(this.firestore, 'users');
        const snapshot = await getDocs(usersCollection);

        const activeGuestNames: string[] = [];
        const deletions: Promise<void>[] = [];

        snapshot.docs.forEach((docSnap) => {
          if (docSnap.id === currentUid) return;
          const data = docSnap.data() as Partial<UserInterface>;
          const name = (data.uName ?? '').trim();
          const isGhost = name === '';
          const isGuest = (data.uEmail ?? '') === '';

          if (isGhost) {
            deletions.push(deleteDoc(doc(usersCollection, docSnap.id)));
          } else if (isGuest && this.isGuestExpired(data)) {
            deletions.push(deleteDoc(doc(usersCollection, docSnap.id)));
          } else if (isGuest) {
            activeGuestNames.push(name);
          }
        });

        await Promise.all(deletions);
        return this.generateGuestName(activeGuestNames);
      });
    } catch (cleanupErr) {
      console.warn('Cleanup of old guest/ghost documents failed', cleanupErr);
      return 'Gast';
    }
  }

  /**
   * Deletes orphaned guest accounts (empty email) whose last activity
   * (uLastSeen) is older than {@link guestInactivityMs}. Called on every login
   * of any user so that no stale guest documents pile up – even if no new
   * guest logs in for a longer period.
   *
   * Active guests (heartbeat within the threshold) are left untouched.
   *
   * @param currentUid UID of the logged-in user (never deleted).
   */
  private async cleanupInactiveGuests(currentUid: string): Promise<void> {
    try {
      await this.runInContext(async () => {
        const usersCollection = collection(this.firestore, 'users');
        const snapshot = await getDocs(usersCollection);
        const deletions = snapshot.docs
          .filter((docSnap) => docSnap.id !== currentUid)
          .filter((docSnap) => {
            const data = docSnap.data() as Partial<UserInterface>;
            const isGuest = (data.uEmail ?? '') === '';
            const hasName = (data.uName ?? '').trim() !== '';
            return isGuest && hasName && this.isGuestExpired(data);
          })
          .map((docSnap) => deleteDoc(doc(usersCollection, docSnap.id)));
        await Promise.all(deletions);
      });
    } catch (cleanupErr) {
      console.warn('Cleanup of inactive guest documents failed', cleanupErr);
    }
  }

  /**
   * Checks whether a guest is considered orphaned: their last heartbeat
   * (uLastSeen) is older than {@link guestInactivityMs}. If uLastSeen is
   * missing entirely (e.g. a legacy guest from before the heartbeat existed),
   * the guest also counts as orphaned and is deleted.
   *
   * @param data Partial data of the guest document.
   * @returns true if the guest should be deleted.
   */
  private isGuestExpired(data: Partial<UserInterface>): boolean {
    const lastSeen = (data as { uLastSeen?: unknown }).uLastSeen;
    const lastSeenMs = this.toMillis(lastSeen);
    if (lastSeenMs === null) return true;
    return Date.now() - lastSeenMs > this.guestInactivityMs;
  }

  /**
   * Normalizes a Firestore Timestamp (or compatible value) into milliseconds.
   * Returns null when the value is not a point in time.
   */
  private toMillis(value: unknown): number | null {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as { toMillis?: unknown }).toMillis === 'function'
    ) {
      return (value as { toMillis: () => number }).toMillis();
    }
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as { seconds?: unknown }).seconds === 'number'
    ) {
      return (value as { seconds: number }).seconds * 1000;
    }
    return null;
  }

  /**
   * Removes only ghost documents (partial documents without a name). Called on
   * every login so that orphaned presence-only docs do not show up in the
   * lists. Guest numbering is irrelevant here.
   *
   * @param currentUid UID of the logged-in user (never deleted).
   */
  private async cleanupGhostUsers(currentUid: string): Promise<void> {
    try {
      await this.runInContext(async () => {
        const usersCollection = collection(this.firestore, 'users');
        const snapshot = await getDocs(usersCollection);
        const deletions = snapshot.docs
          .filter((docSnap) => docSnap.id !== currentUid)
          .filter((docSnap) => {
            const data = docSnap.data() as Partial<UserInterface>;
            return (data.uName ?? '').trim() === '';
          })
          .map((docSnap) => deleteDoc(doc(usersCollection, docSnap.id)));
        await Promise.all(deletions);
      });
    } catch (cleanupErr) {
      console.warn('Cleanup of ghost documents failed', cleanupErr);
    }
  }

  /**
   * Determines the next free guest name based on the already taken (active)
   * guest names. The first guest is named "Gast", then "Gast2", "Gast3" etc. –
   * always picking the smallest free number.
   *
   * @param takenNames Names of the currently active guests.
   * @returns The next free guest name.
   */
  private generateGuestName(takenNames: string[]): string {
    const taken = new Set(takenNames);
    if (!taken.has('Gast')) return 'Gast';
    let index = 2;
    while (taken.has(`Gast${index}`)) index++;
    return `Gast${index}`;
  }

  /**
   * Builds a random but per-guest stable avatar URL via pravatar.cc. The UID
   * serves as the seed (?u=<uid>) so each guest gets its own image that stays
   * the same across reloads/re-renders.
   *
   * @param uid UID of the guest (seed for the image).
   * @returns Full image URL.
   */
  private buildGuestAvatarUrl(uid: string): string {
    return `https://i.pravatar.cc/300?u=${encodeURIComponent(uid)}`;
  }

  /**
   * Adds the user to the default channel. Fails gracefully: if the channel
   * does not exist (e.g. accidentally deleted), it is recreated instead of
   * aborting the entire login.
   */
  private async addUserToDefaultChannel(uid: string): Promise<void> {
    try {
      await this.runInContext(async () => {
        const channelRef = doc(this.firestore, 'channels', this.defaultChannelId);
        const channelSnap = await getDoc(channelRef);

        if (channelSnap.exists()) {
          await updateDoc(channelRef, { cUserIds: arrayUnion(uid) });
        } else {
          await setDoc(channelRef, {
            cName: 'Allgemein',
            cDescription: 'Default channel for all members.',
            cCreatedByUser: uid,
            cUserIds: [uid],
            cTime: serverTimestamp(),
          });
        }
      });
    } catch (channelErr) {
      console.warn('Joining the default channel failed (login continues)', channelErr);
    }
  }

  /** Sends a password reset email, but only if the address belongs to a user. */
  async sendResetPasswordEmail(email: string): Promise<void> {
    const querySnapshot = await this.runInContext(async () => {
      const usersCollection = collection(this.firestore, 'users');
      const q = query(usersCollection, where('uEmail', '==', email));
      return getDocs(q);
    });
    if (querySnapshot.empty) return Promise.reject('No user with this email found');
    return sendPasswordResetEmail(this.auth, email);
  }

  /** Completes a password reset using the out-of-band code from the email. */
  async confirmResetPassword(oobCode: string, newPassword: string): Promise<void> {
    return confirmPasswordReset(this.auth, oobCode, newPassword);
  }

  /**
   * Logs the user out. Anonymous guests are removed entirely, registered users
   * are marked offline, then the Firebase session is signed out.
   */
  async logout(): Promise<void> {
    const uid = this.currentUid;
    const user = this.auth.currentUser;
    
    await this.handleAnonymousGuest(user, uid);
    await this.updateUserStatus(uid);
    await this.signOutUser();
  }

  private async handleAnonymousGuest(user: any | null, uid: string | null): Promise<void> {
    if (user?.isAnonymous && uid) {
      try {
        await this.runInContext(async () => {
          const userDocRef = doc(collection(this.firestore, 'users'), uid);
          await deleteDoc(userDocRef);
        });
        await user.delete();
      } catch (deleteErr) {
        console.warn('Guest deletion failed, continuing with sign-out', deleteErr);
      }
    }
  }

  private async updateUserStatus(uid: string | null): Promise<void> {
    if (!uid) return;

    try {
      await this.runInContext(async () => {
        const userDoc = doc(collection(this.firestore, 'users'), uid);
        await updateDoc(userDoc, { uStatus: false });
      });
    } catch (err) {
      console.warn('Status update failed (document possibly deleted)', err);
    }
  }

  private async signOutUser(): Promise<void> {
    await this.auth.signOut();
    this.currentUid = null;
  }
}
