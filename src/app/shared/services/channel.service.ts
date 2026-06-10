import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collectionData,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  arrayUnion,
  writeBatch,
} from '@angular/fire/firestore';
import { Channel } from '../interfaces/channel.interface';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/** Firestore data access for channels (CRUD, membership and real-time reads). */
@Injectable({
  providedIn: 'root',
})
export class ChannelService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  async getAllChannels(): Promise<Channel[]> {
    const channelsCollectionRef = collection(this.firestore, 'channels');
    const querySnapshot = await getDocs(channelsCollectionRef);
    const allChannels: Channel[] = [];

    querySnapshot.forEach((docSnap) => {
      const channelData = { ...(docSnap.data() as Channel), cId: docSnap.id };
      allChannels.push(channelData);
    });

    return allChannels;
  }

  /**
   * Streams a channel in real time. Emits `null` when the channel is deleted,
   * so subscribers (e.g. the open chat) can react and close it.
   */
  getChannelRealtime(channelId: string): Observable<Channel | null> {
    return new Observable<Channel | null>((observer) => {
      const unsub = runInInjectionContext(this.injector, () => {
        const ref = doc(this.firestore, 'channels', channelId);
        return onSnapshot(ref, (snap) => {
          if (snap.exists()) {
            observer.next({ ...(snap.data() as Channel), cId: snap.id });
          } else {
            // Channel was deleted -> notify subscriber with null
            observer.next(null);
          }
        });
      });
      return () => unsub();
    });
  }

  async getChannel(channelId: string | null): Promise<Channel> {
    if (!channelId) {
      return Promise.reject(new Error('Invalid channelId: null'));
    }
    const channelDocRef = doc(this.firestore, 'channels', channelId);
    return getDoc(channelDocRef).then((docSnap) => {
      if (docSnap.exists()) {
        return { ...(docSnap.data() as Channel), cId: docSnap.id };
      } else {
        throw new Error('Channel not found');
      }
    });
  }
  
  addUsersToChannel(channelId: string, ...userIds: string[]): Promise<void> {
    const channelRef = doc(this.firestore, 'channels', channelId);
    return updateDoc(channelRef, {
      cUserIds: arrayUnion(...userIds)
    });
  }

  async createChannel(name: string, description: string, userId: string): Promise<string | void> {
    if (!name || !userId) return;
    const channelsCollectionRef = collection(this.firestore, 'channels');
    const newDocRef = doc(channelsCollectionRef);
    const newId = newDocRef.id;
    const newChannel: Channel = {
      cId: newId,
      cName: name,
      cDescription: description,
      cCreatedByUser: userId,
      cUserIds: [userId],
      cTime: serverTimestamp() as any,
    };
    await setDoc(newDocRef, newChannel);
    return newId;
  }

 
  async removeUserFromChannel(channelId: string, userId: string): Promise<void> {
    const channelRef = doc(this.firestore, 'channels', channelId);
    const channelSnap = await getDoc(channelRef);
    if (!channelSnap.exists()) return;
    const channelData = channelSnap.data();
    const currentUserIds: string[] = channelData['cUserIds'] || [];
    if (!currentUserIds.includes(userId)) return;
    const updatedUserIds = currentUserIds.filter(id => id !== userId);
    await updateDoc(channelRef, { cUserIds: updatedUserIds });
  }

  async updateChannelName(channelId: string, newName: string): Promise<void> {
    if (!channelId || !newName.trim()) return;

    const channelRef = doc(this.firestore, 'channels', channelId);
    await updateDoc(channelRef, { cName: newName.trim() });
  }

  async checkChannelNameExists(name: string): Promise<boolean> {
    const col = collection(this.firestore, 'channels');
    const q = query(col, where('cName', '==', name));
    const snap = await getDocs(q);
    return !snap.empty;
  }

  async updateChannelDescription(channelId: string, newDescription: string): Promise<void> {
    const channelRef = doc(this.firestore, 'channels', channelId);
    await updateDoc(channelRef, { cDescription: newDescription });
  }

  /**
   * Streams the channels the user is a member of, alphabetically sorted.
   * Includes `createdBy` so the UI can show owner-only actions (e.g. delete).
   */
  getSortedChannels(userId: string | null): Observable<{ id: string; name: string; createdAt: any; createdBy: string }[]> {
    return runInInjectionContext(this.injector, () => {
      const channelsRef  = collection(this.firestore, 'channels');
      const channelQuery = query(channelsRef, where('cUserIds', 'array-contains', userId));

      return collectionData(channelQuery, { idField: 'id' }).pipe(
        map((channels: any[]) =>
          channels
            .map(ch => ({
              id:        ch.id,
              name:      ch.cName,
              createdAt: ch.createdAt || 0,
              createdBy: ch.cCreatedByUser,
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }))
        )
      );
    });
  }


  allChannels(): Promise<Channel[]> {
    const channelsCollection = collection(this.firestore, 'channels');
    return getDocs(channelsCollection).then(snap => snap.docs.map(doc => doc.data() as Channel));
  }
  

  /**
   * Checks whether the given user is the creator/owner of the channel.
   */
  async isChannelOwner(channelId: string, userId: string | null): Promise<boolean> {
    if (!channelId || !userId) return false;
    const channelRef = doc(this.firestore, 'channels', channelId);
    const snap = await getDoc(channelRef);
    if (!snap.exists()) return false;
    return (snap.data() as Channel).cCreatedByUser === userId;
  }

  /**
   * Deletes a channel. Only the creator/owner is allowed to delete it; for any
   * other user the deletion is rejected (defense-in-depth alongside the UI).
   */
  async deleteChannel(channelId: string, requestingUserId: string | null): Promise<void> {
    if (!channelId) return;
    const isOwner = await this.isChannelOwner(channelId, requestingUserId);
    if (!isOwner) {
      throw new Error('Only the channel creator may delete this channel.');
    }
    const channelRef = doc(this.firestore, 'channels', channelId);
    return deleteDoc(channelRef);
  }

  async deleteChannelsByCreator(userId: string): Promise<void> {
    if (!userId) return;
  
    const colRef = collection(this.firestore, 'channels');
    const q      = query(colRef, where('cCreatedByUser', '==', userId));
  
    const snap = await getDocs(q);
    if (snap.empty) return;
  
    let batch   = writeBatch(this.firestore);
    let counter = 0;
  
    snap.forEach(docSnap => {
      batch.delete(docSnap.ref);
      counter++;
  
      // Firestore caps a write batch at 500 operations -> commit and restart.
      if (counter === 500) {
        batch.commit();
        batch   = writeBatch(this.firestore);
        counter = 0;
      }
    });
  
    if (counter > 0) {
      await batch.commit();
    }
  }
}
