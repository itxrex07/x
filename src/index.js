const Client = require('./client/Client');
const Message = require('./structures/Message');
const Chat = require('./structures/Chat');
const User = require('./structures/User');
const ClientUser = require('./structures/ClientUser');
const Attachment = require('./structures/Attachment');
const MessageCollector = require('./collectors/MessageCollector');

module.exports = {
    Client,
    Message,
    Chat,
    User,
    ClientUser,
    Attachment,
    MessageCollector,
    // Version info
    version: require('../package.json').version
};