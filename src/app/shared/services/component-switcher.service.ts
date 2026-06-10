import { Injectable, signal } from '@angular/core';
import { LoginComponent } from '../../features/access/login/login.component';
import { CreateAccountComponent } from '../../features/access/create-account/create-account.component';
import { ImprintComponent } from '../../features/access/imprint/imprint.component';
import { PrivacyComponent } from '../../features/access/privacy/privacy.component';
import { SelectAvatarComponent } from '../../features/access/select-avatar/select-avatar.component';
import { ConfirmEmailComponent } from '../../features/access/confirm-email/confirm-email.component';
import { ConfirmPasswordComponent } from '../../features/access/confirm-password/confirm-password.component';
import { GoToEmailComponent } from '../../features/access/go-to-email/go-to-email.component';

/**
 * Drives which view is rendered inside the access (auth) screen by exposing
 * the active component as a signal. The host template renders
 * `currentComponent()` dynamically, so switching screens (login, sign-up,
 * imprint, etc.) is just a signal update.
 */
@Injectable({
  providedIn: 'root'
})
export class ComponentSwitcherService {
  currentComponent = signal<any>(LoginComponent);

  constructor() {}

  /** Sets the active access view by key; falls back to the login screen. */
  setComponent(componentName: string): void {
    switch(componentName) {
      case 'login':
        this.currentComponent.set(LoginComponent);
        break;
      case 'signin':
        this.currentComponent.set(CreateAccountComponent);
        break;
      case 'imprit':
        this.currentComponent.set(ImprintComponent);
        break;
      case 'privacy':
        this.currentComponent.set(PrivacyComponent);
        break;
      case 'avatar':
        this.currentComponent.set(SelectAvatarComponent);
        break;
      case 'conMail':
        this.currentComponent.set(ConfirmEmailComponent);
        break;
      case 'conPassword':
        this.currentComponent.set(ConfirmPasswordComponent);
        break;
      case 'goToEmail':
        this.currentComponent.set(GoToEmailComponent);
        break;
      default:
        this.currentComponent.set(LoginComponent);
    }
  }
}
