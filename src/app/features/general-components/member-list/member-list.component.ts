import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, Input } from '@angular/core';
import { User } from '../../../shared/interfaces/user.interface';
import { OnlinePipe } from '../../../shared/pipes/online.pipe';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-member-list',
  standalone: true,
  imports: [CommonModule, OnlinePipe, ImageFallbackDirective],
  templateUrl: './member-list.component.html',
  styleUrl: './member-list.component.scss'
})

/**
 * Presentational list of a channel's members with online status. Emits events
 * to add a new member or to open a member's profile.
 */
export class MemberListComponent {
  @Input() channelMembers: User[] = [];
  @Input() activeUserId!: string | null;

  @Output() addMember = new EventEmitter<void>();
  @Output() showProfil = new EventEmitter<User>();  
}
