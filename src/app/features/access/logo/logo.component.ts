
import { Component, OnInit } from '@angular/core';
import {
  trigger,
  state,
  style,
  transition,
  animate,
  keyframes,
} from '@angular/animations';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { take } from 'rxjs';

@Component({
  selector: 'app-logo',
  imports: [],
  templateUrl: './logo.component.html',
  styleUrl: './logo.component.scss',
  animations: [
    trigger('logoPosition', [
      state('center', style({
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%) scale(3.5)'
      })),
      state('topLeft', style({
        top: '75px',
        left: '75px',
        transform: 'translate(0, 0) scale(1)'
      })),
      state('centerMobile', style({
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%) scale(1.5)'
      })),
      state('topLeftMobile', style({ 
        top: '30px',
        left: '50%',
        transform: 'translate(-50%, 0) scale(1)'
      })),
      transition('center => topLeft', [
        animate('1500ms cubic-bezier(0.4, 0.0, 0.2, 1)')
      ]),
      transition('centerMobile => topLeftMobile', [
        animate('1500ms cubic-bezier(0.4,0.0,0.2,1)')
      ])
    ]),

    trigger('textAnimation', [
      state('hidden', style({
        width: '0px',
        opacity: 0,
        overflow: 'hidden'
      })),
      state('visible', style({
        width: '*',
        opacity: 1,
        overflow: 'visible'
      })),
      transition('hidden => visible', [
        animate('800ms cubic-bezier(0.0, 0.0, 0.2, 1)', keyframes([
          style({ width: '0px', opacity: 0, marginLeft: '0px', offset: 0 }),
          style({ width: '0px', opacity: 0, marginLeft: '5px', offset: 0.2 }),
          style({ width: '*', opacity: 1, marginLeft: '10px', offset: 1.0 })
        ]))
      ])
    ]),

    trigger('backgroundFade', [
      state('visible', style({
        backgroundColor: '#797ef3',
        color: 'white'
      })),
      state('hidden', style({
        backgroundColor: 'transparent',
        color: 'black'
      })),
      transition('visible => hidden', [
        animate('1500ms ease-in-out')
      ])
    ])
  ],
})
/**
 * Animated splash logo shown on first visit. Orchestrates three timed states
 * (text reveal -> logo moves to the corner -> background fades) and picks the
 * mobile or desktop animation variant based on the viewport width.
 */
export class LogoComponent implements OnInit {
  logoPosition: 'center' | 'topLeft' | 'centerMobile' | 'topLeftMobile' = 'center';
  textState = 'hidden';
  backgroundState = 'visible';

  private isMobile = false;

  constructor(private bp: BreakpointObserver) {}

  ngOnInit(): void {
    // Remember that the intro animation has played (see AccessComponent).
    localStorage.setItem('showAnimation', 'true');
    
    // One-shot breakpoint check decides which animation variant to use.
    this.bp.observe(['(max-width: 700px)']).pipe(take(1)).subscribe(result => {
      this.isMobile = result.matches;
      this.logoPosition = this.isMobile ? 'centerMobile' : 'center';
    });

    // Staggered timeline: reveal text, then move logo, then fade background.
    setTimeout(() => this.textState = 'visible', 1000);

    setTimeout(() => {
      const endState = this.isMobile ? 'topLeftMobile' : 'topLeft';
      this.logoPosition = endState;
    }, 1800);

    setTimeout(() => this.backgroundState = 'hidden', 2400);
  }
}
