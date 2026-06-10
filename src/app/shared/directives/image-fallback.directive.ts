import { Directive, HostListener, Input } from '@angular/core';

/**
 * Setzt bei einem Lade-/Netzwerkfehler eines Bildes automatisch ein
 * Fallback-Bild. Wird vor allem für Gast-Avatare genutzt, deren Bild über die
 * externe API (https://i.pravatar.cc) geladen wird – ist diese mal nicht
 * erreichbar, wird transparent auf das lokale Standardbild zurückgefallen.
 *
 * Verwendung:
 *   <img [src]="user.uUserImage" appImageFallback />
 *   <img [src]="user.uUserImage" appImageFallback="assets/img/anderes.png" />
 */
@Directive({
  selector: 'img[appImageFallback]',
  standalone: true,
})
export class ImageFallbackDirective {
  /** Pfad zum Fallback-Bild (Standard: lokales profile.png). */
  @Input() appImageFallback: string = 'assets/img/profile.png';

  /**
   * Wird ausgelöst, wenn das Bild nicht geladen werden kann. Tauscht die
   * Quelle einmalig gegen das Fallback-Bild aus. Eine Schleife (Fallback
   * schlägt ebenfalls fehl) wird vermieden, indem danach kein weiterer
   * Tausch erfolgt.
   */
  @HostListener('error', ['$event'])
  onError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (!img) return;
    const fallback = this.appImageFallback || 'assets/img/profile.png';
    // Endlosschleife verhindern: nur tauschen, wenn nicht schon das Fallback.
    if (img.src.endsWith(fallback)) return;
    img.src = fallback;
  }
}
