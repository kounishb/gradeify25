import { useEffect, useRef, useState } from "react";
import { getMessages, sendMessage } from "../api/groups";

export default function ChatBox({ group }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  async function handleSend(e) {
    e.preventDefault();

    if (!text.trim()) return;

    await sendMessage(group.id, {
      message: text,
    });

    setText("");
  }

  useEffect(() => {
    if (!group?.id) return;

    let isMounted = true;

    async function fetchMessages() {
      try {
        console.log("Polling messages...");

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="chat-box">
      <h2>{group.name}</h2>

      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className="chat-message">
            <div className="chat-author">
              {msg.users?.display_name || msg.users?.username || "User"}
            </div>

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
        ))}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="chat-input-row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}