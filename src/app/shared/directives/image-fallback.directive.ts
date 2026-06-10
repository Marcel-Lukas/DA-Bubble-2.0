import { Directive, HostListener, Input } from '@angular/core';

/**
 * Automatically swaps in a fallback image when an image fails to load. Used
 * mainly for guest avatars whose image is loaded from the external API
 * (https://i.pravatar.cc) – if it is unreachable, the local default image is
 * shown transparently instead.
 *
 * Usage:
 *   <img [src]="user.uUserImage" appImageFallback />
 *   <img [src]="user.uUserImage" appImageFallback="assets/img/other.png" />
 */
@Directive({
  selector: 'img[appImageFallback]',
  standalone: true,
})
export class ImageFallbackDirective {
  /** Path to the fallback image (default: local profile.png). */
  @Input() appImageFallback: string = 'assets/img/profile.png';

  /**
   * Fires when the image cannot be loaded. Swaps the source once for the
   * fallback image. A loop (fallback also failing) is avoided by not swapping
   * again afterwards.
   */
  @HostListener('error', ['$event'])
  onError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (!img) return;
    const fallback = this.appImageFallback || 'assets/img/profile.png';
    // Prevent an infinite loop: only swap if not already showing the fallback.
    if (img.src.endsWith(fallback)) return;
    img.src = fallback;
  }
}
