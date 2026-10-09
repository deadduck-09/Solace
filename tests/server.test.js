import test from 'node:test';
import assert from 'node:assert';
process.env.PORT = '0';
const { server } = await import('../server/server.js');
if (!server.listening) await new Promise((r) => server.once('listening', r));
test('serves homepage and module, 404s unknown routes, binds to loopback', async () => {
  const { port, address } = server.address(); assert.strictEqual(address, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const h = await fetch(base + '/'); assert.strictEqual(h.status, 200); assert.match(await h.text(), /Daydream/);
  assert.strictEqual((await fetch(base + '/js/app.js')).status, 200);
  assert.strictEqual((await fetch(base + '/nope')).status, 404);
  server.closeAllConnections?.(); server.close();
});
