#!/usr/bin/env node

/**
 * Orbit SMS Reader — Mac Messages.app → Orbit Auto-Ingest
 *
 * Reads SMS messages from the macOS Messages app SQLite database,
 * filters for HDFC bank transaction messages, and sends them to
 * Orbit's /api/transactions endpoint for auto-categorization.
 *
 * Usage:
 *   node scripts/sms-reader.mjs                  # one-time sync (last 24h)
 *   node scripts/sms-reader.mjs --days 7         # sync last 7 days
 *   node scripts/sms-reader.mjs --watch           # poll every 2 minutes
 *   node scripts/sms-reader.mjs --watch --interval 60  # poll every 60 seconds
 *
 * Requirements:
 *   - macOS with iMessage/SMS forwarding enabled
 *   - Full Disk Access granted to Terminal (System Settings → Privacy & Security → Full Disk Access)
 *   - Orbit running locally or set ORBIT_URL env var
 *
 * Environment:
 *   ORBIT_URL    — Base URL of Orbit (default: http://localhost:3000)
 *   ORBIT_TOKEN  — Optional auth token for the API
 */

import { existsSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';
import Database from 'better-sqlite3';

// ── Config ───────────────────────────────────────────────────────────

const ORBIT_URL = process.env.ORBIT_URL || 'http://localhost:3000';
const ORBIT_TOKEN = process.env.ORBIT_TOKEN || '';
const MESSAGES_DB = resolve(homedir(), 'Library/Messages/chat.db');

// Parse CLI args
const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const daysIdx = args.indexOf('--days');
const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) || 1 : 1;
const intervalIdx = args.indexOf('--interval');
const pollIntervalSec = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1]) || 120 : 120;

// HDFC sender IDs — Messages.app stores these in the `handle` table
const HDFC_SENDERS = [
  'hdfcbank', 'hdfcbk', 'hdfc', 'hdfccc',
  'ad-hdfcbk', 'vm-hdfcbk', 'am-hdfcbk',
  'ad-hdfccc', 'vm-hdfccc',
  'bz-hdfcbk', 'bt-hdfcbk', 'jd-hdfcbk',
];

// Track last processed message ROWID to avoid re-processing
let lastProcessedRowId = 0;

// ── Database ─────────────────────────────────────────────────────────

function openDb() {
  if (!existsSync(MESSAGES_DB)) {
    console.error('❌ Messages database not found at:', MESSAGES_DB);
    console.error('   Make sure iMessage/SMS forwarding is enabled on your Mac.');
    process.exit(1);
  }

  try {
    return new Database(MESSAGES_DB, { readonly: true, fileMustExist: true });
  } catch (err) {
    console.error('❌ Cannot open Messages database.');
    console.error('   Grant Full Disk Access to Terminal:');
    console.error('   System Settings → Privacy & Security → Full Disk Access → + Terminal');
    console.error('   Error:', err.message);
    process.exit(1);
  }
}

function fetchMessages(db, sinceDays, sinceRowId = 0) {
  // Messages.app stores dates as "Apple epoch" — seconds since 2001-01-01
  // Convert to Unix epoch offset
  const APPLE_EPOCH_OFFSET = 978307200; // seconds between 1970-01-01 and 2001-01-01
  const sinceTimestamp = (Math.floor(Date.now() / 1000) - sinceDays * 86400 - APPLE_EPOCH_OFFSET) * 1e9;

  const query = `
    SELECT
      m.ROWID,
      m.text,
      m.date as message_date,
      m.is_from_me,
      h.id as sender_id
    FROM message m
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    WHERE m.text IS NOT NULL
      AND m.is_from_me = 0
      AND m.date > ?
      AND m.ROWID > ?
    ORDER BY m.ROWID ASC
  `;

  return db.prepare(query).all(sinceTimestamp, sinceRowId);
}

function isHDFCMessage(msg) {
  const senderId = (msg.sender_id || '').toLowerCase();
  const text = (msg.text || '').toLowerCase();

  // Check sender
  if (HDFC_SENDERS.some((s) => senderId.includes(s))) return true;

  // Fallback: check message content
  if (text.includes('hdfc') && /(?:debited|credited|spent|purchase|withdrawn|deposited)/i.test(msg.text)) {
    return true;
  }

  return false;
}

// ── API ──────────────────────────────────────────────────────────────

async function sendToOrbit(messages) {
  const url = `${ORBIT_URL}/api/transactions`;
  const headers = {
    'Content-Type': 'application/json',
  };
  if (ORBIT_TOKEN) {
    headers['Authorization'] = `Bearer ${ORBIT_TOKEN}`;
  }

  const payload = {
    action: 'ingest',
    messages: messages.map((m) => ({
      text: m.text,
      sender: m.sender_id,
      date: m.message_date,
    })),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ API error ${res.status}:`, errText);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error('❌ Failed to reach Orbit:', err.message);
    console.error(`   Make sure Orbit is running at ${ORBIT_URL}`);
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function sync() {
  const db = openDb();

  try {
    const allMessages = fetchMessages(db, days, lastProcessedRowId);
    const hdfcMessages = allMessages.filter(isHDFCMessage);

    if (hdfcMessages.length === 0) {
      console.log(`   No new HDFC messages found.`);
      return;
    }

    // Update last processed ROWID
    const maxRowId = Math.max(...hdfcMessages.map((m) => m.ROWID));

    console.log(`📨 Found ${hdfcMessages.length} HDFC messages (of ${allMessages.length} total)`);

    // Send in batches of 50
    const BATCH_SIZE = 50;
    let totalParsed = 0;
    let totalSkipped = 0;
    let totalDuplicates = 0;

    for (let i = 0; i < hdfcMessages.length; i += BATCH_SIZE) {
      const batch = hdfcMessages.slice(i, i + BATCH_SIZE);
      const result = await sendToOrbit(batch);

      if (result?.success) {
        totalParsed += result.results.parsed;
        totalSkipped += result.results.skipped;
        totalDuplicates += result.results.duplicates;
      }
    }

    lastProcessedRowId = maxRowId;

    console.log(`✅ Processed: ${totalParsed} new | ${totalDuplicates} duplicates | ${totalSkipped} non-transaction`);
  } finally {
    db.close();
  }
}

async function run() {
  console.log('');
  console.log('🛰️  Orbit SMS Reader');
  console.log(`   Target: ${ORBIT_URL}`);
  console.log(`   Database: ${MESSAGES_DB}`);
  console.log('');

  if (isWatch) {
    console.log(`👀 Watch mode — polling every ${pollIntervalSec}s`);
    console.log('   Press Ctrl+C to stop');
    console.log('');

    // Initial full sync
    console.log(`🔄 Initial sync (last ${days} day${days > 1 ? 's' : ''})...`);
    await sync();

    // Then poll for new messages
    setInterval(async () => {
      const now = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
      console.log(`\n🔄 [${now}] Checking for new messages...`);
      await sync();
    }, pollIntervalSec * 1000);
  } else {
    console.log(`🔄 Syncing last ${days} day${days > 1 ? 's' : ''}...`);
    await sync();
    console.log('\nDone! Run with --watch for continuous polling.');
  }
}

run().catch(console.error);
