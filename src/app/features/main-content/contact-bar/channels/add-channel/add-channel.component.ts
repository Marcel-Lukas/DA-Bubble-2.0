import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Output, Input, ViewChild } from '@angular/core';
import { AddNewMembersComponent } from '../../../../general-components/add-new-members/add-new-members.component';
import { debounceTime, distinctUntilChanged, Subject, switchMap, tap } from 'rxjs';
import { ChannelService } from '../../../../../shared/services/channel.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-add-channel',
  standalone: true,
  imports: [CommonModule, AddNewMembersComponent, FormsModule],
  templateUrl: './add-channel.component.html',
  styleUrl: './add-channel.component.scss',
})

/**
 * Dialog for creating a new channel. Step 1 collects name + description (with
 * a debounced uniqueness check), step 2 adds members. Closes with a slide-out
 * animation when clicking outside.
 */
export class AddChannelComponent{
  @Output() close = new EventEmitter<void>();
  @Input() activeUserId!: string | null;
  showAddMember: boolean = true;
  channelId: any = '';
  channelName: string = '';
  channelDescription: string = '';
  animateOut = false;
  nameExists = false;  
  isVisible: boolean = true; 
  private nameCheck$ = new Subject<string>();
  @ViewChild('addChannel') channelWrapper?: ElementRef;
  @ViewChild('addChannelAll') memberAddWrapper?: ElementRef;
  
  constructor( private elRef: ElementRef, private channelService: ChannelService) {}

  ngOnInit(): void {
    // Debounced live check whether the typed channel name already exists.
    this.nameCheck$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(name => this.channelService.checkChannelNameExists(name)),
        tap(exists => (this.nameExists = exists))
      )
      .subscribe();
  }

  
  /** Closes the dialog (with animation) when clicking outside its panel. */
  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    const clickedInside = this.elRef.nativeElement
      .querySelector('section')
      ?.contains(event.target);
    if (!clickedInside) {
      this.triggerSlideOut();
    }
  }

  
  triggerSlideOut() {
    this.animateOut = true;
    setTimeout(() => {
      this.isVisible = false;
      this.animateOut = false;
      this.close.emit(); 
    }, 800);
  }

  
  closeWindow() {
    this.close.emit();
  }


  checkNameUnique(name: string) {
    if (!name.trim()) {
      this.nameExists = false;
      return;
    }
    this.nameCheck$.next(name.trim());
  }


  /** Stores the entered details and advances to the add-members step. */
  addNewChannel(name: string, description: string){
    if (!name || !this.activeUserId) return;
    this.channelName = name;
    this.channelDescription = description;
    this.showAddMember = false;    
  }
} 
