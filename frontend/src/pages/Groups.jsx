import { useEffect, useState } from "react";
import { getGroups, createGroup, deleteGroup } from "../api/groups";
import ChatBox from "../components/ChatBox";
import AddPeopleModal from "../components/AddPeopleModal";

const LAST_GROUP_KEY = "gradeify_last_group_id";

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
      const loadedGroups = data.groups || [];

      setGroups(loadedGroups);

      const lastGroupId = localStorage.getItem(LAST_GROUP_KEY);

      if (lastGroupId) {
        const lastGroup = loadedGroups.find((g) => g.id === lastGroupId);

        if (lastGroup) {
          setSelectedGroup(lastGroup);
        } else {
          localStorage.removeItem(LAST_GROUP_KEY);
          setSelectedGroup(null);
        }
      } else if (loadedGroups.length > 0 && !selectedGroup) {
        setSelectedGroup(loadedGroups[0]);
        localStorage.setItem(LAST_GROUP_KEY, loadedGroups[0].id);
      }
    } catch (err) {
      setError(err.message || "Failed to load groups");
    }
  }

  async function handleCreateGroup(e) {
    e.preventDefault();

    if (!newGroupName.trim()) return;

    try {
      setError("");
      const data = await createGroup(newGroupName);
      setNewGroupName("");

      if (data.group) {
        setGroups((prev) => [...prev, data.group]);
        setSelectedGroup(data.group);
        localStorage.setItem(LAST_GROUP_KEY, data.group.id);
      }
    } catch (err) {
      setError(err.message || "Failed to create group");
    }
  }

  async function handleDeleteGroup() {
    if (!selectedGroup) return;

    try {
      setError("");
      await deleteGroup(selectedGroup.id);

      localStorage.removeItem(LAST_GROUP_KEY);
      setSelectedGroup(null);
      setShowAddPeople(false);

      await loadGroups();
    } catch (err) {
      setError(err.message || "Failed to delete group");
    }
  }

  function handleSelectGroup(group) {
    setSelectedGroup(group);
    localStorage.setItem(LAST_GROUP_KEY, group.id);
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

        <div
          style={{
            marginTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => handleSelectGroup(group)}
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

              <button type="button" onClick={handleDeleteGroup}>
                Delete Group
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
          onClose={() => {
            setShowAddPeople(false);
            loadGroups();
          }}
        />
      )}
    </div>
  );
}