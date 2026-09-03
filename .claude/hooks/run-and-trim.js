#!/usr/bin/env node
// Runs the original command, captures full output to a temp log file, and
// prints only a tail + summary so noisy test/build output doesn't flood context.
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cmdFile = process.argv[2];
const cmd = fs.readFileSync(cmdFile, 'utf-8');
fs.unlinkSync(cmdFile);

const TAIL = 80;
let output = '';
let exitCode = 0;
try {
  output = execSync(cmd + ' 2>&1', { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 });
} catch (e) {
  output = e.stdout || '';
  exitCode = typeof e.status === 'number' ? e.status : 1;
}

const logFile = path.join(os.tmpdir(), `claude-bash-log-${Date.now()}.txt`);
fs.writeFileSync(logFile, output, 'utf-8');

const lines = output.split('\n');
console.log(`[trimmed by run-and-trim.js] exit=${exitCode} total_lines=${lines.length} full_log=${logFile}`);
if (lines.length > TAIL) {
  console.log(`--- last ${TAIL} lines (read ${logFile} for the rest) ---`);
  console.log(lines.slice(-TAIL).join('\n'));
} else {
  console.log(output);
}
process.exit(exitCode);
