# YAANA 2.0

Campus ride matching for confirmed Dayananda Sagar University students. The React app is in this folder. The matcher is trained on City of Chicago rideshare trips, documented in `ml/README.md`.

## Run the website

```powershell
cd yaana
npm install
npm run dev
```

The site opens at `http://localhost:5173`.

## Run the matching API

```powershell
cd yaana
..\.venv\Scripts\python.exe -m pip install -r ml\requirements.txt
..\.venv\Scripts\python.exe -m uvicorn ml_api:app --reload --port 8000
```

Place search, road routes, detours, and Chicago rule scores need this process. Use the virtual environment above so scoring runs on scikit-learn 1.9.1, the version that trained `yaana_model.joblib`. A different scikit-learn install refuses to score and returns that reason. If the process is stopped, those screens show an error instead of a made-up route.

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

**Enable testing (any valid email):**

1. In `yaana/.env.local` set `VITE_REGISTRATION_MODE=testing` and restart `npm run dev`.
2. In the Supabase SQL editor, run `yaana/supabase/migrations/20261030190000_registration_mode.sql` once. That file sets `public.app_settings.registration_mode` to `testing`.
3. Keep Authentication → Providers → Email → Confirm email enabled.

**Restore DSU-only registration:**

1. Set `VITE_REGISTRATION_MODE=production` in `yaana/.env.local` and restart the Vite process.
2. In the SQL editor run:

```sql
update public.app_settings
set value = 'production', updated_at = now()
where key = 'registration_mode';
```

Existing DSU student accounts are not rewritten. After restore, personal-email test accounts can still exist in Auth, but they cannot publish trips or match because the domain check returns.

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

Map providers: OpenStreetMap tiles, Nominatim search, and the public OSRM demo are for light use. They require attribution, can rate-limit, and are not a production traffic plan.
