/**
 * SyncCinema — Centralized Open-Source Configuration
 * Forkers & self-hosters can customize branding, default streams,
 * WebRTC STUN servers, and room limits from this single file.
 */

export const APP_CONFIG = {
  appName: 'SyncCinema',
  tagline: 'Real-Time Synchronized Watch Party & Live Stream Studio',

  // Server & Room Limits
  maxChatHistoryPerRoom: 150,
  disconnectGracePeriodMs: 12_000,
  enableJsonDiskPersistence: true,

  // Free Public Google STUN Servers for P2P WebRTC Voice Chat
  rtcIceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],

  // Room Categories shown in Lobby filter pills
  categories: [
    'All',
    'Live Sports',
    'Music & Chill',
    'Short Films',
    'Watch Party',
  ],
} as const;
