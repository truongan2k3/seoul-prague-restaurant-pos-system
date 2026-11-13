/* eslint-disable @typescript-eslint/no-require-imports -- Execute the actual modules in a sandbox with fake transports. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

function modules(mocks = {}, globals = {}) {
  const cache = new Map();
  return function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule.exports);
    const source = fs.readFileSync(filename, 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }}).outputText;
    vm.runInNewContext(code, {
      module: loadedModule, exports: loadedModule.exports, Date, URL, Response, Request,
      Buffer, Promise, console, setTimeout, clearTimeout, AbortSignal,
      process: { env: {} }, ...globals,
      require(name) {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name.startsWith('@/')) {
          const resolved = name.slice(2);
          return load(fs.existsSync(`${resolved}.ts`) ? `${resolved}.ts` : `${resolved}.tsx`);
        }
        if (name.startsWith('.')) return load(path.join(path.dirname(filename), name));
        // Never silently load a live Supabase or Web Push transport.
        if (name === 'web-push' || name.includes('supabase')) throw Error(`Unmocked transport: ${name}`);
        return require(name);
      },
    }, { filename });
    return loadedModule.exports;
  };
}

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const id = '00000000-0000-4000-8000-000000000001';
const reservation = (changes = {}) => ({
  id, guestName: 'Notification test', partySize: 9,
  reservedAt: new Date('2026-11-13T18:00:00.000Z'), status: 'pending', source: 'online',
  createdAt: new Date('2026-11-13T12:00:00.000Z'), updatedAt: new Date('2026-11-13T12:00:00.000Z'),
  guestEmail: 'test@example.invalid', guestPhone: 'test-phone', notes: '', eventType: '',
  bookingCode: 'TEST', manageToken: 'fixture-token', ...changes,
});

module.exports = { modules, flush, reservation, id };
