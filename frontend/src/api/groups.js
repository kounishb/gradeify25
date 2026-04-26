const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

export async function getGroups() {
  const res = await fetch(`${API}/api/groups`, {
    credentials: "include",
  });
  return res.json();
}

export async function createGroup(name) {
  const res = await fetch(`${API}/api/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function getMessages(groupId) {
  const res = await fetch(`${API}/api/groups/${groupId}/messages`, {
    credentials: "include",
  });
  return res.json();
}

export async function sendMessage(groupId, payload) {
  const res = await fetch(`${API}/api/groups/${groupId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return res.json();
}