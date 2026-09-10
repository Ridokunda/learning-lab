const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const url = 'http://127.0.0.1:4173';
async function ready() { try { const r = await fetch(url + '/api/config', { signal: AbortSignal.timeout(1000) }); return r.ok && (await r.json()).app === 'learning-lab'; } catch { return false; } }
(async () => {
  if (!await ready()) {
    const dir = path.join(__dirname, '.local'); fs.mkdirSync(dir, { recursive: true });
    const log = fs.openSync(path.join(dir, 'server.log'), 'a');
    const child = spawn(process.execPath, [path.join(__dirname, 'server.cjs')], { cwd: __dirname, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
    child.unref(); fs.closeSync(log);
    for (let i=0; i<30 && !await ready(); i++) await new Promise(resolve=>setTimeout(resolve,200));
  }
  if (!await ready()) throw Error('Could not start Learning Lab. Check .local/server.log or whether port 4173 is in use.');
  // Windows launcher opens only the fixed local app URL.
  if (!process.argv.includes('--no-open')) {
    const opener = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-Command', "Start-Process 'http://127.0.0.1:4173'"], { windowsHide: true, stdio: 'ignore' });
    opener.on('error', () => console.log('Open ' + url + ' in your browser.'));
  }
  console.log('Learning Lab is ready: ' + url);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
