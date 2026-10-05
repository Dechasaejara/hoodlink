# Administration and Appearance

## Role Boundaries

| Role | Workspace | Permissions |
| --- | --- | --- |
| Member | Community app | Personal profile, appearance, community actions |
| Moderator | Moderation workspace | Review, hide, and restore community posts |
| Admin | Catalog workspace | Moderation plus schools, communities, businesses, challenges, and events |
| Super Admin | Operations workspace | All staff tools, delegated account roles, and audit history |

NestJS checks the current database role on every administrative request. Transactions recheck privileges under a lock, so changing a role takes effect without waiting for a token to expire. The interface adapts navigation, density, and available workspace sections; hiding a button is not the authorization mechanism.

## Super Admin Setup

Set `SUPER_ADMIN_TELEGRAM_IDS` to a comma-separated list of trusted Telegram user IDs in the deployment environment. Those verified accounts are provisioned as Super Admin when signing in. Do not take account IDs or roles from unverified client claims.

Super Admin may delegate Member, Moderator, and Admin roles to other accounts. It cannot change its own role, alter other protected Super Admin accounts, or assign Super Admin from the browser. Root provisioning belongs to deployment configuration. Revoking a provisioned root account requires an explicit operational database change as well as removing its ID from configuration; removing an ID alone does not demote the already-provisioned database record.

The separate `TELEGRAM_ADMIN_IDS` allowlist still controls operator-level Telegram linking/refunds and actual native chat administrator rights are also checked. Granting an application Admin role does not silently grant bot payment/refund privileges.

## Development Preview

The base local Compose stack sets `ALLOW_DEMO_ROLE_SWITCH=true`. Open the menu/sidebar and use **Local role preview** to switch between separate Member, Moderator, Admin, and Super Admin demo accounts. Demo staff accounts can change the local catalog; use them only on an isolated development database.

Production forces both demo authentication and role switching off regardless of supplied flags. Never deploy the base demo-enabled Compose stack without the production override. Outside Docker, enable the preview explicitly in the API environment if needed.

## Catalog Operations

Open the staff workspace at `/admin`. Admin and Super Admin can add/edit records using validated forms, search by name or ID, filter status, and archive/restore records. IDs are stable URL identifiers and cannot be renamed in the editor. Event month/day labels are derived from the stored date.

There are no hard-delete actions. Archiving removes items from member catalogs while preserving histories, memberships, saved entries, and financial references. At least one active school and community must remain. School renames propagate to matching user profile labels transactionally. Community renames are joined from IDs, and linked local channel labels update too.

Role changes, catalog changes, archives/restores, and moderation actions are recorded with actor, record, timestamp, and before/after values. Audit records are read-only through the application. Super Admin can view the latest 200 audit events; catalog/account lists are bounded to 500 records. Add pagination before operating larger catalogs.

## Appearance

The default is Telegram-inspired light styling: white surfaces, blue accents, neutral borders, and native-feeling conversation colors. **System** follows Telegram's color scheme when available and otherwise uses light mode. **Light** and **Dark** override it.

Settings > Appearance provides color swatches and a native color picker. Changes preview immediately; **Save appearance** persists the mode/accent on the account. Button text contrast is chosen automatically. **Reset to Telegram defaults** previews the default; save it to persist the reset.

Preferences are validated server-side, limited to supported modes and hexadecimal colors, and isolated per account. Switching demo accounts also switches appearance. Credentials and role authority are not stored in browser appearance preferences.