import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const accounts = {
  asha: { email: "yaana-demo-asha@example.com", name: "YAANA Demo Asha" },
  neha: { email: "yaana-demo-neha@example.com", name: "YAANA Demo Neha" },
  ravi: { email: "yaana-demo-ravi@example.com", name: "YAANA Demo Ravi" },
};
const rides = [
  { id: "hsr-asha", owner: "asha", pickup: "HSR Layout", mode: "Cab", time: "08:10", seats: 2 },
  { id: "hsr-ravi", owner: "ravi", pickup: "HSR Layout", mode: "Cab", time: "08:18", seats: 3 },
  { id: "jayanagar", owner: "neha", pickup: "Jayanagar", mode: "Auto", time: "08:30", seats: 2 },
  { id: "silk-board", owner: "ravi", pickup: "Silk Board Metro", mode: "Auto", time: "09:15", seats: 2 },
];
const destination = "DSU Main Campus";
const apiBase = (process.env.YAANA_DEMO_MAP_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };

async function map(path, options) {
  const response = await fetch(apiBase + path, { ...options, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Map request failed with HTTP ${response.status}. Check the YAANA map API.`);
  return response.json();
}

async function findPlace(query) {
  const { results } = await map(`/geo/search?q=${encodeURIComponent(query)}`);
  if (!results?.length) throw new Error(`The place catalog has no result for ${query}.`);
  return results[0];
}

async function loadRoutes() {
  const drop = await findPlace(destination);
  const routes = new Map();
  const pickups = [...new Set(rides.map(({ pickup }) => pickup))];
  for (const query of pickups) {
    if (routes.size) await new Promise((resolve) => setTimeout(resolve, 1_100));
    const pickup = await findPlace(query);
    const route = await map("/geo/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin_lat: pickup.lat,
        origin_lng: pickup.lng,
        destination_lat: drop.lat,
        destination_lng: drop.lng,
      }),
    });
    if (!Array.isArray(route.geometry) || route.geometry.length < 2) {
      throw new Error(`The routing service returned no road geometry for ${pickup.label}.`);
    }
    routes.set(query, {
      origin_name: pickup.label,
      origin_lat: pickup.lat,
      origin_lng: pickup.lng,
      destination_name: drop.label,
      destination_lat: drop.lat,
      destination_lng: drop.lng,
      route_geometry: route.geometry,
      distance_km: route.distance_km,
      duration_min: route.duration_min,
    });
  }
  return routes;
}

function readResult(operation, { data, error }) {
  if (error) throw new Error(`${operation} failed. ${error.message}`);
  return data;
}

async function credentialsFor(project) {
  const file = new URL(`../.yaana-demo-${project.hostname}.local`, import.meta.url);
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    if (saved.project !== project.origin) throw new Error("The credentials belong to a different Supabase project.");
    if (!Object.keys(accounts).every((id) => typeof saved.passwords?.[id] === "string" && saved.passwords[id].length >= 16)) {
      throw new Error("The demo credentials file is incomplete.");
    }
    return { file, passwords: saved.passwords };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const passwords = Object.fromEntries(
    Object.keys(accounts).map((id) => [id, `D3mo-${randomBytes(18).toString("base64url")}`]),
  );
  await writeFile(file, JSON.stringify({ project: project.origin, accounts, passwords }, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  return { file, passwords };
}

async function demoStudent(admin, projectUrl, publishableKey, account, password) {
  if (admin) {
    const profile = readResult("Checking the demo account", await admin
      .from("profiles").select("id").eq("student_email", account.email).maybeSingle());
    if (profile) {
      const { user } = readResult("Verifying the demo account", await admin.auth.admin.getUserById(profile.id));
      if (user?.app_metadata?.yaana_demo !== true) {
        throw new Error(`The login ${account.email} already belongs to a regular account.`);
      }
    } else {
      readResult("Creating a demo account", await admin.auth.admin.createUser({
        email: account.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: account.name },
        app_metadata: { yaana_demo: true },
      }));
    }
  }
  const client = createClient(projectUrl, publishableKey, clientOptions);
  const { user } = readResult(`Signing in as ${account.email}`, await client.auth.signInWithPassword({
    email: account.email, password,
  }));
  return { client, id: user.id };
}

async function main() {
  if (process.argv.includes("--preview")) {
    const routes = await loadRoutes();
    for (const route of routes.values()) {
      console.log(`${route.origin_name} → ${route.destination_name} · ${route.distance_km} km · ${route.route_geometry.length} road points`);
    }
    return;
  }
  const existingUsers = process.argv.includes("--existing-users");
  const preparingLogins = process.argv.includes("--prepare-logins");
  const projectUrl = process.env.YAANA_DEMO_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.YAANA_DEMO_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const adminKey = process.env.YAANA_DEMO_ADMIN_KEY;
  if (!projectUrl) throw new Error("Set the verified demo project URL.");
  const project = new URL(projectUrl);
  if (preparingLogins) {
    const { file } = await credentialsFor(project);
    console.log(`Prepared demo login details in ${file.pathname.split("/").pop()}.`);
    return;
  }
  if (!publishableKey || (!existingUsers && !adminKey)) {
    throw new Error("Set the demo project publishable key and a server-side admin key, or use --existing-users.");
  }
  const publicClient = createClient(project.origin, publishableKey, clientOptions);
  const mode = readResult("Checking registration mode", await publicClient.rpc("registration_mode"));
  if (mode !== "testing") throw new Error("The demo project must already be in testing registration mode.");
  const routes = await loadRoutes();
  const admin = existingUsers ? null : createClient(project.origin, adminKey, clientOptions);
  const { file, passwords } = await credentialsFor(project);
  const students = {};
  for (const [id, account] of Object.entries(accounts)) {
    students[id] = await demoStudent(admin, project.origin, publishableKey, account, passwords[id]);
  }
  if (existingUsers) {
    for (const [id, account] of Object.entries(accounts)) {
      const student = students[id];
      readResult("Naming the demo profile", await student.client.from("profiles")
        .update({ full_name: account.name }).eq("id", student.id));
    }
  }
  const tomorrow = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(Date.now() + 86_400_000);
  let created = 0;
  for (const ride of rides) {
    const { client, id } = students[ride.owner];
    const preferences = `YAANA demo route ${ride.id}. For testing only.`;
    const existing = readResult("Checking for an upcoming demo route", await client.from("trips")
      .select("id").eq("user_id", id).eq("preferences", preferences)
      .gt("departure_at", new Date().toISOString()).limit(1));
    if (existing.length) continue;
    const departure = new Date(`${tomorrow}T${ride.time}:00+05:30`);
    readResult("Publishing the demo route", await client.from("trips").insert({
      ...routes.get(ride.pickup),
      user_id: id,
      departure_at: departure.toISOString(),
      transport_mode: ride.mode,
      seats_available: ride.seats,
      estimated_cost: 0,
      status: "open",
      preferences,
    }));
    created += 1;
  }
  console.log(`Verified ${Object.keys(students).length} demo logins and published ${created} new demo rides.`);
  console.log(`Login details are stored in ${file.pathname.split("/").pop()}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
