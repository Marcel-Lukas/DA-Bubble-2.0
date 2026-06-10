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

/** Sidebar list of users for direct messaging, with online + unread state. */
export class DirectMessageComponent implements OnInit, OnDestroy {
  showMessages = false;
  activeUser?: User;
  activeUsers$!: Observable<any[]>;
  inactiveUsers$!: Observable<any[]>;
  /** UIDs of chat partners with unread messages (for the blinking indicator). */
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
    // Hide orphaned/offline guest accounts (empty email). An active guest stays
    // visible to everyone so they can be messaged. The own account is always
    // visible.
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
   * Decides whether a user is shown in the direct-message list.
   * - Ghost/partial documents without a name (e.g. only presence fields) are
   *   always hidden.
   * - The own account is always visible.
   * - Registered users (with an email) are always visible.
   * - Guests (empty/missing email) are only visible while online, so orphaned
   *   guest documents do not appear but an active guest can be messaged.
   */
  private isVisibleUser(user: User): boolean {
    // Never show ghost documents (no name) – not even the own one.
    if (!user.uName || user.uName.trim() === '') return false;
    if (user.uId === this.activeUserId) return true;
    // Full (registered) users have a non-empty email.
    if (user.uEmail && user.uEmail !== '') return true;
    // Remaining: guests (empty/missing email) – only when online.
    return this.isOnline(user);
  }

  /**
   * Determines the online status from the last sign of life (uLastSeen). A user
   * counts as online when their last heartbeat is younger than the presence
   * threshold – so a tab closed without logout is detected as offline shortly
   * afterwards.
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
