import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'cipherchat_db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface User {
  id: string;
  unique_id: string; // CC-XXXX-XXXX
  email: string;
  password_hash: string;
  salt: string;
  display_name: string;
  username: string;
  avatar_url: string;
  public_identity_key: string; // Client's public ECDH identity key (JWK JSON string)
  public_key_fingerprint: string;
  recovery_key_hash?: string;
  is_email_verified: boolean;
  email_verify_token?: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  created_at: string;
  last_active_at: string;
  settings: {
    profile_visibility: 'everyone' | 'contacts' | 'nobody';
    online_visibility: boolean;
    read_receipts: boolean;
    two_factor_enabled: boolean;
    two_factor_secret?: string;
  };
}

export interface Contact {
  id: string;
  user_id: string; // requester
  contact_user_id: string; // recipient
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  last_message_at: string;
  last_message_preview?: string; // e.g. "🔒 Encrypted Message"
}

export interface EncryptedMessagePayload {
  ciphertext: string;       // Base64 encrypted message content (AES-256-GCM)
  iv: string;               // 12-byte initialization vector (Base64)
  ephemeral_pub_key: string;// Ephemeral ECDH public key (JWK JSON string)
  recipient_fingerprint: string; // Recipient identity key fingerprint
  is_attachment?: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  encrypted_payload: EncryptedMessagePayload;
  reply_to_id?: string;
  status: 'sent' | 'delivered' | 'read';
  created_at: string;
  delivered_at?: string;
  read_at?: string;
  is_deleted_for_sender?: boolean;
  is_deleted_for_receiver?: boolean;
}

export interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
  details: string;
  status: 'pending' | 'resolved';
  created_at: string;
}

export interface Session {
  id: string;
  token: string;
  user_id: string;
  device_info: string;
  ip: string;
  created_at: string;
  last_active_at: string;
}

export interface DatabaseSchema {
  users: User[];
  contacts: Contact[];
  conversations: Conversation[];
  messages: Message[];
  reports: Report[];
  sessions: Session[];
}

const INITIAL_DB: DatabaseSchema = {
  users: [],
  contacts: [],
  conversations: [],
  messages: [],
  reports: [],
  sessions: [],
};

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
    this.seedDefaultData();
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        return { ...INITIAL_DB, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.error('Error loading DB from file, using initial data:', e);
    }
    return { ...INITIAL_DB };
  }

  private save(): void {
    try {
      const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempFile, DB_FILE);
    } catch (e) {
      console.error('Error writing DB to file:', e);
    }
  }

  // Generate Unique ID format CC-XXXX-XXXX
  public generateUniqueId(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const getPart = () => {
      let res = '';
      const bytes = crypto.randomBytes(4);
      for (let i = 0; i < 4; i++) {
        res += chars[bytes[i] % chars.length];
      }
      return res;
    };

    let uniqueId = '';
    let exists = true;
    while (exists) {
      uniqueId = `CC-${getPart()}-${getPart()}`;
      exists = this.data.users.some(u => u.unique_id === uniqueId);
    }
    return uniqueId;
  }

  // Password hashing with standard Node scrypt
  public hashPassword(password: string): { hash: string; salt: string } {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { hash, salt };
  }

  public verifyPassword(password: string, hash: string, salt: string): boolean {
    const calculated = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(calculated));
  }

  // User methods
  public findUserById(id: string): User | undefined {
    return this.data.users.find(u => u.id === id);
  }

  public findUserByUniqueId(uniqueId: string): User | undefined {
    const cleanId = uniqueId.trim().toUpperCase();
    return this.data.users.find(u => u.unique_id.toUpperCase() === cleanId);
  }

  public findUserByEmail(email: string): User | undefined {
    const cleanEmail = email.trim().toLowerCase();
    return this.data.users.find(u => u.email.toLowerCase() === cleanEmail);
  }

  public findUserByUsername(username: string): User | undefined {
    const cleanUsername = username.trim().toLowerCase();
    return this.data.users.find(u => u.username.toLowerCase() === cleanUsername);
  }

  public createUser(user: User): User {
    this.data.users.push(user);
    this.save();
    return user;
  }

  public updateUser(id: string, updates: Partial<User>): User | undefined {
    const user = this.findUserById(id);
    if (!user) return undefined;
    Object.assign(user, updates);
    this.save();
    return user;
  }

  public getAllUsers(): User[] {
    return this.data.users;
  }

  public deleteUser(id: string): boolean {
    const idx = this.data.users.findIndex(u => u.id === id);
    if (idx === -1) return false;
    this.data.users.splice(idx, 1);
    // clean sessions
    this.data.sessions = this.data.sessions.filter(s => s.user_id !== id);
    // clean contacts
    this.data.contacts = this.data.contacts.filter(c => c.user_id !== id && c.contact_user_id !== id);
    this.save();
    return true;
  }

  // Sessions
  public createSession(userId: string, deviceInfo = 'Browser', ip = '127.0.0.1'): Session {
    const session: Session = {
      id: crypto.randomUUID(),
      token: crypto.randomBytes(32).toString('hex'),
      user_id: userId,
      device_info: deviceInfo,
      ip,
      created_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
    };
    this.data.sessions.push(session);
    this.save();
    return session;
  }

  public findSessionByToken(token: string): Session | undefined {
    return this.data.sessions.find(s => s.token === token);
  }

  public deleteSession(token: string): void {
    this.data.sessions = this.data.sessions.filter(s => s.token !== token);
    this.save();
  }

  public deleteUserSessionsExcept(userId: string, currentToken: string): void {
    this.data.sessions = this.data.sessions.filter(s => s.user_id !== userId || s.token === currentToken);
    this.save();
  }

  public getUserSessions(userId: string): Session[] {
    return this.data.sessions.filter(s => s.user_id === userId);
  }

  // Contacts
  public getContactsForUser(userId: string): Contact[] {
    return this.data.contacts.filter(c => c.user_id === userId || c.contact_user_id === userId);
  }

  public findContactRelationship(userA: string, userB: string): Contact | undefined {
    return this.data.contacts.find(
      c => (c.user_id === userA && c.contact_user_id === userB) ||
           (c.user_id === userB && c.contact_user_id === userA)
    );
  }

  public addContactRequest(userId: string, targetUserId: string): Contact {
    let existing = this.findContactRelationship(userId, targetUserId);
    if (existing) {
      if (existing.status === 'declined') {
        existing.status = 'pending';
        existing.user_id = userId;
        existing.contact_user_id = targetUserId;
        existing.updated_at = new Date().toISOString();
        this.save();
      }
      return existing;
    }
    const contact: Contact = {
      id: crypto.randomUUID(),
      user_id: userId,
      contact_user_id: targetUserId,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.data.contacts.push(contact);
    this.save();
    return contact;
  }

  public updateContactStatus(id: string, status: 'accepted' | 'declined' | 'blocked'): Contact | undefined {
    const contact = this.data.contacts.find(c => c.id === id);
    if (!contact) return undefined;
    contact.status = status;
    contact.updated_at = new Date().toISOString();
    this.save();
    return contact;
  }

  // Conversations
  public findConversation(userA: string, userB: string): Conversation | undefined {
    return this.data.conversations.find(
      c => (c.user1_id === userA && c.user2_id === userB) ||
           (c.user1_id === userB && c.user2_id === userA)
    );
  }

  public getConversationById(id: string): Conversation | undefined {
    return this.data.conversations.find(c => c.id === id);
  }

  public getOrCreateConversation(userA: string, userB: string): Conversation {
    let conv = this.findConversation(userA, userB);
    if (!conv) {
      conv = {
        id: crypto.randomUUID(),
        user1_id: userA,
        user2_id: userB,
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        last_message_preview: '🔒 Conversation established',
      };
      this.data.conversations.push(conv);
      this.save();
    }
    return conv;
  }

  public getUserConversations(userId: string): Conversation[] {
    return this.data.conversations
      .filter(c => c.user1_id === userId || c.user2_id === userId)
      .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
  }

  // Messages
  public addMessage(msg: Message): Message {
    this.data.messages.push(msg);
    // Update conversation last_message_at
    const conv = this.getConversationById(msg.conversation_id);
    if (conv) {
      conv.last_message_at = msg.created_at;
      conv.last_message_preview = '🔒 Encrypted message';
    }
    this.save();
    return msg;
  }

  public getMessagesForConversation(convId: string, userId: string): Message[] {
    return this.data.messages.filter(m => {
      if (m.conversation_id !== convId) return false;
      if (m.sender_id === userId && m.is_deleted_for_sender) return false;
      if (m.receiver_id === userId && m.is_deleted_for_receiver) return false;
      return true;
    }).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  public getMessageById(id: string): Message | undefined {
    return this.data.messages.find(m => m.id === id);
  }

  public updateMessageStatus(id: string, status: 'delivered' | 'read'): Message | undefined {
    const msg = this.getMessageById(id);
    if (!msg) return undefined;
    msg.status = status;
    if (status === 'delivered') msg.delivered_at = new Date().toISOString();
    if (status === 'read') msg.read_at = new Date().toISOString();
    this.save();
    return msg;
  }

  public deleteMessageForUser(id: string, userId: string): boolean {
    const msg = this.getMessageById(id);
    if (!msg) return false;
    if (msg.sender_id === userId) {
      msg.is_deleted_for_sender = true;
    }
    if (msg.receiver_id === userId) {
      msg.is_deleted_for_receiver = true;
    }
    this.save();
    return true;
  }

  // Reports
  public addReport(report: Report): Report {
    this.data.reports.push(report);
    this.save();
    return report;
  }

  public getAllReports(): Report[] {
    return this.data.reports;
  }

  public updateReportStatus(id: string, status: 'pending' | 'resolved'): Report | undefined {
    const r = this.data.reports.find(x => x.id === id);
    if (!r) return undefined;
    r.status = status;
    this.save();
    return r;
  }

  // Seed default admin and demo user
  private seedDefaultData(): void {
    if (this.data.users.length === 0) {
      const adminPass = this.hashPassword('CipherAdmin2026!');
      const adminUser: User = {
        id: 'user_admin_001',
        unique_id: 'CC-9X88-ADM1',
        email: 'admin@cipherchat.internal',
        password_hash: adminPass.hash,
        salt: adminPass.salt,
        display_name: 'CipherChat Security Team',
        username: 'security_admin',
        avatar_url: '',
        public_identity_key: '',
        public_key_fingerprint: 'CC-ADM1-SEC-FINGERPRINT',
        is_email_verified: true,
        role: 'admin',
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
      this.data.users.push(adminUser);
      this.save();
    }
  }
}

export const db = new Database();
