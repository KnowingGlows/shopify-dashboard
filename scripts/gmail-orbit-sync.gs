/**
 * Orbit SMS/Email Sync — Google Apps Script
 *
 * Reads HDFC bank transaction emails/SMS from Gmail
 * and sends them to Orbit's /api/transactions endpoint.
 *
 * SETUP:
 * 1. Go to https://script.google.com
 * 2. Create a new project, name it "Orbit SMS Sync"
 * 3. Paste this entire file into Code.gs
 * 4. Click Run → run "setup" function (grants permissions)
 * 5. Done! It auto-runs every 2 minutes.
 *
 * To stop: Run the "removeTrigger" function
 * To test: Run the "sync" function manually
 */

// ══════════════════════════════════════════════════════════════════════
// CONFIG — edit these
// ══════════════════════════════════════════════════════════════════════

const ORBIT_URL = 'https://shopify-dashboard-taupe.vercel.app';
const API_KEY = 'orbit-sms-ingest-2026';

// Gmail search queries for HDFC messages
// Covers both SMS forwards and direct bank emails
const GMAIL_QUERIES = [
  'from:alerts@hdfcbank.net newer_than:1d',
  'from:noreply@hdfcbank.com newer_than:1d',
  'subject:HDFC (debited OR credited OR spent OR purchase) newer_than:1d',
  '"HDFC" ("debited" OR "credited" OR "Rs.") newer_than:1d -label:orbit-processed',
];

// ══════════════════════════════════════════════════════════════════════
// SETUP & TRIGGERS
// ══════════════════════════════════════════════════════════════════════

function setup() {
  // Remove existing triggers
  removeTrigger();

  // Create label for tracking processed messages
  var label = GmailApp.getUserLabelByName('orbit-processed');
  if (!label) {
    label = GmailApp.createLabel('orbit-processed');
  }

  // Set up 2-minute trigger
  ScriptApp.newTrigger('sync')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('✅ Setup complete! Orbit sync runs every 2 minutes.');
  Logger.log('   Label "orbit-processed" created for tracking.');

  // Run initial sync
  sync();
}

function removeTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sync') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  Logger.log('All sync triggers removed.');
}

// ══════════════════════════════════════════════════════════════════════
// MAIN SYNC
// ══════════════════════════════════════════════════════════════════════

function sync() {
  var processedLabel = GmailApp.getUserLabelByName('orbit-processed');
  if (!processedLabel) {
    processedLabel = GmailApp.createLabel('orbit-processed');
  }

  var allMessages = [];
  var threadsToLabel = [];

  // Search across all queries
  for (var q = 0; q < GMAIL_QUERIES.length; q++) {
    try {
      var threads = GmailApp.search(GMAIL_QUERIES[q], 0, 50);

      for (var t = 0; t < threads.length; t++) {
        var thread = threads[t];

        // Skip already processed
        var labels = thread.getLabels();
        var alreadyProcessed = false;
        for (var l = 0; l < labels.length; l++) {
          if (labels[l].getName() === 'orbit-processed') {
            alreadyProcessed = true;
            break;
          }
        }
        if (alreadyProcessed) continue;

        var messages = thread.getMessages();
        for (var m = 0; m < messages.length; m++) {
          var msg = messages[m];
          var body = msg.getPlainBody() || msg.getBody().replace(/<[^>]*>/g, ' ');
          var subject = msg.getSubject();
          var sender = msg.getFrom();
          var text = subject + ' ' + body;

          // Only process if it looks like an HDFC transaction
          if (isHDFCTransaction(text)) {
            allMessages.push({
              text: cleanText(text),
              sender: sender,
              date: msg.getDate().toISOString(),
            });
          }
        }

        threadsToLabel.push(thread);
      }
    } catch (e) {
      Logger.log('Search error for query ' + q + ': ' + e.message);
    }
  }

  if (allMessages.length === 0) {
    Logger.log('No new HDFC messages found.');
    return;
  }

  Logger.log('Found ' + allMessages.length + ' new HDFC messages.');

  // Send to Orbit
  var success = sendToOrbit(allMessages);

  // Label threads as processed if API call succeeded
  if (success) {
    for (var i = 0; i < threadsToLabel.length; i++) {
      threadsToLabel[i].addLabel(processedLabel);
    }
    Logger.log('Labeled ' + threadsToLabel.length + ' threads as processed.');
  }
}

// ══════════════════════════════════════════════════════════════════════
// HDFC DETECTION
// ══════════════════════════════════════════════════════════════════════

function isHDFCTransaction(text) {
  var hasHDFC = /hdfc/i.test(text);
  var hasAmount = /(?:Rs\.?|INR)\s*[\d,]+/i.test(text);
  var hasAction = /(?:debited|credited|spent|purchase|withdrawn|deposited|received|sent|transferred|payment)/i.test(text);

  return hasHDFC && hasAmount && hasAction;
}

function cleanText(text) {
  // Remove excessive whitespace, newlines, HTML artifacts
  return text
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
    .substring(0, 500); // Cap length
}

// ══════════════════════════════════════════════════════════════════════
// API
// ══════════════════════════════════════════════════════════════════════

function sendToOrbit(messages) {
  var url = ORBIT_URL + '/api/transactions?key=' + API_KEY;

  var payload = {
    action: 'ingest',
    messages: messages,
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code === 200) {
      var result = JSON.parse(body);
      Logger.log('✅ Sent to Orbit: ' + result.results.parsed + ' new, ' +
                 result.results.duplicates + ' duplicates, ' +
                 result.results.skipped + ' skipped');
      return true;
    } else {
      Logger.log('❌ API error ' + code + ': ' + body);
      return false;
    }
  } catch (e) {
    Logger.log('❌ Failed to reach Orbit: ' + e.message);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════
// MANUAL TOOLS
// ══════════════════════════════════════════════════════════════════════

// Run this to reprocess all messages (removes the orbit-processed label)
function resetProcessed() {
  var label = GmailApp.getUserLabelByName('orbit-processed');
  if (!label) {
    Logger.log('No orbit-processed label found.');
    return;
  }

  var threads = label.getThreads();
  for (var i = 0; i < threads.length; i++) {
    threads[i].removeLabel(label);
  }
  Logger.log('Reset ' + threads.length + ' threads. Run sync() to reprocess.');
}

// Run this to do a deeper backfill (last 30 days)
function backfill() {
  var processedLabel = GmailApp.getUserLabelByName('orbit-processed');
  if (!processedLabel) {
    processedLabel = GmailApp.createLabel('orbit-processed');
  }

  var query = '"HDFC" ("debited" OR "credited" OR "Rs.") newer_than:30d -label:orbit-processed';
  var allMessages = [];
  var threadsToLabel = [];

  try {
    var threads = GmailApp.search(query, 0, 200);
    Logger.log('Backfill: found ' + threads.length + ' threads.');

    for (var t = 0; t < threads.length; t++) {
      var messages = threads[t].getMessages();
      for (var m = 0; m < messages.length; m++) {
        var msg = messages[m];
        var text = (msg.getSubject() || '') + ' ' + (msg.getPlainBody() || msg.getBody().replace(/<[^>]*>/g, ' '));

        if (isHDFCTransaction(text)) {
          allMessages.push({
            text: cleanText(text),
            sender: msg.getFrom(),
            date: msg.getDate().toISOString(),
          });
        }
      }
      threadsToLabel.push(threads[t]);
    }
  } catch (e) {
    Logger.log('Backfill search error: ' + e.message);
  }

  if (allMessages.length === 0) {
    Logger.log('No messages to backfill.');
    return;
  }

  Logger.log('Backfilling ' + allMessages.length + ' messages...');

  // Send in batches of 50
  for (var i = 0; i < allMessages.length; i += 50) {
    var batch = allMessages.slice(i, i + 50);
    var success = sendToOrbit(batch);
    if (!success) break;
    Utilities.sleep(1000); // Rate limit
  }

  // Label as processed
  for (var j = 0; j < threadsToLabel.length; j++) {
    threadsToLabel[j].addLabel(processedLabel);
  }

  Logger.log('Backfill complete.');
}

// Test function — check if connection to Orbit works
function testConnection() {
  var url = ORBIT_URL + '/api/transactions?key=' + API_KEY + '&action=list&limit=1';

  try {
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    Logger.log('Status: ' + response.getResponseCode());
    Logger.log('Response: ' + response.getContentText().substring(0, 200));
  } catch (e) {
    Logger.log('Connection failed: ' + e.message);
  }
}
