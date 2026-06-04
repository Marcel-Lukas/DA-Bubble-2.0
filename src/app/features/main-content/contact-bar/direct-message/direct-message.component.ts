import { CommonModule } from '@angular/common';
import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { Firestore, collectionData, collection, query } from '@angular/fire/firestore';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { User } from '../../../../shared/interfaces/user.interface';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-direct-message',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './direct-message.component.html',
  styleUrl: './direct-message.component.scss',
})

export class DirectMessageComponent implements OnInit {
  showMessages = false;
  activeUser?: User;
  activeUsers$!: Observable<any[]>;
  inactiveUsers$!: Observable<any[]>;
  @Input() activeUserId!: string | null;
  @Output() openChat = new EventEmitter<{ chatType: 'private' | 'channel'; chatId: string }>();
  @Output() toggleMessage = new EventEmitter<boolean>();

  someAction() {
    const screenWidth = window.innerWidth;
    
    if (screenWidth < 1000) {
      this.toggleMessage.emit(true);
    }
  }
  
  constructor(private firestore: Firestore, private route: ActivatedRoute) {}


  ngOnInit(): void {
    if (this.activeUserId) {
      this.loadUsers();
  
    }
  }



  loadUsers(): void {
    const usersCollection = collection(this.firestore, 'users');
    const usersQuery = query(usersCollection);
    const users$ = collectionData(usersQuery, { idField: 'uId' }).pipe(
      map((users: any[]) => users.map(user => user as User))
    );
    this.activeUsers$ = users$.pipe(
      map(users => users.filter(user => user.uId === this.activeUserId))
    );
    this.inactiveUsers$ = users$.pipe(
      map(users => users.filter(user => user.uId !== this.activeUserId))
    );
    users$.subscribe(users => {
      this.activeUser = users.find(user => user.uId === this.activeUserId);
    });
  }


  showAllMessages() {
    this.showMessages = !this.showMessages;
  }

  
  selectPrivateChat(userId: string) {
    this.openChat.emit({
      chatType: 'private',
      chatId: userId,
    });
  }
}
