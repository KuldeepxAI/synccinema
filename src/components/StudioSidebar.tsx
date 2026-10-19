import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Plus,
  Play,
  Trash2,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  Radio,
  Film,
  Music,
  Reply,
  X,
  CheckCheck,
  Smile,
  Pencil,
  Shuffle,
  Mic,
  MicOff,
  PhoneOff,
  Lock,
  Unlock,
  Share2,
} from 'lucide-react';
import {
  ChatMessage,
  ChatReplyReference,
  QueueItem,
  Participant,
  RoomControlMode,
  CURATED_VIDEOS,
  parseMediaInput,
  getYouTubeThumbnail,
  generateRandomNickname,
} from '../types';

interface StudioSidebarProps {
  roomId: string;
  clientId: string;
  userName: string;
  hostId: string;
  controlMode: RoomControlMode;
  canControl: boolean;
  inVoice: boolean;
  isMuted: boolean;
  voiceError: string | null;
  messages: ChatMessage[];
  queue: QueueItem[];
  participants: Participant[];
  onOpenShareModal?: () => void;
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
  onToggleControlMode: (mode: RoomControlMode) => void;
  onSendMessage: (text: string, replyTo?: ChatReplyReference) => void;
  onReactToMessage: (messageId: string, emoji: string) => void;
  onUpdateUserName: (newName: string) => void;
  onAddToQueue: (videoUrl: string, title?: string, author?: string) => void;
  onRemoveFromQueue: (itemId: string) => void;
  onClearQueue: () => void;
  onPlayQueueItemNow: (itemId: string) => void;
  onMoveQueueItem: (itemId: string, direction: 'up' | 'down') => void;
}

const QUICK_MSG_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '👏'];

export const StudioSidebar: React.FC<StudioSidebarProps> = ({
  roomId,
  clientId,
  userName,
  hostId,
  controlMode,
  canControl,
  inVoice,
  isMuted,
  voiceError,
  messages,
  queue,
  participants,
  onOpenShareModal,
  onJoinVoice,
  onLeaveVoice,
  onToggleMute,
  onToggleControlMode,
  onSendMessage,
  onReactToMessage,
  onUpdateUserName,
  onAddToQueue,
  onRemoveFromQueue,
  onClearQueue,
  onPlayQueueItemNow,
  onMoveQueueItem,
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'queue' | 'users'>('chat');
  const [chatInput, setChatInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatReplyReference | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);

  const [queueUrlInput, setQueueUrlInput] = useState('');
  const [queueError, setQueueError] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(userName);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isHost = hostId === clientId;
  const voiceParticipants = participants.filter((p) => p.inVoice);

  useEffect(() => {
    setNameDraft(userName);
  }, [userName]);

  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, activeTab]);

  const handleSelectReply = (msg: ChatMessage) => {
    if (msg.type === 'system') return;
    setReplyingTo({
      id: msg.id,
      senderId: msg.senderId,
      senderName: msg.senderName,
      senderColor: msg.senderColor || '#1ed760',
      text: msg.text,
    });
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 30);
  };

  const scrollToOriginalMessage = (targetId: string) => {
    const el = messageRefs.current[targetId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(targetId);
      setTimeout(() => {
        setHighlightedMsgId((prev) => (prev === targetId ? null : prev));
      }, 1600);
    }
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    onSendMessage(trimmed, replyingTo || undefined);
    setChatInput('');
    setReplyingTo(null);
  };

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = nameDraft.trim().slice(0, 24);
    if (clean) {
      onUpdateUserName(clean);
      setIsEditingName(false);
    }
  };

  const handleQueueSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canControl) return;
    const parsed = parseMediaInput(queueUrlInput);
    if (!parsed) {
      setQueueError(
        'Paste a valid YouTube video/playlist, Spotify, SoundCloud, .m3u8, or live URL'
      );
      return;
    }
    setQueueError(null);
    onAddToQueue(queueUrlInput.trim());
    setQueueUrlInput('');
  };

  const handleCopyInvite = () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(inviteUrl).catch(() => {});
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  const formatChatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <aside className="w-full lg:w-[360px] xl:w-[390px] shrink-0 flex flex-col bg-[#121212] rounded-lg overflow-hidden h-[520px] sm:h-[580px] lg:h-[calc(100vh-80px)]">
      {/* Top Spotify Navigation Pills */}
      <div className="p-2.5 sm:p-3 flex items-center justify-between gap-2 bg-[#121212] border-b border-[#1f1f1f]">
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`px-3 sm:px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'chat'
                ? 'bg-white text-black'
                : 'bg-[#1f1f1f] text-[#b3b3b3] hover:text-white'
            }`}
          >
            Chat
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`px-3 sm:px-3.5 py-1.5 rounded-full text-[12px] font-bold font-mono-tabular transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'queue'
                ? 'bg-white text-black'
                : 'bg-[#1f1f1f] text-[#b3b3b3] hover:text-white'
            }`}
          >
            Queue ({queue.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-3 sm:px-3.5 py-1.5 rounded-full text-[12px] font-bold font-mono-tabular transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'users'
                ? 'bg-white text-black'
                : 'bg-[#1f1f1f] text-[#b3b3b3] hover:text-white'
            }`}
          >
            People ({participants.length})
          </button>
        </div>

        {/* Quick Current User Badge / Name Editor Trigger */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('users');
            setIsEditingName(true);
          }}
          title="Click to customize your display name"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#181818] hover:bg-[#252525] text-[11px] font-bold text-[#1ed760] transition-colors cursor-pointer max-w-[115px] sm:max-w-[130px] shrink-0"
        >
          <span className="truncate">{userName}</span>
          <Pencil className="w-3 h-3 shrink-0 text-[#b3b3b3]" />
        </button>
      </div>

      {/* Compact P2P WebRTC Voice Strip */}
      <div className="px-3 py-2 bg-[#181818] border-b border-[#252525] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Mic
            className={`w-3.5 h-3.5 shrink-0 ${
              inVoice ? 'text-[#1ed760]' : 'text-[#b3b3b3]'
            }`}
          />
          <span className="text-[12px] font-bold text-white truncate">
            {inVoice
              ? `Voice Connected (${voiceParticipants.length})`
              : voiceParticipants.length > 0
              ? `${voiceParticipants.length} in Voice Chat`
              : 'P2P Voice Channel'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!inVoice ? (
            <button
              type="button"
              onClick={onJoinVoice}
              className="px-3 py-1 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] text-black text-[11px] font-bold uppercase tracking-[1.2px] transition-colors cursor-pointer whitespace-nowrap"
            >
              Join Voice
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggleMute}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-[1.2px] flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  isMuted
                    ? 'bg-[#f3727f] text-black'
                    : 'bg-[#1f1f1f] hover:bg-[#272727] text-white'
                }`}
              >
                {isMuted ? (
                  <>
                    <MicOff className="w-3 h-3" />
                    <span>Muted</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3 h-3 text-[#1ed760]" />
                    <span>Live</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onLeaveVoice}
                title="Leave voice chat"
                className="w-7 h-7 rounded-full bg-[#272727] hover:bg-[#f3727f] hover:text-black text-[#b3b3b3] flex items-center justify-center transition-colors cursor-pointer"
              >
                <PhoneOff className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {voiceError && (
        <div className="px-3 py-1.5 bg-[#252525] text-[#f3727f] text-[11px]">
          {voiceError}
        </div>
      )}

      {/* TAB 1: WHATSAPP + SPOTIFY DARK LIVE CHAT */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col min-h-0 bg-[#0b141a]">
          <div
            className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
            onClick={() => setActiveReactionPickerId(null)}
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <p className="text-[14px] font-bold text-white">No messages yet</p>
                <p className="text-[12px] text-[#b3b3b3] mt-1">
                  Send a message or double-click any chat bubble to reply.
                </p>
              </div>
            ) : (
              messages.map((m, idx) => {
                if (m.type === 'system') {
                  return (
                    <div key={m.id} className="flex justify-center my-1.5">
                      <div className="bg-[#182229] text-[#b3b3b3] text-[11px] px-3 py-1 rounded-lg max-w-[90%] text-center shadow-xs">
                        <span>{m.text}</span>
                      </div>
                    </div>
                  );
                }

                const isSelf = m.senderId === clientId;
                const prevMsg = idx > 0 ? messages[idx - 1] : null;
                const isSameSenderAsPrev =
                  prevMsg &&
                  prevMsg.type === 'user' &&
                  prevMsg.senderId === m.senderId;
                const isHighlighted = highlightedMsgId === m.id;
                const reactionEntries = m.reactions ? Object.entries(m.reactions) : [];

                return (
                  <div
                    key={m.id}
                    ref={(el) => {
                      messageRefs.current[m.id] = el;
                    }}
                    onDoubleClick={() => handleSelectReply(m)}
                    className={`group relative flex flex-col ${
                      isSelf ? 'items-end' : 'items-start'
                    } ${isSameSenderAsPrev ? 'mt-0.5' : 'mt-2.5'} transition-colors ${
                      isHighlighted ? 'bg-[#1ed760]/20 -mx-2 px-2 py-1 rounded-lg' : ''
                    }`}
                  >
                    <div
                      className={`relative flex items-center gap-1.5 max-w-[86%] ${
                        isSelf ? 'flex-row-reverse' : 'flex-row'
                      }`}
                    >
                      <div
                        className={`relative px-3 py-1.5 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.4)] text-[13.5px] leading-snug break-words min-w-[96px] ${
                          isSelf
                            ? 'bg-[#005c4b] text-white rounded-tr-xs'
                            : 'bg-[#202c33] text-white rounded-tl-xs'
                        }`}
                      >
                        {!isSelf && !isSameSenderAsPrev && (
                          <div
                            className="text-[12px] font-bold mb-0.5 truncate"
                            style={{ color: m.senderColor || '#1ed760' }}
                          >
                            {m.senderName}
                          </div>
                        )}

                        {m.replyTo && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              scrollToOriginalMessage(m.replyTo!.id);
                            }}
                            className="mb-1.5 rounded-md bg-black/25 hover:bg-black/35 px-2.5 py-1.5 cursor-pointer transition-colors overflow-hidden"
                            style={{
                              boxShadow: `inset 3px 0 0 ${
                                m.replyTo.senderId === clientId
                                  ? '#1ed760'
                                  : m.replyTo.senderColor || '#539df5'
                              }`,
                            }}
                          >
                            <p
                              className="text-[11px] font-bold truncate"
                              style={{
                                color:
                                  m.replyTo.senderId === clientId
                                    ? '#1ed760'
                                    : m.replyTo.senderColor || '#539df5',
                              }}
                            >
                              {m.replyTo.senderId === clientId
                                ? 'You'
                                : m.replyTo.senderName}
                            </p>
                            <p className="text-[11.5px] text-white/80 line-clamp-2">
                              {m.replyTo.text}
                            </p>
                          </div>
                        )}

                        <div className="flex flex-wrap items-end gap-x-2 gap-y-0.5">
                          <span className="whitespace-pre-wrap break-words">{m.text}</span>
                          <span className="ml-auto flex items-center gap-1 text-[10px] text-white/65 font-mono-tabular select-none shrink-0 pt-0.5">
                            <span>{formatChatTime(m.timestamp)}</span>
                            {isSelf && (
                              <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb] inline" />
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectReply(m);
                          }}
                          title="Reply to message"
                          className="w-7 h-7 rounded-full bg-[#202c33] hover:bg-[#2a3942] text-[#b3b3b3] hover:text-white flex items-center justify-center shadow-sm cursor-pointer"
                        >
                          <Reply className="w-3.5 h-3.5" />
                        </button>

                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveReactionPickerId((prev) =>
                                prev === m.id ? null : m.id
                              );
                            }}
                            title="React to message"
                            className="w-7 h-7 rounded-full bg-[#202c33] hover:bg-[#2a3942] text-[#b3b3b3] hover:text-white flex items-center justify-center shadow-sm cursor-pointer"
                          >
                            <Smile className="w-3.5 h-3.5" />
                          </button>

                          {activeReactionPickerId === m.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute bottom-8 ${
                                isSelf ? 'right-0' : 'left-0'
                              } z-30 flex items-center gap-1 bg-[#202c33] px-2 py-1 rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.6)]`}
                            >
                              {QUICK_MSG_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => {
                                    onReactToMessage(m.id, emoji);
                                    setActiveReactionPickerId(null);
                                  }}
                                  className="hover:scale-125 transition-transform text-sm px-1 cursor-pointer"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {reactionEntries.length > 0 && (
                      <div
                        className={`flex flex-wrap items-center gap-1 -mt-1 z-10 ${
                          isSelf ? 'mr-2' : 'ml-2'
                        }`}
                      >
                        {reactionEntries.map(([emoji, users]) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => onReactToMessage(m.id, emoji)}
                            title={users.join(', ')}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#202c33] hover:bg-[#2a3942] text-[11px] text-white shadow-sm cursor-pointer"
                          >
                            <span>{emoji}</span>
                            {users.length > 1 && (
                              <span className="font-mono-tabular text-[10px] text-[#b3b3b3]">
                                {users.length}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {replyingTo && (
            <div className="px-3 pt-2 pb-1 bg-[#182229] flex items-center justify-between gap-2">
              <div
                className="flex-1 bg-[#111b21] rounded-md px-3 py-1.5 overflow-hidden"
                style={{
                  boxShadow: `inset 3px 0 0 ${
                    replyingTo.senderId === clientId
                      ? '#1ed760'
                      : replyingTo.senderColor || '#539df5'
                  }`,
                }}
              >
                <p
                  className="text-[11px] font-bold truncate"
                  style={{
                    color:
                      replyingTo.senderId === clientId
                        ? '#1ed760'
                        : replyingTo.senderColor || '#539df5',
                  }}
                >
                  Replying to{' '}
                  {replyingTo.senderId === clientId ? 'yourself' : replyingTo.senderName}
                </p>
                <p className="text-[12px] text-[#b3b3b3] truncate">{replyingTo.text}</p>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                aria-label="Cancel reply"
                className="w-7 h-7 rounded-full hover:bg-[#202c33] text-[#b3b3b3] hover:text-white flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <form
            onSubmit={handleChatSubmit}
            className="p-2.5 bg-[#182229] flex items-center gap-2"
          >
            <input
              ref={chatInputRef}
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && replyingTo) {
                  setReplyingTo(null);
                }
              }}
              placeholder={
                replyingTo ? `Reply to ${replyingTo.senderName}...` : 'Type a message...'
              }
              maxLength={500}
              className="flex-1 bg-[#2a3942] text-white text-[14px] rounded-full px-4 py-2.5 focus:outline-none placeholder-[#8696a0]"
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              aria-label="Send message"
              className="w-10 h-10 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] disabled:opacity-30 text-black flex items-center justify-center transition-transform hover:scale-105 cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: SHARED VIDEO & MUSIC QUEUE */}
      {activeTab === 'queue' && (
        <div className="flex-1 flex flex-col min-h-0 pt-2">
          {canControl ? (
            <form
              onSubmit={handleQueueSubmit}
              className="px-3 pb-3 flex flex-col gap-1.5"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={queueUrlInput}
                  onChange={(e) => {
                    setQueueUrlInput(e.target.value);
                    if (queueError) setQueueError(null);
                  }}
                  placeholder="Paste YouTube video/playlist, Spotify, or URL..."
                  className="flex-1 bg-[#1f1f1f] text-white text-[13px] rounded-full px-4 py-2 shadow-[rgb(18,18,18)_0px_1px_0px,rgb(124,124,124)_0px_0px_0px_1px_inset] focus:outline-none focus:ring-2 focus:ring-white placeholder-[#b3b3b3]"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] text-black text-[11px] font-bold uppercase tracking-[1.4px] transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>
              {queueError && <p className="text-[11px] text-[#f3727f] pl-2">{queueError}</p>}
              {queue.length > 1 && (
                <div className="flex items-center justify-between px-1 pt-1">
                  <span className="text-[11px] text-[#b3b3b3]">
                    {queue.length} items lined up
                  </span>
                  <button
                    type="button"
                    onClick={onClearQueue}
                    className="text-[11px] font-bold text-[#f3727f] hover:underline cursor-pointer"
                  >
                    Clear Queue
                  </button>
                </div>
              )}
            </form>
          ) : (
            <div className="px-3 pb-3">
              <div className="p-2.5 rounded-lg bg-[#181818] text-[12px] text-[#b3b3b3] flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-[#ffa42b] shrink-0" />
                <span>Queue & playback are locked to the Room Host.</span>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
            {queue.length === 0 ? (
              <div className="py-6 px-2 space-y-4">
                <div className="text-center">
                  <p className="text-[14px] font-bold text-white">Queue is empty</p>
                  <p className="text-[12px] text-[#b3b3b3] mt-0.5">
                    Paste a YouTube playlist URL above to queue all its videos at once, or add individual tracks below.
                  </p>
                </div>

                {canControl && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-[#b3b3b3] uppercase tracking-[1.4px] px-1">
                      Recommended Streams & Playlists
                    </p>
                    {CURATED_VIDEOS.map((vid) => (
                      <div
                        key={vid.mediaUrl}
                        className="flex items-center justify-between gap-2 p-2 rounded-md bg-[#181818] hover:bg-[#252525] transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-white truncate">
                            {vid.title}
                          </p>
                          <p className="text-[11px] text-[#b3b3b3] truncate">
                            {vid.author}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onAddToQueue(vid.mediaUrl, vid.title, vid.author)}
                          className="px-3 py-1 rounded-full border border-[#7c7c7c] hover:border-white text-[11px] font-bold text-white uppercase tracking-[1.2px] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              queue.map((item, idx) => (
                <div
                  key={item.id}
                  className="group flex items-center gap-3 p-2.5 rounded-md bg-[#181818] hover:bg-[#252525] transition-colors"
                >
                  <div className="relative w-12 h-12 rounded overflow-hidden bg-[#121212] shrink-0 flex items-center justify-center">
                    {item.sourceType === 'youtube' ? (
                      <img
                        src={getYouTubeThumbnail(item.videoId)}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#1f1f1f] flex items-center justify-center text-[#1ed760]">
                        {item.sourceType === 'music-embed' ||
                        item.sourceType === 'direct-audio' ? (
                          <Music className="w-4 h-4" />
                        ) : item.sourceType === 'embed-web' ? (
                          <Radio className="w-4 h-4" />
                        ) : (
                          <Film className="w-4 h-4" />
                        )}
                      </div>
                    )}
                    {canControl && (
                      <button
                        type="button"
                        onClick={() => onPlayQueueItemNow(item.id)}
                        title="Play now"
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[#1ed760] transition-opacity cursor-pointer"
                      >
                        <Play className="w-5 h-5 fill-current" />
                      </button>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-white truncate">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-[#b3b3b3] truncate">
                      {item.author} · {item.addedBy}
                    </p>
                  </div>

                  {canControl && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => onMoveQueueItem(item.id, 'up')}
                        className="w-7 h-7 rounded-full hover:bg-[#1f1f1f] disabled:opacity-25 text-[#b3b3b3] hover:text-white flex items-center justify-center cursor-pointer"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === queue.length - 1}
                        onClick={() => onMoveQueueItem(item.id, 'down')}
                        className="w-7 h-7 rounded-full hover:bg-[#1f1f1f] disabled:opacity-25 text-[#b3b3b3] hover:text-white flex items-center justify-center cursor-pointer"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveFromQueue(item.id)}
                        className="w-7 h-7 rounded-full hover:bg-[#1f1f1f] text-[#b3b3b3] hover:text-[#f3727f] flex items-center justify-center cursor-pointer"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ACTIVE VIEWERS, HOST PERMISSIONS & INVITE */}
      {activeTab === 'users' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto">
          {/* Host Control Mode Card */}
          <div className="p-3.5 rounded-lg bg-[#181818] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-[#b3b3b3] uppercase tracking-[1.4px]">
                Playback Control
              </span>
              <span className="text-[11px] font-bold text-[#1ed760]">
                {isHost ? 'You are Host' : controlMode === 'everyone' ? 'Unlocked' : 'Host Locked'}
              </span>
            </div>

            {isHost || controlMode === 'everyone' ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggleControlMode('everyone')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-[11px] font-bold uppercase tracking-[1.2px] transition-colors cursor-pointer whitespace-nowrap ${
                    controlMode === 'everyone'
                      ? 'bg-[#1ed760] text-black'
                      : 'bg-[#1f1f1f] text-[#b3b3b3] hover:text-white'
                  }`}
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Everyone</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleControlMode('host-only')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-[11px] font-bold uppercase tracking-[1.2px] transition-colors cursor-pointer whitespace-nowrap ${
                    controlMode === 'host-only'
                      ? 'bg-white text-black'
                      : 'bg-[#1f1f1f] text-[#b3b3b3] hover:text-white'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Host Only</span>
                </button>
              </div>
            ) : (
              <p className="text-[12px] text-white">
                Host-Locked: Only the room host can control video playback or unlock the room.
              </p>
            )}
          </div>

          {/* Customize Your Name Card */}
          <form
            onSubmit={handleSaveName}
            className="p-3.5 rounded-lg bg-[#181818] space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-[#b3b3b3] uppercase tracking-[1.4px]">
                Your Display Name
              </span>
              <button
                type="button"
                onClick={() => {
                  const random = generateRandomNickname();
                  setNameDraft(random);
                  onUpdateUserName(random);
                }}
                className="flex items-center gap-1 text-[11px] font-bold text-[#1ed760] hover:underline cursor-pointer"
              >
                <Shuffle className="w-3 h-3" />
                <span>Randomize</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => {
                  setNameDraft(e.target.value);
                  setIsEditingName(true);
                }}
                maxLength={24}
                placeholder="Enter display name..."
                className="flex-1 bg-[#1f1f1f] text-white text-[13px] rounded-full px-3.5 py-2 shadow-[rgb(18,18,18)_0px_1px_0px,rgb(124,124,124)_0px_0px_0px_1px_inset] focus:outline-none focus:ring-2 focus:ring-white"
              />
              {(isEditingName || nameDraft.trim() !== userName) && (
                <button
                  type="submit"
                  className="px-4 py-2 rounded-full bg-[#1ed760] text-black text-[11px] font-bold uppercase tracking-[1.2px] cursor-pointer shrink-0"
                >
                  Save
                </button>
              )}
            </div>
          </form>

          {/* Invite Box */}
          <div className="p-4 rounded-lg bg-[#181818] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-bold text-white">
                Invite Friends
              </span>
              <span className="font-mono-tabular text-[13px] font-bold text-[#1ed760]">
                {roomId}
              </span>
            </div>
            <p className="text-[12px] text-[#b3b3b3] leading-relaxed">
              Share this invite link or room code so friends can watch and talk together.
            </p>
            <button
              type="button"
              onClick={() => {
                handleCopyInvite();
                if (onOpenShareModal) {
                  onOpenShareModal();
                }
              }}
              className="w-full py-2.5 px-4 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] text-black text-[12px] font-bold uppercase tracking-[1.4px] transition-all cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Share2 className="w-4 h-4" />
              <span>{copiedInvite ? 'Link Copied · Share Options' : 'Share & Invite Friends'}</span>
            </button>
          </div>

          <div className="space-y-2">
            <h3 className="text-[12px] font-bold text-[#b3b3b3] uppercase tracking-[1.4px]">
              In This Room ({participants.length})
            </h3>
            <div className="space-y-1">
              {participants.map((p) => {
                const isMe = p.id === clientId;
                const isRoomHost = p.id === hostId;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-3 py-2 rounded-md bg-[#181818] text-[13px]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-black shrink-0 ${
                          p.inVoice && !p.isMuted ? 'ring-2 ring-[#1ed760]' : ''
                        }`}
                        style={{ backgroundColor: isMe ? '#1ed760' : p.color || '#ffffff' }}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-bold text-white truncate">
                        {p.name}
                      </span>
                      {p.inVoice && (
                        <span className="shrink-0">
                          {p.isMuted ? (
                            <MicOff className="w-3.5 h-3.5 text-[#f3727f]" />
                          ) : (
                            <Mic className="w-3.5 h-3.5 text-[#1ed760]" />
                          )}
                        </span>
                      )}
                    </div>
                    <span className="text-[12px] text-[#b3b3b3] whitespace-nowrap shrink-0">
                      {isMe
                        ? isRoomHost
                          ? 'You · Host'
                          : 'You'
                        : isRoomHost
                        ? 'Host'
                        : 'Watching'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
