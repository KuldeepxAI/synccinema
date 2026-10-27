import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  RefreshCw,
  SkipForward,
  Maximize2,
  ShieldCheck,
  ShieldOff,
  Music,
  Disc3,
} from 'lucide-react';
import {
  PlaybackState,
  FloatingReaction,
  REACTION_EMOJIS,
  formatTimecode,
} from '../types';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }
  if (ytApiPromise) {
    return ytApiPromise;
  }

  ytApiPromise = new Promise<void>((resolve) => {
    const existingCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (existingCallback) existingCallback();
      resolve();
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return ytApiPromise;
}

interface YouTubeSyncPlayerProps {
  playback: PlaybackState;
  reactions: FloatingReaction[];
  hasNextInQueue: boolean;
  onSyncAction: (
    action: 'play' | 'pause' | 'seek' | 'reload_embed',
    mediaTime: number,
    isPlaying: boolean
  ) => void;
  onRequestResync: () => void;
  onVideoEnded: (mediaUrl: string) => void;
  onSendReaction: (emoji: string) => void;
  onPlayNextInQueue: () => void;
  onClientPlaylistResolved?: (playlistId: string, videoIds: string[]) => void;
}

export const YouTubeSyncPlayer: React.FC<YouTubeSyncPlayerProps> = ({
  playback,
  reactions,
  hasNextInQueue,
  onSyncAction,
  onRequestResync,
  onVideoEnded,
  onSendReaction,
  onPlayNextInQueue,
  onClientPlaylistResolved,
}) => {
  const stageWrapperRef = useRef<HTMLDivElement | null>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytReadyRef = useRef<boolean>(false);

  const htmlVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsInstanceRef = useRef<Hls | null>(null);

  const suppressOutboundUntilRef = useRef<number>(0);
  const currentLoadedMediaRef = useRef<string>(playback.mediaUrl);
  const latestPlaybackRef = useRef<PlaybackState>(playback);
  const reportedPlaylistsRef = useRef<Set<string>>(new Set());
  const playlistResolvedCallbackRef = useRef(onClientPlaylistResolved);
  playlistResolvedCallbackRef.current = onClientPlaylistResolved;

  const [playerReady, setPlayerReady] = useState(false);
  const [localPlaying, setLocalPlaying] = useState(playback.isPlaying);
  const [currentTime, setCurrentTime] = useState(playback.mediaTime || 0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(85);
  const [driftSeconds, setDriftSeconds] = useState(0);

  const [usePopupShield, setUsePopupShield] = useState(true);
  const [localIframeKey, setLocalIframeKey] = useState(0);
  const [playerWarning, setPlayerWarning] = useState<string | null>(null);
  const hasPlayerErrorRef = useRef<boolean>(false);

  latestPlaybackRef.current = playback;

  const isHtmlMedia =
    playback.sourceType === 'hls' ||
    playback.sourceType === 'direct-video' ||
    playback.sourceType === 'direct-audio';

  const isIframeStage =
    playback.sourceType === 'embed-web' || playback.sourceType === 'music-embed';

  const getExpectedRoomTime = useCallback((pb: PlaybackState): number => {
    if (pb.sourceType === 'embed-web' || pb.sourceType === 'music-embed') return 0;
    if (!pb.isPlaying) return pb.mediaTime;
    const elapsed = Math.max(0, (Date.now() - pb.lastUpdatedAt) / 1000);
    return pb.mediaTime + elapsed;
  }, []);

  // ============================================================================
  // 1. YOUTUBE PLAYER ENGINE
  // ============================================================================
  const inspectAndReportYouTubePlaylist = useCallback((player: any, pb: PlaybackState) => {
    if (!pb.playlistId || !player || typeof player.getPlaylist !== 'function') return;
    if (reportedPlaylistsRef.current.has(pb.playlistId)) return;

    try {
      const list = player.getPlaylist();
      if (Array.isArray(list) && list.length > 0) {
        reportedPlaylistsRef.current.add(pb.playlistId);
        playlistResolvedCallbackRef.current?.(pb.playlistId, list);
      }
    } catch {
      // Ignore if playlist not ready yet
    }
  }, []);

  const applyYouTubeState = useCallback(
    (pb: PlaybackState, forceSeek = false) => {
      if (pb.sourceType !== 'youtube') return;
      const player = ytPlayerRef.current;
      if (!player || !ytReadyRef.current || typeof player.getPlayerState !== 'function') {
        return;
      }

      const expectedTime = getExpectedRoomTime(pb);
      const targetKey = pb.videoId || (pb.playlistId ? `playlist:${pb.playlistId}` : '');

      if (targetKey && targetKey !== currentLoadedMediaRef.current) {
        currentLoadedMediaRef.current = targetKey;
        hasPlayerErrorRef.current = false;
        setPlayerWarning(null);
        suppressOutboundUntilRef.current = Date.now() + 1400;

        if (!pb.videoId && pb.playlistId && typeof player.loadPlaylist === 'function') {
          player.loadPlaylist({
            listType: 'playlist',
            list: pb.playlistId,
            index: 0,
            startSeconds: 0,
          });
          setTimeout(() => {
            inspectAndReportYouTubePlaylist(ytPlayerRef.current, latestPlaybackRef.current);
          }, 1200);
        } else if (pb.videoId) {
          player.loadVideoById({
            videoId: pb.videoId,
            startSeconds: Math.max(0, Math.floor(expectedTime)),
          });
        }

        if (!pb.isPlaying) {
          setTimeout(() => {
            if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
              suppressOutboundUntilRef.current = Date.now() + 900;
              ytPlayerRef.current.pauseVideo();
            }
          }, 450);
        }
        setLocalPlaying(pb.isPlaying);
        setCurrentTime(expectedTime);
        return;
      }

      const actualTime = Number(player.getCurrentTime?.() || 0);
      const timeDiff = Math.abs(actualTime - expectedTime);

      if (forceSeek || timeDiff > 1.5) {
        suppressOutboundUntilRef.current = Date.now() + 1000;
        player.seekTo(expectedTime, true);
        setCurrentTime(expectedTime);
      }

      const ytState = player.getPlayerState();
      if (pb.isPlaying && ytState !== 1 && ytState !== 3) {
        suppressOutboundUntilRef.current = Date.now() + 900;
        player.playVideo();
        setLocalPlaying(true);
      } else if (!pb.isPlaying && ytState === 1) {
        suppressOutboundUntilRef.current = Date.now() + 900;
        player.pauseVideo();
        setLocalPlaying(false);
      }
    },
    [getExpectedRoomTime, inspectAndReportYouTubePlaylist]
  );

  useEffect(() => {
    if (playback.sourceType !== 'youtube') {
      ytReadyRef.current = false;
      setPlayerReady(false);
      if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === 'function') {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // Ignore cleanup
        }
      }
      ytPlayerRef.current = null;
      return;
    }

    let isMounted = true;

    loadYouTubeApi().then(() => {
      if (!isMounted || !ytContainerRef.current) return;

      const mountDiv = document.createElement('div');
      ytContainerRef.current.innerHTML = '';
      ytContainerRef.current.appendChild(mountDiv);

      const initialPb = latestPlaybackRef.current;
      currentLoadedMediaRef.current =
        initialPb.videoId ||
        (initialPb.playlistId ? `playlist:${initialPb.playlistId}` : '');

      const playerVars: Record<string, unknown> = {
        autoplay: initialPb.isPlaying ? 1 : 0,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        start: Math.max(0, Math.floor(getExpectedRoomTime(initialPb))),
      };

      if (!initialPb.videoId && initialPb.playlistId) {
        playerVars.listType = 'playlist';
        playerVars.list = initialPb.playlistId;
      }

      ytPlayerRef.current = new window.YT.Player(mountDiv, {
        width: '100%',
        height: '100%',
        videoId: initialPb.videoId || undefined,
        playerVars,
        events: {
          onReady: (event: any) => {
            if (!isMounted) return;
            ytReadyRef.current = true;
            setPlayerReady(true);
            const dur = Number(event.target.getDuration?.() || 0);
            if (dur > 0) setDuration(dur);
            event.target.setVolume?.(85);
            applyYouTubeState(latestPlaybackRef.current, true);
            inspectAndReportYouTubePlaylist(event.target, latestPlaybackRef.current);
          },
          onError: (event: any) => {
            if (!isMounted) return;
            hasPlayerErrorRef.current = true;
            suppressOutboundUntilRef.current = Date.now() + 5000;
            const code = Number(event.data);
            if (code === 101 || code === 150) {
              setPlayerWarning('The owner of this video restricts playback inside embedded players.');
            } else if (code === 5) {
              setPlayerWarning('HTML5 playback issue. Try clicking Resync.');
            }
          },
          onStateChange: (event: any) => {
            if (!isMounted) return;
            const state = event.data;
            const player = event.target;
            const now = Date.now();
            const curTime = Number(player.getCurrentTime?.() || 0);
            const dur = Number(player.getDuration?.() || 0);
            if (dur > 0) setDuration(dur);

            inspectAndReportYouTubePlaylist(player, latestPlaybackRef.current);

            if (state === 0) {
              onVideoEnded(latestPlaybackRef.current.mediaUrl);
              return;
            }

            if (now < suppressOutboundUntilRef.current) {
              setLocalPlaying(state === 1 || state === 3);
              return;
            }

            if (state === 1) {
              hasPlayerErrorRef.current = false;
              setLocalPlaying(true);
              const expected = getExpectedRoomTime(latestPlaybackRef.current);
              const jumped = Math.abs(curTime - expected) > 2.0;
              if (!latestPlaybackRef.current.isPlaying || jumped) {
                onSyncAction(jumped ? 'seek' : 'play', curTime, true);
              }
            } else if (state === 2) {
              setLocalPlaying(false);
              const isWindowFocused = typeof document !== 'undefined' ? document.hasFocus() : true;
              const hasLocalError = hasPlayerErrorRef.current;
              // Prevent cascade pause: do not broadcast pause if this device encountered an error or is in an unfocused background tab
              if (latestPlaybackRef.current.isPlaying && isWindowFocused && !hasLocalError) {
                onSyncAction('pause', curTime, false);
              }
            }
          },
        },
      });
    });

    return () => {
      isMounted = false;
      ytReadyRef.current = false;
      if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === 'function') {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // Ignore unmount cleanup
        }
      }
      ytPlayerRef.current = null;
    };
  }, [playback.sourceType, applyYouTubeState, getExpectedRoomTime, onSyncAction, onVideoEnded]);

  // ============================================================================
  // 2. HTML5 VIDEO, AUDIO & HLS (.M3U8) STREAM ENGINE
  // ============================================================================
  const applyHtmlVideoState = useCallback(
    (pb: PlaybackState, forceSeek = false) => {
      if (
        pb.sourceType !== 'hls' &&
        pb.sourceType !== 'direct-video' &&
        pb.sourceType !== 'direct-audio'
      ) {
        return;
      }
      const videoEl = htmlVideoRef.current;
      if (!videoEl) return;

      const expectedTime = getExpectedRoomTime(pb);
      const actualTime = Number(videoEl.currentTime || 0);
      const diff = Math.abs(actualTime - expectedTime);

      if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
        if (forceSeek || diff > 1.8) {
          suppressOutboundUntilRef.current = Date.now() + 900;
          videoEl.currentTime = expectedTime;
          setCurrentTime(expectedTime);
        }
      }

      if (pb.isPlaying && videoEl.paused) {
        suppressOutboundUntilRef.current = Date.now() + 900;
        videoEl.play().catch(() => {});
        setLocalPlaying(true);
      } else if (!pb.isPlaying && !videoEl.paused) {
        suppressOutboundUntilRef.current = Date.now() + 900;
        videoEl.pause();
        setLocalPlaying(false);
      }
    },
    [getExpectedRoomTime]
  );

  useEffect(() => {
    if (
      playback.sourceType !== 'hls' &&
      playback.sourceType !== 'direct-video' &&
      playback.sourceType !== 'direct-audio'
    ) {
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
      return;
    }

    const videoEl = htmlVideoRef.current;
    if (!videoEl) return;

    currentLoadedMediaRef.current = playback.mediaUrl;
    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }

    if (playback.sourceType === 'hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsInstanceRef.current = hls;
        hls.loadSource(playback.mediaUrl);
        hls.attachMedia(videoEl);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setPlayerReady(true);
          applyHtmlVideoState(latestPlaybackRef.current, true);
        });
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = playback.mediaUrl;
        setPlayerReady(true);
        applyHtmlVideoState(latestPlaybackRef.current, true);
      }
    } else {
      videoEl.src = playback.mediaUrl;
      setPlayerReady(true);
      applyHtmlVideoState(latestPlaybackRef.current, true);
    }

    return () => {
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
    };
  }, [playback.sourceType, playback.mediaUrl, applyHtmlVideoState]);

  useEffect(() => {
    if (playback.sourceType === 'youtube' && playerReady) {
      applyYouTubeState(playback, false);
    } else if (isHtmlMedia && playerReady) {
      applyHtmlVideoState(playback, false);
    }
  }, [playback, playerReady, isHtmlMedia, applyYouTubeState, applyHtmlVideoState]);

  useEffect(() => {
    const interval = setInterval(() => {
      const pb = latestPlaybackRef.current;
      if (pb.sourceType === 'youtube') {
        const player = ytPlayerRef.current;
        if (!player || !ytReadyRef.current || typeof player.getCurrentTime !== 'function') {
          return;
        }
        const actual = Number(player.getCurrentTime() || 0);
        const dur = Number(player.getDuration?.() || 0);
        setCurrentTime(actual);
        if (dur > 0) setDuration(dur);

        const expected = getExpectedRoomTime(pb);
        setDriftSeconds(Math.abs(actual - expected));
      } else if (
        pb.sourceType === 'hls' ||
        pb.sourceType === 'direct-video' ||
        pb.sourceType === 'direct-audio'
      ) {
        const videoEl = htmlVideoRef.current;
        if (!videoEl) return;
        const actual = Number(videoEl.currentTime || 0);
        const dur = Number(videoEl.duration || 0);
        setCurrentTime(actual);
        setDuration(Number.isFinite(dur) && dur > 0 ? dur : 0);

        const expected = getExpectedRoomTime(pb);
        setDriftSeconds(Math.abs(actual - expected));
      } else {
        setDriftSeconds(0);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [getExpectedRoomTime]);

  const handleTogglePlayPause = () => {
    hasPlayerErrorRef.current = false;
    setPlayerWarning(null);
    if (playback.sourceType === 'youtube') {
      const player = ytPlayerRef.current;
      if (!player || !ytReadyRef.current) return;
      const curTime = Number(player.getCurrentTime?.() || currentTime);
      const nextPlaying = !localPlaying;
      suppressOutboundUntilRef.current = Date.now() + 900;

      if (nextPlaying) {
        player.playVideo();
        setLocalPlaying(true);
        onSyncAction('play', curTime, true);
      } else {
        player.pauseVideo();
        setLocalPlaying(false);
        onSyncAction('pause', curTime, false);
      }
    } else if (isHtmlMedia) {
      const videoEl = htmlVideoRef.current;
      if (!videoEl) return;
      const curTime = Number(videoEl.currentTime || currentTime);
      const nextPlaying = videoEl.paused;
      suppressOutboundUntilRef.current = Date.now() + 900;

      if (nextPlaying) {
        videoEl.play().catch(() => {});
        setLocalPlaying(true);
        onSyncAction('play', curTime, true);
      } else {
        videoEl.pause();
        setLocalPlaying(false);
        onSyncAction('pause', curTime, false);
      }
    }
  };

  const handleSeekOffset = (deltaSeconds: number) => {
    const maxTime = duration > 0 ? duration : currentTime + 3600;
    const targetTime = Math.max(0, Math.min(maxTime, currentTime + deltaSeconds));
    suppressOutboundUntilRef.current = Date.now() + 1000;

    if (playback.sourceType === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      ytPlayerRef.current.seekTo(targetTime, true);
      setCurrentTime(targetTime);
      onSyncAction('seek', targetTime, localPlaying);
    } else if (isHtmlMedia && htmlVideoRef.current) {
      htmlVideoRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
      onSyncAction('seek', targetTime, localPlaying);
    }
  };

  const handleTimelineScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = Number(e.target.value);
    setCurrentTime(targetTime);
    suppressOutboundUntilRef.current = Date.now() + 1000;

    if (playback.sourceType === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      ytPlayerRef.current.seekTo(targetTime, true);
      onSyncAction('seek', targetTime, localPlaying);
    } else if (isHtmlMedia && htmlVideoRef.current) {
      htmlVideoRef.current.currentTime = targetTime;
      onSyncAction('seek', targetTime, localPlaying);
    }
  };

  const handleToggleMute = () => {
    if (playback.sourceType === 'youtube') {
      const player = ytPlayerRef.current;
      if (!player || !ytReadyRef.current) return;
      if (isMuted) {
        player.unMute?.();
        player.setVolume?.(volume || 80);
        setIsMuted(false);
      } else {
        player.mute?.();
        setIsMuted(true);
      }
    } else if (htmlVideoRef.current) {
      htmlVideoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (playback.sourceType === 'youtube') {
      const player = ytPlayerRef.current;
      if (player && ytReadyRef.current) {
        player.setVolume?.(val);
        if (val === 0) {
          player.mute?.();
          setIsMuted(true);
        } else if (isMuted) {
          player.unMute?.();
          setIsMuted(false);
        }
      }
    } else if (htmlVideoRef.current) {
      htmlVideoRef.current.volume = val / 100;
      htmlVideoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const handleFullscreen = () => {
    if (!stageWrapperRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      stageWrapperRef.current.requestFullscreen?.().catch(() => {});
    }
  };

  const handleForceResync = () => {
    hasPlayerErrorRef.current = false;
    setPlayerWarning(null);
    if (isIframeStage) {
      setLocalIframeKey((k) => k + 1);
      onSyncAction('reload_embed', 0, true);
      return;
    }
    if (playback.sourceType === 'youtube') {
      applyYouTubeState(latestPlaybackRef.current, true);
    } else {
      applyHtmlVideoState(latestPlaybackRef.current, true);
    }
    onRequestResync();
  };

  const isInSync = driftSeconds <= 2.0;

  return (
    <div className="flex flex-col bg-[#181818] rounded-lg overflow-hidden shadow-[rgba(0,0,0,0.3)_0px_8px_8px]">
      {/* 16:9 Cinema & Music Stage + Floating Reaction Overlay */}
      <div
        ref={stageWrapperRef}
        className="relative w-full aspect-video bg-black overflow-hidden select-none"
      >
        {/* Dismissable player notice */}
        {playerWarning && (
          <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-[#1f1f1f]/95 border border-[#333333] text-white text-[12px] shadow-lg backdrop-blur-sm">
            <span className="truncate">{playerWarning}</span>
            <button
              type="button"
              onClick={() => setPlayerWarning(null)}
              className="text-[#b3b3b3] hover:text-white font-bold cursor-pointer shrink-0 text-[11px]"
            >
              Dismiss
            </button>
          </div>
        )}

        {playback.sourceType === 'youtube' && (
          <div ref={ytContainerRef} className="w-full h-full" />
        )}

        {isHtmlMedia && (
          <>
            <video
              ref={htmlVideoRef}
              className={`w-full h-full object-contain bg-black ${
                playback.sourceType === 'direct-audio' ? 'opacity-0 pointer-events-none absolute' : ''
              }`}
              controls={playback.sourceType !== 'direct-audio'}
              playsInline
              onPlay={() => {
                if (Date.now() < suppressOutboundUntilRef.current) return;
                setLocalPlaying(true);
                const cur = Number(htmlVideoRef.current?.currentTime || 0);
                onSyncAction('play', cur, true);
              }}
              onPause={() => {
                if (Date.now() < suppressOutboundUntilRef.current) return;
                setLocalPlaying(false);
                const cur = Number(htmlVideoRef.current?.currentTime || 0);
                onSyncAction('pause', cur, false);
              }}
              onSeeked={() => {
                if (Date.now() < suppressOutboundUntilRef.current) return;
                const cur = Number(htmlVideoRef.current?.currentTime || 0);
                onSyncAction('seek', cur, !htmlVideoRef.current?.paused);
              }}
              onEnded={() => onVideoEnded(playback.mediaUrl)}
            />

            {/* Spotify Audio Visualizer Stage when playing direct audio files */}
            {playback.sourceType === 'direct-audio' && (
              <div className="w-full h-full bg-[#121212] flex flex-col items-center justify-center p-6 text-center gap-4">
                <div
                  className={`w-28 h-28 rounded-full bg-[#181818] border-4 border-[#1ed760] flex items-center justify-center shadow-[rgba(0,0,0,0.5)_0px_8px_24px] ${
                    localPlaying ? 'animate-spin' : ''
                  }`}
                  style={{ animationDuration: '9s' }}
                >
                  <Disc3 className="w-14 h-14 text-[#1ed760]" />
                </div>
                <div className="max-w-md space-y-1">
                  <p className="text-[20px] font-bold text-white truncate">
                    {playback.videoTitle}
                  </p>
                  <p className="text-[13px] text-[#b3b3b3] truncate">
                    {playback.videoAuthor} · Synchronized Audio Track
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Official Spotify / SoundCloud / Apple Music Embedded Player Stage */}
        {playback.sourceType === 'music-embed' && (
          <div className="w-full h-full bg-[#121212] flex flex-col justify-between p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-full bg-[#1ed760] text-black flex items-center justify-center shrink-0">
                  <Music className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-white truncate">
                    {playback.videoTitle}
                  </p>
                  <p className="text-[11px] text-[#b3b3b3] truncate">
                    {playback.videoAuthor} · Shared Music Stage
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 w-full rounded-xl overflow-hidden bg-[#181818] shadow-[rgba(0,0,0,0.5)_0px_8px_24px]">
              <iframe
                key={`${playback.mediaUrl}-${playback.reloadNonce || 1}-${localIframeKey}`}
                src={playback.mediaUrl}
                title={playback.videoTitle}
                className="w-full h-full border-0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
              />
            </div>
          </div>
        )}

        {/* Live Web Stream Stage (e.g., Cricket / Sports / Custom Embeds) */}
        {playback.sourceType === 'embed-web' && (
          <iframe
            key={`${playback.mediaUrl}-${playback.reloadNonce || 1}-${localIframeKey}-${
              usePopupShield ? 'shield' : 'open'
            }`}
            src={playback.mediaUrl}
            title={playback.videoTitle}
            className="w-full h-full border-0 bg-black"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture; gyroscope; accelerometer"
            allowFullScreen
            referrerPolicy="no-referrer"
            {...(usePopupShield
              ? {
                  sandbox:
                    'allow-scripts allow-same-origin allow-forms allow-presentation',
                }
              : {})}
          />
        )}

        {/* Live Floating Emoji Reactions Layer */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
          {reactions.map((r) => (
            <div
              key={r.id}
              style={{ left: `${r.offsetX}%` }}
              className="absolute bottom-6 flex flex-col items-center animate-float-reaction"
            >
              <span className="text-3xl sm:text-4xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.65)]">
                {r.emoji}
              </span>
              <span className="mt-0.5 text-[11px] font-bold text-white bg-black/75 px-2 py-0.5 rounded-full whitespace-nowrap">
                {r.senderName}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Unified Spotify Now-Playing Bar */}
      <div className="px-4 py-3.5 bg-[#181818] flex flex-col gap-3">
        {/* Progress Scrubber (for YouTube, HLS, Direct Video, and Direct Audio) */}
        {!isIframeStage && (
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono-tabular text-[#b3b3b3] w-12 text-right shrink-0">
              {formatTimecode(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : Math.max(100, currentTime + 60)}
              step={1}
              value={Math.min(currentTime, duration > 0 ? duration : currentTime + 60)}
              onChange={handleTimelineScrub}
              aria-label="Synchronized media timeline"
              className="w-full h-1 bg-[#4d4d4d] rounded-full appearance-none cursor-pointer accent-[#1ed760]"
            />
            <span className="text-[11px] font-mono-tabular text-[#b3b3b3] w-12 shrink-0">
              {duration > 0 ? formatTimecode(duration) : 'LIVE'}
            </span>
          </div>
        )}

        {/* Responsive 3-Zone Spotify Player Controls */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-3">
          {/* Left: Track / Stream Title & Subtitle */}
          <div className="min-w-0 flex-1">
            <p className="text-[14px] sm:text-[15px] font-bold text-white truncate">
              {playback.videoTitle}
            </p>
            <p className="text-[11.5px] sm:text-[12px] text-[#b3b3b3] truncate">
              {playback.videoAuthor} · {playback.actionSummary}
            </p>
          </div>

          {/* Center & Right Controls Row on Mobile */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-3">
            {/* Transport Pills */}
            <div className="flex items-center gap-2 shrink-0">
              {playback.sourceType === 'embed-web' && (
                <button
                  type="button"
                  onClick={() => setUsePopupShield((prev) => !prev)}
                  title="Blocks popup ads on embedded live sports streams"
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-bold uppercase tracking-[1.3px] transition-colors cursor-pointer whitespace-nowrap ${
                    usePopupShield
                      ? 'bg-[#1ed760] text-black'
                      : 'bg-[#1f1f1f] text-[#b3b3b3] hover:text-white'
                  }`}
                >
                  {usePopupShield ? (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Shield On</span>
                    </>
                  ) : (
                    <>
                      <ShieldOff className="w-3.5 h-3.5" />
                      <span>Shield Off</span>
                    </>
                  )}
                </button>
              )}

              {!isIframeStage && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSeekOffset(-10)}
                    title="Rewind 10 seconds for everyone"
                    className="w-9 h-9 rounded-full bg-[#1f1f1f] hover:bg-[#272727] text-[#b3b3b3] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  {/* Signature Circular Spotify Play/Pause Button */}
                  <button
                    type="button"
                    onClick={handleTogglePlayPause}
                    aria-label={localPlaying ? 'Pause for everyone' : 'Play for everyone'}
                    className="w-10 h-10 rounded-full bg-[#1ed760] hover:bg-[#1fdf64] hover:scale-105 text-black flex items-center justify-center transition-all cursor-pointer shadow-[rgba(0,0,0,0.3)_0px_8px_8px]"
                  >
                    {localPlaying ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSeekOffset(10)}
                    title="Forward 10 seconds for everyone"
                    className="w-9 h-9 rounded-full bg-[#1f1f1f] hover:bg-[#272727] text-[#b3b3b3] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                </>
              )}

              {hasNextInQueue && (
                <button
                  type="button"
                  onClick={onPlayNextInQueue}
                  title="Skip to next in queue"
                  className="w-9 h-9 rounded-full bg-[#1f1f1f] hover:bg-[#272727] text-[#b3b3b3] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={handleForceResync}
                title="Resynchronize playback with room"
                className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#1f1f1f] hover:bg-[#272727] text-white text-[11px] font-bold uppercase tracking-[1.3px] transition-colors cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#1ed760]" />
                <span>
                  {isIframeStage ? 'Reload' : isInSync ? 'Synced' : 'Resync'}
                </span>
              </button>
            </div>

            {/* Pill Emoji Bar + Volume + Fullscreen */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <div className="flex items-center gap-0.5 bg-[#121212] rounded-full px-1.5 py-1">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onSendReaction(emoji)}
                    className="w-7 h-7 rounded-full hover:bg-[#1f1f1f] flex items-center justify-center text-sm hover:scale-125 active:scale-95 transition-transform cursor-pointer"
                    title={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {!isIframeStage && (
                <div className="hidden xl:flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className="w-8 h-8 rounded-full text-[#b3b3b3] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-4 h-4 text-[#f3727f]" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    aria-label="Volume"
                    className="w-16 h-1 bg-[#4d4d4d] rounded-full appearance-none cursor-pointer accent-[#1ed760]"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={handleFullscreen}
                className="w-9 h-9 rounded-full bg-[#1f1f1f] hover:bg-[#272727] text-[#b3b3b3] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
