/* TRACE v42: browser-data backup/restore and unsaved-evaluation protection. */
(function () {
  const BACKUP_KEYS = [
    KEY,
    ASSIGN_KEY,
    TRACE18_KEY,
    TRACE23_KEY,
    WS_NOTES_KEY,
    "trace_v32_oct_log",
  ];
  function exportBackup() {
    const data = {};
    BACKUP_KEYS.forEach((k) => {
      const v = localStorage.getItem(k);
      if (v !== null) data[k] = v;
    });
    download(
      "TRACE_backup_" + new Date().toISOString().slice(0, 10) + ".json",
      JSON.stringify(
        { app: "TRACE", version: 42, exported: new Date().toISOString(), data },
        null,
        1,
      ),
      "application/json",
    );
  }
  async function importBackup(file) {
    try {
      let b;
      try {
        b = JSON.parse(await file.text());
      } catch {
        throw Error("The file is not valid JSON.");
      }
      if (!b || b.app !== "TRACE" || !b.data || typeof b.data !== "object")
        throw Error("This is not a TRACE backup file.");
      const entries = Object.entries(b.data).filter(
        ([k, v]) => BACKUP_KEYS.includes(k) && typeof v === "string",
      );
      entries.forEach(([k, v]) => JSON.parse(v));
      if (!entries.length) throw Error("The backup contains no TRACE data.");
      if (
        !confirm(
          `Restore backup from ${b.exported || "an unknown date"}?\n\nThis replaces the evaluations, units, events, assignments, imported T&EOs, and workspace notes stored in this browser. Attached files are not part of backups.`,
        )
      )
        return;
      const previous = Object.fromEntries(
        BACKUP_KEYS.map((k) => [k, localStorage.getItem(k)]),
      );
      try {
        BACKUP_KEYS.forEach((k) => localStorage.removeItem(k));
        entries.forEach(([k, v]) => localStorage.setItem(k, v));
      } catch (e) {
        BACKUP_KEYS.forEach((k) =>
          previous[k] === null
            ? localStorage.removeItem(k)
            : localStorage.setItem(k, previous[k]),
        );
        throw Error(
          "Browser storage rejected the backup; existing data was kept. " +
            e.message,
        );
      }
      state.dirty = false;
      location.reload();
    } catch (e) {
      alert("Backup could not be restored: " + e.message);
    }
  }
  const foot = document.querySelector(".sidebar-footer");
  if (foot) {
    const box = document.createElement("div");
    box.className = "trace42-backup";
    box.innerHTML =
      '<div class="side-note">DATA BACKUP</div><button type="button" id="trace42Export" title="Download evaluations, units, events, imported T&amp;EOs and workspace notes as a JSON file. Attached files are not included.">⇩ Export backup</button><button type="button" id="trace42Import" title="Replace this browser\'s TRACE data with a backup file">⇧ Restore backup</button><input type="file" id="trace42File" accept=".json,application/json" hidden>';
    foot.parentElement.insertBefore(box, foot);
    const input = box.querySelector("#trace42File");
    box.querySelector("#trace42Export").onclick = exportBackup;
    box.querySelector("#trace42Import").onclick = () => input.click();
    input.onchange = () => {
      if (input.files[0]) importBackup(input.files[0]);
      input.value = "";
    };
  }
  // Unsaved ratings survive tab switches (see nav); warn before they are discarded.
  window.addEventListener("beforeunload", (e) => {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  document.addEventListener(
    "change",
    (e) => {
      const key = { unit: "unitId", exercise: "exerciseId", task: "taskId" }[
        e.target.id
      ];
      if (state.tab !== "evaluate" || !key || !state.dirty) return;
      if (confirm("Discard unsaved ratings and notes for this evaluation?")) {
        state.dirty = false;
        return;
      }
      e.stopImmediatePropagation();
      e.target.value = state[key];
    },
    true,
  );
})();
