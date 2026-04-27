import { useEffect, useMemo, useState } from "react";
import { addGroupMember, getGroupMembers, searchUsers } from "../api/groups";

export default function AddPeopleModal({ group, onClose }) {
  const [users, setUsers] = useState([]);
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadMembers() {
    try {
      setError("");
      const membersData = await getGroupMembers(group.id);
      setMembers(membersData.members || []);
    } catch (err) {
      setError(err.message || "Failed to load members");
    }
  }

  useEffect(() => {
    loadMembers();
  }, [group.id]);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      try {
        setError("");

        if (!search.trim()) {
          setUsers([]);
          return;
        }

        setLoading(true);
        const data = await searchUsers(search.trim());
        setUsers(data.users || []);
      } catch (err) {
        setError(err.message || "Search failed");
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [search]);

  const memberIds = useMemo(
    () => new Set(members.map((m) => m.user_id)),
    [members]
  );

  async function handleAdd(userId) {
    try {
      setError("");
      await addGroupMember(group.id, userId);
      await loadMembers();
    } catch (err) {
      setError(err.message || "Failed to add user");
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
          width: 420,
          maxHeight: "80vh",
          overflow: "auto",
          background: "white",
          borderRadius: 18,
          padding: 18,
          boxShadow: "0 20px 40px rgba(15, 23, 42, 0.25)",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
          Add People
        </h2>

        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
          Type a classmate&apos;s username or name to add them to {group.name}.
        </p>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type username or name..."
          style={{
            width: "100%",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "10px 12px",
            marginBottom: 12,
          }}
        />

        {error && (
          <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 10 }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {!search.trim() ? (
            <p style={{ fontSize: 13, color: "#6b7280" }}>
              Start typing to search for users.
            </p>
          ) : loading ? (
            <p style={{ fontSize: 13, color: "#6b7280" }}>Searching...</p>
          ) : users.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6b7280" }}>
              No matching users found.
            </p>
          ) : (
            users.map((user) => {
              const alreadyMember = memberIds.has(user.id);

              return (
                <div
                  key={user.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>
                      {user.display_name || user.username}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      @{user.username}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={alreadyMember}
                    onClick={() => handleAdd(user.id)}
                    style={{
                      border: alreadyMember
                        ? "1px solid #d1d5db"
                        : "1px solid #c7d2fe",
                      background: alreadyMember ? "#f3f4f6" : "#eef2ff",
                      color: alreadyMember ? "#6b7280" : "#3730a3",
                      padding: "7px 11px",
                      borderRadius: 999,
                      cursor: alreadyMember ? "not-allowed" : "pointer",
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    {alreadyMember ? "Added" : "Add"}
                  </button>
                </div>
              );
            })
          )}
        </div>

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
          Done
        </button>
      </div>
    </div>
  );
}