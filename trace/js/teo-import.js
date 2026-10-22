/* TRACE v23: imported T&EOs are separate from immutable demonstration references. */
const TRACE23_KEY = "trace_v23_imported_teos_v1";
const trace23BuiltInIds = new Set(tasks.map((t) => t.id));
let trace23Draft = null;
function trace23Load() {
  try {
    const list = JSON.parse(localStorage.getItem(TRACE23_KEY) || "[]");
    let repaired = false;
    if (Array.isArray(list))
      list.forEach((t) => {
        if (
          t &&
          t.id &&
          Array.isArray(t.steps) &&
          !tasks.some((x) => x.id === t.id)
        ) {
          if (t.traceSymbolMapping !== "leader-star-critical-plus") {
            // Earlier imports reversed the Army T&EO * and + meanings. Repair flags once without changing assessments.
            t.steps.forEach((st) => {
              const oldCritical = !!st.critical;
              st.critical = !!st.leader;
              st.leader = oldCritical;
            });
            t.traceSymbolMapping = "leader-star-critical-plus";
            repaired = true;
          }
          tasks.push(t);
        }
      });
    if (repaired) {
      localStorage.setItem(TRACE23_KEY, JSON.stringify(list));
      traceSyncNotify(TRACE23_KEY);
    }
  } catch (e) {
    console.warn("TRACE import records could not be loaded or migrated", e);
  }
}
function trace23Save() {
  try {
    localStorage.setItem(
      TRACE23_KEY,
      JSON.stringify(tasks.filter((t) => !trace23BuiltInIds.has(t.id))),
    );
    traceSyncNotify(TRACE23_KEY);
    return true;
  } catch (e) {
    alert(
      "Unable to save imported T&EOs in this browser. Storage may be full.",
    );
    return false;
  }
}
trace23Load();
// Imported T&EOs use the same evaluation data shape as built-in references.
// Repair records imported by earlier v23 releases without re-uploading PDFs.
function trace23NormalizeEvaluationTask(task) {
  if (!task || !Array.isArray(task.steps)) return task;
  if (
    !Array.isArray(task.measures) ||
    task.measures.length !== task.steps.length
  ) {
    task.measures = task.steps.map((step) =>
      String(
        step.text ||
          step.title ||
          step.description ||
          "Performance step " + step.number,
      ),
    );
  }
  return task;
}
tasks.forEach(trace23NormalizeEvaluationTask);
function trace23DB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("trace_v23_teo_documents", 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains("docs"))
        r.result.createObjectStore("docs", { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function trace23StoreFile(id, file) {
  if (window.TraceSync?.shared) return TraceSync.files.put(id, file);
  const db = await trace23DB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("docs", "readwrite");
    tx.objectStore("docs").put({
      id,
      name: file.name,
      blob: file,
      created: Date.now(),
    });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
async function trace23GetFile(id) {
  if (window.TraceSync?.shared) return TraceSync.files.get(id);
  const db = await trace23DB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("docs", "readonly"),
      r = tx.objectStore("docs").get(id);
    r.onsuccess = () => {
      db.close();
      resolve(r.result);
    };
    r.onerror = () => {
      db.close();
      reject(r.error);
    };
  });
}
async function trace23DeleteFile(id) {
  if (window.TraceSync?.shared) return TraceSync.files.remove(id);
  const db = await trace23DB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("docs", "readwrite");
    tx.objectStore("docs").delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
function trace23Status(msg) {
  const el = document.getElementById("trace23Status");
  if (el) el.textContent = msg;
}
function trace23Clean(line) {
  return String(line || "")
    .replace(/\s+/g, " ")
    .trim();
}
function trace23Parse(pages, name) {
  const heading = /performance\s+steps\s+and\s+measures/i;
  const endHeading = /task\s+performance\s+summary\s+block/i;
  const start = pages.findIndex((p) => heading.test(p));
  if (start < 0)
    throw Error(
      "Could not find “Performance Steps and Measures.” No tasks were imported.",
    );
  let chunks = [];
  let ended = false;
  for (let p = start; p < pages.length; p++) {
    let text = String(pages[p] || "");
    if (p === start) {
      const m = heading.exec(text);
      text = text.slice(m.index + m[0].length);
    }
    const stop = endHeading.exec(text);
    if (stop) {
      text = text.slice(0, stop.index);
      ended = true;
    }
    chunks.push({ page: p + 1, text });
    if (ended) break;
  }
  if (!ended)
    throw Error(
      "Could not find “Task Performance Summary Block” after the performance steps. Import stopped to prevent capturing unrelated sections; check the PDF.",
    );
  const steps = [];
  let current = null;
  let stage = "";
  function flush() {
    if (current) {
      current.text = trace23Clean(current.text);
      if (current.text) steps.push(current);
      current = null;
    }
  }
  for (const chunk of chunks) {
    const lines = chunk.text.split(/\n/).map(trace23Clean).filter(Boolean);
    for (let line of lines) {
      if (
        /^(?:performance\s+steps\s+and\s+measures|performance\s+steps|step\s+no\.?|go\s*\/\s*no.?go|evaluation\s+guidance|legend\s*:)/i.test(
          line,
        )
      )
        continue;
      const phase = line.match(
        /^(plan|prepare|execute|assess)(?:\s+phase)?\s*:?$/i,
      );
      if (phase) {
        stage = phase[1][0].toUpperCase() + phase[1].slice(1).toLowerCase();
        continue;
      }
      // Army T&EO notation: * leader, + critical, *+ both. Some exports use (C)/(L).
      let m = line.match(
        /^\s*(?:step\s*)?(\d{1,3})\s*[.)]\s*((?:(?:\*|\+|\(C\)|\(L\)|\(CL\)|\(LC\))\s*)*)(.+)$/i,
      );
      if (!m)
        m = line.match(/^\s*((?:\*|\+){1,2})\s*(\d{1,3})\s*[.)]?\s+(.+)$/);
      if (m) {
        flush();
        const prefix = /^\d/.test(m[1]) ? "" : m[1];
        const num = Number(prefix ? m[2] : m[1]);
        let body = prefix ? m[3] : m[3];
        let flags = prefix || m[2] || "";
        const suffix = body.match(
          /^((?:\*|\+|\(C\)|\(L\)|\(CL\)|\(LC\))+)\s*/i,
        );
        if (suffix) {
          flags += " " + suffix[1];
          body = body.slice(suffix[0].length);
        }
        const tag = body.match(
          /^\[\s*(critical\s*(?:and|\/)\s*leader|leader\s*(?:and|\/)\s*critical|critical|leader)\s*\]\s*/i,
        );
        if (tag) {
          flags += " " + tag[1];
          body = body.slice(tag[0].length);
        }
        current = {
          number: num,
          text: body,
          subtasks: [],
          details: [],
          stage,
          page: chunk.page,
          critical: /\+|\(C\)|\(CL\)|\(LC\)|critical/i.test(flags),
          leader: /\*|\(L\)|\(CL\)|\(LC\)|leader/i.test(flags),
        };
        continue;
      }
      if (!current) continue;
      // Subtasks are retained and displayed as supporting details, not counted as separate numbered steps.
      if (/^(?:\(?[a-z]\)|[a-z][.)]|\(\d+\))\s+\S/i.test(line)) {
        current.subtasks.push(line);
        current.details.push(line);
        continue;
      }
      if (
        /^(?:note|legend|performance\s+measures|task\s+steps)\s*:/i.test(line)
      )
        continue;
      if (current.subtasks.length) {
        current.subtasks[current.subtasks.length - 1] += " " + line;
        current.details[current.details.length - 1] += " " + line;
      } else current.text += " " + line;
    }
  }
  flush();
  const unique = [];
  const seen = new Set();
  for (const st of steps) {
    if (seen.has(st.number)) continue;
    seen.add(st.number);
    unique.push(st);
  }
  if (!unique.length)
    throw Error(
      "No numbered performance steps were detected between the two headings.",
    );
  const code =
    (name.match(/\b\d{2}-[A-Z]{2,5}-\d{3,5}\b/i) || [])[0] ||
    name.replace(/\.[^.]+$/, "").slice(0, 60);
  return {
    code,
    title:
      name
        .replace(/\.[^.]+$/, "")
        .replace(/^\d{2}-[A-Z]{2,5}-\d{3,5}\s*[-_(]?\s*/i, "")
        .replace(/[)_]/g, " ")
        .trim() || code,
    steps: unique,
    traceSymbolMapping: "leader-star-critical-plus",
    page: start + 1,
    endPage: chunks[chunks.length - 1].page,
    source: name,
  };
}
let trace23PdfPromise = null;
function trace23PdfLib() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (trace23PdfPromise) return trace23PdfPromise;
  trace23PdfPromise = new Promise((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    sc.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      } else reject(Error("PDF reader did not initialize"));
    };
    sc.onerror = () =>
      reject(
        Error(
          "PDF reading requires internet access to load the PDF.js reader. You can import a text (.txt) export offline.",
        ),
      );
    document.head.append(sc);
  });
  return trace23PdfPromise;
}
async function trace23Pages(file) {
  if (/\.txt$/i.test(file.name))
    return (await file.text()).split(/\f|\n\s*---\s*page\s*\d+\s*---\s*\n/i);
  if (!/\.pdf$/i.test(file.name))
    throw Error("Choose a PDF or a plain text (.txt) export of the T&EO.");
  const lib = await trace23PdfLib();
  const doc = await lib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    disableWorker: true,
  }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    trace23Status("Reading PDF page " + i + " of " + doc.numPages + "…");
    const page = await doc.getPage(i),
      content = await page.getTextContent();
    let rows = [],
      lastY = null,
      line = [];
    for (const item of content.items) {
      const y = Math.round(item.transform?.[5] || 0);
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        rows.push(line.join(" "));
        line = [];
      }
      line.push(item.str || "");
      lastY = y;
      if (item.hasEOL) {
        rows.push(line.join(" "));
        line = [];
        lastY = null;
      }
    }
    if (line.length) rows.push(line.join(" "));
    pages.push(rows.join("\n"));
  }
  return pages;
}
async function trace23HandleFile(file) {
  if (!file) return;
  trace23Draft = null;
  trace23Status("Reading " + file.name + "…");
  try {
    const pages = await trace23Pages(file);
    const parsed = trace23Parse(pages, file.name);
    trace23Draft = { ...parsed, file };
    const box = document.getElementById("trace23Preview");
    if (!box) return;
    box.style.display = "block";
    box.innerHTML = `<h3>Review before import</h3><p class="hint">Found ${parsed.steps.length} numbered performance steps on pages ${parsed.page}–${parsed.endPage}, stopping before Task Performance Summary Block. Verify critical/leader markers against the original PDF.</p><div class="trace23-meta"><label>Task number<input id="trace23Code" value="${esc(parsed.code)}"></label><label>Task title<input id="trace23Title" value="${esc(parsed.title)}"></label></div><div style="max-height:240px;overflow:auto;margin:12px 0">${parsed.steps.map((x, i) => `<p style="font-size:12px;border-bottom:1px solid #39444a;padding:6px 0"><strong>${x.number}.</strong> ${x.critical && x.leader ? "<b style='color:#e8c56f'>CRITICAL + LEADER</b>" : x.critical ? "<b style='color:#e8c56f'>CRITICAL</b>" : x.leader ? "<b style='color:#a9d5ef'>LEADER</b>" : ""} ${esc(x.text)} ${x.subtasks.length ? `<small>(${x.subtasks.length} subtasks)</small>` : ""}</p>`).join("")}</div><div class="trace23-actions"><button class="primary" id="trace23Commit">Import into T&EO Library</button><button class="secondary" id="trace23Cancel">Cancel</button></div>`;
    document.getElementById("trace23Commit").onclick = trace23Commit;
    document.getElementById("trace23Cancel").onclick = () => {
      trace23Draft = null;
      box.style.display = "none";
      trace23Status("Import canceled");
    };
    trace23Status(
      "Ready to import: " + parsed.steps.length + " performance steps.",
    );
  } catch (e) {
    trace23Status("Import failed: " + e.message);
    const box = document.getElementById("trace23Preview");
    if (box) box.style.display = "none";
  }
}
async function trace23Commit() {
  if (!trace23Draft) return;
  const d = trace23Draft,
    code = document.getElementById("trace23Code").value.trim(),
    title = document.getElementById("trace23Title").value.trim();
  if (!code || !title) {
    alert("Enter a task number and title.");
    return;
  }
  const id = code;
  if (tasks.some((t) => t.id === id)) {
    alert(
      "A T&EO with this task number already exists. Change the number or remove the previous imported T&EO.",
    );
    return;
  }
  const task = {
    id,
    code,
    title,
    version: "Imported",
    source: d.source,
    sourceType: "User-imported T&EO (verify against source)",
    echelonNote:
      "Imported reference; assign to units and events as appropriate.",
    conditions: "See original source document.",
    steps: d.steps.map((x) => ({
      number: x.number,
      text: x.text,
      subtasks: x.subtasks,
      details: x.details,
      stage: x.stage,
      page: x.page,
      critical: x.critical,
      leader: x.leader,
    })),
  };
  trace23NormalizeEvaluationTask(task);
  tasks.push(task);
  if (!trace23Save()) {
    tasks.pop();
    return;
  }
  try {
    await trace23StoreFile(id, d.file);
  } catch (e) {
    alert(
      "Task imported, but the original PDF could not be stored for download: " +
        e.message,
    );
  }
  trace23Draft = null;
  renderStandards();
  trace23Status(
    "Imported " +
      code +
      " successfully. Assign it to a unit under Units & Events.",
  );
}
async function trace23Download(id) {
  try {
    const file = await trace23GetFile(id);
    if (!file) {
      alert("Original document not stored in this browser.");
      return;
    }
    const url = URL.createObjectURL(file.blob),
      a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 12000);
  } catch (e) {
    alert(e.message);
  }
}
async function trace23Remove(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task || trace23BuiltInIds.has(id)) return;
  if (
    !confirm(
      "Remove " +
        task.code +
        " from the library? Existing evaluations are retained, but this task will no longer be available for new assignments.",
    )
  )
    return;
  const idx = tasks.indexOf(task);
  tasks.splice(idx, 1);
  if (!trace23Save()) {
    tasks.splice(idx, 0, task);
    return;
  }
  try {
    await trace23DeleteFile(id);
  } catch (e) {}
  renderStandards();
}
const trace23OriginalRenderStandards = renderStandards;
renderStandards = function () {
  trace23OriginalRenderStandards();
  const root = document.getElementById("content");
  const wrapper = document.createElement("section");
  wrapper.className = "panel";
  wrapper.innerHTML = `<div class="section-head"><div><h2>Import T&EO</h2><p class="section-sub">Drag and drop a T&EO PDF or browse your computer. Parsing begins at the page headed “Performance Steps and Measures.”</p></div></div><div class="trace23-drop" id="trace23Drop" tabindex="0" role="button" aria-label="Drop a T&EO PDF or choose a file"><strong>↓ Drop T&EO Here</strong><small>PDF or text (.txt) · Or click to browse</small></div><input type="file" id="trace23File" accept=".pdf,.txt,application/pdf,text/plain" style="display:none"><div id="trace23Status" class="trace23-status">PDF reader loads on demand; an internet connection is needed for PDF files. Text files work offline.</div><div class="trace23-preview" id="trace23Preview" style="display:none"></div><h3>Imported T&EOs (${tasks.filter((t) => !trace23BuiltInIds.has(t.id)).length})</h3><div>${
    tasks
      .filter((t) => !trace23BuiltInIds.has(t.id))
      .map(
        (t) =>
          `<div class="trace23-imported"><span><strong>${esc(t.code)}</strong> — ${esc(t.title)} <small>· ${t.steps.length} steps</small></span><button class="secondary" data-t23-download="${esc(t.id)}">Download source</button><button class="danger" data-t23-remove="${esc(t.id)}">Remove</button></div>`,
      )
      .join("") || '<p class="hint">No imported T&EOs yet.</p>'
  }</div>`;
  root.insertBefore(wrapper, root.firstChild);
  const drop = document.getElementById("trace23Drop"),
    input = document.getElementById("trace23File");
  drop.onclick = () => input.click();
  drop.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  };
  input.onchange = () => trace23HandleFile(input.files[0]);
  drop.ondragover = (e) => {
    e.preventDefault();
    drop.classList.add("dragging");
  };
  drop.ondragleave = () => drop.classList.remove("dragging");
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove("dragging");
    trace23HandleFile(e.dataTransfer.files[0]);
  };
  root
    .querySelectorAll("[data-t23-download]")
    .forEach((b) => (b.onclick = () => trace23Download(b.dataset.t23Download)));
  root
    .querySelectorAll("[data-t23-remove]")
    .forEach((b) => (b.onclick = () => trace23Remove(b.dataset.t23Remove)));
};
// Library-only warehouse: observation controls belong exclusively on Evaluations.
renderStandards = function () {
  const root = document.getElementById("content");
  const imported = tasks.filter((t) => !trace23BuiltInIds.has(t.id));
  const builtins = tasks.filter((t) => trace23BuiltInIds.has(t.id));
  root.innerHTML = `<div class="panel"><div class="section-head"><div><h2>T&EO Library</h2><p class="section-sub">Reference warehouse · Upload, download, and remove T&EOs. Assign tasks to units in Units & Events; record assessments in Evaluations.</p></div><span class="pill">${tasks.length} T&EOs</span></div>
 <div class="trace23-drop" id="trace23Drop" tabindex="0" role="button" aria-label="Drop a T&EO PDF or choose a file"><strong>↓ Drop T&EO Here</strong><small>Drop PDF / TXT or click to browse your computer</small></div>
 <input type="file" id="trace23File" accept=".pdf,.txt,application/pdf,text/plain" style="display:none">
 <div id="trace23Status" class="trace23-status">PDF imports require internet to load the reader. Extraction runs from “Performance Steps and Measures” up to “Task Performance Summary Block.”</div>
 <div class="trace23-preview" id="trace23Preview" style="display:none"></div>
 <div class="section-head" style="margin-top:24px"><h2>Uploaded T&EOs (${imported.length})</h2></div>
 <div>${imported.map((t) => `<div class="trace23-imported"><span><strong>${esc(t.code)}</strong> — ${esc(t.title)} <small>· ${t.steps.length} performance steps · ${esc(t.source || "Uploaded file")}</small></span><button class="secondary" data-t23-download="${esc(t.id)}">Download</button><button class="danger" data-t23-remove="${esc(t.id)}">Delete</button></div>`).join("") || '<p class="hint">No uploaded T&EOs yet. Use the drop box above to add one.</p>'}</div>
 <div class="section-head" style="margin-top:24px"><h2>Included References (${builtins.length})</h2></div>
 <div>${builtins.map((t) => `<div class="trace23-imported"><span><strong>${esc(t.code)}</strong> — ${esc(t.title)} <small>· ${t.steps.length} performance steps</small></span><span class="pill">Built-in reference</span></div>`).join("")}</div>
 <p class="hint">Included references have no uploaded source file to download. Uploaded documents are stored in this browser. Deleting an uploaded T&EO removes it from the active library but retains historical evaluation records.</p></div>`;
  const drop = document.getElementById("trace23Drop"),
    input = document.getElementById("trace23File");
  drop.onclick = () => input.click();
  drop.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  };
  input.onchange = () => trace23HandleFile(input.files[0]);
  drop.ondragover = (e) => {
    e.preventDefault();
    drop.classList.add("dragging");
  };
  drop.ondragleave = () => drop.classList.remove("dragging");
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove("dragging");
    trace23HandleFile(e.dataTransfer.files[0]);
  };
  root
    .querySelectorAll("[data-t23-download]")
    .forEach((b) => (b.onclick = () => trace23Download(b.dataset.t23Download)));
  root
    .querySelectorAll("[data-t23-remove]")
    .forEach((b) => (b.onclick = () => trace23Remove(b.dataset.t23Remove)));
};
const trace23OriginalRender = render;
render = function () {
  trace23OriginalRender();
};
