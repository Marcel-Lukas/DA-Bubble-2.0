
import { Component, Input, HostListener, OnInit } from '@angular/core';

/**
 * Conditionally renders its projected content based on the viewport width.
 * The breakpoint to compare against is chosen via the `mode` input, allowing
 * mobile/tablet/desktop-specific markup without manual resize handling.
 */
@Component({
  selector: 'app-device-visible',
  template: `@if (shouldShow) {
  <ng-content></ng-content
    >
  }`,
  imports: [],
  standalone: true,
})
export class DeviceVisibleComponent implements OnInit {
  @Input() mode:
    | 'mobilBig'
    | 'tabletBig'
    | 'desktopBig' = 'desktopBig';
  shouldShow = false;

  ngOnInit(): void {
    this.checkWidth();
  }

  /** Re-evaluates visibility against the current window width on each resize. */
  @HostListener('window:resize')
  checkWidth() {
    const width = window.innerWidth;

    switch (this.mode) {
      case 'mobilBig':
        this.shouldShow = width < 600;
        break;
      case 'tabletBig':
        this.shouldShow =  width < 1000;
        break;
      case 'desktopBig':
        this.shouldShow = width > 1000;
        break;
    }
  }
}
