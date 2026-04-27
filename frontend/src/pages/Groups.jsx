import { useEffect, useState } from "react";
import { getGroups, createGroup } from "../api/groups";
import ChatBox from "../components/ChatBox";
import AddPeopleModal from "../components/AddPeopleModal";

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [error, setError] = useState("");
  const [showAddPeople, setShowAddPeople] = useState(false);

  async function loadGroups() {
    try {
      setError("");
      const data = await getGroups();
      console.log("Loaded groups:", data);
      setGroups(data.groups || []);
    } catch (err) {
      console.error("Failed to load groups:", err);
      setError(err.message || "Failed to load groups");
    }
  }

  async function handleCreateGroup(e) {
    e.preventDefault();

    console.log("Create clicked:", newGroupName);

    if (!newGroupName.trim()) return;

    try {
      setError("");
      const data = await createGroup(newGroupName);
      console.log("Create group response:", data);

      setNewGroupName("");

      if (data.group) {
        setGroups((prev) => [...prev, data.group]);
        setSelectedGroup(data.group);
      } else {
        setError("Group was not returned from backend.");
      }
    } catch (err) {
      console.error("Create group failed:", err);
      setError(err.message || "Failed to create group");
    }
  }

  useEffect(() => {
    loadGroups();
  }, []);

  return (
    <div className="groups-page">
      <div className="groups-sidebar">
        <h2>Groups</h2>

        <form onSubmit={handleCreateGroup}>
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="New group name"
          />
          <button type="submit">Create</button>
        </form>

        {error && (
          <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 8 }}>
            {error}
          </p>
        )}

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => setSelectedGroup(group)}
              className={selectedGroup?.id === group.id ? "active" : ""}
              type="button"
            >
              {group.name}
            </button>
          ))}
        </div>
      </div>

      <div className="groups-main">
        {selectedGroup ? (
  <>
    <div className="groups-header">
      <h2>{selectedGroup.name}</h2>
      <button type="button" onClick={() => setShowAddPeople(true)}>
        Add People
      </button>
    </div>

    <ChatBox group={selectedGroup} />
  </>
) : (
  <p>Select or create a group to start chatting.</p>
)}
      </div>
      {showAddPeople && selectedGroup && (
  <AddPeopleModal
    group={selectedGroup}
    onClose={() => setShowAddPeople(false)}
  />
)}
    </div>
  );
}