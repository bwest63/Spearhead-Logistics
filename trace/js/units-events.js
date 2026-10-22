/* TRACE v18: compact unit/event administration; shared T&EO catalog, local-only storage */
const TRACE18_KEY = "trace_v18_units_events";
let trace18 = {
  units: [],
  events: [],
  scope: "all",
  eventScope: "all",
  mode: "units",
};
try {
  const v = JSON.parse(localStorage.getItem(TRACE18_KEY) || "null");
  if (v && Array.isArray(v.units) && Array.isArray(v.events))
    trace18 = { ...trace18, ...v };
} catch (e) {}
// Existing demonstration unit/events are retained for compatibility with saved evaluations.
// Shared mode starts empty: units and events come from the shared database.
const traceSeedDemo = !window.TraceSync?.shared;
if (traceSeedDemo && !trace18.units.length)
  trace18.units = units.map((u) => ({ ...u, archived: false }));
if (traceSeedDemo && !trace18.events.length)
  trace18.events = exercises.map((e) => ({
    ...e,
    unitIds: [],
    archived: false,
  }));
function trace18Sync() {
  units.splice(0, units.length, ...trace18.units.filter((u) => !u.archived));
  exercises.splice(
    0,
    exercises.length,
    ...trace18.events.filter((e) => !e.archived),
  );
  if (!units.some((u) => u.id === state.unitId))
    state.unitId = units[0]?.id || "";
  if (!exercises.some((e) => e.id === state.exerciseId))
    state.exerciseId = exercises[0]?.id || "";
  if (trace18.scope !== "all" && !units.some((u) => u.id === trace18.scope))
    trace18.scope = "all";
  if (
    trace18.eventScope !== "all" &&
    !exercises.some((e) => e.id === trace18.eventScope)
  )
    trace18.eventScope = "all";
}
function trace18Save() {
  try {
    localStorage.setItem(TRACE18_KEY, JSON.stringify(trace18));
    traceSyncNotify(TRACE18_KEY);
  } catch (e) {
    alert("Unable to save changes in this browser.");
  }
}
function trace18Id(prefix) {
  return (
    prefix +
    "-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}
function trace18UnitName(id) {
  return trace18.units.find((u) => u.id === id)?.name || "Unknown unit";
}
function trace18EventsForUnit(uid) {
  return trace18.events.filter(
    (e) => !e.archived && (uid === "all" || e.unitIds.includes(uid)),
  );
}
function trace18SafeOptions(arr, selected) {
  return arr
    .map(
      (x) =>
        `<option value="${esc(x.id)}" ${x.id === selected ? "selected" : ""}>${esc(x.name)}</option>`,
    )
    .join("");
}
function trace18Rating(r) {
  return ["T", "P", "U"].includes(r?.rating) ? r.rating : "—";
}
function trace18Records() {
  return allRecords().filter(
    (r) =>
      (trace18.scope === "all" || r.unitId === trace18.scope) &&
      (trace18.eventScope === "all" || r.exerciseId === trace18.eventScope),
  );
}
function trace18ScopedRecords(uid, ev) {
  return allRecords().filter(
    (r) =>
      (uid === "all" || r.unitId === uid) &&
      (ev === "all" || r.exerciseId === ev),
  );
}
function trace18Modal(title, body, onSave) {
  const shade = document.createElement("div");
  shade.className = "trace18-shade";
  shade.innerHTML = `<div class="trace18-modal" role="dialog" aria-modal="true"><div class="trace18-modalhead"><h2>${esc(title)}</h2><button class="secondary" id="t18close">✕</button></div><form id="t18form">${body}<div class="trace18-actions"><button type="button" class="secondary" id="t18cancel">Cancel</button><button type="submit" class="primary">Save</button></div></form></div>`;
  document.body.append(shade);
  const close = () => {
      shade.remove();
      document.removeEventListener("keydown", onKey);
    },
    onKey = (e) => {
      if (e.key === "Escape") close();
    };
  document.addEventListener("keydown", onKey);
  shade.querySelector("#t18close").setAttribute("aria-label", "Close");
  shade.querySelector("#t18close").onclick = shade.querySelector(
    "#t18cancel",
  ).onclick = close;
  shade.onclick = (e) => {
    if (e.target === shade) close();
  };
  shade.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    if (onSave(new FormData(e.currentTarget)) !== false) {
      close();
      render();
    }
  };
  shade.querySelector("input,select")?.focus();
}
function trace18EditUnit(id) {
  const u = trace18.units.find((x) => x.id === id);
  trace18Modal(
    u ? "Edit Unit" : "Add Unit",
    `<label>Unit name<input name="name" maxlength="100" required placeholder="e.g., 456 CSSB" value="${esc(u?.name || "")}"></label><div class="trace18-two"><label>Echelon / Type<input name="type" placeholder="e.g., CSSB" value="${esc(u?.type || "")}"></label><label>Component<select name="component">${["Active", "Army National Guard", "Army Reserve", "Other"].map((x) => `<option ${x === u?.component ? "selected" : ""}>${x}</option>`).join("")}</select></label></div>`,
    (f) => {
      const name = String(f.get("name") || "").trim();
      if (!name) return false;
      if (u) {
        u.name = name;
        u.type = String(f.get("type"));
        u.component = String(f.get("component"));
      } else
        trace18.units.push({
          id: trace18Id("unit"),
          name,
          type: String(f.get("type")),
          component: String(f.get("component")),
          archived: false,
        });
      trace18Save();
      trace18Sync();
    },
  );
}
function trace18EventDateValues(ev) {
  if (!ev) return { start: "", end: "" };
  if (ev.start || ev.end) return { start: ev.start || "", end: ev.end || "" };
  const raw = String(ev.dates || "").trim();
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})\s*[–—-]\s*(\d{4}-\d{2}-\d{2})$/);
  if (iso) return { start: iso[1], end: iso[2] };
  const months = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  const fmt = (year, month, day) =>
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const range = raw.match(
    /^(\d{1,2})\s*[–—-]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/,
  );
  if (range && months[range[3].toLowerCase()]) {
    const m = months[range[3].toLowerCase()];
    return {
      start: fmt(range[4], m, range[1]),
      end: fmt(range[4], m, range[2]),
    };
  }
  const single = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (single && months[single[2].toLowerCase()]) {
    const date = fmt(single[3], months[single[2].toLowerCase()], single[1]);
    return { start: date, end: date };
  }
  return { start: "", end: "" };
}
function trace18EditEvent(id) {
  const ev = trace18.events.find((x) => x.id === id);
  const checked = ev?.unitIds || [];
  const existingDates = trace18EventDateValues(ev);
  trace18Modal(
    ev ? "Edit Training Event" : "Create Training Event",
    `<label>Event name<input name="name" maxlength="120" required placeholder="e.g., CRX 27-04" value="${esc(ev?.name || "")}"></label><div class="trace18-two"><label>Start date<input type="date" name="start" value="${esc(existingDates.start)}"></label><label>End date<input type="date" name="end" value="${esc(existingDates.end)}"></label></div><p class="trace42-date-error" role="alert" hidden></p><label>Location<input name="location" value="${esc(ev?.location || "")}" placeholder="Training location"></label><label>Description<textarea name="description" rows="2">${esc(ev?.description || "")}</textarea></label><div class="trace18-fieldtitle">Participating units</div><div class="trace18-checks">${
      trace18.units
        .filter((u) => !u.archived)
        .map(
          (u) =>
            `<label><input type="checkbox" name="unitIds" value="${esc(u.id)}" ${checked.includes(u.id) ? "checked" : ""}> ${esc(u.name)}</label>`,
        )
        .join("") || "<p>Add a unit first to assign it.</p>"
    }</div>`,
    (f) => {
      const name = String(f.get("name") || "").trim();
      if (!name) return false;
      const data = {
        name,
        start: String(f.get("start")),
        end: String(f.get("end")),
        location: String(f.get("location")),
        description: String(f.get("description")),
        unitIds: f.getAll("unitIds").map(String),
      };
      if (data.start && data.end && data.end < data.start) {
        const msg = document.querySelector(".trace42-date-error");
        if (msg) {
          msg.textContent = "End date cannot be before the start date.";
          msg.hidden = false;
        }
        return false;
      }
      data.dates =
        [data.start, data.end].filter(Boolean).join(" – ") || "Dates TBD";
      if (ev) Object.assign(ev, data);
      else
        trace18.events.push({
          id: trace18Id("event"),
          ...data,
          archived: false,
        });
      trace18Save();
      trace18Sync();
    },
  );
  const form = [...document.querySelectorAll(".trace18-shade form")].pop();
  if (form) {
    const start = form.elements.start,
      end = form.elements.end,
      msg = form.querySelector(".trace42-date-error");
    const check = () => {
      end.min = start.value || "";
      const bad = !!(start.value && end.value && end.value < start.value),
        text = bad ? "End date cannot be before the start date." : "";
      msg.textContent = text;
      msg.hidden = !bad;
      end.setCustomValidity(text);
      end.setAttribute("aria-invalid", String(bad));
    };
    start.addEventListener("input", check);
    end.addEventListener("input", check);
    check();
  }
}
function trace18Archive(type, id) {
  const arr = type === "unit" ? trace18.units : trace18.events;
  const item = arr.find((x) => x.id === id);
  if (!item) return;
  const message = `Remove ${item.name} from active ${type === "unit" ? "units" : "training events"}? Historical evaluations will be preserved. You can restore this item from Archived.`;
  if (!confirm(message)) return;
  item.archived = true;
  if (trace18.scope === id) trace18.scope = "all";
  if (trace18.eventScope === id) trace18.eventScope = "all";
  trace18Save();
  trace18Sync();
  render();
}
function trace18Restore(type, id) {
  const item = (type === "unit" ? trace18.units : trace18.events).find(
    (x) => x.id === id,
  );
  if (!item) return;
  item.archived = false;
  trace18Save();
  trace18Sync();
  render();
}
function trace18Delete(type, id) {
  const arr = type === "unit" ? trace18.units : trace18.events;
  const item = arr.find((x) => x.id === id);
  if (!item) return;
  const linked =
    type === "unit"
      ? allRecords().filter((r) => r.unitId === id).length
      : allRecords().filter((r) => r.exerciseId === id).length;
  if (linked) {
    alert(
      "This item has " +
        linked +
        " historical evaluation(s). Archive it instead to preserve attribution.",
    );
    return;
  }
  if (!confirm("Permanently delete " + item.name + "? This cannot be undone."))
    return;
  trace18[type === "unit" ? "units" : "events"] = arr.filter(
    (x) => x.id !== id,
  );
  if (type === "unit")
    trace18.events.forEach(
      (e) => (e.unitIds = e.unitIds.filter((x) => x !== id)),
    );
  trace18Save();
  trace18Sync();
  render();
}
function renderUnitEventManager() {
  const root = $("content");
  const mode = trace18.mode;
  const archived = (mode === "units" ? trace18.units : trace18.events).filter(
    (x) => x.archived,
  );
  root.innerHTML = `<div class="trace18-page"><div class="trace18-top"><div><h2>Units & Events</h2><p>Manage organizations and training events in one place.</p></div><button class="primary" id="t18add">＋ ${mode === "units" ? "Add Unit" : "Create Event"}</button></div><div class="trace18-tabs"><button data-t18mode="units" class="${mode === "units" ? "selected" : ""}">Units <span>${trace18.units.filter((x) => !x.archived).length}</span></button><button data-t18mode="events" class="${mode === "events" ? "selected" : ""}">Training Events <span>${trace18.events.filter((x) => !x.archived).length}</span></button></div><div class="trace18-list">${
    mode === "units"
      ? trace18.units
          .filter((x) => !x.archived)
          .map((u) => {
            const count = trace18.events.filter(
              (e) => !e.archived && e.unitIds.includes(u.id),
            ).length;
            return `<div class="trace18-item"><div class="trace18-symbol">▣</div><div class="trace18-itemcopy"><strong>${esc(u.name)}</strong><small>${esc(u.type || "Unit")} · ${count} assigned event${count === 1 ? "" : "s"}</small></div><button class="secondary" data-t18view="${esc(u.id)}">View Dashboard</button><button class="secondary" data-t18edit="${esc(u.id)}">Edit</button><button class="trace18-iconbtn" title="Archive unit" data-t18archive="${esc(u.id)}">⌫</button></div>`;
          })
          .join("")
      : trace18.events
          .filter((x) => !x.archived)
          .map(
            (e) =>
              `<div class="trace18-item"><div class="trace18-symbol">▤</div><div class="trace18-itemcopy"><strong>${esc(e.name)}</strong><small>${esc(e.dates || "Dates TBD")} · ${e.unitIds.length} unit${e.unitIds.length === 1 ? "" : "s"} assigned</small><div class="trace18-tags">${e.unitIds.map((id) => `<span>${esc(trace18UnitName(id))}</span>`).join("") || "<span>No units assigned</span>"}</div></div><button class="secondary" data-t18edit="${esc(e.id)}">Edit</button><button class="trace18-iconbtn" title="Archive event" data-t18archive="${esc(e.id)}">⌫</button></div>`,
          )
          .join("") ||
        '<div class="trace18-empty">No training events yet. Create one to get started.</div>'
  }${mode === "units" && !trace18.units.some((x) => !x.archived) ? '<div class="trace18-empty">No active units. Add your first unit.</div>' : ""}</div>${archived.length ? `<details class="trace18-archived"><summary>Archived (${archived.length})</summary>${archived.map((x) => `<div class="trace18-archiveitem"><span>${esc(x.name)}</span><button class="secondary" data-t18restore="${esc(x.id)}">Restore</button><button class="danger" data-t18delete="${esc(x.id)}">Delete permanently</button></div>`).join("")}</details>` : ""}<p class="trace18-footnote">Archive removes an item from active lists without erasing its evaluation history. Permanently deleting an item with saved evaluations is blocked.</p></div>`;
  root.querySelectorAll("[data-t18mode]").forEach(
    (b) =>
      (b.onclick = () => {
        trace18.mode = b.dataset.t18mode;
        render();
      }),
  );
  $("t18add").onclick = () =>
    mode === "units" ? trace18EditUnit() : trace18EditEvent();
  root
    .querySelectorAll("[data-t18edit]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          mode === "units"
            ? trace18EditUnit(b.dataset.t18edit)
            : trace18EditEvent(b.dataset.t18edit)),
    );
  root
    .querySelectorAll("[data-t18archive]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          trace18Archive(
            mode === "units" ? "unit" : "event",
            b.dataset.t18archive,
          )),
    );
  root
    .querySelectorAll("[data-t18restore]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          trace18Restore(
            mode === "units" ? "unit" : "event",
            b.dataset.t18restore,
          )),
    );
  root
    .querySelectorAll("[data-t18delete]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          trace18Delete(
            mode === "units" ? "unit" : "event",
            b.dataset.t18delete,
          )),
    );
  root.querySelectorAll("[data-t18view]").forEach(
    (b) =>
      (b.onclick = () => {
        trace18.scope = b.dataset.t18view;
        trace18.eventScope = "all";
        state.unitId = trace18.scope;
        trace18Save();
        nav("dashboard");
      }),
  );
}
function trace18DashboardCoverage() {
  // An event has no task coverage until units are explicitly assigned to it.
  const selectedEvent =
    trace18.eventScope === "all"
      ? null
      : trace18.events.find((e) => e.id === trace18.eventScope && !e.archived);
  if (trace18.eventScope !== "all" && !selectedEvent) return [];
  const active = units.filter(
    (u) =>
      (trace18.scope === "all" || u.id === trace18.scope) &&
      (!selectedEvent || selectedEvent.unitIds.includes(u.id)),
  );
  return active.flatMap((u) =>
    tasks.map((task) => ({
      task,
      record: records
        .filter(
          (r) =>
            r.unitId === u.id &&
            r.taskId === task.id &&
            (trace18.eventScope === "all" ||
              r.exerciseId === trace18.eventScope),
        )
        .sort(
          (a, b) =>
            (b.date || "").localeCompare(a.date || "") ||
            (b.savedAt || "").localeCompare(a.savedAt || ""),
        )[0],
    })),
  );
}
function traceDashboardControls() {
  const root = $("content");
  if (!root) return;
  const events = trace18EventsForUnit(trace18.scope);
  if (!events.some((e) => e.id === trace18.eventScope))
    trace18.eventScope = "all";
  const title = root.querySelector(".dash-title");
  if (!title) return;
  const bar = document.createElement("div");
  bar.className = "trace18-compact-filters";
  bar.innerHTML = `<label>UNIT<select id="t18unit"><option value="all">All Units</option>${trace18SafeOptions(units, trace18.scope)}</select></label><label>TRAINING EVENT<select id="t18event"><option value="all">All Events</option>${trace18SafeOptions(events, trace18.eventScope)}</select></label><button class="secondary" id="t18manage" title="Manage units and training events">Manage ↗</button>`;
  title.insertAdjacentElement("afterend", bar);
  bar.querySelector("#t18unit").value = trace18.scope;
  bar.querySelector("#t18event").value = trace18.eventScope;
  bar.querySelector("#t18unit").onchange = (e) => {
    trace18.scope = e.target.value;
    trace18.eventScope = "all";
    if (trace18.scope !== "all") state.unitId = trace18.scope;
    trace18Save();
    render();
  };
  bar.querySelector("#t18event").onchange = (e) => {
    trace18.eventScope = e.target.value;
    trace18Save();
    render();
  };
  bar.querySelector("#t18manage").onclick = () => nav("units-events");
  $("heading").textContent = "Readiness Dashboard";
}
function traceEvaluationControls() {
  const unit = $("unit"),
    ev = $("exercise");
  if (!unit || !ev) return;
  const chosen =
    trace18.scope !== "all" && units.some((u) => u.id === trace18.scope)
      ? trace18.scope
      : state.unitId;
  if (chosen && units.some((u) => u.id === chosen)) {
    unit.value = chosen;
    state.unitId = chosen;
  }
  function filter() {
    const selectedUnit = unit.value;
    const eligible = trace18EventsForUnit(selectedUnit);
    const old = ev.value;
    ev.innerHTML = eligible
      .map(
        (x) =>
          `<option value="${esc(x.id)}">${esc(x.name)} · ${esc(x.dates || "Dates TBD")}</option>`,
      )
      .join("");
    if (eligible.some((x) => x.id === old)) ev.value = old;
    else if (eligible.length) ev.value = eligible[0].id;
    state.exerciseId = ev.value || "";
    if (state.tab === "evaluate") {
      traceRestoreEvaluation();
      const task = tasks.find((t) => t.id === state.taskId);
      if (task) {
        document.querySelectorAll("[data-step-index]").forEach((row, i) => {
          const x = state.measures[i] || {};
          row.querySelectorAll("[data-measure]").forEach((b) => {
            b.className =
              "choice" +
              (b.dataset.rating === x.rating
                ? " chosen " +
                  (x.rating === "GO"
                    ? "good"
                    : x.rating === "NO-GO"
                      ? "bad"
                      : "neutral")
                : "");
          });
          const note = row.querySelector("[data-note]");
          if (note) note.value = x.note || "";
        });
        progress();
        updatePreview();
      }
    }
    if (!eligible.length)
      ev.innerHTML =
        '<option value="">No events assigned — use Units & Events</option>';
  }
  unit.addEventListener("change", filter);
  filter();
}
// TRACE v18 — per-unit, per-event T&EO assignment management.
// Assignments are keyed to the pair (training event, unit), never globally to a unit.
function traceTaskAssignments(ev, uid) {
  return (ev?.teoAssignments && ev.teoAssignments[uid]) || [];
}
function traceTaskIsAssigned(ev, uid, tid) {
  return traceTaskAssignments(ev, uid).includes(tid);
}
function traceAssignmentEditor(eventId, unitId) {
  const ev = trace18.events.find((x) => x.id === eventId && !x.archived),
    u = trace18.units.find((x) => x.id === unitId && !x.archived);
  if (!ev || !u || !ev.unitIds.includes(unitId)) {
    alert("Assign the unit to the training event before selecting its T&EOs.");
    return;
  }
  const selected = new Set(traceTaskAssignments(ev, unitId));
  trace18Modal(
    "Assign T&EOs — " + u.name,
    `<p class="hint"><strong>${esc(ev.name)}</strong> · Select only the collective tasks this unit is scheduled to train and be evaluated on. Assignments for other units and events will not change.</p><label>Find T&EO<input id="t18teoSearch" type="search" placeholder="Search task number or title"></label><div class="trace18-checks" id="t18teoChoices" style="max-height:330px;overflow:auto;display:block">${tasks.map((t) => `<label style="display:flex;align-items:flex-start;gap:10px;padding:9px 4px;border-bottom:1px solid #38424a"><input type="checkbox" name="teoIds" value="${esc(t.id)}" ${selected.has(t.id) ? "checked" : ""}><span><strong>${esc(t.code)}</strong> — ${esc(t.title)}<small style="display:block;opacity:.75">${t.steps.length} performance steps</small></span></label>`).join("")}</div><p class="hint" id="t18teoCount">${selected.size} selected</p>`,
    (f) => {
      const chosen = f.getAll("teoIds").map(String);
      const existing = traceTaskAssignments(ev, unitId);
      const removed = existing.filter((id) => !chosen.includes(id));
      const withHistory = removed.filter((id) =>
        allRecords().some(
          (r) =>
            r.exerciseId === ev.id && r.unitId === unitId && r.taskId === id,
        ),
      );
      if (
        withHistory.length &&
        !confirm(
          "You are removing " +
            withHistory.length +
            " assigned task(s) with historical evaluations. History will be preserved, but these tasks will no longer count toward this event’s planned readiness. Continue?",
        )
      )
        return false;
      if (!ev.teoAssignments) ev.teoAssignments = {};
      ev.teoAssignments[unitId] = chosen;
      trace18Save();
      render();
    },
  );
  const modal = document.querySelector(".trace18-shade:last-of-type");
  if (!modal) return;
  const search = modal.querySelector("#t18teoSearch"),
    list = modal.querySelector("#t18teoChoices"),
    count = modal.querySelector("#t18teoCount");
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    list
      .querySelectorAll("label")
      .forEach(
        (el) =>
          (el.style.display = el.textContent.toLowerCase().includes(q)
            ? "flex"
            : "none"),
      );
  };
  list.onchange = () =>
    (count.textContent =
      list.querySelectorAll("input:checked").length + " selected");
}
const traceOldManager = renderUnitEventManager;
renderUnitEventManager = function () {
  traceOldManager();
  if (trace18.mode !== "events") return;
  const root = $("content");
  root.querySelectorAll(".trace18-item").forEach((row, i) => {
    const ev = trace18.events.filter((e) => !e.archived)[i];
    if (!ev) return;
    const detail = document.createElement("div");
    detail.style.cssText =
      "width:100%;padding:8px 12px 12px 55px;box-sizing:border-box";
    detail.innerHTML = `<div style="font-size:12px;opacity:.8;margin-bottom:7px">UNIT-SPECIFIC T&EO REQUIREMENTS</div>${
      ev.unitIds
        .map((uid) => {
          const unit = trace18.units.find((u) => u.id === uid && !u.archived);
          if (!unit) return "";
          const assigned = traceTaskAssignments(ev, uid);
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:5px 0;padding:8px 10px;border:1px solid #46505a;border-radius:7px"><span>${esc(unit.name)} <small style="opacity:.75">· ${assigned.length} assigned T&EO${assigned.length === 1 ? "" : "s"}</small></span><button class="secondary" data-trace-teo-unit="${esc(uid)}" data-trace-teo-event="${esc(ev.id)}">Assign T&EOs</button></div>`;
        })
        .join("") ||
      "<small>Assign participating units using Edit before selecting T&EOs.</small>"
    }`;
    row.insertAdjacentElement("afterend", detail);
  });
  root
    .querySelectorAll("[data-trace-teo-unit]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          traceAssignmentEditor(
            b.dataset.traceTeoEvent,
            b.dataset.traceTeoUnit,
          )),
    );
};
trace18DashboardCoverage = function () {
  const ev =
    trace18.eventScope === "all"
      ? null
      : trace18.events.find((e) => e.id === trace18.eventScope && !e.archived);
  if (trace18.eventScope !== "all" && !ev) return [];
  const active = units.filter(
    (u) =>
      (trace18.scope === "all" || u.id === trace18.scope) &&
      (!ev || ev.unitIds.includes(u.id)),
  );
  return active.flatMap((u) => {
    // For All Events, show the union of this unit's explicitly assigned tasks across its events.
    const ids = new Set(
      ev
        ? traceTaskAssignments(ev, u.id)
        : trace18.events
            .filter((e) => !e.archived && e.unitIds.includes(u.id))
            .flatMap((e) => traceTaskAssignments(e, u.id)),
    );
    return tasks
      .filter((t) => ids.has(t.id))
      .map((task) => ({
        task,
        unitId: u.id,
        record: records
          .filter(
            (r) =>
              r.unitId === u.id &&
              r.taskId === task.id &&
              (ev
                ? r.exerciseId === ev.id
                : trace18.events.some(
                    (e) =>
                      !e.archived &&
                      e.unitIds.includes(u.id) &&
                      traceTaskIsAssigned(e, u.id, task.id) &&
                      e.id === r.exerciseId,
                  )),
          )
          .sort(
            (a, b) =>
              (b.date || "").localeCompare(a.date || "") ||
              (b.savedAt || "").localeCompare(a.savedAt || ""),
          )[0],
      }));
  });
};
const traceOldDashboard = renderDashboard;
renderDashboard = function () {
  const entries = trace18DashboardCoverage();
  traceOldDashboard();
  if (entries.length) return;
  const root = $("content");
  const selected = trace18.events.find((e) => e.id === trace18.eventScope);
  const participating = selected
    ? selected.unitIds.filter(
        (id) => trace18.scope === "all" || id === trace18.scope,
      )
    : [];
  if (root.querySelector("#trace18AssignUnits") && participating.length) {
    root.querySelector("h3").textContent = "No T&EOs assigned";
    root.querySelector(".explainer").textContent =
      "Participating units are assigned, but no T&EO requirements have been selected for this training event. Open Units & Events to assign specific T&EOs to each unit.";
    root.querySelector("#trace18AssignUnits").textContent = "Assign T&EOs ↗";
    return;
  }
  if (!root.querySelector("#trace18AssignUnits")) {
    root.innerHTML = `<div class="dash-shell"><div class="dash-title"><div><h2>Commander Readiness Dashboard</h2><p>Training assessment coverage and performance measures</p></div></div><section class="dash-panel" style="padding:36px 24px;text-align:center"><h3>No assigned T&EO requirements</h3><p class="explainer">Assign units to training events, then select their collective tasks under Units & Events. No unassigned library tasks are counted toward readiness.</p><button class="secondary" id="trace18AssignUnits">Manage Units & Events ↗</button></section></div>`;
    root.querySelector("#trace18AssignUnits").onclick = () => {
      trace18.mode = "events";
      nav("units-events");
    };
  }
};
const traceOldEvaluate = renderEvaluate;
renderEvaluate = function () {
  // Resolve the selected task before generating the performance-measure rows.
  // Otherwise the dropdown can display one T&EO while the rows still belong to another.
  const selectedEvent = trace18.events.find((e) => e.id === state.exerciseId);
  const assigned =
    selectedEvent && selectedEvent.unitIds.includes(state.unitId)
      ? traceTaskAssignments(selectedEvent, state.unitId)
      : [];
  const valid = assigned.filter((id) => tasks.some((t) => t.id === id));
  if (valid.length && !valid.includes(state.taskId)) {
    state.taskId = valid[0];
    traceRestoreEvaluation();
  }
  traceOldEvaluate();
  const unit = $("unit"),
    event = $("exercise"),
    task = $("task");
  if (!unit || !event || !task) return;
  const ev = trace18.events.find((e) => e.id === event.value),
    eligible = new Set(
      ev && ev.unitIds.includes(unit.value)
        ? traceTaskAssignments(ev, unit.value)
        : [],
    );
  const current = task.value;
  task.innerHTML = tasks
    .filter((t) => eligible.has(t.id))
    .map(
      (t) =>
        `<option value="${esc(t.id)}">${esc(t.code)} · ${esc(t.title)}</option>`,
    )
    .join("");
  const panel = task.closest(".panel");
  const info = document.createElement("p");
  info.className = "hint";
  info.style.margin = "8px 0";
  if (!eligible.size) {
    info.textContent =
      "No T&EOs assigned to this unit for this event. Assign them in Units & Events before evaluating.";
    if ($("save")) $("save").disabled = true;
    task.disabled = true;
    panel
      .querySelectorAll("[data-measure], [data-note]")
      .forEach((el) => (el.disabled = true));
  } else if (!eligible.has(current)) {
    info.textContent = "Select an assigned T&EO to begin.";
    if ($("save")) $("save").disabled = true;
    task.value = "";
    panel
      .querySelectorAll("[data-measure], [data-note]")
      .forEach((el) => (el.disabled = true));
  } else {
    task.value = current;
    info.textContent = `${eligible.size} T&EO${eligible.size === 1 ? "" : "s"} assigned to this unit for this training event.`;
  }
  task.parentElement.append(info);
  // The original handler persists through option replacement and redraws all measures.
  // Keep the selected option synchronized with the task used for rendering.
  if (eligible.has(state.taskId)) task.value = state.taskId;
};
const traceOldSave = save;
save = function () {
  const ev = trace18.events.find((e) => e.id === state.exerciseId);
  if (
    !ev ||
    !ev.unitIds.includes(state.unitId) ||
    !traceTaskIsAssigned(ev, state.unitId, state.taskId)
  ) {
    const feedback = $("feedback");
    if (feedback)
      feedback.textContent =
        "This T&EO is not assigned to this unit at the selected training event. Assign it under Units & Events first.";
    return;
  }
  traceOldSave();
};
trace18Sync();
