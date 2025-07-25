const { Client } = require('../');
require('dotenv').config();

const { IG_USERNAME, IG_PASSWORD } = process.env;

(async () => {
    const client = new Client({
        sessionFilePath: './realtime_state.json',
        autoReconnect: true
    });

    // Connection events
    client.on('connected', () => {
        console.log('✅ Realtime client connected!');
        
        // Simulate device state changes
        setTimeout(() => {
            console.log('📱 Setting device to background...');
            client.setForegroundState(false);
        }, 5000);
        
        setTimeout(() => {
            console.log('📱 Setting device to foreground...');
            client.setForegroundState(true);
        }, 10000);
    });

    client.on('error', (error) => {
        console.error('❌ Error:', error.message);
    });

    client.on('debug', (message, data) => {
        console.log('🐛 Debug:', message, data || '');
    });

    // Raw realtime data
    client.on('rawRealtime', (topic, messages) => {
        console.log('📡 Raw realtime:', topic, JSON.stringify(messages, null, 2));
    });

    // Message events
    client.on('messageCreate', (message) => {
        console.log(`💬 Message from ${message.author?.username || message.authorID}: ${message.content}`);
        
        // Echo bot example
        if (message.content && !message.content.startsWith('.')) {
            message.reply(`You said: ${message.content}`).catch(console.error);
        }
        
        // Commands
        if (message.content === '.help') {
            message.reply('Available commands:\n.ping - Test bot\n.info - Get chat info').catch(console.error);
        }
        
        if (message.content === '.info') {
            const info = `Chat: ${message.chat.name || 'DM'}\nUsers: ${message.chat.users.size}\nMessages: ${message.chat.messages.size}`;
            message.reply(info).catch(console.error);
        }
    });

    client.on('messageDelete', (message) => {
        console.log(`🗑️ Message deleted: ${message.content}`);
    });

    client.on('likeAdd', (user, message) => {
        console.log(`❤️ ${user.username} liked: ${message.content}`);
    });

    client.on('likeRemove', (user, message) => {
        console.log(`💔 ${user.username} unliked: ${message.content}`);
    });

    // Chat events
    client.on('chatNameUpdate', (chat, oldName, newName) => {
        console.log(`📝 Chat name changed from "${oldName}" to "${newName}"`);
    });

    client.on('chatUserAdd', (chat, user) => {
        console.log(`➕ ${user.username} joined ${chat.name || 'chat'}`);
    });

    client.on('chatUserRemove', (chat, user) => {
        console.log(`➖ ${user.username} left ${chat.name || 'chat'}`);
    });

    client.on('callStart', (chat) => {
        console.log(`📞 Call started in ${chat.name || 'chat'}`);
    });

    client.on('callEnd', (chat) => {
        console.log(`📞 Call ended in ${chat.name || 'chat'}`);
    });

    // Typing events (if you want to handle them)
    client.on('typingStart', (data) => {
        console.log('⌨️ Someone is typing:', data);
    });

    // Presence events
    client.on('presenceUpdate', (data) => {
        console.log('👤 Presence update:', data);
    });

    // Graceful shutdown
    const shutdown = async () => {
        console.log('👋 Shutting down realtime client...');
        await client.logout();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    try {
        await client.login(IG_USERNAME, IG_PASSWORD);
        console.log('🚀 Realtime example is running!');
        
    } catch (error) {
        console.error('❌ Failed to login:', error.message);
        process.exit(1);
    }
})();