import { Directive, ElementRef, Input, OnDestroy } from '@angular/core';

/**
 * Shows a local placeholder image immediately and only swaps in the real
 * (often slow, external) image once it has finished loading in the background.
 *
 * This avoids the visible delay / broken-image flicker that occurs when an
 * avatar is loaded from the external API (https://i.pravatar.cc), which can
 * take up to a few seconds to respond. The flow is:
 *   1. Render the local fallback (assets/img/profile.png) right away.
 *   2. Preload the real image off-DOM via `new Image()`.
 *   3. On success, swap the element's src to the real image.
 *   4. On error (API unreachable), keep the fallback.
 *
 * The `src` attribute is set on the directive instead of the element so the
 * directive can fully control what the browser actually requests/displays.
 *
 * Usage:
 *   <img [src]="user.uUserImage" appImageFallback />
 *   <img [src]="user.uUserImage" appImageFallback="assets/img/other.png" />
 */
@Directive({
  selector: 'img[appImageFallback]',
  standalone: true,
})
export class ImageFallbackDirective implements OnDestroy {
  /** Path to the fallback image (default: local profile.png). */
  @Input() appImageFallback: string = 'assets/img/profile.png';

  /** Off-DOM loader used to preload the real image without showing it yet. */
  private preloader: HTMLImageElement | null = null;

  /** The real image URL currently being requested (guards against races). */
  private pendingSrc: string | null = null;

  constructor(private el: ElementRef<HTMLImageElement>) {}

  /**
   * Intercepts the bound source. Immediately shows the fallback, then preloads
   * the real image in the background and swaps it in once available.
   */
  @Input()
  set src(value: string | null | undefined) {
    const fallback = this.appImageFallback || 'assets/img/profile.png';
    const real = value?.trim();

    // No real image (or it already is the fallback): just show the fallback.
    if (!real || real === fallback) {
      this.showFallback();
      return;
    }

    // Show the placeholder right away so the user never sees an empty/broken
    // image while the external API is still responding.
    this.showFallback();
    this.preload(real, fallback);
  }

  /** Sets the visible image element to the local fallback. */
  private showFallback(): void {
    const fallback = this.appImageFallback || 'assets/img/profile.png';
    if (this.el.nativeElement.src.endsWith(fallback)) return;
    this.el.nativeElement.src = fallback;
  }

  /**
   * Preloads the real image off-DOM. Once it has finished loading successfully,
   * the visible element is updated. If it fails, the fallback simply remains.
   */
  private preload(real: string, fallback: string): void {
    this.cancelPreload();
    this.pendingSrc = real;

    const loader = new Image();
    this.preloader = loader;

    loader.onload = () => {
      // Ignore stale loads if the binding changed meanwhile.
      if (this.pendingSrc !== real) return;
      this.el.nativeElement.src = real;
      this.cleanup(loader);
    };

    loader.onerror = () => {
      if (this.pendingSrc !== real) return;
      this.el.nativeElement.src = fallback;
      this.cleanup(loader);
    };

    loader.src = real;
  }

  /** Stops listening to the current preloader (e.g. when a new src arrives). */
  private cancelPreload(): void {
    if (!this.preloader) return;
    this.preloader.onload = null;
    this.preloader.onerror = null;
    this.preloader = null;
  }

  /** Clears handlers and pending state after a finished preload. */
  private cleanup(loader: HTMLImageElement): void {
    loader.onload = null;
    loader.onerror = null;
    if (this.preloader === loader) this.preloader = null;
    this.pendingSrc = null;
  }

  /** Ensures we don't leak the off-DOM loader when the element is destroyed. */
  ngOnDestroy(): void {
    this.cancelPreload();
    this.pendingSrc = null;
  }
}
