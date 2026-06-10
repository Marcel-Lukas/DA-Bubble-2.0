import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  inject,
} from '@angular/core';
import { Firestore, doc, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService } from '../../../shared/services/user.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-profil',
  standalone: true,
  imports: [CommonModule, FormsModule, ImageFallbackDirective],
  templateUrl: './profil.component.html',
  styleUrl: './profil.component.scss',
})

export class ProfilComponent {
  private originalUserImage!: string;
  
  firestore = inject(Firestore);
  isActive: boolean = true;
  showEditProfil: boolean = false;
  showAvatarChoice = false;
  editedUserName: string = '';
  items = [1, 2, 3, 4, 5, 6];

  @Input() showButton: boolean = false;
  @Input() userName: any;
  @Input() userEmail: any;
  @Input() userImage: any;
  @Input() userStatus: any;
  /** Letztes Lebenszeichen (uLastSeen) für die Presence-Erkennung. */
  @Input() userLastSeen: any;
  @Input() userId: any;
  @Input() activeUserId!: any;
  @Input() size: 'small' | 'big' = 'small';
  @Output() close = new EventEmitter<void>();
  @Output() openChat = new EventEmitter<{chatType: 'private'; chatId: string}>();
  @ViewChild('profilWrapper') profilWrapper?: ElementRef;

  constructor(private router: Router, private userService: UserService) {}

  ngOnInit(): void {
    this.isActive = NotificationService.isUserOnline({
      uStatus: this.userStatus,
      uLastSeen: this.userLastSeen,
    });
    this.originalUserImage = this.userImage;
  }

  closeProfil() {
    this.showAvatarChoice = false;
    this.close.emit();
  }


  async saveAvatarChange(): Promise<void> {
    try {
      await this.userService.updateUserImage(this.activeUserId, this.userImage);
      this.originalUserImage = this.userImage;
    } finally {
      this.showAvatarChoice = false;
    }    
  }


  changeUserName() {
    if (!this.activeUserId || !this.editedUserName.trim()) return;
    const userRef = doc(this.firestore, 'users', this.activeUserId);
    updateDoc(userRef, {
      uName: this.editedUserName.trim(),
    }).then(() => {
      this.userName = this.editedUserName;
      this.showEditProfil = false;
    });
  }


  onMainClick(event: MouseEvent) {
    const insideSection = this.profilWrapper?.nativeElement?.contains(
      event.target
    );
    if (!insideSection) {
      this.close.emit();
    }
  }


  onEditClick() {
    this.showEditProfil = true;
  }


  async deleteMember() {
    if (!this.activeUserId) return;
    const userRef = doc(this.firestore, 'users', this.activeUserId);
    await deleteDoc(userRef);
    this.router.navigate(['/access']);
  }


  selectAvatar(item: number): void {    
    this.userImage = `assets/img/avatar-${item}.png`;    
    this.showAvatarChoice = false;
  }


  bigUserImg(): void {
    this.showAvatarChoice = !this.showAvatarChoice;
  }

  
  trackById(index: number, id: number) {
    return id;
  }


  onStartChat() {
    this.openChat.emit({ chatType: 'private', chatId: this.userId! });
    this.close.emit();
  }
}
