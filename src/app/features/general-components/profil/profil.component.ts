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

/**
 * User profile popup. In view mode it shows name, email and online status and
 * can start a DM; in edit mode (own profile) it allows changing the name and
 * choosing/randomizing the avatar before saving.
 */
export class ProfilComponent {
  private originalUserImage!: string;
  
  /** Prefix that is kept in front of a guest's chosen display name. */
  static readonly GUEST_PREFIX = 'Gast-';

  firestore = inject(Firestore);
  isActive: boolean = true;
  showEditProfil: boolean = false;
  showAvatarChoice = false;
  editedUserName: string = '';
  items = [1, 2, 3, 4, 5, 6];
  /** True if the viewer is a guest */
  viewerIsGuest: boolean = false;

  @Input() showButton: boolean = false;
  @Input() userName: any;
  @Input() userEmail: any;
  @Input() userImage: any;
  @Input() userStatus: any;
  /** Last sign of life (uLastSeen) used for presence detection. */
  @Input() userLastSeen: any;
  @Input() userId: any;
  @Input() activeUserId!: any;
  @Input() size: 'small' | 'big' = 'small';
  @Output() close = new EventEmitter<void>();
  @Output() openChat = new EventEmitter<{chatType: 'private'; chatId: string}>();
  @ViewChild('profilWrapper') profilWrapper?: ElementRef;

  constructor(private router: Router, private userService: UserService) {}

  ngOnInit(): void {
    // Derive online state from presence; remember the image to allow reverting.
    this.isActive = NotificationService.isUserOnline({
      uStatus: this.userStatus,
      uLastSeen: this.userLastSeen,
    });
    this.originalUserImage = this.userImage;
    this.resolveViewerIsGuest();
  }


  /**
   * Determines whether the viewer (the currently logged-in user identified by
   * activeUserId) is a guest. Guests are recognized by an empty email and must
   * not be able to see other users' email addresses.
   */
  private async resolveViewerIsGuest(): Promise<void> {
    if (!this.activeUserId) return;
    try {
      const viewer = await this.userService.getUser(this.activeUserId);
      this.viewerIsGuest = (viewer.uEmail ?? '') === '';
    } catch {
      this.viewerIsGuest = false;
    }
  }


  /** Email is only visible when the viewer is a registered user (not a guest). */
  get canViewEmail(): boolean {
    return !this.viewerIsGuest;
  }

  /** True when the profile being edited is the viewer's own guest profile. */
  get isOwnGuestProfile(): boolean {
    return this.viewerIsGuest && this.activeUserId === this.userId;
  }

  /** True when the name edit field should be shown (registered user or guest, own profile). */
  get canEditName(): boolean {
    return this.userEmail !== '' || this.isOwnGuestProfile;
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
    const newName = this.buildNameToStore(this.editedUserName.trim());
    const userRef = doc(this.firestore, 'users', this.activeUserId);
    updateDoc(userRef, {
      uName: newName,
    }).then(() => {
      this.userName = newName;
      this.showEditProfil = false;
    });
  }


  /**
   * Builds the name to persist. For guests editing their own profile, the
   * fixed "#Gast-" prefix is prepended (e.g. "#Gast-Max Mustermann") so it stays
   * visible to everyone. Registered users keep their plain name.
   */
  private buildNameToStore(name: string): string {
    if (this.isOwnGuestProfile) {
      return `${ProfilComponent.GUEST_PREFIX}${name}`;
    }
    return name;
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
    // For guests, prefill the input with the editable part only (without prefix).
    if (this.isOwnGuestProfile && typeof this.userName === 'string') {
      this.editedUserName = this.userName.startsWith(ProfilComponent.GUEST_PREFIX)
        ? this.userName.slice(ProfilComponent.GUEST_PREFIX.length)
        : '';
    }
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


  /**
    * Assigns a new random profile picture via the external 
    * API pravatar.cc with one click. pravatar.cc serves 
    * images 1..70 (?img=1 .. ?img=70), so a random number 
    * from that range is used.
    */
  setRandomAvatar(): void {
    const img = Math.floor(Math.random() * 70) + 1;
    this.userImage = `https://i.pravatar.cc/300?img=${img}`;
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
