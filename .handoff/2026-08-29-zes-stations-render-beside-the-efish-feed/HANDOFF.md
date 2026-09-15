---
handoff_version: 1
id: 2026-08-29-zes-stations-render-beside-the-efish-feed
title: ZES stations render beside the efish feed
created_at: 2026-08-29T10:59:51.380Z
status: ready
breaking: false
generated_by: agents-handoff/0.1.0
source:
  project: efishmobileapp
  repo: bakibilici/efishmobileapp
  branch: tubitak-app
  commit: 11832b9
  range: origin/main...HEAD
targets:
  - backend
change_type:
  - feature
---

# ZES stations render beside the efish feed

## Summary

The mobile map now renders the Electrip (ZES) charge network — about 2,500 stations — alongside your feed. Devices fetch ZES data directly from `electrip-backend.electripglobal.com` (unauthenticated), cache it for 30 minutes, and cluster it client-side. Nothing changed in how the app consumes the efish backend.

## Why This Matters

A full-looking map no longer proves your feed works: ZES pins fill the screen even when `charge_areas_update` returns nothing, so an empty or broken efish feed is now invisible to casual QA. Users also now see stations efish does not operate.

## Changes

- Previous: the map drew only stations from the `charge_areas_update` WebSocket message.
- New: those stations are merged with the ZES network. ZES stations are flagged `isEfish: false` internally; the "Only efish" toggle now hides them.
- Charging sessions can only be started on efish sockets. ZES sockets are display-only.
- Consumption of your API is unchanged: WS bbox feed, `get_charge_area_detail`, and the HTTP charge-areas fallback all work as before.

## Required Actions

1. Verify `charge_areas_update` returns stations for central Istanbul bounding boxes. During integration testing it consistently returned zero stations there over a healthy authenticated connection. If the network genuinely has no stations there, no action; otherwise check the bbox filtering.
2. Add an operator/ownership field to station payloads (or confirm every station in your feed is efish-operated). The client currently hardcodes the distinction by data source, which breaks the "Only efish" filter the day your feed includes third-party stations.
3. Decide whether devices should keep calling Electrip directly or go through your backend as a proxy. Current reality: direct, unauthenticated, at most one full-network request per device per 30 minutes.

## Verification

With the app centred on Istanbul, enable "Only efish": every remaining pin must come from your feed. Send `update_bounding_box` for a central Istanbul viewport and confirm `charge_areas_update` carries stations for it.

## Instructions for Receiving Agent

Work inside the existing charge-areas WS producer and its serializers; do not build any station merging or clustering server-side — both already happen in the client. If you add an operator field, report its name and value set back so the client can adopt it, and do not rename existing fields: `socket_stats`, `lat`, `lng`, `type`, `uuid` are load-bearing in the client.

## Relevant Source

- `services/ElectripStationService.ts` — ZES fetch, normalisation, cache
- `hooks/useElectripStations.ts` — load/refresh lifecycle
- `services/stationClustering.ts` — client-side clustering
- `app/(tabs)/mainpage.tsx` — merge point of the two feeds

## Out of Scope

TestFlight/build mechanics, the react-native-maps native patch (internal to the app), and uncommitted interests/personalisation work on this branch.
