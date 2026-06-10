import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, SimpleChanges, ViewChild, ViewChildren, ElementRef, QueryList, OnChanges, OnInit, ViewEncapsulation } from '@angular/core';
import { User } from '../../../shared/interfaces/user.interface';
import { ChannelService } from '../../../shared/services/channel.service';
import { UserService } from '../../../shared/services/user.service';
import { FormsModule } from '@angular/forms';
import { OnlinePipe } from '../../../shared/pipes/online.pipe';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-add-new-members',
  standalone: true,
  imports: [CommonModule, FormsModule, OnlinePipe, ImageFallbackDirective],
  templateUrl: './add-new-members.component.html',
  styleUrls: ['./add-new-members.component.scss'], 
  encapsulation: ViewEncapsulation.None,
  host: {
    '(click)': '$event.stopPropagation()'
  }
})

/**
 * Reusable member picker used both when creating a channel and when adding
 * members to an existing one. Provides search, selection pills (with a
 * width-based overflow count) and the two creation modes (all users vs. a
 * hand-picked selection).
 */
export class AddNewMembersComponent implements OnInit, OnChanges{
  private resizeObserver?: ResizeObserver;
  memberAddElement: boolean = false;
  memberInputId: string = '';
  memberInputAdd: string = '';
  memberInputImage: string = '';
  showMember: boolean = false;
  showOverlay = false;
  searchValue: string = '';
  charCount: number = 0;
  filteredMembers: User[] = [];
  availableMembers: User[] = [];
  selectedMemberIds: string[] = [];
  selectedMembers: User[] = [];
  displayCount = 1;
  selectedOption: string = '';

  @Input() channelMembers: User[] = [];
  @Input() activeUserId!: string | null;
  @Input() channelId: any = '';
  @Input() channelName: any = '';
  @Input() showInput: boolean = true;
  @Input() channelDescription: string = '';
  @Input() showXLine: boolean = false;
  @Output() close = new EventEmitter<void>();
  @ViewChild('memberInput', { static: false })memberInput?: ElementRef<HTMLElement>;
  @ViewChildren('containerDelete', { read: ElementRef })pills!: QueryList<ElementRef<HTMLDivElement>>;
  
  constructor(private channelService: ChannelService, private userService: UserService) {}


  ngOnInit() {
    this.rebuildAvailableList();
  }


  ngOnChanges(changes: SimpleChanges) {
    if (changes['channelMembers']) {
      this.rebuildAvailableList();
    }
  }


  /** Recomputes selectable users, excluding existing members and the self. */
  private async rebuildAvailableList() {
    const allUsers = await this.userService.allUsers();
    const excluded = new Set<string>();
    for (const u of this.channelMembers) {
      if (u.uId) excluded.add(u.uId);
    }
    if (this.activeUserId) {
      excluded.add(this.activeUserId);
    }
    this.availableMembers = allUsers.filter(u => u.uId && !excluded.has(u.uId));
    this.filteredMembers  = [...this.availableMembers];
  }


  ngAfterViewInit() {
    // Recompute how many selection pills fit whenever the input or pills resize.
    if (this.memberInput) {
      this.resizeObserver = new ResizeObserver(() => this.updateDisplayCount());
      this.resizeObserver.observe(this.memberInput.nativeElement);
      this.updateDisplayCount();
      this.pills.changes.subscribe(() => this.updateDisplayCount());
    }
  }


  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }


  onFocusOut(): void {
    this.showMember = false;
    this.showOverlay = false; 
  }


  onInputFocus(): void {
    this.filteredMembers = [...this.availableMembers];
    this.showMember = true;
    this.showOverlay = true;
  }


  /** Derives how many selection pills fit into the input (clamped to 1..2). */
  private updateDisplayCount() {
    if (!this.memberInput) return;
    const containerW = this.memberInput.nativeElement.clientWidth;
    const pillsArr = this.pills.toArray();
    if (!pillsArr.length) {
      this.displayCount = 1;
      return;
    }
    const pillEl = pillsArr[0].nativeElement;
    const style   = getComputedStyle(pillEl);
    const totalPillW =
      pillEl.offsetWidth +
      parseFloat(style.marginLeft) +
      parseFloat(style.marginRight);
    const rawCount = Math.floor(containerW / totalPillW);
    this.displayCount = Math.max(1, Math.min(rawCount, 2));
  }


  onKey(event: KeyboardEvent): void {
    const input = (event.target as HTMLInputElement)
    .value.trim().toLowerCase();
    this.searchValue = input;
    if (!input) {
      this.filteredMembers = [...this.availableMembers];
    } else {
      this.filteredMembers = this.availableMembers.filter(u =>
        u.uName.toLowerCase().startsWith(input)
      );
    }
  }


  toggleMember(member: User) {
    const id = member.uId!;
    const idx = this.selectedMemberIds.indexOf(id);
    if (idx > -1) {
      this.selectedMemberIds.splice(idx, 1);
      this.selectedMembers = this.selectedMembers.filter(m => m.uId !== id);
      this.showOverlay = true;
    } else {
      this.selectedMemberIds.push(id);
      this.selectedMembers.push(member);
    }
    if (this.searchValue) {
      this.memberAddElement = true;
      this.showMember       = false;
    } 
    if (this.selectedMembers.length) {
      this.memberAddElement = true;
      this.showMember       = true;
    }
    else{
      this.memberAddElement = false;
      this.showMember       = false;
    }
  }
  

  isSelected(member: User): boolean {
    return this.selectedMembers.some(m => m.uId === member.uId);
  }


  trackById(_: number, u: User) { return u.uId; }


  emitClose() {
    this.close.emit();
  }


  inputNameClose(): void {
    this.memberAddElement = false;
    this.memberInputAdd = '';
    this.memberInputImage = '';
    this.memberInputId = '';
  }

  async addNewChannelMembers() {
    if (!this.channelId || this.selectedMemberIds.length === 0) return;
    await this.channelService.addUsersToChannel(
      this.channelId,
      ...this.selectedMemberIds
    );
    this.selectedMemberIds = [];
    this.selectedMembers   = [];
    this.close.emit();
  }

  async createNewChannel(name: string, description: string) {
    if (!name || !this.activeUserId) return;    
    let ids: string[];
    if (this.selectedOption === 'option1') {
      const allUsers = await this.userService.allUsers();
      // "Add all members" excludes guests (empty email) – only real,
      // registered users are added to the channel.
      ids = allUsers
        .filter((u) => u.uEmail !== '')
        .map((u) => u.uId)
        .filter((id): id is string => typeof id === 'string');
    } else {
      ids = [...this.selectedMemberIds];
    }

    if (!ids.includes(this.activeUserId)) {
      ids.unshift(this.activeUserId);
    }
    await this.userService.createChannelWithUsers(
      name,
      description,
      this.activeUserId,
      ids
    );
    this.emitClose();
  }
}
