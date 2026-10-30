import assert from "node:assert/strict";
import test from "node:test";
import {
  emailFieldCopy,
  isAllowedCollegeEmail,
  isValidEmailAddress,
  registrationMode,
  validateLogin,
  validateRegistration,
} from "./validation.js";

const dsu = ["dsu.edu.in"];
const base = {
  name: "Test Student",
  usn: "SCA24CA0001",
  password: "Testpass1",
  confirmPassword: "Testpass1",
};

test("registrationMode treats anything except testing as production", () => {
  assert.equal(registrationMode("testing"), "testing");
  assert.equal(registrationMode("TESTING"), "testing");
  assert.equal(registrationMode("production"), "production");
  assert.equal(registrationMode(""), "production");
  assert.equal(registrationMode("open"), "production");
});

test("production accepts DSU addresses and rejects personal mail", () => {
  assert.equal(isAllowedCollegeEmail("student@dsu.edu.in", dsu, "production"), true);
  assert.equal(isAllowedCollegeEmail("student@gmail.com", dsu, "production"), false);
  assert.equal(isAllowedCollegeEmail("not-an-email", dsu, "production"), false);
});

test("testing email field copy uses a generic address label", () => {
  const testing = emailFieldCopy("testing", dsu);
  assert.equal(testing.label, "Email address");
  assert.equal(testing.placeholder, "Enter your email address");
  const production = emailFieldCopy("production", dsu);
  assert.equal(production.label, "DSU college email");
});

test("testing accepts any valid email and still rejects malformed values", () => {
  assert.equal(isValidEmailAddress("tester@gmail.com"), true);
  assert.equal(isAllowedCollegeEmail("tester@gmail.com", dsu, "testing"), true);
  assert.equal(isAllowedCollegeEmail("tester@outlook.com", dsu, "testing"), true);
  assert.equal(isAllowedCollegeEmail("student@dsu.edu.in", dsu, "testing"), true);
  assert.equal(isAllowedCollegeEmail("bad@", dsu, "testing"), false);
  assert.equal(isAllowedCollegeEmail("", dsu, "testing"), false);
});

test("registration validation follows the active mode", () => {
  const gmail = validateRegistration({ ...base, email: "tester@gmail.com" }, dsu, "testing");
  assert.equal(gmail.valid, true);
  const blocked = validateRegistration({ ...base, email: "tester@gmail.com" }, dsu, "production");
  assert.equal(blocked.valid, false);
  assert.match(blocked.errors.email, /@dsu.edu.in/);
});

test("testing registration allows a Gmail address without a USN", () => {
  const gmail = validateRegistration({ ...base, email: "mother@gmail.com", usn: "" }, dsu, "testing");
  assert.equal(gmail.valid, true);
  assert.equal(gmail.usn, "");
  const production = validateRegistration({ ...base, email: "student@dsu.edu.in", usn: "" }, dsu, "production");
  assert.equal(production.valid, false);
  assert.match(production.errors.usn, /USN/);
});

test("login validation accepts any valid email", () => {
  const gmail = validateLogin({ email: "tester@gmail.com", password: "x" });
  assert.equal(gmail.valid, true);
  const outlook = validateLogin({ email: "tester@outlook.com", password: "x" });
  assert.equal(outlook.valid, true);
  const malformed = validateLogin({ email: "bad@", password: "x" });
  assert.equal(malformed.valid, false);
  const missingPassword = validateLogin({ email: "tester@gmail.com", password: "" });
  assert.equal(missingPassword.valid, false);
});
