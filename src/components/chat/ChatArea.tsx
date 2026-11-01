import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useChat } from '../../context/ChatContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { SafetyNumberModal } from '../modals/SafetyNumberModal.tsx';
import { ReportUserModal } from '../modals/ReportUserModal.tsx';
import { MessageItem } from '../../types/index.ts';
import {
  Send,
  Paperclip,
  Smile,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Check,
  CheckCheck,
  MoreVertical,
  Reply,
  Trash2,
  Copy,
  Download,
  FileText,
  X,
  ArrowLeft,
  Terminal,
  AlertTriangle,
} from 'lucide-react';

interface ChatAreaProps {
  onBackToSidebar?: () => void;
}

const COMMON_EMOJIS = ['👍', '❤️', '🔥', '😂', '🔐', '🛡️', '✨', '👋', '🙏', '🎉', '🚀', '💯', '🤝', '🤫', '👀', '💡'];

export const ChatArea: React.FC<ChatAreaProps> = ({ onBackToSidebar }) => {
  const { user } = useAuth();
  const {
    activeConversation,
    messages,
    sendMessage,
    sendAttachment,
    deleteMessageLocally,
    sendTypingSignal,
    typingPeers,
    onlineUsers,
    replyingToMessage,
    setReplyingToMessage,
  } = useChat();

  const [inputContent, setInputContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [inspectCiphertextMsg, setInspectCiphertextMsg] = useState<MessageItem | null>(null);
  const [isContactVerified, setIsContactVerified] = useState(false);
  const [searchInChat, setSearchInChat] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  const peer = activeConversation?.peer;
  const isPeerOnline = peer ? (onlineUsers[peer.id] ?? peer.is_online) : false;
  const isPeerTyping = activeConversation ? typingPeers[activeConversation.id] : false;

  // Check verification state
  useEffect(() => {
    if (peer) {
      const saved = localStorage.getItem(`cipherchat_verified_${peer.id}`);
      setIsContactVerified(saved === 'true');
    }
  }, [peer, showSafetyModal]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isPeerTyping]);

  if (!activeConversation || !peer || !user) {
    return (
      <main className="flex-1 h-full bg-[#0B0F14] flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-16 h-16 rounded-3xl bg-[#151B23] border border-white/5 flex items-center justify-center text-[#3987FF] mb-4 shadow-xl">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">CipherChat Secure Workspace</h2>
        <p className="text-xs text-slate-400 max-w-sm leading-relaxed mb-6">
          All communications are protected with authenticated ECDH key agreement and per-message forward secrecy ratchets.
        </p>
        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Zero-Knowledge Server Architecture</span>
        </div>
      </main>
    );
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInputContent(e.target.value);

    // Send typing event
    sendTypingSignal(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingSignal(false);
    }, 2000);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputContent.trim() || isSending) return;

    const textToSend = inputContent;
    setInputContent('');
    setIsSending(true);
    sendTypingSignal(false);

    try {
      await sendMessage(textToSend, replyingToMessage?.id);
    } catch (err: any) {
      alert(`Message send failed: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSending(true);
    try {
      await sendAttachment(file, inputContent);
      setInputContent('');
    } catch (err: any) {
      alert(`Attachment upload failed: ${err.message}`);
    } finally {
      setIsSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addEmoji = (emoji: string) => {
    setInputContent(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const formatMsgTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const filteredMessages = messages.filter(m => {
    if (!searchInChat.trim()) return true;
    return m.decryptedText?.toLowerCase().includes(searchInChat.toLowerCase());
  });

  return (
    <main className="flex-1 h-full bg-[#0B0F14] flex flex-col min-w-0 relative">
      {/* Top Header */}
      <header className="h-16 px-4 border-b border-white/5 bg-[#151B23] flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          {onBackToSidebar && (
            <button
              onClick={onBackToSidebar}
              className="md:hidden p-1.5 -ml-1 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          <Avatar
            name={peer.display_name}
            uniqueId={peer.unique_id}
            avatarUrl={peer.avatar_url}
            size="md"
            isOnline={isPeerOnline}
            showOnlineIndicator
          />

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white truncate">{peer.display_name}</h2>
              {isContactVerified ? (
                <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3" />
                  Verified
                </span>
              ) : (
                <span className="flex items-center gap-0.5 text-[10px] text-slate-400 font-mono bg-white/5 px-1.5 py-0.2 rounded border border-white/10">
                  {peer.unique_id}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              {isPeerTyping ? (
                <span className="text-[#3987FF] font-medium animate-pulse">Typing...</span>
              ) : isPeerOnline ? (
                <span className="text-emerald-400">Online</span>
              ) : (
                <span>{peer.last_active_at ? `Last active ${new Date(peer.last_active_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Offline'}</span>
              )}
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowSafetyModal(true)}
            className={`p-2 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-medium border ${
              isContactVerified
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                : 'bg-white/5 text-slate-300 border-white/5 hover:bg-white/10'
            }`}
            title="Verify Cryptographic Safety Number"
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Safety Number</span>
          </button>

          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
            title="Search in conversation"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Optional Search Strip */}
      {showSearch && (
        <div className="p-2.5 bg-[#151B23] border-b border-white/5 flex items-center gap-2">
          <input
            type="text"
            value={searchInChat}
            onChange={e => setSearchInChat(e.target.value)}
            placeholder="Filter messages in this conversation..."
            className="flex-1 py-1 px-3 bg-[#0B0F14] border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none"
          />
          <button
            onClick={() => { setShowSearch(false); setSearchInChat(''); }}
            className="text-xs text-slate-400 hover:text-white px-2"
          >
            Close
          </button>
        </div>
      )}

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {/* End-to-End Encryption Guarantee Banner */}
        <div className="max-w-md mx-auto my-3 p-3 bg-[#151B23]/70 border border-white/5 rounded-2xl text-center space-y-1 select-none">
          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-white">
            <Lock className="w-3.5 h-3.5 text-[#3987FF]" />
            <span>End-to-End Encrypted Session</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Messages, media, and attachments are encrypted before leaving your device with ECDH P-256 and AES-256-GCM. CipherChat servers cannot decrypt or view your communication.
          </p>
          <div className="pt-1 flex items-center justify-center gap-3 text-[10px] text-slate-500 font-mono">
            <button
              onClick={() => setShowSafetyModal(true)}
              className="text-[#3987FF] hover:underline"
            >
              Verify Safety Numbers
            </button>
            <span>·</span>
            <button
              onClick={() => setShowReportModal(true)}
              className="text-slate-400 hover:text-rose-400"
            >
              Report Contact
            </button>
          </div>
        </div>

        {/* Message Items */}
        {filteredMessages.map((msg, index) => {
          const isMe = msg.sender_id === user.id;

          return (
            <div
              key={msg.id}
              className={`flex flex-col group ${isMe ? 'items-end' : 'items-start'}`}
            >
              {/* Message Bubble Container */}
              <div
                className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 relative transition-all shadow-sm ${
                  isMe
                    ? 'bg-[#3987FF] text-white rounded-br-xs'
                    : 'bg-[#151B23] text-white border border-white/5 rounded-bl-xs'
                }`}
              >
                {/* Reply quote indicator if present */}
                {msg.reply_to_id && (
                  <div className={`p-2 mb-2 rounded-lg text-[11px] border-l-2 ${
                    isMe ? 'bg-black/15 border-white/40 text-blue-100' : 'bg-white/5 border-[#3987FF] text-slate-300'
                  }`}>
                    <span className="font-semibold block text-[10px]">Replying to message</span>
                    <span className="truncate block opacity-80">"Encrypted quote context"</span>
                  </div>
                )}

                {/* Encrypted Attachment Display */}
                {msg.attachment && (
                  <div className="mb-2 space-y-1.5">
                    {msg.attachment.contentType.startsWith('image/') && msg.attachmentBlobUrl ? (
                      <div className="rounded-xl overflow-hidden border border-white/10 max-w-sm">
                        <img
                          src={msg.attachmentBlobUrl}
                          alt={msg.attachment.filename}
                          className="w-full max-h-72 object-cover cursor-pointer hover:opacity-95 transition-opacity"
                          onClick={() => window.open(msg.attachmentBlobUrl, '_blank')}
                        />
                      </div>
                    ) : (
                      <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
                        isMe ? 'bg-black/15 border-white/10' : 'bg-[#0B0F14] border-white/5'
                      }`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="w-6 h-6 shrink-0 opacity-80" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate">{msg.attachment.filename}</p>
                            <p className="text-[10px] opacity-70 font-mono">
                              {Math.round(msg.attachment.sizeBytes / 1024)} KB · Encrypted
                            </p>
                          </div>
                        </div>

                        {msg.attachmentBlobUrl && (
                          <a
                            href={msg.attachmentBlobUrl}
                            download={msg.attachment.filename}
                            className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                              isMe ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-[#3987FF] text-white hover:bg-[#2b74e6]'
                            }`}
                            title="Download decrypted file"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Text Payload */}
                <p className="text-xs sm:text-sm whitespace-pre-wrap break-words leading-relaxed select-text font-normal">
                  {msg.decryptedText || (
                    <span className="font-mono text-xs opacity-75 flex items-center gap-1">
                      <Lock className="w-3 h-3 inline" />
                      Decrypting message payload...
                    </span>
                  )}
                </p>

                {/* Metadata row: Timestamp + Status */}
                <div className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] font-mono select-none ${
                  isMe ? 'text-blue-100/80' : 'text-slate-400'
                }`}>
                  <span>{formatMsgTime(msg.created_at)}</span>

                  {isMe && (
                    <span title={`Status: ${msg.status}`}>
                      {msg.status === 'read' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-cyan-200 stroke-[2.5]" />
                      ) : msg.status === 'delivered' ? (
                        <CheckCheck className="w-3.5 h-3.5 opacity-80" />
                      ) : (
                        <Check className="w-3.5 h-3.5 opacity-80" />
                      )}
                    </span>
                  )}
                </div>

                {/* Context Action Bar on hover */}
                <div
                  className={`absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-[#151B23] border border-white/10 rounded-lg p-0.5 shadow-md z-10 ${
                    isMe ? 'right-full mr-1.5' : 'left-full ml-1.5'
                  }`}
                >
                  <button
                    onClick={() => setReplyingToMessage(msg)}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-white/5 transition-colors"
                    title="Reply"
                  >
                    <Reply className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (msg.decryptedText) navigator.clipboard.writeText(msg.decryptedText);
                    }}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-white/5 transition-colors"
                    title="Copy Text"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setInspectCiphertextMsg(msg)}
                    className="p-1 text-slate-400 hover:text-emerald-400 rounded hover:bg-white/5 transition-colors"
                    title="Inspect Raw Ciphertext on Wire"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteMessageLocally(msg.id)}
                    className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-white/5 transition-colors"
                    title="Delete locally"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing bubble */}
        {isPeerTyping && (
          <div className="flex items-center gap-2 p-2 rounded-2xl bg-[#151B23] border border-white/5 w-fit">
            <span className="w-2 h-2 rounded-full bg-[#3987FF] animate-bounce" />
            <span className="w-2 h-2 rounded-full bg-[#3987FF] animate-bounce [animation-delay:0.2s]" />
            <span className="w-2 h-2 rounded-full bg-[#3987FF] animate-bounce [animation-delay:0.4s]" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Replying Banner */}
      {replyingToMessage && (
        <div className="px-4 py-2 bg-[#151B23] border-t border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-300 min-w-0">
            <Reply className="w-3.5 h-3.5 text-[#3987FF] shrink-0" />
            <span className="text-slate-400">Replying to:</span>
            <span className="truncate italic">"{replyingToMessage.decryptedText || 'Encrypted message'}"</span>
          </div>
          <button
            onClick={() => setReplyingToMessage(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="absolute bottom-20 left-4 z-30 p-2.5 bg-[#151B23] border border-white/10 rounded-2xl shadow-2xl grid grid-cols-8 gap-2">
          {COMMON_EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={() => addEmoji(emoji)}
              className="text-lg p-1.5 hover:bg-white/10 rounded-lg transition-transform hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Message Input Form */}
      <footer className="p-3 bg-[#151B23] border-t border-white/5 shrink-0">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          {/* Attachment button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors shrink-0"
            title="Attach file (Client-side encrypted with AES-256-GCM)"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Emoji button */}
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors shrink-0"
            title="Emojis"
          >
            <Smile className="w-5 h-5" />
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={inputContent}
            onChange={handleInputChange}
            placeholder={`Message ${peer.display_name} (End-to-end encrypted)...`}
            className="flex-1 py-2.5 px-4 rounded-xl bg-[#0B0F14] border border-white/10 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:border-[#3987FF] focus:ring-1 focus:ring-[#3987FF]"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputContent.trim() || isSending}
            className="p-2.5 bg-[#3987FF] hover:bg-[#2b74e6] disabled:opacity-40 text-white rounded-xl transition-colors shrink-0 shadow-md shadow-[#3987FF]/20"
            title="Send encrypted message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>

      {/* Safety Number Modal */}
      <SafetyNumberModal
        isOpen={showSafetyModal}
        onClose={() => setShowSafetyModal(false)}
        peer={peer}
      />

      {/* Report User Modal */}
      <ReportUserModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        peer={peer}
      />

      {/* Wire Ciphertext Transparency Inspector */}
      {inspectCiphertextMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#151B23] border border-white/10 rounded-2xl shadow-2xl p-6 text-white relative">
            <button
              onClick={() => setInspectCiphertextMsg(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4 text-emerald-400">
              <Terminal className="w-5 h-5" />
              <h3 className="text-sm font-bold text-white">Cryptographic Wire Payload Inspector</h3>
            </div>

            <p className="text-xs text-slate-400 mb-3 leading-relaxed">
              This is the <strong>exact unreadable ciphertext payload</strong> stored by the database server for message <span className="font-mono text-slate-200">{inspectCiphertextMsg.id}</span>:
            </p>

            <pre className="text-[11px] font-mono text-slate-300 bg-[#0B0F14] p-3 rounded-xl border border-white/5 overflow-x-auto max-h-60 mb-3">
{JSON.stringify(inspectCiphertextMsg.encrypted_payload, null, 2)}
            </pre>

            <div className="p-3 bg-white/5 rounded-xl text-xs space-y-1">
              <span className="text-slate-400 block font-semibold">Decrypted on your device as:</span>
              <span className="text-white font-medium">"{inspectCiphertextMsg.decryptedText}"</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
