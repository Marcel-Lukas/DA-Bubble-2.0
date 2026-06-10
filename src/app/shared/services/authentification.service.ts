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

@Injectable({
  providedIn: 'root',
})
export class AuthentificationService {
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);
  private injector = inject(Injector);

  private runInContext<T>(fn: () => Promise<T>): Promise<T> {
    return runInInjectionContext(this.injector, fn);
  }

  public currentUid: string | null = null;
  public registrationData: {
    email: string;
    password: string;
    username: string;
  } | null = null;

  /** ID des Standard-Channels, dem jeder neue/eingeloggte Nutzer beitritt. */
  private readonly defaultChannelId = '4ViNXTttFDYKlytrxQw4';

  /**
   * Maximale Inaktivitätsdauer (ms) für Gast-Konten. Ein Gast, dessen letzter
   * Heartbeat (uLastSeen) älter ist, gilt als verwaist (Tab/Browser ohne
   * Logout geschlossen) und wird beim nächsten Login eines beliebigen Nutzers
   * vollständig gelöscht – nicht nur als offline angezeigt.
   */
  private readonly guestInactivityMs = 5 * 60 * 1000;

  constructor() {}

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
        // Presence-Felder sofort setzen, damit ein frisch angelegter Gast nie
        // als "verwaist" (fehlendes uLastSeen) gilt und von einem zeitgleich/
        // direkt danach laufenden Cleanup gelöscht wird (Bug ab Gast3).
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
   * Bereinigt verwaiste Gast- und Geister-Dokumente und ermittelt einen freien,
   * fortlaufend nummerierten Gast-Namen (Gast, Gast2, Gast3 …).
   *
   * Gelöscht werden:
   * - Geister-Dokumente: Teil-Dokumente ohne Namen (uName fehlt/leer), die z.B.
   *   durch einen nachlaufenden Presence-Write auf ein bereits gelöschtes Doc
   *   entstehen konnten.
   * - VERWAISTE Gäste (leere E-Mail), deren letzte Aktivität (uLastSeen) länger
   *   als {@link guestInactivityMs} zurückliegt. Damit werden Gast-Konten, deren
   *   Tab/Browser ohne Logout geschlossen wurde, vollständig entfernt statt nur
   *   als offline angezeigt zu werden.
   *
   * Noch AKTIVE Gäste (Heartbeat jünger als die Inaktivitätsschwelle) werden
   * NICHT gelöscht und behalten ihren Platz; der neue Gast bekommt die nächste
   * freie Nummer. Das eigene Dokument (currentUid) wird nie gelöscht.
   *
   * @param currentUid UID des sich gerade anmeldenden Nutzers (wird nie gelöscht).
   * @returns Der zu vergebende Gast-Name (z.B. "Gast" oder "Gast2").
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
      console.warn('Bereinigung alter Gast-/Geister-Dokumente fehlgeschlagen', cleanupErr);
      return 'Gast';
    }
  }

  /**
   * Löscht verwaiste Gast-Konten (leere E-Mail), deren letzte Aktivität
   * (uLastSeen) länger als {@link guestInactivityMs} zurückliegt. Wird bei
   * jedem Login eines beliebigen Nutzers aufgerufen, damit sich keine alten
   * Gast-Dokumente ansammeln – auch wenn längere Zeit kein neuer Gast einloggt.
   *
   * Aktive Gäste (Heartbeat innerhalb der Schwelle) bleiben unangetastet.
   *
   * @param currentUid UID des angemeldeten Nutzers (wird nie gelöscht).
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
      console.warn('Bereinigung inaktiver Gast-Dokumente fehlgeschlagen', cleanupErr);
    }
  }

  /**
   * Prüft, ob ein Gast als verwaist gilt: Sein letzter Heartbeat (uLastSeen)
   * liegt länger als {@link guestInactivityMs} zurück. Fehlt uLastSeen ganz
   * (z.B. Alt-Gast vor Einführung des Heartbeats), gilt er ebenfalls als
   * verwaist und wird gelöscht.
   *
   * @param data Teil-Daten des Gast-Dokuments.
   * @returns true, wenn der Gast gelöscht werden soll.
   */
  private isGuestExpired(data: Partial<UserInterface>): boolean {
    const lastSeen = (data as { uLastSeen?: unknown }).uLastSeen;
    const lastSeenMs = this.toMillis(lastSeen);
    if (lastSeenMs === null) return true;
    return Date.now() - lastSeenMs > this.guestInactivityMs;
  }

  /**
   * Normalisiert einen Firestore-Timestamp (oder kompatiblen Wert) in
   * Millisekunden. Gibt null zurück, wenn der Wert kein Zeitpunkt ist.
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
   * Entfernt ausschließlich Geister-Dokumente (Teil-Dokumente ohne Namen).
   * Wird bei jedem Login aufgerufen, damit verwaiste Presence-only-Docs nicht
   * in den Listen auftauchen. Gast-Nummerierung ist hier irrelevant.
   *
   * @param currentUid UID des angemeldeten Nutzers (wird nie gelöscht).
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
      console.warn('Bereinigung der Geister-Dokumente fehlgeschlagen', cleanupErr);
    }
  }

  /**
   * Ermittelt den nächsten freien Gast-Namen anhand der bereits vergebenen
   * (aktiven) Gast-Namen. Der erste Gast heißt "Gast", danach "Gast2",
   * "Gast3" usw. – es wird stets die kleinste freie Nummer gewählt.
   *
   * @param takenNames Namen der aktuell aktiven Gäste.
   * @returns Der nächste freie Gast-Name.
   */
  private generateGuestName(takenNames: string[]): string {
    const taken = new Set(takenNames);
    if (!taken.has('Gast')) return 'Gast';
    let index = 2;
    while (taken.has(`Gast${index}`)) index++;
    return `Gast${index}`;
  }

  /**
   * Baut eine zufällige, aber pro Gast stabile Avatar-URL über pravatar.cc.
   * Die UID dient als Seed (?u=<uid>), damit jeder Gast ein eigenes Bild
   * erhält und es über Reloads/Re-Renders hinweg gleich bleibt.
   *
   * @param uid UID des Gasts (Seed für das Bild).
   * @returns Vollständige Bild-URL.
   */
  private buildGuestAvatarUrl(uid: string): string {
    return `https://i.pravatar.cc/300?u=${encodeURIComponent(uid)}`;
  }

  /**
   * Fügt den Nutzer dem Standard-Channel hinzu. Schlägt fehlertolerant fehl:
   * Wenn der Channel nicht existiert (z.B. versehentlich gelöscht), wird er
   * neu angelegt, statt den gesamten Login abzubrechen.
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
            cDescription: 'Standard-Channel für alle Mitglieder.',
            cCreatedByUser: uid,
            cUserIds: [uid],
            cTime: serverTimestamp(),
          });
        }
      });
    } catch (channelErr) {
      console.warn('Beitritt zum Standard-Channel fehlgeschlagen (Login wird fortgesetzt)', channelErr);
    }
  }

  async sendResetPasswordEmail(email: string): Promise<void> {
    const querySnapshot = await this.runInContext(async () => {
      const usersCollection = collection(this.firestore, 'users');
      const q = query(usersCollection, where('uEmail', '==', email));
      return getDocs(q);
    });
    if (querySnapshot.empty) return Promise.reject('No user with this email found');
    return sendPasswordResetEmail(this.auth, email);
  }

  async confirmResetPassword(oobCode: string, newPassword: string): Promise<void> {
    return confirmPasswordReset(this.auth, oobCode, newPassword);
  }

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
        console.warn('Gast-Löschen fehlgeschlagen, weiter mit Sign-Out', deleteErr);
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
      console.warn('Status-Update fehlgeschlagen (Dokument evtl. gelöscht)', err);
    }
  }

  private async signOutUser(): Promise<void> {
    await this.auth.signOut();
    this.currentUid = null;
  }
}
