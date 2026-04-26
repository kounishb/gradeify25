const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
console.log("Groups API base:", API);

async function parseRes(res) {
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }

  return data;
}

export async function getGroups() {
  const res = await fetch(`${API}/api/groups`, {
    credentials: "include",
  });
  return parseRes(res);
}

export async function createGroup(name) {
  const res = await fetch(`${API}/api/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name }),
  });
  return parseRes(res);
}

export async function getMessages(groupId) {
  const res = await fetch(`${API}/api/groups/${groupId}/messages`, {
    credentials: "include",
  });
  return parseRes(res);
}

export async function sendMessage(groupId, payload) {
  const res = await fetch(`${API}/api/groups/${groupId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return parseRes(res);
}

