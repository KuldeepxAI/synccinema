import React, { useState } from 'react';
import {
  Play,
  Users,
  Lock,
  Globe,
  Radio,
  Film,
  Music,
  Shuffle,
  X,
  PlusCircle,
  Compass,
  Tv,
} from 'lucide-react';
import {
  PublicRoomSummary,
  MediaSourceType,
  RoomControlMode,
  CURATED_VIDEOS,
  parseMediaInput,
  getYouTubeThumbnail,
  generateRandomNickname,
} from '../types';

interface LobbyViewProps {
  userName: string;
  onUserNameChange: (name: string) => void;
  publicRooms: PublicRoomSummary[];
  searchQuery: string;
  joinError: string | null;
  onClearError: () => void;
  onCreateRoom: (options: {
    roomName: string;
    category: string;
    isPublic: boolean;
    controlMode?: RoomControlMode;
    videoUrl: string;
    customUserName?: string;
  }) => void;
  onJoinRoom: (roomId: string, customUserName?: string) => void;
}

const ROOM_CATEGORIES = [
  'All',
  'Live Sports',
  'Music & Chill',
  'Short Films',
  'Watch Party',
];

/**
 * Smart media cover that detects broken YouTube thumbnails (including YouTube's
 * 120x90 grey [...] placeholder) and renders rich visual artwork for Live Web,
 * Music, HLS, and fallback streams.
 */
const MediaCover: React.FC<{
  sourceType: MediaSourceType;
  videoId: string;
  title: string;
  category?: string;
  compact?: boolean;
}> = ({ sourceType, videoId, title, category, compact = false }) => {
  const [imgFailed, setImgFailed] = useState(false);

  const canTryYouTubeThumb =
    sourceType === 'youtube' &&
    /^[a-zA-Z0-9_-]{11}$/.test(videoId) &&
    !imgFailed;

  if (canTryYouTubeThumb) {
    return (
      <img
        src={getYouTubeThumbnail(videoId)}
        alt={title}
        referrerPolicy="no-referrer"
        onLoad={(e) => {
          // YouTube's grey [...] placeholder image is always 120px wide
          if (e.currentTarget.naturalWidth <= 120) {
            setImgFailed(true);
          }
        }}
        onError={() => setImgFailed(true)}
        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
      />
    );
  }

  if (compact) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-[#1ed760]/25 via-[#181818] to-[#121212] flex items-center justify-center text-[#1ed760]">
        {sourceType === 'music-embed' || sourceType === 'direct-audio' ? (
          <Music className="w-4 h-4" />
        ) : sourceType === 'embed-web' ? (
          <Tv className="w-4 h-4" />
        ) : (
          <Film className="w-4 h-4" />
        )}
      </div>
    );
  }

  // Full 16:9 Card Cover for Live Sports / Music / Fallback
  const isSports =
    category === 'Live Sports' ||
    title.toLowerCase().includes('cricket') ||
    title.toLowerCase().includes('sony');
  const isMusic =
    sourceType === 'music-embed' ||
    sourceType === 'direct-audio' ||
    category === 'Music & Chill';

  return (
    <div
      className={`w-full h-full relative overflow-hidden flex flex-col justify-between p-3.5 ${
        isSports
          ? 'bg-gradient-to-br from-[#0d3b26] via-[#12241c] to-[#121212]'
          : isMusic
          ? 'bg-gradient-to-br from-[#1b3826] via-[#181818] to-[#121212]'
          : 'bg-gradient-to-br from-[#242424] via-[#181818] to-[#121212]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/50 text-[#1ed760] text-[10px] font-bold uppercase tracking-[1.3px]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1ed760] animate-pulse" />
          {isSports ? 'Live Sports TV' : isMusic ? 'Music Stage' : 'HD Stream'}
        </span>
      </div>

      <div className="my-auto flex flex-col items-center justify-center text-center px-2">
        <div className="w-11 h-11 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-[#1ed760] mb-1.5">
          {isSports ? (
            <Radio className="w-5 h-5" />
          ) : isMusic ? (
            <Music className="w-5 h-5" />
          ) : (
            <Film className="w-5 h-5" />
          )}
        </div>
        <p className="text-[12px] font-bold text-white/90 line-clamp-1">
          {title}
        </p>
      </div>

      <div className="text-[10px] text-[#b3b3b3] truncate">
        {isSports ? 'Interactive Web Broadcast' : 'Synchronized Watch Stage'}
      </div>
    </div>
  );
};

export const LobbyView: React.FC<LobbyViewProps> = ({
  userName,
  onUserNameChange,
  publicRooms,
  searchQuery,
  joinError,
  onClearError,
  onCreateRoom,
  onJoinRoom,
}) => {
  const [mobileSection, setMobileSection] = useState<'explore' | 'create'>('explore');

  const [roomName, setRoomName] = useState('');
  const [category, setCategory] = useState('Short Films');
  const [isPublic, setIsPublic] = useState(true);
  const [controlMode, setControlMode] = useState<RoomControlMode>('everyone');
  const [starterVideoUrl, setStarterVideoUrl] = useState(CURATED_VIDEOS[1].mediaUrl);
  const [urlValidationError, setUrlValidationError] = useState<string | null>(null);

  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');

  const [pendingAction, setPendingAction] = useState<
    | { type: 'join'; roomId: string; roomTitle: string }
    | {
        type: 'create';
        roomName: string;
        category: string;
        isPublic: boolean;
        videoUrl: string;
      }
    | null
  >(null);
  const [modalNameDraft, setModalNameDraft] = useState(userName);

  const openJoinPrompt = (roomId: string, roomTitle: string) => {
    setModalNameDraft(userName);
    setPendingAction({ type: 'join', roomId, roomTitle });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseMediaInput(starterVideoUrl);
    if (!parsed) {
      setUrlValidationError(
        'Enter a valid YouTube video/playlist, Spotify, SoundCloud, live stream, or .m3u8 URL.'
      );
      return;
    }
    setUrlValidationError(null);
    const cleanName = userName.trim() || generateRandomNickname();
    if (cleanName !== userName) onUserNameChange(cleanName);

    const effectiveName = roomName.trim() || `${cleanName}'s Room`;
    onCreateRoom({
      roomName: effectiveName,
      category,
      isPublic,
      controlMode,
      videoUrl: starterVideoUrl.trim(),
      customUserName: cleanName,
    });
  };

  const handleJoinByCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinCodeInput.toUpperCase().trim();
    if (!cleanCode) return;
    const cleanName = userName.trim() || generateRandomNickname();
    if (cleanName !== userName) onUserNameChange(cleanName);
    onJoinRoom(cleanCode, cleanName);
  };

  const handleConfirmPendingAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingAction) return;
    const finalName = modalNameDraft.trim() || generateRandomNickname();
    onUserNameChange(finalName);

    if (pendingAction.type === 'join') {
      onJoinRoom(pendingAction.roomId, finalName);
    } else {
      onCreateRoom({
        roomName: pendingAction.roomName || `${finalName}'s Room`,
        category: pendingAction.category,
        isPublic: pendingAction.isPublic,
        videoUrl: pendingAction.videoUrl,
        customUserName: finalName,
      });
    }
    setPendingAction(null);
  };

  const filteredRooms = publicRooms.filter((r) => {
    const matchesCategory =
      selectedCategoryFilter === 'All' || r.category === selectedCategoryFilter;
    const matchesQuery =
      !searchQuery.trim() ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.videoTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-2 px-2 pb-3 min-h-0">
      {/* Mobile / Tablet Navigation Switcher (< lg) so mobile users see rooms immediately */}
      <div className="flex lg:hidden items-center justify-between gap-2 bg-[#121212] p-2 rounded-lg">
        <button
          type="button"
          onClick={() => setMobileSection('explore')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-full text-[13px] font-bold transition-colors cursor-pointer ${
            mobileSection === 'explore'
              ? 'bg-[#1ed760] text-black'
              : 'bg-[#1f1f1f] text-[#b3b3b3] hover:text-white'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>Explore Rooms ({publicRooms.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileSection('create')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-full text-[13px] font-bold transition-colors cursor-pointer ${
            mobileSection === 'create'
              ? 'bg-[#1ed760] text-black'
              : 'bg-[#1f1f1f] text-[#b3b3b3] hover:text-white'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          <span>Create / Profile</span>
        </button>
      </div>

      {/* Left Sidebar Panel (#121212): Visible on Desktop always, or on Mobile when 'create' tab is selected */}
      <aside
        id="create-room-panel"
        className={`${
          mobileSection === 'create' ? 'flex' : 'hidden lg:flex'
        } w-full lg:w-[320px] xl:w-[350px] shrink-0 bg-[#121212] rounded-lg p-4 sm:p-5 flex-col justify-between gap-6`}
      >
        <div className="space-y-6">
          {/* Identity & Join by Code */}
          <div className="space-y-4">
            <h2 className="text-[18px] font-bold text-white tracking-tight">
              Your Profile & Code
            </h2>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="guest-nickname"
                  className="block text-[12px] font-bold text-[#b3b3b3]"
                >
                  Your Display Name
                </label>
                <button
                  type="button"
                  onClick={() => onUserNameChange(generateRandomNickname())}
                  className="flex items-center gap-1 text-[11px] font-bold text-[#1ed760] hover:underline cursor-pointer"
                  title="Generate a random nickname"
                >
                  <Shuffle className="w-3 h-3" />
                  <span>Randomize</span>
                </button>
              </div>
              <input
                id="guest-nickname"
                type="text"
                value={userName}
                onChange={(e) => onUserNameChange(e.target.value)}
                placeholder="Choose your nickname..."
                maxLength={24}
                className="w-full bg-[#1f1f1f] text-white text-[14px] rounded-full px-4 py-2.5 shadow-[rgb(18,18,18)_0px_1px_0px,rgb(124,124,124)_0px_0px_0px_1px_inset] focus:outline-none focus:ring-2 focus:ring-white placeholder-[#b3b3b3]"
              />
            </div>

            <form onSubmit={handleJoinByCodeSubmit} className="space-y-1.5">
              <label
                htmlFor="room-code-input"
                className="block text-[12px] font-bold text-[#b3b3b3]"
              >
                Join with Room Code
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="room-code-input"
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => {
                    setJoinCodeInput(e.target.value.toUpperCase());
                    if (joinError) onClearError();
                  }}
                  placeholder="CINE4K"
                  maxLength={8}
                  className="flex-1 bg-[#1f1f1f] text-white text-[14px] font-mono-tabular uppercase rounded-full px-4 py-2.5 shadow-[rgb(18,18,18)_0px_1px_0px,rgb(124,124,124)_0px_0px_0px_1px_inset] focus:outline-none focus:ring-2 focus:ring-white placeholder-[#b3b3b3]"
                />
                <button
                  type="submit"
                  disabled={!joinCodeInput.trim()}
                  className="px-5 py-2.5 rounded-full border border-[#7c7c7c] hover:border-white disabled:opacity-40 text-white text-[12px] font-bold uppercase tracking-[1.4px] transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  Join
                </button>
              </div>
            </form>

            {joinError && (
              <div className="p-3 rounded-md bg-[#252525] text-[#f3727f] text-[12px] flex items-center justify-between gap-2">
                <span>{joinError}</span>
                <button
                  type="button"
                  onClick={onClearError}
                  className="text-white font-bold underline cursor-pointer shrink-0"
                >
                  Close
                </button>
              </div>
            )}
          </div>

          <div className="h-[1px] bg-[#252525]" />

          {/* Create New Room Form */}
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <h2 className="text-[18px] font-bold text-white tracking-tight">
              Create a Watch Room
            </h2>

            <div className="space-y-1.5">
              <label
                htmlFor="create-room-name"
                className="block text-[12px] font-bold text-[#b3b3b3]"
              >
                Room Name
              </label>
              <input
                id="create-room-name"
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder={`${userName.trim() || 'Guest'}'s Room`}
                maxLength={44}
                className="w-full bg-[#1f1f1f] text-white text-[14px] rounded-full px-4 py-2.5 shadow-[rgb(18,18,18)_0px_1px_0px,rgb(124,124,124)_0px_0px_0px_1px_inset] focus:outline-none focus:ring-2 focus:ring-white placeholder-[#b3b3b3]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="starter-stream-url"
                className="block text-[12px] font-bold text-[#b3b3b3]"
              >
                Stream, Playlist, or Music Link
              </label>
              <input
                id="starter-stream-url"
                type="text"
                value={starterVideoUrl}
                onChange={(e) => {
                  setStarterVideoUrl(e.target.value);
                  if (urlValidationError) setUrlValidationError(null);
                }}
                placeholder="YouTube video/playlist, Spotify, or live URL..."
                className="w-full bg-[#1f1f1f] text-white text-[14px] rounded-full px-4 py-2.5 shadow-[rgb(18,18,18)_0px_1px_0px,rgb(124,124,124)_0px_0px_0px_1px_inset] focus:outline-none focus:ring-2 focus:ring-white placeholder-[#b3b3b3]"
              />
              {urlValidationError && (
                <p className="text-[12px] text-[#f3727f] pl-2">{urlValidationError}</p>
              )}
            </div>

            {/* Category Selector */}
            <div className="space-y-1.5">
              <span className="block text-[12px] font-bold text-[#b3b3b3]">
                Category
              </span>
              <div className="flex flex-wrap gap-1.5">
                {ROOM_CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                      category === cat
                        ? 'bg-[#1ed760] text-black'
                        : 'bg-[#1f1f1f] text-[#b3b3b3] hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Playback Control Mode Pills (Everyone vs Host Only) */}
            <div className="space-y-1.5">
              <span className="block text-[12px] font-bold text-[#b3b3b3]">
                Playback Control
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setControlMode('everyone')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-[12px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    controlMode === 'everyone'
                      ? 'bg-[#1ed760] text-black'
                      : 'bg-[#1f1f1f] text-[#b3b3b3] hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Everyone</span>
                </button>
                <button
                  type="button"
                  onClick={() => setControlMode('host-only')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-[12px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    controlMode === 'host-only'
                      ? 'bg-white text-black'
                      : 'bg-[#1f1f1f] text-[#b3b3b3] hover:text-white'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Host Only</span>
                </button>
              </div>
            </div>

            {/* Room Visibility Pills */}
            <div className="space-y-1.5">
              <span className="block text-[12px] font-bold text-[#b3b3b3]">
                Privacy
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-[12px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    isPublic
                      ? 'bg-white text-black'
                      : 'bg-[#1f1f1f] text-[#b3b3b3] hover:text-white'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Public Group</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-[12px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    !isPublic
                      ? 'bg-white text-black'
                      : 'bg-[#1f1f1f] text-[#b3b3b3] hover:text-white'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Private Code</span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-6 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] hover:scale-[1.02] active:scale-[0.99] text-black text-[13px] font-bold uppercase tracking-[1.5px] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[rgba(0,0,0,0.3)_0px_8px_8px]"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Watch Party</span>
            </button>
          </form>
        </div>

        <p className="text-[12px] text-[#b3b3b3] leading-relaxed">
          Supports YouTube videos & playlists (auto-queues all tracks), Spotify, SoundCloud, Apple Music, HLS (.m3u8), MP4/MP3, and live web streams.
        </p>
      </aside>

      {/* Right Main Content Viewport (#121212): Visible on Desktop always, or on Mobile when 'explore' tab is active */}
      <div
        id="group-rooms-directory"
        className={`${
          mobileSection === 'explore' ? 'flex' : 'hidden lg:flex'
        } flex-1 flex-col bg-[#121212] rounded-lg p-4 sm:p-6 overflow-y-auto space-y-6 sm:space-y-8`}
      >
        {/* Mobile Quick Code Entry Bar (visible only on < lg so mobile users can enter a code without switching tabs) */}
        <form
          onSubmit={handleJoinByCodeSubmit}
          className="flex lg:hidden items-center gap-2 bg-[#181818] p-2.5 rounded-xl"
        >
          <input
            type="text"
            value={joinCodeInput}
            onChange={(e) => {
              setJoinCodeInput(e.target.value.toUpperCase());
              if (joinError) onClearError();
            }}
            placeholder="Have a room code? (e.g. CINE4K)"
            maxLength={8}
            className="flex-1 min-w-0 bg-[#1f1f1f] text-white text-[13px] font-mono-tabular uppercase rounded-full px-3.5 py-2 focus:outline-none focus:ring-1 focus:ring-white placeholder-[#b3b3b3]"
          />
          <button
            type="submit"
            disabled={!joinCodeInput.trim()}
            className="px-4 py-2 rounded-full bg-white disabled:opacity-40 text-black text-[12px] font-bold uppercase tracking-[1.2px] cursor-pointer shrink-0"
          >
            Join Code
          </button>
        </form>

        {joinError && (
          <div className="flex lg:hidden p-3 rounded-md bg-[#252525] text-[#f3727f] text-[12px] items-center justify-between gap-2">
            <span>{joinError}</span>
            <button
              type="button"
              onClick={onClearError}
              className="text-white font-bold underline cursor-pointer shrink-0"
            >
              Close
            </button>
          </div>
        )}

        {/* Top Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {ROOM_CATEGORIES.map((cat) => {
            const active = selectedCategoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategoryFilter(cat)}
                className={`px-4 py-1.5 rounded-full text-[13px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-black'
                    : 'bg-[#1f1f1f] text-white hover:bg-[#272727]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Section 1: Active Group Rooms (Spotify Card Grid) */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="text-[20px] sm:text-[24px] font-bold text-white tracking-tight">
              Live Group Rooms
            </h1>
            <span className="text-[12px] font-bold text-[#b3b3b3] uppercase tracking-[1.4px] shrink-0">
              {filteredRooms.length} Active
            </span>
          </div>

          {filteredRooms.length === 0 ? (
            <div className="bg-[#181818] rounded-lg p-8 sm:p-10 text-center space-y-3">
              <p className="text-[16px] font-bold text-white">No rooms match your filter</p>
              <p className="text-[14px] text-[#b3b3b3]">
                Try another category or start a new watch party room.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategoryFilter('All');
                  setMobileSection('create');
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#1ed760] text-black text-[12px] font-bold uppercase tracking-[1.4px] cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Create Room</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {filteredRooms.map((room) => (
                <div
                  key={room.id}
                  onClick={() => openJoinPrompt(room.id, room.name)}
                  className="group bg-[#181818] hover:bg-[#252525] p-3.5 sm:p-4 rounded-lg transition-colors duration-200 cursor-pointer flex flex-col justify-between shadow-[rgba(0,0,0,0.3)_0px_8px_8px]"
                >
                  <div>
                    <div className="relative w-full aspect-video rounded-md overflow-hidden bg-[#121212] mb-3.5 shadow-[rgba(0,0,0,0.5)_0px_8px_24px]">
                      <MediaCover
                        sourceType={room.sourceType}
                        videoId={room.videoId}
                        title={room.videoTitle}
                        category={room.category}
                      />

                      <button
                        type="button"
                        aria-label={`Join ${room.name}`}
                        className="absolute bottom-2.5 right-2.5 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] hover:scale-105 text-black flex items-center justify-center shadow-[rgba(0,0,0,0.5)_0px_8px_24px] opacity-95 group-hover:opacity-100 transition-all cursor-pointer"
                      >
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </button>
                    </div>

                    <h3 className="text-[15px] sm:text-[16px] font-bold text-white truncate">
                      {room.name}
                    </h3>
                    <p className="text-[13px] sm:text-[14px] text-[#b3b3b3] truncate mt-0.5">
                      {room.videoTitle}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-[12px] text-[#b3b3b3] mt-3 pt-2.5 border-t border-[#272727]">
                    <span className="font-mono-tabular font-bold text-white">
                      {room.id}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{room.category}</span>
                    <span className="font-mono-tabular flex items-center gap-1 ml-auto shrink-0">
                      <Users className="w-3.5 h-3.5" />
                      {room.participantCount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: Instant Start Channels (Spotify Playlist Tracklist Style) */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[18px] font-bold text-white tracking-tight">
              Instant Launch Streams & Playlists
            </h2>
            <span className="text-[11px] font-bold text-[#b3b3b3] uppercase tracking-[1.3px] hidden sm:inline">
              1-Click Room Launch
            </span>
          </div>

          <div className="bg-[#181818] rounded-lg overflow-hidden divide-y divide-[#222222]">
            {CURATED_VIDEOS.map((vid, index) => (
              <div
                key={vid.mediaUrl}
                onClick={() => {
                  setModalNameDraft(userName);
                  setPendingAction({
                    type: 'create',
                    roomName: `${vid.category} Watch Party`,
                    category: vid.category,
                    isPublic: true,
                    videoUrl: vid.mediaUrl,
                  });
                }}
                className="group flex items-center justify-between gap-3 sm:gap-4 px-3 sm:px-4 py-3 hover:bg-[#252525] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <span className="w-5 text-center font-mono-tabular text-[13px] text-[#b3b3b3] group-hover:hidden shrink-0">
                    {index + 1}
                  </span>
                  <span className="w-5 hidden group-hover:flex items-center justify-center text-[#1ed760] shrink-0">
                    <Play className="w-4 h-4 fill-current" />
                  </span>

                  <div className="w-11 h-11 rounded bg-[#1f1f1f] overflow-hidden shrink-0 flex items-center justify-center">
                    <MediaCover
                      sourceType={vid.sourceType}
                      videoId={vid.videoId}
                      title={vid.title}
                      category={vid.category}
                      compact
                    />
                  </div>

                  <div className="min-w-0">
                    <p className="text-[13.5px] sm:text-[14px] font-bold text-white truncate">
                      {vid.title}
                    </p>
                    <p className="text-[12px] text-[#b3b3b3] truncate">
                      {vid.author} · {vid.category}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                  <span className="font-mono-tabular text-[11px] text-[#b3b3b3] hidden md:inline">
                    {vid.durationLabel}
                  </span>
                  <span className="px-3.5 sm:px-4 py-1.5 rounded-full bg-[#1f1f1f] group-hover:bg-[#1ed760] group-hover:text-black text-white text-[11px] font-bold uppercase tracking-[1.4px] transition-colors">
                    Launch
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Quick Nickname Confirm / Customize Dialog on Join or Launch */}
      {pendingAction && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          onClick={() => setPendingAction(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleConfirmPendingAction}
            className="w-full max-w-md bg-[#181818] rounded-xl p-5 sm:p-6 space-y-5 shadow-[rgba(0,0,0,0.5)_0px_8px_24px]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-[18px] sm:text-[20px] font-bold text-white truncate">
                  {pendingAction.type === 'join'
                    ? `Join ${pendingAction.roomTitle}`
                    : `Start ${pendingAction.roomName}`}
                </h3>
                <p className="text-[13px] text-[#b3b3b3] mt-0.5">
                  Choose or randomize the display name others will see in chat.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="w-8 h-8 rounded-full hover:bg-[#252525] text-[#b3b3b3] hover:text-white flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="modal-nickname-input"
                  className="text-[12px] font-bold text-[#b3b3b3]"
                >
                  Your Display Name
                </label>
                <button
                  type="button"
                  onClick={() => setModalNameDraft(generateRandomNickname())}
                  className="flex items-center gap-1 text-[12px] font-bold text-[#1ed760] hover:underline cursor-pointer"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>Randomize</span>
                </button>
              </div>

              <input
                id="modal-nickname-input"
                type="text"
                autoFocus
                value={modalNameDraft}
                onChange={(e) => setModalNameDraft(e.target.value)}
                placeholder="Enter your name..."
                maxLength={24}
                className="w-full bg-[#1f1f1f] text-white text-[15px] rounded-full px-4 py-3 shadow-[rgb(18,18,18)_0px_1px_0px,rgb(124,124,124)_0px_0px_0px_1px_inset] focus:outline-none focus:ring-2 focus:ring-white placeholder-[#b3b3b3]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="px-4 sm:px-5 py-2.5 rounded-full bg-transparent hover:bg-[#252525] text-white text-[12px] font-bold uppercase tracking-[1.4px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 sm:px-6 py-2.5 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] text-black text-[12px] font-bold uppercase tracking-[1.4px] cursor-pointer flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {pendingAction.type === 'join' ? 'Enter Room' : 'Launch Room'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
