# Hyper Insta - Advanced Instagram Bot Library

A modern, Discord.js-inspired Instagram bot library built on top of `instagram-private-api` with real-time messaging and push notification support.

## Features

- 🚀 **Modern API**: Clean, Promise-based API similar to Discord.js
- 📱 **Real-time Messaging**: Instant message handling with MQTT
- 🔔 **Push Notifications**: FBNS support for followers, likes, and more
- 💾 **Session Management**: Automatic session saving and loading
- 🔄 **Auto-reconnect**: Automatic reconnection on connection loss
- 📊 **Message Collectors**: Collect messages with filters and timeouts
- 🎯 **Event-driven**: Comprehensive event system
- 🛡️ **Error Handling**: Robust error handling and debugging

## Installation

```bash
npm install hyper-insta
```

## Quick Start

1. Create a `.env` file:
```env
IG_USERNAME=your_instagram_username
IG_PASSWORD=your_instagram_password
```

2. Basic bot example:
```javascript
const { Client } = require('hyper-insta');
require('dotenv').config();

const client = new Client({
    autoReconnect: true,
    sessionFilePath: './session.json'
});

client.on('connected', () => {
    console.log('Bot connected!');
});

client.on('messageCreate', async (message) => {
    if (message.content === '.ping') {
        await message.reply('Pong!');
    }
});

client.login().catch(console.error);
```

## Examples

### Push Notifications
```bash
npm run example:push
```

### Real-time Messaging
```bash
npm run example:realtime
```

## API Documentation

### Client Options

```javascript
const client = new Client({
    disableReplyPrefix: false,        // Disable @username prefix in replies
    sessionFilePath: './session.json', // Session file path
    cookiesFilePath: './cookies.json', // Cookies file path
    autoReconnect: true,              // Auto-reconnect on disconnect
    messageRequestsInterval: 60000,   // Message requests check interval
    proxy: {                          // Proxy configuration
        type: 5,
        host: 'proxy.example.com',
        port: 1080
    }
});
```

### Events

#### Connection Events
- `connected` - Bot is connected and ready
- `disconnected` - Bot has disconnected
- `error` - An error occurred

#### Message Events
- `messageCreate` - New message received
- `messageDelete` - Message was deleted
- `likeAdd` - Like added to message
- `likeRemove` - Like removed from message

#### Social Events
- `newFollower` - New follower
- `followRequest` - Follow request received
- `pendingRequest` - Message request received

#### Chat Events
- `chatNameUpdate` - Chat name changed
- `chatUserAdd` - User added to chat
- `chatUserRemove` - User removed from chat
- `callStart` - Call started in chat
- `callEnd` - Call ended in chat

### Methods

#### Client Methods
```javascript
// Login
await client.login(username, password);

// Logout
await client.logout();

// Fetch user
const user = await client.fetchUser('username');

// Fetch chat
const chat = await client.fetchChat('chatId');

// Create chat
const chat = await client.createChat(['userId1', 'userId2']);

// Message requests
client.startMessageRequestsMonitor(60000);
await client.approveMessageRequest('chatId');

// Device state
await client.setForegroundState(true);
```

#### Message Methods
```javascript
// Reply to message
await message.reply('Hello!');

// Mark as seen
await message.markSeen();

// Delete message
await message.delete();

// Create collector
const collector = message.createMessageCollector({
    filter: m => m.content.startsWith('!'),
    idle: 30000
});
```

#### Chat Methods
```javascript
// Send message
await chat.sendMessage('Hello!');

// Send photo
await chat.sendPhoto('./image.jpg');
await chat.sendPhoto('https://example.com/image.jpg');

// Send voice
await chat.sendVoice(audioBuffer);

// Typing
await chat.startTyping();
await chat.stopTyping();

// Approve pending chat
await chat.approve();
```

#### User Methods
```javascript
// Follow/unfollow
await user.follow();
await user.unfollow();

// Block/unblock
await user.block();
await user.unblock();

// Send message
await user.send('Hello!');
```

## Advanced Usage

### Message Collector
```javascript
const collector = message.createMessageCollector({
    filter: m => m.author.id === message.author.id,
    idle: 30000
});

collector.on('message', (msg) => {
    console.log('Collected:', msg.content);
});

collector.on('end', (reason) => {
    console.log('Collector ended:', reason);
});
```

### Proxy Support
```javascript
const client = new Client({
    proxy: {
        type: 5, // SOCKS5
        host: 'proxy.example.com',
        port: 1080,
        username: 'user', // optional
        password: 'pass'  // optional
    }
});
```

### Session Management
```javascript
const client = new Client({
    sessionFilePath: './my_session.json',
    cookiesFilePath: './my_cookies.json'
});

// Sessions are automatically saved and loaded
```

## Error Handling

```javascript
client.on('error', (error) => {
    console.error('Client error:', error.message);
});

client.on('debug', (message, data) => {
    console.log('Debug:', message, data);
});
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - see LICENSE file for details.

## Disclaimer

This library is not affiliated with Instagram. Use at your own risk and make sure to comply with Instagram's Terms of Service.