import { Component, inject, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ComponentSwitcherService } from '../../../shared/services/component-switcher.service';
import { ButtonComponent } from '../../general-components/button/button.component';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthentificationService } from '../../../shared/services/authentification.service';
import { CustomInputComponent } from '../../general-components/custom-input/custom-input.component';
import { SuccessIndicatorComponent } from '../../general-components/success-indicator/success-indicator.component';
import { VisibleButtonService } from '../../../shared/services/visible-button.service';

@Component({
  selector: 'app-confirm-password',
  imports: [
    ButtonComponent,
    ReactiveFormsModule,
    CustomInputComponent,
    SuccessIndicatorComponent,
  ],
  templateUrl: './confirm-password.component.html',
  styleUrl: './confirm-password.component.scss',
})
export class ConfirmPasswordComponent implements OnInit {
  private visibleBtn = inject(VisibleButtonService);

  newPassword!: FormGroup;
  oobCode: string | null = null;
  isConfirmationVisible: boolean = false;

  /** Group-level validator ensuring the password and its confirmation match. */
  static passwordMatchValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
    const newPassword = group.get('newPassword')?.value;
    const conPassword = group.get('conPassword')?.value;
    return newPassword === conPassword ? null : { passwordMismatch: true };
  };

  readonly isButtonVisible = this.visibleBtn.visibleButton;

  constructor(
    public componentSwitcher: ComponentSwitcherService,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthentificationService
  ) {
    this.visibleBtn.show();
  }

  ngOnInit(): void {
    // oobCode is the one-time reset code Firebase appends to the email link.
    this.oobCode = this.route.snapshot.queryParamMap.get('oobCode');
    this.newPassword = new FormGroup({
      newPassword: new FormControl('', [Validators.required, Validators.minLength(8),]),
      conPassword: new FormControl('', [Validators.required, Validators.minLength(8),]),
    },
    { validators: ConfirmPasswordComponent.passwordMatchValidator }
    );
  }

  isPasswordMismatch(): boolean {
    return (!!this.newPassword.errors && this.newPassword.errors['passwordMismatch']);
  }

  onSubmit(): void {
    if (!this.newPassword.valid) return;

    if (!this.oobCode) {
      console.error('No valid oobCode found.');
      return;
    }

    this.visibleBtn.hide();
    const { newPassword, conPassword } = this.newPassword.value;
    this.processPasswordReset(newPassword, conPassword);
  }

  private processPasswordReset(newPwd: string, confirmPwd: string): void {
    if (newPwd !== confirmPwd) {
      return;
    }
  
    this.authService.confirmResetPassword(this.oobCode!, newPwd)
    .then(() => this.handleResetSuccess())
    .catch(error => this.handleResetError(error));
  }
  
  private handleResetSuccess(): void {
    this.toggleConfirmation(true);
    setTimeout(() => this.toggleConfirmation(false), 2000);
  
    setTimeout(() => {
      this.router.navigate(['/access']);
      this.changeComponent('login');
    }, 3000);
  }
  
  private toggleConfirmation(visible: boolean): void {
    this.isConfirmationVisible = visible;
  }
  
  private handleResetError(error: any): void {
    this.visibleBtn.show();
    console.error('Error when resetting the password:', error);
  }

  goBackToEmailConfirm(): void {
    this.router.navigate(['/access']);
    this.changeComponent('conMail');
  }

  changeComponent(componentName: string): void {
    this.componentSwitcher.setComponent(componentName);
  }
}
