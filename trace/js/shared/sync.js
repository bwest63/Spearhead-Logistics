/* TRACE shared mode: Supabase sign-in, offline-first sync, and live updates.
 *
 * The app keeps using its existing localStorage keys as its working copy.
 * This layer:
 *  - fills those keys from the shared database at start-up;
 *  - turns each local save into queued row changes (the "outbox") and sends
 *    them whenever there is a connection, so OC/Ts can keep working without
 *    signal;
 *  - applies other OC/Ts' changes as they arrive and redraws the screen.
 *
 * Every shared table has the same shape: one app object per row
 * (id, data jsonb, created_by, created_at, updated_at, updated_by).
 * See supabase/schema.sql for the tables and their access rules.
 */
const TraceSync = (function () {
  const OUTBOX_KEY = "trace_sync_outbox_v1";
  const SYNCED_KEY = "trace_sync_synced_v1";
  const PROFILE_KEY = "trace_sync_profile_v1";
  const OWNER_KEY = "trace_sync_owner_v1";
  const PRE_SHARED_KEY = "trace_pre_shared_backup_v1";
  const WORKSPACE_KEY = "trace_oct_workspace_v23";
  const FILE_BUCKET = "teo-sources";
  const UPLOAD_CHUNK = 200;
  const MAX_ATTEMPTS = 5;

  // Which app data set maps to which table. Units and events share one key.
  const COLLECTIONS = [
    {
      table: "units",
      key: "trace_v18_units_events",
      field: "units",
      id: (u) => u.id,
    },
    {
      table: "events",
      key: "trace_v18_units_events",
      field: "events",
      id: (e) => e.id,
    },
    { table: "teos", key: "trace_v23_imported_teos_v1", id: (t) => t.id },
    {
      table: "evaluations",
      key: "trace_bsb_standalone_v1",
      id: (r) => r.id,
      owned: true,
    },
    {
      table: "claims",
      key: "trace_observer_assignments_v07",
      id: (a) => [a.unitId, a.exerciseId, a.taskId, a.index].join("|"),
      owned: true,
    },
    {
      table: "oct_logs",
      key: "trace_v32_oct_log",
      id: (l) => l.id,
      owned: true,
    },
  ];
  const ADMIN_TABLES = new Set(["units", "events", "teos"]);

  const api = {
    shared: true,
    userId: "",
    displayName: "",
    isAdmin: false,
    active: true,
    // The Supabase client, for admin features that talk to the database directly.
    db: () => client,
    start,
    attach,
    notify,
    files: { put: putFile, get: getFile, remove: removeFile },
  };

  let client = null;
  let outbox = load(OUTBOX_KEY, []); // [{table, id, op: "upsert"|"delete", object?, attempts}]
  let synced = load(SYNCED_KEY, {}); // {table: {id: hash of the copy the server holds}}
  let flushing = false;
  let online = navigator.onLine;
  let live = false;
  let wasDisconnected = false;
  let attached = false;
  let renderTimer = 0;
  let renderPending = false;

  function load(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function store(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("TRACE sync could not write " + key, e);
    }
  }
  // cyrb53: fast 53-bit string hash, used only to tell whether an object changed.
  function hash(str) {
    let h1 = 0xdeadbeef,
      h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 =
      Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
      Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 =
      Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
      Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  const fingerprint = (o) => hash(JSON.stringify(o));
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const collection = (table) => COLLECTIONS.find((c) => c.table === table);
  const known = (table) => synced[table] || (synced[table] = {});

  // ---------- Local working copy ----------
  function readLocal(c) {
    const v = load(c.key, null);
    const list = c.field ? v?.[c.field] : v;
    return Array.isArray(list) ? list : [];
  }
  function writeLocal(c, list) {
    if (!c.field) return store(c.key, list);
    const v = load(c.key, null) || {
      scope: "all",
      eventScope: "all",
      mode: "units",
    };
    v[c.field] = list;
    store(c.key, v);
  }
  function toObject(c, row) {
    const o = { ...row.data };
    if (c.owned) o.createdBy = row.created_by;
    return o;
  }
  function toData(o) {
    const { createdBy, ...data } = o;
    return data;
  }
  // Pushes the in-memory app state to match the working copy (after app scripts load).
  function applyToApp(c) {
    if (!attached) return;
    const list = readLocal(c);
    if (c.table === "evaluations") records = list;
    else if (c.table === "claims") assignments = list;
    else if (c.table === "units" || c.table === "events") {
      trace18[c.table] = list;
      trace18Sync();
    } else if (c.table === "teos") {
      const builtIn = tasks.filter((t) => trace23BuiltInIds.has(t.id));
      const imported = list.filter(
        (t) =>
          t && t.id && Array.isArray(t.steps) && !trace23BuiltInIds.has(t.id),
      );
      imported.forEach(trace23NormalizeEvaluationTask);
      tasks.splice(0, tasks.length, ...builtIn, ...imported);
    }
  }

  // ---------- Reading from the server ----------
  async function fetchTable(c) {
    const { data, error } = await client
      .from(c.table)
      .select("id,data,created_by,created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  // Replaces the working copy with the server's rows, keeping unsent local changes on top.
  function replaceTable(c, rows) {
    let list = rows.map((r) => toObject(c, r));
    const k = (synced[c.table] = {});
    list.forEach((o) => (k[String(c.id(o))] = fingerprint(o)));
    for (const op of outbox.filter((o) => o.table === c.table)) {
      list = list.filter((o) => String(c.id(o)) !== op.id);
      if (op.op === "upsert") {
        list.push(op.object);
        k[op.id] = fingerprint(op.object);
      } else delete k[op.id];
    }
    if (c.table === "evaluations")
      list.sort((a, b) =>
        String(b.savedAt || "").localeCompare(String(a.savedAt || "")),
      );
    writeLocal(c, list);
  }
  async function pullAll() {
    const rows = await Promise.all(COLLECTIONS.map(fetchTable));
    COLLECTIONS.forEach((c, i) => {
      replaceTable(c, rows[i]);
      applyToApp(c);
    });
    store(SYNCED_KEY, synced);
  }

  // ---------- Sending local changes ----------
  // Called by the app right after it saves one of its data sets.
  function notify(key) {
    for (const c of COLLECTIONS.filter((c) => c.key === key)) {
      const k = known(c.table);
      const seen = new Set();
      for (const o of readLocal(c)) {
        const id = String(c.id(o));
        seen.add(id);
        const h = fingerprint(o);
        if (k[id] !== h) {
          k[id] = h;
          queue({ table: c.table, id, op: "upsert", object: o });
        }
      }
      for (const id of Object.keys(k))
        if (!seen.has(id)) {
          delete k[id];
          queue({ table: c.table, id, op: "delete" });
        }
    }
    store(SYNCED_KEY, synced);
    store(OUTBOX_KEY, outbox);
    updateStatus();
    flush();
  }
  function queue(op) {
    outbox = outbox.filter((o) => !(o.table === op.table && o.id === op.id));
    outbox.push({ ...op, attempts: 0 });
  }
  // A missing connection leaves the change queued; anything else is a refusal by the server.
  function isConnectionError(err) {
    return !err?.code || err.code === "PGRST301";
  }
  async function flush() {
    if (flushing || !outbox.length || !client) return;
    flushing = true;
    updateStatus();
    try {
      while (outbox.length) {
        const op = outbox[0];
        const done = () => {
          outbox = outbox.filter((o) => o !== op);
          store(OUTBOX_KEY, outbox);
        };
        const res =
          op.op === "upsert"
            ? await client
                .from(op.table)
                .upsert({ id: op.id, data: toData(op.object) })
                .select("id")
            : await client.from(op.table).delete().eq("id", op.id).select("id");
        if (
          res.error &&
          isConnectionError(res.error) &&
          ++op.attempts < MAX_ATTEMPTS
        ) {
          setOnline(false);
          break;
        }
        if (res.error) {
          done();
          await rejected(op, res.error);
          continue;
        }
        // A refused delete returns no rows; so does deleting a row someone already removed.
        if (op.op === "delete" && !res.data?.length) {
          const check = await client
            .from(op.table)
            .select("id")
            .eq("id", op.id);
          if (!check.error && check.data?.length) {
            done();
            await rejected(op, { message: "permission denied" });
            continue;
          }
        }
        done();
        setOnline(true);
      }
    } finally {
      flushing = false;
      updateStatus();
    }
  }
  async function rejected(op, err) {
    console.warn("TRACE: the shared database refused a change", op, err);
    toast(
      ADMIN_TABLES.has(op.table)
        ? "Only TRACE admins can change units, events, and T&EOs. Your change was undone."
        : op.table === "claims"
          ? "Another OC/T holds that claim. The current claims are shown."
          : "You can only change entries you created. Your change was undone.",
    );
    await refetch(op.table);
  }
  async function refetch(table) {
    const c = collection(table);
    try {
      replaceTable(c, await fetchTable(c));
      store(SYNCED_KEY, synced);
      applyToApp(c);
      scheduleRender();
    } catch (e) {
      if (isConnectionError(e)) setOnline(false);
    }
  }
  // Catch up after being offline or asleep: send what is queued, then reload everything.
  async function resync() {
    if (!client) return;
    await flush();
    try {
      await pullAll();
      setOnline(true);
      scheduleRender();
    } catch (e) {
      if (isConnectionError(e)) setOnline(false);
      else console.warn("TRACE resync failed", e);
    }
  }

  // ---------- Live updates from other OC/Ts ----------
  function subscribe() {
    const channel = client.channel("trace-shared");
    for (const c of COLLECTIONS)
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: c.table },
        (p) => onRemoteChange(c, p),
      );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        live = true;
        if (wasDisconnected) resync();
        wasDisconnected = false;
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        live = false;
        wasDisconnected = true;
      }
      updateStatus();
    });
  }
  function onRemoteChange(c, payload) {
    const removed = payload.eventType === "DELETE";
    const id = String((removed ? payload.old : payload.new)?.id ?? "");
    // An unsent local change to the same row wins; it is sent next.
    if (!id || outbox.some((o) => o.table === c.table && o.id === id)) return;
    const k = known(c.table);
    const list = readLocal(c);
    const index = list.findIndex((o) => String(c.id(o)) === id);
    if (removed) {
      delete k[id];
      if (index < 0) return;
      list.splice(index, 1);
    } else {
      const o = toObject(c, payload.new);
      const h = fingerprint(o);
      if (k[id] === h && index >= 0) return;
      k[id] = h;
      if (index >= 0) list[index] = o;
      else if (c.table === "evaluations") list.unshift(o);
      else list.push(o);
    }
    writeLocal(c, list);
    store(SYNCED_KEY, synced);
    applyToApp(c);
    scheduleRender();
  }
  // Redraw with the new data unless the OC/T is in the middle of typing or editing.
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      if (!attached) return;
      const busy =
        document.querySelector(".trace18-shade") ||
        document.activeElement?.closest?.(
          "#content input, #content textarea, #content select",
        ) ||
        (state.tab === "evaluate" && (state.dirty || state.editingId));
      if (busy) {
        renderPending = true;
        return;
      }
      renderPending = false;
      if (state.tab === "evaluate") traceRestoreEvaluation();
      render();
    }, 150);
  }

  // ---------- Status, toasts, and account controls ----------
  function setOnline(value) {
    if (online === value) return;
    online = value;
    updateStatus();
  }
  function updateStatus() {
    const chip = document.getElementById("traceSyncChip");
    if (!chip) return;
    const n = outbox.length;
    const pending = n ? ` · ${n} change${n === 1 ? "" : "s"} waiting` : "";
    const [stateName, text] = !online
      ? ["offline", "Offline" + pending]
      : n
        ? ["syncing", "Syncing" + pending]
        : live
          ? ["live", "Live"]
          : ["connecting", "Connecting…"];
    chip.dataset.state = stateName;
    chip.textContent = text;
    chip.title = !online
      ? "No connection. Your changes are saved on this device and sent when the connection returns."
      : "Changes from every OC/T appear here as they are saved.";
  }
  function toast(message) {
    let el = document.getElementById("traceToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "traceToast";
      el.className = "trace-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove("show"), 6000);
  }
  function clearCache() {
    for (const key of [
      ...new Set(COLLECTIONS.map((c) => c.key)),
      OUTBOX_KEY,
      SYNCED_KEY,
      PROFILE_KEY,
      OWNER_KEY,
      WORKSPACE_KEY,
    ])
      localStorage.removeItem(key);
    outbox = [];
    synced = {};
  }
  async function signOut() {
    if (
      outbox.length &&
      !confirm(
        `${outbox.length} change(s) have not reached the shared database yet. Signing out now discards them. Sign out anyway?`,
      )
    )
      return;
    await client.auth.signOut().catch(() => {});
    clearCache();
    location.reload();
  }

  // ---------- Bulk upload (admins) ----------
  // Adds rows from a TRACE backup that the shared database does not have yet; existing rows are left alone.
  async function uploadBackup(backup) {
    let added = 0;
    const failures = [];
    for (const c of COLLECTIONS) {
      const raw = backup?.data?.[c.key];
      if (typeof raw !== "string") continue;
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        failures.push(c.table);
        continue;
      }
      const list = c.field ? value?.[c.field] : value;
      if (!Array.isArray(list)) continue;
      const rows = [
        ...new Map(
          list
            .filter((o) => o && c.id(o) != null)
            .map((o) => [
              String(c.id(o)),
              { id: String(c.id(o)), data: toData(o) },
            ]),
        ).values(),
      ];
      for (let i = 0; i < rows.length; i += UPLOAD_CHUNK) {
        const { data, error } = await client
          .from(c.table)
          .upsert(rows.slice(i, i + UPLOAD_CHUNK), {
            onConflict: "id",
            ignoreDuplicates: true,
          })
          .select("id");
        if (error) failures.push(c.table + ": " + error.message);
        else added += data?.length || 0;
      }
    }
    await resync();
    alert(
      `Upload finished: ${added} new record(s) added to the shared database.` +
        (failures.length
          ? `\n\nSome data could not be uploaded:\n${failures.join("\n")}`
          : ""),
    );
  }
  function readBackupFile(file) {
    return file.text().then((text) => {
      const b = JSON.parse(text);
      if (!b || b.app !== "TRACE" || typeof b.data !== "object")
        throw Error("This is not a TRACE backup file.");
      return b;
    });
  }

  // ---------- T&EO source documents (Supabase Storage) ----------
  const safeName = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, "_");
  async function putFile(id, file) {
    await removeFile(id).catch(() => {});
    const { error } = await client.storage
      .from(FILE_BUCKET)
      .upload(safeName(id) + "/" + safeName(file.name), file, { upsert: true });
    if (error) throw Error(error.message);
  }
  async function getFile(id) {
    const folder = safeName(id);
    const { data, error } = await client.storage.from(FILE_BUCKET).list(folder);
    if (error) throw Error(error.message);
    const entry = data?.[0];
    if (!entry) return null;
    const dl = await client.storage
      .from(FILE_BUCKET)
      .download(folder + "/" + entry.name);
    if (dl.error) throw Error(dl.error.message);
    return { name: entry.name, blob: dl.data };
  }
  async function removeFile(id) {
    const folder = safeName(id);
    const { data } = await client.storage.from(FILE_BUCKET).list(folder);
    if (data?.length)
      await client.storage
        .from(FILE_BUCKET)
        .remove(data.map((f) => folder + "/" + f.name));
  }

  // ---------- Sign-in, password reset, and access checks ----------
  // Builds the full-screen TRACE card used by the sign-in, new-password, and no-access screens.
  function authCard(inner) {
    const shade = document.createElement("div");
    shade.className = "trace-auth";
    shade.innerHTML = `<form class="trace-auth-card" novalidate>
        <img src="img/trace-logo.png" alt="TRACE — Training Readiness Assessment &amp; Coaching Environment">
        ${inner}
      </form>`;
    document.body.appendChild(shade);
    return shade;
  }
  // GoTrue reports a sign-up refused by the invite-only check as a generic database error.
  function friendlyAuthError(err) {
    const text = err?.message || "";
    if (/database error saving new user/i.test(text))
      return "This email hasn't been invited to TRACE. Ask a TRACE admin to add it on the Accounts page.";
    if (/invalid login credentials/i.test(text))
      return "Wrong email or password.";
    if (/email not confirmed/i.test(text))
      return "Confirm your email first: open the link sent to your inbox, then sign in.";
    return text || "Something went wrong. Try again.";
  }
  const appAddress = () => location.href.split("#")[0].split("?")[0];

  function signInScreen(message) {
    return new Promise((resolve) => {
      const shade = authCard(`
        <h1 data-title>Sign in</h1>
        <p class="trace-auth-sub">Shared OC/T workspace · Fictional demonstration data only</p>
        <label data-only="signup" hidden>Name or OC/T call sign<input name="name" autocomplete="name" maxlength="80"></label>
        <label>Email<input name="email" type="email" autocomplete="username" required></label>
        <label data-only="signin signup">Password<input name="password" type="password" autocomplete="current-password" minlength="8" required></label>
        <p class="trace-auth-msg" role="alert"></p>
        <button class="primary" type="submit" data-submit>Sign in</button>
        <div class="trace-auth-links">
          <button class="text-link" type="button" data-go="signup">New OC/T? Create an account</button>
          <button class="text-link" type="button" data-go="reset">Forgot password?</button>
          <button class="text-link" type="button" data-go="signin" hidden>Back to sign in</button>
        </div>`);
      const form = shade.querySelector("form");
      const msg = shade.querySelector(".trace-auth-msg");
      const titles = {
        signin: ["Sign in", "Sign in"],
        signup: ["Create account", "Create account"],
        reset: ["Reset password", "Email me a reset link"],
      };
      let mode = "signin";
      const setMode = (next, note = "") => {
        mode = next;
        shade
          .querySelectorAll("[data-only]")
          .forEach(
            (el) => (el.hidden = !el.dataset.only.split(" ").includes(mode)),
          );
        shade
          .querySelectorAll("[data-go]")
          .forEach(
            (el) =>
              (el.hidden =
                el.dataset.go === mode ||
                (mode !== "signin" && el.dataset.go !== "signin")),
          );
        shade.querySelector("[data-title]").textContent = titles[mode][0];
        shade.querySelector("[data-submit]").textContent = titles[mode][1];
        form.password.autocomplete =
          mode === "signup" ? "new-password" : "current-password";
        msg.textContent = note;
      };
      shade
        .querySelectorAll("[data-go]")
        .forEach((el) => (el.onclick = () => setMode(el.dataset.go)));
      setMode("signin", message || "");
      form.onsubmit = async (e) => {
        e.preventDefault();
        const email = form.email.value.trim();
        const password = form.password.value;
        const name = form.name.value.trim();
        if (!email) return (msg.textContent = "Enter your email.");
        if (mode !== "reset" && !password)
          return (msg.textContent = "Enter your password.");
        if (mode === "signup" && !name)
          return (msg.textContent = "Enter your name or call sign.");
        if (mode === "signup" && password.length < 8)
          return (msg.textContent = "Use a password of at least 8 characters.");
        const button = shade.querySelector("[data-submit]");
        button.disabled = true;
        msg.textContent = {
          signin: "Signing in…",
          signup: "Creating account…",
          reset: "Sending…",
        }[mode];
        try {
          if (mode === "reset") {
            const { error } = await client.auth.resetPasswordForEmail(email, {
              redirectTo: appAddress(),
            });
            if (error) throw error;
            setMode(
              "signin",
              "If that email has a TRACE account, a reset link is on its way. Open it on this device to choose a new password.",
            );
            return;
          }
          const { data, error } =
            mode === "signup"
              ? await client.auth.signUp({
                  email,
                  password,
                  options: {
                    data: { display_name: name },
                    emailRedirectTo: appAddress(),
                  },
                })
              : await client.auth.signInWithPassword({ email, password });
          if (error) throw error;
          if (!data.session) {
            setMode(
              "signin",
              "Account created. Open the confirmation link sent to your email, then sign in here.",
            );
            return;
          }
          shade.remove();
          resolve(data.session);
        } catch (err) {
          msg.textContent = navigator.onLine
            ? friendlyAuthError(err)
            : "No connection. Connect to the internet to sign in.";
        } finally {
          button.disabled = false;
        }
      };
      form.email.focus();
    });
  }
  // Shown after opening a password-reset link: the link has signed the person in for this purpose.
  function newPasswordScreen() {
    return new Promise((resolve) => {
      const shade = authCard(`
        <h1>Choose a new password</h1>
        <p class="trace-auth-sub">At least 8 characters.</p>
        <label>New password<input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
        <label>Repeat new password<input name="confirm" type="password" autocomplete="new-password" minlength="8" required></label>
        <p class="trace-auth-msg" role="alert"></p>
        <button class="primary" type="submit">Save password</button>`);
      const form = shade.querySelector("form");
      const msg = shade.querySelector(".trace-auth-msg");
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (form.password.value.length < 8)
          return (msg.textContent = "Use at least 8 characters.");
        if (form.password.value !== form.confirm.value)
          return (msg.textContent = "The passwords don't match.");
        const button = form.querySelector("button");
        button.disabled = true;
        msg.textContent = "Saving…";
        const { error } = await client.auth.updateUser({
          password: form.password.value,
        });
        button.disabled = false;
        if (error) return (msg.textContent = friendlyAuthError(error));
        history.replaceState(null, "", appAddress());
        shade.remove();
        resolve();
      };
      form.password.focus();
    });
  }
  // An admin turned this account's access off; the database already hides all data from it.
  function noAccessScreen() {
    const shade = authCard(`
        <h1>Access turned off</h1>
        <p class="trace-auth-sub">A TRACE admin has turned off access for ${esc(api.displayName)}. Ask an admin to restore it.</p>
        <button class="primary" type="button">Sign out</button>`);
    shade.querySelector("button").onclick = signOut;
    return new Promise(() => {}); // Start-up stops here.
  }
  async function loadProfile(user) {
    api.userId = user.id;
    const cached = load(PROFILE_KEY, null);
    let profile = cached?.id === user.id ? cached : null;
    const { data, error } = await client
      .from("profiles")
      .select("display_name,role,active")
      .eq("id", user.id)
      .maybeSingle();
    if (!error && data) {
      profile = { id: user.id, ...data };
      store(PROFILE_KEY, profile);
    }
    api.displayName =
      profile?.display_name ||
      user.user_metadata?.display_name ||
      user.email?.split("@")[0] ||
      "OC/T";
    api.isAdmin = profile?.role === "admin" && profile?.active !== false;
    api.active = profile?.active !== false;
  }

  // ---------- Start-up (before app scripts) ----------
  async function start(cfg) {
    // Read before the client starts: it consumes the reset link's token from the address.
    const resetLink = /type=recovery/.test(location.hash);
    // A reset link opened in a tab that already shows TRACE only changes the address's #part.
    window.addEventListener("hashchange", () => {
      if (/type=recovery/.test(location.hash)) location.reload();
    });
    client = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    let resetEvent = false;
    client.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") resetEvent = true;
    });
    let {
      data: { session },
    } = await client.auth.getSession();
    await new Promise((r) => setTimeout(r, 0)); // The recovery event is announced on the next tick.
    if (session && (resetLink || resetEvent)) await newPasswordScreen();
    if (!session) session = await signInScreen();
    await loadProfile(session.user);
    if (!api.active) await noAccessScreen();

    const owner = localStorage.getItem(OWNER_KEY);
    if (owner && owner !== api.userId) clearCache();
    else if (!owner) keepPreSharedCopy();
    localStorage.setItem(OWNER_KEY, api.userId);

    try {
      await pullAll();
      online = true;
    } catch (e) {
      if (!isConnectionError(e)) throw e;
      online = false; // Work from this device's copy until the connection returns.
    }
  }
  // First shared sign-in on a browser that holds local-only data: keep a copy before it is replaced.
  function keepPreSharedCopy() {
    const data = {};
    for (const key of new Set(COLLECTIONS.map((c) => c.key))) {
      const v = localStorage.getItem(key);
      if (v && v !== "[]") data[key] = v;
    }
    if (Object.keys(data).length && !localStorage.getItem(PRE_SHARED_KEY))
      store(PRE_SHARED_KEY, {
        app: "TRACE",
        version: 42,
        exported: new Date().toISOString(),
        data,
      });
  }

  // ---------- Attach to the running app (after app scripts) ----------
  function attach() {
    attached = true;
    if (!state.evaluator) state.evaluator = api.displayName;
    document.body.classList.add(
      "trace-shared",
      api.isAdmin ? "trace-admin" : "trace-oct",
    );

    const footer = document.querySelector("main > footer");
    if (footer)
      footer.textContent =
        "TRACE v42 · Shared demonstration · Synced through Supabase · Fictional data only · No official Army connection";
    const sideFooter = document.querySelector(".sidebar-footer");
    if (sideFooter)
      sideFooter.textContent =
        "Prototype only · Public T&EO references · Fictional evaluation data · Shared with signed-in OC/Ts";

    const header = document.querySelector(".app-header .header-right");
    if (header) {
      const chip = document.createElement("span");
      chip.id = "traceSyncChip";
      chip.className = "trace-sync-chip";
      chip.setAttribute("role", "status");
      header.insertBefore(chip, header.firstChild);
    }

    const backup = document.querySelector(".trace42-backup");
    const account = document.createElement("div");
    account.className = "trace-account";
    account.innerHTML = `<div class="side-note">SIGNED IN</div><div class="trace-account-name"><strong></strong><small></small></div><button type="button" id="traceSignOut">Sign out</button>`;
    account.querySelector("strong").textContent = api.displayName;
    account.querySelector("small").textContent = api.isAdmin
      ? "TRACE admin"
      : "OC/T";
    account.querySelector("#traceSignOut").onclick = signOut;
    if (backup) backup.parentElement.insertBefore(account, backup);

    if (api.isAdmin && backup) {
      const upload = document.createElement("button");
      upload.type = "button";
      upload.textContent = "⇧ Upload backup to shared";
      upload.title =
        "Add records from a TRACE backup file that the shared database does not have yet";
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.hidden = true;
      upload.onclick = () => input.click();
      input.onchange = async () => {
        const file = input.files[0];
        input.value = "";
        if (!file) return;
        try {
          const b = await readBackupFile(file);
          if (
            confirm(
              "Add this backup's records to the shared database? Records that already exist are not changed.",
            )
          )
            await uploadBackup(b);
        } catch (e) {
          alert("Backup could not be uploaded: " + e.message);
        }
      };
      backup.append(upload, input);
      const earlier = load(PRE_SHARED_KEY, null);
      if (earlier) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "⇧ Upload earlier local data";
        btn.title =
          "This browser held local-only TRACE data before shared mode. Add it to the shared database.";
        btn.onclick = async () => {
          if (
            !confirm(
              "Add the data this browser held before shared mode to the shared database?",
            )
          )
            return;
          await uploadBackup(earlier);
          localStorage.removeItem(PRE_SHARED_KEY);
          btn.remove();
        };
        backup.append(btn);
      }
    }

    window.addEventListener("online", () => {
      setOnline(true);
      resync();
    });
    window.addEventListener("offline", () => setOnline(false));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") resync();
    });
    document.addEventListener("focusout", () => {
      if (renderPending) setTimeout(scheduleRender, 0);
    });
    setInterval(() => {
      if (outbox.length) flush();
    }, 20000);
    subscribe();
    updateStatus();
    flush();
  }

  return api;
})();
// The app reaches the sync layer as window.TraceSync (absent in local-only mode).
window.TraceSync = TraceSync;
