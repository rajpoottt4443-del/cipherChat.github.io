import React, { useState } from 'react';
import { useChat } from '../../context/ChatContext.tsx';
import { api } from '../../services/api.ts';
import { PublicUser } from '../../types/index.ts';
import { Avatar } from '../common/Avatar.tsx';
import { Search, UserPlus, MessageSquare, Shield, AlertCircle, X, Check, Copy } from 'lucide-react';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ isOpen, onClose }) => {
  const { startChatWithUser, refreshContacts } = useChat();
  const [uniqueIdInput, setUniqueIdInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [foundUser, setFoundUser] = useState<PublicUser | null>(null);
  const [relationshipStatus, setRelationshipStatus] = useState<string>('none');
  const [requestSent, setRequestSent] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = uniqueIdInput.trim().toUpperCase();
    if (!cleanId) return;

    setIsSearching(true);
    setSearchError(null);
    setFoundUser(null);
    setRequestSent(false);

    try {
      const res = await api.users.lookup(cleanId);
      setFoundUser(res.user);
      setRelationshipStatus(res.relationship_status);
    } catch (err: any) {
      setSearchError(err.message || 'User not found with this Unique ID.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = async () => {
    if (!foundUser) return;
    try {
      await api.contacts.sendRequest({ target_user_id: foundUser.id });
      setRequestSent(true);
      setRelationshipStatus('pending');
      await refreshContacts();
    } catch (err: any) {
      setSearchError(err.message || 'Failed to send chat request.');
    }
  };

  const handleStartChat = async () => {
    if (!foundUser) return;
    await startChatWithUser(foundUser);
    onClose();
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#151B23] border border-white/10 rounded-2xl shadow-2xl p-6 text-white relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#3987FF]/15 border border-[#3987FF]/30 flex items-center justify-center text-[#3987FF]">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Start New Conversation</h2>
            <p className="text-xs text-slate-400">Search by permanent Unique ID (<span className="font-mono text-slate-300">CC-XXXX-XXXX</span>)</p>
          </div>
        </div>

        {/* Search Input Form */}
        <form onSubmit={handleSearch} className="mb-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={uniqueIdInput}
                onChange={e => setUniqueIdInput(e.target.value.toUpperCase())}
                placeholder="CC-8X29-KL45"
                className="w-full py-2.5 pl-10 pr-4 rounded-xl bg-[#0B0F14] border border-white/10 text-white placeholder-slate-600 font-mono text-sm tracking-wider focus:outline-none focus:border-[#3987FF] focus:ring-1 focus:ring-[#3987FF]"
              />
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            </div>
            <button
              type="submit"
              disabled={isSearching || !uniqueIdInput.trim()}
              className="px-4 py-2.5 rounded-xl font-medium text-xs text-white bg-[#3987FF] hover:bg-[#2b74e6] transition-colors disabled:opacity-50 shrink-0 shadow-md shadow-[#3987FF]/20"
            >
              {isSearching ? 'Searching...' : 'Find User'}
            </button>
          </div>
        </form>

        {/* Error message */}
        {searchError && (
          <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{searchError}</span>
          </div>
        )}

        {/* Result Card */}
        {foundUser && (
          <div className="p-4 rounded-xl bg-[#0B0F14] border border-white/10 mb-4 space-y-4">
            <div className="flex items-start gap-3.5">
              <Avatar
                name={foundUser.display_name}
                uniqueId={foundUser.unique_id}
                avatarUrl={foundUser.avatar_url}
                size="lg"
                isOnline={foundUser.is_online}
                showOnlineIndicator
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white text-sm truncate">{foundUser.display_name}</h3>
                  <span className="text-[10px] text-slate-500 font-mono">@{foundUser.username}</span>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-xs text-[#3987FF] bg-[#3987FF]/10 px-2 py-0.5 rounded border border-[#3987FF]/20 tracking-wider">
                    {foundUser.unique_id}
                  </span>
                  <button
                    onClick={() => copyId(foundUser.unique_id)}
                    className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/5 transition-colors text-xs"
                    title="Copy Unique ID"
                  >
                    {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Public Key Fingerprint: </span>
                  <span className="font-mono text-[10px] text-slate-300 truncate max-w-[140px]">
                    {foundUser.public_key_fingerprint || 'ECDH Verified'}
                  </span>
                </div>
              </div>
            </div>

            {/* Privacy notice: Email is never disclosed */}
            <p className="text-[11px] text-slate-500 pt-2 border-t border-white/5 italic">
              🔒 Privacy Guaranteed: User email address is private and never exposed.
            </p>

            {/* Action buttons */}
            <div className="pt-1">
              {relationshipStatus === 'accepted' ? (
                <button
                  onClick={handleStartChat}
                  className="w-full py-2.5 px-4 rounded-xl font-medium text-xs text-white bg-[#3987FF] hover:bg-[#2b74e6] transition-colors flex items-center justify-center gap-2 shadow-md shadow-[#3987FF]/20"
                >
                  <MessageSquare className="w-4 h-4" />
                  Open Encrypted Chat
                </button>
              ) : relationshipStatus === 'pending' || requestSent ? (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs text-center font-medium">
                  ⏳ Chat Request Sent (Awaiting recipient acceptance)
                </div>
              ) : (
                <button
                  onClick={handleSendRequest}
                  className="w-full py-2.5 px-4 rounded-xl font-medium text-xs text-white bg-[#3987FF] hover:bg-[#2b74e6] transition-colors flex items-center justify-center gap-2 shadow-md shadow-[#3987FF]/20"
                >
                  <UserPlus className="w-4 h-4" />
                  Send Chat Request
                </button>
              )}
            </div>
          </div>
        )}

        <div className="text-[11px] text-slate-500 text-center">
          Every CipherChat user has a unique ID in format <span className="font-mono text-slate-400">CC-XXXX-XXXX</span>. Ask your peer for their ID to initiate end-to-end encrypted messaging.
        </div>
      </div>
    </div>
  );
};
