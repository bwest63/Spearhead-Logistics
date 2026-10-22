/* TRACE Accounts page (shared mode, admins only).
 *
 * Lists everyone with a TRACE account and lets admins change roles, rename
 * people, turn access off and on, switch invite-only sign-up, and keep the
 * invite list. The database enforces every rule (supabase/schema.sql); this
 * page only calls the admin functions and tables defined there.
 */
(function () {
  if (!window.TraceSync?.isAdmin) return;
  const db = TraceSync.db();
  let people = [];
  let invites = [];
  let inviteOnly = false;

  const navList = document.querySelector(".sidebar nav");
  if (navList) {
    const button = document.createElement("button");
    button.dataset.nav = "accounts";
    button.innerHTML = `${TRACE_MARK}<span>Accounts</span>`;
    button.onclick = () => nav("accounts");
    navList.appendChild(button);
  }
  const baseRender = render;
  render = function () {
    if (state.tab === "accounts") return renderAccounts();
    baseRender();
  };

  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "Never";

  async function load() {
    const [list, inv, setting] = await Promise.all([
      db.rpc("admin_list_accounts"),
      db
        .from("account_invites")
        .select("email,role,created_at")
        .order("created_at", { ascending: true }),
      db
        .from("trace_settings")
        .select("value")
        .eq("key", "invite_only")
        .maybeSingle(),
    ]);
    const error = list.error || inv.error || setting.error;
    if (error) throw error;
    people = list.data || [];
    invites = inv.data || [];
    inviteOnly = Boolean(setting.data?.value?.enabled);
  }

  async function renderAccounts() {
    $("heading").textContent = "Accounts";
    const content = $("content");
    if (!content.querySelector(".trace-accounts"))
      content.innerHTML =
        '<div class="panel"><p class="hint">Loading accounts…</p></div>';
    try {
      await load();
    } catch (e) {
      content.innerHTML = `<div class="panel"><h2>Accounts unavailable</h2><p class="hint">${esc(
        e.message || "No connection.",
      )} Account management needs a connection to the shared database.</p></div>`;
      return;
    }
    if (state.tab !== "accounts") return;
    draw();
  }

  function draw() {
    const active = people.filter((p) => p.active).length;
    const admins = people.filter((p) => p.active && p.role === "admin").length;
    $("content").innerHTML = `<div class="dash-shell trace-accounts">
      <section class="panel">
        <div class="section-head"><h2>Sign-up</h2><span>${inviteOnly ? "Invite-only" : "Open to anyone with the link"}</span></div>
        <label class="trace-acct-switch"><input type="checkbox" id="acctInviteOnly" ${inviteOnly ? "checked" : ""}>
          <span><strong>Invite-only sign-up</strong><small>Only emails on the invite list below can create an account. People who already have accounts are not affected.</small></span></label>
        <form id="acctInviteForm" class="trace-acct-invite" novalidate>
          <label>Invite by email<input type="email" id="acctInviteEmail" placeholder="name@example.com" autocomplete="off"></label>
          <label>Role<select id="acctInviteRole"><option value="oct">OC/T</option><option value="admin">Admin</option></select></label>
          <button class="primary" type="submit">Add invite</button>
        </form>
        <p class="hint" id="acctInviteMsg" role="status"></p>
        <div class="trace-acct-list">${
          invites
            .map(
              (
                i,
              ) => `<div class="trace-acct-row"><div class="trace-acct-who"><strong>${esc(i.email)}</strong><small>Invited ${esc(when(i.created_at))} · waiting for sign-up</small></div>
                <div class="trace-acct-meta"><span class="trace-acct-badge ${i.role}">${i.role === "admin" ? "Admin" : "OC/T"}</span></div>
                <div class="trace-acct-actions"><button class="secondary" data-uninvite="${esc(i.email)}">Remove invite</button></div></div>`,
            )
            .join("") || '<p class="hint">No pending invites.</p>'
        }</div>
        <p class="hint">Invited people open TRACE, choose <strong>Create an account</strong>, and use the invited email. An invite also sets their role, so you can invite another admin directly.</p>
      </section>
      <section class="panel">
        <div class="section-head"><h2>People (${people.length})</h2><span>${active} active · ${admins} admin${admins === 1 ? "" : "s"}</span></div>
        <div class="trace-acct-list">${people.map(personRow).join("")}</div>
        <p class="hint">Turning off access hides all TRACE data from that person and stops them saving; their earlier records stay. To delete an account permanently, use Supabase → Authentication → Users.</p>
      </section>
    </div>`;
    bind();
  }

  function personRow(p) {
    const self = p.id === TraceSync.userId;
    return `<div class="trace-acct-row ${p.active ? "" : "off"}">
      <div class="trace-acct-who"><strong>${esc(p.display_name || "Unnamed")}${self ? ' <em class="trace-acct-you">You</em>' : ""}</strong><small>${esc(p.email || "")}</small></div>
      <div class="trace-acct-meta">
        <span class="trace-acct-badge ${p.role}">${p.role === "admin" ? "Admin" : "OC/T"}</span>
        <span class="trace-acct-status">${p.active ? "Active" : "Access off"}</span>
        <small>Last sign-in: ${esc(when(p.last_sign_in_at))} · Joined ${esc(when(p.created_at))}</small>
      </div>
      <div class="trace-acct-actions">
        <button class="secondary" data-role="${esc(p.id)}" data-next="${p.role === "admin" ? "oct" : "admin"}">${p.role === "admin" ? (self ? "Step down to OC/T" : "Make OC/T") : "Make admin"}</button>
        <button class="secondary" data-rename="${esc(p.id)}">Rename</button>
        ${self ? "" : `<button class="${p.active ? "danger" : "secondary"}" data-active="${esc(p.id)}" data-next="${!p.active}">${p.active ? "Turn off access" : "Restore access"}</button>`}
      </div>
    </div>`;
  }

  // Runs one change, reports a refusal from the database, and redraws from fresh data.
  async function change(request, after) {
    const { error } = await request;
    if (error) alert(error.message);
    else if (after) return after();
    renderAccounts();
  }

  function bind() {
    const root = $("content");
    $("acctInviteOnly").onchange = (e) =>
      change(
        db
          .from("trace_settings")
          .upsert({ key: "invite_only", value: { enabled: e.target.checked } }),
      );
    $("acctInviteForm").onsubmit = async (e) => {
      e.preventDefault();
      const email = $("acctInviteEmail").value.trim().toLowerCase();
      const msg = $("acctInviteMsg");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return (msg.textContent = "Enter a valid email address.");
      if (people.some((p) => p.email === email))
        return (msg.textContent = `${email} already has an account.`);
      await change(
        db
          .from("account_invites")
          .upsert({ email, role: $("acctInviteRole").value }),
      );
    };
    root
      .querySelectorAll("[data-uninvite]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            change(
              db
                .from("account_invites")
                .delete()
                .eq("email", b.dataset.uninvite),
            )),
      );
    root.querySelectorAll("[data-role]").forEach(
      (b) =>
        (b.onclick = () => {
          const p = people.find((x) => x.id === b.dataset.role);
          const self = p.id === TraceSync.userId;
          const toAdmin = b.dataset.next === "admin";
          const question = toAdmin
            ? `Make ${p.display_name} a TRACE admin? Admins manage units, events, T&EOs, and accounts.`
            : self
              ? "Step down to OC/T? You will lose access to admin features, including this page."
              : `Make ${p.display_name} an OC/T? They will lose admin features.`;
          if (!confirm(question)) return;
          change(
            db.rpc("admin_set_role", {
              target: p.id,
              new_role: b.dataset.next,
            }),
            self && !toAdmin ? () => location.reload() : null,
          );
        }),
    );
    root.querySelectorAll("[data-rename]").forEach(
      (b) =>
        (b.onclick = () => {
          const p = people.find((x) => x.id === b.dataset.rename);
          const name = prompt("Name or OC/T call sign:", p.display_name || "");
          if (name === null || !name.trim() || name.trim() === p.display_name)
            return;
          change(
            db.rpc("admin_rename", { target: p.id, new_name: name.trim() }),
          );
        }),
    );
    root.querySelectorAll("[data-active]").forEach(
      (b) =>
        (b.onclick = () => {
          const p = people.find((x) => x.id === b.dataset.active);
          const on = b.dataset.next === "true";
          if (
            !on &&
            !confirm(
              `Turn off access for ${p.display_name}? They will no longer see or save TRACE data. Their earlier records stay, and you can restore access later.`,
            )
          )
            return;
          change(db.rpc("admin_set_active", { target: p.id, make_active: on }));
        }),
    );
  }
})();
