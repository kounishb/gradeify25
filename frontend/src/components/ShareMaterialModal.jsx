import { useEffect, useState } from "react";
import { getGroups, sendMessage } from "../api/groups";

export default function ShareMaterialModal({ item, type, onClose }) {
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await getGroups();
        console.log("Groups loaded:", data);
        setGroups(data.groups || []);
      } catch (e) {
        console.error("Failed to load groups:", e);
        setError("Failed to load groups.");
      }
    }

    load();
  }, []);

  async function handleShare(groupId) {
    try {
      console.log("SHARING ITEM:", item);
console.log("SHARING ID:", item?.id);
console.log("SHARING TYPE:", type);
      await sendMessage(groupId, {
        message: `Shared ${
          type === "practice_test" ? "a practice test" : "flashcards"
        }`,
        shared_type: type,
        shared_item_id: item.id,
      });

      onClose();
    } catch (e) {
      console.error("Failed to share:", e);
      setError("Failed to share.");
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: 360,
          background: "white",
          borderRadius: 18,
          padding: 18,
          boxShadow: "0 20px 40px rgba(15, 23, 42, 0.25)",
        }}
      >
        <h3 style={{ marginBottom: 10 }}>Share to group</h3>

        {error && (
          <p style={{ color: "#b91c1c", fontSize: 13 }}>
            {error}
          </p>
        )}

        {groups.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            No groups found. Create a group first.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => handleShare(group.id)}
                style={{
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                  padding: "10px 12px",
                  borderRadius: 12,
                  cursor: "pointer",
                  textAlign: "left",
                  fontWeight: 700,
                }}
              >
                {group.name}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 14,
            width: "100%",
            border: "1px solid #e5e7eb",
            background: "white",
            padding: "9px 12px",
            borderRadius: 999,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}