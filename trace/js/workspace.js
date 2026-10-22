/* TRACE OC/T Workspace: local-only notes and IndexedDB reference attachments. */
const WS_NOTES_KEY = "trace_oct_workspace_v23";
function wsRead() {
  try {
    return JSON.parse(localStorage.getItem(WS_NOTES_KEY)) || {};
  } catch {
    return {};
  }
}
function wsSave(v) {
  try {
    localStorage.setItem(WS_NOTES_KEY, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}
function wsDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("trace_oct_workspace_files_v1", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("files", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function wsFiles() {
  const db = await wsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readonly");
    const req = tx.objectStore("files").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
async function wsPut(item) {
  const db = await wsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(item);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
async function wsDelete(id) {
  const db = await wsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
function wsText() {
  return (document.getElementById("wsNotes")?.value || "").trim();
}
function wsStatus(msg) {
  const e = document.getElementById("wsStatus");
  if (e) e.textContent = msg;
}
function wsPersist() {
  const data = {
    title: document.getElementById("wsTitle").value,
    unit: document.getElementById("wsUnit").value,
    event: document.getElementById("wsEvent").value,
    notes: document.getElementById("wsNotes").value,
    output: document.getElementById("wsOutput").value,
    updated: new Date().toISOString(),
  };
  wsStatus(
    wsSave(data)
      ? "Saved in this browser · " + new Date().toLocaleTimeString()
      : "Could not save: browser storage may be full or blocked.",
  );
}
function wsPrompt() {
  const title = document.getElementById("wsTitle").value || "OC/T Observation";
  const unit = document.getElementById("wsUnit").value || "Not provided";
  const event = document.getElementById("wsEvent").value || "Not provided";
  return `You are editing a fictional OC/T working draft for a military training exercise. Use ONLY the supplied notes. Correct grammar, spelling, clarity, and military professional tone. Do not invent facts, dates, metrics, T&EO ratings, causes, conclusions, or recommendations. Preserve uncertainties and identify missing information explicitly. Return: (1) Cleaned observation notes; (2) Executive summary (max 200 words); (3) Key sustains; (4) Key improves; (5) Recommended follow-up questions. Mark any sections without evidence as Not documented.\n\nProduct: ${title}\nUnit: ${unit}\nEvent: ${event}\n\nRAW OBSERVATIONS:\n${wsText() || "[No notes entered]"}`;
}
function wsTemplate() {
  const t = document.getElementById("wsTitle").value || "OC/T WORKING PRODUCT",
    unit = document.getElementById("wsUnit").value || "Not specified",
    event = document.getElementById("wsEvent").value || "Not specified",
    notes = wsText();
  return `${t.toUpperCase()}\nUNIT: ${unit}\nEXERCISE: ${event}\nSTATUS: OC/T WORKING DRAFT — NOT VERIFIED\n\nEXECUTIVE SUMMARY\n[Draft after reviewing verified observations; do not infer results.]\n\nOBSERVATIONS / SUPPORTING EVIDENCE\n${notes || "[No observations entered]"}\n\nSUSTAINS\n[Identify evidenced strengths.]\n\nIMPROVES\n[Identify evidenced deficiencies and applicable T&EO steps.]\n\nRECOMMENDED ACTIONS / FOLLOW-UP\n[Identify actions, owners, and suspenses after validation.]\n\nSOURCE DOCUMENTS\n[Review locally attached reference files; attachment text is not automatically analyzed.]`;
}
async function wsRefreshFiles() {
  const el = document.getElementById("wsFileList");
  if (!el) return;
  try {
    const files = await wsFiles();
    el.innerHTML = files.length
      ? files
          .map(
            (f) =>
              `<div class="ws-file"><div><strong>${esc(f.name)}</strong><small>${(f.size / 1024 / 1024).toFixed(2)} MB · ${esc(f.type || "file")} · ${new Date(f.created).toLocaleDateString()}</small></div><div class="ws-actions"><button class="secondary" data-ws-get="${esc(f.id)}">Open / save</button><button class="danger" data-ws-del="${esc(f.id)}">Remove</button></div></div>`,
          )
          .join("")
      : '<p class="ws-tip">No reference files added yet.</p>';
    el.querySelectorAll("[data-ws-get]").forEach(
      (b) =>
        (b.onclick = () => {
          const f = files.find((x) => x.id === b.dataset.wsGet);
          if (!f) return;
          const url = URL.createObjectURL(f.blob),
            a = document.createElement("a");
          a.href = url;
          a.download = f.name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 15000);
        }),
    );
    el.querySelectorAll("[data-ws-del]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm("Remove this workspace attachment?")) return;
          await wsDelete(b.dataset.wsDel);
          wsRefreshFiles();
        }),
    );
  } catch (e) {
    el.textContent = "Browser attachment storage is unavailable: " + e.message;
  }
}
function renderWorkspace() {
  const d = wsRead();
  $("content").innerHTML =
    `<div class="dash-shell"><div class="dash-title"><div><h2>OC/T Workspace</h2><p>Capture working observations · organize references · prepare products</p></div><span class="pill">LOCAL WORKSPACE</span></div><div class="notice">Prototype only. Use fictional or approved publicly releasable information. Notes and uploaded documents remain in this browser. They are not synchronized, automatically backed up, or submitted to AI.</div><div class="ws-grid"><section class="ws-box"><h3>Working Notes</h3><div class="form-grid"><label>Product / subject<input id="wsTitle" placeholder="e.g., SPO distribution operations"></label><label>Unit<input id="wsUnit" placeholder="e.g., supported unit"></label><label>Exercise / event<input id="wsEvent" placeholder="e.g., CRX 27-04"></label></div><label>OC/T observations<textarea id="wsNotes" placeholder="Record times, facts, observed actions, T&EO step references, evidence, and follow-up questions. Avoid assumptions."></textarea></label><div class="ws-actions"><button class="primary" id="wsSave">Save Notes</button><button class="secondary" id="wsExport">Export Notes to Word</button><button class="secondary" id="wsPrompt">Copy AI Editing Prompt</button></div><p id="wsStatus" class="ws-status">Stored locally in this browser only.</p></section><section class="ws-box"><h3>Reference Library</h3><p class="ws-tip">Attach PowerPoint (.ppt/.pptx), Word (.doc/.docx), Excel (.xls/.xlsx/.csv), and PDF files for local reference and product preparation. Files can be downloaded again; this offline prototype does not extract or read their contents automatically.</p><label>Add reference documents<input id="wsUpload" type="file" multiple accept=".ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.pdf,.txt"></label><div id="wsFileList"><p class="ws-tip">Loading files…</p></div><p class="ws-tip">Attachments are stored in browser IndexedDB. Browser cleanup, private browsing, or switching computers may remove access.</p></section></div><section class="ws-box"><h3>Product Builder · Executive Summary</h3><p class="ws-tip">Generate a structured working draft, or copy the AI editing prompt and use an organization-approved AI tool. Paste the approved AI response below for final review. The draft generator is not AI and does not invent an executive summary.</p><div class="ws-actions"><button class="primary" id="wsDraft">Create Working Draft</button><button class="secondary" id="wsCopyPrompt2">Copy AI Prompt</button><button class="secondary" id="wsDownload">Download Word Product</button><button class="secondary" id="wsCopyProduct">Copy Product</button></div><label>Draft product / reviewed AI output<textarea class="ws-output" id="wsOutput" placeholder="Create a working draft or paste the AI-generated text here, then edit and validate it."></textarea></label><p class="ws-tip">Validate all claims, task references, ratings, and recommendations before distribution. No AI service is connected to this standalone file.</p></section></div>`;
  for (const [id, key] of [
    ["wsTitle", "title"],
    ["wsUnit", "unit"],
    ["wsEvent", "event"],
    ["wsNotes", "notes"],
    ["wsOutput", "output"],
  ])
    document.getElementById(id).value = d[key] || "";
  ["wsTitle", "wsUnit", "wsEvent", "wsNotes", "wsOutput"].forEach((id) =>
    document.getElementById(id).addEventListener("change", wsPersist),
  );
  document.getElementById("wsSave").onclick = wsPersist;
  document.getElementById("wsExport").onclick = () =>
    downloadWord(
      "TRACE_OC-T_Working_Notes.docx",
      "TRACE — OC/T Working Notes",
      wsText(),
    );
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(wsPrompt());
      wsStatus(
        "AI editing prompt copied. Paste into an approved AI service only.",
      );
    } catch {
      const t = document.getElementById("wsOutput");
      t.value = wsPrompt();
      wsStatus(
        "Clipboard unavailable. Prompt placed in Product Builder for manual copying.",
      );
    }
  };
  document.getElementById("wsPrompt").onclick = copyPrompt;
  document.getElementById("wsCopyPrompt2").onclick = copyPrompt;
  document.getElementById("wsDraft").onclick = () => {
    document.getElementById("wsOutput").value = wsTemplate();
    wsPersist();
  };
  document.getElementById("wsDownload").onclick = () =>
    downloadWord(
      "TRACE_OC-T_Working_Product.docx",
      "TRACE — OC/T Working Product",
      document.getElementById("wsOutput").value,
    );
  document.getElementById("wsCopyProduct").onclick = async () => {
    try {
      await navigator.clipboard.writeText(
        document.getElementById("wsOutput").value,
      );
      wsStatus("Product copied.");
    } catch {
      wsStatus(
        "Clipboard unavailable. Select the product text and copy manually.",
      );
    }
  };
  document.getElementById("wsUpload").onchange = async (e) => {
    const files = [...e.target.files];
    let count = 0;
    for (const f of files) {
      if (!/\.(pptx?|docx?|xlsx?|csv|pdf|txt)$/i.test(f.name)) {
        wsStatus("Unsupported file type: " + f.name);
        continue;
      }
      try {
        await wsPut({
          id: crypto.randomUUID
            ? crypto.randomUUID()
            : Date.now() + "_" + Math.random(),
          name: f.name,
          type: f.type,
          size: f.size,
          created: Date.now(),
          blob: f,
        });
        count++;
      } catch (err) {
        wsStatus("Could not store " + f.name + ": " + err.message);
        break;
      }
    }
    if (count) wsStatus(count + " reference file(s) saved in this browser.");
    e.target.value = "";
    wsRefreshFiles();
  };
  wsRefreshFiles();
}
