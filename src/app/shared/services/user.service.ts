import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collectionData,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  setDoc,
  serverTimestamp,
  query,
} from '@angular/fire/firestore';
import { User } from '../interfaces/user.interface';
import { Observable, map } from 'rxjs';
import { Channel } from '../interfaces/channel.interface';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);


  getUserRealtime(userId: string): Observable<User | null> {
    return new Observable<User | null>((subscriber) => {
      const unsubscribe = runInInjectionContext(this.injector, () => {
        const userDocRef = doc(this.firestore, 'users', userId);
        return onSnapshot(
          userDocRef,
          (docSnap) => {
            if (docSnap.exists()) {
              subscriber.next(docSnap.data() as User);
            } else {
              subscriber.next(null);
            }
          },
          (error) => {
            subscriber.error(error);
          }
        );
      });

      return () => unsubscribe();
    });
  }

  async getAllUsers(): Promise<User[]> {
    const usersCollectionRef = collection(this.firestore, 'users');
    const querySnapshot = await getDocs(usersCollectionRef);
    const allUsers: User[] = [];

    querySnapshot.forEach((docSnap) => {
      const userData = { ...(docSnap.data() as User), uId: docSnap.id };
      if (UserService.isRealUser(userData)) allUsers.push(userData);
    });

    return allUsers;
  }

  /**
   * Filtert Geister-/Teil-Dokumente aus: Ein echter Nutzer (registriert oder
   * Gast) besitzt immer einen nicht-leeren uName. Presence-only-Dokumente
   * (nur uLastSeen/uLastRead), die durch nachlaufende Writes entstehen können,
   * werden so zuverlässig ignoriert.
   */
  static isRealUser(user: Partial<User> | null | undefined): boolean {
    return !!user && typeof user.uName === 'string' && user.uName.trim() !== '';
  }

  async getUser(userId: string | null): Promise<User> {
    if (!userId) {
      return Promise.reject(new Error('Invalid userId: null'));
    }
    const userDocRef = doc(this.firestore, 'users', userId);
    return getDoc(userDocRef).then((docSnap) => {
      if (docSnap.exists()) {
        return docSnap.data() as User;
      } else {
        throw new Error('User not found');
      }
    });
  }

  async getFilteredUsers(userIds: string[]): Promise<User[]> {
    if (!userIds || userIds.length === 0) {
      return [];
    }

    const results: User[] = [];

    for (const id of userIds) {
      const docRef = doc(this.firestore, 'users', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const userData = docSnap.data() as User;
        results.push(userData);
      } else {
        console.warn(`User not found for ID: ${id}`);
      }
    }

    return results;
  }

  getEveryUsers(): Observable<User[]> {
    return runInInjectionContext(this.injector, () => {
      const usersCollection = collection(this.firestore, 'users');
      const usersQuery = query(usersCollection);
      return (collectionData(usersQuery, { idField: 'uId' }) as Observable<User[]>).pipe(
        map((users) => users.filter((u) => UserService.isRealUser(u)))
      );
    });
  }

  async editLastReactions(
    userId: string | null,
    reaction: string
  ): Promise<void> {
    if (!userId) {
      console.warn('Invalid userId: null');
      return;
    }

    const userDocRef = doc(this.firestore, 'users', userId);

    try {
      const docSnap = await getDoc(userDocRef);

      if (!docSnap.exists()) {
        console.warn('User not found');
        return;
      }

      const userData = docSnap.data() as User;
      const lastReactions = userData.uLastReactions || [];
      const index = lastReactions.indexOf(reaction);

      if (index === 0) {
      } else if (index > 0) {
        lastReactions.splice(index, 1);
        lastReactions.unshift(reaction);
      } else {
        lastReactions.unshift(reaction);
        if (lastReactions.length > 2) {
          lastReactions.pop();
        }
      }

      await updateDoc(userDocRef, { uLastReactions: lastReactions });
    } catch (error) {
      console.error('Fehler beim Editieren der LastReactions:', error);
    }
  }

    
  async createChannelWithUsers( name: string, description: string, userId: string, userIds: string[] ): Promise<string | void> {
    if (!name || !userId || !userIds.length) return;
    const channelsCollectionRef = collection(this.firestore, 'channels');
    const newDocRef = doc(channelsCollectionRef);
    const newId = newDocRef.id;
    const newChannel: Channel = {
      cId: newId,
      cName: name,
      cDescription: description,
      cCreatedByUser: userId,
      cUserIds: userIds,
      cTime: serverTimestamp() as any,
    };
    await setDoc(newDocRef, newChannel);
    return newId;
  }


  getUserById(userId: string): Observable<User | undefined> {
    return runInInjectionContext(this.injector, () => {
      const usersCollection = collection(this.firestore, 'users');
      const usersQuery = query(usersCollection);
      return collectionData(usersQuery, { idField: 'uId' }).pipe(
        map((users: any[]) =>
          users.find((user) => user.uId === userId)
        )
      );
    });
  }


  allUsers(): Promise<User[]> {
    const usersCollection = collection(this.firestore, 'users');
    return getDocs(usersCollection).then(snap =>
      snap.docs
        .map(doc => ({ ...(doc.data() as User), uId: doc.id }))
        .filter(user => UserService.isRealUser(user))
    );
  }
 

  updateUserImage(userId: string, imageFileName: string): Promise<void> {
    const userDocRef = doc(this.firestore, 'users', userId);
    return updateDoc(userDocRef, { uUserImage: imageFileName });
  }
  
}
