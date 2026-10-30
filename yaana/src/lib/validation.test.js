import assert from "node:assert/strict";
import test from "node:test";
import {
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

test("login validation follows the active mode", () => {
  const testing = validateLogin({ email: "tester@gmail.com", password: "x" }, dsu, "testing");
  assert.equal(testing.valid, true);
  const production = validateLogin({ email: "tester@gmail.com", password: "x" }, dsu, "production");
  assert.equal(production.valid, false);
});
