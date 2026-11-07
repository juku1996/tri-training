// Push-Benachrichtigungen: Gerät anmelden, Einstellungen, Test.
// Versendet wird serverseitig (Supabase Edge Function send-push).

const Push = (() => {
  const TYPES = [
    { id: "messages", label: "Neue Nachrichten auf der Pinnwand" },
    { id: "coach", label: "Neue Einschätzung oder Plan von Claude" },
    { id: "weekly", label: "Sonntags: Erinnerung an den Wochencheck" }
  ];
  let prefs = { messages: true, coach: true, weekly: true };

  const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = () => window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;

  function b64ToBytes(b64) {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  async function currentSubscription() {
    if (!supported()) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  async function storeSubscription(sub) {
    const j = sub.toJSON();
    const { error } = await db.from("push_subscriptions").upsert({
      user_id: me.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
      user_agent: navigator.userAgent.slice(0, 200)
    }, { onConflict: "endpoint" });
    if (error) throw error;
  }

  function setMsg(text, kind) {
    const m = $("push-msg");
    m.textContent = text || "";
    m.className = "msg" + (kind ? " " + kind : "");
  }

  // ---------- Anzeige ----------
  async function render() {
    if (!me) return;
    const status = $("push-status");
    const enable = $("push-enable");
    const on = $("push-on");
    on.hidden = true; enable.hidden = true;
    setMsg("");

    if (isIOS() && !standalone()) {
      status.textContent = "Auf dem iPhone gehen Benachrichtigungen nur in der installierten App. Leg Tri-Training zuerst auf den Home-Bildschirm und öffne es von dort.";
      return;
    }
    if (!supported()) {
      status.textContent = "Dieser Browser unterstützt leider keine Benachrichtigungen.";
      return;
    }
    if (Notification.permission === "denied") {
      status.textContent = isIOS()
        ? "Benachrichtigungen sind blockiert. Erlauben kannst du sie in den iPhone-Einstellungen unter Mitteilungen → Tri-Training."
        : "Benachrichtigungen sind blockiert. Erlauben kannst du sie in den Browser-Einstellungen für diese Seite.";
      return;
    }

    let sub = null;
    try { sub = await currentSubscription(); } catch (e) {}
    if (sub && Notification.permission === "granted") {
      try { await storeSubscription(sub); } catch (e) {}  // sicherstellen, dass das Gerät hinterlegt ist
      await loadPrefs();
      status.textContent = "Auf diesem Gerät eingeschaltet.";
      on.hidden = false;
      renderToggles();
    } else {
      status.textContent = "Lass dich benachrichtigen, wenn jemand auf der Pinnwand schreibt oder dein Plan da ist.";
      enable.hidden = false;
    }
  }

  async function loadPrefs() {
    const { data } = await db.from("notification_settings")
      .select("messages, coach, weekly").eq("user_id", me.id).maybeSingle();
    if (data) prefs = data;
  }

  function renderToggles() {
    const box = $("push-toggles");
    box.innerHTML = "";
    TYPES.forEach((t) => {
      const row = document.createElement("label");
      row.className = "switch-row";
      const text = document.createElement("span");
      text.textContent = t.label;
      const input = document.createElement("input");
      input.type = "checkbox"; input.className = "switch"; input.checked = prefs[t.id] !== false;
      input.addEventListener("change", async () => {
        prefs[t.id] = input.checked;
        const { error } = await db.from("notification_settings").upsert({ user_id: me.id, ...prefs }, { onConflict: "user_id" });
        if (error) { setMsg(translate(error), "error"); input.checked = !input.checked; prefs[t.id] = input.checked; }
      });
      row.append(text, input);
      box.append(row);
    });
  }

  // ---------- Aktionen ----------
  async function enable() {
    const btn = $("push-enable");
    btn.disabled = true;
    setMsg("Einen Moment …");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        btn.disabled = false;
        setMsg("Ohne Erlaubnis geht es leider nicht. Du kannst es jederzeit nochmal versuchen.", "error");
        if (perm === "denied") render();
        return;
      }
      const { data: key, error } = await db.rpc("push_public_key");
      if (error || !key) throw error || new Error("Schlüssel fehlt");
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      await storeSubscription(sub);
      await db.from("notification_settings").upsert({ user_id: me.id, ...prefs }, { onConflict: "user_id" });
      btn.disabled = false;
      await render();
      setMsg("Eingeschaltet ✓", "ok");
    } catch (e) {
      btn.disabled = false;
      setMsg(translate(e), "error");
    }
  }

  async function test() {
    setMsg("Sende Test …");
    const { error } = await db.rpc("request_test_push");
    if (error) return setMsg(translate(error), "error");
    setMsg("Test verschickt. Die Benachrichtigung sollte gleich erscheinen.", "ok");
  }

  async function disable() {
    try {
      const sub = await currentSubscription();
      if (sub) {
        await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
    } catch (e) {}
    await render();
    setMsg("Auf diesem Gerät ausgeschaltet.");
  }

  // Beim Abmelden: Gerät entkoppeln, damit es keine Nachrichten mehr für diese Person bekommt
  async function onLogout() {
    try {
      const sub = await currentSubscription();
      if (sub) {
        await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
    } catch (e) {}
  }

  function bind() {
    $("push-enable").addEventListener("click", enable);
    $("push-test").addEventListener("click", test);
    $("push-off").addEventListener("click", disable);
  }

  return { bind, render, onLogout };
})();
