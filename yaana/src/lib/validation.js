import { DOMAIN_PATTERN, isTestingRegistration, registrationMode } from "./registrationMode.js";

export { isTestingRegistration, registrationMode };

export function configuredDomains() {
  const raw =
    import.meta.env.VITE_COLLEGE_EMAIL_DOMAINS ||
    import.meta.env.VITE_COLLEGE_EMAIL_DOMAIN ||
    "dsu.edu.in";

  return [...new Set(
    String(raw)
      .split(",")
      .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
      .filter((domain) => DOMAIN_PATTERN.test(domain))
  )];
}

export function emailParts(value) {
  const email = String(value || "").trim().toLowerCase();
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { email, local: parts[0], domain: parts[1] };
}

export function isValidEmailAddress(value) {
  const parts = emailParts(value);
  if (!parts) return false;
  if (!/^[a-z0-9._%+-]+$/.test(parts.local)) return false;
  return DOMAIN_PATTERN.test(parts.domain);
}

export function isAllowedCollegeEmail(value, domains = configuredDomains(), mode = registrationMode()) {
  if (!isValidEmailAddress(value)) return false;
  if (mode === "testing") return true;
  const parts = emailParts(value);
  return domains.map((domain) => domain.toLowerCase()).includes(parts.domain);
}

export function emailFieldCopy(mode = registrationMode(), domains = configuredDomains()) {
  if (mode === "testing") {
    return {
      label: "Email address",
      placeholder: "Enter your email address",
    };
  }
  return {
    label: "DSU college email",
    placeholder: `name@${domains[0] || "dsu.edu.in"}`,
  };
}

function emailPolicyError(domains, mode = registrationMode()) {
  if (mode === "testing") return "Enter a valid email address.";
  return `Use an exact student address at ${domains.map((domain) => `@${domain}`).join(" or ")}. A matching domain is not enrollment verification.`;
}

export function validateName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) {
    return "Enter your full name.";
  }
  if (!/^[\p{L}][\p{L}\s.'-]*$/u.test(name)) {
    return "Use letters in your name.";
  }
  return "";
}

export function validateUsn(value, { required = true } = {}) {
  const usn = String(value || "").trim().toUpperCase();
  if (!usn) {
    return required ? "Enter your USN using 5 to 20 letters or numbers." : "";
  }
  if (!/^[A-Z0-9]{5,20}$/.test(usn)) {
    return "Enter your USN using 5 to 20 letters or numbers.";
  }
  return "";
}

export function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 72) return "Use at most 72 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Use at least one letter and one number.";
  }
  return "";
}

export function validateRegistration(input, domains = configuredDomains(), mode = registrationMode()) {
  const errors = {};
  const nameError = validateName(input.name);
  const emailError = isAllowedCollegeEmail(input.email, domains, mode) ? "" : emailPolicyError(domains, mode);
  const passwordError = validatePassword(input.password);
  const usnError = validateUsn(input.usn, { required: mode !== "testing" });

  if (nameError) errors.name = nameError;
  if (emailError) errors.email = emailError;
  if (usnError) errors.usn = usnError;
  if (passwordError) errors.password = passwordError;
  if (input.password !== input.confirmPassword) {
    errors.confirmPassword = "Those passwords do not match.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
    name: String(input.name || "").trim().replace(/\s+/g, " "),
    email: emailParts(input.email)?.email || "",
    usn: String(input.usn || "").trim().toUpperCase(),
  };
}

export function validateLogin(input) {
  const errors = {};
  if (!isValidEmailAddress(input.email)) {
    errors.email = "Enter a valid email address.";
  }
  if (!input.password) errors.password = "Enter your password.";
  return {
    errors,
    valid: Object.keys(errors).length === 0,
    email: emailParts(input.email)?.email || "",
  };
}

const SAFE_NEXT = new Set(["/dashboard", "/reset-password"]);

export function safeNextPath(value) {
  return SAFE_NEXT.has(value) ? value : "/dashboard";
}

export function authRedirectUrl(nextPath) {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", safeNextPath(nextPath));
  return url.toString();
}
