import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, Injector, inject, runInInjectionContext } from '@angular/core';
import { Firestore, collectionData, collection, query } from '@angular/fire/firestore';
import { map } from 'rxjs/operators';
import { Observable, Subscription } from 'rxjs';
import { User } from '../../../../shared/interfaces/user.interface';
import { NotificationService } from '../../../../shared/services/notification.service';
import { ActivatedRoute } from '@angular/router';
import { ImageFallbackDirective } from '../../../../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-direct-message',
  standalone: true,
  imports: [CommonModule, ImageFallbackDirective],
  templateUrl: './direct-message.component.html',
  styleUrl: './direct-message.component.scss',
})

export class DirectMessageComponent implements OnInit, OnDestroy {
  showMessages = false;
  activeUser?: User;
  activeUsers$!: Observable<any[]>;
  inactiveUsers$!: Observable<any[]>;
  /** UIDs der Gesprächspartner mit ungelesenen Nachrichten (blinkende Markierung). */
  unreadChats = new Set<string>();
  @Input() activeUserId!: string | null;
  @Output() openChat = new EventEmitter<{ chatType: 'private' | 'channel'; chatId: string }>();
  @Output() toggleMessage = new EventEmitter<boolean>();

  private notificationService = inject(NotificationService);
  private unreadSub?: Subscription;

  someAction() {
    const screenWidth = window.innerWidth;
    
    if (screenWidth < 1000) {
      this.toggleMessage.emit(true);
    }
  }
  
  private injector = inject(Injector);

  constructor(private firestore: Firestore, private route: ActivatedRoute) {}


  ngOnInit(): void {
    if (this.activeUserId) {
      this.loadUsers();
    }
    this.unreadSub = this.notificationService.unread$.subscribe((set) => {
      this.unreadChats = set;
    });
  }

  ngOnDestroy(): void {
    this.unreadSub?.unsubscribe();
  }



  loadUsers(): void {
    const users$ = runInInjectionContext(this.injector, () => {
      const usersCollection = collection(this.firestore, 'users');
      const usersQuery = query(usersCollection);
      return collectionData(usersQuery, { idField: 'uId' }).pipe(
        map((users: any[]) => users.map(user => user as User))
      );
    });
    // Verwaiste/offline Gast-Konten (leere E-Mail) ausblenden. Ein aktiver Gast
    // (uStatus === true) bleibt für alle sichtbar, damit ihm geschrieben werden
    // kann. Das eigene Konto ist immer sichtbar.
    const visibleUsers$ = users$.pipe(
      map(users => users.filter(user => this.isVisibleUser(user)))
    );
    this.activeUsers$ = visibleUsers$.pipe(
      map(users => users.filter(user => user.uId === this.activeUserId))
    );
    this.inactiveUsers$ = visibleUsers$.pipe(
      map(users => users.filter(user => user.uId !== this.activeUserId))
    );
    visibleUsers$.subscribe(users => {
      this.activeUser = users.find(user => user.uId === this.activeUserId);
    });
  }


  /**
   * Entscheidet, ob ein Nutzer in der Direktnachrichten-Liste sichtbar ist.
   * - Geister-/Teil-Dokumente ohne Namen (z.B. nur Presence-Felder) werden
   *   grundsätzlich ausgeblendet.
   * - Das eigene Konto ist immer sichtbar.
   * - Registrierte Nutzer (mit E-Mail) sind immer sichtbar.
   * - Gäste (leere/fehlende E-Mail) sind nur sichtbar, wenn sie aktuell online
   *   sind, damit verwaiste Gast-Dokumente nicht auftauchen, ein aktiver Gast
   *   aber angeschrieben werden kann.
   */
  private isVisibleUser(user: User): boolean {
    // Geister-Dokumente (kein Name) niemals anzeigen – auch nicht das eigene.
    if (!user.uName || user.uName.trim() === '') return false;
    if (user.uId === this.activeUserId) return true;
    // Vollwertige (registrierte) Nutzer haben eine nicht-leere E-Mail.
    if (user.uEmail && user.uEmail !== '') return true;
    // Verbleibend: Gäste (leere/fehlende E-Mail) – nur wenn online.
    return this.isOnline(user);
  }

  /**
   * Bestimmt den Online-Status anhand des letzten Lebenszeichens (uLastSeen).
   * Ein Nutzer gilt als online, wenn sein letztes Heartbeat jünger als die
   * Presence-Schwelle ist – so wird auch ein ohne Logout geschlossener Tab
   * nach kurzer Zeit als offline erkannt.
   */
  isOnline(user: User): boolean {
    return NotificationService.isUserOnline(user);
  }

  showAllMessages() {
    this.showMessages = !this.showMessages;
  }

  
  selectPrivateChat(userId: string) {
    this.notificationService.markAsRead(userId);
    this.openChat.emit({
      chatType: 'private',
      chatId: userId,
    });
  }
}
