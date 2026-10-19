<div align="center">
  <h1>🎬 SyncCinema</h1>
  <p><strong>Real-Time Collaborative Watch Party & Live Stream Studio</strong></p>
  <p><em>Zero-friction, zero-dependency, self-hostable watch-party platform with frame-accurate video synchronization, peer-to-peer WebRTC voice chat, WhatsApp-style live chat, and instant localhost-to-friend sharing.</em></p>
  <p>Built with curiosity and a focus on meaningful tech by <a href="https://github.com/KuldeepxAI"><strong>Kuldeep Singh</strong></a>.</p>

  <p>
    <a href="https://github.com/KuldeepxAI/synccinema/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-1ed760.svg" alt="License: MIT"></a>
    <a href="https://github.com/KuldeepxAI/synccinema"><img src="https://img.shields.io/badge/GitHub-KuldeepxAI%2Fsynccinema-1ed760?logo=github" alt="GitHub Repository"></a>
    <a href="https://www.linkedin.com/in/kuldeepxai"><img src="https://img.shields.io/badge/LinkedIn-Kuldeep%20Singh-0077b5?logo=linkedin" alt="LinkedIn"></a>
    <a href="https://x.com/Kuldeepxai"><img src="https://img.shields.io/badge/X-@Kuldeepxai-000000?logo=x" alt="X (Twitter)"></a>
  </p>
</div>

---

## 🌟 Highlights

**SyncCinema** is an open-source watch-party studio crafted with **Spotify's minimal dark aesthetics** and **WhatsApp's familiar real-time chat experience**. Watch **YouTube**, **Live Sports/Web Streams**, **HLS (`.m3u8`)**, and **Direct Videos (`.mp4`/`.webm`)** in synchronized lockstep with friends worldwide.

- **100% Zero External Database Setup**: Automatically persists rooms, queues, and chat to lightweight local JSON (`data/rooms.json`) out of the box—no MongoDB, PostgreSQL, or Redis needed.
- **Zero API Key Friction**: Resolves YouTube metadata and syncs video playback without requiring Google Cloud or YouTube API keys.
- **P2P WebRTC Voice Chat**: Talk with room participants with low-latency audio via browser-to-browser WebRTC using free Google STUN servers—zero media bandwidth cost on your server.
- **Instant Localhost Friend Sharing**: Run it locally in 3 commands, and share with remote friends in 1 command using the built-in tunnel assistant or local Wi-Fi QR code.

---

## ⚡ Quick Start (3 Commands)

Clone, install, and run locally in under 30 seconds:

```bash
git clone https://github.com/KuldeepxAI/synccinema.git
cd synccinema
npm install
npm run dev
```

Open **`http://localhost:3000`** in your browser.

---

## 🌐 How Can Friends Join If You Run on `localhost:3000`?

When you run `npm run dev` on your machine, `localhost:3000` is private to your computer by default. SyncCinema has a **built-in Share Room Assistant** that makes sharing seamless across 3 free options:

### Option 1: Share Over the Internet (100% Free, Zero Account)
Keep `npm run dev` running, and in a second terminal tab run:

```bash
npm run tunnel
```

Cloudflare Quick Tunnel instantly generates a secure public HTTPS URL (e.g. `https://random-words.trycloudflare.com`):
1. In your room, click **"Invite"** or **"Share & Invite Friends"**.
2. Paste your tunnel URL into the dialog.
3. SyncCinema automatically generates your friend links with **1-click WhatsApp and Telegram share buttons**!
4. Video sync, real-time chat, and WebRTC voice chat work automatically worldwide.

### Option 2: Share on the Same Wi-Fi / LAN (Home, Hostel, Campus)
SyncCinema automatically detects your local network IP and binds to `0.0.0.0:3000`. Anyone on your Wi-Fi network can join directly without any internet tunnels:
- Open the **Share Room** modal and click the **"Same Wi-Fi"** tab.
- Click **"Show Phone QR Code"** so friends on mobile can scan with their phone camera to join instantly!

### Option 3: Free 24/7 Cloud Hosting (Render / Railway / Fly.io / Docker)
Deploy the repo once to a free cloud host so you have a permanent 24/7 URL (e.g., `https://my-synccinema.onrender.com`):
- **Build Command**: `npm install && npm run build`
- **Start Command**: `NODE_ENV=production npm start`
- **Port**: `3000`

---

## 🚀 Core Features

### 📺 Universal Multi-Source Media Player
- **YouTube**: Full playback sync for `youtube.com/watch?v=...`, `youtu.be/...`, shorts, and live streams using the YouTube IFrame API + OEmbed metadata resolution (zero API keys).
- **Live Sports & Web Streams**: Watch embedded sports portals, live TV broadcasts, Vimeo, and Dailymotion streams with a built-in **Popup Shield** (`sandbox` protection) and room-wide **Reload Sync**.
- **HLS (`.m3u8`) & Direct Video (`.mp4`, `.webm`)**: Native HTML5 + `hls.js` playback with synchronized play, pause, and timeline scrubbing.

### 🎙️ Peer-to-Peer WebRTC Voice Chat
- Low-latency browser-to-browser voice chat with room members.
- Mic mute/unmute toggles, active speaker green ring indicators, and connection status pills.
- Free Google STUN servers pre-configured with zero configuration.

### 💬 WhatsApp-Style Dark Chat & Live Reactions
- **Quote-Reply**: Double-click or hover any message to reply directly.
- **Emoji Reactions**: React to individual messages (`👍 ❤️ 😂 🔥 😮 👏`).
- **Floating Stage Reactions**: Blast animated floating emojis across the video stage in real time.

### 🔒 Host Lock & Collaborative Controls
- **Everyone Controls**: Anyone in the room can search, change streams, seek, and manage the queue.
- **Host Only**: The host can lock playback controls and playlist queueing for larger public watch parties.

---

## 🛠️ Architecture & Tech Stack

```text
synccinema/
├── server.ts               # Express + WebSocket backend + network IP discovery + local JSON persistence
├── src/
│   ├── config.ts           # Central configuration (branding, STUN servers, limits)
│   ├── types.ts            # Data models, protocol types & curated streams
│   ├── components/
│   │   ├── LobbyView.tsx          # Public room browser, categories & room creation
│   │   ├── YouTubeSyncPlayer.tsx  # Universal synced video player & floating reactions
│   │   ├── StudioSidebar.tsx      # WhatsApp-style chat, shared queue & participants
│   │   └── ShareRoomModal.tsx     # Localhost-to-friend sharing assistant & QR generator
│   └── hooks/
│       └── useVoiceChat.ts        # P2P WebRTC audio mesh network hook
├── data/                   # Auto-created local JSON storage (rooms.json)
└── package.json            # Scripts: dev, start, build, tunnel, lint
```

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Motion.
- **Backend**: Node.js, Express, `ws` (WebSockets), `tsx`.
- **Media Engine**: YouTube IFrame API, `hls.js`, HTML5 Video.
- **Voice Engine**: Browser-native WebRTC `RTCPeerConnection` with STUN discovery.

---

## ⚙️ Customization (`src/config.ts`)

Self-hosters and forkers can customize everything from [`src/config.ts`](file:///c:/Users/kulde/Developer/AI-Projects/Github%20Opensource/synccinema/src/config.ts):

```typescript
export const APP_CONFIG = {
  appName: 'SyncCinema',
  tagline: 'Real-Time Synchronized Watch Party & Live Stream Studio',
  maxChatHistoryPerRoom: 150,
  disconnectGracePeriodMs: 12_000,
  enableJsonDiskPersistence: true,
  rtcIceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  categories: ['All', 'Live Sports', 'Music & Chill', 'Short Films', 'Watch Party'],
};
```

---

## 👤 About the Author

**Kuldeep Singh** (BSc Computer Science, University of Southampton '29) is a technologist passionate about AI, meaningful software engineering, geopolitics, and digital journalism. 

Creator of **VisionMate** (AI multimodal accessibility tool for visually impaired users) and **MarkItDown for VS Code** (zero-dependency file-to-context bridge for local AI models).

- **GitHub:** [@KuldeepxAI](https://github.com/KuldeepxAI)
- **LinkedIn:** [Kuldeep Singh](https://www.linkedin.com/in/kuldeepxai)
- **X (Twitter):** [@Kuldeepxai](https://x.com/Kuldeepxai)

---

## 📄 License

This project is open-source under the [MIT License](LICENSE) — free to use, modify, distribute, and self-host.
