import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { ButtonComponent } from '../../general-components/button/button.component';
import { ComponentSwitcherService } from '../../../shared/services/component-switcher.service';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { AuthentificationService } from '../../../shared/services/authentification.service';
import { CustomInputComponent } from '../../general-components/custom-input/custom-input.component';
import { Subscription } from 'rxjs';

/**
 * Requires the password to contain at least one upper- and lowercase letter,
 * a digit and a special character. Empty values pass (handled by `required`).
 */
function strongPasswordValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string;
    if (!value) {
      return null;
    }
    const hasUpper   = /[A-Z]/.test(value);
    const hasLower   = /[a-z]/.test(value);
    const hasNumber  = /\d/.test(value);
    const hasSpecial = /[!@#\$%\^&\*\(\)_\+\-\=\[\]\{\};:'"\\|,.<>\/\?]/.test(value);

    const valid = hasUpper && hasLower && hasNumber && hasSpecial;
    return valid ? null : { strongPassword: true };
  };
}

@Component({
  selector: 'app-create-account',
  imports: [ButtonComponent, ReactiveFormsModule, CustomInputComponent],
  templateUrl: './create-account.component.html',
  styleUrls: ['./create-account.component.scss', './create-account-checkbox.component.scss'],
})
export class CreateAccountComponent implements OnInit, OnDestroy {
  registerForm!: FormGroup;
  confError: string = '';
  private sub?: Subscription;

  constructor(
    public componentSwitcher: ComponentSwitcherService,
    private authService: AuthentificationService
  ) {}

  ngOnInit(): void {
    this.registerForm = new FormGroup({
      regName: new FormControl('', [Validators.required, Validators.minLength(3)]),
      regEmail: new FormControl('', [Validators.required, Validators.email]),
      regPassword: new FormControl('', [Validators.required, Validators.minLength(8), strongPasswordValidator()]),
      acceptPrivacy: new FormControl(false, Validators.requiredTrue),
    });
    this.sub = this.registerForm.valueChanges.subscribe(() => {
      if (this.confError) this.confError = '';
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  onSubmit(): void {
    if (!this.registerForm.valid) return;

    const { regEmail, regPassword, regName } = this.registerForm.value;
    this.registerUser(regEmail, regPassword, regName);
  }

  /**
   * Validates the email and stores the registration data, then advances to the
   * avatar selection step (the account is only created once an avatar is set).
   */
  private registerUser(email: string, password: string, name: string): void {
    this.authService.prepareRegistration(email, password, name)
    .then(() => this.changeComponent('avatar'))
    .catch(error => this.handleRegisterError(error));
  }
  
  private handleRegisterError(error: any): void {
    console.error('Email is taken:', error);
    this.confError = 'Diese E-Mail ist bereits vorhanden! Bitte geben Sie eine andere E-Mail-Adresse ein.';
  }

  changeComponent(componentName: string): void {
    this.componentSwitcher.setComponent(componentName);
  }
}
