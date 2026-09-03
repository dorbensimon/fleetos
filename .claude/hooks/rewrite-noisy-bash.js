#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Detects noisy commands (test/build/typecheck
// runners) and reroutes them through run-and-trim.js so only a tail + summary
// reaches the model instead of the full raw log.
const fs = require('fs');
const os = require('os');
const path = require('path');

let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch (e) {
    process.exit(0);
  }

  const cmd = payload.tool_input && payload.tool_input.command;
  if (!cmd) process.exit(0);

  const noisy = /\bnpm\s+(run\s+)?(test|build)\b|\bnpx\s+tsc\b|\btsc\b|\bjest\b|\bvitest\b|\bpytest\b/i;
  if (!noisy.test(cmd)) process.exit(0);
  if (cmd.includes('run-and-trim.js')) process.exit(0); // already wrapped

  const tmpFile = path.join(os.tmpdir(), `claude-bash-cmd-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFileSync(tmpFile, cmd, 'utf-8');

  const wrapperPath = path.join(__dirname, 'run-and-trim.js');

  const result = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: {
        command: `node "${wrapperPath}" "${tmpFile}"`,
      },
    },
  };
  console.log(JSON.stringify(result));
  process.exit(0);
});
