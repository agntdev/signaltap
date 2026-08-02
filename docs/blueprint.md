# Pocket Options Signal Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that delivers Pocket Options trade signals as push notifications with per-signal opt-in. Admins create signals via an authenticated account, and subscribers receive opt-in prompts with inline buttons to accept/decline each signal. The bot tracks opt-in history, timezones, and stake preferences while sending admin summaries of opt-in activity.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- retail traders
- Telegram users
- signal subscribers

## Success criteria

- Subscribers receive signals only after opting in via inline buttons
- Admin receives post-broadcast summary of opt-in counts and errors
- User can view last 10 signals and their opt-in history

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with opt-in options and settings
- **/signals** (command, actor: user, command: /signals) — View last 10 signals with summaries
- **/history** (command, actor: user, command: /history) — View personal opt-in history for signals
- **/set_timezone** (command, actor: user, command: /set_timezone) — Set personal timezone for timestamp conversion
- **Opt in** (button, actor: user, callback: signal:opt_in:${signal_id}) — Confirm subscription to current signal
  - inputs: signal_id
  - outputs: signal message delivery
- **Ignore** (button, actor: user, callback: signal:ignore:${signal_id}) — Decline current signal
  - inputs: signal_id
  - outputs: no further action for this signal

## Flows

### signal_broadcast
_Trigger:_ admin creates signal

1. Admin sends structured signal message
2. Bot queues opt-in prompts for all subscribers
3. Subscribers receive prompt with buttons
4. User selects Opt in/Ignored
5. Bot records choice and delivers signal if opted in

_Data touched:_ Signal, Subscriber, Opt-in record

### user_history
_Trigger:_ /history

1. User requests history
2. Bot queries opt-in records for user
3. Bot displays compact history of signals and choices

_Data touched:_ Opt-in record

### admin_summary
_Trigger:_ post-broadcast

1. Bot aggregates opt-in stats
2. Bot sends summary to admin chat
3. Admin reviews opt-in counts and errors

_Data touched:_ Signal, Opt-in record

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`env.<KEY>` on Workers). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Telegram chat ID to receive opt-in summaries and errors
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` — never ask a user, never treat whoever writes first as the admin.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **Signal** _(retention: persistent)_ — Trade signal with metadata and optional media
  - fields: id, timestamp, provider, asset, direction, expiry, stake_suggestion, confidence, details, image_url
- **Subscriber** _(retention: persistent)_ — User who receives signals
  - fields: telegram_id, display_name, timezone, notification_preferences
- **Opt-in record** _(retention: persistent)_ — User's choice for a specific signal
  - fields: signal_id, subscriber_id, opted_in, timestamp
- **Provider/Admin** _(retention: persistent)_ — Authorized signal creator
  - fields: telegram_id, display_name

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Create signals via admin account commands
- Configure admin chat ID for summaries
- Manage signal content and timing

## Notifications

- Post-broadcast admin summary with opt-in counts
- Delivery error alerts to admin chat
- Timezone-aware signal timestamps in user messages

## Permissions & privacy

- Admin authentication via configured Telegram ID
- User data stored securely with opt-in history
- No third-party data sharing

## Edge cases

- User declines signal but later requests /history
- Signal expiry time in future but user opts in immediately
- Admin chat ID not configured during broadcast

## Required tests

- Verify opt-in flow delivers signal immediately after acceptance
- Confirm /history shows correct opt-in status for all signals
- Validate timezone conversion in scheduled signals

## Assumptions

- Admins use Telegram commands to create signals
- Users prefer per-signal choice over bulk subscriptions
- Timezone defaults to UTC if not set
