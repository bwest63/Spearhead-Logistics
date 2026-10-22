# Setting up shared TRACE with Supabase

This turns TRACE into a shared system. Every OC/T signs in from their own phone or computer, and saved evaluations, claims, and log entries show up for everyone within a second or two.

**Use fictional data only.** This setup runs on a commercial cloud service. It is not approved for real unit readiness data, CUI, or classified information.

Expect about 30 minutes. You need a computer for setup; OC/Ts can then use phones.

## What's in the repository

| Path | What it is |
| --- | --- |
| `trace/` | The app, split into normal files. Open `trace/index.html` to run it. |
| `trace/js/shared/config.js` | The only file you edit: your Supabase address and key. |
| `supabase/schema.sql` | Creates the database tables and access rules. You paste it into Supabase once. |
| `TRACE_v42.html` | The original single-file, single-browser version. It still works on its own. |

While `config.js` is empty, `trace/` runs in local-only mode, exactly like `TRACE_v42.html`.

## Step 0: Save any data you want to keep

If you've entered test data in `TRACE_v42.html` that you want in the shared system, open it, click **Export backup** in the sidebar, and keep the `.json` file. You'll upload it in Step 7.

## Step 1: Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (the free plan is fine).
2. Click **New project**.
   - **Name:** `trace`
   - **Database password:** generate one and save it somewhere safe. TRACE doesn't need it, but you'll need it if you ever manage the database directly.
   - **Region:** the one closest to your OC/Ts.
3. Wait a minute or two for the project to finish setting up.

## Step 2: Create the database

1. In your project, open **SQL Editor** in the left menu and start a **New query**.
2. Open `supabase/schema.sql` from this repository, copy all of it, and paste it into the editor.
3. Click **Run**. You should see a success message with no rows returned.

This creates:

- **Tables** for units, training events, imported T&EOs, evaluations, step claims, and OC/T log entries.
- **Access rules**, enforced by the database itself, so changing the app can't get around them:
  - OC/Ts must sign in, and can read everything. Accounts an admin has turned off see nothing.
  - Only **admins** can add or change units, events, T&EO assignments, and imported T&EOs.
  - Anyone can add evaluations, claims, and log entries. Only the author or an admin can change or delete them.
  - **The first account created becomes the admin.** Everyone after that is an OC/T.
- **Live updates** for those tables.
- A private **file storage area** for T&EO source documents.
- **Account management** for admins: the Accounts page, invite-only sign-up, and turning access off.

Running the script again later is safe; it doesn't delete data. **Re-run it whenever a TRACE update says so**, so the database gets any new tables, functions, or rules.

## Step 3: Choose sign-in settings

Open **Authentication** and find the **Email** sign-in provider settings (menu names shift a little between Supabase versions; it's usually under *Sign In / Providers*).

- Make sure **Email** sign-in is turned on.
- **Confirm email:** decide whether new accounts must click a link in an email before signing in.
  - **For a pilot, turn it off.** Supabase's built-in email sender only allows a few emails per hour, which a group of OC/Ts creating accounts at once will hit.
  - If you leave it on, also do the URL step at the end of Step 5 so the confirmation links open TRACE.

## Step 4: Connect TRACE to your project

1. In Supabase, open **Project Settings**, then **API Keys** (or **API**). Copy two values:
   - **Project URL**, for example `https://abcdefghijkl.supabase.co`. It's sometimes shown on the **Data API** page instead.
   - The **publishable key** (starts with `sb_publishable_`). If your project only shows legacy keys, use the **anon public** key (a long value starting with `eyJ`).
   - Never use the **secret** or **service_role** key. It bypasses every access rule.
2. On GitHub, open `trace/js/shared/config.js`, click the pencil (Edit) icon, and fill in the two values:

   ```js
   window.TRACE_CONFIG = {
     supabaseUrl: "https://abcdefghijkl.supabase.co",
     supabaseAnonKey: "sb_publishable_xxxxxxxxxxxxxxxx",
   };
   ```

3. Click **Commit changes**.

The publishable key is meant to be visible in web pages; the access rules from Step 2 are what protect the data.

## Step 5: Put TRACE online with GitHub Pages

1. On GitHub, open the repository's **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**. Pick the branch that holds this work (`trace-v42` until it's merged, then `main`) and the **/ (root)** folder. Click **Save**.
3. After a minute or two, TRACE is at:
   **https://bwest63.github.io/Spearhead-Logistics/trace/**

The page itself is public (only signed-in accounts can see any data). GitHub Pages from a private repository needs a paid GitHub plan.

Then tell Supabase where TRACE lives, so emailed links (password resets, and confirmations if you left **Confirm email** on) open TRACE: in Supabase, open **Authentication → URL Configuration**. Set **Site URL** to the address above, and add the same address under **Redirect URLs**.

## Step 6: Create the admin account (you)

1. Open the TRACE address. You'll see the sign-in screen.
2. Click **New OC/T? Create an account**, then enter your name, email, and a password of at least 8 characters.
3. The sidebar should show your name with **TRACE admin** under it.

Do this before sharing the link. The first account becomes the admin.

As admin, set up the exercise under **Units & Events**:

1. Add units.
2. Create training events and tick the participating units.
3. Use **Assign T&EOs** on each event to choose each unit's tasks.

Everyone else sees these instantly.

## Step 7: Bring in earlier data (optional)

As admin, click **Upload backup to shared** in the sidebar and choose the `.json` file from Step 0. Records the shared database doesn't have yet are added; existing ones are left alone.

If you used TRACE on this same browser in local-only mode, you'll also see **Upload earlier local data**. TRACE kept a copy of that data the first time you signed in.

## Step 8: Invite your OC/Ts

Send them the TRACE address. Each person:

1. Opens it on their phone or computer.
2. Creates an account with their name or call sign.
3. On a phone, can use **Share → Add to Home Screen** (Safari) or **⋮ → Add to Home screen** (Chrome) to get an app icon.

New accounts are OC/Ts. To control who can join or make someone an admin, use the **Accounts** page (next section).

## Managing accounts

Admins see **Accounts** in the sidebar.

**People** lists everyone with an account: name, email, role, whether their access is on, when they last signed in, and when they joined. For each person you can:

- **Make admin / Make OC/T.** You can also **step down** yourself, as long as another active admin remains.
- **Rename** them, for example to fix a call sign.
- **Turn off access.** They can still sign in, but see an "Access turned off" screen and no TRACE data, and can't save anything. Their earlier records stay. **Restore access** undoes it. You can't turn off your own access.

TRACE always keeps at least one active admin and refuses any change that would leave none.

**Sign-up:**

- **Invite-only sign-up** off (the default): anyone with the TRACE link can create an OC/T account.
- **Invite-only sign-up** on: only emails on the invite list can create an account. Everyone else sees "This email hasn't been invited to TRACE." People who already have accounts aren't affected.
- **Add invite:** enter an email and choose **OC/T** or **Admin**. The person opens TRACE, chooses **Create an account**, and uses that email. The invite then disappears from the list. An invite also sets the role in open mode, so you can invite another admin directly.

**Forgotten passwords:** on the sign-in screen, people choose **Forgot password?** and enter their email. They get a reset link that opens TRACE on a "Choose a new password" screen. This needs the **URL Configuration** step at the end of Step 5. Supabase's built-in email sender only sends a few emails per hour.

**Deleting an account permanently** isn't possible from TRACE (it needs Supabase's secret key, which must never be in a web page). Use Supabase → **Authentication → Users** → **⋯** → **Delete user**. Their saved records stay in TRACE, and from then on only admins can change them. Turning off access is usually enough.

## Using shared TRACE

**The status chip** in the page header:

| Chip | Meaning |
| --- | --- |
| **Live** | Connected; everyone's changes appear as they're saved. |
| **Syncing · N changes waiting** | Sending this device's saved changes. |
| **Offline · N changes waiting** | No signal. Keep working: changes are saved on the device and sent automatically when the connection returns, even if you close TRACE and reopen it later. |

**What OC/Ts and admins can do:**

| | OC/T | Admin |
| --- | --- | --- |
| Record evaluations, findings, claims, workspace log entries | ✓ | ✓ |
| Edit or delete their **own** evaluations | ✓ | ✓ |
| Edit or delete **anyone's** evaluations | | ✓ |
| Manage units, events, T&EO assignments | | ✓ |
| Manage accounts, invites, and sign-up | | ✓ |
| Import or remove T&EOs | | ✓ |
| Download T&EO source documents | ✓ | ✓ |

**Good to know:**

- **Several OC/Ts can rate the same task.** Each save is a separate record, so nobody overwrites anyone else. The evaluation form shows everyone's latest step ratings, and conflicting ratings are flagged, as before.
- **Live updates won't interrupt your work.** If you're typing or have unsaved ratings, the screen waits to refresh until you're done.
- **Workspace notes and attachments stay private to your device.** Log entries you save are shared and feed the event AAR.
- **Sign out on shared devices.** Signing out clears TRACE's copy of the data from that browser.
- **The free Supabase plan pauses projects after about a week without use.** If TRACE stops connecting after a quiet period, open the Supabase dashboard and resume the project.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| The sign-in screen never appears; TRACE opens straight to the old local mode | `config.js` is still empty, or GitHub Pages hasn't picked up your commit yet. Wait a minute and reload. |
| "Invalid API key" or nothing loads after signing in | Re-copy the Project URL and publishable/anon key into `config.js` (Step 4). |
| "Email not confirmed" | Turn off **Confirm email** (Step 3), or have the person click the link in their email. |
| A change you made disappears with a message about admins or ownership | Expected: the database refused it. Only admins manage units, events, and T&EOs, and only authors (or admins) change an evaluation. |
| You're not the admin | Someone else created the first account. Ask them to make you an admin on the Accounts page, or in Supabase open **Table Editor → profiles** and change your **role** to `admin`. |
| The Accounts page says it's unavailable, or "Could not find the function" | Re-run `supabase/schema.sql` (Step 2) so the database has the account functions. |
| A password-reset link opens the wrong page or says the link is invalid | Set the **Site URL** and **Redirect URLs** (end of Step 5). Links expire after a while and work once; request a new one. |
| "This email hasn't been invited to TRACE" | Invite-only sign-up is on. An admin adds the email on the Accounts page. |
| TRACE won't load at all with no signal | The page itself needs a connection to open. Once open, it keeps working offline. |
