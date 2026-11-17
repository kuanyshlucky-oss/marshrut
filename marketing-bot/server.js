// Бот «Маркетолог JetisHUB»: локальный сервер. Запуск: npm start (см. README.md)
// Ключ ANTHROPIC_API_KEY читается из файла .env и никогда не уходит в браузер.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { BASE, MODE_A, MODE_B, VIDEO } from './prompts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3010;
const MODEL = process.env.MARKETING_BOT_MODEL || 'claude-opus-5-5';
const MAX_BODY = 512 * 1024;          // защита: размер запроса
const MAX_MESSAGES = 40;              // защита: длина переписки

const client = new Anthropic();       // ключ берётся из окружения (ANTHROPIC_API_KEY)

const MODES = { A: MODE_A, B: MODE_B, FREE: '' };

function systemFor(mode, withVideo) {
  const parts = [BASE];
  if (MODES[mode]) parts.push(MODES[mode]);
  if (withVideo) parts.push(VIDEO);
  return parts.join('\n\n');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(new Error('Слишком большой запрос')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sse(res, event, data) { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }

async function handleChat(req, res) {
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { res.writeHead(400).end('Некорректный JSON'); return; }
  const { mode = 'FREE', withVideo = false, messages } = body;
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES
      || messages.some((m) => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim())
      || messages[messages.length - 1].role !== 'user') {
    res.writeHead(400).end('Некорректная переписка'); return;
  }

  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const ac = new AbortController();
  res.on('close', () => ac.abort());   // закрыл вкладку или нажал «Стоп» — прекращаем (и не тратим токены)

  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system: systemFor(mode, withVideo),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      cache_control: { type: 'ephemeral' },              // системный промт кешируется между сообщениями
      betas: ['server-side-fallback-2026-07-01'],        // при отказе по политике запрос сам перезапускается на запасной модели
      fallbacks: 'default',
    }, { signal: ac.signal });

    let started = false;
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        started = true;
        sse(res, 'text', ev.delta.text);
      } else if (!started && ev.type === 'content_block_start' && ev.content_block.type === 'thinking') {
        sse(res, 'status', 'думаю…');
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') sse(res, 'error', 'Модель отказалась отвечать на этот запрос. Переформулируйте задачу (например, без обещаний гранта и личных данных).');
    else if (final.stop_reason === 'max_tokens') sse(res, 'note', 'Ответ обрезан по длине. Напишите «продолжи».');
    sse(res, 'usage', { input: final.usage.input_tokens, output: final.usage.output_tokens, cacheRead: final.usage.cache_read_input_tokens || 0 });
    sse(res, 'done', {});
  } catch (err) {
    if (ac.signal.aborted) { res.end(); return; }
    let msg = 'Ошибка при обращении к Claude.';
    if (err instanceof Anthropic.AuthenticationError) msg = 'Ключ API не принят. Проверьте ANTHROPIC_API_KEY в файле .env и перезапустите бота.';
    else if (err instanceof Anthropic.PermissionDeniedError) msg = 'У ключа нет доступа к этой модели.';
    else if (err instanceof Anthropic.RateLimitError) msg = 'Слишком много запросов. Подождите минуту и повторите.';
    else if (err instanceof Anthropic.APIConnectionError) msg = 'Нет связи с Claude API. Проверьте интернет.';
    else if (/authentication method|apiKey|API key/i.test(String(err.message)) && !(err instanceof Anthropic.APIError)) msg = 'Ключ API не найден. Создайте файл .env с ANTHROPIC_API_KEY (см. README.md) и перезапустите бота.';
    else if (err instanceof Anthropic.APIError) msg = `Ошибка API (${err.status}): ${err.message}`;
    console.error('[chat]', err.status || '', err.message);
    sse(res, 'error', msg);
  } finally {
    res.end();
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/api/chat') return handleChat(req, res);
  if (req.method === 'GET' && url.pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ model: MODEL, hasKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) }));
  }
  if (req.method === 'GET') {
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.join(here, 'public', rel);
    if (!file.startsWith(path.join(here, 'public'))) { res.writeHead(403).end(); return; }
    try {
      const data = fs.readFileSync(file);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      return res.end(data);
    } catch { /* ниже 404 */ }
  }
  res.writeHead(404).end('not found');
});

// Только этот компьютер: наружу бот не открывается, чужие не смогут тратить ваш ключ.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Маркетолог JetisHUB: http://localhost:${PORT}  (модель ${MODEL})`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) console.log('ВНИМАНИЕ: ANTHROPIC_API_KEY не задан. Создайте файл .env (см. README.md).');
});
