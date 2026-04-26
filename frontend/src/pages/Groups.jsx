import { useEffect, useState } from "react";
import { getGroups, createGroup } from "../api/groups";
import ChatBox from "../components/ChatBox";

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [newGroupName, setNewGroupName] = useState("");

  async function loadGroups() {
    const data = await getGroups();
    setGroups(data.groups || []);
  }

  async function handleCreateGroup(e) {
    e.preventDefault();

    if (!newGroupName.trim()) return;

    const data = await createGroup(newGroupName);
    setNewGroupName("");

    if (data.group) {
      setGroups((prev) => [...prev, data.group]);
      setSelectedGroup(data.group);
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

        <div>
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => setSelectedGroup(group)}
              className={selectedGroup?.id === group.id ? "active" : ""}
            >
              {group.name}
            </button>
          ))}
        </div>
      </div>

      <div className="groups-main">
        {selectedGroup ? (
          <ChatBox group={selectedGroup} />
        ) : (
          <p>Select or create a group to start chatting.</p>
        )}
      </div>
    </div>
  );
}