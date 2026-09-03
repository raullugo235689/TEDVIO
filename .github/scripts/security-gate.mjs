#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const ignored = new Set([
  '.github/scripts/security-gate.mjs',
  'package-lock.json',
  'apps/teacher-v2/package-lock.json',
]);

const binaryExtensions = /\.(?:avif|eot|gif|ico|jpe?g|mp3|mp4|ogg|otf|pdf|png|ttf|webm|webp|woff2?|zip)$/i;
const rules = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub token', /gh(?:p|o|u|s|r)_[A-Za-z0-9]{30,}/],
  ['OpenAI secret', /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ['Supabase secret', /sb_(?:secret|service_role)_[A-Za-z0-9_-]{20,}/i],
  ['Supabase service role assignment', /SUPABASE_SERVICE_ROLE(?:_KEY)?\s*[:=]\s*['\"]?[A-Za-z0-9._-]{20,}/i],
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['generic committed password', /(?:password|passwd|pwd)\s*[:=]\s*['\"][^'\"\s]{12,}['\"]/i],
  ['static teacher access-code seed', /teacher_access_codes[\s\S]*digest\(\s*['\"][^'\"]+['\"]\s*,\s*['\"]sha256['\"]/i],
];

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((file) => !ignored.has(file) && !binaryExtensions.test(file));

const findings = [];

for (const file of trackedFiles) {
  let contents;
  try {
    contents = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  if (contents.includes('\0')) continue;

  contents.split(/\r?\n/).forEach((line, index) => {
    for (const [name, pattern] of rules) {
      if (pattern.test(line)) findings.push(`${file}:${index + 1} — ${name}`);
    }
  });
}

if (findings.length) {
  console.error('Potential secrets detected. Values are intentionally redacted:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  console.error('\nRemove and rotate every confirmed credential before continuing.');
  process.exit(1);
}

console.log(`Secret scan passed across ${trackedFiles.length} tracked text files.`);
