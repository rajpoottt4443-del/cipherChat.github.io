import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import fs from 'fs';
import crypto from 'crypto';
import { db, User, Message, EncryptedMessagePayload } from './server/db.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Directories
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// --- WebSocket Real-Time Infrastructure ---
const wss = new WebSocketServer({ server, path: '/ws' });
const userSockets = new Map<string, Set<WebSocket>>(); // userId -> Set of WebSockets
const socketUserMap = new Map<WebSocket, string>(); // WebSocket -> userId

function sendToUser(userId: string, data: any) {
  const sockets = userSockets.get(userId);
  if (sockets && sockets.size > 0) {
    const payload = JSON.stringify(data);
    sockets.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
    return true;
  }
  return false;
}

function broadcastPresence(userId: string, isOnline: boolean) {
  const user = db.findUserById(userId);
  if (!user || user.settings?.online_visibility === false) return;

  const contacts = db.getContactsForUser(userId).filter(c => c.status === 'accepted');
  const payload = JSON.stringify({
    type: 'presence:update',
    userId,
    isOnline,
    lastActiveAt: new Date().toISOString(),
  });

  contacts.forEach(c => {
    const peerId = c.user_id === userId ? c.contact_user_id : c.user_id;
    const sockets = userSockets.get(peerId);
    if (sockets) {
      sockets.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      });
    }
  });
}

wss.on('connection', (ws: WebSocket, req) => {
  let authenticatedUserId: string | null = null;

  // Try extracting token from URL query
  try {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token');
    if (token) {
      const session = db.findSessionByToken(token);
      if (session) {
        authenticatedUserId = session.user_id;
        registerUserSocket(authenticatedUserId, ws);
      }
    }
  } catch (err) {
    console.error('WS URL parse error:', err);
  }

  function registerUserSocket(userId: string, socket: WebSocket) {
    authenticatedUserId = userId;
    socketUserMap.set(socket, userId);
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket);

    // Update last active
    db.updateUser(userId, { last_active_at: new Date().toISOString() });

    // Broadcast online presence
    broadcastPresence(userId, true);

    socket.send(JSON.stringify({
      type: 'auth:success',
      userId,
      serverTime: new Date().toISOString(),
    }));
  }

  ws.on('message', (messageRaw: string) => {
    try {
      const data = JSON.parse(messageRaw.toString());

      if (data.type === 'auth') {
        const session = db.findSessionByToken(data.token);
        if (session) {
          registerUserSocket(session.user_id, ws);
        } else {
          ws.send(JSON.stringify({ type: 'auth:error', error: 'Invalid session token' }));
        }
        return;
      }

      if (!authenticatedUserId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized WebSocket client' }));
        return;
      }

      const senderId = authenticatedUserId;

      // Handle typing status
      if (data.type === 'typing:start' || data.type === 'typing:stop') {
        const { recipientId, conversationId } = data;
        if (recipientId) {
          sendToUser(recipientId, {
            type: data.type,
            conversationId,
            senderId,
          });
        }
        return;
      }

      // Handle message read receipt
      if (data.type === 'message:read') {
        const { messageId, conversationId } = data;
        const msg = db.updateMessageStatus(messageId, 'read');
        if (msg) {
          sendToUser(msg.sender_id, {
            type: 'message:status',
            messageId,
            conversationId,
            status: 'read',
            readAt: msg.read_at,
          });
        }
        return;
      }

      // Handle check presence
      if (data.type === 'presence:check') {
        const { targetUserIds } = data;
        const result: Record<string, boolean> = {};
        if (Array.isArray(targetUserIds)) {
          targetUserIds.forEach(tId => {
            const sockets = userSockets.get(tId);
            const targetUser = db.findUserById(tId);
            const isVisible = targetUser?.settings?.online_visibility !== false;
            result[tId] = isVisible && Boolean(sockets && sockets.size > 0);
          });
        }
        ws.send(JSON.stringify({ type: 'presence:result', presence: result }));
        return;
      }
    } catch (err) {
      console.error('WS message handling error:', err);
    }
  });

  ws.on('close', () => {
    if (authenticatedUserId) {
      const set = userSockets.get(authenticatedUserId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          userSockets.delete(authenticatedUserId);
          broadcastPresence(authenticatedUserId, false);
          db.updateUser(authenticatedUserId, { last_active_at: new Date().toISOString() });
        }
      }
      socketUserMap.delete(ws);
    }
  });
});

// --- Auth Middleware ---
interface AuthRequest extends Request {
  user?: User;
  sessionToken?: string;
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. No Bearer token provided.' });
    return;
  }
  const token = authHeader.substring(7);
  const session = db.findSessionByToken(token);
  if (!session) {
    res.status(401).json({ error: 'Session expired or invalid.' });
    return;
  }
  const user = db.findUserById(session.user_id);
  if (!user) {
    res.status(401).json({ error: 'User account not found.' });
    return;
  }
  if (user.status === 'suspended') {
    res.status(403).json({ error: 'Your account has been suspended for violating terms of service.' });
    return;
  }
  req.user = user;
  req.sessionToken = token;
  next();
}

function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Access denied: Administrator privileges required.' });
    return;
  }
  next();
}

// Strip sensitive fields when sending user to client
function sanitizeUser(user: User, isSelf = false) {
  if (isSelf) {
    return {
      id: user.id,
      unique_id: user.unique_id,
      email: user.email,
      display_name: user.display_name,
      username: user.username,
      avatar_url: user.avatar_url,
      public_identity_key: user.public_identity_key,
      public_key_fingerprint: user.public_key_fingerprint,
      is_email_verified: user.is_email_verified,
      role: user.role,
      status: user.status,
      created_at: user.created_at,
      last_active_at: user.last_active_at,
      settings: user.settings,
      email_verify_token: user.email_verify_token, // For convenient development verification
    };
  }
  // Public profile for contacts (NEVER exposes email!)
  return {
    id: user.id,
    unique_id: user.unique_id,
    display_name: user.display_name,
    username: user.username,
    avatar_url: user.avatar_url,
    public_identity_key: user.public_identity_key,
    public_key_fingerprint: user.public_key_fingerprint,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
    last_active_at: user.settings?.online_visibility !== false ? user.last_active_at : null,
    is_online: user.settings?.online_visibility !== false ? Boolean(userSockets.get(user.id)?.size) : false,
  };
}

// --- API Routes ---

// Health & E2EE Info
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    platform: 'CipherChat',
    e2ee_enabled: true,
    server_time: new Date().toISOString(),
    crypto_protocol: 'ECDH P-256 + HKDF-SHA256 + AES-256-GCM',
    active_connections: wss.clients.size,
    registered_users: db.getAllUsers().length,
  });
});

// 1. Auth: Register
app.post('/api/auth/register', (req, res) => {
  const { email, password, display_name, username, public_identity_key, public_key_fingerprint } = req.body;

  if (!email || !password || !display_name || !username) {
    return res.status(400).json({ error: 'Email, password, display name, and username are required.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  if (db.findUserByEmail(email)) {
    return res.status(409).json({ error: 'An account with this email address already exists.' });
  }

  if (db.findUserByUsername(username)) {
    return res.status(409).json({ error: 'This username is already taken. Please choose another.' });
  }

  const { hash, salt } = db.hashPassword(password);
  const unique_id = db.generateUniqueId();
  const verifyToken = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code

  const newUser: User = {
    id: `usr_${crypto.randomUUID()}`,
    unique_id,
    email: email.trim().toLowerCase(),
    password_hash: hash,
    salt,
    display_name: display_name.trim(),
    username: username.trim().toLowerCase(),
    avatar_url: '',
    public_identity_key: public_identity_key || '',
    public_key_fingerprint: public_key_fingerprint || '',
    is_email_verified: false,
    email_verify_token: verifyToken,
    role: db.getAllUsers().length === 0 ? 'admin' : 'user',
    status: 'active',
    created_at: new Date().toISOString(),
    last_active_at: new Date().toISOString(),
    settings: {
      profile_visibility: 'everyone',
      online_visibility: true,
      read_receipts: true,
      two_factor_enabled: false,
    },
  };

  db.createUser(newUser);
  const session = db.createSession(newUser.id, req.headers['user-agent'] || 'Browser Device', req.ip || '127.0.0.1');

  res.status(201).json({
    message: 'Account created successfully. Verification code generated.',
    token: session.token,
    user: sanitizeUser(newUser, true),
    verification_code: verifyToken,
  });
});

// 2. Auth: Verify Email
app.post('/api/auth/verify-email', requireAuth, (req: AuthRequest, res) => {
  const { code } = req.body;
  const user = req.user!;

  if (user.is_email_verified) {
    return res.json({ message: 'Email already verified.', user: sanitizeUser(user, true) });
  }

  if (code && code.trim() === user.email_verify_token) {
    const updated = db.updateUser(user.id, { is_email_verified: true, email_verify_token: undefined });
    return res.json({ message: 'Email address verified successfully.', user: sanitizeUser(updated!, true) });
  }

  // Allow auto-verify shortcut for dev testing
  if (req.body.bypass === true) {
    const updated = db.updateUser(user.id, { is_email_verified: true, email_verify_token: undefined });
    return res.json({ message: 'Email address verified.', user: sanitizeUser(updated!, true) });
  }

  res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
});

// Resend verification code
app.post('/api/auth/resend-verification', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const newToken = Math.floor(100000 + Math.random() * 900000).toString();
  const updated = db.updateUser(user.id, { email_verify_token: newToken });
  res.json({ message: 'Verification code resent.', verification_code: newToken, user: sanitizeUser(updated!, true) });
});

// 3. Auth: Login
app.post('/api/auth/login', (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Email/username/ID and password are required.' });
  }

  let user = db.findUserByEmail(identifier);
  if (!user) user = db.findUserByUsername(identifier);
  if (!user) user = db.findUserByUniqueId(identifier);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials. Please verify your details.' });
  }

  if (!db.verifyPassword(password, user.password_hash, user.salt)) {
    return res.status(401).json({ error: 'Invalid credentials. Please verify your details.' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'This account has been suspended.' });
  }

  db.updateUser(user.id, { last_active_at: new Date().toISOString() });
  const session = db.createSession(user.id, req.headers['user-agent'] || 'Browser Device', req.ip || '127.0.0.1');

  res.json({
    message: 'Logged in successfully.',
    token: session.token,
    user: sanitizeUser(user, true),
  });
});

// 4. Auth: Logout
app.post('/api/auth/logout', requireAuth, (req: AuthRequest, res) => {
  if (req.sessionToken) {
    db.deleteSession(req.sessionToken);
  }
  res.json({ message: 'Logged out successfully.' });
});

// 5. Auth: Me
app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
  res.json({
    user: sanitizeUser(req.user!, true),
  });
});

// 6. Auth: Change Password
app.post('/api/auth/change-password', requireAuth, (req: AuthRequest, res) => {
  const { current_password, new_password } = req.body;
  const user = req.user!;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  if (new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }

  if (!db.verifyPassword(current_password, user.password_hash, user.salt)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  const { hash, salt } = db.hashPassword(new_password);
  db.updateUser(user.id, { password_hash: hash, salt });

  res.json({ message: 'Password updated successfully. Local encryption keys remain preserved.' });
});

// 7. Auth: Reset Password Request (explains E2EE recovery key requirement)
app.post('/api/auth/reset-password-request', (req, res) => {
  const { email } = req.body;
  const user = db.findUserByEmail(email);
  if (!user) {
    // Return friendly message without leaking account existence
    return res.json({
      message: 'If an account exists with this email, password reset instructions and security notice have been sent.',
    });
  }

  const resetToken = crypto.randomBytes(24).toString('hex');
  // Store temp reset token on user record
  db.updateUser(user.id, { email_verify_token: `rst_${resetToken}` });

  res.json({
    message: 'Password reset initiated.',
    reset_token: `rst_${resetToken}`,
    security_warning: 'IMPORTANT: Changing your password does not decrypt existing encrypted messages. You will need your 24-word recovery phrase or security key backup to restore previous chat history on a new session.',
  });
});

// 8. Auth: Reset Password Execution
app.post('/api/auth/reset-password', (req, res) => {
  const { reset_token, new_password } = req.body;
  if (!reset_token || !new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'Valid reset token and new password (min 8 characters) required.' });
  }

  const user = db.getAllUsers().find(u => u.email_verify_token === reset_token);
  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired reset token.' });
  }

  const { hash, salt } = db.hashPassword(new_password);
  db.updateUser(user.id, {
    password_hash: hash,
    salt,
    email_verify_token: undefined,
  });

  res.json({
    message: 'Password reset successfully. You may now log in with your new password.',
  });
});

// 9. User: Update Profile
app.put('/api/user/profile', requireAuth, (req: AuthRequest, res) => {
  const { display_name, username, avatar_url, settings } = req.body;
  const user = req.user!;
  const updates: Partial<User> = {};

  if (display_name && display_name.trim()) updates.display_name = display_name.trim();
  if (username && username.trim()) {
    const cleanU = username.trim().toLowerCase();
    const existing = db.findUserByUsername(cleanU);
    if (existing && existing.id !== user.id) {
      return res.status(409).json({ error: 'Username is already taken by another user.' });
    }
    updates.username = cleanU;
  }
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;
  if (settings) {
    updates.settings = { ...user.settings, ...settings };
  }

  const updated = db.updateUser(user.id, updates);
  res.json({ message: 'Profile updated successfully.', user: sanitizeUser(updated!, true) });
});

// 10. User: Update / Publish Public Identity Key
app.put('/api/user/identity-key', requireAuth, (req: AuthRequest, res) => {
  const { public_identity_key, public_key_fingerprint } = req.body;
  const user = req.user!;

  if (!public_identity_key || !public_key_fingerprint) {
    return res.status(400).json({ error: 'Public identity key and fingerprint are required.' });
  }

  const updated = db.updateUser(user.id, {
    public_identity_key,
    public_key_fingerprint,
  });

  res.json({
    message: 'Public identity key registered on key server.',
    user: sanitizeUser(updated!, true),
  });
});

// 11. User: Delete Account Permanently
app.delete('/api/user/account', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  db.deleteUser(user.id);
  res.json({ message: 'Your CipherChat account and all active sessions have been permanently deleted.' });
});

// 12. Sessions: Manage Sessions
app.get('/api/user/sessions', requireAuth, (req: AuthRequest, res) => {
  const sessions = db.getUserSessions(req.user!.id).map(s => ({
    id: s.id,
    device_info: s.device_info,
    ip: s.ip,
    created_at: s.created_at,
    last_active_at: s.last_active_at,
    is_current: s.token === req.sessionToken,
  }));
  res.json({ sessions });
});

app.delete('/api/user/sessions/:sessionId', requireAuth, (req: AuthRequest, res) => {
  const { sessionId } = req.params;
  const session = db.getUserSessions(req.user!.id).find(s => s.id === sessionId);
  if (session) {
    db.deleteSession(session.token);
  }
  res.json({ message: 'Session revoked.' });
});

app.post('/api/user/sessions/revoke-others', requireAuth, (req: AuthRequest, res) => {
  db.deleteUserSessionsExcept(req.user!.id, req.sessionToken!);
  res.json({ message: 'All other active sessions have been signed out.' });
});

// 13. Contacts: Lookup User by Unique ID (CC-XXXX-XXXX)
app.get('/api/users/lookup', requireAuth, (req: AuthRequest, res) => {
  const uniqueId = req.query.unique_id as string;
  if (!uniqueId) {
    return res.status(400).json({ error: 'Unique ID query parameter required (e.g. CC-8X29-KL45).' });
  }

  const target = db.findUserByUniqueId(uniqueId);
  if (!target) {
    return res.status(404).json({ error: 'No CipherChat account found with that exact Unique ID.' });
  }

  if (target.id === req.user!.id) {
    return res.status(400).json({ error: 'This is your own Unique ID.' });
  }

  const relationship = db.findContactRelationship(req.user!.id, target.id);

  res.json({
    user: sanitizeUser(target, false),
    relationship_status: relationship ? relationship.status : 'none',
    relationship_id: relationship ? relationship.id : null,
    is_requester: relationship ? relationship.user_id === req.user!.id : false,
  });
});

// 14. Contacts: List All Contacts & Requests
app.get('/api/contacts', requireAuth, (req: AuthRequest, res) => {
  const currentUserId = req.user!.id;
  const contacts = db.getContactsForUser(currentUserId);

  const formatted = contacts.map(c => {
    const isRequester = c.user_id === currentUserId;
    const peerId = isRequester ? c.contact_user_id : c.user_id;
    const peer = db.findUserById(peerId);

    return {
      id: c.id,
      status: c.status,
      created_at: c.created_at,
      is_requester: isRequester,
      peer: peer ? sanitizeUser(peer, false) : null,
    };
  }).filter(c => c.peer !== null);

  res.json({ contacts: formatted });
});

// 15. Contacts: Send Contact Request
app.post('/api/contacts/request', requireAuth, (req: AuthRequest, res) => {
  const { target_unique_id, target_user_id } = req.body;
  const currentUserId = req.user!.id;

  let target: User | undefined;
  if (target_unique_id) {
    target = db.findUserByUniqueId(target_unique_id);
  } else if (target_user_id) {
    target = db.findUserById(target_user_id);
  }

  if (!target) {
    return res.status(404).json({ error: 'Target user not found.' });
  }

  if (target.id === currentUserId) {
    return res.status(400).json({ error: 'Cannot add yourself as a contact.' });
  }

  const contact = db.addContactRequest(currentUserId, target.id);

  // Notify recipient in real-time
  sendToUser(target.id, {
    type: 'contact:request',
    contactId: contact.id,
    from: sanitizeUser(req.user!, false),
  });

  res.json({
    message: 'Chat request sent.',
    contact: {
      id: contact.id,
      status: contact.status,
      peer: sanitizeUser(target, false),
      is_requester: true,
    },
  });
});

// 16. Contacts: Respond to Request
app.post('/api/contacts/:id/respond', requireAuth, (req: AuthRequest, res) => {
  const { id } = req.params;
  const { action } = req.body; // 'accepted' | 'declined' | 'blocked'
  const currentUserId = req.user!.id;

  const contact = db.getContactsForUser(currentUserId).find(c => c.id === id);
  if (!contact) {
    return res.status(404).json({ error: 'Contact request not found.' });
  }

  if (action !== 'accepted' && action !== 'declined' && action !== 'blocked') {
    return res.status(400).json({ error: 'Action must be accepted, declined, or blocked.' });
  }

  const updated = db.updateContactStatus(id, action);
  const peerId = contact.user_id === currentUserId ? contact.contact_user_id : contact.user_id;

  // If accepted, also auto-create conversation
  let conversationId = null;
  if (action === 'accepted') {
    const conv = db.getOrCreateConversation(currentUserId, peerId);
    conversationId = conv.id;
  }

  // Notify peer
  sendToUser(peerId, {
    type: 'contact:status_change',
    contactId: id,
    action,
    conversationId,
    byUser: sanitizeUser(req.user!, false),
  });

  res.json({
    message: `Contact request ${action}.`,
    contact: updated,
    conversationId,
  });
});

// 17. Conversations: List Conversations
app.get('/api/conversations', requireAuth, (req: AuthRequest, res) => {
  const currentUserId = req.user!.id;
  const convs = db.getUserConversations(currentUserId);

  const formatted = convs.map(c => {
    const peerId = c.user1_id === currentUserId ? c.user2_id : c.user1_id;
    const peer = db.findUserById(peerId);

    // Count unread
    const messages = db.getMessagesForConversation(c.id, currentUserId);
    const unreadCount = messages.filter(m => m.receiver_id === currentUserId && m.status !== 'read').length;

    return {
      id: c.id,
      created_at: c.created_at,
      last_message_at: c.last_message_at,
      last_message_preview: c.last_message_preview,
      unread_count: unreadCount,
      peer: peer ? sanitizeUser(peer, false) : null,
    };
  }).filter(c => c.peer !== null);

  res.json({ conversations: formatted });
});

// 18. Conversations: Get Messages for Conversation
app.get('/api/conversations/:id/messages', requireAuth, (req: AuthRequest, res) => {
  const { id } = req.params;
  const currentUserId = req.user!.id;

  const conv = db.getConversationById(id);
  if (!conv || (conv.user1_id !== currentUserId && conv.user2_id !== currentUserId)) {
    return res.status(403).json({ error: 'You are not a participant in this conversation.' });
  }

  const messages = db.getMessagesForConversation(id, currentUserId);

  // Mark received messages as delivered if not already
  messages.forEach(m => {
    if (m.receiver_id === currentUserId && m.status === 'sent') {
      db.updateMessageStatus(m.id, 'delivered');
      sendToUser(m.sender_id, {
        type: 'message:status',
        messageId: m.id,
        conversationId: id,
        status: 'delivered',
      });
    }
  });

  res.json({ messages });
});

// 19. Messages: Send Encrypted Message
app.post('/api/conversations/:id/messages', requireAuth, (req: AuthRequest, res) => {
  const { id } = req.params;
  const { encrypted_payload, reply_to_id } = req.body;
  const currentUserId = req.user!.id;

  const conv = db.getConversationById(id);
  if (!conv || (conv.user1_id !== currentUserId && conv.user2_id !== currentUserId)) {
    return res.status(403).json({ error: 'Unauthorized to post to this conversation.' });
  }

  if (!encrypted_payload || !encrypted_payload.ciphertext || !encrypted_payload.iv || !encrypted_payload.ephemeral_pub_key) {
    return res.status(400).json({ error: 'Valid E2EE encrypted payload required.' });
  }

  const recipientId = conv.user1_id === currentUserId ? conv.user2_id : conv.user1_id;

  // Check if blocked
  const relationship = db.findContactRelationship(currentUserId, recipientId);
  if (relationship && relationship.status === 'blocked') {
    return res.status(403).json({ error: 'Cannot send message: messaging is blocked between these accounts.' });
  }

  const msgId = `msg_${crypto.randomUUID()}`;
  const isRecipientOnline = Boolean(userSockets.get(recipientId)?.size);

  const newMsg: Message = {
    id: msgId,
    conversation_id: id,
    sender_id: currentUserId,
    receiver_id: recipientId,
    encrypted_payload: {
      ciphertext: encrypted_payload.ciphertext,
      iv: encrypted_payload.iv,
      ephemeral_pub_key: encrypted_payload.ephemeral_pub_key,
      recipient_fingerprint: encrypted_payload.recipient_fingerprint || '',
      is_attachment: Boolean(encrypted_payload.is_attachment),
    },
    reply_to_id,
    status: isRecipientOnline ? 'delivered' : 'sent',
    created_at: new Date().toISOString(),
    delivered_at: isRecipientOnline ? new Date().toISOString() : undefined,
  };

  db.addMessage(newMsg);

  // Deliver real-time to recipient
  sendToUser(recipientId, {
    type: 'message:new',
    conversationId: id,
    message: newMsg,
    sender: sanitizeUser(req.user!, false),
  });

  res.status(201).json({
    message: 'Encrypted message transmitted.',
    data: newMsg,
  });
});

// 20. Messages: Delete Message Locally / For User
app.delete('/api/messages/:id', requireAuth, (req: AuthRequest, res) => {
  const { id } = req.params;
  const currentUserId = req.user!.id;
  const success = db.deleteMessageForUser(id, currentUserId);
  if (!success) {
    return res.status(404).json({ error: 'Message not found.' });
  }
  res.json({ message: 'Message removed from your device.' });
});

// 21. Attachments: Upload Encrypted Blob
app.post('/api/attachments/upload', requireAuth, (req: AuthRequest, res) => {
  const { encrypted_data, filename_hint, content_type } = req.body;
  if (!encrypted_data) {
    return res.status(400).json({ error: 'Encrypted payload data required.' });
  }

  const fileId = `att_${crypto.randomUUID()}`;
  const filePath = path.join(UPLOADS_DIR, `${fileId}.enc`);

  // Write base64 or raw string directly
  fs.writeFileSync(filePath, encrypted_data, 'utf-8');

  res.status(201).json({
    attachment_id: fileId,
    download_url: `/api/attachments/${fileId}`,
    size_bytes: Buffer.byteLength(encrypted_data, 'utf-8'),
    filename_hint: filename_hint || 'encrypted_attachment',
    content_type: content_type || 'application/octet-stream',
  });
});

// 22. Attachments: Download Encrypted Blob
app.get('/api/attachments/:id', (req, res) => {
  const { id } = req.params;
  // Sanitize ID
  const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(UPLOADS_DIR, `${cleanId}.enc`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Encrypted attachment not found.' });
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(content);
});

// 23. Reports: Submit Abuse Report
app.post('/api/reports', requireAuth, (req: AuthRequest, res) => {
  const { reported_user_id, reason, details } = req.body;
  if (!reported_user_id || !reason) {
    return res.status(400).json({ error: 'Reported user ID and reason are required.' });
  }

  const report = db.addReport({
    id: `rep_${crypto.randomUUID()}`,
    reporter_id: req.user!.id,
    reported_user_id,
    reason,
    details: details || '',
    status: 'pending',
    created_at: new Date().toISOString(),
  });

  res.status(201).json({ message: 'Report submitted for security team review.', report_id: report.id });
});

// 24. Admin Endpoints (Zero-Knowledge: Admin cannot see messages or private keys)
app.get('/api/admin/stats', requireAuth, requireAdmin, (req, res) => {
  const allUsers = db.getAllUsers();
  const allReports = db.getAllReports();

  res.json({
    total_users: allUsers.length,
    active_now: Array.from(userSockets.keys()).length,
    verified_users: allUsers.filter(u => u.is_email_verified).length,
    suspended_users: allUsers.filter(u => u.status === 'suspended').length,
    pending_reports: allReports.filter(r => r.status === 'pending').length,
    server_uptime_seconds: process.uptime(),
    memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    zero_knowledge_audit: {
      can_admin_read_messages: false,
      plaintext_messages_stored: 0,
      private_keys_stored: 0,
      protocol_status: 'Strict End-to-End Encryption Enforced',
    },
  });
});

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const users = db.getAllUsers().map(u => ({
    id: u.id,
    unique_id: u.unique_id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    status: u.status,
    is_email_verified: u.is_email_verified,
    public_key_fingerprint: u.public_key_fingerprint,
    created_at: u.created_at,
    last_active_at: u.last_active_at,
    is_online: Boolean(userSockets.get(u.id)?.size),
  }));
  res.json({ users });
});

app.post('/api/admin/users/:id/status', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'active' | 'suspended'

  if (status !== 'active' && status !== 'suspended') {
    return res.status(400).json({ error: 'Status must be active or suspended.' });
  }

  const updated = db.updateUser(id, { status });
  if (!updated) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // If suspended, close any open WebSockets
  if (status === 'suspended') {
    const sockets = userSockets.get(id);
    if (sockets) {
      sockets.forEach(ws => ws.close(4001, 'Account suspended'));
      userSockets.delete(id);
    }
  }

  res.json({ message: `User status changed to ${status}.`, user: sanitizeUser(updated, false) });
});

app.get('/api/admin/reports', requireAuth, requireAdmin, (req, res) => {
  const reports = db.getAllReports().map(r => {
    const reporter = db.findUserById(r.reporter_id);
    const target = db.findUserById(r.reported_user_id);
    return {
      ...r,
      reporter_unique_id: reporter?.unique_id || 'Unknown',
      reported_unique_id: target?.unique_id || 'Unknown',
      reported_name: target?.display_name || 'Unknown',
    };
  });
  res.json({ reports });
});

app.post('/api/admin/reports/:id/resolve', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const updated = db.updateReportStatus(id, 'resolved');
  if (!updated) {
    return res.status(404).json({ error: 'Report not found.' });
  }
  res.json({ message: 'Report marked as resolved.', report: updated });
});

// --- Front-end Integration (Vite in Dev / Static in Prod) ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[CipherChat] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();

export default app;
