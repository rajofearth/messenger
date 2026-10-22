import test from "node:test";
import assert from "node:assert/strict";
import { describeAuthFailure } from "./authErrors.ts";

test("an unknown username is reported as a missing account, not a bad password", () => {
  const failure = describeAuthFailure(
    new Error(
      "[Request ID: 488af15a73cf92c8] Server Error\nUncaught Error: InvalidAccountId",
    ),
    "signIn",
    "yashraj1",
  );
  assert.equal(failure.title, "Account not found");
  assert.equal(failure.missingAccount, true);
  assert.match(failure.message, /@yashraj1/);
  assert.doesNotMatch(failure.message, /InvalidAccountId|password/i);
});

test("the missing-account copy normalizes the username shown back to the user", () => {
  const failure = describeAuthFailure(
    new Error("InvalidAccountId"),
    "signIn",
    "  @Yashraj1 ",
  );
  assert.match(failure.message, /@yashraj1/);
  assert.doesNotMatch(failure.message, /@Yashraj1/);
});

test("a missing account during sign-up is not presented as an account lookup", () => {
  const failure = describeAuthFailure(
    new Error("InvalidAccountId"),
    "signUp",
    "yashraj1",
  );
  assert.equal(failure.title, "Could not create account");
  assert.equal(failure.missingAccount, false);
});

test("a wrong password is distinguished from a missing account", () => {
  const failure = describeAuthFailure(
    new Error("Uncaught Error: InvalidSecret"),
    "signIn",
    "yashraj1",
  );
  assert.equal(failure.title, "Could not sign in");
  assert.equal(failure.missingAccount, false);
  assert.match(failure.message, /password is incorrect/i);
});

test("rate limiting gets its own next step", () => {
  const failure = describeAuthFailure(
    new Error("Uncaught Error: TooManyFailedAttempts"),
    "signIn",
    "yashraj1",
  );
  assert.equal(failure.title, "Too many attempts");
  assert.equal(failure.missingAccount, false);
  assert.match(failure.message, /wait a few minutes/i);
});

test("an unrecognized error keeps its message", () => {
  const failure = describeAuthFailure(
    new Error("The network connection was lost."),
    "signIn",
    "yashraj1",
  );
  assert.equal(failure.title, "Could not sign in");
  assert.equal(failure.message, "The network connection was lost.");
  assert.equal(failure.missingAccount, false);
});

test("a non-error value gets a useful fallback", () => {
  const failure = describeAuthFailure("something odd", "signIn", "");
  assert.equal(failure.message, "Please try again.");
  assert.equal(failure.missingAccount, false);
});
