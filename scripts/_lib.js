// Scripts ke liye shared helpers (sirf local/cron par chalte hain, Vercel par nahi)
import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export function env(name, required = true) {
  const v = process.env[name];
  if (required && !v) {
    console.error(`Missing env: ${name} (.env file check karo)`);
    process.exit(1);
  }
  return v;
}

export const db = createClient(
  env('NEXT_PUBLIC_SUPABASE_URL'),
  env('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// TMDB GET with retry (429 / 5xx)
export async function tmdb(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  // Dono chalte hain: lambi Read Access Token (Bearer) ya chhoti 32-char API key
  const token = env('TMDB_TOKEN').trim();
  const headers = { accept: 'application/json' };
  if (/^[a-f0-9]{32}$/i.test(token)) url.searchParams.set('api_key', token);
  else headers.Authorization = `Bearer ${token}`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || attempt * 1500;
      await sleep(wait);
      continue;
    }
    throw new Error(`TMDB ${res.status} ${path}: ${await res.text()}`);
  }
  throw new Error(`TMDB failed after retries: ${path}`);
}

// Simple concurrency pool
export async function pool(items, limit, worker) {
  let i = 0;
  let done = 0;
  const total = items.length;
  async function next() {
    while (i < total) {
      const idx = i++;
      try {
        await worker(items[idx], idx);
      } catch (e) {
        console.error(`  ✗ item ${JSON.stringify(items[idx]).slice(0, 60)}: ${e.message}`);
      }
      done++;
      if (done % 50 === 0 || done === total) console.log(`  ${done}/${total}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, total) }, next));
}

export function slugify(str) {
  return String(str || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function hash(obj) {
  return crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}

export async function upsert(table, rows, onConflict) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
  }
}

// Supabase select with pagination (1000 row limit bypass)
export async function selectAll(table, columns, build = (q) => q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(db.from(table).select(columns)).range(from, from + 999);
    if (error) throw new Error(`${table} select: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
}

// Raw API responses sirf --raw=1 par save hote hain (Supabase free tier 500MB bachane ke liye)
export async function saveRaw(kind, id, payload) {
  if (!process.argv.includes('--raw=1')) return;
  await upsert('raw_tmdb', [{ kind, tmdb_id: id, payload, fetched_at: new Date().toISOString() }], 'kind,tmdb_id');
}
