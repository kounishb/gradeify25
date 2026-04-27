import express from "express";

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

export default function groupsRouter({ supabase }) {
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    const userId = req.session.userId;

    const { data, error } = await supabase
      .from("group_members")
      .select("group_id, groups(id, name, created_at)")
      .eq("user_id", userId);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ groups: (data || []).map((row) => row.groups).filter(Boolean) });
  });

  router.post("/", async (req, res) => {
    const userId = req.session.userId;
    const { name } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: "Group name required" });
    }

    const { data: group, error: groupError } = await supabase
      .from("groups")
      .insert({ name: name.trim() })
      .select()
      .single();

    if (groupError) return res.status(500).json({ error: groupError.message });

    const { error: memberError } = await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: userId,
    });

    if (memberError) {
      return res.status(500).json({ error: memberError.message });
    }

    res.json({ group });
  });

  router.post("/:groupId/join", async (req, res) => {
    const userId = req.session.userId;
    const { groupId } = req.params;

    const { error } = await supabase.from("group_members").upsert(
      {
        group_id: groupId,
        user_id: userId,
      },
      { onConflict: "group_id,user_id" }
    );

    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true });
  });

  router.get("/users/all", async (req, res) => {
    const userId = req.session.userId;

    const { data, error } = await supabase
      .from("users")
      .select("id, username, display_name")
      .order("username", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    res.json({
      users: (data || []).filter((u) => u.id !== userId),
    });
  });

  router.get("/:groupId/members", async (req, res) => {
    const userId = req.session.userId;
    const { groupId } = req.params;

    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ error: "You are not in this group" });
    }

    const { data, error } = await supabase
      .from("group_members")
      .select("id, user_id, users(id, username, display_name)")
      .eq("group_id", groupId);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ members: data || [] });
  });

  router.post("/:groupId/members", async (req, res) => {
    const userId = req.session.userId;
    const { groupId } = req.params;
    const { user_id } = req.body;

    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ error: "You are not in this group" });
    }

    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id" });
    }

    const { data, error } = await supabase
      .from("group_members")
      .upsert(
        {
          group_id: groupId,
          user_id,
        },
        { onConflict: "group_id,user_id" }
      )
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ member: data });
  });

  router.get("/:groupId/messages", async (req, res) => {
    const userId = req.session.userId;
    const { groupId } = req.params;

    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ error: "You are not in this group" });
    }

    const { data, error } = await supabase
      .from("chat_messages")
      .select(`
        id,
        message,
        shared_type,
        shared_item_id,
        created_at,
        user_id,
        users(display_name, username)
      `)
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    res.json({ messages: data || [] });
  });

  router.post("/:groupId/messages", async (req, res) => {
    const userId = req.session.userId;
    const { groupId } = req.params;
    const { message, shared_type, shared_item_id } = req.body;

    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ error: "You are not in this group" });
    }

    if (!message?.trim() && !shared_type) {
      return res.status(400).json({ error: "Message or shared item required" });
    }

    const { data, error } = await supabase
      .from("chat_messages")
      .insert({
        group_id: groupId,
        user_id: userId,
        message: message?.trim() || null,
        shared_type: shared_type || null,
        shared_item_id: shared_item_id || null,
      })
      .select(`
        id,
        message,
        shared_type,
        shared_item_id,
        created_at,
        user_id,
        users(display_name, username)
      `)
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ message: data });
  });

  router.delete("/:groupId", async (req, res) => {
    const userId = req.session.userId;
    const { groupId } = req.params;

    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ error: "You are not in this group" });
    }

    const { error } = await supabase
      .from("groups")
      .delete()
      .eq("id", groupId);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true });
  });

  return router;
}