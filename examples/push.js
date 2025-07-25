const { Client } = require('../');
const { promisify } = require('util');
const { writeFile, readFile, existsSync } = require('fs');

const writeFileAsync = promisify(writeFile);
const readFileAsync = promisify(readFile);

// Load environment variables
require('dotenv').config();

const { IG_USERNAME, IG_PASSWORD } = process.env;

(async () => {
    const client = new Client({
        sessionFilePath: './state.json',
        autoReconnect: true
    });

    // Enhanced event listeners
    client.on('connected', () => {
        console.log('✅ Bot connected successfully!');
    });

    client.on('disconnected', () => {
        console.log('🔌 Bot disconnected');
    });

    client.on('error', (error) => {
        console.error('❌ Client error:', error.message);
    });

    client.on('debug', (message, data) => {
        console.log('🐛 Debug:', message, data || '');
    });

    // FBNS Push notifications
    client.on('push', (data) => {
        console.log('📱 Push notification:', JSON.stringify(data, null, 2));
    });

    client.on('newFollower', (user) => {
        console.log(`🌟 New follower: ${user.username}`);
    });

    client.on('followRequest', (user) => {
        console.log(`👤 Follow request from: ${user.username}`);
    });

    client.on('pendingRequest', (chat) => {
        console.log(`📩 New message request from: ${chat.name || chat.id}`);
        // Auto-approve example (be careful!)
        // client.approveMessageRequest(chat.id).catch(console.error);
    });

    client.on('liveNotification', (data) => {
        console.log('📺 Live notification:', JSON.stringify(data, null, 2));
    });

    // Message events
    client.on('messageCreate', (message) => {
        console.log(`💬 New message from ${message.author?.username || message.authorID}: ${message.content}`);
        
        if (message.content === '.ping') {
            message.reply('Pong! 🏓').catch(console.error);
        }
    });

    // Graceful shutdown
    const shutdown = async () => {
        console.log('👋 Shutting down...');
        await client.logout();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    try {
        await client.login(IG_USERNAME, IG_PASSWORD);
        console.log('🚀 Push notification example is running!');
        
        // Start monitoring message requests every minute
        client.startMessageRequestsMonitor(60000);
        
    } catch (error) {
        console.error('❌ Failed to login:', error.message);
        process.exit(1);
    }
})();