export interface PublicUser {
  id: string;
  unique_id: string; // CC-XXXX-XXXX
  display_name: string;
  username: string;
  avatar_url: string;
  public_identity_key: string;
  public_key_fingerprint: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  created_at: string;
  last_active_at: string | null;
  is_online?: boolean;
}

export interface AuthUser extends PublicUser {
  email: string;
  is_email_verified: boolean;
  email_verify_token?: string;
  settings: {
    profile_visibility: 'everyone' | 'contacts' | 'nobody';
    online_visibility: boolean;
    read_receipts: boolean;
    two_factor_enabled: boolean;
  };
}

export interface ContactItem {
  id: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  created_at: string;
  is_requester: boolean;
  peer: PublicUser;
}

export interface ConversationItem {
  id: string;
  created_at: string;
  last_message_at: string;
  last_message_preview?: string;
  unread_count: number;
  peer: PublicUser;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  ephemeral_pub_key: string;
  recipient_fingerprint: string;
  is_attachment?: boolean;
}

export interface AttachmentMetadata {
  fileId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  fileKeyBase64: string;
  ivBase64: string;
  downloadUrl: string;
}

export interface MessageItem {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  encrypted_payload: EncryptedPayload;
  reply_to_id?: string;
  status: 'sent' | 'delivered' | 'read';
  created_at: string;
  delivered_at?: string;
  read_at?: string;

  // Client-decrypted properties
  decryptedText?: string;
  decryptionError?: string;
  attachment?: AttachmentMetadata;
  attachmentBlobUrl?: string;
}

export interface UserSession {
  id: string;
  device_info: string;
  ip: string;
  created_at: string;
  last_active_at: string;
  is_current: boolean;
}
