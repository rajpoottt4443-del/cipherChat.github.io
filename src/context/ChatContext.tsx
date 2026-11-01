import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { ConversationItem, ContactItem, MessageItem, PublicUser } from '../types/index.ts';
import { api } from '../services/api.ts';
import { socketService } from '../services/socket.ts';
import { useAuth } from './AuthContext.tsx';
import {
  encryptMessagePayload,
  decryptMessagePayload,
  encryptFileAttachment,
  decryptFileAttachment,
} from '../crypto/cipherCrypto.ts';

interface ChatContextType {
  conversations: ConversationItem[];
  contacts: ContactItem[];
  activeConversation: ConversationItem | null;
  messages: MessageItem[];
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  typingPeers: Record<string, boolean>; // convId -> boolean
  onlineUsers: Record<string, boolean>; // userId -> boolean
  replyingToMessage: MessageItem | null;
  setReplyingToMessage: (msg: MessageItem | null) => void;
  selectConversation: (conv: ConversationItem | null) => void;
  refreshConversations: () => Promise<void>;
  refreshContacts: () => Promise<void>;
  sendMessage: (text: string, replyToId?: string) => Promise<void>;
  sendAttachment: (file: File, caption?: string) => Promise<void>;
  deleteMessageLocally: (messageId: string) => Promise<void>;
  sendTypingSignal: (isTyping: boolean) => void;
  startChatWithUser: (targetUser: PublicUser) => Promise<ConversationItem>;
  respondToContactRequest: (contactId: string, action: 'accepted' | 'declined' | 'blocked') => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, identityPrivateKey, identityPublicKeyJWK } = useAuth();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [typingPeers, setTypingPeers] = useState<Record<string, boolean>>({});
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const [replyingToMessage, setReplyingToMessage] = useState<MessageItem | null>(null);

  const activeConvRef = useRef<ConversationItem | null>(null);
  activeConvRef.current = activeConversation;

  // Helper: Decrypt a single raw message item
  const decryptMessage = useCallback(
    async (
      msg: MessageItem,
      peerPubJWK: string,
      myPrivKey: CryptoKey,
      myPubJWK: string
    ): Promise<MessageItem> => {
      // If already decrypted, return
      if (msg.decryptedText) return msg;

      try {
        const isFromMe = msg.sender_id === user?.id;
        const senderPubJWK = isFromMe ? myPubJWK : peerPubJWK;

        // Decrypt with Web Crypto
        const decryptedJsonString = await decryptMessagePayload(
          msg.encrypted_payload.ciphertext,
          msg.encrypted_payload.iv,
          msg.encrypted_payload.ephemeral_pub_key,
          senderPubJWK,
          myPrivKey
        );

        let parsedPayload: any;
        try {
          parsedPayload = JSON.parse(decryptedJsonString);
        } catch {
          parsedPayload = { text: decryptedJsonString };
        }

        const updated: MessageItem = {
          ...msg,
          decryptedText: parsedPayload.text || '',
        };

        // Handle client-side encrypted attachment
        if (parsedPayload.attachment) {
          updated.attachment = parsedPayload.attachment;
          try {
            // Fetch encrypted blob from server
            const encryptedData = await api.attachments.download(parsedPayload.attachment.fileId);
            // Decrypt file bytes in browser
            const decryptedBlob = await decryptFileAttachment(
              encryptedData,
              parsedPayload.attachment.fileKeyBase64,
              parsedPayload.attachment.ivBase64,
              parsedPayload.attachment.contentType
            );
            updated.attachmentBlobUrl = URL.createObjectURL(decryptedBlob);
          } catch (fileErr) {
            console.warn('Failed to decrypt attachment:', fileErr);
          }
        }

        return updated;
      } catch (err: any) {
        console.warn('Message decryption error:', err);
        return {
          ...msg,
          decryptedText: '[🔒 Encrypted message: Key verification in progress or new identity generated]',
          decryptionError: err.message || 'Decryption failed',
        };
      }
    },
    [user]
  );

  // Load conversations
  const refreshConversations = useCallback(async () => {
    if (!user) return;
    setIsLoadingConversations(true);
    try {
      const { conversations: list } = await api.conversations.list();
      setConversations(list);

      // Check online status of peers
      const peerIds = list.map(c => c.peer.id);
      if (peerIds.length > 0) {
        socketService.checkPresence(peerIds);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [user]);

  // Load contacts
  const refreshContacts = useCallback(async () => {
    if (!user) return;
    try {
      const { contacts: list } = await api.contacts.list();
      setContacts(list);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    if (user) {
      refreshConversations();
      refreshContacts();
    } else {
      setConversations([]);
      setContacts([]);
      setActiveConversation(null);
      setMessages([]);
    }
  }, [user, refreshConversations, refreshContacts]);

  // Load and decrypt messages when active conversation changes
  useEffect(() => {
    let isCancelled = false;

    async function loadMessages() {
      if (!activeConversation || !identityPrivateKey || !identityPublicKeyJWK) {
        setMessages([]);
        return;
      }

      setIsLoadingMessages(true);
      try {
        const { messages: rawList } = await api.conversations.getMessages(activeConversation.id);

        const peerPubJWK = activeConversation.peer.public_identity_key;
        if (!peerPubJWK) {
          if (!isCancelled) setMessages(rawList);
          return;
        }

        // Decrypt all messages
        const decryptedList = await Promise.all(
          rawList.map(m => decryptMessage(m, peerPubJWK, identityPrivateKey, identityPublicKeyJWK))
        );

        if (!isCancelled) {
          setMessages(decryptedList);

          // Mark unread received messages as read
          decryptedList.forEach(m => {
            if (m.receiver_id === user?.id && m.status !== 'read') {
              socketService.sendReadReceipt(m.id, activeConversation.id);
            }
          });
        }
      } catch (err) {
        console.error('Failed to load messages for conversation:', err);
      } finally {
        if (!isCancelled) setIsLoadingMessages(false);
      }
    }

    loadMessages();

    return () => {
      isCancelled = true;
    };
  }, [activeConversation, identityPrivateKey, identityPublicKeyJWK, decryptMessage, user]);

  // Real-time WebSocket event listeners
  useEffect(() => {
    if (!user) return;

    // 1. New message
    const unsubMessage = socketService.on('message:new', async (data: any) => {
      const { conversationId, message, sender } = data;

      // Update conversations list preview
      setConversations(prev => {
        const existingIdx = prev.findIndex(c => c.id === conversationId);
        if (existingIdx !== -1) {
          const updated = [...prev];
          const curr = updated[existingIdx];
          const isCurrentlyActive = activeConvRef.current?.id === conversationId;

          updated[existingIdx] = {
            ...curr,
            last_message_at: message.created_at,
            last_message_preview: '🔒 Encrypted message',
            unread_count: isCurrentlyActive ? 0 : curr.unread_count + 1,
          };
          // Move to top
          const [item] = updated.splice(existingIdx, 1);
          return [item, ...updated];
        } else {
          // New conversation from contact
          refreshConversations();
          return prev;
        }
      });

      // If this conversation is currently open, decrypt and display immediately
      if (activeConvRef.current && activeConvRef.current.id === conversationId) {
        let displayMsg = message;
        if (identityPrivateKey && identityPublicKeyJWK && sender.public_identity_key) {
          displayMsg = await decryptMessage(
            message,
            sender.public_identity_key,
            identityPrivateKey,
            identityPublicKeyJWK
          );
        }

        setMessages(prev => {
          // Avoid duplicate
          if (prev.some(m => m.id === message.id)) return prev;
          return [...prev, displayMsg];
        });

        // Send read receipt
        socketService.sendReadReceipt(message.id, conversationId);
      }
    });

    // 2. Message status update (delivered, read)
    const unsubStatus = socketService.on('message:status', (data: any) => {
      const { messageId, status, readAt } = data;
      setMessages(prev =>
        prev.map(m => (m.id === messageId ? { ...m, status, read_at: readAt || m.read_at } : m))
      );
    });

    // 3. Typing indicator
    const unsubTypingStart = socketService.on('typing:start', (data: any) => {
      const { conversationId } = data;
      setTypingPeers(prev => ({ ...prev, [conversationId]: true }));
    });

    const unsubTypingStop = socketService.on('typing:stop', (data: any) => {
      const { conversationId } = data;
      setTypingPeers(prev => ({ ...prev, [conversationId]: false }));
    });

    // 4. Presence
    const unsubPresence = socketService.on('presence:update', (data: any) => {
      const { userId, isOnline } = data;
      setOnlineUsers(prev => ({ ...prev, [userId]: isOnline }));
    });

    const unsubPresenceResult = socketService.on('presence:result', (data: any) => {
      if (data.presence) {
        setOnlineUsers(prev => ({ ...prev, ...data.presence }));
      }
    });

    // 5. Contact request & updates
    const unsubContactReq = socketService.on('contact:request', () => {
      refreshContacts();
    });

    const unsubContactStatus = socketService.on('contact:status_change', () => {
      refreshContacts();
      refreshConversations();
    });

    return () => {
      unsubMessage();
      unsubStatus();
      unsubTypingStart();
      unsubTypingStop();
      unsubPresence();
      unsubPresenceResult();
      unsubContactReq();
      unsubContactStatus();
    };
  }, [user, identityPrivateKey, identityPublicKeyJWK, decryptMessage, refreshConversations, refreshContacts]);

  // Select conversation
  const selectConversation = (conv: ConversationItem | null) => {
    setActiveConversation(conv);
    setReplyingToMessage(null);
    if (conv) {
      // Mark as read in list
      setConversations(prev =>
        prev.map(c => (c.id === conv.id ? { ...c, unread_count: 0 } : c))
      );
    }
  };

  // Send plaintext message (End-to-End Encrypted!)
  const sendMessage = async (text: string, replyToId?: string) => {
    if (!activeConversation || !user || !identityPrivateKey || !identityPublicKeyJWK) {
      throw new Error('Active session and encryption keys required to send message.');
    }

    const peerPubJWK = activeConversation.peer.public_identity_key;
    if (!peerPubJWK) {
      throw new Error("Recipient hasn't published their public encryption key yet.");
    }

    const payloadObj = {
      text: text.trim(),
      timestamp: Date.now(),
    };

    // 1. Client-Side E2EE Encryption
    const encrypted = await encryptMessagePayload(
      JSON.stringify(payloadObj),
      peerPubJWK,
      identityPrivateKey
    );

    // 2. Send to server
    const { data: serverMsg } = await api.conversations.sendMessage(activeConversation.id, {
      encrypted_payload: encrypted,
      reply_to_id: replyToId,
    });

    // 3. Add to local state (with plaintext ready)
    const optimisticMsg: MessageItem = {
      ...serverMsg,
      decryptedText: text.trim(),
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setReplyingToMessage(null);

    // Update conversation preview
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === activeConversation.id);
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          last_message_at: serverMsg.created_at,
          last_message_preview: text.trim(),
        };
        const [item] = updated.splice(idx, 1);
        return [item, ...updated];
      }
      return prev;
    });
  };

  // Send file attachment (End-to-End Encrypted!)
  const sendAttachment = async (file: File, caption = '') => {
    if (!activeConversation || !user || !identityPrivateKey || !identityPublicKeyJWK) {
      throw new Error('Active session and encryption keys required.');
    }

    const peerPubJWK = activeConversation.peer.public_identity_key;
    if (!peerPubJWK) {
      throw new Error("Recipient hasn't registered an encryption key.");
    }

    // 1. Encrypt file client-side with AES-256-GCM
    const encryptedFileResult = await encryptFileAttachment(file);

    // 2. Upload opaque encrypted bytes to server
    const uploadRes = await api.attachments.upload(
      encryptedFileResult.encryptedBase64,
      file.name,
      file.type || 'application/octet-stream'
    );

    // 3. Encrypt file key & metadata inside the E2EE message body
    const payloadObj = {
      text: caption.trim() || `Sent attachment: ${file.name}`,
      timestamp: Date.now(),
      attachment: {
        fileId: uploadRes.attachment_id,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        fileKeyBase64: encryptedFileResult.fileKeyBase64,
        ivBase64: encryptedFileResult.ivBase64,
        downloadUrl: uploadRes.download_url,
      },
    };

    const encrypted = await encryptMessagePayload(
      JSON.stringify(payloadObj),
      peerPubJWK,
      identityPrivateKey
    );

    // 4. Send encrypted message
    const { data: serverMsg } = await api.conversations.sendMessage(activeConversation.id, {
      encrypted_payload: { ...encrypted, is_attachment: true },
    });

    const optimisticMsg: MessageItem = {
      ...serverMsg,
      decryptedText: payloadObj.text,
      attachment: payloadObj.attachment,
      attachmentBlobUrl: URL.createObjectURL(file), // locally accessible
    };

    setMessages(prev => [...prev, optimisticMsg]);

    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === activeConversation.id);
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          last_message_at: serverMsg.created_at,
          last_message_preview: `📎 ${file.name}`,
        };
        const [item] = updated.splice(idx, 1);
        return [item, ...updated];
      }
      return prev;
    });
  };

  // Delete message locally
  const deleteMessageLocally = async (messageId: string) => {
    await api.messages.delete(messageId);
    setMessages(prev => prev.filter(m => m.id !== messageId));
  };

  // Send typing signal
  const sendTypingSignal = (isTyping: boolean) => {
    if (activeConversation && user) {
      socketService.sendTyping(activeConversation.peer.id, activeConversation.id, isTyping);
    }
  };

  // Start chat with user
  const startChatWithUser = async (targetUser: PublicUser): Promise<ConversationItem> => {
    // Check if conversation already exists in list
    const existing = conversations.find(c => c.peer.id === targetUser.id);
    if (existing) {
      setActiveConversation(existing);
      return existing;
    }

    // Refresh conversations
    await refreshConversations();
    const found = conversations.find(c => c.peer.id === targetUser.id);
    if (found) {
      setActiveConversation(found);
      return found;
    }

    // Create temporary virtual conversation until message is sent
    const newConv: ConversationItem = {
      id: `conv_${Date.now()}`,
      created_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      last_message_preview: '🔒 Encrypted conversation ready',
      unread_count: 0,
      peer: targetUser,
    };
    setActiveConversation(newConv);
    return newConv;
  };

  // Respond to contact request
  const respondToContactRequest = async (contactId: string, action: 'accepted' | 'declined' | 'blocked') => {
    const res = await api.contacts.respond(contactId, action);
    await refreshContacts();
    await refreshConversations();
    if (action === 'accepted' && res.conversationId) {
      // Find and select the conversation
      const { conversations: updated } = await api.conversations.list();
      const match = updated.find(c => c.id === res.conversationId);
      if (match) {
        setActiveConversation(match);
      }
    }
  };

  return (
    <ChatContext.Provider
      value={{
        conversations,
        contacts,
        activeConversation,
        messages,
        isLoadingConversations,
        isLoadingMessages,
        typingPeers,
        onlineUsers,
        replyingToMessage,
        setReplyingToMessage,
        selectConversation,
        refreshConversations,
        refreshContacts,
        sendMessage,
        sendAttachment,
        deleteMessageLocally,
        sendTypingSignal,
        startChatWithUser,
        respondToContactRequest,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export function useChat(): ChatContextType {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
