const { withRealtime, withFbns, withFbnsAndRealtime } = require('instagram_mqtt')
const { GraphQLSubscriptions, SkywalkerSubscriptions } = require('instagram_mqtt/dist/realtime/subscriptions')
const { IgApiClient } = require('instagram-private-api')
const { EventEmitter } = require('events')
const Collection = require('@discordjs/collection')
const tough = require('tough-cookie') // Add this dependency

const Util = require('./utils')
const { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } = require('fs')
const fs = require('fs').promises // Use promises version
const ClientUser = require('./ClientUser')
const Message = require('./Message')
const Chat = require('./Chat')
const User = require('./User')

/**
 * Client, the main hub for interacting with the Instagram API.
 * @extends {EventEmitter}
 */
class Client extends EventEmitter {
    /**
     * @typedef {object} ClientOptions
     * @property {boolean} disableReplyPrefix Whether the bot should disable user mention for the Message#reply() method
     * @property {string} [sessionFilePath] Path to save/load session data
     * @property {string} [cookiesFilePath] Path to save/load cookies
     * @property {object} [proxy] Proxy configuration
     * @property {boolean} [autoReconnect=true] Whether to auto-reconnect on disconnect
     * @property {number} [messageRequestsInterval] Interval to check message requests (ms)
     */
    /**
     * @param {ClientOptions} options
     */
    constructor(options) {
        super()
        
        /**
         * @type {ClientOptions}
         * The options for the client.
         */
        this.options = {
            disableReplyPrefix: false,
            sessionFilePath: './session.json',
            cookiesFilePath: './cookies.json',
            autoReconnect: true,
            messageRequestsInterval: 60000,
            ...options
        }
        
        /**
         * @type {?ClientUser}
         * The bot's user object.
         */
        this.user = null
        /**
         * @type {?IgApiClient}
         * @private
         */
        this.ig = null
        /**
         * @type {boolean}
         * Whether the bot is connected and ready.
         */
        this.ready = false

        /**
         * @typedef {Object} Cache
         * @property {Collection<string, Message>} messages The bot's messages cache.
         * @property {Collection<string, User>} users The bot's users cache.
         * @property {Collection<string, Chat>} chats The bot's chats cache.
         * @property {Collection<string, Chat>} pendingChats The bot's pending chats cache.
         */
        /**
         * @type {Cache}
         * The bot's cache.
         */
        this.cache = {
            messages: new Collection(),
            users: new Collection(),
            chats: new Collection(),
            pendingChats: new Collection()
        }

        /**
         * @type {...any[]}
         */
        this.eventsToReplay = []
        
        /**
         * @type {NodeJS.Timeout}
         * @private
         */
        this._messageRequestsInterval = null
    }

    /**
     * Log messages with timestamp
     * @private
     * @param {string} level Log level (INFO, WARN, ERROR, DEBUG)
     * @param {string} message Log message
     * @param {...any} args Additional arguments
     */
    log(level, message, ...args) {
        const timestamp = new Date().toISOString()
        console.log(`[${timestamp}] [${level}] ${message}`, ...args)
    }

    /**
     * Load cookies from JSON file
     * @private
     * @param {string} path Path to cookies file
     * @returns {Promise<void>}
     */
    async loadCookiesFromJson(path = './cookies.json') {
        try {
            const raw = await fs.readFile(path, 'utf-8')
            const cookies = JSON.parse(raw)

            let cookiesLoaded = 0
            for (const cookie of cookies) {
                const toughCookie = new tough.Cookie({
                    key: cookie.name,
                    value: cookie.value,
                    domain: cookie.domain.replace(/^\./, ''),
                    path: cookie.path || '/',
                    secure: cookie.secure !== false,
                    httpOnly: cookie.httpOnly !== false,
                    expires: cookie.expires ? new Date(cookie.expires) : undefined
                })

                await this.ig.state.cookieJar.setCookie(
                    toughCookie.toString(),
                    `https://${toughCookie.domain}${toughCookie.path}`
                )
                cookiesLoaded++
            }

            this.log('INFO', `🍪 Successfully loaded ${cookiesLoaded}/${cookies.length} cookies from file`)
        } catch (error) {
            this.log('ERROR', `❌ Critical error loading cookies from ${path}:`, error.message)
            this.log('DEBUG', `Cookie loading error details:`, error.stack)
            throw error
        }
    }

    /**
     * Register realtime event handlers
     * @private
     */
    registerRealtimeHandlers() {
        this.ig.realtime.on('receive', (topic, messages) => this.handleRealtimeReceive(topic, messages))
        this.ig.realtime.on('error', (error) => {
            console.error('Realtime error:', error)
            if (this.options.autoReconnect) {
                this.ig.realtime.connect()
            }
        })
        this.ig.realtime.on('close', () => {
            console.error('RealtimeClient closed')
            if (this.options.autoReconnect) {
                setTimeout(() => this.ig.realtime.connect(), 5000)
            }
        })
    }

    /**
     * Create a new user or patch the cache one with the payload
     * @private
     * @param {string} userID The ID of the user to patch
     * @param {object} userPayload The data of the user
     * @returns {User}
     */
    _patchOrCreateUser(userID, userPayload) {
        if (this.cache.users.has(userID)) {
            this.cache.users.get(userID)._patch(userPayload)
        } else {
            this.cache.users.set(userID, new User(this, userPayload))
        }
        return this.cache.users.get(userID)
    }

    /**
     * Create a chat (or return the existing one) between one (a dm chat) or multiple users (a group).
     * @param {string[]} userIDs The users to include in the group
     * @returns {Promise<Chat>} The created chat
     */
    async createChat(userIDs) {
        const threadPayload = await this.ig.direct.createGroupThread(userIDs)
        const chat = new Chat(this, threadPayload.thread_id, threadPayload)
        this.cache.chats.set(chat.id, chat)
        return chat
    }

    /**
     * Fetch a chat and cache it.
     * @param {string} query The ID of the chat to fetch.
     * @param {boolean} [force=false] Whether the cache should be ignored
     * @returns {Promise<Chat>}
     */
    async fetchChat(chatID, force = false) {
        if (!this.cache.chats.has(chatID)) {
            const { thread: chatPayload } = await this.ig.feed.directThread({ thread_id: chatID }).request()
            const chat = new Chat(this, chatID, chatPayload)
            this.cache.chats.set(chatID, chat)
        } else {
            if (force) {
                const { thread: chatPayload } = await this.ig.feed.directThread({ thread_id: chatID }).request()
                this.cache.chats.get(chatID)._patch(chatPayload)
            }
        }
        return this.cache.chats.get(chatID)
    }

    /**
     * Fetch a user and cache it.
     * @param {string} query The ID or the username of the user to fetch.
     * @param {boolean} [force=false] Whether the cache should be ignored
     * @returns {Promise<User>}
     */
    async fetchUser(query, force = false) {
        const userID = Util.isID(query) ? query : await this.ig.user.getIdByUsername(query)
        if (!this.cache.users.has(userID)) {
            const userPayload = await this.ig.user.info(userID)
            const user = new User(this, userPayload)
            this.cache.users.set(userID, user)
        } else {
            if (force) {
                const userPayload = await this.ig.user.info(userID)
                this.cache.users.get(userID)._patch(userPayload)
            }
        }
        return this.cache.users.get(userID)
    }

    /**
     * Handle Realtime messages
     * @param {object} topic
     * @param {object} payload
     * @private
     */
    handleRealtimeReceive(topic, payload) {
        if (!this.ready) {
            this.eventsToReplay.push([
                'realtime',
                topic,
                payload
            ])
            return
        }
        this.emit('rawRealtime', topic, payload)
        if (topic.id === '146') {
            const rawMessages = JSON.parse(payload)
            rawMessages.forEach(async (rawMessage) => {
                rawMessage.data.forEach((data) => {
                    // Emit right event
                    switch (data.op) {
                        case 'replace': {
                            const isInboxThreadPath = Util.matchInboxThreadPath(data.path, false)
                            if (isInboxThreadPath) {
                                const [threadID] = Util.matchInboxThreadPath(data.path, true)
                                if (this.cache.chats.has(threadID)) {
                                    const chat = this.cache.chats.get(threadID)
                                    const oldChat = Object.assign(Object.create(chat), chat)
                                    this.cache.chats.get(threadID)._patch(JSON.parse(data.value))

                                    /* Compare name */
                                    if (oldChat.name !== chat.name) {
                                        this.emit('chatNameUpdate', chat, oldChat.name, chat.name)
                                    }

                                    /* Compare users */
                                    if (oldChat.users.size < chat.users.size) {
                                        const userAdded = chat.users.find((u) => !oldChat.users.has(u.id))
                                        if (userAdded) this.emit('chatUserAdd', chat, userAdded)
                                    } else if (oldChat.users.size > chat.users.size) {
                                        const userRemoved = oldChat.users.find((u) => !chat.users.has(u.id))
                                        if (userRemoved) this.emit('chatUserRemove', chat, userRemoved)
                                    }

                                    /* Compare calling status */
                                    if (!oldChat.calling && chat.calling) {
                                        this.emit('callStart', chat)
                                    } else if (oldChat.calling && !chat.calling) {
                                        this.emit('callEnd', chat)
                                    }
                                } else {
                                    const chat = new Chat(this, threadID, JSON.parse(data.value))
                                    this.cache.chats.set(chat.id, chat)
                                }
                                return
                            }
                            const isMessagePath = Util.matchMessagePath(data.path, false)
                            if (isMessagePath) {
                                const [threadID] = Util.matchMessagePath(data.path, true)
                                this.fetchChat(threadID).then((chat) => {
                                    const messagePayload = JSON.parse(data.value)
                                    if (chat.messages.has(messagePayload.item_id)) {
                                        const message = chat.messages.get(messagePayload.item_id)
                                        const oldMessage = Object.assign(Object.create(message), message)
                                        chat.messages.get(messagePayload.item_id)._patch(messagePayload)

                                        /* Compare likes */
                                        if (oldMessage.likes.length > message.likes.length) {
                                            const removed = oldMessage.likes.find((like) => !message.likes.some((l) => l.userID === like.userID))
                                            this.fetchUser(removed.userID).then((user) => {
                                                if (removed) this.emit('likeRemove', user, message)
                                            })
                                        } else if (message.likes.length > oldMessage.likes.length) {
                                            const added = message.likes.find((like) => !oldMessage.likes.some((l) => l.userID === like.userID))
                                            if (added) {
                                                this.fetchUser(added.userID).then((user) => {
                                                    this.emit('likeAdd', user, message)
                                                })
                                            }
                                        }
                                    }
                                })
                            }
                            break
                        }

                        case 'add': {
                            const isAdminPath = Util.matchAdminPath(data.path, false)
                            if (isAdminPath) {
                                const [threadID, userID] = Util.matchAdminPath(data.path, true)
                                this.fetchChat(threadID).then((chat) => {
                                    // Mark the user as an admin
                                    chat.adminUserIDs.push(userID)
                                    this.fetchUser(userID).then((user) => {
                                        this.emit('chatAdminAdd', chat, user)
                                    })
                                })
                                return
                            }
                            const isMessagePath = Util.matchMessagePath(data.path, false)
                            if (isMessagePath) {
                                const [threadID] = Util.matchMessagePath(data.path, true)
                                this.fetchChat(threadID).then((chat) => {
                                    // Create a new message
                                    const messagePayload = JSON.parse(data.value)
                                    if (messagePayload.item_type === 'action_log' || messagePayload.item_type === 'video_call_event') return
                                    const message = new Message(this, threadID, messagePayload)
                                    chat.messages.set(message.id, message)
                                    if (Util.isMessageValid(message)) this.emit('messageCreate', message)
                                })
                            }
                            break
                        }

                        case 'remove': {
                            const isAdminPath = Util.matchAdminPath(data.path, false)
                            if (isAdminPath) {
                                const [threadID, userID] = Util.matchAdminPath(data.path, true)
                                this.fetchChat(threadID).then((chat) => {
                                    // Remove the user from the administrators
                                    chat.adminUserIDs.push(userID)
                                    this.fetchUser(userID).then((user) => {
                                        this.emit('chatAdminRemove', chat, user)
                                    })
                                })
                                return
                            }
                            const isMessagePath = Util.matchMessagePath(data.path, false)
                            if (isMessagePath) {
                                const [threadID] = Util.matchMessagePath(data.path, true)
                                this.fetchChat(threadID).then((chat) => {
                                    // Emit message delete event
                                    const messageID = data.value
                                    const existing = chat.messages.get(messageID)
                                    if (existing) this.emit('messageDelete', existing)
                                })
                            }
                            break
                        }

                        default:
                            break
                    }
                })
            })
        }
    }

    /**
     * Handle FBNS messages
     * @param {object} data
     * @private
     */
    async handleFbnsReceive(data) {
        if (!this.ready) {
            this.eventsToReplay.push([
                'fbns',
                data
            ])
            return
        }
        this.emit('rawFbns', data)
        
        // Enhanced FBNS handling based on examples
        switch (data.pushCategory) {
            case 'new_follower':
                if (data.sourceUserId) {
                    const user = await this.fetchUser(data.sourceUserId)
                    this.emit('newFollower', user)
                }
                break
                
            case 'private_user_follow_request':
                if (data.sourceUserId) {
                    const user = await this.fetchUser(data.sourceUserId)
                    this.emit('followRequest', user)
                }
                break
                
            case 'direct_v2_pending':
                if (data.actionParams?.id && !this.cache.pendingChats.get(data.actionParams.id)) {
                    const pendingRequests = await this.ig.feed.directPending().items()
                    pendingRequests.forEach((thread) => {
                        const chat = new Chat(this, thread.thread_id, thread)
                        this.cache.chats.set(thread.thread_id, chat)
                        this.cache.pendingChats.set(thread.thread_id, chat)
                    })
                    const pendingChat = this.cache.pendingChats.get(data.actionParams.id)
                    if (pendingChat) {
                        this.emit('pendingRequest', pendingChat)
                    }
                }
                break
                
            case 'live_broadcast':
                this.emit('liveNotification', data)
                break
                
            default:
                this.emit('push', data)
                break
        }
    }
    
    /**
     * Send foreground state to Instagram
     * @param {boolean} inForeground Whether the app is in foreground
     * @returns {Promise<void>}
     */
    async setForegroundState(inForeground = true) {
        if (!this.ig?.realtime?.direct) return
        
        await this.ig.realtime.direct.sendForegroundState({
            inForegroundApp: inForeground,
            inForegroundDevice: inForeground,
            keepAliveTimeout: inForeground ? 60 : 900
        })
    }
    
    /**
     * Subscribe to live comments for a broadcast
     * @param {string} broadcastId The broadcast ID
     * @returns {Promise<void>}
     */
    async subscribeToLiveComments(broadcastId) {
        await this.ig.realtime.graphQlSubscribe(
            GraphQLSubscriptions.getLiveRealtimeCommentsSubscription(broadcastId)
        )
    }

    /**
     * Log the bot out from Instagram
     * @returns {Promise<void>}
     */
    async logout() {
        if (this.ig) {
            await this.ig.account.logout()
            if (this.ig.realtime) await this.ig.realtime.disconnect()
            if (this.ig.fbns) await this.ig.fbns.disconnect()
        }
        this.ready = false
    }
    
    /**
     * Enhanced login with cookie and session support
     * @param {string} username The username of the Instagram account.
     * @param {string} [password] The password (optional if using cookies/session)
     * @returns {Promise<void>}
     */
    async login(username, password) {
        try {
            if (!username) {
                throw new Error('❌ Username is required')
            }

            const ig = withFbnsAndRealtime(new IgApiClient())
            ig.state.generateDevice(username)
            this.ig = ig

            let loginSuccess = false

            // Step 1: Try session.json first
            try {
                await fs.access(this.options.sessionFilePath)
                this.log('INFO', '📂 Found session.json, trying to login from session...')
                const sessionData = JSON.parse(await fs.readFile(this.options.sessionFilePath, 'utf-8'))
                await this.ig.state.deserialize(sessionData)
                
                try {
                    const currentUser = await this.ig.account.currentUser()
                    this.log('INFO', `✅ Logged in from session.json as @${currentUser.username}`)
                    loginSuccess = true
                } catch (validationError) {
                    this.log('WARN', '⚠️ Session validation failed:', validationError.message)
                }
                
            } catch (sessionAccessError) {
                this.log('INFO', '📂 session.json not found or invalid, trying cookies.json...')
            }

            // Step 2: Fallback to cookies.json if session login wasn't successful
            if (!loginSuccess) {
                try {
                    this.log('INFO', '📂 Attempting login using cookies.json...')
                    await this.loadCookiesFromJson(this.options.cookiesFilePath)
                    
                    try {
                        const currentUserResponse = await this.ig.account.currentUser()
                        this.log('INFO', `✅ Logged in using cookies.json as @${currentUserResponse.username}`)
                        loginSuccess = true

                        // Save session after successful cookie login
                        const session = await this.ig.state.serialize()
                        delete session.constants
                        await fs.writeFile(this.options.sessionFilePath, JSON.stringify(session, null, 2))
                        this.log('INFO', '💾 session.json saved from cookie-based login')
                    } catch (cookieValidationError) {
                        this.log('ERROR', '❌ Failed to validate login using cookies.json:', cookieValidationError.message)
                        throw new Error(`Cookie login validation failed: ${cookieValidationError.message}`)
                    }
                    
                } catch (cookieLoadError) {
                    this.log('INFO', '📂 cookies.json not found or invalid, trying username/password...')
                }
            }

            // Step 3: Fallback to username/password if provided
            if (!loginSuccess && password) {
                this.log('INFO', '🔐 Attempting login with username/password...')
                await this.ig.account.login(username, password)
                
                const currentUser = await this.ig.account.currentUser()
                this.log('INFO', `✅ Logged in with credentials as @${currentUser.username}`)
                loginSuccess = true

                // Save session after successful credential login
                const session = await this.ig.state.serialize()
                delete session.constants
                await fs.writeFile(this.options.sessionFilePath, JSON.stringify(session, null, 2))
                this.log('INFO', '💾 session.json saved from credential-based login')
            }

            if (!loginSuccess) {
                throw new Error('No valid login method succeeded (session, cookies, or credentials)')
            }

            // Get user info and set up client user
            const response = await this.ig.user.usernameinfo(username)
            const userData = await this.ig.user.info(response.pk)
            this.user = new ClientUser(this, {
                ...response,
                ...userData
            })
            this.cache.users.set(this.user.id, this.user)
            this.emit('debug', 'logged', this.user)

            // Load chats
            const threads = [
                ...await this.ig.feed.directInbox().items(),
                ...await this.ig.feed.directPending().items()
            ]
            threads.forEach((thread) => {
                const chat = new Chat(this, thread.thread_id, thread)
                this.cache.chats.set(thread.thread_id, chat)
                if (chat.pending) {
                    this.cache.pendingChats.set(thread.thread_id, chat)
                }
            })

            // Register handlers and connect
            this.registerRealtimeHandlers()

            await this.ig.realtime.connect({
                graphQlSubs: [
                    GraphQLSubscriptions.getAppPresenceSubscription(),
                    GraphQLSubscriptions.getZeroProvisionSubscription(this.ig.state.phoneId),
                    GraphQLSubscriptions.getDirectStatusSubscription(),
                    GraphQLSubscriptions.getDirectTypingSubscription(this.ig.state.cookieUserId),
                    GraphQLSubscriptions.getAsyncAdSubscription(this.ig.state.cookieUserId),
                ],
                skywalkerSubs: [
                    SkywalkerSubscriptions.directSub(this.ig.state.cookieUserId),
                    SkywalkerSubscriptions.liveSub(this.ig.state.cookieUserId),
                ],
                irisData: await this.ig.feed.directInbox().request(),
                autoReconnect: this.options.autoReconnect
            })

            this.ig.fbns.push$.subscribe((data) => this.handleFbnsReceive(data))

            await this.ig.fbns.connect({
                autoReconnect: this.options.autoReconnect
            })

            this.ready = true
            this.emit('connected')
            this.log('INFO', '🚀 Instagram bot is now running and listening for messages')

            // Replay events that occurred before ready
            this.eventsToReplay.forEach((event) => {
                const eventType = event.shift()
                if (eventType === 'realtime') {
                    this.handleRealtimeReceive(...event)
                } else if (eventType === 'fbns') {
                    this.handleFbnsReceive(...event)
                }
            })
            this.eventsToReplay = []

        } catch (error) {
            this.log('ERROR', '❌ Failed to initialize bot:', error.message)
            this.log('DEBUG', 'Initialization error stack:', error.stack)
            
            if (error.message.includes('login') || error.message.includes('cookie') || error.message.includes('session')) {
                throw error
            } else {
                throw new Error(`Unexpected error during initialization: ${error.message}`)
            }
        }
    }

    toJSON() {
        const json = {
            ready: this.ready,
            options: this.options,
            id: this.user?.id
        }
        return json
    }
}

module.exports = Client
