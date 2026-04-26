import { useEffect, useState } from "react";
import { getGroups, sendMessage } from "../api/groups";

export default function ShareMaterialModal({ item, type, onClose }) {
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    async function load() {
      const data = await getGroups();
      setGroups(data.groups || []);
    }

    load();
  }, []);

  async function handleShare(groupId) {
    await sendMessage(groupId, {
      message: `Shared ${type === "practice_test" ? "a practice test" : "flashcards"}`,
      shared_type: type,
      shared_item_id: item.id,
    });

    onClose();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Share to group</h3>

        {groups.map((group) => (
          <button key={group.id} onClick={() => handleShare(group.id)}>
            {group.name}
          </button>
        ))}

        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}