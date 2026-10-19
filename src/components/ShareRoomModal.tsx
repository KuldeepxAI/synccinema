import React, { useState, useEffect } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  Globe,
  Wifi,
  Laptop,
  Cloud,
  QrCode,
  Terminal,
  ExternalLink,
  MessageCircle,
  Send,
  Sparkles,
} from 'lucide-react';

interface ShareRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  roomName: string;
}

export const ShareRoomModal: React.FC<ShareRoomModalProps> = ({
  isOpen,
  onClose,
  roomId,
  roomName,
}) => {
  const [activeTab, setActiveTab] = useState<'internet' | 'wifi' | 'localhost' | 'deploy'>('internet');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [lanUrl, setLanUrl] = useState<string>('');
  const [tunnelInput, setTunnelInput] = useState<string>('');
  const [showQr, setShowQr] = useState(false);

  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '0.0.0.0');

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  // Load saved tunnel URL from localStorage if any
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('synccinema_tunnel_origin');
      if (saved) setTunnelInput(saved);
    }
  }, []);

  // Fetch LAN IP info from server
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/network-info')
      .then((res) => res.json())
      .then((data) => {
        if (data.primaryLanUrl) {
          setLanUrl(`${data.primaryLanUrl}?room=${roomId}`);
        }
      })
      .catch(() => {
        // Fallback if endpoint unreachable
        setLanUrl(`${currentOrigin}?room=${roomId}`);
      });
  }, [isOpen, roomId, currentOrigin]);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2200);
  };

  const handleTunnelChange = (val: string) => {
    const cleaned = val.trim().replace(/\/+$/, '');
    setTunnelInput(cleaned);
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      localStorage.setItem('synccinema_tunnel_origin', cleaned);
    }
  };

  // Compute invite URLs
  const activeOrigin = tunnelInput.trim() ? tunnelInput.trim().replace(/\/+$/, '') : currentOrigin;
  const friendInternetUrl = `${activeOrigin}?room=${roomId}`;
  const localhostUrl = `${currentOrigin}?room=${roomId}`;
  const resolvedLanUrl = lanUrl || `${currentOrigin}?room=${roomId}`;

  const shareText = `Join my SyncCinema watch party room "${roomName}"! Watch together with synchronized playback & voice chat: ${friendInternetUrl}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(friendInternetUrl)}&text=${encodeURIComponent(`Join my watch party: "${roomName}"`)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share Room with Friends"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#121212] border border-[#282828] rounded-2xl shadow-[rgba(0,0,0,0.8)_0px_20px_40px] overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#222222] flex items-center justify-between gap-3 bg-[#181818]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#1ed760]/15 text-[#1ed760] flex items-center justify-center shrink-0">
              <Share2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] sm:text-[16px] font-bold text-white truncate">
                  Share Room
                </h2>
                <span className="font-mono-tabular px-2 py-0.5 rounded bg-[#252525] text-[#1ed760] text-[11px] font-bold">
                  {roomId}
                </span>
              </div>
              <p className="text-[12px] text-[#b3b3b3] truncate">{roomName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#252525] hover:bg-[#303030] text-[#b3b3b3] hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Localhost Guide Alert (shown when running locally) */}
        {isLocalhost ? (
          <div className="px-4 sm:px-5 py-3 bg-[#1a1f18] border-b border-[#283823] flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-[#1ed760] shrink-0 mt-0.5" />
            <div className="text-[12px] text-[#d4f8db] leading-relaxed">
              <span className="font-bold text-[#1ed760]">Running on localhost?</span> Friends outside this computer cannot open <code className="bg-black/30 px-1 py-0.5 rounded text-white font-mono">localhost:3000</code>. Pick an option below to share instantly:
            </div>
          </div>
        ) : (
          <div className="px-4 sm:px-5 py-3 bg-[#142219] border-b border-[#1e3827] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[12px] text-[#1ed760]">
              <Globe className="w-4 h-4 shrink-0" />
              <span>Public Host Active — Share your room link below:</span>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-2 bg-[#161616] border-b border-[#222222] overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('internet')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'internet'
                ? 'bg-white text-black'
                : 'bg-[#202020] text-[#b3b3b3] hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Over Internet</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('wifi')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'wifi'
                ? 'bg-white text-black'
                : 'bg-[#202020] text-[#b3b3b3] hover:text-white'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>Same Wi-Fi</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('localhost')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'localhost'
                ? 'bg-white text-black'
                : 'bg-[#202020] text-[#b3b3b3] hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Local Test</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('deploy')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'deploy'
                ? 'bg-white text-black'
                : 'bg-[#202020] text-[#b3b3b3] hover:text-white'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Deploy 24/7</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* TAB 1: OVER INTERNET */}
          {activeTab === 'internet' && (
            <div className="space-y-4">
              {isLocalhost ? (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[12px] font-bold text-[#b3b3b3] uppercase tracking-[1.2px]">
                      <span>Step 1: Run Cloudflare Tunnel (100% Free)</span>
                      <span className="text-[#1ed760] font-normal normal-case">No account needed</span>
                    </div>
                    <p className="text-[12px] text-[#a0a0a0] leading-relaxed">
                      Keep your app running, open another terminal tab, and run:
                    </p>
                    <div className="flex items-center gap-2 bg-[#181818] border border-[#2a2a2a] rounded-xl p-2.5">
                      <Terminal className="w-4 h-4 text-[#1ed760] shrink-0 ml-1" />
                      <code className="flex-1 font-mono text-[12.5px] text-white select-all overflow-x-auto">
                        npm run tunnel
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy('npm run tunnel', 'tunnel-cmd')}
                        className="px-3 py-1.5 rounded-lg bg-[#252525] hover:bg-[#333333] text-white text-[11px] font-bold transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                      >
                        {copiedKey === 'tunnel-cmd' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#1ed760]" />
                            <span className="text-[#1ed760]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] text-[#7d7d7d]">
                      Alternative one-off: <code className="text-[#b3b3b3] font-mono">npx cloudflared tunnel --url http://localhost:3000</code>
                    </p>
                  </div>

                  <div className="space-y-2 pt-1 border-t border-[#202020]">
                    <span className="text-[12px] font-bold text-[#b3b3b3] uppercase tracking-[1.2px] block">
                      Step 2: Paste your tunnel URL
                    </span>
                    <input
                      type="url"
                      value={tunnelInput}
                      onChange={(e) => handleTunnelChange(e.target.value)}
                      placeholder="e.g. https://free-words.trycloudflare.com"
                      className="w-full bg-[#181818] border border-[#2e2e2e] rounded-xl px-3.5 py-2.5 text-[13px] text-white placeholder-[#666666] focus:outline-none focus:border-[#1ed760]"
                    />
                  </div>
                </>
              ) : (
                <div className="p-3 rounded-xl bg-[#181818] border border-[#252525] space-y-1">
                  <div className="text-[12px] font-bold text-[#1ed760]">Direct Public Watch Party Link</div>
                  <p className="text-[12px] text-[#b3b3b3]">
                    Anyone with this link can join your watch party from any device anywhere in the world.
                  </p>
                </div>
              )}

              {/* Ready Link Output */}
              <div className="space-y-2 pt-2">
                <span className="text-[12px] font-bold text-[#b3b3b3] uppercase tracking-[1.2px] block">
                  Friend Watch Party Link
                </span>
                <div className="flex items-center gap-2 bg-[#181818] border border-[#2a2a2a] rounded-xl p-2.5">
                  <span className="flex-1 font-mono text-[12px] text-white truncate select-all px-1">
                    {friendInternetUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(friendInternetUrl, 'friend-link')}
                    className="px-4 py-2 rounded-lg bg-[#1ed760] hover:bg-[#1fdf64] text-black text-[12px] font-bold uppercase tracking-[1.1px] transition-all cursor-pointer shrink-0 flex items-center gap-1.5 shadow-[rgba(0,0,0,0.4)_0px_2px_6px]"
                  >
                    {copiedKey === 'friend-link' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 1-Click Social Sharing */}
              <div className="flex items-center gap-2 pt-1">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#25d366]/15 hover:bg-[#25d366]/25 text-[#25d366] text-[12px] font-bold transition-colors cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Share WhatsApp</span>
                </a>
                <a
                  href={telegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#229ed9]/15 hover:bg-[#229ed9]/25 text-[#229ed9] text-[12px] font-bold transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Share Telegram</span>
                </a>
              </div>
            </div>
          )}

          {/* TAB 2: SAME WI-FI / LAN */}
          {activeTab === 'wifi' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#181818] border border-[#252525] space-y-1.5">
                <div className="flex items-center gap-2 text-[13px] font-bold text-white">
                  <Wifi className="w-4 h-4 text-[#1ed760]" />
                  <span>Local Wi-Fi Network Sharing</span>
                </div>
                <p className="text-[12px] text-[#b3b3b3] leading-relaxed">
                  Anyone connected to the same home or office Wi-Fi can join directly using your computer&apos;s local IP—no internet tunnels or accounts required!
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-[12px] font-bold text-[#b3b3b3] uppercase tracking-[1.2px] block">
                  Wi-Fi Network URL
                </span>
                <div className="flex items-center gap-2 bg-[#181818] border border-[#2a2a2a] rounded-xl p-2.5">
                  <span className="flex-1 font-mono text-[12.5px] text-white truncate select-all px-1">
                    {resolvedLanUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(resolvedLanUrl, 'lan-link')}
                    className="px-4 py-2 rounded-lg bg-[#1ed760] hover:bg-[#1fdf64] text-black text-[12px] font-bold uppercase tracking-[1.1px] transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
                  >
                    {copiedKey === 'lan-link' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* QR Code toggle */}
              <div className="pt-2 border-t border-[#202020] flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => setShowQr(!showQr)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#202020] hover:bg-[#282828] text-white text-[12px] font-bold transition-colors cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5 text-[#1ed760]" />
                  <span>{showQr ? 'Hide Phone QR Code' : 'Show Phone QR Code'}</span>
                </button>

                {showQr && (
                  <div className="mt-3 p-4 bg-white rounded-2xl flex flex-col items-center gap-2 shadow-lg">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                        resolvedLanUrl
                      )}`}
                      alt="Room Join QR Code"
                      className="w-[180px] h-[180px]"
                    />
                    <span className="text-[11px] font-bold text-black font-mono">
                      Scan with Phone Camera on Wi-Fi
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: LOCAL TEST */}
          {activeTab === 'localhost' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#181818] border border-[#252525] space-y-1.5">
                <div className="flex items-center gap-2 text-[13px] font-bold text-white">
                  <Laptop className="w-4 h-4 text-[#1ed760]" />
                  <span>Test in Another Browser Window</span>
                </div>
                <p className="text-[12px] text-[#b3b3b3] leading-relaxed">
                  Open this link in an Incognito window or another browser (Chrome, Firefox, Edge, Safari) to test synchronized playback, reactions, and voice chat between two simulated viewers.
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-[12px] font-bold text-[#b3b3b3] uppercase tracking-[1.2px] block">
                  Localhost Link
                </span>
                <div className="flex items-center gap-2 bg-[#181818] border border-[#2a2a2a] rounded-xl p-2.5">
                  <span className="flex-1 font-mono text-[12.5px] text-white truncate select-all px-1">
                    {localhostUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(localhostUrl, 'local-link')}
                    className="px-4 py-2 rounded-lg bg-[#1ed760] hover:bg-[#1fdf64] text-black text-[12px] font-bold uppercase tracking-[1.1px] transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
                  >
                    {copiedKey === 'local-link' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DEPLOY 24/7 */}
          {activeTab === 'deploy' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-[#181818] border border-[#252525] space-y-2">
                <div className="flex items-center gap-2 text-[13px] font-bold text-white">
                  <Cloud className="w-4 h-4 text-[#1ed760]" />
                  <span>Host Free 24/7 on the Cloud</span>
                </div>
                <p className="text-[12px] text-[#b3b3b3] leading-relaxed">
                  Deploy your GitHub repository once to a free Node.js hosting platform (Render, Railway, Fly.io) so friends can join anytime without keeping your computer awake:
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#161616] border border-[#252525] space-y-2 text-[12px]">
                <div className="flex justify-between items-center text-[#b3b3b3]">
                  <span>Build Command:</span>
                  <code className="bg-[#202020] px-2 py-0.5 rounded text-white font-mono text-[11px]">
                    npm install && npm run build
                  </code>
                </div>
                <div className="flex justify-between items-center text-[#b3b3b3]">
                  <span>Start Command:</span>
                  <code className="bg-[#202020] px-2 py-0.5 rounded text-white font-mono text-[11px]">
                    NODE_ENV=production npm start
                  </code>
                </div>
                <div className="flex justify-between items-center text-[#b3b3b3]">
                  <span>Port Environment:</span>
                  <code className="bg-[#202020] px-2 py-0.5 rounded text-white font-mono text-[11px]">
                    PORT=3000
                  </code>
                </div>
              </div>

              <a
                href="https://render.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-[#252525] hover:bg-[#303030] text-white text-[12px] font-bold transition-colors cursor-pointer"
              >
                <span>Open Render Free Web Service Guide</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#b3b3b3]" />
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 px-5 border-t border-[#222222] bg-[#141414] flex items-center justify-between text-[11px] text-[#888888]">
          <span>Room Code: <strong className="text-white font-mono">{roomId}</strong></span>
          <button
            type="button"
            onClick={onClose}
            className="text-[#b3b3b3] hover:text-white font-bold cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
