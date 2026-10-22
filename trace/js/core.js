const units = [
    {
      id: "u1",
      name: "Demonstration Unit",
      type: "BSB",
      component: "Not specified",
    },
  ],
  exercises = [
    { id: "e1", name: "CRX 27-04", dates: "15–19 June 2027" },
    { id: "e2", name: "CTE 27-02", dates: "3–7 May 2027" },
    { id: "e3", name: "MOBEX 27-01", dates: "9–13 August 2027" },
  ],
  tasks = TRACE_BUILTIN_TEOS,
  demoHistory = [];
const KEY = "trace_bsb_standalone_v1";
// Tells the shared-mode sync layer (js/shared/sync.js) that a stored data set changed.
// In local-only mode TraceSync is absent and this does nothing.
function traceSyncNotify(key) {
  window.TraceSync?.notify(key);
}
// Whether the signed-in OC/T may change or delete a saved evaluation.
// Shared mode: only its author or a TRACE admin. Local mode: any non-demo record.
function traceCanEdit(r) {
  if (!r || r.demo) return false;
  const sync = window.TraceSync;
  return !sync?.shared || !r.createdBy || r.createdBy === sync.userId || sync.isAdmin;
}
// The "A" from the TRACE wordmark, used as the app's single icon.
const TRACE_MARK =
  '<svg class="trace-a-mark" viewBox="0 0 24 20" aria-hidden="true" focusable="false"><path d="M12 1 23 19h-4.6L12 8.3 5.6 19H1z"/><path d="M12 12.6 15 19H9z"/></svg>';
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const label = (arr, id) => {
  const x =
    arr.find((x) => x.id === id) ||
    (typeof trace18 !== "undefined"
      ? (arr === units
          ? trace18.units
          : arr === exercises
            ? trace18.events
            : []
        ).find((x) => x.id === id)
      : null);
  return x?.name || x?.title || id;
};
const TRACE_AAR_FIELDS = [
  "objective",
  "actual",
  "cause",
  "sustain",
  "corrective",
  "actionOwner",
  "actionDue",
  "location",
];
let records = [];
try {
  const x = JSON.parse(localStorage.getItem(KEY) || "[]");
  if (Array.isArray(x)) records = x;
} catch (e) {}
let state = {
  findings: [],
  editingId: "",
  tab: "dashboard",
  unitId: "u1",
  exerciseId: "e1",
  taskId: "63-BDE-4912",
  evaluator: "",
  date: new Date().toLocaleDateString("en-CA"),
  rating: "",
  observations: "",
  measures: {},
  filterUnit: "all",
  selectedId: "",
  location: "",
  objective: "",
  actual: "",
  cause: "",
  sustain: "",
  corrective: "",
  actionOwner: "",
  actionDue: "",
  dirty: false,
};
function options(items, key = "name") {
  return items
    .map((x) => `<option value="${esc(x.id)}">${esc(x[key])}</option>`)
    .join("");
}
function nav(tab) {
  if (
    tab === "evaluate" &&
    state.tab !== "evaluate" &&
    !state.editingId &&
    !state.dirty
  )
    traceRestoreEvaluation();
  state.tab = tab;
  document
    .querySelectorAll("[data-nav]")
    .forEach((b) => b.classList.toggle("active", b.dataset.nav === tab));
  $("heading").textContent = {
    dashboard: "Readiness Dashboard",
    evaluate: "OC/T Field Evaluation",
    history: "Unit Evaluation History",
    standards: "Training Standards Library",
    aar: "After Action Review",
    workspace: "OC/T Workspace",
    "units-events": "Units & Events",
  }[tab];
  render();
}
function saveLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
    traceSyncNotify(KEY);
    return true;
  } catch (e) {
    alert(
      "Your browser could not save locally. Please check browser privacy settings.",
    );
    return false;
  }
}
function traceSavedMeasures(
  taskId = state.taskId,
  unitId = state.unitId,
  exerciseId = state.exerciseId,
) {
  const rows = observationsFor(taskId, exerciseId, unitId),
    out = {};
  rows
    .slice()
    .reverse()
    .forEach((r) =>
      (r.measures || []).forEach((m, i) => {
        if (m && m.rating) out[i] = { rating: m.rating, note: m.note || "" };
      }),
    );
  return out;
}
function traceRestoreEvaluation() {
  const previous = observationsFor(
    state.taskId,
    state.exerciseId,
    state.unitId,
  );
  // Step ratings merge every OC/T's observations. Name, notes, and AAR inputs come from
  // the latest record by this OC/T (in local mode, the latest record on this browser).
  const sync = window.TraceSync;
  const latest = sync?.shared
    ? previous.find((r) => !r.createdBy || r.createdBy === sync.userId)
    : previous[0];
  state.measures = traceSavedMeasures();
  state.editingId = "";
  state.findings = [];
  state.rating = "";
  state.observations = "";
  state.dirty = false;
  TRACE_AAR_FIELDS.forEach((k) => (state[k] = latest?.aarInputs?.[k] || ""));
  if (latest) {
    state.evaluator = latest.evaluator || state.evaluator;
    state.observations = latest.observations || "";
  }
}
function measureHTML(m, i) {
  const x = state.measures[i] || {};
  const prior = statusFor(state.taskId, i),
    assigned = assignmentFor(state.taskId, i);
  return `<div class="measure" data-step-index="${i}"><div class="measure-title"><span class="num">${i + 1}</span><strong>${esc(m)}</strong><small style="display:block;color:#637785;margin:6px 0">${esc(tasks.find((t) => t.id === state.taskId)?.steps[i]?.stage || "")} · Step ${i + 1}${tasks.find((t) => t.id === state.taskId)?.steps[i]?.critical ? " · CRITICAL" : ""}${tasks.find((t) => t.id === state.taskId)?.steps[i]?.leader ? " · LEADER" : ""}</small><details><summary style="font-size:12px;cursor:pointer">View supporting substeps and source page</summary><ol style="font-size:12px">${(tasks.find((t) => t.id === state.taskId)?.steps[i]?.details || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ol><small>Source page ${tasks.find((t) => t.id === state.taskId)?.steps[i]?.page}</small></details></div><div class="coord-context">${prior.rating ? `Previously: <strong style="color:${statusTint(prior.rating)}">${statusLabel(prior.rating)}</strong> · ${esc(prior.evaluator)} · ${esc(prior.date)}` : "No prior observation for this exercise"}${assigned ? ` · <strong>Observer Assigned: ${esc(assigned.observer)}</strong>` : ""}${prior.conflict ? " · Conflicting previous observations" : ""}</div><div class="trace-eval-claim"><span>${assigned ? "Claimed by " + esc(assigned.observer) : "Available for observation"}</span><button type="button" class="secondary" data-eval-claim="${i}">${assigned ? "Manage Claim" : "Claim Observation"}</button></div><div class="rating-row">${[
    ["GO", "GO"],
    ["NO-GO", "NO-GO"],
    ["N/O", "Not Observed"],
    ["N/A", "Not Applicable"],
  ]
    .map(
      ([v, t]) =>
        `<button type="button" class="choice ${x.rating === v ? "chosen " + (v === "GO" ? "good" : v === "NO-GO" ? "bad" : "neutral") : ""}" data-measure="${i}" data-rating="${v}">${t}</button>`,
    )
    .join(
      "",
    )}</div><textarea data-note="${i}" aria-label="Evidence for measure ${i + 1}" placeholder="Observation / evidence supporting this measure...">${esc(x.note || "")}</textarea></div>`;
}
function calcRating(t, values, context = {}) {
  const rows = t.steps.map((st, i) => ({
    step: st,
    rating: values?.[i]?.rating || "",
    note: values?.[i]?.note || "",
  }));
  const relevant = rows.filter(
    (x) => x.rating === "GO" || x.rating === "NO-GO",
  );
  const missing = rows.filter((x) => !x.rating || x.rating === "N/O"),
    excluded = rows.filter((x) => x.rating === "N/A").length;
  const critical = relevant.filter((x) => x.step.critical),
    leaders = relevant.filter((x) => x.step.leader);
  const pct = (arr) =>
    arr.length
      ? Math.round(
          (100 * arr.filter((x) => x.rating === "GO").length) / arr.length,
        )
      : null;
  const allPct = pct(relevant),
    criticalPct = pct(critical),
    leaderPct = pct(leaders);
  const allCritical = rows
    .filter((x) => x.step.critical && x.rating !== "N/A")
    .every((x) => x.rating === "GO");
  const complete = missing.length === 0;
  let band = "Insufficient evidence";
  if (complete && relevant.length) {
    const cp = criticalPct ?? 100,
      lp = leaderPct ?? 100;
    if (allPct >= 80 && allCritical && lp >= 85)
      band = "T-level performance measures met";
    else if (cp >= 65 && lp >= 75) band = "P-level performance measures met";
    else band = "U-level performance measures indicated";
  }
  return {
    total: rows.length,
    completed: relevant.length,
    missing: missing.length,
    excluded,
    allPct,
    criticalPct,
    leaderPct,
    allCritical,
    band,
    complete,
  };
}
function colorFor(p) {
  return p === 100
    ? "#2f8056"
    : p >= 67
      ? "#c28a28"
      : p >= 34
        ? "#d5a13e"
        : "#bd514b";
}
function barHTML(percent) {
  return `<div class="progress-track"><div class="progress-fill" style="width:${percent}%;background:${colorFor(percent)}"></div></div>`;
}
function coverage(t, r) {
  const observed = t.steps.map((st, i) => ({
    st,
    i,
    mark: r?.measures?.[i]?.rating || "",
    note: r?.measures?.[i]?.note || "",
  }));
  const applicable = observed.filter((x) => x.mark !== "N/A");
  const done = applicable.filter(
    (x) => x.mark === "GO" || x.mark === "NO-GO",
  ).length;
  return {
    observed,
    applicable,
    done,
    total: applicable.length,
    excluded: observed.filter((x) => x.mark === "N/A").length,
    remaining: applicable.filter((x) => x.mark !== "GO" && x.mark !== "NO-GO"),
  };
}
function trace29Predictor(entry) {
  const relevant = records.filter(
    (r) =>
      r.unitId === (entry.unitId || state.unitId) &&
      r.taskId === entry.task.id &&
      (trace18.eventScope === "all" || r.exerciseId === trace18.eventScope) &&
      ["T", "P", "U"].includes(r.rating),
  );
  const byObserver = new Map();
  relevant.sort((a, b) =>
    (b.savedAt || b.date || "").localeCompare(a.savedAt || a.date || ""),
  );
  relevant.forEach((r) => {
    const key = (r.evaluator || r.id || "").trim().toLowerCase();
    if (!byObserver.has(key)) byObserver.set(key, r);
  });
  const vals = [...byObserver.values()].map(
    (r) => ({ T: 3, P: 2, U: 1 })[r.rating],
  );
  if (!vals.length) return { label: "—", count: 0, avg: null };
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return {
    label: avg >= 2.5 ? "T" : avg >= 1.5 ? "P" : "U",
    count: vals.length,
    avg,
  };
}

function jumpToStep(taskId, i, unitId, recordId) {
  if (
    state.dirty &&
    !confirm("Discard unsaved evaluation changes and open this step?")
  )
    return;
  if (unitId) state.unitId = unitId;
  state.taskId = taskId;
  const r = recordId ? records.find((x) => x.id === recordId) : null;
  if (r) state.exerciseId = r.exerciseId;
  else {
    const ev = trace18.events.find(
      (e) =>
        !e.archived &&
        (trace18.eventScope === "all" || e.id === trace18.eventScope) &&
        e.unitIds.includes(state.unitId) &&
        traceTaskIsAssigned(e, state.unitId, taskId),
    );
    if (ev) state.exerciseId = ev.id;
  }
  traceRestoreEvaluation();
  // Another OC/T's record opens as the shared view of the task, not as an edit of their record.
  if (r && traceCanEdit(r)) {
    state.measures = {};
    (r.measures || []).forEach((m, k) => (state.measures[k] = { ...m }));
    state.rating = r.rating === "Pending" ? "" : r.rating || "";
    state.evaluator = r.evaluator || "";
    state.observations = r.observations || "";
    state.findings = (r.findings || []).map((x) => ({ ...x }));
    TRACE_AAR_FIELDS.forEach((k) => (state[k] = r.aarInputs?.[k] || ""));
    state.editingId = r.id;
  }
  nav("evaluate");
  const el = document.querySelector(`[data-step-index="${i}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("trace42-jump");
    setTimeout(() => el.classList.remove("trace42-jump"), 2200);
  }
}
function renderDashboard() {
  const entries = trace18DashboardCoverage();
  if (trace18.eventScope !== "all" && !entries.length) {
    const selected = trace18.events.find((e) => e.id === trace18.eventScope);
    $("content").innerHTML =
      `<div class="dash-shell"><div class="dash-title"><div><h2>Commander Readiness Dashboard</h2><p>Training assessment coverage and performance measures</p></div></div><section class="dash-panel" style="padding:36px 24px;text-align:center"><h3>No participating units assigned</h3><p class="explainer">${esc(selected?.name || "This training event")} has no units in the current unit selection. Assign participating units under Units & Events to display task coverage for this event.</p><button class="secondary" id="trace18AssignUnits">Manage Training Event ↗</button></section></div>`;
    $("trace18AssignUnits").onclick = () => {
      trace18.mode = "events";
      nav("units-events");
    };
    return;
  }
  const total = entries.reduce(
    (a, x) => a + coverage(x.task, x.record).total,
    0,
  );
  const done = entries.reduce((a, x) => a + coverage(x.task, x.record).done, 0);
  const pct = total ? Math.round((done * 100) / total) : 0;
  const multiUnit = new Set(entries.map((e) => e.unitId)).size > 1,
    keyOf = (e) => (e.unitId || "") + "|" + e.task.id,
    unitTag = (e) => (multiUnit && e.unitId ? trace18UnitName(e.unitId) : "");
  const predictors = entries.map((e) => trace29Predictor(e));
  const rows = entries.flatMap((e) =>
    coverage(e.task, e.record).observed.map((x) => ({
      ...x,
      task: e.task,
      record: e.record,
      unitId: e.unitId,
      key: keyOf(e),
      unit: unitTag(e),
    })),
  );
  const jumpAttrs = (x) =>
    `data-jump-task="${esc(x.task.id)}" data-jump-index="${x.i}" data-jump-unit="${esc(x.unitId || "")}" data-jump-record="${esc(x.record?.id || "")}"`;
  const count = (arr) => ({
    total: arr.filter((x) => x.mark !== "N/A").length,
    done: arr.filter((x) => x.mark === "GO" || x.mark === "NO-GO").length,
  });
  const critical = count(rows.filter((x) => x.st.critical)),
    leader = count(rows.filter((x) => x.st.leader));
  const pof = (c) => (c.total ? Math.round((c.done * 100) / c.total) : 0);
  const stat = (title, c, id, sub) =>
    `<button class="kpi-card" data-detail="${id}" title="Inspect outstanding performance steps"><div class="kpi-label">${title}<span class="kpi-arrow">↗</span></div><div class="kpi-inner"><div class="donut" style="--percent:${pof(c)};--tone:${colorFor(pof(c))}"><span>${pof(c)}%</span></div><div class="kpi-copy"><strong>${c.done} <em>/ ${c.total}</em></strong><small>${sub}</small><span>${c.total - c.done} remaining →</span></div></div></button>`;
  const taskCards = entries
    .map((entry, idx) => {
      const { task, record } = entry,
        pr = predictors[idx];
      const c = coverage(task, record),
        p = pof(c),
        crit = count(c.observed.filter((x) => x.st.critical)),
        lead = count(c.observed.filter((x) => x.st.leader));
      return `<button class="task-tile" data-detail="${esc(keyOf(entry))}"><div class="task-top"><span class="task-icon">${TRACE_MARK}</span><div><b>${esc(task.code)}</b><small>${esc(task.title)}</small>${unitTag(entry) ? `<small class="trace42-unit">${esc(unitTag(entry))}</small>` : ""}</div><span class="task-chevron">›</span></div><div class="task-progress">${barHTML(p)}<strong style="color:${colorFor(p)}">${p}%</strong><span>${c.done}/${c.total}</span></div><div class="task-meta"><span>Critical: ${crit.done}/${crit.total}</span><span>Leader: ${lead.done}/${lead.total}</span><span>${c.remaining.length} remaining</span></div><div class="trace29-predictor trace29-predictor-${["T", "P", "U"].includes(pr.label) ? pr.label.toLowerCase() : "none"}">Readiness Predictor: <strong>${pr.label}</strong><small>${pr.count ? `Average of ${pr.count} OC/T projected rating(s)` : "No OC/T projected ratings"}</small></div>${c.excluded ? `<div class="trace29-na">${c.excluded} N/A excluded · View details ↗</div>` : ""}</button>`;
    })
    .join("");
  const breakdown = entries
    .map((entry) => {
      const { task, record } = entry;
      const c = coverage(task, record),
        go = c.observed.filter((x) => x.mark === "GO").length,
        bad = c.observed.filter((x) => x.mark === "NO-GO").length,
        not = c.observed.filter((x) => x.mark === "N/O").length,
        na = c.excluded,
        blank = c.observed.length - go - bad - not - na,
        p = pof(c);
      return `<button class="breakdown-row" data-detail="${esc(keyOf(entry))}"><span class="breakdown-code" title="${esc(unitTag(entry))}">${esc(task.code)}${unitTag(entry) ? `<small class="trace42-unit">${esc(unitTag(entry))}</small>` : ""}</span><div class="stack-track"><span style="width:${c.observed.length ? (go / c.observed.length) * 100 : 0}%;background:#55bd7a"></span><span style="width:${c.observed.length ? (bad / c.observed.length) * 100 : 0}%;background:#d55b52"></span><span style="width:${c.observed.length ? (not / c.observed.length) * 100 : 0}%;background:#79818b"></span><span style="width:${c.observed.length ? (blank / c.observed.length) * 100 : 0}%;background:#30373e"></span></div><strong>${p}%</strong><span class="arrow">›</span></button>`;
    })
    .join("");
  const pending = rows.filter(
    (x) => x.mark !== "GO" && x.mark !== "NO-GO" && x.mark !== "N/A",
  );
  window.traceDashboardPending = pending;
  $("content").innerHTML =
    `<div class="dash-shell"><div class="dash-title"><div><h2>Evaluation Dashboard</h2><p>Performance-step coverage · ${esc(trace18.scope === "all" ? "All Units" : trace18UnitName(trace18.scope))} · ${tasks.length} reference T&EOs</p></div><button class="secondary" id="viewAllPending">View outstanding steps ↗</button></div>
 <div class="kpi-grid">${stat("OVERALL TASK COVERAGE", { done, total }, "all", "Performance steps observed")}${stat("CRITICAL STEP COVERAGE", critical, "critical", "Critical steps observed")}${stat("LEADER STEP COVERAGE", leader, "leader", "Leader steps observed")}<div class="kpi-card coverage-overview"><div class="kpi-label">COVERAGE BY T&EO</div>${entries
   .map((entry) => {
     const { task, record } = entry,
       c = coverage(task, record),
       p = pof(c);
     return `<button class="mini-coverage" data-detail="${esc(keyOf(entry))}" title="${esc(unitTag(entry))}"><span>${esc(task.code)}${unitTag(entry) ? " · " + esc(unitTag(entry)) : ""}</span><span class="mini-track">${barHTML(p)}</span><strong>${p}%</strong><span>›</span></button>`;
   })
   .join("")}</div></div>
 <div class="task-grid">${taskCards}</div>
 <div class="analytics-grid"><section class="dash-panel"><div class="panel-title"><h3>TASK COMPLETION BY T&EO</h3><small>Click a row for outstanding steps</small></div><div class="legend"><span><i style="background:#55bd7a"></i> GO</span><span><i style="background:#d55b52"></i> NO-GO</span><span><i style="background:#79818b"></i> Not Observed</span><span><i style="background:#30373e"></i> Blank</span><span><i style="background:#9da7b0"></i> N/A (excluded)</span></div>${breakdown}</section><section class="dash-panel"><div class="panel-title"><h3>REMAINING STEPS (${pending.length})</h3><button class="text-link" id="allPending">View all ↗</button></div><div class="pending-table"><div class="pending-head"><span>T&EO</span><span>STEP</span><span>PERFORMANCE MEASURE</span><span>STATUS</span></div>${
   pending
     .slice(0, 6)
     .map(
       (x) =>
         `<button class="pending-row" ${jumpAttrs(x)}><span>${esc(x.task.code)}${x.unit ? `<small class="trace42-unit">${esc(x.unit)}</small>` : ""}</span><span>${esc(x.st.number)}</span><span title="${esc(x.st.text)}">${esc(x.st.text)}</span><span class="pending-status">${x.mark === "N/O" ? "NOT OBSERVED" : "NOT EVALUATED"} ›</span></button>`,
     )
     .join("") ||
   '<div class="empty">All performance steps have been observed.</div>'
 }</div></section></div>
 <section class="dash-panel" style="padding:15px 18px"><div class="panel-title"><h3>NOT APPLICABLE EXCLUSIONS (${rows.filter((x) => x.mark === "N/A").length})</h3><small>Excluded from coverage; retained for commander review</small></div>${
   rows
     .filter((x) => x.mark === "N/A")
     .map(
       (x) =>
         `<div style="border-top:1px solid #344049;padding:9px 0;font-size:12px"><strong>${esc(x.task.code)} · Step ${esc(x.st.number)}${x.st.critical ? " · CRITICAL" : ""}${x.st.leader ? " · LEADER" : ""}</strong><div>${esc(x.st.text)}</div><small>OC/T justification: ${esc(x.note || "Not provided")}</small></div>`,
     )
     .join("") || '<p class="explainer">No N/A exclusions recorded.</p>'
 }</section><div class="bottom-grid"><section class="dash-panel"><div class="panel-title"><h3>HOW COVERAGE IS CALCULATED</h3></div><p class="explainer">GO and NO-GO count as observed. <strong>Not Applicable is excluded from the denominator; Not Observed and blank remain outstanding.</strong> Completion measures documentation coverage, not proficiency or official readiness. Data comes from the latest saved local evaluation for each T&EO.</p></section><section class="dash-panel"><div class="panel-title"><h3>QUICK ACTIONS</h3></div><div class="quick-actions"><button class="secondary" data-action="evaluate">${TRACE_MARK}<span>Start / Continue Evaluation</span></button><button class="secondary" id="quickRemaining">${TRACE_MARK}<span>Outstanding Steps</span></button><button class="secondary" data-action="aar">${TRACE_MARK}<span>Generate AAR</span></button><button class="secondary" data-action="history">${TRACE_MARK}<span>Unit History</span></button></div></section></div>
 <section id="coverageDetails" class="dash-panel details-panel" tabindex="-1"><div class="panel-title"><h3>OUTSTANDING STEP DETAILS</h3><small>Select a percentage, task card, or chart row to inspect remaining measures</small></div></section></div>`;
  function bindJumps() {
    document
      .querySelectorAll("[data-jump-task]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            jumpToStep(
              b.dataset.jumpTask,
              Number(b.dataset.jumpIndex),
              b.dataset.jumpUnit,
              b.dataset.jumpRecord,
            )),
      );
  }
  function details(id) {
    const selected =
      id === "all"
        ? rows
        : id === "critical"
          ? rows.filter((x) => x.st.critical)
          : id === "leader"
            ? rows.filter((x) => x.st.leader)
            : rows.filter((x) => x.key === id);
    const remaining = selected.filter(
      (x) => x.mark !== "GO" && x.mark !== "NO-GO" && x.mark !== "N/A",
    );
    const name =
      id === "all"
        ? "All performance steps"
        : id === "critical"
          ? "Critical performance steps"
          : id === "leader"
            ? "Leader performance steps"
            : (() => {
                const e = entries.find((x) => keyOf(x) === id);
                return e
                  ? e.task.title + (unitTag(e) ? " · " + unitTag(e) : "")
                  : "Selected task";
              })();
    $("coverageDetails").innerHTML =
      `<div class="panel-title"><h3>${esc(name)} — ${remaining.length} remaining</h3><small>${selected.length - remaining.length}/${selected.length} observed</small></div><p class="explainer">Click any outstanding step to open the evaluation at that measure.</p><div class="remaining-list">${remaining.map((x) => `<button class="remaining-item" ${jumpAttrs(x)}><strong>${x.unit ? esc(x.unit) + " · " : ""}${esc(x.task.code)} · Step ${esc(x.st.number)} ${x.st.critical ? "· CRITICAL" : ""} ${x.st.leader ? "· LEADER" : ""}</strong><span>${esc(x.st.text)}</span><small>${x.mark === "N/O" ? "Not Observed" : "Not evaluated"} · ${esc(x.st.stage)} →</small></button>`).join("") || "<p>All selected performance steps have been observed.</p>"}</div>`;
    bindJumps();
    $("coverageDetails").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  document
    .querySelectorAll("[data-detail]")
    .forEach((b) => (b.onclick = () => details(b.dataset.detail)));
  bindJumps();
  ["viewAllPending", "allPending", "quickRemaining"].forEach(
    (id) => ($(id).onclick = () => details("all")),
  );
  document
    .querySelectorAll("[data-action]")
    .forEach((b) => (b.onclick = () => nav(b.dataset.action)));
}
function updatePreview() {
  const t = tasks.find((x) => x.id === state.taskId),
    v = calcRating(t, state.measures);
  const el = $("ratingPreview");
  if (!el) return;
  el.innerHTML = `<strong>Automated performance-measure analysis (advisory)</strong><p>Documented: ${v.completed}/${v.total} · All GO: ${v.allPct ?? "—"}% · Critical GO: ${v.criticalPct ?? "—"}% · Leader GO: ${v.leaderPct ?? "—"}%</p><p><strong>${esc(v.band)}</strong>${v.missing ? " · " + v.missing + " unassessed/not-observed steps" : ""}${v.excluded ? " · " + v.excluded + " N/A excluded" : ""}</p><small>Matrix criteria also require evaluation context (environment, attendance, external evaluation, etc.). A T rating is never automatically confirmed. N/A requires coordination and does not equal GO. OC/T must verify the source T&EO and recommend a rating.</small>`;
}
function renderEvaluate() {
  const task = tasks.find((t) => t.id === state.taskId) || tasks[0];
  $("content").innerHTML =
    `<div class="panel"><div class="section-head"><h2>New Evaluation</h2><span>OC/T recommendation — not a commander assessment</span></div><div class="form-grid"><label>Evaluated unit<select id="unit">${options(units)}</select></label><label>Training event<select id="exercise">${exercises.map((x) => `<option value="${esc(x.id)}">${esc(x.name)} · ${esc(x.dates)}</option>`).join("")}</select></label><label>Collective training task<select id="task">${tasks.map((t) => `<option value="${esc(t.id)}">${esc(t.code)} · ${esc(t.title)}</option>`).join("")}</select></label><label>Observation date<input id="date" type="date" value="${esc(state.date)}"></label><label>Evaluator / demonstration ID<input id="evaluator" placeholder="e.g., OC/T Alpha" value="${esc(state.evaluator)}"></label></div><div class="task-summary"><strong>${esc(task.title)}</strong><small>${esc(task.code)} · Version ${esc(task.version)} · Reference T&EO — applicability to Demonstration Unit not verified</small><p>Record each top-level performance step, with its supporting substeps. Critical (+) and leader (*) flags are retained. Not Observed is not equivalent to NO-GO. Ratings remain OC/T recommendations; official matrix criteria must be reviewed manually.</p></div><div class="section-head"><h2>Performance Measures</h2><span id="progress">0 / ${task.measures.length} observed</span></div>${task.measures.map(measureHTML).join("")}<div class="alert-info" id="ratingPreview"></div><div class="form-grid lower"><label>OC/T-recommended overall proficiency<select id="rating"><option value="">Select a recommendation</option><option value="T">T — Trained</option><option value="P">P — Practiced</option><option value="U">U — Untrained</option></select></label></div><p class="hint">The automated analysis is advisory and based on entered GO/NO-GO values. The OC/T selects a separate recommended rating after reviewing the full T&EO matrix and evaluation conditions.</p><label class="wide">Overall observations / coaching points<textarea id="observations" rows="5" placeholder="Strengths, deficiencies, coaching provided, recommended follow-up...">${esc(state.observations)}</textarea></label><h3>AAR development inputs</h3><p class="section-sub">These fields enable analysis and recommendations instead of copying comments. Leave unknown facts blank; TRACE will flag gaps.</p><div class="fieldgrid"><label>Training objective<textarea id="objective" placeholder="What was the unit expected to accomplish?"></textarea></label><label>What actually happened<textarea id="actual" placeholder="Chronology / confirmed observed outcome"></textarea></label><label>Cause / discussion (verified or proposed)<textarea id="cause" placeholder="Why did performance differ from standard? Label hypotheses."></textarea></label><label>What to sustain<textarea id="sustain" placeholder="Successful practice and why it worked"></textarea></label><label>Corrective action / retraining<textarea id="corrective" placeholder="Specific change, retraining, or SOP adjustment"></textarea></label><label>Action owner<textarea id="actionOwner" placeholder="Proposed owner, not assumed"></textarea></label><label>Action suspense<input type="date" id="actionDue"></label><label>Observation location<input id="location" placeholder="Fictional exercise location"></label></div><h3>Observation–Discussion–Recommendation (ODR) findings</h3><p class="section-sub">Create multiple findings for the same performance step. Each finding has its own evidence, discussion, recommendation, and proposed corrective action. These are draft OC/T findings, not confirmed root causes.</p><div id="findingList"></div><button type="button" class="secondary" id="addFinding">＋ Add ODR Finding</button><p id="feedback" class="error" role="alert"></p><button class="primary" id="save">＋ Save / Update Draft Evaluation</button><p class="hint">Saved performance measures are restored when you return to the same unit, training event, and task. GO and NO-GO count toward dashboard coverage; Not Observed and Not Applicable do not.</p></div>`;
  ["unit", "exercise", "task", "rating"].forEach(
    (id) =>
      ($(id).value =
        state[
          {
            unit: "unitId",
            exercise: "exerciseId",
            task: "taskId",
            rating: "rating",
          }[id]
        ]),
  );
  const bind = (id, k) =>
    $(id).addEventListener("input", (e) => {
      state[k] = e.target.value;
      state.dirty = true;
    });
  bind("date", "date");
  bind("evaluator", "evaluator");
  bind("rating", "rating");
  bind("observations", "observations");
  [
    "objective",
    "actual",
    "cause",
    "sustain",
    "corrective",
    "actionOwner",
    "actionDue",
    "location",
  ].forEach((k) => {
    if ($(k)) {
      $(k).value = state[k] || "";
      bind(k, k);
    }
  });
  updatePreview();
  $("task").onchange = (e) => {
    state.taskId = e.target.value;
    traceRestoreEvaluation();
    renderEvaluate();
  };
  document.querySelectorAll("[data-measure]").forEach(
    (b) =>
      (b.onclick = () => {
        const i = b.dataset.measure;
        state.measures[i] = {
          ...(state.measures[i] || {}),
          rating: b.dataset.rating,
        };
        state.dirty = true;
        b.parentElement.querySelectorAll("button").forEach((x) => {
          x.className =
            "choice" +
            (x === b
              ? " chosen " +
                (b.dataset.rating === "GO"
                  ? "good"
                  : b.dataset.rating === "NO-GO"
                    ? "bad"
                    : "neutral")
              : "");
        });
        progress();
        updatePreview();
      }),
  );
  document.querySelectorAll("[data-note]").forEach(
    (t) =>
      (t.oninput = (e) => {
        const i = t.dataset.note;
        state.measures[i] = {
          ...(state.measures[i] || {}),
          note: e.target.value,
        };
        state.dirty = true;
      }),
  );
  document.querySelectorAll("[data-eval-claim]").forEach(
    (b) =>
      (b.onclick = () => {
        const i = Number(b.dataset.evalClaim);
        claimStep(state.taskId, i);
        renderEvaluate();
      }),
  );
  $("save").onclick = save;
  $("addFinding").onclick = () => {
    state.findings.push({ step: 0 });
    state.dirty = true;
    renderFindings();
  };
  renderFindings();
  progress();
}
function renderFindings() {
  const host = $("findingList");
  if (!host) return;
  host.innerHTML = (state.findings || [])
    .map(
      (f, j) =>
        `<div class="measure"><div class="section-head"><strong>Finding ${j + 1}</strong><button type="button" class="secondary" data-remove-finding="${j}">Remove</button></div><label>Associated performance step<select data-finding-index="${j}" data-finding-key="step">${(tasks.find((t) => t.id === state.taskId)?.steps || []).map((s, i) => `<option value="${i}" ${Number(f.step) === i ? "selected" : ""}>Step ${esc(s.number)} — ${esc(s.text.slice(0, 90))}</option>`).join("")}</select></label><div class="fieldgrid">${[
          ["observation", "Observation / evidence"],
          [
            "discussion",
            "Discussion / contributing factors (verified or hypothesis)",
          ],
          ["recommendation", "Recommendation"],
          ["action", "Proposed corrective action"],
          ["owner", "Proposed owner"],
          ["suspense", "Suspense / follow-up"],
        ]
          .map(
            ([k, l]) =>
              `<label>${l}<textarea rows="2" data-finding-index="${j}" data-finding-key="${k}">${esc(f[k] || "")}</textarea></label>`,
          )
          .join("")}</div></div>`,
    )
    .join("");
  host.querySelectorAll("[data-finding-key]").forEach(
    (el) =>
      (el.oninput = (e) => {
        state.findings[Number(el.dataset.findingIndex)][el.dataset.findingKey] =
          el.value;
        state.dirty = true;
      }),
  );
  host.querySelectorAll("[data-remove-finding]").forEach(
    (el) =>
      (el.onclick = () => {
        state.findings.splice(Number(el.dataset.removeFinding), 1);
        state.dirty = true;
        renderFindings();
      }),
  );
}
function progress() {
  const t = tasks.find((x) => x.id === state.taskId);
  $("progress").textContent =
    `${Object.values(state.measures).filter((x) => x.rating === "GO" || x.rating === "NO-GO").length} / ${t.measures.length} observed`;
}
function save() {
  const t = tasks.find((x) => x.id === state.taskId);
  const err = (m) => {
    $("feedback").textContent = m;
  };
  if (!state.evaluator.trim())
    return err("Enter an OC/T evaluator name or demonstration identifier.");
  if (!state.date) return err("Choose an observation date.");
  const r = {
    // Another OC/T's evaluation is never overwritten; editing it saves a new record.
    id:
      (traceCanEdit(records.find((x) => x.id === state.editingId)) &&
        state.editingId) ||
      "local-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    unitId: state.unitId,
    exerciseId: state.exerciseId,
    taskId: state.taskId,
    date: state.date,
    savedAt: new Date().toISOString(),
    evaluator: state.evaluator.trim(),
    rating: state.rating || "Pending",
    status: "Draft — OC/T recommendation",
    observations: state.observations.trim(),
    aarInputs: Object.fromEntries(
      TRACE_AAR_FIELDS.map((k) => [k, (state[k] || "").trim()]),
    ),
    analysis: calcRating(t, state.measures),
    measures: t.measures.map((_, i) => ({ ...state.measures[i] })),
    findings: (state.findings || []).map((x) => ({ ...x })),
  };
  const prior = records.slice();
  records = records.filter((x) => x.id !== r.id);
  records.unshift(r);
  if (!saveLocal()) {
    records = prior;
    return;
  }
  state.editingId = "";
  state.selectedId = r.id;
  traceRestoreEvaluation();
  renderEvaluate();
  const f = $("feedback");
  if (f) {
    f.style.color = "#79cfa0";
    f.textContent =
      "Evaluation saved. Ratings remain visible for this unit, event, and collective task.";
  }
}
function allRecords() {
  return [...records, ...demoHistory];
}
function selected() {
  return allRecords().find((r) => r.id === state.selectedId) || allRecords()[0];
}
function renderHistory() {
  const filtered = allRecords()
    .filter((r) => state.filterUnit === "all" || r.unitId === state.filterUnit)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!filtered.some((r) => r.id === state.selectedId))
    state.selectedId = filtered[0]?.id || "";
  const r = filtered.find((x) => x.id === state.selectedId);
  $("content").innerHTML =
    `<div class="panel"><div class="section-head"><h2>Evaluation Records</h2><label class="filter">Unit filter<select id="filter"><option value="all">All units</option>${options(units)}</select></label></div><div class="metrics"><div><strong>${filtered.length}</strong><small>Evaluation records</small></div><div><strong>${new Set(filtered.map((x) => x.unitId)).size}</strong><small>Units represented</small></div><div><strong>${filtered.filter((x) => x.rating === "T").length}</strong><small>OC/T T recommendations</small></div></div><div class="records">${filtered.map((x) => `<button class="record ${x.id === state.selectedId ? "selected" : ""}" data-record="${esc(x.id)}"><div><strong>${esc(label(units, x.unitId))}</strong><small>${esc(label(tasks, x.taskId))} · ${esc(label(exercises, x.exerciseId))}</small></div><div><span class="rating-badge">${esc(x.rating)}</span><small>${esc(x.date)}</small></div></button>`).join("") || '<div class="empty">No evaluations for this unit.</div>'}</div>${r ? `<div class="detail"><h3>Selected evaluation</h3><p><strong>${esc(label(units, r.unitId))}</strong> — ${esc(label(tasks, r.taskId))}</p><p><strong>Evaluator:</strong> ${esc(r.evaluator)} · <strong>Status:</strong> ${esc(r.status)}</p><p><strong>Observations:</strong> ${esc(r.observations || "None recorded")}</p><ol>${(tasks.find((t) => t.id === r.taskId)?.measures || []).map((m, i) => `<li>${esc(m)}: <strong>${esc(r.measures[i]?.rating || "N/O")}</strong> — ${esc(r.measures[i]?.note || "No evidence entered")}</li>`).join("")}</ol><div class="actions"><button class="secondary" id="viewaar">View Event AAR</button><button class="secondary" id="evalaar">Evaluation AAR (Word)</button>${traceCanEdit(r) ? '<button class="danger" id="delete">Delete draft</button>' : ""}</div></div>` : ""}</div>`;
  $("filter").value = state.filterUnit;
  if ($("filter").value !== state.filterUnit) $("filter").value = "all";
  $("filter").onchange = (e) => {
    state.filterUnit = e.target.value;
    renderHistory();
  };
  document.querySelectorAll("[data-record]").forEach(
    (b) =>
      (b.onclick = () => {
        state.selectedId = b.dataset.record;
        renderHistory();
      }),
  );
  if (r) {
    $("viewaar").onclick = () => {
      state.aarEventId = r.exerciseId;
      nav("aar");
    };
    $("evalaar").onclick = () =>
      downloadWord(
        "TRACE_Evaluation_AAR_" +
          String(label(tasks, r.taskId))
            .replace(/[^a-z0-9_-]+/gi, "_")
            .slice(0, 60) +
          ".docx",
        "TRACE — Draft Training AAR",
        aar(r),
      );
    if (traceCanEdit(r))
      $("delete").onclick = () => {
        if (confirm("Delete this draft evaluation?")) {
          const prior = records;
          records = records.filter((x) => x.id !== r.id);
          if (!saveLocal()) records = prior;
          state.selectedId = "";
          renderHistory();
        }
      };
  }
}
const ASSIGN_KEY = "trace_observer_assignments_v07";
let assignments = [];
try {
  assignments = JSON.parse(localStorage.getItem(ASSIGN_KEY) || "[]");
  if (!Array.isArray(assignments)) assignments = [];
} catch (e) {
  assignments = [];
}
function storeAssignments() {
  try {
    localStorage.setItem(ASSIGN_KEY, JSON.stringify(assignments));
    traceSyncNotify(ASSIGN_KEY);
    return true;
  } catch (e) {
    alert("Could not save observer assignments in this browser.");
    return false;
  }
}
function observationsFor(
  taskId,
  exerciseId = state.exerciseId,
  unitId = state.unitId,
) {
  return records
    .filter(
      (r) =>
        r.taskId === taskId &&
        r.exerciseId === exerciseId &&
        r.unitId === unitId,
    )
    .sort((a, b) =>
      (b.savedAt || b.date || "").localeCompare(a.savedAt || a.date || ""),
    );
}
function statusFor(taskId, index) {
  const obs = observationsFor(taskId).filter((r) =>
    ["GO", "NO-GO", "N/O", "N/A"].includes(r.measures?.[index]?.rating),
  );
  const recent = obs[0];
  return {
    rating: recent?.measures[index]?.rating || "",
    evaluator: recent?.evaluator || "",
    date: recent?.date || "",
    count: obs.length,
    conflict: new Set(obs.map((r) => r.measures[index].rating)).size > 1,
  };
}
function assignmentFor(taskId, index) {
  return assignments.find(
    (a) =>
      a.unitId === state.unitId &&
      a.exerciseId === state.exerciseId &&
      a.taskId === taskId &&
      a.index === index,
  );
}
function statusLabel(r) {
  return r === "GO"
    ? "GO"
    : r === "NO-GO"
      ? "NO-GO"
      : r === "N/O"
        ? "Not Observed"
        : r === "N/A"
          ? "Not Applicable"
          : "Not Evaluated";
}
function statusTint(r) {
  return r === "GO"
    ? "#64c98a"
    : r === "NO-GO"
      ? "#f27c72"
      : r === "N/O"
        ? "#b2b7c0"
        : r === "N/A"
          ? "#bca8df"
          : "#77818e";
}
function claimStep(taskId, index) {
  const old = assignmentFor(taskId, index);
  if (old) {
    const who = prompt(
      "Assigned to " +
        old.observer +
        ". Enter that observer name to release this assignment, or Cancel to leave it unchanged:",
    );
    if (who === null) return;
    if (who.trim().toLowerCase() !== old.observer.toLowerCase()) {
      alert("Assignment unchanged. Ask the listed observer to release it.");
      return;
    }
    assignments = assignments.filter((a) => a !== old);
  } else {
    const name = prompt(
      "Observer name / demonstration ID for this assignment:",
      state.evaluator || "",
    );
    if (!name?.trim()) return;
    assignments.push({
      unitId: state.unitId,
      exerciseId: state.exerciseId,
      taskId,
      index,
      observer: name.trim(),
      assignedAt: new Date().toISOString(),
    });
  }
  if (storeAssignments() && state.tab === "standards") renderStandards();
}
function beginObservation(taskId, index) {
  state.taskId = taskId;
  traceRestoreEvaluation();
  state.jumpIndex = index;
  nav("evaluate");
  setTimeout(() => {
    const el = document.querySelector('[data-step-index="' + index + '"]');
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 50);
}
function libraryRow(task, i) {
  const st = task.steps[i],
    x = statusFor(task.id, i),
    a = assignmentFor(task.id, i);
  return `<div class="coord-row" data-row="${esc(task.id)}-${i}"><div class="coord-description"><strong>Step ${esc(st.number)} ${st.critical ? "· CRITICAL " : ""}${st.leader ? "· LEADER" : ""}</strong><div>${esc(st.text)}</div><small>${esc(st.stage)} · ${x.count ? `${x.count} saved observation(s)` : "No saved observations"}${x.evaluator ? " · Latest: " + esc(x.evaluator) + " on " + esc(x.date) : ""}${x.conflict ? " · DIFFERING OBSERVATIONS" : ""}</small></div><div class="coord-right"><span class="coord-pill" style="color:${statusTint(x.rating)};border-color:${statusTint(x.rating)}">${statusLabel(x.rating)}</span><small>${a ? "Observer Assigned: " + esc(a.observer) : "Unassigned"}</small><div class="coord-actions"><button class="secondary" data-claim-task="${esc(task.id)}" data-claim-index="${i}">${a ? "Release / manage" : "Claim observation"}</button><button class="secondary" data-observe-task="${esc(task.id)}" data-observe-index="${i}">Observe</button></div></div></div>`;
}
function bindLibraryActions() {
  document
    .querySelectorAll("[data-claim-task]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          claimStep(b.dataset.claimTask, Number(b.dataset.claimIndex))),
    );
  document
    .querySelectorAll("[data-observe-task]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          beginObservation(
            b.dataset.observeTask,
            Number(b.dataset.observeIndex),
          )),
    );
  document.querySelectorAll("[data-library-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        document
          .querySelectorAll("[data-library-filter]")
          .forEach((x) => x.classList.toggle("active", x === b));
        const filter = b.dataset.libraryFilter;
        document.querySelectorAll(".coord-row").forEach((row) => {
          const [taskId, i] = row.dataset.row.split(/-(?=\d+$)/);
          const x = statusFor(taskId, Number(i));
          const a = assignmentFor(taskId, Number(i));
          row.style.display =
            filter === "all" ||
            (filter === "remaining" && !["GO", "NO-GO"].includes(x.rating)) ||
            (filter === "assigned" && a) ||
            (filter === "observed" && ["GO", "NO-GO"].includes(x.rating))
              ? ""
              : "none";
        });
      }),
  );
}
function renderStandards() {
  const rows = tasks
    .map((t) => {
      const statuses = t.steps.map((_, i) => statusFor(t.id, i));
      const go = statuses.filter((x) => x.rating === "GO").length,
        ng = statuses.filter((x) => x.rating === "NO-GO").length,
        no = statuses.filter((x) => x.rating === "N/O").length,
        claimed = t.steps.filter((_, i) => assignmentFor(t.id, i)).length;
      return `<section class="standard coord-section"><div class="section-head"><div><h2>${esc(t.code)} · ${esc(t.title)}</h2><p class="section-sub">${esc(t.echelonNote)} · ${t.steps.length} top-level steps · Effective ${esc(t.version)}</p></div><div><strong style="color:#d6b45b">${go + ng}/${t.steps.length} observed</strong><p class="section-sub">${go} GO · ${ng} NO-GO · ${no} Not Observed · ${claimed} assigned</p></div></div><div class="coord-rows">${t.steps.map((_, i) => libraryRow(t, i)).join("")}</div></section>`;
    })
    .join("");
  $("content").innerHTML =
    `<div class="panel"><div class="section-head"><h2>T&EO Library · OC/T Coordination</h2><span>Demonstration Unit · demonstration records</span></div><p class="hint">Status reflects the latest saved observation for the selected exercise, not an official task rating. Previous observations are retained; conflicting observations are flagged. Assignments coordinate coverage but do not prevent independent observations.</p><div class="form-grid"><label>Training event<select id="libExercise">${exercises.map((e) => `<option value="${esc(e.id)}">${esc(e.name)} · ${esc(e.dates)}</option>`).join("")}</select></label><label>Unit<select id="libUnit">${options(units)}</select></label></div><div class="coord-filters"><button class="secondary active" data-library-filter="all">All steps</button><button class="secondary" data-library-filter="remaining">Outstanding</button><button class="secondary" data-library-filter="observed">Observed</button><button class="secondary" data-library-filter="assigned">Observer Assigned</button></div>${rows}<p class="hint">Standalone limitation: each computer maintains its own local records and assignments. Real-time cross-OC/T coordination requires an approved shared database. Use demonstration information only.</p></div>`;
  $("libExercise").value = state.exerciseId;
  $("libUnit").value = state.unitId;
  $("libExercise").onchange = (e) => {
    state.exerciseId = e.target.value;
    renderStandards();
  };
  $("libUnit").onchange = (e) => {
    state.unitId = e.target.value;
    renderStandards();
  };
  bindLibraryActions();
}
function aar(r) {
  if (!r) return "No evaluation selected.";
  const t = tasks.find((x) => x.id === r.taskId);
  if (!t) return "Source task unavailable.";
  const a = r.aarInputs || {},
    rows = t.steps.map((st, i) => ({
      st,
      mark: r.measures?.[i]?.rating || "N/O",
      evidence: r.measures?.[i]?.note?.trim() || "",
    }));
  const good = rows.filter((x) => x.mark === "GO"),
    bad = rows.filter((x) => x.mark === "NO-GO"),
    unseen = rows.filter((x) => x.mark === "N/O");
  const analysis = calcRating(t, r.measures || []);
  const evidenceLine = (x) =>
    `Step ${x.st.number}${x.st.critical ? " [CRITICAL]" : ""}${x.st.leader ? " [LEADER]" : ""}: ${x.st.text}\n  ${x.evidence ? "Evidence: " + x.evidence : "Evidence not documented; validate with OC/T."}`;
  const strengths = good.length
    ? good.slice(0, 6).map(evidenceLine).join("\n\n")
    : "No GO measures recorded.";
  const issues = bad.length
    ? bad
        .slice(0, 8)
        .map(
          (x) =>
            `${evidenceLine(x)}\n  Discussion: ${a.cause || "[Facilitator to establish causal factors with participants; do not assume cause.]"}\n  Proposed improvement: ${a.corrective || "[Develop specific corrective training/action with the unit.]"}`,
        )
        .join("\n\n")
    : "No NO-GO measures recorded. Confirm that performance was adequately observed.";
  const odrs = (r.findings || [])
    .map((f, j) => {
      const s = t.steps[Number(f.step)];
      return `ODR ${j + 1} — ${s ? "Step " + s.number + ": " + s.text : "Unlinked step"}\nObservation: ${f.observation || "[Evidence required]"}\nDiscussion: ${f.discussion || "[Discussion required — do not infer root cause]"}\nRecommendation: ${f.recommendation || "[Recommendation required]"}\nCorrective action: ${f.action || "[Action required]"}\nProposed owner: ${f.owner || "[Unassigned]"}; follow-up: ${f.suspense || "[Not set]"}`;
    })
    .join("\n\n");
  return `TRACE | DRAFT TRAINING AFTER ACTION REVIEW
DOCTRINE-ALIGNED WORKING DRAFT — NOT VERIFIED AS FIRST ARMY-SPECIFIC TEMPLATE
FICTIONAL PROTOTYPE — NOT AN OFFICIAL ARMY RECORD

UNIT / EVENT INFORMATION
Unit: ${label(units, r.unitId)}
Exercise: ${label(exercises, r.exerciseId)}
Observation date: ${r.date}
Location: ${a.location || "[Not recorded]"}
Facilitator / OC/T: ${r.evaluator}
Task: ${t.title} (${t.code}, effective ${t.version})
Source standard: ${t.standard || "[Consult approved T&EO]"}

1. WHAT WAS SUPPOSED TO HAPPEN? (OBJECTIVES / STANDARDS)
${a.objective || "[Confirm commander’s training objectives and intended outcome.]"}
Applicable T&EO: ${t.code}; evaluate relevant performance measures under the documented conditions and standards.

2. WHAT ACTUALLY HAPPENED? (FACTS / CHRONOLOGY)
${a.actual || "[Add verified sequence of events, timing, conditions, and participant perspectives.]"}
Documented results: ${good.length} GO, ${bad.length} NO-GO, ${unseen.length} not observed / unassessed.
GO rates — all observed: ${analysis.allPct ?? "N/A"}%; critical observed: ${analysis.criticalPct ?? "N/A"}%; leader observed: ${analysis.leaderPct ?? "N/A"}%.

3. WHAT WENT WELL / WHAT NEEDS IMPROVEMENT? (OBSERVATION — DISCUSSION)

SUSTAINS — EVIDENCE LINKED TO STANDARD
${strengths}
Practice to sustain: ${a.sustain || "[Identify successful method with participants and explain why it worked.]"}

IMPROVES — OBSERVATION / DISCUSSION / RECOMMENDATION
${issues}

DETAILED ODR FINDINGS (OC/T DRAFT)
${odrs || "No detailed ODR findings entered. Develop findings with observed evidence."}

UNOBSERVED / EVALUATION GAPS
${unseen.length ? unseen.map((x) => "Step " + x.st.number + ": " + x.st.text).join("\n") : "None marked N/O."}

4. HOW WILL WE PERFORM TO STANDARD NEXT TIME? (CORRECTIVE TRAINING)
Recommended action: ${a.corrective || "[Determine specific retraining, SOP adjustment, rehearsal, or process change with the unit.]"}
Proposed responsible party: ${a.actionOwner || "[Assign during AAR]"}
Proposed suspense: ${a.actionDue || "[Agree suspense during AAR]"}
Verification of improvement: [Define a repeatable observed performance measure and follow-up evaluation.]

EVALUATOR'S PROPOSED ASSESSMENT
OC/T-recommended rating: ${r.rating || "Not provided"}
Automated measure analysis: ${analysis.band}.
Important: Full matrix conditions (training environment, night/day, attendance, external evaluation and applicability) were not automatically verified. A T/P/U recommendation is NOT an official commander assessment.

FACILITATOR FOLLOW-UP / VALIDATION
- Confirm event chronology and discuss causes with unit participants.
- Verify critical and leader measures against the approved T&EO.
- Validate applicability / N/A designations and evaluation conditions.
- Agree corrective actions, owners, suspenses, and a follow-up training event.
- Obtain the required organizational review and approval before distribution.

Source: Army FM 7-0 Appendix K AAR agenda; TC 7-0.1 AAR principles. Exact First Army local format requires a provided approved template.
`;
}
function download(name, content, type = "text/plain") {
  const u = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 3000);
}
function renderAAR() {
  const all = allRecords();
  const r = selected();
  $("content").innerHTML =
    `<div class="panel"><div class="section-head"><h2>Draft AAR</h2><span>Generated from recorded observations</span></div><label>Select evaluation<select id="aarSelect">${all.map((x) => `<option value="${esc(x.id)}">${esc(label(units, x.unitId))} · ${esc(label(tasks, x.taskId))} · ${esc(x.date)}</option>`).join("")}</select></label><pre class="aar" id="aarText"></pre><button class="primary" id="downloadAAR">Download Draft AAR</button></div>`;
  $("aarSelect").value = r?.id || "";
  const update = () => {
    $("aarText").textContent = aar(
      all.find((x) => x.id === $("aarSelect").value),
    );
  };
  $("aarSelect").onchange = (e) => {
    state.selectedId = e.target.value;
    update();
  };
  $("downloadAAR").onclick = () =>
    download("TRACE_Draft_AAR.txt", $("aarText").textContent);
  update();
}
function render() {
  if (state.tab === "units-events") return renderUnitEventManager();
  ({
    dashboard: renderDashboard,
    evaluate: renderEvaluate,
    history: renderHistory,
    standards: renderStandards,
    aar: renderAAR,
    workspace: renderWorkspace,
  })[state.tab]();
  if (state.tab === "dashboard") traceDashboardControls();
  if (state.tab === "evaluate") traceEvaluationControls();
}
document
  .querySelectorAll("[data-nav]")
  .forEach((b) => (b.onclick = () => nav(b.dataset.nav)));
// js/shared/boot.js calls nav('dashboard') once every script has loaded.
