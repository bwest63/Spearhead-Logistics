/* TRACE start-up.
 *
 * Local mode: load the app scripts and open the dashboard.
 * Shared mode: sign the OC/T in, copy the shared database into this browser's
 * cache, then load the app scripts. The app reads that cache at start-up, so
 * the data must be in place before its scripts run.
 */
(function () {
  // Supabase client library, bundled so sign-in does not depend on a CDN.
  const SUPABASE_JS = "js/vendor/supabase-2.117.2.js";
  const APP_SCRIPTS = [
    "js/data/builtin-teos.js",
    "js/core.js",
    "js/word-export.js",
    "js/workspace.js",
    "js/units-events.js",
    "js/teo-import.js",
    "js/evaluation-flow.js",
    "js/aar-print.js",
    "js/backup-guard.js",
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(Error("Could not load " + src));
      document.body.appendChild(el);
    });
  }
  async function loadAll(list) {
    for (const src of list) await loadScript(src);
  }
  function fail(message) {
    const content = document.getElementById("content");
    if (content)
      content.innerHTML = `<div class="panel"><h2>TRACE could not start</h2><p>${String(message).replace(/</g, "&lt;")}</p></div>`;
  }

  async function start() {
    const cfg = window.TRACE_CONFIG || {};
    const shared = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
    try {
      if (shared) {
        await loadScript(SUPABASE_JS);
        await loadScript("js/shared/sync.js");
        await TraceSync.start(cfg);
      }
      await loadAll(APP_SCRIPTS);
      if (shared) {
        await loadScript("js/shared/accounts.js");
        TraceSync.attach();
      }
      nav("dashboard");
    } catch (e) {
      console.error(e);
      fail(e.message);
    }
  }
  start();
})();
