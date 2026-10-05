# Telegram Integration and Elite

## What Is Implemented

- Dedicated detail URLs, directory URLs, browser history, Telegram back navigation, reloads, and shareable Telegram start parameters.
- Verified Mini App identity, signed sessions, capability-gated SecureStorage session reuse, DeviceStorage drafts, and CloudStorage conversation preferences. Server data remains authoritative.
- Telegram theme/safe-area updates, native Settings entry, home-screen shortcuts where supported, and haptics.
- Operator-linked native groups and channels. Linked conversations open in Telegram; they are not iframe embeds or a simulated Telegram client. Unlinked communities retain the clearly labeled HoodLink conversation.
- A durable in-app inbox, transactional activity notifications, opt-in bot delivery, retry/backoff, opt-out/blocked-user handling, and read state.
- Native anonymous Telegram polls, permission checks, per-account daily allowances, and result synchronization via webhook. Votes are cast in Telegram, not duplicated inside the app.
- A one-time 30-day Elite pass purchased with Telegram Stars, invoice records, server-side pre-checkout verification, replay-safe charge fulfillment, refund revocation, and private place notes. Standard accounts get one poll per day; Elite gets ten. Poll creation attempts count toward the allowance to discourage repeated abuse.

## Live Activation

This repository has not been connected to a real bot and has not processed live payments. Configure secrets directly in local environment files or your deployment secret manager. Do not paste tokens into chat or commit them.

1. Create/configure a bot in @BotFather and point its Main Mini App to your deployed HTTPS web origin. Configure the same bot used for initData validation.
2. Set `TELEGRAM_ENABLED=true`, `BOT_TOKEN`, `BOT_USERNAME` (without `@`), `WEB_ORIGIN=https://your-domain`, and a random `TELEGRAM_WEBHOOK_SECRET` of at least 32 characters using only letters, digits, `_`, and `-`. Set `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` at frontend build time as well.
3. Set `TELEGRAM_ADMIN_IDS` to a comma-separated list of operator Telegram user IDs. Browser demo accounts can never be operators. Keep the existing strong production `SESSION_SECRET` and production Compose override.
4. Build/start the containers with both Compose files. Run `docker compose exec api node dist/telegram/setup.js`. This registers the webhook at `/api/telegram/webhook`, bot commands, and app menu without discarding pending updates. The webhook passes through the Next.js gateway, which forwards Telegram's secret header.
5. Add the bot to your group/channel as an administrator. Sign in with a configured operator account that also administers the chat. Open Settings > Telegram connections and link the chat to the hood using its `@username` or numeric chat ID. Channels need post permissions; private chats need bot invite permissions. Public URLs are used where possible; otherwise the bot creates an additional invite link.
6. Users opt in through the inbox's Connect Telegram action or `/start`. RequestWriteAccess alone is not treated as server proof: the backend confirms it can message the verified user before enabling delivery. `/stop`, blocked-bot updates, and the notification preference stop delivery. The inbox remains available.
7. Test actual groups, notifications, polls, deep links, storage, and back navigation on Telegram Android/iOS/Desktop. Bot API mock tests and a browser SDK do not replace these live checks.

The default Docker stack remains demo-enabled and Telegram-disabled. Payments and external bot actions are unavailable until explicitly configured.

## Elite and Payment Launch

Elite is a **one-time pass**, not an automatically renewing subscription. Default price: `ELITE_STARS=250`; duration: 30 days. Only digital in-app features are sold, so Telegram Stars (`XTR`) are used as required by Telegram. No third-party or cryptocurrency checkout is substituted.

Publish an operator-approved HTTPS terms page and support page, configure `TERMS_URL` and `SUPPORT_URL`, then set `PAYMENTS_ENABLED=true`. Users must accept the purchase terms before checkout. The bot supports `/terms`, `/support`, and `/paysupport`. Payment support remains the operator's responsibility, not Telegram's.

Before enabling real sales, use Telegram's test environment and review your actual business/legal obligations, refund policy, backups, pricing, and customer support arrangements. No revenue level or financial outcome is guaranteed. Withdrawals, taxes, Telegram fees, and the value of Stars are managed outside this app.

Pre-checkout validates payer identity, invoice payload, amount, and `XTR`. It never grants features. Only a successful-payment update with the matching invoice enables the pass. Browser `openInvoice` success is informational; the interface refreshes the server's entitlement. Charge IDs are unique, duplicate updates are guarded, and refunds mark payment records refunded, removing paid editing. Existing notes remain readable.

Operators can refund a recorded payment with authenticated `POST /api/telegram/refund` and `{ "chargeId": "the-recorded-charge-id" }`. The operator allowlist is enforced server-side. Charge IDs are stored in the `payments` table for reconciliation and support. Protect this workflow operationally; there is no customer-facing automatic refund button.

## Reliability and Limits

Webhook processing uses an advisory lock and processed-update table. Notification delivery uses PostgreSQL row leasing and a bounded retry policy, one job per two seconds. Delivery is **at least once**, not exactly once: a crash after Telegram accepts a message but before the database records it can repeat that notification. Scale delivery throughput with a dedicated queue worker before a large launch.

Poll publication cannot be atomic across Telegram and PostgreSQL. If delivery is uncertain, the app records a failed attempt and tells the user to check the group before retrying. Closed polls and results update from Telegram's webhook. Publishing requires both app membership and native Telegram membership/poll permission. The bot does not copy private/group chat history into the app, impersonate users, or bypass Telegram membership/privacy restrictions. Notifications created while integration is disabled stay in-app and are not sent as an old backlog when a bot is later connected.

Webhook body size is bounded. Telegram features require real accounts; local demo users cannot initiate payments, publish native polls, or link chats. Elite notes are account-private and editing is gated on server-side payment validity.

For production beyond this integration, finish moderation/reporting, account deletion, real school and merchant catalogs, observability, delivery-worker monitoring, and an operations interface. Do not sell promised services that are not actually provided.