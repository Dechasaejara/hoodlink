import 'dotenv/config';
import { Api } from 'grammy';
import { readConfig } from '../config';

async function setup() {
  const config = readConfig();
  if (config.TELEGRAM_ENABLED !== 'true') throw new Error('Enable and configure Telegram first.');
  const api = new Api(config.BOT_TOKEN);
  await api.setWebhook(`${config.WEB_ORIGIN}/api/telegram/webhook`, { secret_token: config.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message', 'pre_checkout_query', 'poll', 'my_chat_member'], drop_pending_updates: false });
  await api.setMyCommands([{ command: 'start', description: 'Open your community' }, { command: 'stop', description: 'Pause Telegram notifications' }, { command: 'terms', description: 'Purchase terms' }, { command: 'paysupport', description: 'Payment support' }, { command: 'support', description: 'Contact HoodLink support' }, { command: 'link', description: 'Connect a group or channel' }]);
  await api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'HoodLink', web_app: { url: config.WEB_ORIGIN } } });
  console.log('Webhook, bot commands, and app menu configured. No pending updates were discarded.');
}
void setup().catch(() => { console.error('Telegram setup failed. Verify configuration, connectivity, and bot permissions.'); process.exitCode = 1; });