import express from 'express';
import fs from 'fs';
import { createServer as createHttpServer } from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { APP_CONFIG } from './src/config.ts';
import {
  RoomState,
  RoomControlMode,
  PublicRoomSummary,
  QueueItem,
  ChatMessage,
  ChatReplyReference,
  ParsedMediaInput,
  parseMediaInput,
  formatTimecode,
  generateRandomNickname,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DISCONNECT_GRACE_MS = APP_CONFIG.disconnectGracePeriodMs;
const DATA_DIR = path.join(__dirname, 'data');
const ROOMS_FILE_PATH = path.join(DATA_DIR, 'rooms.json');

function getLocalNetworkAddresses(): string[] {
  try {
    const interfaces = os.networkInterfaces();
    const addresses: string[] = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push(iface.address);
        }
      }
    }
    return addresses;
  } catch {
    return [];
  }
}

const USER_COLORS = [
  '#1ed760', // Spotify Green
  '#539df5', // Announcement Blue
  '#ffa42b', // Warning Orange
  '#f3727f', // Coral Red
  '#a855f7', // Purple
  '#14b8a6', // Teal
  '#eab308', // Gold
];

interface ClientConnection {
  ws: WebSocket;
  clientId: string;
  userName: string;
  userColor: string;
  roomId: string | null;
}

interface PlaylistTrackItem {
  videoId: string;
  title: string;
  author: string;
}

const rooms = new Map<string, RoomState>();
const clients = new Map<WebSocket, ClientConnection>();
const clientColorsById = new Map<string, string>();
const pendingDisconnects = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; roomId: string; userName: string }
>();
const mediaMetaCache = new Map<
  string,
  { title: string; author: string; thumbnailUrl?: string }
>();
const playlistCache = new Map<string, PlaylistTrackItem[]>();

let saveTimer: ReturnType<typeof setTimeout> | null = null;

const SEED_SCHEMA_VERSION = 3;

function scheduleSaveRoomsToDisk() {
  if (!APP_CONFIG.enableJsonDiskPersistence) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await fs.promises.mkdir(DATA_DIR, { recursive: true });
      const serialized = Array.from(rooms.values()).map((r) => ({
        ...r,
        playback: {
          ...r.playback,
          mediaTime: computeAuthoritativeMediaTime(r),
          lastUpdatedAt: Date.now(),
        },
        participants: [],
      }));
      await fs.promises.writeFile(
        ROOMS_FILE_PATH,
        JSON.stringify(
          {
            schemaVersion: SEED_SCHEMA_VERSION,
            updatedAt: Date.now(),
            rooms: serialized,
          },
          null,
          2
        ),
        'utf-8'
      );
    } catch (err) {
      console.error('Failed to persist rooms.json:', err);
    }
  }, 1500);
}

function loadRoomsFromDisk(): boolean {
  if (!APP_CONFIG.enableJsonDiskPersistence) return false;
  try {
    if (!fs.existsSync(ROOMS_FILE_PATH)) return false;
    const raw = fs.readFileSync(ROOMS_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      parsed.schemaVersion !== SEED_SCHEMA_VERSION ||
      !Array.isArray(parsed.rooms) ||
      parsed.rooms.length === 0
    ) {
      return false;
    }
    for (const r of parsed.rooms as RoomState[]) {
      r.participants = [];
      r.hostId = r.hostId || '';
      r.controlMode = r.controlMode || 'everyone';
      if (r.playback.videoId === 'jfKfPfyJRdk') {
        r.playback.videoId = 'LXb3EKWsInQ';
        r.playback.mediaUrl = 'LXb3EKWsInQ';
        r.playback.videoTitle = 'Costa Rica in 4K 60fps HDR — Scenic Chill Lounge';
        r.playback.videoAuthor = 'Jacob + Katie Schwarz';
      }
      r.playback.lastUpdatedAt = Date.now();
      rooms.set(r.id, r);
      mediaMetaCache.set(`${r.playback.sourceType}:${r.playback.mediaUrl}`, {
        title: r.playback.videoTitle,
        author: r.playback.videoAuthor,
        thumbnailUrl: r.playback.thumbnailUrl,
      });
    }
    return true;
  } catch {
    return false;
  }
}

function getColorForClient(clientId: string): string {
  const existing = clientColorsById.get(clientId);
  if (existing) return existing;
  const color = USER_COLORS[clientColorsById.size % USER_COLORS.length];
  clientColorsById.set(clientId, color);
  return color;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\u0026/g, '&');
}

function extractTracksFromYouTubeJsonText(
  rawText: string,
  seenIds: Set<string>,
  results: PlaylistTrackItem[],
  maxItems = 80
) {
  const rendererKeys = ['"playlistVideoRenderer":', '"playlistPanelVideoRenderer":'];
  for (const key of rendererKeys) {
    if (results.length >= maxItems) break;
    const blocks = rawText.split(key);
    for (let i = 1; i < blocks.length && results.length < maxItems; i++) {
      const block = blocks[i].slice(0, 2800);
      const idMatch = block.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      if (!idMatch) continue;
      const videoId = idMatch[1];
      if (seenIds.has(videoId)) continue;

      const titleMatch =
        block.match(/"title":\{"runs":\[\{"text":"((?:\\.|[^"\\])+)"/) ||
        block.match(/"title":\{"simpleText":"((?:\\.|[^"\\])+)"/);
      const authorMatch =
        block.match(/"shortBylineText":\{"runs":\[\{"text":"((?:\\.|[^"\\])+)"/) ||
        block.match(/"longBylineText":\{"runs":\[\{"text":"((?:\\.|[^"\\])+)"/);

      const rawTitle = titleMatch ? titleMatch[1] : `YouTube Video (${videoId})`;
      const rawAuthor = authorMatch ? authorMatch[1] : 'YouTube Playlist';
      const cleanTitle = decodeHtmlEntities(rawTitle.replace(/\\"/g, '"'));
      const cleanAuthor = decodeHtmlEntities(rawAuthor.replace(/\\"/g, '"'));

      seenIds.add(videoId);
      results.push({
        videoId,
        title: cleanTitle,
        author: cleanAuthor,
      });
      mediaMetaCache.set(`youtube:${videoId}`, {
        title: cleanTitle,
        author: cleanAuthor,
      });
    }
  }
}

async function resolveYouTubeVideoTitleById(
  videoId: string
): Promise<{ title: string; author: string }> {
  const cached = mediaMetaCache.get(`youtube:${videoId}`);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(
      videoId
    )}&format=json`;
    const res = await fetch(oembedUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = (await res.json()) as { title?: string; author_name?: string };
      const meta = {
        title: data.title || `YouTube Video (${videoId})`,
        author: data.author_name || 'YouTube',
      };
      mediaMetaCache.set(`youtube:${videoId}`, meta);
      return meta;
    }
  } catch {
    // Fallback below
  }
  return {
    title: `YouTube Video (${videoId})`,
    author: 'YouTube',
  };
}

async function resolveYouTubePlaylistVideos(
  playlistId: string,
  seedVideoId?: string
): Promise<PlaylistTrackItem[]> {
  const cleanPlaylistId = playlistId.trim();
  if (!cleanPlaylistId) return [];

  const cacheKey = seedVideoId ? `${cleanPlaylistId}:${seedVideoId}` : cleanPlaylistId;
  const cached = playlistCache.get(cacheKey) || playlistCache.get(cleanPlaylistId);
  if (cached && cached.length > 0) {
    return cached;
  }

  const results: PlaylistTrackItem[] = [];
  const seenIds = new Set<string>();

  // 0. Handle comma-separated watch_videos IDs ("ids:id1,id2,id3")
  if (cleanPlaylistId.startsWith('ids:')) {
    const ids = cleanPlaylistId
      .slice(4)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[a-zA-Z0-9_-]{11}$/.test(s))
      .slice(0, 50);

    const metas = await Promise.all(ids.map((id) => resolveYouTubeVideoTitleById(id)));
    ids.forEach((videoId, idx) => {
      if (!seenIds.has(videoId)) {
        seenIds.add(videoId);
        results.push({
          videoId,
          title: metas[idx].title,
          author: metas[idx].author,
        });
      }
    });

    if (results.length > 0) {
      playlistCache.set(cleanPlaylistId, results);
    }
    return results;
  }

  // 1. Primary: YouTube InnerTube `/youtubei/v1/browse` API (works for PL..., OLAK5uy_..., UU..., FL... across mobile & desktop links)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const browseId = cleanPlaylistId.startsWith('VL')
      ? cleanPlaylistId
      : `VL${cleanPlaylistId}`;
    const res = await fetch(
      'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false',
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
          browseId,
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20240726.00.00',
              hl: 'en',
              gl: 'US',
            },
          },
        }),
      }
    );
    clearTimeout(timeout);

    if (res.ok) {
      const rawJson = await res.text();
      extractTracksFromYouTubeJsonText(rawJson, seenIds, results, 80);
    }
  } catch {
    // Continue to next stage
  }

  // 2. Stage 2: YouTube InnerTube `/youtubei/v1/next` API (handles watch?v=...&list=..., RD... Mixes, YouTube Music playlists, and mobile app share links)
  if (results.length === 0) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const bodyPayload: Record<string, unknown> = {
        playlistId: cleanPlaylistId,
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240726.00.00',
            hl: 'en',
            gl: 'US',
          },
        },
      };
      if (seedVideoId && /^[a-zA-Z0-9_-]{11}$/.test(seedVideoId)) {
        bodyPayload.videoId = seedVideoId;
      }

      const res = await fetch(
        'https://www.youtube.com/youtubei/v1/next?prettyPrint=false',
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
          body: JSON.stringify(bodyPayload),
        }
      );
      clearTimeout(timeout);

      if (res.ok) {
        const rawJson = await res.text();
        extractTracksFromYouTubeJsonText(rawJson, seenIds, results, 80);
      }
    } catch {
      // Continue to next stage
    }
  }

  // 3. Stage 3: Scrape public YouTube playlist or watch HTML page
  if (results.length === 0) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const pageUrl =
        seedVideoId && /^[a-zA-Z0-9_-]{11}$/.test(seedVideoId)
          ? `https://www.youtube.com/watch?v=${encodeURIComponent(
              seedVideoId
            )}&list=${encodeURIComponent(cleanPlaylistId)}&hl=en`
          : `https://www.youtube.com/playlist?list=${encodeURIComponent(
              cleanPlaylistId
            )}&hl=en`;
      const res = await fetch(pageUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Cookie: 'CONSENT=YES+1',
        },
      });
      clearTimeout(timeout);

      if (res.ok) {
        const html = await res.text();
        extractTracksFromYouTubeJsonText(html, seenIds, results, 80);
      }
    } catch {
      // Fallback to XML feed below
    }
  }

  // 4. Stage 4: YouTube public XML Atom feed for playlists
  if (results.length === 0) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(
        cleanPlaylistId
      )}`;
      const res = await fetch(feedUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const xml = await res.text();
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match: RegExpExecArray | null;
        while ((match = entryRegex.exec(xml)) !== null && results.length < 50) {
          const entry = match[1];
          const vidMatch = entry.match(/<yt:videoId>([a-zA-Z0-9_-]{11})<\/yt:videoId>/);
          if (!vidMatch) continue;
          const videoId = vidMatch[1];
          if (seenIds.has(videoId)) continue;

          const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
          const authorMatch = entry.match(/<name>([\s\S]*?)<\/name>/);
          const cleanTitle = decodeHtmlEntities(
            titleMatch ? titleMatch[1].trim() : `YouTube Video (${videoId})`
          );
          const cleanAuthor = decodeHtmlEntities(
            authorMatch ? authorMatch[1].trim() : 'YouTube'
          );

          seenIds.add(videoId);
          results.push({
            videoId,
            title: cleanTitle,
            author: cleanAuthor,
          });
          mediaMetaCache.set(`youtube:${videoId}`, {
            title: cleanTitle,
            author: cleanAuthor,
          });
        }
      }
    } catch {
      // Ignore XML feed failure
    }
  }

  if (results.length > 0) {
    playlistCache.set(cacheKey, results);
    playlistCache.set(cleanPlaylistId, results);
  }
  return results;
}

async function resolveMediaMeta(
  parsed: ParsedMediaInput
): Promise<{ title: string; author: string; thumbnailUrl?: string }> {
  const cacheKey = `${parsed.sourceType}:${parsed.mediaUrl}`;
  const cached = mediaMetaCache.get(cacheKey);
  if (cached) return cached;

  if (parsed.sourceType === 'youtube' && !parsed.mediaUrl.startsWith('playlist:')) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(
        parsed.videoId
      )}&format=json`;
      const res = await fetch(oembedUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const data = (await res.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
        };
        const meta = {
          title: data.title || parsed.suggestedTitle,
          author: data.author_name || 'YouTube',
          thumbnailUrl: data.thumbnail_url,
        };
        mediaMetaCache.set(cacheKey, meta);
        return meta;
      }
    } catch {
      // Fallback below
    }
  } else if (parsed.sourceType === 'music-embed') {
    // Resolve Spotify or SoundCloud metadata via their public OEmbed APIs
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const targetUrl = parsed.originalUrl || parsed.mediaUrl;
      let oembedEndpoint = '';

      if (parsed.displayHost === 'Spotify') {
        oembedEndpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(
          targetUrl
        )}`;
      } else if (parsed.displayHost === 'SoundCloud') {
        oembedEndpoint = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(
          targetUrl
        )}`;
      }

      if (oembedEndpoint) {
        const res = await fetch(oembedEndpoint, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const data = (await res.json()) as {
            title?: string;
            author_name?: string;
            provider_name?: string;
            thumbnail_url?: string;
          };
          const meta = {
            title: data.title || parsed.suggestedTitle,
            author: data.author_name || data.provider_name || parsed.displayHost,
            thumbnailUrl: data.thumbnail_url,
          };
          mediaMetaCache.set(cacheKey, meta);
          return meta;
        }
      }
    } catch {
      // Fallback below
    }
  } else if (parsed.sourceType === 'embed-web') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(parsed.mediaUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SyncCinema/1.0)',
        },
      });
      clearTimeout(timeout);
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          const html = (await res.text()).slice(0, 16000);
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            const cleanTitle = titleMatch[1].replace(/\s+/g, ' ').trim();
            if (cleanTitle && cleanTitle.length > 2) {
              const meta = {
                title: cleanTitle.slice(0, 90),
                author: parsed.displayHost,
              };
              mediaMetaCache.set(cacheKey, meta);
              return meta;
            }
          }
        }
      }
    } catch {
      // Fallback to clean slug title
    }
  }

  const fallback = {
    title: parsed.suggestedTitle,
    author: parsed.displayHost,
  };
  mediaMetaCache.set(cacheKey, fallback);
  return fallback;
}

/**
 * Resolves a parsed input that may contain a YouTube playlist into:
 * - primaryTrack: the first (or explicitly selected) video to play
 * - extraQueueItems: all remaining playlist videos ready to be appended to room.queue
 */
async function expandMediaInputWithPlaylist(
  parsed: ParsedMediaInput,
  addedByUserName: string
): Promise<{
  primary: {
    sourceType: ParsedMediaInput['sourceType'];
    mediaUrl: string;
    videoId: string;
    playlistId?: string;
    title: string;
    author: string;
    thumbnailUrl?: string;
  };
  queuedItems: QueueItem[];
}> {
  const hasExplicitVideo =
    !parsed.mediaUrl.startsWith('playlist:') &&
    /^[a-zA-Z0-9_-]{11}$/.test(parsed.videoId);

  if (parsed.playlistId) {
    const playlistTracks = await resolveYouTubePlaylistVideos(
      parsed.playlistId,
      hasExplicitVideo ? parsed.videoId : undefined
    );
    if (playlistTracks.length > 0) {
      let primaryTrack = playlistTracks[0];
      let remainingTracks = playlistTracks.slice(1);

      if (hasExplicitVideo) {
        const foundIdx = playlistTracks.findIndex((t) => t.videoId === parsed.videoId);
        if (foundIdx >= 0) {
          primaryTrack = playlistTracks[foundIdx];
          remainingTracks = [
            ...playlistTracks.slice(foundIdx + 1),
            ...playlistTracks.slice(0, foundIdx),
          ];
        } else {
          const explicitMeta = await resolveMediaMeta(parsed);
          primaryTrack = {
            videoId: parsed.videoId,
            title: explicitMeta.title,
            author: explicitMeta.author,
          };
          remainingTracks = playlistTracks;
        }
      }

      const now = Date.now();
      const queuedItems: QueueItem[] = remainingTracks.map((track, idx) => ({
        id: `q-pl-${now}-${idx}-${track.videoId}`,
        sourceType: 'youtube',
        mediaUrl: track.videoId,
        videoId: track.videoId,
        title: track.title,
        author: track.author,
        addedBy: addedByUserName,
        addedAt: now + idx,
      }));

      return {
        primary: {
          sourceType: 'youtube',
          mediaUrl: primaryTrack.videoId,
          videoId: primaryTrack.videoId,
          playlistId: parsed.playlistId,
          title: primaryTrack.title,
          author: primaryTrack.author,
        },
        queuedItems,
      };
    }

    // If server-side resolution returned 0 tracks (e.g. personalized mix or browser-only playlist),
    // pass playlistId down to YouTubeSyncPlayer so the browser's YouTube IFrame API can load and expand it!
    if (hasExplicitVideo) {
      const meta = await resolveMediaMeta(parsed);
      return {
        primary: {
          sourceType: 'youtube',
          mediaUrl: parsed.videoId,
          videoId: parsed.videoId,
          playlistId: parsed.playlistId,
          title: meta.title,
          author: meta.author,
          thumbnailUrl: meta.thumbnailUrl,
        },
        queuedItems: [],
      };
    }

    return {
      primary: {
        sourceType: 'youtube',
        mediaUrl: `playlist:${parsed.playlistId}`,
        videoId: '',
        playlistId: parsed.playlistId,
        title: parsed.suggestedTitle,
        author: 'YouTube Playlist',
      },
      queuedItems: [],
    };
  }

  const meta = await resolveMediaMeta(parsed);
  return {
    primary: {
      sourceType: parsed.sourceType,
      mediaUrl: parsed.mediaUrl,
      videoId: parsed.videoId,
      title: meta.title,
      author: meta.author,
      thumbnailUrl: meta.thumbnailUrl,
    },
    queuedItems: [],
  };
}

function computeAuthoritativeMediaTime(room: RoomState): number {
  if (
    room.playback.sourceType === 'embed-web' ||
    room.playback.sourceType === 'music-embed'
  ) {
    return 0;
  }
  if (!room.playback.isPlaying) {
    return room.playback.mediaTime;
  }
  const elapsedSeconds = Math.max(0, (Date.now() - room.playback.lastUpdatedAt) / 1000);
  return room.playback.mediaTime + elapsedSeconds;
}

function getSnapshotRoomState(room: RoomState): RoomState {
  const liveMediaTime = computeAuthoritativeMediaTime(room);
  return {
    ...room,
    playback: {
      ...room.playback,
      mediaTime: liveMediaTime,
      lastUpdatedAt: Date.now(),
    },
  };
}

function getPublicRoomSummaries(): PublicRoomSummary[] {
  const list: PublicRoomSummary[] = [];
  for (const room of rooms.values()) {
    if (room.isPublic) {
      list.push({
        id: room.id,
        name: room.name,
        category: room.category,
        participantCount: room.participants.length,
        participantsPreview: room.participants.slice(0, 4).map((p) => ({
          name: p.name,
          color: p.color,
        })),
        sourceType: room.playback.sourceType,
        mediaUrl: room.playback.mediaUrl,
        videoId: room.playback.videoId,
        videoTitle: room.playback.videoTitle,
        isPlaying: room.playback.isPlaying,
        controlMode: room.controlMode,
      });
    }
  }
  return list.sort((a, b) => b.participantCount - a.participantCount);
}

function seedInitialGroupRooms() {
  if (loadRoomsFromDisk()) {
    return;
  }

  const now = Date.now();
  const initialRooms: RoomState[] = [
    {
      id: 'CINE4K',
      name: 'Blender 4K Short Films — Spring',
      category: 'Short Films',
      isPublic: true,
      hostId: '',
      controlMode: 'everyone',
      createdAt: now - 1800_000,
      playback: {
        sourceType: 'youtube',
        mediaUrl: 'WhWc3b3KhnY',
        videoId: 'WhWc3b3KhnY',
        videoTitle: 'Spring — Blender 4K Animated Short Film',
        videoAuthor: 'Blender Studio',
        isPlaying: true,
        mediaTime: 12,
        lastUpdatedAt: now,
        updatedBy: 'Studio Host',
        actionSummary: 'Stream synced & playing in 4K',
      },
      queue: [
        {
          id: 'seed-q-cine-1',
          sourceType: 'youtube',
          mediaUrl: 'aqz-KE-bpKQ',
          videoId: 'aqz-KE-bpKQ',
          title: 'Big Buck Bunny 60fps 4K — Official Blender Short',
          author: 'Blender Foundation',
          addedBy: 'Studio Host',
          addedAt: now - 1500_000,
        },
        {
          id: 'seed-q-cine-2',
          sourceType: 'youtube',
          mediaUrl: '_cMxraX_5RE',
          videoId: '_cMxraX_5RE',
          title: 'Charge — Blender Open Movie Action Short',
          author: 'Blender Studio',
          addedBy: 'Studio Host',
          addedAt: now - 1200_000,
        },
      ],
      participants: [],
      messages: [
        {
          id: 'sys-welcome-cine',
          senderId: 'system',
          senderName: 'System',
          senderColor: '#b3b3b3',
          text: 'Welcome to Blender 4K Short Films. Paste any YouTube video or playlist URL above to watch together.',
          timestamp: now - 500_000,
          type: 'system',
        },
      ],
    },
    {
      id: 'CRIC03',
      name: 'Sony Ten 3 — Live Cricket Arena',
      category: 'Live Sports',
      isPublic: true,
      hostId: '',
      controlMode: 'everyone',
      createdAt: now - 2400_000,
      playback: {
        sourceType: 'embed-web',
        mediaUrl: 'https://allrounder3-0.pages.dev/cricket/sony-3',
        videoId: 'sony-3',
        videoTitle: 'Sony Ten 3 — Live Cricket Broadcast',
        videoAuthor: 'allrounder3-0.pages.dev',
        isPlaying: true,
        mediaTime: 0,
        lastUpdatedAt: now,
        updatedBy: 'Studio Host',
        actionSummary: 'Live web broadcast synced for room',
        reloadNonce: 1,
      },
      queue: [
        {
          id: 'seed-q-cric-1',
          sourceType: 'youtube',
          mediaUrl: 'mN0zPOpADL4',
          videoId: 'mN0zPOpADL4',
          title: 'Agent 327: Operation Barbershop — Action Short',
          author: 'Blender Studio',
          addedBy: 'Studio Host',
          addedAt: now - 1200_000,
        },
      ],
      participants: [],
      messages: [
        {
          id: 'sys-welcome-cric',
          senderId: 'system',
          senderName: 'System',
          senderColor: '#b3b3b3',
          text: 'Welcome to Live Cricket Screening (Sony Ten 3). Double-click any message to reply, or click Join Voice to talk live.',
          timestamp: now - 600_000,
          type: 'system',
        },
      ],
    },
    {
      id: 'CHILL8',
      name: '4K Nature & Scenic Chill Lounge',
      category: 'Music & Chill',
      isPublic: true,
      hostId: '',
      controlMode: 'everyone',
      createdAt: now - 3600_000,
      playback: {
        sourceType: 'youtube',
        mediaUrl: 'LXb3EKWsInQ',
        videoId: 'LXb3EKWsInQ',
        videoTitle: 'Costa Rica in 4K 60fps HDR — Scenic Chill Lounge',
        videoAuthor: 'Jacob + Katie Schwarz',
        isPlaying: true,
        mediaTime: 0,
        lastUpdatedAt: now,
        updatedBy: 'Studio Host',
        actionSummary: 'Stream synced & playing',
      },
      queue: [
        {
          id: 'seed-q-spotify-1',
          sourceType: 'music-embed',
          mediaUrl:
            'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator&theme=0',
          videoId: 'spotify-todays-top-hits',
          title: "Spotify — Today's Top Hits Playlist",
          author: 'Spotify',
          addedBy: 'Studio Host',
          addedAt: now - 2000_000,
        },
        {
          id: 'seed-q-chill-2',
          sourceType: 'youtube',
          mediaUrl: 'eRsGyueVLvQ',
          videoId: 'eRsGyueVLvQ',
          title: 'Sintel — Fantasy Animated Short Film',
          author: 'Blender Foundation',
          addedBy: 'Studio Host',
          addedAt: now - 1800_000,
        },
      ],
      participants: [],
      messages: [
        {
          id: 'sys-welcome-lofi',
          senderId: 'system',
          senderName: 'System',
          senderColor: '#b3b3b3',
          text: 'Paste any YouTube video/playlist, Spotify track/playlist, SoundCloud link, or live stream URL above to listen and watch together!',
          timestamp: now - 600_000,
          type: 'system',
        },
      ],
    },
    {
      id: 'ANIM01',
      name: 'Agent 327 & Action Watch Party',
      category: 'Watch Party',
      isPublic: true,
      hostId: '',
      controlMode: 'everyone',
      createdAt: now - 5400_000,
      playback: {
        sourceType: 'youtube',
        mediaUrl: 'mN0zPOpADL4',
        videoId: 'mN0zPOpADL4',
        videoTitle: 'Agent 327: Operation Barbershop — Action Short',
        videoAuthor: 'Blender Studio',
        isPlaying: true,
        mediaTime: 5,
        lastUpdatedAt: now,
        updatedBy: 'Studio Host',
        actionSummary: 'Synced & playing',
      },
      queue: [
        {
          id: 'seed-q-anim-1',
          sourceType: 'youtube',
          mediaUrl: '_cMxraX_5RE',
          videoId: '_cMxraX_5RE',
          title: 'Charge — Futuristic Sci-Fi Short Film',
          author: 'Blender Studio',
          addedBy: 'Studio Host',
          addedAt: now - 2400_000,
        },
      ],
      participants: [],
      messages: [
        {
          id: 'sys-welcome-anim',
          senderId: 'system',
          senderName: 'System',
          senderColor: '#b3b3b3',
          text: 'Action Watch Party is live! Everyone can control playback, queue playlists, and send floating reactions.',
          timestamp: now - 400_000,
          type: 'system',
        },
      ],
    },
  ];

  for (const r of initialRooms) {
    rooms.set(r.id, r);
    mediaMetaCache.set(`${r.playback.sourceType}:${r.playback.mediaUrl}`, {
      title: r.playback.videoTitle,
      author: r.playback.videoAuthor,
      thumbnailUrl: r.playback.thumbnailUrl,
    });
  }

  scheduleSaveRoomsToDisk();
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function sendToClientInRoom(roomId: string, targetClientId: string, payload: unknown) {
  for (const [ws, client] of clients.entries()) {
    if (
      client.roomId === roomId &&
      client.clientId === targetClientId &&
      ws.readyState === WebSocket.OPEN
    ) {
      ws.send(JSON.stringify(payload));
    }
  }
}

function broadcastToRoom(roomId: string, payload: unknown, excludeWs?: WebSocket) {
  for (const [ws, client] of clients.entries()) {
    if (client.roomId === roomId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }
}

function broadcastLobbyRooms() {
  const summaries = getPublicRoomSummaries();
  for (const [ws] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      sendJson(ws, { type: 'lobby:rooms', rooms: summaries });
    }
  }
}

function canControlPlayback(room: RoomState, clientId: string): boolean {
  if (room.controlMode === 'everyone') return true;
  return room.hostId === clientId;
}

function appendSystemMessage(room: RoomState, text: string) {
  const lastMsg = room.messages[room.messages.length - 1];
  if (
    lastMsg &&
    lastMsg.type === 'system' &&
    lastMsg.text === text &&
    Date.now() - lastMsg.timestamp < 15_000
  ) {
    return;
  }

  const sysMsg: ChatMessage = {
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    senderId: 'system',
    senderName: 'System',
    senderColor: '#b3b3b3',
    text,
    timestamp: Date.now(),
    type: 'system',
  };
  room.messages.push(sysMsg);
  if (room.messages.length > APP_CONFIG.maxChatHistoryPerRoom) {
    room.messages.splice(0, room.messages.length - APP_CONFIG.maxChatHistoryPerRoom);
  }
  broadcastToRoom(room.id, { type: 'chat:new_message', message: sysMsg });
  scheduleSaveRoomsToDisk();
}

function cancelPendingDisconnect(clientId: string) {
  const pending = pendingDisconnects.get(clientId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingDisconnects.delete(clientId);
  }
}

function finalizeRemoveParticipant(clientId: string, roomId: string, userName: string) {
  pendingDisconnects.delete(clientId);

  for (const c of clients.values()) {
    if (c.clientId === clientId && c.roomId === roomId && c.ws.readyState === WebSocket.OPEN) {
      return;
    }
  }

  const room = rooms.get(roomId);
  if (!room) return;

  const existingParticipant = room.participants.find((p) => p.id === clientId);
  const wasInVoice = existingParticipant?.inVoice;
  const beforeLen = room.participants.length;
  room.participants = room.participants.filter((p) => p.id !== clientId);

  if (room.participants.length !== beforeLen) {
    if (wasInVoice) {
      broadcastToRoom(roomId, {
        type: 'voice:peer_left',
        peerId: clientId,
      });
    }

    if (room.hostId === clientId) {
      room.hostId = room.participants[0]?.id || '';
      if (room.hostId) {
        broadcastToRoom(roomId, {
          type: 'room:meta_updated',
          hostId: room.hostId,
          controlMode: room.controlMode,
        });
      }
    }

    appendSystemMessage(room, `${userName} left the room`);
    broadcastToRoom(roomId, {
      type: 'room:participants_updated',
      participants: room.participants,
    });
    broadcastLobbyRooms();
  }
}

function removeClientImmediately(client: ClientConnection) {
  cancelPendingDisconnect(client.clientId);
  if (!client.roomId) return;
  const oldRoomId = client.roomId;
  client.roomId = null;
  finalizeRemoveParticipant(client.clientId, oldRoomId, client.userName);
}

async function startServer() {
  seedInitialGroupRooms();

  const app = express();
  app.use(express.json());

  const httpServer = createHttpServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: getPublicRoomSummaries() });
  });

  app.get('/api/rooms/:code', (req, res) => {
    const code = (req.params.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json({ room: getSnapshotRoomState(room) });
  });

  app.get('/api/youtube-meta', async (req, res) => {
    const raw = String(req.query.videoId || req.query.url || '');
    const parsed = parseMediaInput(raw);
    if (!parsed) {
      res.status(400).json({ error: 'Invalid media URL or YouTube ID' });
      return;
    }
    const meta = await resolveMediaMeta(parsed);
    res.json({ ...parsed, ...meta });
  });

  app.get('/api/network-info', (_req, res) => {
    const localIps = getLocalNetworkAddresses();
    res.json({
      port: PORT,
      localIps,
      primaryLanUrl:
        localIps.length > 0 ? `http://${localIps[0]}:${PORT}` : `http://localhost:${PORT}`,
    });
  });

  wss.on('connection', (ws) => {
    const fallbackId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const clientConn: ClientConnection = {
      ws,
      clientId: fallbackId,
      userName: generateRandomNickname(),
      userColor: getColorForClient(fallbackId),
      roomId: null,
    };
    clients.set(ws, clientConn);

    sendJson(ws, {
      type: 'lobby:rooms',
      rooms: getPublicRoomSummaries(),
      clientId: clientConn.clientId,
    });

    ws.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());
        const conn = clients.get(ws);
        if (!conn) return;

        if (msg.type === 'ping') {
          sendJson(ws, { type: 'pong' });
          return;
        }

        if (msg.clientId && typeof msg.clientId === 'string') {
          const cleanClientId = msg.clientId.trim().slice(0, 48);
          if (cleanClientId && cleanClientId !== conn.clientId) {
            conn.clientId = cleanClientId;
            conn.userColor = getColorForClient(cleanClientId);
          }
          cancelPendingDisconnect(conn.clientId);
        }

        switch (msg.type) {
          case 'room:create': {
            removeClientImmediately(conn);

            const userName =
              String(msg.userName || '').trim().slice(0, 28) || conn.userName;
            const roomName =
              String(msg.roomName || `${userName}'s Room`).trim().slice(0, 48) ||
              `${userName}'s Room`;
            const category = String(msg.category || 'Watch Party').trim().slice(0, 24);
            const isPublic = msg.isPublic !== false;
            const controlMode: RoomControlMode =
              msg.controlMode === 'host-only' ? 'host-only' : 'everyone';
            const parsed =
              parseMediaInput(String(msg.videoUrl || '')) ||
              parseMediaInput('WhWc3b3KhnY')!;

            conn.userName = userName;
            const expanded = await expandMediaInputWithPlaylist(parsed, userName);
            const roomId = generateRoomCode();
            const now = Date.now();

            const systemMessages: ChatMessage[] = [
              {
                id: `sys-${now}`,
                senderId: 'system',
                senderName: 'System',
                senderColor: '#b3b3b3',
                text:
                  expanded.queuedItems.length > 0
                    ? `${userName} created "${roomName}" and loaded a playlist (${
                        expanded.queuedItems.length + 1
                      } videos queued)`
                    : `${userName} created "${roomName}" (Code: ${roomId})`,
                timestamp: now,
                type: 'system',
              },
            ];

            const newRoom: RoomState = {
              id: roomId,
              name: roomName,
              category,
              isPublic,
              hostId: conn.clientId,
              controlMode,
              createdAt: now,
              playback: {
                sourceType: expanded.primary.sourceType,
                mediaUrl: expanded.primary.mediaUrl,
                videoId: expanded.primary.videoId,
                playlistId: expanded.primary.playlistId,
                videoTitle: expanded.primary.title,
                videoAuthor: expanded.primary.author,
                thumbnailUrl: expanded.primary.thumbnailUrl,
                isPlaying: true,
                mediaTime: 0,
                lastUpdatedAt: now,
                updatedBy: userName,
                actionSummary:
                  expanded.queuedItems.length > 0
                    ? `${userName} started playlist (+${expanded.queuedItems.length} in queue)`
                    : `${userName} started the room`,
                reloadNonce: 1,
              },
              queue: expanded.queuedItems,
              participants: [
                {
                  id: conn.clientId,
                  name: conn.userName,
                  color: conn.userColor,
                  joinedAt: now,
                  inVoice: false,
                  isMuted: false,
                },
              ],
              messages: systemMessages,
            };

            rooms.set(roomId, newRoom);
            conn.roomId = roomId;

            sendJson(ws, {
              type: 'room:joined',
              room: getSnapshotRoomState(newRoom),
              clientId: conn.clientId,
            });
            broadcastLobbyRooms();
            scheduleSaveRoomsToDisk();
            break;
          }

          case 'room:join': {
            const rawCode = String(msg.roomId || '').toUpperCase().trim();
            const userName =
              String(msg.userName || '').trim().slice(0, 28) || conn.userName;
            conn.userName = userName;
            cancelPendingDisconnect(conn.clientId);

            let room = rooms.get(rawCode);
            if (!room && /^[A-Z0-9]{4,8}$/.test(rawCode)) {
              const now = Date.now();
              const parsed = parseMediaInput('WhWc3b3KhnY')!;
              const meta = await resolveMediaMeta(parsed);
              room = {
                id: rawCode,
                name: `Room ${rawCode}`,
                category: 'Watch Party',
                isPublic: true,
                hostId: conn.clientId,
                controlMode: 'everyone',
                createdAt: now,
                playback: {
                  sourceType: parsed.sourceType,
                  mediaUrl: parsed.mediaUrl,
                  videoId: parsed.videoId,
                  videoTitle: meta.title,
                  videoAuthor: meta.author,
                  isPlaying: true,
                  mediaTime: 0,
                  lastUpdatedAt: now,
                  updatedBy: userName,
                  actionSummary: `${userName} opened room ${rawCode}`,
                  reloadNonce: 1,
                },
                queue: [],
                participants: [],
                messages: [],
              };
              rooms.set(rawCode, room);
            }

            if (!room) {
              sendJson(ws, {
                type: 'room:error',
                message: `Room "${rawCode}" was not found. Check the 6-character code or create a new room.`,
              });
              return;
            }

            if (conn.roomId && conn.roomId !== room.id) {
              removeClientImmediately(conn);
            }

            conn.roomId = room.id;

            if (
              !room.hostId ||
              !room.participants.some((p) => p.id === room!.hostId)
            ) {
              room.hostId = conn.clientId;
            }

            const existingIdx = room.participants.findIndex((p) => p.id === conn.clientId);
            if (existingIdx >= 0) {
              room.participants[existingIdx].name = conn.userName;
            } else {
              room.participants.push({
                id: conn.clientId,
                name: conn.userName,
                color: conn.userColor,
                joinedAt: Date.now(),
                inVoice: false,
                isMuted: false,
              });
              appendSystemMessage(room, `${conn.userName} joined the room`);
            }

            sendJson(ws, {
              type: 'room:joined',
              room: getSnapshotRoomState(room),
              clientId: conn.clientId,
            });

            broadcastToRoom(
              room.id,
              {
                type: 'room:participants_updated',
                participants: room.participants,
              },
              ws
            );
            broadcastLobbyRooms();
            break;
          }

          case 'room:set_control_mode': {
            if (!conn.roomId) return;
            const room = rooms.get(conn.roomId);
            if (!room) return;

            // If room is currently locked to host-only, only the active host can change it.
            // If room is in 'everyone' mode (e.g. a seeded room), the user locking it becomes host.
            if (
              room.controlMode === 'host-only' &&
              room.hostId &&
              room.hostId !== conn.clientId
            ) {
              return;
            }

            const nextMode: RoomControlMode =
              msg.controlMode === 'host-only' ? 'host-only' : 'everyone';
            room.hostId = conn.clientId;

            if (room.controlMode !== nextMode) {
              room.controlMode = nextMode;
              appendSystemMessage(
                room,
                nextMode === 'host-only'
                  ? `${conn.userName} locked playback controls to Host Only`
                  : `${conn.userName} unlocked playback controls for Everyone`
              );
              broadcastToRoom(room.id, {
                type: 'room:meta_updated',
                hostId: room.hostId,
                controlMode: room.controlMode,
              });
              broadcastLobbyRooms();
              scheduleSaveRoomsToDisk();
            }
            break;
          }

          case 'room:update_name': {
            const newName = String(msg.userName || '').trim().slice(0, 28);
            if (!newName) return;
            const oldName = conn.userName;
            conn.userName = newName;

            if (conn.roomId) {
              const room = rooms.get(conn.roomId);
              if (room) {
                const participant = room.participants.find((p) => p.id === conn.clientId);
                if (participant && participant.name !== newName) {
                  participant.name = newName;
                  if (oldName !== newName) {
                    appendSystemMessage(room, `${oldName} is now ${newName}`);
                  }
                  broadcastToRoom(room.id, {
                    type: 'room:participants_updated',
                    participants: room.participants,
                  });
                  broadcastLobbyRooms();
                }
              }
            }
            break;
          }

          case 'room:leave': {
            removeClientImmediately(conn);
            sendJson(ws, { type: 'room:left' });
            break;
          }

          // ==================================================================
          // WEBRTC P2P VOICE CHAT SIGNALING
          // ==================================================================
          case 'voice:join': {
            if (!conn.roomId) return;
            const room = rooms.get(conn.roomId);
            if (!room) return;

            const participant = room.participants.find((p) => p.id === conn.clientId);
            if (!participant) return;

            const wasAlreadyInVoice = participant.inVoice;
            participant.inVoice = true;
            participant.isMuted = Boolean(msg.isMuted);

            if (!wasAlreadyInVoice) {
              appendSystemMessage(room, `${conn.userName} joined voice chat`);
            }

            broadcastToRoom(room.id, {
              type: 'room:participants_updated',
              participants: room.participants,
            });

            for (const p of room.participants) {
              if (p.inVoice && p.id !== conn.clientId) {
                sendToClientInRoom(room.id, p.id, {
                  type: 'voice:peer_joined',
                  peerId: conn.clientId,
                  peerName: conn.userName,
                });
              }
            }
            break;
          }

          case 'voice:leave': {
            if (!conn.roomId) return;
            const room = rooms.get(conn.roomId);
            if (!room) return;

            const participant = room.participants.find((p) => p.id === conn.clientId);
            if (participant && participant.inVoice) {
              participant.inVoice = false;
              participant.isMuted = false;
              broadcastToRoom(room.id, {
                type: 'room:participants_updated',
                participants: room.participants,
              });
              broadcastToRoom(room.id, {
                type: 'voice:peer_left',
                peerId: conn.clientId,
              });
            }
            break;
          }

          case 'voice:mute_state': {
            if (!conn.roomId) return;
            const room = rooms.get(conn.roomId);
            if (!room) return;

            const participant = room.participants.find((p) => p.id === conn.clientId);
            if (participant) {
              participant.isMuted = Boolean(msg.isMuted);
              broadcastToRoom(room.id, {
                type: 'room:participants_updated',
                participants: room.participants,
              });
            }
            break;
          }

          case 'voice:signal': {
            if (!conn.roomId) return;
            const targetId = String(msg.toClientId || '');
            if (!targetId) return;

            sendToClientInRoom(conn.roomId, targetId, {
              type: 'voice:signal',
              fromClientId: conn.clientId,
              fromUserName: conn.userName,
              signalType: msg.signalType,
              sdp: msg.sdp,
              candidate: msg.candidate,
            });
            break;
          }

          // ==================================================================
          // VIDEO, PLAYLIST & MUSIC SYNCHRONIZATION
          // ==================================================================
          case 'video:sync': {
            if (!conn.roomId) return;
            const room = rooms.get(conn.roomId);
            if (!room) return;

            if (!canControlPlayback(room, conn.clientId)) {
              sendJson(ws, {
                type: 'video:state_updated',
                playback: {
                  ...room.playback,
                  mediaTime: computeAuthoritativeMediaTime(room),
                  lastUpdatedAt: Date.now(),
                },
                triggeredByClientId: 'server-resync',
              });
              return;
            }

            const action = String(msg.action || 'sync');
            const now = Date.now();

            if (action === 'change_video') {
              const rawInput = String(msg.mediaUrl || msg.videoId || '');
              const parsed = parseMediaInput(rawInput);
              if (!parsed) return;

              const expanded = await expandMediaInputWithPlaylist(parsed, conn.userName);

              room.playback = {
                sourceType: expanded.primary.sourceType,
                mediaUrl: expanded.primary.mediaUrl,
                videoId: expanded.primary.videoId,
                playlistId: expanded.primary.playlistId,
                videoTitle: msg.videoTitle
                  ? String(msg.videoTitle)
                  : expanded.primary.title,
                videoAuthor: msg.videoAuthor
                  ? String(msg.videoAuthor)
                  : expanded.primary.author,
                thumbnailUrl: expanded.primary.thumbnailUrl,
                isPlaying: true,
                mediaTime: 0,
                lastUpdatedAt: now,
                updatedBy: conn.userName,
                actionSummary:
                  expanded.queuedItems.length > 0
                    ? `${conn.userName} started playlist (+${expanded.queuedItems.length} videos queued)`
                    : `${conn.userName} switched stream to "${
                        msg.videoTitle ? String(msg.videoTitle) : expanded.primary.title
                      }"`,
                reloadNonce: (room.playback.reloadNonce || 1) + 1,
              };

              if (expanded.queuedItems.length > 0) {
                // Append all remaining playlist videos to the room queue (avoiding duplicates)
                const existingVideoIds = new Set(room.queue.map((q) => q.videoId));
                const freshItems = expanded.queuedItems.filter(
                  (item) => !existingVideoIds.has(item.videoId)
                );
                room.queue.push(...freshItems);

                broadcastToRoom(room.id, {
                  type: 'queue:updated',
                  queue: room.queue,
                });

                appendSystemMessage(
                  room,
                  `${conn.userName} started playlist "${room.playback.videoTitle}" and queued ${freshItems.length} more videos`
                );
              } else {
                appendSystemMessage(
                  room,
                  `${conn.userName} loaded stream: ${room.playback.videoTitle}`
                );
              }
            } else if (action === 'reload_embed') {
              room.playback = {
                ...room.playback,
                lastUpdatedAt: now,
                updatedBy: conn.userName,
                actionSummary: `${conn.userName} reloaded the stream for the room`,
                reloadNonce: (room.playback.reloadNonce || 1) + 1,
              };
              appendSystemMessage(room, `${conn.userName} synced & reloaded the stream`);
            } else {
              const incomingTime = Number(msg.mediaTime);
              const safeTime =
                Number.isFinite(incomingTime) && incomingTime >= 0
                  ? incomingTime
                  : computeAuthoritativeMediaTime(room);
              const isPlaying = Boolean(msg.isPlaying);

              let summary = `${conn.userName} synced playback`;
              if (action === 'play') {
                summary = `${conn.userName} resumed at ${formatTimecode(safeTime)}`;
              } else if (action === 'pause') {
                summary = `${conn.userName} paused at ${formatTimecode(safeTime)}`;
              } else if (action === 'seek') {
                summary = `${conn.userName} seeked to ${formatTimecode(safeTime)}`;
              }

              room.playback = {
                ...room.playback,
                isPlaying,
                mediaTime: safeTime,
                lastUpdatedAt: now,
                updatedBy: conn.userName,
                actionSummary: summary,
              };
            }

            broadcastToRoom(room.id, {
              type: 'video:state_updated',
              playback: {
                ...room.playback,
                mediaTime: computeAuthoritativeMediaTime(room),
                lastUpdatedAt: Date.now(),
              },
              triggeredByClientId: conn.clientId,
            });
            broadcastLobbyRooms();
            scheduleSaveRoomsToDisk();
            break;
          }

          case 'video:request_sync': {
            if (!conn.roomId) return;
            const room = rooms.get(conn.roomId);
            if (!room) return;
            sendJson(ws, {
              type: 'video:state_updated',
              playback: {
                ...room.playback,
                mediaTime: computeAuthoritativeMediaTime(room),
                lastUpdatedAt: Date.now(),
              },
              triggeredByClientId: 'server-resync',
            });
            break;
          }

          case 'video:ended': {
            if (!conn.roomId) return;
            const room = rooms.get(conn.roomId);
            if (!room) return;

            if (msg.mediaUrl && msg.mediaUrl !== room.playback.mediaUrl) {
              return;
            }

            if (room.queue.length > 0) {
              const nextItem = room.queue.shift()!;
              room.playback = {
                sourceType: nextItem.sourceType,
                mediaUrl: nextItem.mediaUrl,
                videoId: nextItem.videoId,
                videoTitle: nextItem.title,
                videoAuthor: nextItem.author,
                thumbnailUrl: nextItem.thumbnailUrl,
                isPlaying: true,
                mediaTime: 0,
                lastUpdatedAt: Date.now(),
                updatedBy: 'Auto-Queue',
                actionSummary: `Up Next playing: "${nextItem.title}"`,
                reloadNonce: (room.playback.reloadNonce || 1) + 1,
              };
              appendSystemMessage(room, `Now playing from queue: ${nextItem.title}`);
              broadcastToRoom(room.id, {
                type: 'queue:updated',
                queue: room.queue,
              });
              broadcastToRoom(room.id, {
                type: 'video:state_updated',
                playback: room.playback,
                triggeredByClientId: 'server-queue',
              });
              broadcastLobbyRooms();
              scheduleSaveRoomsToDisk();
            }
            break;
          }

          case 'queue:add': {
            if (!conn.roomId) return;
            const room = rooms.get(conn.roomId);
            if (!room || !canControlPlayback(room, conn.clientId)) return;

            const rawUrl = String(msg.videoUrl || msg.mediaUrl || msg.videoId || '');
            const parsed = parseMediaInput(rawUrl);
            if (!parsed) return;

            // Check if the queued URL is a YouTube Playlist
            if (parsed.playlistId) {
              const hasExplicitVid =
                !parsed.mediaUrl.startsWith('playlist:') &&
                /^[a-zA-Z0-9_-]{11}$/.test(parsed.videoId);
              const playlistTracks = await resolveYouTubePlaylistVideos(
                parsed.playlistId,
                hasExplicitVid ? parsed.videoId : undefined
              );
              if (playlistTracks.length > 0) {
                const now = Date.now();
                const existingVideoIds = new Set(room.queue.map((q) => q.videoId));
                const addedItems: QueueItem[] = playlistTracks
                  .filter((track) => !existingVideoIds.has(track.videoId))
                  .map((track, idx) => ({
                    id: `q-pl-${now}-${idx}-${track.videoId}`,
                    sourceType: 'youtube',
                    mediaUrl: track.videoId,
                    videoId: track.videoId,
                    title: track.title,
                    author: track.author,
                    addedBy: conn.userName,
                    addedAt: now + idx,
                  }));

                if (addedItems.length > 0) {
                  room.queue.push(...addedItems);
                  appendSystemMessage(
                    room,
                    `${conn.userName} added ${addedItems.length} videos from YouTube playlist to the queue`
                  );
                  broadcastToRoom(room.id, {
                    type: 'queue:updated',
                    queue: room.queue,
                  });
                  scheduleSaveRoomsToDisk();
                }
                return;
              }
            }

            if (parsed.mediaUrl.startsWith('playlist:') && parsed.playlistId) {
              // If the room is not currently playing this playlist, load it in the player so the browser IFrame API can expand it
              room.playback = {
                sourceType: 'youtube',
                mediaUrl: parsed.mediaUrl,
                videoId: '',
                playlistId: parsed.playlistId,
                videoTitle: parsed.suggestedTitle,
                videoAuthor: 'YouTube Playlist',
                isPlaying: true,
                mediaTime: 0,
                lastUpdatedAt: Date.now(),
                updatedBy: conn.userName,
                actionSummary: `${conn.userName} loaded YouTube playlist`,
                reloadNonce: (room.playback.reloadNonce || 1) + 1,
              };
              broadcastToRoom(room.id, {
                type: 'video:state_updated',
                playback: room.playback,
                triggeredByClientId: conn.clientId,
              });
              return;
            }

            const itemId = String(
              msg.id || `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
            );
            if (room.queue.some((item) => item.id === itemId)) return;

            const meta = await resolveMediaMeta(parsed);
            const newItem: QueueItem = {
              id: itemId,
              sourceType: parsed.sourceType,
              mediaUrl: parsed.mediaUrl,
              videoId: parsed.videoId,
              title: msg.title ? String(msg.title) : meta.title,
              author: msg.author ? String(msg.author) : meta.author,
              thumbnailUrl: meta.thumbnailUrl,
              addedBy: conn.userName,
              addedAt: Date.now(),
            };

            room.queue.push(newItem);
            appendSystemMessage(room, `${conn.userName} queued "${newItem.title}"`);
            broadcastToRoom(room.id, {
              type: 'queue:updated',
              queue: room.queue,
            });
            scheduleSaveRoomsToDisk();
            break;
          }

          case 'playlist:client_resolved': {
            if (!conn.roomId) return;
            const room = rooms.get(conn.roomId);
            if (!room) return;

            const rawVideoIds = Array.isArray(msg.videoIds) ? msg.videoIds : [];
            const cleanIds = rawVideoIds
              .map((id: unknown) => String(id || '').trim())
              .filter((id: string) => /^[a-zA-Z0-9_-]{11}$/.test(id))
              .slice(0, 60);

            if (cleanIds.length === 0) return;

            const firstId = cleanIds[0];
            if (!room.playback.videoId || room.playback.mediaUrl.startsWith('playlist:')) {
              const firstMeta = await resolveYouTubeVideoTitleById(firstId);
              room.playback.videoId = firstId;
              room.playback.mediaUrl = firstId;
              room.playback.videoTitle = firstMeta.title;
              room.playback.videoAuthor = firstMeta.author;
              broadcastToRoom(room.id, {
                type: 'video:state_updated',
                playback: getSnapshotRoomState(room).playback,
                triggeredByClientId: 'server-playlist-sync',
              });
            }

            const activeVid = room.playback.videoId || firstId;
            const remainingIds = cleanIds.filter((id: string) => id !== activeVid);
            const existingQueueIds = new Set(room.queue.map((q) => q.videoId));
            const newIdsToQueue = remainingIds.filter(
              (id: string) => !existingQueueIds.has(id)
            );

            if (newIdsToQueue.length > 0) {
              const now = Date.now();
              // Resolve first 15 titles via OEmbed in parallel for fast queue display
              const resolvedMetas = await Promise.all(
                newIdsToQueue.map((id: string, idx: number) =>
                  idx < 15
                    ? resolveYouTubeVideoTitleById(id)
                    : Promise.resolve({
                        title: `YouTube Track #${idx + 1} (${id})`,
                        author: 'YouTube Playlist',
                      })
                )
              );

              const addedItems: QueueItem[] = newIdsToQueue.map(
                (videoId: string, idx: number) => ({
                  id: `q-cpl-${now}-${idx}-${videoId}`,
                  sourceType: 'youtube',
                  mediaUrl: videoId,
                  videoId,
                  title: resolvedMetas[idx].title,
                  author: resolvedMetas[idx].author,
                  addedBy: conn.userName,
                  addedAt: now + idx,
                })
              );

              room.queue.push(...addedItems);
              broadcastToRoom(room.id, {
                type: 'queue:updated',
                queue: room.queue,
              });
              scheduleSaveRoomsToDisk();
            }
            break;
          }

          case 'queue:clear': {
            if (!conn.roomId) return;
            const room = rooms.get(conn.roomId);
            if (!room || !canControlPlayback(room, conn.clientId)) return;

            if (room.queue.length > 0) {
              room.queue = [];
              appendSystemMessage(room, `${conn.userName} cleared the queue`);
              broadcastToRoom(room.id, {
                type: 'queue:updated',
                queue: room.queue,
              });
              scheduleSaveRoomsToDisk();
            }
            break;
          }

          case 'queue:remove': {
            if (!conn.roomId) return;
            const room = rooms.get(conn.roomId);
            if (!room || !canControlPlayback(room, conn.clientId)) return;

            const itemId = String(msg.itemId || '');
            room.queue = room.queue.filter((item) => item.id !== itemId);
            broadcastToRoom(room.id, {
              type: 'queue:updated',
              queue: room.queue,
            });
            scheduleSaveRoomsToDisk();
            break;
          }

          case 'queue:play_now': {
            if (!conn.roomId) return;
            const room = rooms.get(conn.roomId);
            if (!room || !canControlPlayback(room, conn.clientId)) return;

            const itemId = String(msg.itemId || '');
            const targetIndex = room.queue.findIndex((item) => item.id === itemId);
            if (targetIndex === -1) return;

            const [targetItem] = room.queue.splice(targetIndex, 1);
            room.playback = {
              sourceType: targetItem.sourceType,
              mediaUrl: targetItem.mediaUrl,
              videoId: targetItem.videoId,
              videoTitle: targetItem.title,
              videoAuthor: targetItem.author,
              thumbnailUrl: targetItem.thumbnailUrl,
              isPlaying: true,
              mediaTime: 0,
              lastUpdatedAt: Date.now(),
              updatedBy: conn.userName,
              actionSummary: `${conn.userName} started "${targetItem.title}" from queue`,
              reloadNonce: (room.playback.reloadNonce || 1) + 1,
            };

            appendSystemMessage(
              room,
              `${conn.userName} played "${targetItem.title}" from the queue`
            );
            broadcastToRoom(room.id, {
              type: 'queue:updated',
              queue: room.queue,
            });
            broadcastToRoom(room.id, {
              type: 'video:state_updated',
              playback: room.playback,
              triggeredByClientId: conn.clientId,
            });
            broadcastLobbyRooms();
            scheduleSaveRoomsToDisk();
            break;
          }

          case 'queue:move': {
            if (!conn.roomId) return;
            const room = rooms.get(conn.roomId);
            if (!room || !canControlPlayback(room, conn.clientId)) return;

            const itemId = String(msg.itemId || '');
            const direction = msg.direction === 'up' ? -1 : 1;
            const idx = room.queue.findIndex((i) => i.id === itemId);
            if (idx === -1) return;
            const newIdx = idx + direction;
            if (newIdx < 0 || newIdx >= room.queue.length) return;

            const temp = room.queue[idx];
            room.queue[idx] = room.queue[newIdx];
            room.queue[newIdx] = temp;

            broadcastToRoom(room.id, {
              type: 'queue:updated',
              queue: room.queue,
            });
            scheduleSaveRoomsToDisk();
            break;
          }

          case 'chat:send': {
            if (!conn.roomId) return;
            const room = rooms.get(conn.roomId);
            if (!room) return;

            const text = String(msg.text || '').trim().slice(0, 600);
            if (!text) return;

            const msgId = String(
              msg.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
            );
            if (room.messages.some((m) => m.id === msgId)) return;

            let replyTo: ChatReplyReference | undefined;
            if (msg.replyTo && typeof msg.replyTo === 'object') {
              replyTo = {
                id: String(msg.replyTo.id || ''),
                senderId: String(msg.replyTo.senderId || ''),
                senderName: String(msg.replyTo.senderName || 'User').slice(0, 28),
                senderColor: String(msg.replyTo.senderColor || '#1ed760'),
                text: String(msg.replyTo.text || '').slice(0, 200),
              };
            }

            const chatMessage: ChatMessage = {
              id: msgId,
              senderId: conn.clientId,
              senderName: conn.userName,
              senderColor: conn.userColor,
              text,
              timestamp: Date.now(),
              type: 'user',
              replyTo,
              reactions: {},
            };

            room.messages.push(chatMessage);
            if (room.messages.length > APP_CONFIG.maxChatHistoryPerRoom) {
              room.messages.splice(0, room.messages.length - APP_CONFIG.maxChatHistoryPerRoom);
            }

            broadcastToRoom(room.id, {
              type: 'chat:new_message',
              message: chatMessage,
            });
            scheduleSaveRoomsToDisk();
            break;
          }

          case 'chat:react': {
            if (!conn.roomId) return;
            const room = rooms.get(conn.roomId);
            if (!room) return;

            const messageId = String(msg.messageId || '');
            const emoji = String(msg.emoji || '❤️').slice(0, 8);
            const targetMsg = room.messages.find((m) => m.id === messageId);
            if (!targetMsg) return;

            if (!targetMsg.reactions) {
              targetMsg.reactions = {};
            }
            const currentUsers = targetMsg.reactions[emoji] || [];
            if (currentUsers.includes(conn.userName)) {
              targetMsg.reactions[emoji] = currentUsers.filter((u) => u !== conn.userName);
              if (targetMsg.reactions[emoji].length === 0) {
                delete targetMsg.reactions[emoji];
              }
            } else {
              targetMsg.reactions[emoji] = [...currentUsers, conn.userName];
            }

            broadcastToRoom(room.id, {
              type: 'chat:message_updated',
              message: targetMsg,
            });
            scheduleSaveRoomsToDisk();
            break;
          }

          case 'reaction:send': {
            if (!conn.roomId) return;
            const room = rooms.get(conn.roomId);
            if (!room) return;

            const emoji = String(msg.emoji || '❤️').slice(0, 8);
            const reactionPayload = {
              id: `react-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              emoji,
              senderName: conn.userName,
              offsetX: Math.floor(15 + Math.random() * 70),
              createdAt: Date.now(),
            };

            broadcastToRoom(room.id, {
              type: 'reaction:received',
              reaction: reactionPayload,
            });
            break;
          }
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      const conn = clients.get(ws);
      if (conn) {
        clients.delete(ws);
        if (conn.roomId) {
          const roomId = conn.roomId;
          const clientId = conn.clientId;
          const userName = conn.userName;
          cancelPendingDisconnect(clientId);
          const timer = setTimeout(() => {
            finalizeRemoveParticipant(clientId, roomId, userName);
          }, DISCONNECT_GRACE_MS);
          pendingDisconnects.set(clientId, { timer, roomId, userName });
        }
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    const ips = getLocalNetworkAddresses();
    const primaryLan = ips[0] ? `http://${ips[0]}:${PORT}` : `http://localhost:${PORT}`;
    console.log('\n');
    console.log('  ┌─────────────────────────────────────────────────────────────┐');
    console.log('  │  🎬 SyncCinema Watch Party Server is Ready!                │');
    console.log('  │                                                             │');
    console.log(`  │  ➜ Local:   http://localhost:${PORT}                           │`);
    if (ips[0]) {
      console.log(`  │  ➜ Network: ${primaryLan} (Same Wi-Fi / LAN)      │`);
    }
    console.log('  │                                                             │');
    console.log('  │  🌐 Share with friends over Internet (100% Free):           │');
    console.log('  │     Run in another terminal: npm run tunnel                 │');
    console.log('  │     (Gives you an instant public HTTPS link for friends)    │');
    console.log('  └─────────────────────────────────────────────────────────────┘\n');
  });
}

startServer();
