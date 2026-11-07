// Nachrichten und Rückfragen von Claude (Tabelle claude_messages), angezeigt im Bereich Heute.

const Nachrichten = (() => {
  async function render() {
    const box = $("claude-msgs");
    if (!box || !me) return;
    const { data, error } = await db.from("claude_messages")
      .select("id, kind, body, status, created_at")
      .eq("user_id", me.id).eq("status", "offen")
      .order("created_at", { ascending: false }).limit(5);
    box.innerHTML = "";
    if (error || !data || !data.length) return;
    data.forEach((m) => {
      const card = document.createElement("div"); card.className = "card claude-msg";
      const head = document.createElement("div"); head.className = "cm-head";
      const t = document.createElement("b"); t.textContent = m.kind === "frage" ? "Claude fragt" : "Nachricht von Claude";
      const w = document.createElement("span"); w.className = "hint";
      w.textContent = typeof formatWhen === "function" ? formatWhen(m.created_at) : "";
      head.append(t, w);
      const body = document.createElement("p"); body.className = "cm-body"; body.textContent = m.body;
      card.append(head, body);
      const msg = document.createElement("div"); msg.className = "msg";
      if (m.kind === "frage") {
        const ta = document.createElement("textarea");
        ta.rows = 2; ta.maxLength = 1500; ta.placeholder = "Deine Antwort …"; ta.setAttribute("aria-label", "Antwort an Claude");
        const b = document.createElement("button"); b.type = "button"; b.textContent = "Antworten";
        b.addEventListener("click", async () => {
          const a = ta.value.trim();
          if (!a) { ta.focus(); return; }
          b.disabled = true;
          const { error: e } = await db.from("claude_messages").update({ answer: a }).eq("id", m.id);
          b.disabled = false;
          if (e) { msg.textContent = translate(e); msg.className = "msg error"; return; }
          card.innerHTML = "";
          const ok = document.createElement("p"); ok.className = "cm-body";
          ok.textContent = "Danke! Claude berücksichtigt deine Antwort beim nächsten Check.";
          card.append(ok);
          setTimeout(() => card.remove(), 4000);
        });
        const row = document.createElement("div"); row.className = "cm-actions";
        row.append(b);
        card.append(ta, row, msg);
      } else {
        const b = document.createElement("button"); b.type = "button"; b.className = "secondary"; b.textContent = "Verstanden";
        b.addEventListener("click", async () => {
          b.disabled = true;
          const { error: e } = await db.from("claude_messages").update({ status: "gelesen" }).eq("id", m.id);
          if (e) { b.disabled = false; msg.textContent = translate(e); msg.className = "msg error"; return; }
          card.remove();
        });
        const row = document.createElement("div"); row.className = "cm-actions";
        row.append(b);
        card.append(row, msg);
      }
      box.append(card);
    });
  }

  function bind() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && me) render();
    });
  }

  return { bind, render };
})();
