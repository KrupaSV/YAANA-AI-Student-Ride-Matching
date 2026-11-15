# YAANA 2.0

Campus ride matching for confirmed Dayananda Sagar University students. The React app uses saved road routes and compatibility rules to compare student trips.

## Run the website

```powershell
cd yaana
npm install
npm run dev
```

The site opens at `http://localhost:5173`.

## Run the map API

```powershell
cd yaana
python -m pip install -r requirements.txt
python -m uvicorn ml_api:app --reload --port 8000
```

The API searches a bundled [Bengaluru place catalog](geodata/README.md) and uses OSRM for road routes and detours. Search for **DSU Main Campus**, **DSU Innovation Campus, Kudlu Gate**, **Kudlu Gate Metro**, or **HSR Layout** to try it. Keep the `geodata` directory in the backend deployment alongside `ml_api.py`.

Run the map tests from this directory with `python -m pytest geodata/tests -q`.

## Environment

`yaana/.env.local` should contain:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (or a real `VITE_SUPABASE_ANON_KEY` longer than 30 characters)
- `VITE_COLLEGE_EMAIL_DOMAIN=dsu.edu.in`
- `VITE_REGISTRATION_MODE=testing` (use `production` to restore DSU-only signup)
- `VITE_ML_API_URL=http://localhost:8000`

A short placeholder in `.env` is ignored. Never put the service-role key in a `VITE_` variable or in frontend code.

## Database

In the Supabase SQL editor, run `supabase/migrations/20261026183000_init.sql` once. It adds columns, request functions, indexes, and Row Level Security to the tables that already exist. It does not delete student rows.

If the script prints a notice about avatar storage, create a public `avatars` bucket in Storage and allow each user to write only inside a folder named with their user id.

## Supabase Dashboard settings you must set

1. Authentication → URL configuration → Site URL: `http://localhost:5173`.
2. Redirect URLs, include all of these:
   - `http://localhost:5173/auth/callback`
   - `http://localhost:5173/auth/callback/**`
   - `http://localhost:5173/**`
3. Authentication → Providers → Email: enabled.
4. Confirm email: enabled. The installed client (`@supabase/supabase-js` 2.118.0) uses the implicit grant, so the confirmation link must return the session in the URL hash. Do not switch the project to a flow this client is not using.
5. Leave the confirmation and recovery templates on `{{ .ConfirmationURL }}`.
6. Authentication → Email → minimum password length: 8 or lower. The form also requires one letter and one number.
7. Do not disable Row Level Security.

To allow another exact student domain later, insert it into `allowed_email_domains` and add it to `VITE_COLLEGE_EMAIL_DOMAINS`. A subdomain such as `mail.dsu.edu.in` is not accepted unless you add that exact domain. Domain match is not enrollment verification. The student still has to open the confirmation email.

## Temporary testing registration

Signup still uses Supabase Auth and still requires the confirmation email. Row Level Security stays on. No passwords or inboxes are hardcoded.

**Enable testing (any valid email, including Gmail and Outlook; USN not required):**

1. In `yaana/.env.local` set `VITE_REGISTRATION_MODE=testing` and restart `npm run dev`.
2. In the Supabase SQL editor, run these once:
   - `yaana/supabase/migrations/20261030190000_registration_mode.sql`
   - `yaana/supabase/migrations/20261030210000_optional_usn.sql`
3. Keep Authentication → Providers → Email → Confirm email enabled.
4. The live form also reads `public.app_settings.registration_mode`, so a deployed site follows the SQL switch without a rebuild.
5. Register and login then show **Email address**. The USN field is hidden while testing.

**Restore DSU-only registration before public launch:**

1. Set `VITE_REGISTRATION_MODE=production` in `yaana/.env.local` and restart the Vite process.
2. In the SQL editor run:

```sql
update public.app_settings
set value = 'production', updated_at = now()
where key = 'registration_mode';
```

Existing DSU student accounts and USNs are not rewritten. After restore, personal-email test accounts can still log in, but they cannot publish trips or match because the database domain check returns.

## How to test

Use two browsers, or one normal window and one private window.

1. Register student A at a real `@dsu.edu.in` address. The page should say the confirmation email was sent and should not open the dashboard yet.
2. Open the email link in the same browser. `/auth/callback` should say the email is verified and then go to `/dashboard`. Refresh the dashboard. The session should still be there.
3. Log out. Log in again with the same password.
4. Repeat registration for student B.
5. As A, create a trip by searching for a pickup and destination. The map should draw a road route before saving.
6. As B, open Find a Ride and request that trip. The status should stay “request sent”, not booked.
7. As A, accept the request in My Rides. Only then should it say the seat is reserved. Reveal email should work only after acceptance. B should not have been able to read A’s email before that.
8. As B, request the same trip again. The database should reject the duplicate.
9. Fill the seats with acceptances, then try another acceptance. It should report that no seats are left.
10. As B, edit A’s profile. Row Level Security should deny it. B also cannot change USN, role, or verification status on their own profile.
11. While logged out, open `/dashboard`. You should land on `/login`.
12. Use Forgot password, open the link in the same browser, and set a new password.
13. Open an old confirmation link, or a link with a broken token, and confirm the expired or invalid state offers a login action.

Place search uses bundled OpenStreetMap data and does not call a remote geocoder. The OpenStreetMap basemap and public OSRM routing demo still need internet access and may throttle traffic.

## Seed demo rides and logins

Use a Supabase demo project with the YAANA schema applied and registration mode already set to `testing`. Seed logins belong to fictional students and can read other open rides in that project, so use a database reserved for test data.

Start the map API, then preview the route geometry from the app directory.

```powershell
node scripts/seed-demo.mjs --preview
```

Put the demo project URL, publishable key, and server-side secret or service-role key in an ignored `.env.demo.local` file as `YAANA_DEMO_SUPABASE_URL`, `YAANA_DEMO_PUBLISHABLE_KEY`, and `YAANA_DEMO_ADMIN_KEY`. Set `YAANA_DEMO_MAP_URL` if the map API is running at a different URL. Keep the admin key out of all `VITE_` variables.

```powershell
node --env-file=.env.demo.local scripts/seed-demo.mjs
```

The script creates three confirmed demo logins and publishes four trips for the next day in Bengaluru. Two Cab trips from HSR Layout depart eight minutes apart so the normal Matches page can discover the pair. The script stores the generated IDs and passwords in an ignored `.yaana-demo-<project-hostname>.local` file and reuses them on later runs. The IDs are the login email addresses.

If you create the demo users through **Authentication → Users** with auto-confirm enabled, use the public configuration in `.env.local`. Run the first command to generate the credentials, create the users with those credentials, then run the second command to publish the rides through those accounts.

```powershell
node --env-file=.env.local scripts/seed-demo.mjs --prepare-logins
node --env-file=.env.local scripts/seed-demo.mjs --existing-users
```
