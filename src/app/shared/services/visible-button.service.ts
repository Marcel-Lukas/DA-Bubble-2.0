import { Injectable, signal } from '@angular/core';

/** Shared signal controlling the visibility of a global UI button. */
@Injectable({
  providedIn: 'root'
})
export class VisibleButtonService {
  private _visibleButton = signal(true);
  readonly visibleButton = this._visibleButton.asReadonly();

  constructor() {}

  show() {
    this._visibleButton.set(true);
  }

  hide() {
    this._visibleButton.set(false);
  }
}
