import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createMessages } from "../src/i18n/messages.ts";
import { createContentMessages } from "../src/i18n/content-messages.ts";
import { authCopy, authLabels } from "../src/i18n/messages/auth.ts";
import { defaultMessageTemplates } from "../src/domain/message-templates.ts";

test("account actions, recovery and slip sharing use the agreed locale vocabulary", () => {
  const messages = createMessages("en");
  assert.equal(messages.text("auth.signIn"), "Login");
  assert.equal(messages.text("auth.signUp"), "Register");
  assert.equal(messages.text("auth.signOut"), "Log out");
  assert.equal(messages.text("auth.backToSignIn"), "Back to login");
  assert.equal(messages.text("slipShare.signIn"), authLabels.signIn);
  assert.equal(messages.text("account.signInDetails"), "Login details");
});

test("localized account, help, privacy and terms messages contain no retired wording", () => {
  const messages = createContentMessages("en");
  for (const key of ["account.description", "account.sessionLimitNotice", "account.otherDeviceSignedOut",
    "account.signInAssent", "account.signedOutBrowsing", "slipShare.publicHint", "slipConfigs.error.forbidden",
    "help.access.trial.body", "help.access.approval.body", "privacy.access.body", "privacy.access.cookie",
    "privacy.payments.messages", "terms.access.personal"]) {
    assert.doesNotMatch(messages.text(key), /\bsign(?:ed|ing)?[ -](?:in|out|up)\b/iu, key);
  }
});

test("default account notifications share the complete locale message", () => {
  for (const event of ["payment-approved", "payment-rejected", "credit-added", "subscription-renewed"]) {
    assert.equal(defaultMessageTemplates.events[event].sms, authCopy.accountUpdate);
  }
});

const vocabulary = /\b(?:sign(?:ed|ing)?[ -](?:in|out|up)|log(?:ged|ging)?[ -](?:in|out)|login|logout|register|registration)\b/iu;

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === "generated" || entry.name === "i18n") return [];
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(filename) : /\.tsx?$/u.test(entry.name) ? [filename] : [];
  });
}

test("application authentication copy is defined in locale files", () => {
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  const failures = [];
  for (const filename of sources(root)) {
    // Runtime-policy descriptions document deployment settings for developers.
    if (filename.endsWith(path.join("config", "runtime-policy.ts"))) continue;
    const content = readFileSync(filename, "utf8");
    if (!vocabulary.test(content)) continue;
    const source = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isTaggedTemplateExpression(node)) return; // CSS selectors are implementation identifiers.
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)
        || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        const text = node.text.trim();
        // Routes, event codes, view names and data attributes are stable program contracts.
        const identifier = !ts.isJsxText(node) && /^[a-z0-9_@./?:=&{}$*:-]+$/u.test(text);
        if (!identifier && vocabulary.test(text)) {
          const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          failures.push(`${path.relative(root, filename)}:${line}: ${text}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(failures, [], "Move authentication text into src/i18n/messages");
});
