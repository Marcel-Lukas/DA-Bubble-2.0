import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';

/** Available visual variants for the shared button. */
type ButtonColor = 'blue' | 'white' | 'gray' | 'transparent' | 'sky-grey';

@Component({
  selector: 'app-button',
  imports: [],
  template: `
    <button
      class="font-nuninto"
      [class]="getButtonClasses()"
      [type]="type"
      [disabled]="disabled"
      (click)="handleClick()"
    >
      <ng-content></ng-content>
    </button>
  `,
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent {
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled = false;
  @Input() color: ButtonColor = 'blue';

  @Output() clicked = new EventEmitter<void>();

  /** The gray variant is rendered full width via a host class. */
  @HostBinding('class.full-width-host') 
  get isFullWidth(): boolean {
    return this.color === 'gray';
  }

  getButtonClasses(): string {
    const baseClass = `btn btn-${this.color}`;
    return baseClass;
  }

  handleClick(): void {
    this.clicked.emit();
  }
}
