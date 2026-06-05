import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
  SimpleChanges,
  ElementRef,
  HostListener,
  ViewChild,
} from '@angular/core';
import { Message } from '../../../../shared/interfaces/message.interface';
import { Timestamp } from '@angular/fire/firestore';
import { UserService } from '../../../../shared/services/user.service';
import { ChannelService } from '../../../../shared/services/channel.service';
import { User } from '../../../../shared/interfaces/user.interface';
import { Channel } from '../../../../shared/interfaces/channel.interface';
import {
  GroupedReaction,
  Reaction,
} from '../../../../shared/interfaces/reaction.interface';
import { Subscription } from 'rxjs';
import { MessageService } from '../../../../shared/services/message.service';
import { PickerComponent } from '@ctrl/ngx-emoji-mart';
import { PermanentDeleteComponent } from '../../../general-components/permanent-delete/permanent-delete.component';
import { FormsModule } from '@angular/forms';

// NOTE: `<emoji-mart>` is only referenced inside a `@defer` block in the
// template. Angular therefore emits `@ctrl/ngx-emoji-mart` (and its CSS) as
// its own lazy chunk that is only fetched the first time the user opens the
// emoji picker.

/**
 * Ein Teilstück eines Nachrichtentextes für das Rendern. Reiner Text oder
 * eine Erwähnung eines Users (`@`) bzw. eines Channels (`#`).
 */
export interface MessageSegment {
  type: 'text' | 'user' | 'channel';
  /** Anzuzeigender Text (z.B. `@Max`, `#general` oder reiner Text). */
  label: string;
  /** Id des referenzierten Users/Channels, falls auflösbar. */
  refId?: string;
}

@Component({
  selector: 'app-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PickerComponent, PermanentDeleteComponent, FormsModule],
  templateUrl: './message.component.html',
  styleUrl: './message.component.scss',
})
export class MessageComponent implements OnInit {
  private userService = inject(UserService);
  private channelService = inject(ChannelService);
  private messageService = inject(MessageService);
  // With OnPush change detection, asynchronously assigned fields (sender,
  // active user, thread info) don't trigger a re-render automatically. We
  // call `cdr.markForCheck()` after each async update.
  private cdr = inject(ChangeDetectorRef);
  private userSub?: Subscription;
  private threadSub?: Subscription;
  private senderSub?: Subscription;

  @Input() chatType: 'private' | 'channel' | 'thread' | 'new' | null = null;
  @Input() message!: Message;
  @Input() activeUserId: string | null = null;

  @Output() profileClick = new EventEmitter<string>();
  @Output() threadOpen = new EventEmitter<string>();
  /** Klick auf eine Channel-Erwähnung (`#channel`) im Nachrichtentext. */
  @Output() channelMentionClick = new EventEmitter<string>();

  @ViewChild('emojiPicker', { read: ElementRef }) emojiPickerRef?: ElementRef;
  @ViewChild('emojiBtn', { read: ElementRef }) emojiBtnRef?: ElementRef;
  @ViewChild('optionsMenu', { read: ElementRef }) optionsMenuRef?: ElementRef;
  @ViewChild('optionsBtn', { read: ElementRef }) optionsBtnRef?: ElementRef;
  @ViewChild('editTextarea', { read: ElementRef })
  editTextareaRef!: ElementRef<HTMLTextAreaElement>;

  activeUserData: User | null = null;
  senderData: User | null = null;
  groupedReactions: GroupedReaction[] = [];
  /** Aufbereiteter Nachrichtentext mit hervorgehobenen Erwähnungen. */
  messageSegments: MessageSegment[] = [];
  shownReactionNumber = 7;
  editText = '';
  replyCount = 0;
  lastReplyTime: Timestamp | null = null;

  isEmojiPickerOpen = false;
  isOptionsOpen = false;
  isPermanentDeleteOpen = false;
  isEditOpen = false;

  ngOnInit(): void {
    this.loadSenderData();
    this.loadActiveUserData();
    this.regroupReactions();
    this.loadThreadInfo();
    this.loadMentionData();
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['message']) {
      this.regroupReactions();
      this.loadThreadInfo();
      this.parseMessageText();
    }
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
    this.threadSub?.unsubscribe();
    this.senderSub?.unsubscribe();
  }

  private loadSenderData() {
    this.senderSub?.unsubscribe();
    this.senderSub = this.userService
      .getUserRealtime(this.message.mSenderId!)
      .subscribe({
        next: (u) => {
          this.senderData = u;
          this.cdr.markForCheck();
        },
        error: (err) => console.error('Sender-Live', err),
      });
  }

  private loadActiveUserData() {
    if (!this.activeUserId) return;
    this.userSub?.unsubscribe();
    this.userSub = this.userService
      .getUserRealtime(this.activeUserId)
      .subscribe({
        next: (u) => {
          this.activeUserData = u;
          this.cdr.markForCheck();
        },
        error: (err) => console.error('User-Live', err),
      });
  }

  private loadThreadInfo() {
    this.threadSub?.unsubscribe();
    this.replyCount = 0;
    this.lastReplyTime = null;

    if (!this.message.mThreadId || this.chatType === 'thread') return;

    this.threadSub = this.messageService
      .getThreadMessages(this.message.mThreadId)
      .subscribe((msgs) => {
        const replies = msgs.filter((m) => m.mId !== this.message.mId);
        this.replyCount = replies.length;
        this.lastReplyTime = (replies.at(-1)?.mTime as Timestamp) ?? null;
        this.cdr.markForCheck();
      });
  }

  regroupReactions() {
    this.groupedReactions =
      this.message.mReactions && this.activeUserId
        ? this.groupReactionsWithNames(
            this.message.mReactions,
            this.activeUserId
          )
        : [];
  }

  // ---- Mention-Aufbereitung ------------------------------------------------

  /** Bekannte User-/Channel-Namen für die Auflösung von Erwähnungen. */
  private knownUsers: User[] = [];
  private knownChannels: Channel[] = [];

  /**
   * Lädt einmalig alle User und Channels, um Erwähnungen im Nachrichtentext
   * auf konkrete Ids auflösen zu können, und parst danach den Text.
   */
  private loadMentionData(): void {
    Promise.all([
      this.userService.getAllUsers(),
      this.channelService.getAllChannels(),
    ])
      .then(([users, channels]) => {
        this.knownUsers = users;
        this.knownChannels = channels;
        this.parseMessageText();
        this.cdr.markForCheck();
      })
      .catch((err) => console.error('Mention-Daten', err));
  }

  /**
   * Zerlegt `message.mText` in Text- und Erwähnungs-Segmente. Erwähnungen
   * werden nur dann als solche markiert, wenn der referenzierte User/Channel
   * existiert – andernfalls bleibt der Text unverändert stehen.
   */
  private parseMessageText(): void {
    const text = this.message?.mText ?? '';
    const segments: MessageSegment[] = [];
    const regex = /([@#])([\p{L}\p{N}_.-]+)/gu;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      this.pushPlainText(segments, text.slice(lastIndex, match.index));
      this.pushMention(segments, match[1], match[2]);
      lastIndex = match.index + match[0].length;
    }

    this.pushPlainText(segments, text.slice(lastIndex));
    this.messageSegments = segments;
  }

  private pushPlainText(segments: MessageSegment[], value: string): void {
    if (value) segments.push({ type: 'text', label: value });
  }

  /**
   * Hängt eine Erwähnung an, wenn der Name aufgelöst werden kann; sonst wird
   * das Roh-Token als reiner Text behandelt.
   */
  private pushMention(
    segments: MessageSegment[],
    symbol: string,
    name: string
  ): void {
    const resolved =
      symbol === '@'
        ? this.findUserByName(name)
        : this.findChannelByName(name);

    if (resolved) {
      segments.push({
        type: symbol === '@' ? 'user' : 'channel',
        label: symbol + name,
        refId: resolved,
      });
    } else {
      this.pushPlainText(segments, symbol + name);
    }
  }

  private findUserByName(name: string): string | undefined {
    const lower = name.toLowerCase();
    return this.knownUsers.find((u) => u.uName?.toLowerCase() === lower)?.uId;
  }

  private findChannelByName(name: string): string | undefined {
    const lower = name.toLowerCase();
    return this.knownChannels.find(
      (c) => c.cName?.toLowerCase() === lower
    )?.cId ?? undefined;
  }

  /** Klick auf eine Erwähnung im gerenderten Text. */
  onMentionClick(segment: MessageSegment): void {
    if (!segment.refId) return;
    if (segment.type === 'user') this.profileClick.emit(segment.refId);
    if (segment.type === 'channel')
      this.channelMentionClick.emit(segment.refId);
  }

  private groupReactionsWithNames(
    reactions: Reaction[],
    activeUserId: string
  ): GroupedReaction[] {
    const grouped = this.collectReactions(reactions, activeUserId);
    return this.mapBucketsToViewModel(grouped);
  }

  private collectReactions(
    reactions: Reaction[],
    activeUserId: string
  ): Map<string, { count: number; names: string[] }> {
    const grouped = new Map<string, { count: number; names: string[] }>();
    reactions.forEach((r) => {
      const key = r.reaction;
      const name = r.userId === activeUserId ? 'Du' : r.userName;
      const bucket = grouped.get(key) ?? { count: 0, names: [] };

      bucket.count++;
      if (!bucket.names.includes(name)) bucket.names.push(name);

      grouped.set(key, bucket);
    });
    return grouped;
  }

  private mapBucketsToViewModel(
    buckets: Map<string, { count: number; names: string[] }>
  ): GroupedReaction[] {
    return Array.from(buckets, ([reaction, data]) => ({
      reaction,
      count: data.count,
      names: data.names,
      namesLine: this.buildNameLine(data.names),
      actionLine: this.buildActionLine(data.names, data.count),
    }));
  }

  private buildNameLine(names: string[], max = 3): string {
    const list = [...names];
    const idxDu = list.indexOf('Du');
    if (idxDu > 0) {
      list.splice(idxDu, 1);
      list.unshift('Du');
    }

    if (list.length <= max) {
      return list.join(', ').replace(/, ([^,]*)$/, ' und $1');
    }
    const first = list.slice(0, max).join(', ');
    const rest = list.length - max;
    return `${first} und ${rest === 1 ? 'ein weiterer' : rest + ' weitere'}`;
  }

  private buildActionLine(names: string[], count: number): string {
    return count === 1
      ? names[0] === 'Du'
        ? 'hast reagiert'
        : 'hat reagiert'
      : 'haben reagiert';
  }

  setShownReactionNumber() {
    this.shownReactionNumber =
      this.shownReactionNumber < this.groupedReactions.length
        ? this.groupedReactions.length
        : 7;
  }

  getTimeInHours(ts: Timestamp | null): string | undefined {
    return ts instanceof Timestamp
      ? ts
          .toDate()
          .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : undefined;
  }

  getDayLabel(mTime: any): string {
    const date =
      mTime instanceof Date ? mTime : mTime?.toDate?.() ?? new Date(mTime);
    const todayMid = new Date().setHours(0, 0, 0, 0);
    const msgMid = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    ).getTime();

    if (msgMid === todayMid) return 'Heute';
    if (msgMid === todayMid - 86400000) return 'Gestern';

    return this.formatAsGermanDate(date);
  }

  private formatAsGermanDate(d: Date): string {
    return (
      `${String(d.getDate()).padStart(2, '0')}.` +
      `${String(d.getMonth() + 1).padStart(2, '0')}.` +
      d.getFullYear()
    );
  }

  addReaction(reaction: string) {
    if (!this.message.mId || !this.activeUserId) return;

    this.userService
      .editLastReactions(this.activeUserId, reaction)
      .catch(console.error);

    this.messageService
      .toggleReaction(this.message.mId, {
        reaction,
        userId: this.activeUserId,
        userName: this.activeUserData?.uName ?? '',
      })
      .catch(console.error);
  }

  onThreadClick() {
    if (!this.message.mId) return;

    const tid = this.message.mThreadId || this.message.mId;
    const ensureThread = this.message.mThreadId
      ? Promise.resolve()
      : this.messageService.startThread(this.message.mId);

    ensureThread.then(() => {
      this.message.mThreadId = tid;
      this.threadOpen.emit(tid);
    });
  }

  openProfil() {
    if (this.message.mSenderId) this.profileClick.emit(this.message.mSenderId);
  }

  toggleEmojiPicker(e: MouseEvent) {
    e.stopPropagation();
    this.isEmojiPickerOpen = !this.isEmojiPickerOpen;
  }
  toggleOptions(e: MouseEvent) {
    e.stopPropagation();
    this.isOptionsOpen = !this.isOptionsOpen;
  }
  toggleEdit() {
    this.isEditOpen = !this.isEditOpen;
  }
  togglePermanentDelete() {
    this.isPermanentDeleteOpen = !this.isPermanentDeleteOpen;
  }

  onEmojiPicked(e: any) {
    const char = e.emoji?.native ?? e.emoji;
    if (this.isEditOpen && this.editTextareaRef) {
      const ta = this.editTextareaRef.nativeElement;
      const pos = ta.selectionStart ?? this.editText.length;
      this.editText =
        this.editText.slice(0, pos) + char + this.editText.slice(pos);
      setTimeout(() =>
        ta.setSelectionRange(pos + char.length, pos + char.length)
      );
      return;
    }
    this.addReaction(char);
    this.isEmojiPickerOpen = false;
  }

  openEdit() {
    this.editText = this.message.mText ?? '';
    this.toggleEdit();
    setTimeout(() => this.editTextareaRef?.nativeElement.focus());
  }

  saveEdit() {
    if (!this.message.mId) return;
    const trimmed = this.editText.trim();
    if (!trimmed) return;

    if (trimmed === (this.message.mText ?? '').trim()) {
      this.closeEdit();
      return;
    }
    this.messageService
      .editMessageText(this.message.mId, trimmed)
      .then(() => {
        this.message.mText = trimmed;
        this.parseMessageText();
        this.closeEdit();
      })
      .catch(console.error);
  }

  private closeEdit() {
    this.isEditOpen = false;
    this.isOptionsOpen = false;
    this.cdr.markForCheck();
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(ev: MouseEvent): void {
    if (this.isPermanentDeleteOpen) return;

    const target = ev.target as HTMLElement;

    this.maybeCloseEmojiPicker(target);
    this.maybeCloseOptionsMenu(target);
  }

  private maybeCloseEmojiPicker(target: HTMLElement): void {
    if (
      this.isEmojiPickerOpen &&
      !this.elementContains(this.emojiPickerRef, target) &&
      !this.elementContains(this.emojiBtnRef, target)
    ) {
      this.isEmojiPickerOpen = false;
    }
  }

  private maybeCloseOptionsMenu(target: HTMLElement): void {
    if (
      this.isOptionsOpen &&
      !this.elementContains(this.optionsMenuRef, target) &&
      !this.elementContains(this.optionsBtnRef, target)
    ) {
      this.isOptionsOpen = false;
    }
  }

  private elementContains(
    ref: ElementRef | undefined,
    target: HTMLElement
  ): boolean {
    return ref?.nativeElement?.contains(target) ?? false;
  }
}
