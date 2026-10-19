import { APP_CONFIG } from './config.ts';

export type MediaSourceType =
  | 'youtube'
  | 'hls'
  | 'direct-video'
  | 'direct-audio'
  | 'music-embed'
  | 'embed-web';

export type RoomControlMode = 'everyone' | 'host-only';

export interface ParsedMediaInput {
  sourceType: MediaSourceType;
  mediaUrl: string;
  videoId: string;
  displayHost: string;
  suggestedTitle: string;
  playlistId?: string;
  originalUrl?: string;
}

export interface PlaybackState {
  sourceType: MediaSourceType;
  mediaUrl: string;
  videoId: string;
  playlistId?: string;
  videoTitle: string;
  videoAuthor: string;
  isPlaying: boolean;
  mediaTime: number;
  lastUpdatedAt: number;
  updatedBy: string;
  actionSummary: string;
  reloadNonce?: number;
  thumbnailUrl?: string;
}

export interface QueueItem {
  id: string;
  sourceType: MediaSourceType;
  mediaUrl: string;
  videoId: string;
  title: string;
  author: string;
  addedBy: string;
  addedAt: number;
  thumbnailUrl?: string;
}

export interface Participant {
  id: string;
  name: string;
  color: string;
  joinedAt: number;
  inVoice?: boolean;
  isMuted?: boolean;
}

export interface ChatReplyReference {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
  timestamp: number;
  type: 'user' | 'system';
  replyTo?: ChatReplyReference;
  reactions?: Record<string, string[]>;
}

export interface RoomState {
  id: string;
  name: string;
  category: string;
  isPublic: boolean;
  hostId: string;
  controlMode: RoomControlMode;
  createdAt: number;
  playback: PlaybackState;
  queue: QueueItem[];
  participants: Participant[];
  messages: ChatMessage[];
}

export interface PublicRoomSummary {
  id: string;
  name: string;
  category: string;
  participantCount: number;
  participantsPreview: { name: string; color: string }[];
  sourceType: MediaSourceType;
  mediaUrl: string;
  videoId: string;
  videoTitle: string;
  isPlaying: boolean;
  controlMode: RoomControlMode;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  senderName: string;
  offsetX: number;
  createdAt: number;
}

export const REACTION_EMOJIS = ['❤️', '😂', '🔥', '👏', '😮', '🎉'] as const;
export const ROOM_CATEGORIES = APP_CONFIG.categories;

const ADJECTIVES = [
  'Cosmic',
  'Neon',
  'Velvet',
  'Lunar',
  'Sonic',
  'Midnight',
  'Pixel',
  'Solar',
  'Electric',
  'Crystal',
  'Nova',
  'Shadow',
];

const NOUNS = [
  'Falcon',
  'Panda',
  'Voyager',
  'Phoenix',
  'Tiger',
  'Comet',
  'Lynx',
  'Wolf',
  'Raven',
  'Drifter',
  'Rider',
  'Echo',
];

export function generateRandomNickname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(10 + Math.random() * 89);
  return `${adj}${noun}${num}`;
}

export interface CuratedVideo {
  sourceType: MediaSourceType;
  mediaUrl: string;
  videoId: string;
  title: string;
  author: string;
  category: string;
  durationLabel: string;
}

export const DEFAULT_FALLBACK_VIDEO_ID = 'WhWc3b3KhnY';

export const CURATED_VIDEOS: CuratedVideo[] = [
  {
    sourceType: 'embed-web',
    mediaUrl: 'https://allrounder3-0.pages.dev/cricket/sony-3',
    videoId: 'sony-3',
    title: 'Sony Ten 3 — Live Cricket Broadcast',
    author: 'allrounder3-0.pages.dev',
    category: 'Live Sports',
    durationLabel: 'LIVE TV',
  },
  {
    sourceType: 'youtube',
    mediaUrl: 'WhWc3b3KhnY',
    videoId: 'WhWc3b3KhnY',
    title: 'Spring — Blender 4K Animated Short Film',
    author: 'Blender Studio',
    category: 'Short Films',
    durationLabel: '07:44',
  },
  {
    sourceType: 'youtube',
    mediaUrl: 'LXb3EKWsInQ',
    videoId: 'LXb3EKWsInQ',
    title: 'Costa Rica in 4K 60fps HDR — Scenic Chill Lounge',
    author: 'Jacob + Katie Schwarz',
    category: 'Music & Chill',
    durationLabel: '05:14',
  },
  {
    sourceType: 'youtube',
    mediaUrl: 'mN0zPOpADL4',
    videoId: 'mN0zPOpADL4',
    title: 'Agent 327: Operation Barbershop — Action Short',
    author: 'Blender Studio',
    category: 'Watch Party',
    durationLabel: '03:51',
  },
  {
    sourceType: 'youtube',
    mediaUrl: 'https://www.youtube.com/playlist?list=PLbpi6ZahtOH6Ar_3GPy3workty8I7Z4B5',
    videoId: '_cMxraX_5RE',
    title: 'Blender Open Movies Playlist (Auto-Queues All Films)',
    author: 'Blender Foundation',
    category: 'Short Films',
    durationLabel: 'YT PLAYLIST',
  },
  {
    sourceType: 'music-embed',
    mediaUrl:
      'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator&theme=0',
    videoId: 'spotify-todays-top-hits',
    title: "Spotify — Today's Top Hits Playlist",
    author: 'Spotify Music',
    category: 'Music & Chill',
    durationLabel: 'SPOTIFY',
  },
  {
    sourceType: 'hls',
    mediaUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    videoId: 'hls-bbb',
    title: 'Big Buck Bunny — Direct HLS (.m3u8) Stream',
    author: 'Mux HLS Stream',
    category: 'Short Films',
    durationLabel: '10:34',
  },
];

/**
 * Extracts a clean URL if the user pasted mobile share text like:
 * "Check out this playlist on YouTube: https://youtube.com/playlist?list=PL...&si=..."
 */
function extractUrlFromText(raw: string): string {
  const trimmed = raw.trim();
  const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
  if (urlMatch) {
    return urlMatch[0];
  }
  return trimmed;
}

const RESERVED_YT_PATH_TOKENS = new Set([
  'videoseries',
  'watch_popup',
  'attribution',
  'channel_switcher',
]);

export function extractYouTubePlaylistId(input: string): string | null {
  const cleaned = extractUrlFromText(input);
  if (!cleaned) return null;

  try {
    const urlObj = new URL(
      cleaned.startsWith('http://') || cleaned.startsWith('https://')
        ? cleaned
        : `https://${cleaned}`
    );
    const host = urlObj.hostname
      .replace(/^www\./, '')
      .replace(/^m\./, '')
      .replace(/^music\./, '');

    if (
      host === 'youtube.com' ||
      host === 'youtube-nocookie.com' ||
      host === 'youtu.be' ||
      host === 'youtube.googleapis.com'
    ) {
      const listParam = urlObj.searchParams.get('list');
      if (listParam && /^[a-zA-Z0-9_-]{2,}$/.test(listParam)) {
        return listParam;
      }

      // Check nested attribution_link u= param (common on mobile/email shares)
      const uParam = urlObj.searchParams.get('u');
      if (uParam) {
        const decodedU = decodeURIComponent(uParam);
        const nestedMatch = decodedU.match(/[?&]list=([a-zA-Z0-9_-]{2,})/);
        if (nestedMatch) return nestedMatch[1];
      }

      // Check /playlist/PL... path style
      const segments = urlObj.pathname.split('/').filter(Boolean);
      if (
        segments.length >= 2 &&
        segments[0] === 'playlist' &&
        /^[a-zA-Z0-9_-]{2,}$/.test(segments[1])
      ) {
        return segments[1];
      }
    }
  } catch {
    // Fallback regex below
  }

  const decoded = (() => {
    try {
      return decodeURIComponent(cleaned);
    } catch {
      return cleaned;
    }
  })();

  const match = decoded.match(/[?&]list=([a-zA-Z0-9_-]{2,})/);
  return match ? match[1] : null;
}

export function extractYouTubeId(input: string): string | null {
  const cleaned = extractUrlFromText(input);
  if (!cleaned) return null;

  if (
    /^[a-zA-Z0-9_-]{11}$/.test(cleaned) &&
    !RESERVED_YT_PATH_TOKENS.has(cleaned.toLowerCase())
  ) {
    return cleaned;
  }

  try {
    const urlObj = new URL(
      cleaned.startsWith('http://') || cleaned.startsWith('https://')
        ? cleaned
        : `https://${cleaned}`
    );
    const host = urlObj.hostname
      .replace(/^www\./, '')
      .replace(/^m\./, '')
      .replace(/^music\./, '');

    if (host === 'youtu.be') {
      const id = urlObj.pathname.split('/').filter(Boolean)[0];
      if (
        id &&
        /^[a-zA-Z0-9_-]{11}$/.test(id) &&
        !RESERVED_YT_PATH_TOKENS.has(id.toLowerCase())
      ) {
        return id;
      }
    }

    if (
      host === 'youtube.com' ||
      host === 'youtube-nocookie.com' ||
      host === 'youtube.googleapis.com'
    ) {
      const vParam = urlObj.searchParams.get('v');
      if (
        vParam &&
        /^[a-zA-Z0-9_-]{11}$/.test(vParam) &&
        !RESERVED_YT_PATH_TOKENS.has(vParam.toLowerCase())
      ) {
        return vParam;
      }

      // Check nested attribution_link u= param
      const uParam = urlObj.searchParams.get('u');
      if (uParam) {
        const decodedU = decodeURIComponent(uParam);
        const nestedV = decodedU.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (nestedV && !RESERVED_YT_PATH_TOKENS.has(nestedV[1].toLowerCase())) {
          return nestedV[1];
        }
      }

      const segments = urlObj.pathname.split('/').filter(Boolean);
      if (
        segments.length >= 2 &&
        ['embed', 'shorts', 'live', 'v', 'watch'].includes(segments[0])
      ) {
        const candidate = segments[1];
        if (
          candidate &&
          /^[a-zA-Z0-9_-]{11}$/.test(candidate) &&
          !RESERVED_YT_PATH_TOKENS.has(candidate.toLowerCase())
        ) {
          return candidate;
        }
      }
    }
  } catch {
    // Fallback regex
  }

  const regexMatch = cleaned.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (
    regexMatch &&
    regexMatch[1] &&
    !RESERVED_YT_PATH_TOKENS.has(regexMatch[1].toLowerCase())
  ) {
    return regexMatch[1];
  }
  return null;
}

function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

export function parseMediaInput(input: string): ParsedMediaInput | null {
  const cleaned = extractUrlFromText(input);
  if (!cleaned) return null;

  const ytId = extractYouTubeId(cleaned);
  const ytPlaylistId = extractYouTubePlaylistId(cleaned);

  // Case 1: YouTube video (with or without an attached playlist)
  if (ytId) {
    return {
      sourceType: 'youtube',
      mediaUrl: ytId,
      videoId: ytId,
      displayHost: ytPlaylistId ? 'YouTube Playlist' : 'YouTube',
      suggestedTitle: ytPlaylistId
        ? `YouTube Playlist (${ytId})`
        : `YouTube Stream (${ytId})`,
      playlistId: ytPlaylistId || undefined,
      originalUrl: cleaned,
    };
  }

  // Case 2: Pure YouTube Playlist URL (mobile app, desktop, music.youtube.com, embed/videoseries)
  if (ytPlaylistId) {
    return {
      sourceType: 'youtube',
      mediaUrl: `playlist:${ytPlaylistId}`,
      videoId: '',
      displayHost: 'YouTube Playlist',
      suggestedTitle: `YouTube Playlist (${ytPlaylistId.slice(0, 12)})`,
      playlistId: ytPlaylistId,
      originalUrl: cleaned,
    };
  }

  let normalizedUrl = cleaned;
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    if (normalizedUrl.includes('.') && !normalizedUrl.includes(' ')) {
      normalizedUrl = `https://${normalizedUrl}`;
    } else {
      return null;
    }
  }

  try {
    const urlObj = new URL(normalizedUrl);
    const host = urlObj.hostname.replace(/^www\./, '');
    const lowerPath = urlObj.pathname.toLowerCase();
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);

    // Case 3: Spotify (Track, Playlist, Album, Artist, Episode, Show)
    if (host === 'open.spotify.com' || host === 'play.spotify.com') {
      const cleanSegments = pathSegments.filter((seg) => !seg.startsWith('intl-'));
      if (cleanSegments[0] === 'embed' && cleanSegments.length >= 3) {
        const embedType = cleanSegments[1];
        const itemId = cleanSegments[2];
        const embedUrl = `https://open.spotify.com/embed/${embedType}/${itemId}?utm_source=generator&theme=0`;
        return {
          sourceType: 'music-embed',
          mediaUrl: embedUrl,
          videoId: `spotify-${itemId.slice(0, 12)}`,
          displayHost: 'Spotify',
          suggestedTitle: `Spotify ${humanizeSlug(embedType)}`,
          originalUrl: `https://open.spotify.com/${embedType}/${itemId}`,
        };
      }

      if (
        cleanSegments.length >= 2 &&
        ['track', 'playlist', 'album', 'artist', 'episode', 'show'].includes(
          cleanSegments[0]
        )
      ) {
        const embedType = cleanSegments[0];
        const itemId = cleanSegments[1];
        const embedUrl = `https://open.spotify.com/embed/${embedType}/${itemId}?utm_source=generator&theme=0`;
        return {
          sourceType: 'music-embed',
          mediaUrl: embedUrl,
          videoId: `spotify-${itemId.slice(0, 12)}`,
          displayHost: 'Spotify',
          suggestedTitle: `Spotify ${humanizeSlug(embedType)}`,
          originalUrl: `https://open.spotify.com/${embedType}/${itemId}`,
        };
      }
    }

    // Case 4: SoundCloud Tracks & Playlists (Sets)
    if (
      host === 'soundcloud.com' ||
      host === 'm.soundcloud.com' ||
      host === 'on.soundcloud.com'
    ) {
      const cleanTrackUrl = `${urlObj.origin}${urlObj.pathname}`;
      const embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(
        cleanTrackUrl
      )}&color=%231ed760&auto_play=true&hide_related=false&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true`;
      const lastSeg = pathSegments[pathSegments.length - 1] || 'track';
      return {
        sourceType: 'music-embed',
        mediaUrl: embedUrl,
        videoId: `sc-${lastSeg.slice(0, 14)}`,
        displayHost: 'SoundCloud',
        suggestedTitle: `${humanizeSlug(lastSeg)} · SoundCloud`,
        originalUrl: cleanTrackUrl,
      };
    }

    if (host === 'w.soundcloud.com' && lowerPath.startsWith('/player')) {
      return {
        sourceType: 'music-embed',
        mediaUrl: urlObj.toString(),
        videoId: 'sc-player',
        displayHost: 'SoundCloud',
        suggestedTitle: 'SoundCloud Stream',
        originalUrl: urlObj.searchParams.get('url') || urlObj.toString(),
      };
    }

    // Case 5: Apple Music
    if (host === 'music.apple.com' || host === 'embed.music.apple.com') {
      const embedUrl = `https://embed.music.apple.com${urlObj.pathname}${urlObj.search}`;
      const lastSeg = pathSegments[pathSegments.length - 1] || 'apple-music';
      return {
        sourceType: 'music-embed',
        mediaUrl: embedUrl,
        videoId: `am-${lastSeg.slice(0, 12)}`,
        displayHost: 'Apple Music',
        suggestedTitle: `Apple Music Stream`,
        originalUrl: urlObj.toString(),
      };
    }

    const lastSegment = pathSegments[pathSegments.length - 1] || host;
    const cleanLastSegment = lastSegment.replace(
      /\.(m3u8|mp4|webm|ogg|mov|m4v|mp3|wav|flac|m4a|aac|html|php)$/i,
      ''
    );
    const readablePath =
      pathSegments.length >= 2
        ? `${humanizeSlug(pathSegments[pathSegments.length - 2])} — ${humanizeSlug(
            cleanLastSegment
          )}`
        : humanizeSlug(cleanLastSegment) || host;

    // Case 6: HLS (.m3u8)
    if (lowerPath.endsWith('.m3u8') || urlObj.search.toLowerCase().includes('.m3u8')) {
      return {
        sourceType: 'hls',
        mediaUrl: urlObj.toString(),
        videoId: cleanLastSegment.slice(0, 16) || 'hls-stream',
        displayHost: host,
        suggestedTitle: `${readablePath} (HLS Stream)`,
      };
    }

    // Case 7: Direct Video (.mp4, .webm, .mov, .m4v)
    if (/\.(mp4|webm|mov|m4v)$/i.test(lowerPath)) {
      return {
        sourceType: 'direct-video',
        mediaUrl: urlObj.toString(),
        videoId: cleanLastSegment.slice(0, 16) || 'video-file',
        displayHost: host,
        suggestedTitle: readablePath || `Direct Video (${host})`,
      };
    }

    // Case 8: Direct Audio (.mp3, .wav, .flac, .m4a, .aac, .ogg)
    if (/\.(mp3|wav|flac|m4a|aac|ogg)$/i.test(lowerPath)) {
      return {
        sourceType: 'direct-audio',
        mediaUrl: urlObj.toString(),
        videoId: cleanLastSegment.slice(0, 16) || 'audio-track',
        displayHost: host,
        suggestedTitle: readablePath || `Audio Track (${host})`,
      };
    }

    let finalEmbedUrl = urlObj.toString();
    if (host === 'vimeo.com' && /^\d+$/.test(lastSegment)) {
      finalEmbedUrl = `https://player.vimeo.com/video/${lastSegment}`;
    } else if (
      host === 'dailymotion.com' &&
      pathSegments[0] === 'video' &&
      pathSegments[1]
    ) {
      finalEmbedUrl = `https://www.dailymotion.com/embed/video/${pathSegments[1]}`;
    }

    return {
      sourceType: 'embed-web',
      mediaUrl: finalEmbedUrl,
      videoId: cleanLastSegment.slice(0, 16) || host.slice(0, 12),
      displayHost: host,
      suggestedTitle: `${readablePath} · Live Stream`,
    };
  } catch {
    return null;
  }
}

export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const totalSeconds = Math.floor(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export function getYouTubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
