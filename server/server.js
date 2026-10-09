import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = express();
const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; connect-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'",
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'
  });
  next();
});
app.use(express.static(pub));
app.use((req, res) => res.status(404).type('text').send('Not found'));
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST || '127.0.0.1';
export const server = app.listen(port, host, () => console.log(`Daydream.exe -> http://${host}:${server.address().port}`));
