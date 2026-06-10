
import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  Output,
  EventEmitter,
} from '@angular/core';
import { SearchInformationComponent } from '../../search-information/search-information.component';
import { DeviceVisibleComponent } from '../../../../shared/services/responsive';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [
    SearchInformationComponent,
    DeviceVisibleComponent,
    FormsModule
],
  templateUrl: './search-bar.component.html',
  styleUrl: './search-bar.component.scss',
})
export class SearchBarComponent {
  searchValue: string = '';
  searchText: string = '';
  charCount: number = 0;
  showInformation: boolean = false;
  @ViewChild('searchWrapper', { static: false }) searchWrapper?: ElementRef;

  @Output() openChat = new EventEmitter<{
    chatType: 'private' | 'channel' | 'new';
    chatId: string;
  }>();

  @Output() openThread = new EventEmitter<{
    chatType: 'channel' | 'private';
    chatId: string;
    threadId: string;
  }>();

  /** Closes the search results panel when clicking outside the search bar. */
  @HostListener('document:click', ['$event'])
  onGlobalClick(event: MouseEvent) {
    const clickedInside = this.searchWrapper?.nativeElement.contains(
      event.target
    );
    if (!clickedInside) {
      this.closeSearchInfo();
    }
  }

  /** Shows the results panel only once at least 3 characters were entered. */
  onKey(event: KeyboardEvent) {
    const input = (event.target as HTMLInputElement).value;
    this.searchValue = input;
    this.charCount = input.length;
    if (this.charCount >= 3) {
      this.showInformation = true;
    } else {
      this.showInformation = false;
    }
  }

  closeSearchInfo() {
    this.searchValue = '';
    this.showInformation = false;
  }

  
}
