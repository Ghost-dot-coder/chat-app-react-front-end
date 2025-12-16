import { useEffect, useMemo, useRef, useState } from "react";

const WS_URL = "ws://localhost:8080";

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function cls(...xs) {
  return xs.filter(Boolean).join(" ");
}

export default function App() {
  const [status, setStatus] = useState("disconnected");
  const [me, setMe] = useState(null);

  const [name, setName] = useState("Manu");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [roomId, setRoomId] = useState("");

  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);

  const [text, setText] = useState("");
  const [typingUser, setTypingUser] = useState(null);

  const wsRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const bottomRef = useRef(null);

  const canSend = status === "connected" && text.trim().length > 0 && roomId;

  // Auto-join via link: /?room=ABC123
  useEffect(() => {
    const url = new URL(window.location.href);
    const roomFromLink = url.searchParams.get("room");
    if (roomFromLink) {
      setRoomCodeInput(roomFromLink.toUpperCase());
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const connect = () => {
    if (wsRef.current && wsRef.current.readyState === 1) return;

    setStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setStatus("connected");

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case "welcome":
          setMe({ id: msg.payload.id });
          break;

        case "roomCreated": {
          setRoomId(msg.payload.roomId);
          setMembers(msg.payload.members || []);
          setMessages([]);
          break;
        }

        case "joined":
          setRoomId(msg.payload.roomId);
          setMembers(msg.payload.members || []);
          setMessages([]);
          break;

        case "presence":
          setMembers(msg.payload.members || []);
          break;

        case "chat":
          setMessages((prev) => [...prev, msg.payload]);
          break;

        case "typing":
          setTypingUser(msg.payload.isTyping ? msg.payload.from : null);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 1200);
          break;

        default:
          break;
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      setMembers([]);
      setTypingUser(null);
      setRoomId("");
    };

    ws.onerror = () => setStatus("disconnected");
  };

  const disconnect = () => {
    wsRef.current?.close();
    wsRef.current = null;
  };

  const createRoom = () => {
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    wsRef.current.send(JSON.stringify({ type: "createRoom", payload: { name } }));
  };

  const joinRoom = () => {
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    const code = roomCodeInput.trim().toUpperCase();
    if (!code) return;
    wsRef.current.send(JSON.stringify({ type: "join", payload: { roomId: code, name } }));
  };

  const shareLink = useMemo(() => {
    if (!roomId) return "";
    const u = new URL(window.location.href);
    u.searchParams.set("room", roomId);
    return u.toString();
  }, [roomId]);

  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // ignore
    }
  };

  const send = () => {
    if (!canSend) return;
    wsRef.current.send(JSON.stringify({ type: "chat", payload: { text } }));
    setText("");
    wsRef.current.send(JSON.stringify({ type: "typing", payload: { isTyping: false } }));
  };

  const onType = (v) => {
    setText(v);
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    wsRef.current.send(JSON.stringify({ type: "typing", payload: { isTyping: v.trim().length > 0 } }));
  };

  const myId = me?.id;

  return (
    <div className="min-h-full bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-2xl font-semibold tracking-tight">Realtime Chat</div>
            <div className="text-sm text-slate-400">
              Status:{" "}
              <span className={cls("font-semibold", status === "connected" ? "text-emerald-400" : "text-slate-300")}>
                {status}
              </span>{" "}
              {myId ? <span className="text-slate-500">• you: {myId}</span> : null}
            </div>
          </div>

          <div className="flex gap-2">
            {status !== "connected" ? (
              <button onClick={connect} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
                Connect
              </button>
            ) : (
              <button onClick={disconnect} className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400">
                Disconnect
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[360px_1fr]">
          {/* Left: Room / Profile */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg">
            <div className="text-sm font-semibold text-slate-200">Profile</div>
            <div className="mt-2">
              <label className="text-xs text-slate-400">Display name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>

            <div className="mt-5 grid gap-3">
              <div className="text-sm font-semibold text-slate-200">Rooms</div>

              <button
                onClick={createRoom}
                disabled={status !== "connected"}
                className={cls(
                  "rounded-xl px-4 py-2 text-sm font-semibold",
                  status !== "connected"
                    ? "cursor-not-allowed bg-white/5 text-slate-500"
                    : "bg-indigo-500 text-white hover:bg-indigo-400"
                )}
              >
                Create new room (get code)
              </button>

              <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
                <div className="text-xs text-slate-400">Join with code</div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value)}
                    placeholder="e.g. A9K2QZ"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                  <button
                    onClick={joinRoom}
                    disabled={status !== "connected"}
                    className={cls(
                      "rounded-xl px-4 py-2 text-sm font-semibold",
                      status !== "connected"
                        ? "cursor-not-allowed bg-white/5 text-slate-500"
                        : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                    )}
                  >
                    Join
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
                <div className="text-xs text-slate-400">Current room</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="text-lg font-semibold tracking-widest">{roomId || "—"}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => roomId && copy(roomId)}
                      disabled={!roomId}
                      className={cls(
                        "rounded-lg px-3 py-1.5 text-xs font-semibold",
                        roomId ? "bg-white/10 hover:bg-white/15" : "cursor-not-allowed bg-white/5 text-slate-500"
                      )}
                    >
                      Copy code
                    </button>
                    <button
                      onClick={() => shareLink && copy(shareLink)}
                      disabled={!shareLink}
                      className={cls(
                        "rounded-lg px-3 py-1.5 text-xs font-semibold",
                        shareLink ? "bg-white/10 hover:bg-white/15" : "cursor-not-allowed bg-white/5 text-slate-500"
                      )}
                    >
                      Copy link
                    </button>
                  </div>
                </div>
                {shareLink ? (
                  <div className="mt-2 break-all text-xs text-slate-400">{shareLink}</div>
                ) : null}
              </div>
            </div>

            <div className="mt-5">
              <div className="text-sm font-semibold text-slate-200">Online</div>
              <div className="mt-2 grid gap-2">
                {members.length === 0 ? (
                  <div className="text-sm text-slate-500">No one here yet.</div>
                ) : (
                  members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div>
                        <div className="text-sm font-semibold">
                          {m.name} {m.id === myId ? <span className="text-emerald-400">(you)</span> : null}
                        </div>
                        <div className="text-xs text-slate-500">{m.id}</div>
                      </div>
                      <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right: Chat */}
          <div className="rounded-2xl border border-white/10 bg-white/5 shadow-lg">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-sm font-semibold">Chat</div>
                <div className="text-xs text-slate-400">
                  {roomId ? `Room ${roomId}` : "Create or join a room to start chatting"}
                </div>
              </div>
            </div>

            <div className="h-[60vh] overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <div className="mx-auto mt-10 max-w-sm rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-center text-sm text-slate-400">
                  No messages yet. Create a room, share the code, and start chatting.
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => {
                    const mine = m.from?.id === myId;
                    return (
                      <div key={m.id} className={cls("flex", mine ? "justify-end" : "justify-start")}>
                        <div
                          className={cls(
                            "max-w-[75%] rounded-2xl border px-4 py-3",
                            mine
                              ? "border-emerald-500/20 bg-emerald-500/10"
                              : "border-white/10 bg-slate-950/30"
                          )}
                        >
                          <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
                            <span className="font-semibold text-slate-200">{mine ? "You" : m.from?.name}</span>
                            <span>•</span>
                            <span>{formatTime(m.ts)}</span>
                          </div>
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
                            {m.text}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {typingUser ? (
                <div className="mt-3 text-xs text-slate-400">{typingUser.name} is typing…</div>
              ) : null}

              <div ref={bottomRef} />
            </div>

            <div className="border-t border-white/10 p-3">
              <div className="flex gap-2">
                <input
                  value={text}
                  onChange={(e) => onType(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={status !== "connected" ? "Connect first…" : roomId ? "Type a message…" : "Join a room first…"}
                  disabled={status !== "connected" || !roomId}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
                />
                <button
                  onClick={send}
                  disabled={!canSend}
                  className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </button>
              </div>

              <div className="mt-2 text-xs text-slate-500">
                Tip: click <span className="font-semibold text-slate-300">Copy link</span> and open it on another device to auto-fill the room code.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
