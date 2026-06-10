import {
  Component,
  Input,
  forwardRef,
  ElementRef,
  ViewChild,
} from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';

import { ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-custom-input',
  imports: [ReactiveFormsModule],
  template: `
    <label>
      <ng-content select="[icon]"></ng-content>
      <input
        #inputElement
        [type]="type"
        [name]="name"
        [placeholder]="placeholder"
        [autocomplete]="autocomplete"
        [value]="value"
        (input)="onInputChange($event)"
        (blur)="onBlur()"
      />
    </label>
  `,
  styleUrls: ['./custom-input.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomInputComponent),
      multi: true,
    },
  ],
})
/**
 * Styled text input that integrates with Angular forms via
 * ControlValueAccessor, so it can be used with formControlName/ngModel.
 */
export class CustomInputComponent implements ControlValueAccessor {
  @Input() type: string = 'text';
  @Input() name: string = '';
  @Input() placeholder: string = '';
  @Input() autocomplete: string = 'on';

  @ViewChild('inputElement') inputElement!: ElementRef;

  value: string = '';
  onChange: any = () => {};
  onTouch: any = () => {};
  disabled: boolean = false;

  onInputChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.value = value;
    this.onChange(value);
  }

  onBlur() {
    this.onTouch();
  }

  writeValue(value: string): void {
    this.value = value || '';
    if (this.inputElement) {
      this.inputElement.nativeElement.value = this.value;
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouch = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (this.inputElement) {
      this.inputElement.nativeElement.disabled = isDisabled;
    }
  }
}
