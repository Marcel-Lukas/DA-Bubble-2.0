import { Component, EventEmitter, inject, Input, Output } from '@angular/core';

import { MessageService } from '../../../shared/services/message.service';
import { ChannelService } from '../../../shared/services/channel.service';

type DeleteTarget = 'message' | 'channel' | 'user';

@Component({
  selector: 'app-permanent-delete',
  imports: [],
  templateUrl: './permanent-delete.component.html',
  styleUrl: './permanent-delete.component.scss',
})
export class PermanentDeleteComponent {
  private messageService = inject(MessageService);
  private channelService = inject(ChannelService);

  @Input({ required: true }) target!: DeleteTarget;
  @Input({ required: true }) id!: any;
  /** Id des aktuell angemeldeten Nutzers – wird zur Owner-Prüfung beim Löschen eines Channels benötigt. */
  @Input() requestingUserId: string | null = null;

  @Output() close = new EventEmitter<void>();

  onNo(): void {
    this.close.emit();
  }

  onYes(): void {
    switch (this.target) {
      case 'message':
        this.messageService
          .deleteMessage(this.id)
          .then(() => this.close.emit())
          .catch((err) =>
            console.error('Fehler beim Löschen der Nachricht', err)
          );
        break;

      case 'channel':
        this.channelService
          .deleteChannel(this.id, this.requestingUserId)
          .then(() => this.close.emit())
          .catch((err) => {
            console.error('Fehler beim Löschen des Channels', err);
            this.close.emit();
          });
        break;
      default:
        console.warn('Unbekannter Lösch‑Typ:', this.target);
        this.close.emit();
    }
  }
  get heading(): string {
    switch (this.target) {
      case 'message':
        return 'Nachricht permanent löschen?';
      case 'channel':
        return 'Channel permanent löschen?';
      case 'user':
        return 'Account permanent löschen?';
      default:
        return 'Permanent löschen?';
    }
  }
}
