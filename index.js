// index.js
const Client = require('./client');

async function main() {
  const client = new Client({
    // Configure options
    sessionFilePath: './my_session.json',
    cookiesFilePath: './my_cookies.json',
    autoReconnect: true
  });

  // --- Event Listeners ---
  client.on('connected', () => {
    console.log('✅ Bot is fully connected and ready!');
    // Example: Start monitoring message requests
    client.startMessageRequestsMonitor(60000); // Check every minute
  });

  client.on('disconnected', () => {
    console.log('🔌 Bot has disconnected.');
  });

  client.on('error', (err) => {
    console.error('🚨 Client Error:', err.message);
  });

  // --- insta.js Style Events ---
  client.on('messageCreate', async (message) => {
    console.log(`💬 New message in ${message.chat.name || 'Chat'} from ${message.author.username || message.authorID}: ${message.content}`);
    
    if (message.content === '.ping') {
        await message.reply('Pong!');
    }
  });

  client.on('newFollower', (user) => {
    console.log(`🌟 New follower: ${user.username}`);
  });

  client.on('pendingRequest', (chat) => {
    console.log(`📩 New message request from chat: ${chat.name || chat.id}`);
    // Auto-approve example (be careful!)
    // client.approveMessageRequest(chat.id).catch(console.error);
  });

  // --- InstagramBot Style Events ---
  client.on('presenceUpdate', (data) => {
    console.log('👤 Presence Update:', JSON.stringify(data));
  });

  client.on('typingStart', (data) => {
    console.log('⌨️ Typing:', JSON.stringify(data));
  });

  client.on('liveNotification', (data) => {
    console.log('📺 Live Notification:', JSON.stringify(data));
  });

  client.on('messageRequestsPolled', (requests) => {
    console.log(`📬 Polled ${requests.length} message requests.`);
    // Add logic to process requests here if needed
  });

  // --- Graceful Shutdown ---
  const shutdownHandler = async () => {
    console.log('
👋 Shutting down gracefully...');
    await client.logout();
    console.log('🛑 Shutdown complete.');
    process.exit(0);
  };

  process.on('SIGINT', shutdownHandler);
  process.on('SIGTERM', shutdownHandler);

  // --- Login and Start ---
  try {
    // Load credentials from environment or hardcode for testing
    const username = process.env.IG_USERNAME || 'your_username';
    const password = process.env.IG_PASSWORD || 'your_password';
    
    await client.login(username, password);
    console.log('🚀 Combined Instagram Bot is running!');
  } catch (error) {
    console.error('❌ Failed to start bot:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
