
import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { User } from '../../../../shared/interfaces/user.interface';
import { ProfilComponent } from '../../../general-components/profil/profil.component';
import { AddNewMembersComponent } from '../../../general-components/add-new-members/add-new-members.component';
import { MemberListComponent } from '../../../general-components/member-list/member-list.component';

@Component({
  selector: 'app-channel-members',
  imports: [
    ProfilComponent,
    AddNewMembersComponent,
    MemberListComponent
],
  templateUrl: './channel-members.component.html',
  styleUrl: './channel-members.component.scss',
})

/**
 * Popup listing a channel's members. Toggles between the member list and the
 * "add members" view, opens individual member profiles and closes on an
 * outside click.
 */
export class ChannelMembersComponent{
  @Input() channelMembers: User[] = [];
  @Input() activeUserId: string | null = null;
  @Input() channelId: any;
  @Input() channelName: any = '';
  @Input() activChannelMemberProfil: User | null = null;
  @Input() newChannelMembers: boolean = false;
  @Input() isChannelMemberProfilOpen: boolean = false;
  @Output() newChannelMembersChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();
  @Output() openChat = new EventEmitter<{chatType: 'private'; chatId: string}>();
  @ViewChild('channelWrapper') channelWrapper?: ElementRef;
  @ViewChild('memberAddWrapper') memberAddWrapper?: ElementRef;

  
  closeChannelMembers() { 
    this.close.emit();
  }


  /** Closes the active panel when the overlay (outside the panel) is clicked. */
  onOverlayClick(event: MouseEvent) {
    const target = event.target as Node;
    if (this.newChannelMembers) {
      if (this.memberAddWrapper && !this.memberAddWrapper.nativeElement.contains(target)) {
        this.closeAddMembers();
      }
    } else {
      if (this.channelWrapper && !this.channelWrapper.nativeElement.contains(target)) {
        this.closeChannelMembers();
      }
    }
  }


  toggleMemberProfil(member?: User) {   
    const isOpen = !this.isChannelMemberProfilOpen;
    this.isChannelMemberProfilOpen = isOpen;
    this.activChannelMemberProfil = member || null;
  }


  closeAddMembers() {
    this.newChannelMembers = false;
    this.newChannelMembersChange.emit(false);
  }

  
  addChannelMember() {
    this.newChannelMembers = true;
    this.newChannelMembersChange.emit(true);
  }
}
