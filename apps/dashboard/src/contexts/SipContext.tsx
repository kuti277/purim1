import JsSIP from "jssip";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Suppress noisy JsSIP debug logs
JsSIP.debug.disable("JsSIP:*");

// ─── Types ────────────────────────────────────────────────────────────────────

export type CallStatus = "idle" | "connecting" | "ringing" | "active";

export interface SipContextValue {
  isConnected: boolean;
  isRegistered: boolean;
  activeCallStatus: CallStatus;
  isMuted: boolean;
  calledNumber: string;
  calledLabel: string;
  connect: (wsUrl: string, sipUser: string, sipPassword: string) => void;
  call: (phoneNumber: string, label: string) => void;
  hangUp: () => void;
  toggleMute: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

export const SipContext = createContext<SipContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SipProvider({ children }: { children: ReactNode }) {
  const ua = useRef<JsSIP.UA | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rtcSession = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [activeCallStatus, setActiveCallStatus] = useState<CallStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [calledNumber, setCalledNumber] = useState("");
  const [calledLabel, setCalledLabel] = useState("");

  // Stop UA on unmount — closes WebSocket connection
  useEffect(() => {
    return () => {
      ua.current?.stop();
    };
  }, []);

  // ─── connect ──────────────────────────────────────────────────────────────

  function connect(wsUrl: string, sipUser: string, sipPassword: string) {
    // Tear down any existing UA before creating a new one
    ua.current?.stop();

    const socket = new JsSIP.WebSocketInterface(wsUrl);

    const newUa = new JsSIP.UA({
      sockets: [socket],
      uri: `sip:${sipUser}@sip.yemot.co.il`,
      password: sipPassword,
      register: true,
    });

    newUa.on("connected", () => setIsConnected(true));
    newUa.on("disconnected", () => {
      setIsConnected(false);
      setIsRegistered(false);
    });
    newUa.on("registered", () => setIsRegistered(true));
    newUa.on("unregistered", () => setIsRegistered(false));
    newUa.on("registrationFailed", () => setIsRegistered(false));

    // Handle incoming new call sessions
    newUa.on("newRTCSession", ({ session }: { session: any }) => {
      if (session.direction === "incoming") {
        // שומרים את השיחה כדי שהנציג יוכל לדבר
        rtcSession.current = session;
        setCalledNumber(session.remote_identity.uri.user || "לא חסוי");
        setCalledLabel("שיחה נכנסת משטח...");
        setActiveCallStatus("ringing");
        setIsMuted(false);

        // מושכים את האודיו של הבחור לרמקולים של הנציג
        session.on("peerconnection", ({ peerconnection }: { peerconnection: RTCPeerConnection }) => {
          peerconnection.addEventListener("track", (evt: RTCTrackEvent) => {
            if (audioRef.current && evt.streams[0]) {
              audioRef.current.srcObject = evt.streams[0];
            }
          });
        });

        session.on("confirmed", () => setActiveCallStatus("active"));
        session.on("ended", () => resetCallState());
        session.on("failed", () => resetCallState());

        // מענה אוטומטי לשיחה הנכנסת
        session.answer({ mediaConstraints: { audio: true, video: false } });
      }
    });

    ua.current = newUa;
    newUa.start();
  }

  // ─── call ─────────────────────────────────────────────────────────────────

  function call(phoneNumber: string, label: string) {
    if (!ua.current || !isRegistered) return;

    // Hang up any existing call first
    if (rtcSession.current) {
      try { rtcSession.current.terminate(); } catch { /* already ended */ }
    }

    setCalledNumber(phoneNumber);
    setCalledLabel(label);
    setActiveCallStatus("connecting");
    setIsMuted(false);

    const session = ua.current.call(`sip:${phoneNumber}@sip.yemot.co.il`, {
      mediaConstraints: { audio: true, video: false },
    });

    rtcSession.current = session;

    // Attach remote audio stream as soon as the peer connection is ready
    session.on("peerconnection", ({ peerconnection }: { peerconnection: RTCPeerConnection }) => {
      peerconnection.addEventListener("track", (evt: RTCTrackEvent) => {
        if (audioRef.current && evt.streams[0]) {
          audioRef.current.srcObject = evt.streams[0];
        }
      });
    });

    session.on("progress", () => setActiveCallStatus("ringing"));
    session.on("confirmed", () => setActiveCallStatus("active"));
    session.on("ended", () => resetCallState());
    session.on("failed", () => resetCallState());
  }

  // ─── hangUp ──────────────────────────────────────────────────────────────

  function hangUp() {
    if (!rtcSession.current) return;
    try { rtcSession.current.terminate(); } catch { /* already ended */ }
    resetCallState();
  }

  // ─── toggleMute ───────────────────────────────────────────────────────────

  function toggleMute() {
    if (!rtcSession.current) return;
    if (isMuted) {
      rtcSession.current.unmute({ audio: true });
      setIsMuted(false);
    } else {
      rtcSession.current.mute({ audio: true });
      setIsMuted(true);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function resetCallState() {
    rtcSession.current = null;
    setActiveCallStatus("idle");
    setCalledNumber("");
    setCalledLabel("");
    setIsMuted(false);
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SipContext.Provider
      value={{
        isConnected,
        isRegistered,
        activeCallStatus,
        isMuted,
        calledNumber,
        calledLabel,
        connect,
        call,
        hangUp,
        toggleMute,
      }}
    >
      {children}
      {/* Hidden audio element for remote SIP audio output */}
      <audio ref={audioRef} autoPlay style={{ display: "none" }} />
    </SipContext.Provider>
  );
}

// ─── Internal hook (used by useSip.ts) ───────────────────────────────────────

export function useSipContext(): SipContextValue | null {
  return useContext(SipContext);
}