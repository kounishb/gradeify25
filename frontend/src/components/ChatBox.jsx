import { useEffect, useRef, useState } from "react";
import { getMessages, sendMessage } from "../api/groups";

export default function ChatBox({ group }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const bottomRef = useRef(null);

  async function handleSend(e) {
  e.preventDefault();

  if (!text.trim()) return;

  await sendMessage(group.id, {
    message: text,
  });

  setText("");

  setTimeout(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, 100);
}

  useEffect(() => {
    async function getMe() {
      try {
        const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
        const res = await fetch(`${API}/auth/me`, {
          credentials: "include",
        });
        const data = await res.json();
        setCurrentUserId(data.user?.id);
      } catch (err) {
        console.error("Failed to get current user:", err);
      }
    }

    getMe();
  }, []);

  useEffect(() => {
    if (!group?.id) return;

    let isMounted = true;

    async function fetchMessages() {
      try {
        const data = await getMessages(group.id);
        if (isMounted) {
          setMessages(data.messages || []);
        }
      } catch (err) {
        console.error("Polling failed:", err);
      }
    }

    fetchMessages();
    const interval = setInterval(fetchMessages, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [group.id]);


  return (
    <div className="chat-box">
      <div className="chat-top">
        <div>
          <h2>{group.name}</h2>
          <p>Group chat</p>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((msg) => {
          const isMe = msg.user_id === currentUserId;

          return (
            <div
              key={msg.id}
              className={`chat-message-row ${isMe ? "mine" : "theirs"}`}
            >
              <div className="chat-bubble-wrap">
                {!isMe && (
                  <div className="chat-author">
                    {msg.users?.display_name || msg.users?.username || "User"}
                  </div>
                )}

                <div className={`chat-bubble ${isMe ? "mine" : "theirs"}`}>
                  {msg.message && <p>{msg.message}</p>}

                  {msg.shared_type && (
                    <div className="shared-card">
                      <strong>
                        Shared{" "}
                        {msg.shared_type === "practice_test"
                          ? "Practice Test"
                          : "Flashcards"}
                      </strong>
                      <p>ID: {msg.shared_item_id}</p>
                      <button type="button">Open</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="chat-input-row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Message ${group.name}...`}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}