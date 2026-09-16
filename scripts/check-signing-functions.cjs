// Local fallback when Deno is unavailable. Checks our function code against
// the installed Supabase JS types; does not replace a Deno deployment check.
const ts = require('typescript');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const names = ['assign-signing-template', 'get-signing-session', 'rename-signing-template', 'process-signing-expiry', 'process-signing-email-reminders', 'resend-signing-request', 'import-docuseal-templates', 'sync-signing-request'];
const shim = path.join(root, 'scripts/__deno_check__.d.ts');
const shimText = 'declare namespace Deno { const env: { get(name: string): string | undefined }; function serve(handler: (req: Request) => Response | Promise<Response>): void; }';
const options = { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true, types: [], lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'] };
const host = ts.createCompilerHost(options);
const originalGetSource = host.getSourceFile.bind(host);
host.getSourceFile = (file, languageVersion, ...args) => file === shim ? ts.createSourceFile(file, shimText, languageVersion) : originalGetSource(file, languageVersion, ...args);
host.resolveModuleNames = (modules, containingFile) => modules.map(name => {
  if (name.startsWith('https://esm.sh/@supabase/supabase-js@')) name = '@supabase/supabase-js';
  return ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
});
const program = ts.createProgram([shim, ...names.map(name => path.join(root, 'supabase/functions', name, 'index.ts'))], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
  process.exitCode = 1;
} else console.log(`Checked ${names.length} signing functions with local TypeScript/Supabase types.`);
