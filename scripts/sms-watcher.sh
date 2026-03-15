#!/bin/bash
# Orbit SMS Watcher — runs in background, syncs every 2 minutes
cd "/Users/sovanshthakur/Documents/Work/Business/Indian Ecom Management Software proprietery/shopify-dashboard"
export ORBIT_URL="https://shopify-dashboard-taupe.vercel.app"
export ORBIT_TOKEN="orbit-sms-ingest-2026"

while true; do
  /opt/homebrew/bin/node scripts/sms-reader.mjs --days 1 >> ~/.orbit-sms-reader.log 2>&1
  sleep 120
done
