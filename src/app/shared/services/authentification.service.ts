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
      await this.cleanupOrphanedGuests(this.currentUid!);
      const guestData: UserInterface = {
        uId: this.currentUid!,
        uName: 'Gast',
        uEmail: '',
        uUserImage: 'assets/img/profile.png',
        uStatus: true,
        uLastReactions: ['👍', '🙏🏻', '🔥'],
      };
      const userRef = collection(this.firestore, 'users');
      const userDocRef = doc(userRef, this.currentUid!);
      await setDoc(userDocRef, guestData, { merge: true });
      await this.addUserToDefaultChannel(this.currentUid!);
      return result;
    });
  }

  /**
   * Entfernt verwaiste Gast-Dokumente, die von früheren Gast-Sessions
   * übrig geblieben sind (z.B. wenn der Tab ohne Logout geschlossen wurde).
   * Der aktuelle Gast (currentUid) wird dabei ausgenommen.
   */
  private async cleanupOrphanedGuests(currentUid: string): Promise<void> {
    try {
      await this.runInContext(async () => {
        const usersCollection = collection(this.firestore, 'users');
        const guestQuery = query(usersCollection, where('uEmail', '==', ''));
        const snapshot = await getDocs(guestQuery);
        const deletions = snapshot.docs
          .filter((docSnap) => docSnap.id !== currentUid)
          .map((docSnap) => deleteDoc(doc(usersCollection, docSnap.id)));
        await Promise.all(deletions);
      });
    } catch (cleanupErr) {
      console.warn('Bereinigung alter Gast-Dokumente fehlgeschlagen', cleanupErr);
    }
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
