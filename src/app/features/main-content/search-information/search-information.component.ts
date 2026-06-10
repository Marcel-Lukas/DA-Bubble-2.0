
import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  inject,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { User } from '../../../shared/interfaces/user.interface';
import { ChannelService } from '../../../shared/services/channel.service';
import { MessageService } from '../../../shared/services/message.service';
import { UserService } from '../../../shared/services/user.service';
import { Message } from '../../../shared/interfaces/message.interface';
import { Channel } from '../../../shared/interfaces/channel.interface';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';

interface ChannelMessage {
  mText: string;
  channelName: string;
  channelId: string;
}

interface DirectMessage {
  mText: string;
  otherUserId: string;
  otherUserName: string;
}

interface ThreadHit {
  mText: string;
  threadId: string;
  chatId: string;
  chatType: 'channel' | 'private';
}

@Component({
  selector: 'app-search-information',
  standalone: true,
  imports: [ImageFallbackDirective],
  templateUrl: './search-information.component.html',
  styleUrl: './search-information.component.scss',
})
export class SearchInformationComponent implements OnInit {
  private _searchText = '';
  private route = inject(ActivatedRoute);

  @Input() set searchText(value: string) {
    this._searchText = value.trim().toLowerCase();
    this.handleSearch(this._searchText);
  }

  @Output() close = new EventEmitter<void>();
  @Output() openChat = new EventEmitter<{
    chatType: 'private' | 'channel' | 'new';
    chatId: string;
  }>();
  @Output() openThread = new EventEmitter<{
    chatType: 'channel' | 'private';
    chatId: string;
    threadId: string;
  }>();

  activeUserId: string | null = null;
  users: User[] = [];
  channelsWithNames: any[] = [];

  matchedMessages: ChannelMessage[] = [];
  directMessages: DirectMessage[] = [];
  threadMessages: ThreadHit[] = [];

  showContact = true;
  showChannels = true;
  showMatchedMessages = true;
  showDirectMessages = true;
  showThreadMessages = true;

  constructor(
    private userService: UserService,
    private messageService: MessageService,
    private channelService: ChannelService
  ) {}

  ngOnInit(): void {
    this.activeUserId = this.route.snapshot.paramMap.get('activeUserId');
  }

  private async handleSearch(searchText: string) {
    if (!searchText || searchText.length < 3) return;

    const { users, messages, channels } = await this.fetchData();

    this.users = this.filterUsers(users, searchText);
    this.channelsWithNames = this.filterChannels(channels, users, searchText);
    this.matchedMessages = this.findChannelMsgs(messages, channels, searchText);
    this.directMessages = this.findDirectMsgs(messages, users, searchText);
    this.threadMessages = await this.findThreadMsgs(messages, searchText);

    this.updateVisibilityFlags();
  }

  private async fetchData() {
    const [users, messages, channels] = await Promise.all([
      this.userService.getAllUsers(),
      this.messageService.getAllMessages(),
      this.channelService.getAllChannels(),
    ]);
    return { users, messages, channels };
  }

  private filterUsers(users: User[], q: string): User[] {
    return users.filter((u) => (u.uName || '').toLowerCase().includes(q));
  }

  private filterChannels(channels: Channel[], users: User[], q: string) {
    return channels
      .filter((ch) => (ch.cName || '').toLowerCase().includes(q))
      .map((ch) => ({
        ...ch,
        memberNames: users
          .filter((u) => u.uId && (ch.cUserIds || []).includes(u.uId!))
          .map((u) => u.uName),
      }));
  }

  private findChannelMsgs(msgs: Message[], channels: Channel[], q: string) {
    return msgs
      .filter(
        (m) =>
          typeof m.mChannelId === 'string' &&
          m.mChannelId.trim() &&
          m.mText.toLowerCase().includes(q)
      )
      .map((m) => {
        const ch = channels.find((c) => c.cId === m.mChannelId);
        return {
          mText: m.mText,
          channelName: ch?.cName || '',
          channelId: ch?.cId || '',
        };
      });
  }

  private findDirectMsgs(msgs: Message[], users: User[], q: string) {
    return msgs
      .filter(
        (m) =>
          m.mText.toLowerCase().includes(q) &&
          (m.mUserId === this.activeUserId ||
            m.mSenderId === this.activeUserId) &&
          typeof m.mUserId === 'string' &&
          m.mUserId.trim()
      )
      .map((m) => {
        const otherId =
          m.mUserId === this.activeUserId ? m.mSenderId! : m.mUserId!;
        const otherUser = users.find((u) => u.uId === otherId);
        return {
          mText: m.mText,
          otherUserId: otherId,
          otherUserName: otherUser?.uName || '',
        };
      });
  }

  private async findThreadMsgs(msgs: Message[], q: string) {
    const hits: ThreadHit[] = [];
    for (const m of msgs) {
      if (!this.isThreadHit(m, q)) continue;
      const parent = await this.resolveParent(msgs, m.mThreadId!);
      const chatType = parent?.mChannelId ? 'channel' : 'private';
      const chatId =
        parent?.mChannelId ??
        (parent
          ? parent.mUserId === this.activeUserId
            ? parent.mSenderId!
            : parent.mUserId!
          : '');
      hits.push({ mText: m.mText, threadId: m.mThreadId!, chatId, chatType });
    }
    return hits;
  }

  private isThreadHit(m: Message, q: string) {
    return (
      typeof m.mThreadId === 'string' &&
      m.mThreadId.trim() &&
      m.mText.toLowerCase().includes(q)
    );
  }

  private async resolveParent(allMsgs: Message[], id: string) {
    return (
      allMsgs.find((x) => x.mId === id) ??
      (await this.messageService.getMessageById(id).catch(() => null))
    );
  }

  private updateVisibilityFlags() {
    this.showContact = !this.users.length;
    this.showChannels = !this.channelsWithNames.length;
    this.showMatchedMessages = !this.matchedMessages.length;
    this.showDirectMessages = !this.directMessages.length;
    this.showThreadMessages = !this.threadMessages.length;
  }

  selectChat(chatId: string, chatType: 'private' | 'channel') {
    this.openChat.emit({ chatType, chatId });
    this.close.emit();
  }

  selectThread(hit: ThreadHit) {
    this.openThread.emit({
      chatType: hit.chatType,
      chatId: hit.chatId,
      threadId: hit.threadId,
    });
    this.close.emit();
  }
}
