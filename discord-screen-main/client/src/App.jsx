import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { MonitorUp, MonitorOff, Mic, MicOff, Video, VideoOff, PhoneOff, Users, Wand2, Volume2, Image, Snowflake } from 'lucide-react';
import './index.css';

// Em desenvolvimento local usa a porta 3001, online (pelo cloudflare) usa a própria URL do site
const SOCKET_SERVER_URL = import.meta.env.DEV ? 'http://localhost:3001' : '/';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// Configuração das Pegadinhas (Você pode trocar as URLs aqui depois)
const PRANK_SOUNDS = {
  buzina: 'https://www.myinstants.com/media/sounds/air-horn-club-sample_1.mp3',
  gemidao: 'https://www.myinstants.com/media/sounds/gemidao-do-zap.mp3',
  terror: 'https://www.myinstants.com/media/sounds/scary-screaming.mp3',
  porta: 'https://www.myinstants.com/media/sounds/knocking-on-door-sound-effect.mp3'
};

const PRANK_IMAGES = {
  susto: 'https://i.pinimg.com/originals/cf/22/0d/cf220d911c4225010996c56bc0a4de3a.png' // Imagem fantasma/susto genérica
};

function App() {
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [localStream, setLocalStream] = useState(null);
  
  // Controls state
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  // Screen Share Quality State
  const [quality, setQuality] = useState('1080p60');
  
  // Pranks State
  const [pranksMenuOpen, setPranksMenuOpen] = useState(false);
  const [isSnowing, setIsSnowing] = useState(false);
  const [popupImage, setPopupImage] = useState(null);

  const qualityOptions = {
    '1080p60': { width: 1920, height: 1080, frameRate: 60, label: '1080p 60fps (Max)' },
    '1080p30': { width: 1920, height: 1080, frameRate: 30, label: '1080p 30fps (High)' },
    '720p60': { width: 1280, height: 720, frameRate: 60, label: '720p 60fps (Smooth)' },
    '720p30': { width: 1280, height: 720, frameRate: 30, label: '720p 30fps (Normal)' },
  };

  // References
  const socketRef = useRef();
  const localVideoRef = useRef();
  // Map of peerID -> RTCPeerConnection
  const peersRef = useRef({});
  
  // State to hold remote streams to render them
  const [remoteStreams, setRemoteStreams] = useState({}); // { peerId: MediaStream }

  useEffect(() => {
    socketRef.current = io(SOCKET_SERVER_URL);

    socketRef.current.on('all-users', (users) => {
      // Create offer for all existing users in the room
      users.forEach(userId => {
        const peer = createPeer(userId, socketRef.current.id, localStream);
        peersRef.current[userId] = peer;
      });
    });

    socketRef.current.on('offer', async (payload) => {
      const { callerId, sdp } = payload;
      const peer = createPeer(callerId, socketRef.current.id, localStream);
      peersRef.current[callerId] = peer;
      
      await peer.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      
      socketRef.current.emit('answer', {
        target: callerId,
        sdp: peer.localDescription,
      });
    });

    socketRef.current.on('answer', async (payload) => {
      const { callerId, sdp } = payload;
      const peer = peersRef.current[callerId];
      if (peer) {
        await peer.setRemoteDescription(new RTCSessionDescription(sdp));
      }
    });

    socketRef.current.on('ice-candidate', async (payload) => {
      const { callerId, candidate } = payload;
      const peer = peersRef.current[callerId];
      if (peer && candidate) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error("Error adding ice candidate", e);
        }
      }
    });

    socketRef.current.on('user-disconnected', (userId) => {
      if (peersRef.current[userId]) {
        peersRef.current[userId].close();
        delete peersRef.current[userId];
      }
      setRemoteStreams((prev) => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });
    });

    // Escutar Interações/Pegadinhas
    socketRef.current.on('interaction', (payload) => {
      const { type, data } = payload;
      
      if (type === 'sound') {
        const audioUrl = PRANK_SOUNDS[data] || data;
        const audio = new Audio(audioUrl);
        audio.play().catch(e => console.error("Audio play error", e));
      } else if (type === 'image') {
        const imageUrl = PRANK_IMAGES[data] || data;
        setPopupImage(imageUrl);
        setTimeout(() => setPopupImage(null), 3000); // Some depois de 3 seg
      } else if (type === 'snow') {
        setIsSnowing(true);
        setTimeout(() => setIsSnowing(false), 10000); // Neve por 10 seg
      }
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, [localStream]);

  // Update local video element when stream changes
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const createPeer = (userId, callerId, stream) => {
    const peer = new RTCPeerConnection(ICE_SERVERS);
    
    // Add local tracks to the peer connection
    if (stream) {
      stream.getTracks().forEach(track => {
        peer.addTrack(track, stream);
      });
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', {
          target: userId,
          candidate: event.candidate,
        });
      }
    };

    peer.ontrack = (event) => {
      setRemoteStreams(prev => ({
        ...prev,
        [userId]: event.streams[0]
      }));
    };

    // If we are creating an offer (we are the caller)
    peer.onnegotiationneeded = async () => {
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socketRef.current.emit('offer', {
          target: userId,
          sdp: peer.localDescription,
        });
      } catch (err) {
        console.error("Negotiation error", err);
      }
    };

    return peer;
  };

  const getMedia = async (isScreenShare = false) => {
    try {
      let stream;
      if (isScreenShare) {
        try {
          // Selected Quality Screen Share Constraints
          const q = qualityOptions[quality];
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: q.width },
              height: { ideal: q.height },
              frameRate: { ideal: q.frameRate }
            },
            audio: true,
          });
        } catch (e) {
          console.warn("HQ screen share failed, falling back", e);
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        }
        
        // Handle when user stops sharing via browser UI
        stream.getVideoTracks()[0].onended = () => {
          stopStreamAndRevertToCamera();
        };
      } else {
        try {
          // High Quality Camera Constraints
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30 }
            },
            audio: true,
          });
        } catch (e) {
          console.warn("HQ camera failed, falling back", e);
          try {
             // Fallback to defaults
             stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          } catch (e2) {
             console.warn("Camera+Audio failed, trying just Video", e2);
             // Final fallback (maybe no mic available)
             stream = await navigator.mediaDevices.getUserMedia({ video: true });
          }
        }
      }

      setLocalStream(stream);

      // If we are already connected, we need to replace the tracks in all peers
      if (inRoom) {
        Object.values(peersRef.current).forEach(peer => {
          // Remove old tracks
          peer.getSenders().forEach(sender => peer.removeTrack(sender));
          // Add new tracks
          stream.getTracks().forEach(track => {
            peer.addTrack(track, stream);
          });
        });
      }

      return stream;
    } catch (err) {
      console.error("Failed to get media", err);
      alert("Failed to access camera/screen. Please check permissions.");
    }
  };

  const stopStreamAndRevertToCamera = async () => {
    setIsScreenSharing(false);
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    await getMedia(false); // get camera back
  };

  const joinRoom = async (e) => {
    e.preventDefault();
    if (!roomId) return;
    
    // Get camera before joining
    await getMedia(false);
    
    socketRef.current.emit('join-room', roomId);
    setInRoom(true);
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream && !isScreenSharing) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopStreamAndRevertToCamera();
    } else {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      setIsScreenSharing(true);
      await getMedia(true);
    }
  };

  const leaveRoom = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    socketRef.current.disconnect();
    window.location.reload(); // Quick reset
  };

  const sendInteraction = (type, data) => {
    socketRef.current.emit('interaction', { roomId, type, data });
    setPranksMenuOpen(false);
  };

  const renderSnow = () => {
    if (!isSnowing) return null;
    const flakes = Array.from({ length: 50 }).map((_, i) => (
      <div 
        key={i} 
        className="snowflake" 
        style={{ 
          left: `${Math.random() * 100}vw`, 
          animationDuration: `${Math.random() * 3 + 2}s`, 
          animationDelay: `${Math.random() * 2}s` 
        }}
      >
        ❄
      </div>
    ));
    return <div className="snow-container">{flakes}</div>;
  };

  const renderPopup = () => {
    if (!popupImage) return null;
    return (
      <div className="jumpscare-overlay">
        <img src={popupImage} alt="Pegadinha" />
      </div>
    );
  };

  // Remote Video Component
  const VideoPlayer = ({ stream, isLocal = false }) => {
    const ref = useRef();
    
    useEffect(() => {
      if (ref.current && stream) {
        ref.current.srcObject = stream;
      }
    }, [stream]);

    return (
      <div className="video-wrapper glass-panel">
        <video 
          ref={isLocal ? localVideoRef : ref} 
          autoPlay 
          playsInline 
          muted={isLocal} 
          style={{ transform: isLocal && !isScreenSharing ? 'scaleX(-1)' : 'none' }} // Mirror local camera
        />
        <div className="video-label">
          {isLocal ? 'You' : 'Friend'}
        </div>
      </div>
    );
  };

  if (!inRoom) {
    return (
      <div className="join-screen">
        <div className="join-card glass-panel fade-in">
          <h2>Stream Hub HQ</h2>
          <p style={{ color: 'var(--text-muted)' }}>Create or join a private room with maximum quality</p>
          <form onSubmit={joinRoom} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Enter Room Code..."
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              required
            />
            <button type="submit" className="btn primary" style={{ width: '100%', padding: '1rem' }}>
              Join Room
            </button>
            <a 
              href="https://discord.com/api/oauth2/authorize?client_id=123456789012345678&permissions=8&scope=bot" 
              target="_blank" 
              rel="noreferrer"
              className="btn btn-discord" 
              style={{ width: '100%', padding: '1rem', justifyContent: 'center' }}
            >
              Adicionar ao Discord
            </a>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container fade-in">
      <header className="header glass-panel">
        <h1>Stream Hub HQ <span className="badge">Max Quality</span></h1>
        <div className="room-info">
          <Users size={20} color="var(--text-muted)" />
          <span className="room-id">ROOM: {roomId}</span>
        </div>
      </header>

      <div className="video-grid">
        {/* Local Stream */}
        {localStream && <VideoPlayer stream={localStream} isLocal={true} />}
        
        {/* Remote Streams */}
        {Object.entries(remoteStreams).map(([peerId, stream]) => (
          <VideoPlayer key={peerId} stream={stream} />
        ))}
      </div>

      <div className="controls-bar glass-panel">
        <button onClick={toggleMute} className={`btn icon-btn ${isMuted ? 'danger' : ''}`} title="Mute Audio">
          {isMuted ? <MicOff /> : <Mic />}
        </button>
        <button 
          onClick={toggleVideo} 
          className={`btn icon-btn ${isVideoOff ? 'danger' : ''}`} 
          disabled={isScreenSharing}
          title="Toggle Camera"
        >
          {isVideoOff ? <VideoOff /> : <Video />}
        </button>
        <button 
          onClick={toggleScreenShare} 
          className={`btn icon-btn ${isScreenSharing ? 'success' : ''}`}
          title="Share Screen"
        >
          {isScreenSharing ? <MonitorOff /> : <MonitorUp />}
        </button>
        <select 
          className="select-field"
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
          title="Screen Share Quality"
          disabled={isScreenSharing}
        >
          {Object.entries(qualityOptions).map(([key, opt]) => (
            <option key={key} value={key}>{opt.label}</option>
          ))}
        </select>
        <button onClick={leaveRoom} className="btn danger" style={{ borderRadius: '12px', padding: '0 1.5rem' }}>
          <PhoneOff size={18} /> Leave
        </button>

        {/* Pranks Menu Toggle */}
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setPranksMenuOpen(!pranksMenuOpen)} 
            className={`btn icon-btn ${pranksMenuOpen ? 'primary' : ''}`}
            title="Pegadinhas e Interações"
          >
            <Wand2 />
          </button>
          
          {pranksMenuOpen && (
            <div className="pranks-menu">
              <button onClick={() => sendInteraction('sound', 'buzina')} className="btn icon-btn" title="Buzina"><Volume2 size={16}/></button>
              <button onClick={() => sendInteraction('sound', 'gemidao')} className="btn icon-btn" title="Gemidão"><Volume2 size={16}/></button>
              <button onClick={() => sendInteraction('sound', 'terror')} className="btn icon-btn" title="Grito Terror"><Volume2 size={16}/></button>
              <button onClick={() => sendInteraction('sound', 'porta')} className="btn icon-btn" title="Bater Porta"><Volume2 size={16}/></button>
              <button onClick={() => sendInteraction('image', 'susto')} className="btn icon-btn" title="Foto (Susto)"><Image size={16}/></button>
              <button onClick={() => sendInteraction('snow')} className="btn icon-btn" title="Fazer Nevar"><Snowflake size={16}/></button>
            </div>
          )}
        </div>
      </div>
      
      {/* Efeitos Visuais (Renderizados por cima de tudo) */}
      {renderSnow()}
      {renderPopup()}
    </div>
  );
}

export default App;
