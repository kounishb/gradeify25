import { useEffect, useState } from "react";
import { getMessages, sendMessage } from "../api/groups";

export default function ChatBox({ group }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");

  async function loadMessages() {
    const data = await getMessages(group.id);
    setMessages(data.messages || []);
  }

  async function handleSend(e) {
    e.preventDefault();

    if (!text.trim()) return;

    const data = await sendMessage(group.id, {
      message: text,
    });

    if (data.message) {
      setMessages((prev) => [...prev, data.message]);
      setText("");
    }
  }

  useEffect(() => {
    loadMessages();
  }, [group.id]);

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
                <button>Open</button>
              </div>
            )}
          </div>
        ))}
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