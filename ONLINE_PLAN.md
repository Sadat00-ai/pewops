# PewOps online plan (not built yet)

This file records the decisions for the next stages: accounts, analytics and a side-view online mode.
Nothing here is in the game yet.

## What is needed from the owner
- A free Cloudflare account, and an API token with Workers and D1 edit rights stored as a GitHub secret.
  With that, the server deploys itself from GitHub Actions. No server has to be run by hand.
- Optional: a Google Play Console account to see install numbers (Play Console is the only place that shows downloads from the store).

## Chosen design
| Part | Choice | Why |
|---|---|---|
| Accounts, leaderboard, cloud save | Cloudflare Worker + D1 database | Free tier is enough for a small game and nothing to keep running |
| Analytics (users, active players, matches) | Same Worker, own dashboard page for the owner | Owner has full access, no third-party tracker |
| Downloads | GitHub release download counts (this repo) and Google Play Console | Neither can be counted inside the game |
| Real-time matches | Peer-to-peer (WebRTC) with a host phone, Cloudflare Worker only for matchmaking | Gameplay traffic costs nothing, so the free tier does not shrink as players grow |
| Fallback when two phones cannot connect directly | Cloudflare TURN relay | Free for the first 1,000 GB per month |

## Why not an always-running game server
Cloudflare Durable Objects (the usual way to host a WebSocket game room) have a free limit of 100,000 requests and
13,000 GB-seconds of duration per day. A room that stays connected uses about 450 GB-seconds per hour, so the free
plan covers roughly 29 room-hours a day. That is fine to start with but it is a hard ceiling; peer-to-peer avoids it.
Free virtual machines elsewhere were not chosen: they need a card, a hand-run server, and their free terms change.

## Latency in Bangladesh
No major cloud has a region in Bangladesh; the nearest are Mumbai and Singapore. Peer-to-peer lets two players on
nearby networks talk directly, which is often faster than going through either city. Cloudflare has data centers in
Dhaka and Chittagong for the matchmaking calls. Some Bangladeshi ISPs route traffic to Cloudflare through other
countries, so real-world results will vary and must be tested on real phones.

## Stages
1. Intro animation and display settings (done in 2.4.0).
2. Side-view arena mode (offline): gravity, jetpack, platform maps, bots. Playable without an account.
3. Accounts, leaderboard, cloud save and the owner's analytics page.
4. Online matches for the side-view mode.

## Limits to know about
- Host-based matches can be cheated by the host. This is acceptable for casual play, not for ranked play.
- If the host leaves, the match ends.
- Real HDR output is not available to a web canvas on Android; the game has an "HDR-style color" look instead.
- Accounts need a privacy-policy update and an in-app "delete my account" option before a Play Store release.
