import { Component, Input } from '@angular/core';
import { trigger, state, style, animate, transition } from '@angular/animations';

@Component({
  selector: 'app-success-indicator',
  imports: [],
  template: `
    <div [@slideInFromRight]="visible ? 'visible' : 'hidden'">
      <ng-content></ng-content>
    </div>
  `,
  styleUrl: './success-indicator.component.scss',
  animations: [
    trigger('slideInFromRight', [
      state('hidden', style({
        transform: 'translateX(100%)',
        opacity: 0
      })),
      state('visible', style({
        transform: 'translateX(0)',
        opacity: 1
      })),
      transition('hidden => visible', [
        animate('500ms ease-out')
      ]),
      transition('visible => hidden', [
        animate('500ms ease-in')
      ])
    ])
  ]
})
/** Small toast-like indicator that slides in from the right when `visible`. */
export class SuccessIndicatorComponent {
  @Input() visible: boolean = false;
}
