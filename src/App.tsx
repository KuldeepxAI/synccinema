import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Plus,
  Share2,
  Check,
  LogOut,
  Search,
  Link2,
  Mic,
  MicOff,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  RoomState,
  RoomControlMode,
  PublicRoomSummary,
  FloatingReaction,
  ChatReplyReference,
  CURATED_VIDEOS,
  parseMediaInput,
  generateRandomNickname,
} from './types';
import { useVoiceChat } from './hooks/useVoiceChat';
import { YouTubeSyncPlayer } from './components/YouTubeSyncPlayer';
import { StudioSidebar } from './components/StudioSidebar';
import { LobbyView } from './components/LobbyView';
import { ShareRoomModal } from './components/ShareRoomModal';

function getOrCreatePersistentClientId(): string {
  const existing = sessionStorage.getItem('synccinema_client_id');
  if (existing) return existing;
  const created = `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  sessionStorage.setItem('synccinema_client_id', created);
  return created;
}

function getInitialNickname(): string {
  const saved = localStorage.getItem('synccinema_nickname');
  if (!saved || saved === 'Aarav') {
    const generated = generateRandomNickname();
    localStorage.setItem('synccinema_nickname', generated);
    return generated;
  }
  return saved;
}

export default function App() {
  const [clientId] = useState<string>(() => getOrCreatePersistentClientId());
  const [userName, setUserName] = useState<string>(() => getInitialNickname());
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [currentRoom, setCurrentRoom] = useState<RoomState | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);

  const [lobbySearch, setLobbySearch] = useState<string>('');
  const [videoUrlInput, setVideoUrlInput] = useState<string>('');
  const [videoInputError, setVideoInputError] = useState<string | null>(null);
  const [copiedHeaderInvite, setCopiedHeaderInvite] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const currentRoomIdRef = useRef<string | null>(null);
  const userNameRef = useRef<string>(userName);
  const clientIdRef = useRef<string>(clientId);
  const initialUrlRoomJoinedRef = useRef<boolean>(false);

  userNameRef.current = userName;
  clientIdRef.current = clientId;
  currentRoomIdRef.current = currentRoom?.id || null;

  const sendWsMessage = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          clientId: clientIdRef.current,
          ...payload,
        })
      );
    }
  }, []);

  const {
    inVoice,
    isMuted,
    voiceError,
    joinVoice,
    leaveVoice,
    toggleMute,
    handlePeerJoinedVoice,
    handlePeerLeftVoice,
    handleVoiceSignal,
  } = useVoiceChat({
    roomId: currentRoom?.id || null,
    clientId,
    sendWsMessage,
  });

  const voiceHandlersRef = useRef({
    handlePeerJoinedVoice,
    handlePeerLeftVoice,
    handleVoiceSignal,
  });
  voiceHandlersRef.current = {
    handlePeerJoinedVoice,
    handlePeerLeftVoice,
    handleVoiceSignal,
  };

  const handleUserNameChange = useCallback(
    (newName: string) => {
      setUserName(newName);
      localStorage.setItem('synccinema_nickname', newName);
      if (currentRoomIdRef.current && newName.trim()) {
        sendWsMessage({
          type: 'room:update_name',
          userName: newName.trim(),
        });
      }
    },
    [sendWsMessage]
  );

  useEffect(() => {
    let isUnmounted = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    const connect = () => {
      if (isUnmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (isUnmounted) return;
        setWsConnected(true);

        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                type: 'ping',
                clientId: clientIdRef.current,
              })
            );
          }
        }, 20_000);

        const params = new URLSearchParams(window.location.search);
        const urlRoomCode = params.get('room')?.toUpperCase().trim();

        if (!initialUrlRoomJoinedRef.current && urlRoomCode) {
          initialUrlRoomJoinedRef.current = true;
          socket.send(
            JSON.stringify({
              type: 'room:join',
              clientId: clientIdRef.current,
              roomId: urlRoomCode,
              userName: userNameRef.current.trim() || generateRandomNickname(),
            })
          );
        } else if (currentRoomIdRef.current) {
          socket.send(
            JSON.stringify({
              type: 'room:join',
              clientId: clientIdRef.current,
              roomId: currentRoomIdRef.current,
              userName: userNameRef.current.trim() || generateRandomNickname(),
            })
          );
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'lobby:rooms': {
              if (Array.isArray(data.rooms)) {
                setPublicRooms(data.rooms);
              }
              break;
            }

            case 'room:joined': {
              const room: RoomState = data.room;
              setCurrentRoom(room);
              setJoinError(null);

              const nextUrl = `${window.location.pathname}?room=${room.id}`;
              window.history.replaceState({}, '', nextUrl);
              break;
            }

            case 'room:left': {
              setCurrentRoom(null);
              window.history.replaceState({}, '', window.location.pathname);
              break;
            }

            case 'room:error': {
              setJoinError(data.message || 'Unable to join room.');
              break;
            }

            case 'room:meta_updated': {
              setCurrentRoom((prev) =>
                prev
                  ? {
                      ...prev,
                      hostId: data.hostId ?? prev.hostId,
                      controlMode: data.controlMode ?? prev.controlMode,
                    }
                  : prev
              );
              break;
            }

            case 'room:participants_updated': {
              setCurrentRoom((prev) =>
                prev ? { ...prev, participants: data.participants } : prev
              );
              break;
            }

            case 'voice:peer_joined': {
              voiceHandlersRef.current.handlePeerJoinedVoice(data.peerId);
              break;
            }

            case 'voice:peer_left': {
              voiceHandlersRef.current.handlePeerLeftVoice(data.peerId);
              break;
            }

            case 'voice:signal': {
              voiceHandlersRef.current.handleVoiceSignal(data);
              break;
            }

            case 'video:state_updated': {
              setCurrentRoom((prev) =>
                prev ? { ...prev, playback: data.playback } : prev
              );
              break;
            }

            case 'queue:updated': {
              setCurrentRoom((prev) =>
                prev ? { ...prev, queue: data.queue } : prev
              );
              break;
            }

            case 'chat:new_message': {
              setCurrentRoom((prev) => {
                if (!prev) return prev;
                if (prev.messages.some((m) => m.id === data.message.id)) {
                  return prev;
                }
                return {
                  ...prev,
                  messages: [...prev.messages, data.message],
                };
              });
              break;
            }

            case 'chat:message_updated': {
              setCurrentRoom((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  messages: prev.messages.map((m) =>
                    m.id === data.message.id ? data.message : m
                  ),
                };
              });
              break;
            }

            case 'reaction:received': {
              const reaction: FloatingReaction = data.reaction;
              setReactions((prev) => [...prev, reaction]);
              setTimeout(() => {
                setReactions((prev) => prev.filter((r) => r.id !== reaction.id));
              }, 2700);
              break;
            }
          }
        } catch (err) {
          console.error('Failed to parse WS payload:', err);
        }
      };

      socket.onclose = () => {
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
        if (isUnmounted) return;
        setWsConnected(false);
        reconnectTimer = setTimeout(connect, 1800);
      };
    };

    connect();

    return () => {
      isUnmounted = true;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const canControl =
    !currentRoom ||
    currentRoom.controlMode === 'everyone' ||
    currentRoom.hostId === clientId;

  const handleCreateRoom = (options: {
    roomName: string;
    category: string;
    isPublic: boolean;
    controlMode?: RoomControlMode;
    videoUrl: string;
    customUserName?: string;
  }) => {
    const effectiveUser =
      (options.customUserName || userName).trim() || generateRandomNickname();
    sendWsMessage({
      type: 'room:create',
      userName: effectiveUser,
      roomName: options.roomName,
      category: options.category,
      isPublic: options.isPublic,
      controlMode: options.controlMode || 'everyone',
      videoUrl: options.videoUrl,
    });
  };

  const handleJoinRoom = (roomId: string, customUserName?: string) => {
    const effectiveUser = (customUserName || userName).trim() || generateRandomNickname();
    sendWsMessage({
      type: 'room:join',
      roomId: roomId.toUpperCase().trim(),
      userName: effectiveUser,
    });
  };

  const handleLeaveRoom = () => {
    leaveVoice();
    sendWsMessage({ type: 'room:leave' });
    setCurrentRoom(null);
    window.history.replaceState({}, '', window.location.pathname);
  };

  const handleToggleControlMode = (mode: RoomControlMode) => {
    sendWsMessage({
      type: 'room:set_control_mode',
      controlMode: mode,
    });
  };

  const handleSyncAction = useCallback(
    (
      action: 'play' | 'pause' | 'seek' | 'reload_embed',
      mediaTime: number,
      isPlaying: boolean
    ) => {
      sendWsMessage({
        type: 'video:sync',
        action,
        mediaTime,
        isPlaying,
      });
    },
    [sendWsMessage]
  );

  const handleRequestResync = useCallback(() => {
    sendWsMessage({ type: 'video:request_sync' });
  }, [sendWsMessage]);

  const handleVideoEnded = useCallback(
    (mediaUrl: string) => {
      sendWsMessage({ type: 'video:ended', mediaUrl });
    },
    [sendWsMessage]
  );

  const handleLoadNewVideoNow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canControl) {
      setVideoInputError('Host has locked playback controls.');
      return;
    }
    const parsed = parseMediaInput(videoUrlInput);
    if (!parsed) {
      setVideoInputError(
        'Enter a valid YouTube video/playlist, Spotify, SoundCloud, live link, or .m3u8'
      );
      return;
    }
    setVideoInputError(null);
    sendWsMessage({
      type: 'video:sync',
      action: 'change_video',
      mediaUrl: videoUrlInput.trim(),
    });
    setVideoUrlInput('');
  };

  const handleQueueFromTopBar = () => {
    if (!canControl) {
      setVideoInputError('Host has locked queue controls.');
      return;
    }
    const parsed = parseMediaInput(videoUrlInput);
    if (!parsed) {
      setVideoInputError('Enter a valid URL or playlist before adding to queue.');
      return;
    }
    setVideoInputError(null);
    sendWsMessage({
      type: 'queue:add',
      videoUrl: videoUrlInput.trim(),
    });
    setVideoUrlInput('');
  };

  const handleQuickSelectVideo = (
    mediaUrl: string,
    title: string,
    author: string
  ) => {
    if (!canControl) return;
    sendWsMessage({
      type: 'video:sync',
      action: 'change_video',
      mediaUrl,
      videoTitle: title,
      videoAuthor: author,
    });
  };

  const handleCopyRoomInvite = () => {
    if (!currentRoom) return;
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoom.id}`;
    navigator.clipboard.writeText(inviteUrl).catch(() => {});
    setCopiedHeaderInvite(true);
    setTimeout(() => setCopiedHeaderInvite(false), 2000);
    setIsShareModalOpen(true);
  };

  const renderOmnibox = () => {
    if (!currentRoom) {
      return (
        <div className="relative flex items-center bg-[#1f1f1f] hover:bg-[#252525] rounded-full px-4 py-2 sm:py-2.5 shadow-[rgb(18,18,18)_0px_1px_0px,rgb(124,124,124)_0px_0px_0px_1px_inset] focus-within:ring-2 focus-within:ring-white transition-colors w-full">
          <Search className="w-4 h-4 text-[#b3b3b3] shrink-0 mr-2.5" />
          <input
            type="text"
            value={lobbySearch}
            onChange={(e) => setLobbySearch(e.target.value)}
            placeholder="Search active group rooms or stream titles..."
            className="w-full bg-transparent text-[13.5px] sm:text-[14px] text-white placeholder-[#b3b3b3] focus:outline-none"
          />
        </div>
      );
    }

    return (
      <form
        onSubmit={handleLoadNewVideoNow}
        className="flex items-center gap-1.5 bg-[#1f1f1f] rounded-full pl-3.5 pr-1.5 py-1 shadow-[rgb(18,18,18)_0px_1px_0px,rgb(124,124,124)_0px_0px_0px_1px_inset] focus-within:ring-2 focus-within:ring-white w-full"
      >
        {canControl ? (
          <Link2 className="w-4 h-4 text-[#b3b3b3] shrink-0 mr-1.5" />
        ) : (
          <Lock className="w-4 h-4 text-[#ffa42b] shrink-0 mr-1.5" />
        )}
        <input
          type="text"
          disabled={!canControl}
          value={videoUrlInput}
          onChange={(e) => {
            setVideoUrlInput(e.target.value);
            if (videoInputError) setVideoInputError(null);
          }}
          placeholder={
            canControl
              ? 'Paste YouTube video/playlist, Spotify, live URL, or .m3u8...'
              : 'Playback locked by Room Host'
          }
          className="flex-1 bg-transparent text-[13px] text-white placeholder-[#b3b3b3] focus:outline-none min-w-0 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canControl}
          className="px-3.5 sm:px-4 py-1.5 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] disabled:opacity-40 text-black text-[11px] font-bold uppercase tracking-[1.3px] transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          Play
        </button>
        <button
          type="button"
          disabled={!canControl}
          onClick={handleQueueFromTopBar}
          className="px-3 py-1.5 rounded-full bg-[#272727] hover:bg-[#333333] disabled:opacity-40 text-white text-[11px] font-bold uppercase tracking-[1.3px] transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
        >
          <Plus className="w-3 h-3" />
          <span>Queue</span>
        </button>
      </form>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#000000] text-[#ffffff]">
      {/* Responsive Top Global Spotify Header */}
      <header className="px-3 sm:px-4 py-2.5 md:py-0 md:h-16 flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between bg-[#000000] shrink-0">
        <div className="flex items-center justify-between gap-3 w-full md:w-auto">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="/"
            onClick={(e) => {
              if (currentRoom) {
                e.preventDefault();
                handleLeaveRoom();
              }
            }}
            className="flex items-center gap-2 text-[17px] sm:text-[18px] font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            <span className="w-8 h-8 rounded-full bg-[#1ed760] text-black flex items-center justify-center">
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </span>
            <span>SyncCinema</span>
          </a>

          {/* Mobile Right Actions (< md) */}
          <div className="flex md:hidden items-center gap-1.5 shrink-0">
            {currentRoom ? (
              <>
                <button
                  type="button"
                  disabled={
                    currentRoom.controlMode === 'host-only' &&
                    currentRoom.hostId !== clientId
                  }
                  onClick={() =>
                    handleToggleControlMode(
                      currentRoom.controlMode === 'everyone' ? 'host-only' : 'everyone'
                    )
                  }
                  title="Toggle playback permissions between Everyone and Host Only"
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[1px] cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                    currentRoom.controlMode === 'host-only'
                      ? 'bg-[#ffa42b] text-black'
                      : 'bg-[#1f1f1f] text-[#1ed760]'
                  }`}
                >
                  {currentRoom.controlMode === 'host-only' ? (
                    <>
                      <Lock className="w-3 h-3" />
                      <span>Host</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3 h-3" />
                      <span>All</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={inVoice ? toggleMute : joinVoice}
                  title={inVoice ? 'Mute / Unmute Mic' : 'Join P2P Voice Chat'}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[1.1px] cursor-pointer whitespace-nowrap ${
                    inVoice
                      ? isMuted
                        ? 'bg-[#f3727f] text-black'
                        : 'bg-[#1f1f1f] text-[#1ed760] ring-1 ring-[#1ed760]'
                      : 'bg-[#1f1f1f] text-white'
                  }`}
                >
                  {inVoice && isMuted ? (
                    <MicOff className="w-3.5 h-3.5" />
                  ) : (
                    <Mic className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCopyRoomInvite}
                  className="px-3 py-1.5 rounded-full bg-[#1ed760] text-black text-[11px] font-bold uppercase tracking-[1.1px] cursor-pointer flex items-center gap-1 whitespace-nowrap"
                >
                  {copiedHeaderInvite ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3 h-3" />
                      <span>{currentRoom.id}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleLeaveRoom}
                  title="Leave room"
                  className="p-2 rounded-full bg-[#1f1f1f] text-white cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const firstPublic = publicRooms[0];
                  if (firstPublic) {
                    handleJoinRoom(firstPublic.id);
                  } else {
                    handleCreateRoom({
                      roomName: `${userName.trim() || 'Guest'}'s Room`,
                      category: 'Short Films',
                      isPublic: true,
                      videoUrl: CURATED_VIDEOS[1].mediaUrl,
                    });
                  }
                }}
                className="px-4 py-1.5 rounded-full bg-[#1ed760] text-black text-[11px] font-bold uppercase tracking-[1.2px] cursor-pointer whitespace-nowrap"
              >
                Quick Join
              </button>
            )}
          </div>
        </div>

        {/* Zone 2: Central Pill Omnibox (Desktop inline, Mobile full-width second row) */}
        <div className="w-full md:flex-1 md:max-w-2xl md:mx-auto">
          {renderOmnibox()}
        </div>

        {/* Zone 3: Desktop Right Actions (md+) */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {currentRoom ? (
            <>
              <button
                type="button"
                disabled={
                  currentRoom.controlMode === 'host-only' &&
                  currentRoom.hostId !== clientId
                }
                onClick={() =>
                  handleToggleControlMode(
                    currentRoom.controlMode === 'everyone' ? 'host-only' : 'everyone'
                  )
                }
                title="Click to switch between Everyone Controls and Host Only"
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-bold uppercase tracking-[1.3px] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                  currentRoom.controlMode === 'host-only'
                    ? 'bg-[#ffa42b] text-black hover:bg-[#ffb44c]'
                    : 'bg-[#1f1f1f] hover:bg-[#272727] text-[#1ed760]'
                }`}
              >
                {currentRoom.controlMode === 'host-only' ? (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Host Only</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Everyone</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={inVoice ? toggleMute : joinVoice}
                title={inVoice ? 'Mute / Unmute Mic' : 'Join P2P Voice Chat'}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-bold uppercase tracking-[1.4px] transition-colors cursor-pointer whitespace-nowrap ${
                  inVoice
                    ? isMuted
                      ? 'bg-[#f3727f] text-black'
                      : 'bg-[#1f1f1f] text-[#1ed760] ring-1 ring-[#1ed760]'
                    : 'bg-[#1f1f1f] hover:bg-[#272727] text-white'
                }`}
              >
                {inVoice && isMuted ? (
                  <>
                    <MicOff className="w-3.5 h-3.5" />
                    <span>Muted</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5" />
                    <span>{inVoice ? 'Voice On' : 'Voice'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCopyRoomInvite}
                className="px-4 py-2 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] text-black text-[12px] font-bold uppercase tracking-[1.4px] transition-transform hover:scale-105 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                {copiedHeaderInvite ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Invite · {currentRoom.id}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleLeaveRoom}
                title="Leave room"
                className="px-3.5 py-2 rounded-full bg-[#1f1f1f] hover:bg-[#272727] text-white text-[12px] font-bold uppercase tracking-[1.4px] transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Leave</span>
              </button>
            </>
          ) : (
            <>
              <span className="hidden lg:inline text-[12px] font-bold text-[#b3b3b3] whitespace-nowrap">
                {wsConnected ? userName : 'Connecting...'}
              </span>
              <button
                type="button"
                onClick={() => {
                  const firstPublic = publicRooms[0];
                  if (firstPublic) {
                    handleJoinRoom(firstPublic.id);
                  } else {
                    handleCreateRoom({
                      roomName: `${userName.trim() || 'Guest'}'s Room`,
                      category: 'Short Films',
                      isPublic: true,
                      videoUrl: CURATED_VIDEOS[1].mediaUrl,
                    });
                  }
                }}
                className="px-5 py-2 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] text-black text-[12px] font-bold uppercase tracking-[1.4px] transition-transform hover:scale-105 cursor-pointer whitespace-nowrap"
              >
                Quick Join
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      {!currentRoom ? (
        <LobbyView
          userName={userName}
          onUserNameChange={handleUserNameChange}
          publicRooms={publicRooms}
          searchQuery={lobbySearch}
          joinError={joinError}
          onClearError={() => setJoinError(null)}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
        />
      ) : (
        <main className="flex-1 flex flex-col lg:flex-row gap-2 px-2 pb-2 min-h-0 items-stretch lg:items-start">
          {/* Left Stage Container (#121212) */}
          <div className="flex-1 w-full min-w-0 bg-[#121212] rounded-lg p-3 sm:p-4 space-y-3 sm:space-y-4">
            {videoInputError && (
              <p className="text-[12px] text-[#f3727f] px-2">{videoInputError}</p>
            )}

            {/* Quick-Switch Stream Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {CURATED_VIDEOS.map((vid) => {
                const isCurrent =
                  currentRoom.playback.mediaUrl === vid.mediaUrl ||
                  (vid.sourceType === 'youtube' &&
                    currentRoom.playback.videoId === vid.videoId);
                return (
                  <button
                    key={vid.mediaUrl}
                    type="button"
                    disabled={!canControl}
                    onClick={() =>
                      handleQuickSelectVideo(vid.mediaUrl, vid.title, vid.author)
                    }
                    className={`px-3 sm:px-3.5 py-1.5 rounded-full text-[11.5px] sm:text-[12px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-45 ${
                      isCurrent
                        ? 'bg-[#1ed760] text-black'
                        : 'bg-[#1f1f1f] text-[#b3b3b3] hover:text-white hover:bg-[#272727]'
                    }`}
                  >
                    {vid.title.split('—')[0].trim()}
                  </button>
                );
              })}
            </div>

            {/* Synchronized Player & Spotify Now-Playing Bar */}
            <YouTubeSyncPlayer
              playback={currentRoom.playback}
              reactions={reactions}
              hasNextInQueue={currentRoom.queue.length > 0 && canControl}
              onSyncAction={handleSyncAction}
              onRequestResync={handleRequestResync}
              onVideoEnded={handleVideoEnded}
              onSendReaction={(emoji) =>
                sendWsMessage({ type: 'reaction:send', emoji })
              }
              onPlayNextInQueue={() => {
                if (currentRoom.queue.length > 0 && canControl) {
                  sendWsMessage({
                    type: 'queue:play_now',
                    itemId: currentRoom.queue[0].id,
                  });
                }
              }}
              onClientPlaylistResolved={(playlistId, videoIds) => {
                sendWsMessage({
                  type: 'playlist:client_resolved',
                  playlistId,
                  videoIds,
                });
              }}
            />
          </div>

          {/* Right Sidebar (#121212) */}
          <StudioSidebar
            roomId={currentRoom.id}
            clientId={clientId}
            userName={userName}
            hostId={currentRoom.hostId}
            controlMode={currentRoom.controlMode}
            canControl={canControl}
            inVoice={inVoice}
            isMuted={isMuted}
            voiceError={voiceError}
            messages={currentRoom.messages}
            queue={currentRoom.queue}
            participants={currentRoom.participants}
            onOpenShareModal={() => setIsShareModalOpen(true)}
            onJoinVoice={joinVoice}
            onLeaveVoice={leaveVoice}
            onToggleMute={toggleMute}
            onToggleControlMode={handleToggleControlMode}
            onSendMessage={(text: string, replyTo?: ChatReplyReference) =>
              sendWsMessage({
                type: 'chat:send',
                id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                text,
                replyTo,
              })
            }
            onReactToMessage={(messageId: string, emoji: string) =>
              sendWsMessage({
                type: 'chat:react',
                messageId,
                emoji,
              })
            }
            onUpdateUserName={handleUserNameChange}
            onAddToQueue={(videoUrl, title, author) =>
              sendWsMessage({
                type: 'queue:add',
                id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                videoUrl,
                title,
                author,
              })
            }
            onRemoveFromQueue={(itemId) =>
              sendWsMessage({ type: 'queue:remove', itemId })
            }
            onClearQueue={() => sendWsMessage({ type: 'queue:clear' })}
            onPlayQueueItemNow={(itemId) =>
              sendWsMessage({ type: 'queue:play_now', itemId })
            }
            onMoveQueueItem={(itemId, direction) =>
              sendWsMessage({ type: 'queue:move', itemId, direction })
            }
          />
        </main>
      )}

      {currentRoom && (
        <ShareRoomModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          roomId={currentRoom.id}
          roomName={currentRoom.name}
        />
      )}
    </div>
  );
}
