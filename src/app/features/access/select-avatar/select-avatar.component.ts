import { Component, inject } from '@angular/core';
import { ButtonComponent } from '../../general-components/button/button.component';
import { ComponentSwitcherService } from '../../../shared/services/component-switcher.service';
import { AuthentificationService } from '../../../shared/services/authentification.service';
import { SuccessIndicatorComponent } from '../../general-components/success-indicator/success-indicator.component';
import { VisibleButtonService } from '../../../shared/services/visible-button.service';

@Component({
  selector: 'app-select-avatar',
  imports: [ButtonComponent, SuccessIndicatorComponent],
  templateUrl: './select-avatar.component.html',
  styleUrl: './select-avatar.component.scss',
})
export class SelectAvatarComponent {
  private visibleBtn = inject(VisibleButtonService);

  avatars = [
    'avatar-1.png',
    'avatar-2.png',
    'avatar-3.png',
    'avatar-4.png',
    'avatar-5.png',
    'avatar-6.png',
  ];
  selectedAvatar: string | null = null;
  username: string | undefined | null = null;
  isConfirmationVisible: boolean = false;

  readonly isButtonVisible = this.visibleBtn.visibleButton;
  
  constructor(
    public componentSwitcher: ComponentSwitcherService,
    private authService: AuthentificationService
  ) {
    this.visibleBtn.show();
    this.username = this.authService.registrationData?.username;
  }

  /** Discards the pending registration data and returns to the sign-up form. */
  goBack(): void {
    this.authService.registrationData = null;
    this.changeComponent('signin');
  }

  selectAvatar(avatar: string): void {
    this.selectedAvatar = avatar;
  }

  onNext(): void {
    if (!this.selectedAvatar) {
      console.error('No avatar selected!');
      return;
    }
    this.visibleBtn.hide();
    this.completeAvatarSelection(this.selectedAvatar);
  }

  private completeAvatarSelection(avatar: string): void {
    this.authService.completeRegistration(avatar)
    .then(() => this.handleAvatarSuccess())
    .catch(error => this.handleAvatarError(error));
  }
  
  /** Shows the success indicator, then returns to the login view after 3s. */
  private handleAvatarSuccess(): void {
    this.toggleConfirmation(true);
    setTimeout(() => this.toggleConfirmation(false), 2000);
    setTimeout(() => this.changeComponent('login'), 3000);
  }
  
  private toggleConfirmation(visible: boolean): void {
    this.isConfirmationVisible = visible;
  }

  private handleAvatarError(error: any): void {
    this.visibleBtn.show();
    console.error('Error when adding the profile picture:', error);
  }

  changeComponent(componentName: string): void {
    this.componentSwitcher.setComponent(componentName);
  }
}
