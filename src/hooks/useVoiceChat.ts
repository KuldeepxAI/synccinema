import { useState, useRef, useCallback, useEffect } from 'react';
import { APP_CONFIG } from '../config';

interface UseVoiceChatOptions {
  roomId: string | null;
  clientId: string;
  sendWsMessage: (payload: Record<string, unknown>) => void;
}

export interface VoiceSignalPayload {
  fromClientId: string;
  fromUserName?: string;
  signalType: 'offer' | 'answer' | 'ice-candidate';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export function useVoiceChat({ roomId, clientId, sendWsMessage }: UseVoiceChatOptions) {
  const [inVoice, setInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [connectedPeerIds, setConnectedPeerIds] = useState<string[]>([]);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const inVoiceRef = useRef<boolean>(false);
  const isMutedRef = useRef<boolean>(false);
  const isMutingOrUnmutingRef = useRef<boolean>(false);

  inVoiceRef.current = inVoice;
  isMutedRef.current = isMuted;

  /**
   * Stops and releases the physical OS/browser microphone hardware tracks immediately
   * so Chrome/Windows/macOS turns off the active microphone indicator.
   */
  const stopHardwareMicrophone = useCallback(() => {
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        try {
          track.enabled = false;
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      }
      localStreamRef.current = null;
    }

    // Detach track from all WebRTC RTP senders so the browser releases the mic lock
    for (const pc of peersRef.current.values()) {
      for (const sender of pc.getSenders()) {
        if (!sender.track || sender.track.kind === 'audio') {
          sender.replaceTrack(null).catch(() => {});
        }
      }
    }
  }, []);

  const cleanupPeer = useCallback((peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch {
        // Ignore close error
      }
      peersRef.current.delete(peerId);
    }

    const audioEl = audioElementsRef.current.get(peerId);
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
      audioElementsRef.current.delete(peerId);
    }

    setConnectedPeerIds(Array.from(peersRef.current.keys()));
  }, []);

  const cleanupAllVoice = useCallback(() => {
    stopHardwareMicrophone();
    for (const peerId of Array.from(peersRef.current.keys())) {
      cleanupPeer(peerId);
    }
    setInVoice(false);
    setIsMuted(false);
    setConnectedPeerIds([]);
  }, [cleanupPeer, stopHardwareMicrophone]);

  const createPeerConnection = useCallback(
    (peerId: string): RTCPeerConnection => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({
        iceServers: [...APP_CONFIG.rtcIceServers],
      });

      const activeAudioTracks = localStreamRef.current?.getAudioTracks() || [];
      if (localStreamRef.current && activeAudioTracks.length > 0 && !isMutedRef.current) {
        for (const track of activeAudioTracks) {
          pc.addTrack(track, localStreamRef.current);
        }
      } else {
        // Reserve an audio transceiver so we can receive peer audio while muted
        // and seamlessly call sender.replaceTrack(track) when unmuting later.
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendWsMessage({
            type: 'voice:signal',
            toClientId: peerId,
            signalType: 'ice-candidate',
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        const remoteStream =
          event.streams && event.streams[0]
            ? event.streams[0]
            : new MediaStream([event.track]);

        let audioEl = audioElementsRef.current.get(peerId);
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          audioEl.setAttribute('playsinline', 'true');
          document.body.appendChild(audioEl);
          audioElementsRef.current.set(peerId, audioEl);
        }
        audioEl.srcObject = remoteStream;
        audioEl.play().catch(() => {});
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          cleanupPeer(peerId);
        }
      };

      peersRef.current.set(peerId, pc);
      setConnectedPeerIds(Array.from(peersRef.current.keys()));
      return pc;
    },
    [cleanupPeer, sendWsMessage]
  );

  const joinVoice = useCallback(async () => {
    if (inVoiceRef.current) return;
    setVoiceError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
        video: false,
      });

      localStreamRef.current = stream;
      setInVoice(true);
      setIsMuted(false);

      sendWsMessage({
        type: 'voice:join',
        isMuted: false,
      });
    } catch {
      setVoiceError('Microphone permission denied or unavailable.');
    }
  }, [sendWsMessage]);

  const leaveVoice = useCallback(() => {
    if (inVoiceRef.current) {
      sendWsMessage({ type: 'voice:leave' });
    }
    cleanupAllVoice();
  }, [cleanupAllVoice, sendWsMessage]);

  const toggleMute = useCallback(async () => {
    if (!inVoiceRef.current || isMutingOrUnmutingRef.current) return;
    isMutingOrUnmutingRef.current = true;
    setVoiceError(null);

    try {
      const nextMuted = !isMutedRef.current;

      if (nextMuted) {
        // MUTE: Completely stop hardware microphone tracks so the browser/OS stops listening
        stopHardwareMicrophone();
        setIsMuted(true);
        sendWsMessage({
          type: 'voice:mute_state',
          isMuted: true,
        });
      } else {
        // UNMUTE: Re-acquire microphone stream and attach to existing WebRTC senders
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CONSTRAINTS,
          video: false,
        });

        // If user left voice while permission prompt was resolving, stop immediately
        if (!inVoiceRef.current) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }

        localStreamRef.current = stream;
        const newAudioTrack = stream.getAudioTracks()[0] || null;

        if (newAudioTrack) {
          for (const pc of peersRef.current.values()) {
            const audioSender = pc
              .getSenders()
              .find((s) => !s.track || s.track.kind === 'audio');
            if (audioSender) {
              await audioSender.replaceTrack(newAudioTrack).catch(() => {});
            } else {
              pc.addTrack(newAudioTrack, stream);
            }
          }
        }

        setIsMuted(false);
        sendWsMessage({
          type: 'voice:mute_state',
          isMuted: false,
        });
      }
    } catch {
      setVoiceError('Unable to access microphone to unmute.');
    } finally {
      isMutingOrUnmutingRef.current = false;
    }
  }, [sendWsMessage, stopHardwareMicrophone]);

  // Called when server notifies that a new peer joined voice chat
  const handlePeerJoinedVoice = useCallback(
    async (peerId: string) => {
      if (!inVoiceRef.current || peerId === clientId) return;
      try {
        const pc = createPeerConnection(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendWsMessage({
          type: 'voice:signal',
          toClientId: peerId,
          signalType: 'offer',
          sdp: pc.localDescription,
        });
      } catch (err) {
        console.error('Failed to create WebRTC voice offer:', err);
      }
    },
    [clientId, createPeerConnection, sendWsMessage]
  );

  const handlePeerLeftVoice = useCallback(
    (peerId: string) => {
      cleanupPeer(peerId);
    },
    [cleanupPeer]
  );

  const handleVoiceSignal = useCallback(
    async (payload: VoiceSignalPayload) => {
      if (!inVoiceRef.current) return;
      const { fromClientId, signalType, sdp, candidate } = payload;
      if (!fromClientId || fromClientId === clientId) return;

      try {
        const pc = createPeerConnection(fromClientId);
        if (signalType === 'offer' && sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendWsMessage({
            type: 'voice:signal',
            toClientId: fromClientId,
            signalType: 'answer',
            sdp: pc.localDescription,
          });
        } else if (signalType === 'answer' && sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } else if (signalType === 'ice-candidate' && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error('Error handling WebRTC voice signal:', err);
      }
    },
    [clientId, createPeerConnection, sendWsMessage]
  );

  // Automatically leave voice if room changes or user leaves room
  useEffect(() => {
    return () => {
      cleanupAllVoice();
    };
  }, [roomId, cleanupAllVoice]);

  return {
    inVoice,
    isMuted,
    voiceError,
    connectedPeerIds,
    joinVoice,
    leaveVoice,
    toggleMute,
    handlePeerJoinedVoice,
    handlePeerLeftVoice,
    handleVoiceSignal,
  };
}
