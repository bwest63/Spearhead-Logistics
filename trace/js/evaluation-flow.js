/* TRACE v23 evaluation stability: single authoritative selection/render flow. */
(function () {
  function assignedTasks() {
    const ev = trace18.events.find((e) => e.id === state.exerciseId);
    return ev && ev.unitIds.includes(state.unitId)
      ? traceTaskAssignments(ev, state.unitId).filter((id) =>
          tasks.some((t) => t.id === id),
        )
      : [];
  }
  // The legacy post-render filter was mutating event selection after measures had rendered.
  // Own all three selectors here and redraw from the same state snapshot.
  traceEvaluationControls = function () {};
  renderEvaluate = function () {
    const activeUnits = trace18.units.filter((u) => !u.archived);
    if (!activeUnits.some((u) => u.id === state.unitId))
      state.unitId = activeUnits[0]?.id || "";
    const events = trace18EventsForUnit(state.unitId);
    if (!events.some((e) => e.id === state.exerciseId))
      state.exerciseId = events[0]?.id || "";
    const eligible = assignedTasks();
    if (!eligible.includes(state.taskId)) {
      state.taskId = "";
      state.measures = {};
      state.editingId = "";
      state.findings = [];
    }
    // The original renderer expects a task, so temporarily supply one for its HTML
    // construction, then remove all task-specific UI if none is selected.
    const chosen = state.taskId;
    if (!chosen && !tasks.length) {
      $("content").innerHTML =
        '<div class="panel">No T&EOs in the library.</div>';
      return;
    }
    if (!chosen) state.taskId = tasks[0].id;
    traceOldEvaluate();
    state.taskId = chosen;
    const unit = $("unit"),
      event = $("exercise"),
      task = $("task");
    if (!unit || !event || !task) return;
    unit.innerHTML = activeUnits
      .map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`)
      .join("");
    unit.value = state.unitId;
    event.innerHTML = events.length
      ? events
          .map(
            (e) =>
              `<option value="${esc(e.id)}">${esc(e.name)} · ${esc(e.dates || "Dates TBD")}</option>`,
          )
          .join("")
      : '<option value="">No assigned training events</option>';
    event.value = state.exerciseId;
    task.innerHTML =
      '<option value="">Select collective training task</option>' +
      tasks
        .filter((t) => eligible.includes(t.id))
        .map(
          (t) =>
            `<option value="${esc(t.id)}">${esc(t.code)} · ${esc(t.title)}</option>`,
        )
        .join("");
    task.value = chosen;
    function switchSelection(key, value) {
      state[key] = value;
      if (key !== "taskId") {
        if (key === "unitId") state.exerciseId = "";
        state.taskId = "";
      }
      state.measures = {};
      state.editingId = "";
      state.findings = [];
      state.rating = "";
      if (state.taskId) traceRestoreEvaluation();
      renderEvaluate();
    }
    unit.onchange = (e) => switchSelection("unitId", e.target.value);
    event.onchange = (e) => switchSelection("exerciseId", e.target.value);
    task.onchange = (e) => switchSelection("taskId", e.target.value);
    const panel = task.closest(".panel");
    if (!chosen) {
      panel
        .querySelectorAll(".measure[data-step-index]")
        .forEach((el) => el.remove());
      panel.querySelector(".task-summary")?.remove();
      const progress = $("progress");
      if (progress) progress.textContent = "";
      const preview = $("ratingPreview");
      if (preview) preview.innerHTML = "";
      const rating = $("rating");
      if (rating) {
        rating.value = "";
        rating.disabled = true;
      }
      const saveButton = $("save");
      if (saveButton) saveButton.disabled = true;
      const findingButton = $("addFinding");
      if (findingButton) findingButton.disabled = true;
      const findingList = $("findingList");
      if (findingList) findingList.innerHTML = "";
    }
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = !events.length
      ? "Assign this unit to a training event under Units & Events."
      : !eligible.length
        ? "Assign T&EOs to this unit at this training event under Units & Events."
        : !chosen
          ? "Select a collective training task to display its performance measures."
          : `${eligible.length} assigned T&EO(s) available for this unit and event.`;
    task.parentElement.appendChild(hint);
  };
})();
