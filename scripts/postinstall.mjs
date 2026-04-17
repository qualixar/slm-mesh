#!/usr/bin/env node
/**
 * SLM Mesh — Post-install: auto-setup skills for supported platforms.
 * Runs after `npm install -g slm-mesh`.
 *
 * SAFETY RULES:
 * - NEVER overwrite existing files (skip if file exists)
 * - NEVER modify existing config files
 * - NEVER break if a platform isn't installed
 * - Only CREATE new files in expected directories
 * - Every operation wrapped in try/catch
 * - Silent exit on any error (don't break npm install)
 *
 * Copyright 2026 Varun Pratap Bhardwaj. Elastic-2.0.
 */

import { mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsDir = join(__dirname, '..', 'skills');
const home = homedir();

// Silent exit if skills folder missing (CI, partial install)
if (!existsSync(skillsDir)) process.exit(0);

const skills = readdirSync(skillsDir).filter(f => f.endsWith('.md'));
if (skills.length === 0) process.exit(0);

// ─── Claude Code: ~/.claude/commands/ ───
// These are slash commands. Only copies files that don't already exist.
try {
  const claudeDir = join(home, '.claude', 'commands');
  mkdirSync(claudeDir, { recursive: true });
  let count = 0;
  for (const skill of skills) {
    const target = join(claudeDir, skill);
    if (!existsSync(target)) {
      copyFileSync(join(skillsDir, skill), target);
      count++;
    }
  }
  if (count > 0) {
    console.log(`  slm-mesh: ${count} slash commands installed to ~/.claude/commands/`);
    console.log('            Type /mesh-peers, /mesh-send, /mesh-lock in any Claude Code session.');
  }
} catch {
  // Skip silently — don't break npm install
}

// ─── Summary ───
console.log('');
console.log('  slm-mesh: Setup complete.');
console.log('  Add to Claude Code:  claude mcp add --scope user slm-mesh -- npx slm-mesh');
console.log('  Add to Cursor/Windsurf/VS Code:');
console.log('    { "mcpServers": { "slm-mesh": { "command": "npx", "args": ["slm-mesh"] } } }');
console.log('  Docs: https://github.com/qualixar/slm-mesh');

console.log('────────────────────────────────────────────────────────────');
console.log('  ⭐ Help us grow!');
console.log('  If this saves you time, please star the repo:');
console.log('    https://github.com/qualixar/slm-mesh');
console.log('  Part of the Qualixar AI Agent Reliability Platform:');
console.log('    https://qualixar.com  (7 OSS products, 19K+ monthly downloads)');
console.log('────────────────────────────────────────────────────────────\n');
