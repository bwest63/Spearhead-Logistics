/* TRACE deployment settings.
 *
 * Leave both values empty to run in local-only mode: data stays in this
 * browser, exactly like the single-file TRACE_v42.html.
 *
 * For shared mode, paste your Supabase project URL and its publishable
 * (or legacy "anon") key; SETUP.md in the repository root shows where to
 * find them. That key is designed to be public: the database's row-level
 * security rules decide what each signed-in OC/T may do.
 */
window.TRACE_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
};
