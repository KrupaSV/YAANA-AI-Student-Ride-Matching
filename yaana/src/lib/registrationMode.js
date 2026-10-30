const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function registrationMode(raw) {
  const value = raw ?? (typeof import.meta !== "undefined" ? import.meta.env?.VITE_REGISTRATION_MODE : undefined);
  return String(value || "production").trim().toLowerCase() === "testing" ? "testing" : "production";
}

export function isTestingRegistration(raw) {
  return registrationMode(raw) === "testing";
}

export { DOMAIN_PATTERN };
