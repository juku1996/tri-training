// Feedback an Julius. Jeder kann schreiben; nur der Admin sieht alle Rückmeldungen.

const Feedback = (() => {
  let kind = "Idee";
  let admin = false;

  function setKind(v) {
    kind = v;
    document.querySelectorAll("#feedback-kind .chip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.v === v));
  }

  async function render() {
    if (!me) return;
    const { data } = await db.rpc("is_admin");
    admin = data === true;
    $("admin-feedback").hidden = !admin;
    // Der Admin schreibt sich kein Feedback an sich selbst
    $("feedback-card").hidden = admin;
    if (admin) await renderAdmin();
  }

  async function renderAdmin() {
    const { data, error } = await db.from("feedback")
      .select("id, kind, body, resolved, created_at, author:profiles(name)")
      .order("created_at", { ascending: false }).limit(50);
    const list = $("admin-feedback-list");
    list.innerHTML = "";
    if (error) { list.textContent = translate(error); return; }
    const open = (data || []).filter((f) => !f.resolved).length;
    const badge = $("admin-feedback-count");
    badge.hidden = !open; badge.textContent = open + " offen";
    if (!data || !data.length) {
      const li = document.createElement("li");
      li.className = "empty"; li.style.color = "var(--muted)"; li.textContent = "Noch kein Feedback.";
      list.append(li); return;
    }
    data.forEach((f) => {
      const li = document.createElement("li");
      if (f.resolved) li.className = "fb-resolved";
      const head = document.createElement("div"); head.className = "head";
      const who = document.createElement("span"); who.className = "who"; who.textContent = f.author ? f.author.name : "Unbekannt";
      const when = document.createElement("span"); when.className = "when";
      when.textContent = f.kind + " · " + (typeof formatWhen === "function" ? formatWhen(f.created_at) : "");
      const tog = document.createElement("button");
      tog.type = "button"; tog.className = "del"; tog.textContent = f.resolved ? "Wieder öffnen" : "Erledigt";
      tog.addEventListener("click", async () => {
        const { error: e } = await db.from("feedback").update({ resolved: !f.resolved }).eq("id", f.id);
        if (e) return alert(translate(e));
        renderAdmin();
      });
      head.append(who, when, tog);
      const body = document.createElement("div"); body.className = "body"; body.textContent = f.body;
      li.append(head, body);
      list.append(li);
    });
  }

  async function send(e) {
    e.preventDefault();
    const t = $("feedback-text").value.trim();
    const m = $("feedback-msg");
    if (!t || !me) return;
    const btn = $("feedback-send");
    btn.disabled = true;
    const { error } = await db.from("feedback").insert({ author_id: me.id, kind, body: t });
    btn.disabled = false;
    if (error) { m.textContent = translate(error); m.className = "msg error"; return; }
    $("feedback-text").value = "";
    m.textContent = "Danke! Julius bekommt Bescheid.";
    m.className = "msg ok";
  }

  function bind() {
    $("feedback-form").addEventListener("submit", send);
    document.querySelectorAll("#feedback-kind .chip").forEach((c) => c.addEventListener("click", () => setKind(c.dataset.v)));
  }

  return { bind, render };
})();
