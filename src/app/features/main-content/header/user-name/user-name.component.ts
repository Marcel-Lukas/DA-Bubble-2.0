import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  Input,
  inject,
  EventEmitter,
  Output,
} from '@angular/core';
import { ProfilComponent } from '../../../general-components/profil/profil.component';
import { ActivatedRoute, Router } from '@angular/router';
import { DeviceVisibleComponent } from '../../../../shared/services/responsive';
import { ImageFallbackDirective } from '../../../../shared/directives/image-fallback.directive';
import { AuthentificationService } from '../../../../shared/services/authentification.service';
import { UserService } from '../../../../shared/services/user.service';
import { ChannelService } from '../../../../shared/services/channel.service';
import { MessageService } from '../../../../shared/services/message.service';

@Component({
  selector: 'app-user-name',
  standalone: true,
  imports: [CommonModule, ProfilComponent, DeviceVisibleComponent, ImageFallbackDirective],
  templateUrl: './user-name.component.html',
  styleUrl: './user-name.component.scss',
})
/**
 * Header widget showing the current user's avatar/name and a flyout with the
 * profile and logout actions. Closes on outside clicks (with a slide-out
 * animation on small screens).
 */
export class UserNameComponent {
  private authService = inject(AuthentificationService);
  private channelService = inject(ChannelService);
  private messageService = inject(MessageService);
  @Input() activeUserId!: string | null;
  isLogOutVisible: boolean = false;
  showProfil: boolean = false;
  userStatus: boolean | string = false;
  /** Last sign of life (uLastSeen) used for presence detection. */
  userLastSeen: unknown = null;
  userName: string = '';
  userEmail: string = '';
  userImage: string = '';
  userId: string | undefined = '';
  animateOut = false;
  windowSize = window.innerWidth;
  @ViewChild('tabletToggleBtn') tabletToggleBtn?: ElementRef;
  @ViewChild('arrowToggleBtn') arrowToggleBtn?: ElementRef;
  @ViewChild('logOutBox') logOutBox?: ElementRef;
  @ViewChild('profilWrapper') profilWrapper?: ElementRef;

  @Output() openChat = new EventEmitter<{
    chatType: 'private';
    chatId: string;
  }>();

  constructor(
    private route: ActivatedRoute,
    private userService: UserService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const userId = this.route.snapshot.paramMap.get('activeUserId');
    if (!userId) return;
    this.userService.getUserById(userId).subscribe((user) => {
      if (user) {
        this.userName = user.uName;
        this.userEmail = user.uEmail;
        this.userImage = user.uUserImage;
        this.userStatus = user.uStatus;
        this.userLastSeen = user.uLastSeen;
        this.userId = user.uId;
      }
    });
  }

  toggleLogOut() {
    if (this.isLogOutVisible) {
      if (this.windowSize <= 1000) {
        this.animateOut = true;

        setTimeout(() => {
          this.isLogOutVisible = false;
          this.animateOut = false;
        }, 800);
      } else {
        this.isLogOutVisible = false;
        this.animateOut = false;
      }
    } else {
      this.isLogOutVisible = true;
    }
  }

  toggleImage() {
    this.toggleLogOut();
  }

  /** Closes the logout/profile flyout when clicking outside its triggers. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const clickedInsideLogOut = this.logOutBox?.nativeElement?.contains(
      event.target
    );
    const clickedToggleTablet = this.tabletToggleBtn?.nativeElement?.contains(
      event.target
    );
    const clickedArrow = this.arrowToggleBtn?.nativeElement?.contains(
      event.target
    );
    const clickedInsideProfil = this.profilWrapper?.nativeElement?.contains(
      event.target
    );
    const clickedOutside =
      !clickedInsideLogOut &&
      !clickedToggleTablet &&
      !clickedArrow &&
      !clickedInsideProfil;
    if (this.isLogOutVisible && clickedOutside) {
      if (this.windowSize <= 1000) {
        this.animateOut = true;
        setTimeout(() => {
          this.isLogOutVisible = false;
          this.animateOut = false;
        }, 800);
      } else {
        this.isLogOutVisible = false;
      }
    }
  }


  openProfil() { 
    this.showProfil = true;
  }

  /**
   * Logs the user out. Guests (identified by an empty email – their name can be
   * Gast, Gast2, …) additionally have their created channels and sent messages
   * removed so they leave no leftover data behind.
   */
  async logOut() {
    if (this.userEmail === '') {
      await this.channelService.deleteChannelsByCreator(this.activeUserId!);
      await this.messageService.deleteMessagesBySender(this.activeUserId!);
    } 
    await this.authService.logout();
    await this.router.navigate(['/access']);
  }
}
