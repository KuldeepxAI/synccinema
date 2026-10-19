# Infographic Brief: SyncCinema Architecture & Launch

## One Message
SyncCinema is a 100% working, zero-friction open-source watch party studio that runs in 3 commands with zero external databases, zero API keys, P2P WebRTC voice chat, and instant localhost-to-friend sharing.

## Objectives
1. Stop developers and users scrolling past: immediate visual contrast (Spotify Dark + Neon Green).
2. Show the complete value proposition at a glance: 3-command start, zero setup friction, WebRTC audio, and sharing assistant.
3. Establish technical credibility without marketing hype.

## Fact Sheet (Source Tracing)
- **3 Commands to run**: `git clone`, `npm install`, `npm run dev` (Source: `README.md`, `package.json`)
- **Zero External Database**: Auto-persisted to `data/rooms.json` (Source: `server.ts:28`, `src/config.ts:14`)
- **Zero API Keys**: Uses YouTube IFrame API + oEmbed resolution (Source: `server.ts:1130`, `types.ts`)
- **P2P WebRTC Voice**: Browser-to-browser audio mesh via Google STUN (Source: `src/hooks/useVoiceChat.ts`, `src/config.ts:17`)
- **Instant Sharing**: `npm run tunnel` (Cloudflare) + Wi-Fi LAN IP & QR code (Source: `server.ts:1135`, `package.json:11`, `ShareRoomModal.tsx`)
- **Author**: Kuldeep Singh (University of Southampton '29) | `github.com/KuldeepxAI/synccinema`

## Format & Dimensions
- Layout: Bento Grid (1 Hero Cell + 3 Feature Cells + Architecture Ribbon + Footer)
- Style: Technical Schematic / Spotify Minimal Dark
- Resolution: 1200 x 675 px (16:9 aspect ratio, optimized for X & LinkedIn)
