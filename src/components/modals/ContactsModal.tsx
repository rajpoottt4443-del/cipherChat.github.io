import React, { useState } from 'react';
import { useChat } from '../../context/ChatContext.tsx';
import { ContactItem, PublicUser } from '../../types/index.ts';
import { Avatar } from '../common/Avatar.tsx';
import { Users, UserCheck, Clock, Ban, X, MessageSquare, Check, XCircle } from 'lucide-react';

interface ContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNewChat: () => void;
}

export const ContactsModal: React.FC<ContactsModalProps> = ({ isOpen, onClose, onOpenNewChat }) => {
  const { contacts, startChatWithUser, respondToContactRequest } = useChat();
  const [activeTab, setActiveTab] = useState<'contacts' | 'pending' | 'blocked'>('contacts');

  if (!isOpen) return null;

  const acceptedContacts = contacts.filter(c => c.status === 'accepted');
  const pendingRequests = contacts.filter(c => c.status === 'pending');
  const blockedContacts = contacts.filter(c => c.status === 'blocked');

  const incomingRequests = pendingRequests.filter(c => !c.is_requester);
  const outgoingRequests = pendingRequests.filter(c => c.is_requester);

  const handleStartChat = async (peer: PublicUser) => {
    await startChatWithUser(peer);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#151B23] border border-white/10 rounded-2xl shadow-2xl p-6 text-white relative animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center justify-between mb-5 pr-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#3987FF]/15 border border-[#3987FF]/30 flex items-center justify-center text-[#3987FF]">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Contacts & Requests</h2>
              <p className="text-xs text-slate-400">Manage your verified peers and chat authorizations</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-[#0B0F14] rounded-xl mb-4 border border-white/5 shrink-0">
          <button
            onClick={() => setActiveTab('contacts')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'contacts' ? 'bg-[#151B23] text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Contacts ({acceptedContacts.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'pending' ? 'bg-[#151B23] text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Requests ({pendingRequests.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('blocked')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'blocked' ? 'bg-[#151B23] text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Blocked ({blockedContacts.length})</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {activeTab === 'contacts' && (
            acceptedContacts.length === 0 ? (
              <div className="text-center py-10">
                <Users className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-300">No contacts yet</p>
                <p className="text-xs text-slate-500 mt-1 mb-4">Add people using their Unique ID to chat privately.</p>
                <button
                  onClick={() => { onClose(); onOpenNewChat(); }}
                  className="px-4 py-2 bg-[#3987FF] text-white text-xs font-medium rounded-xl hover:bg-[#2b74e6] transition-colors"
                >
                  Find a Contact
                </button>
              </div>
            ) : (
              acceptedContacts.map(c => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#0B0F14] border border-white/5 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      name={c.peer.display_name}
                      uniqueId={c.peer.unique_id}
                      avatarUrl={c.peer.avatar_url}
                      size="md"
                      isOnline={c.peer.is_online}
                      showOnlineIndicator
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{c.peer.display_name}</p>
                      <p className="text-xs font-mono text-[#3987FF]">{c.peer.unique_id}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleStartChat(c.peer)}
                    className="px-3 py-1.5 rounded-lg bg-[#3987FF]/15 text-[#3987FF] hover:bg-[#3987FF] hover:text-white transition-colors text-xs font-medium flex items-center gap-1.5 shrink-0"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Message</span>
                  </button>
                </div>
              ))
            )
          )}

          {activeTab === 'pending' && (
            <div className="space-y-4">
              {/* Incoming requests */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Incoming Requests ({incomingRequests.length})
                </h3>
                {incomingRequests.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-3 bg-[#0B0F14] rounded-xl border border-white/5">
                    No pending incoming chat requests.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {incomingRequests.map(r => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-[#0B0F14] border border-white/5"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar
                            name={r.peer.display_name}
                            uniqueId={r.peer.unique_id}
                            avatarUrl={r.peer.avatar_url}
                            size="md"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">{r.peer.display_name}</p>
                            <p className="text-xs font-mono text-slate-400">{r.peer.unique_id}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => respondToContactRequest(r.id, 'accepted')}
                            className="p-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-lg transition-colors"
                            title="Accept Request"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => respondToContactRequest(r.id, 'declined')}
                            className="p-1.5 bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg transition-colors"
                            title="Decline Request"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Outgoing requests */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Outgoing Requests ({outgoingRequests.length})
                </h3>
                {outgoingRequests.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-3 bg-[#0B0F14] rounded-xl border border-white/5">
                    No outgoing chat requests awaiting acceptance.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {outgoingRequests.map(r => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-[#0B0F14] border border-white/5"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar
                            name={r.peer.display_name}
                            uniqueId={r.peer.unique_id}
                            avatarUrl={r.peer.avatar_url}
                            size="md"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">{r.peer.display_name}</p>
                            <p className="text-xs font-mono text-[#3987FF]">{r.peer.unique_id}</p>
                          </div>
                        </div>
                        <span className="text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          Pending
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'blocked' && (
            blockedContacts.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500 italic">
                No users are currently blocked.
              </div>
            ) : (
              blockedContacts.map(c => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#0B0F14] border border-white/5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      name={c.peer.display_name}
                      uniqueId={c.peer.unique_id}
                      avatarUrl={c.peer.avatar_url}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{c.peer.display_name}</p>
                      <p className="text-xs font-mono text-slate-400">{c.peer.unique_id}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => respondToContactRequest(c.id, 'accepted')}
                    className="px-3 py-1 bg-white/5 hover:bg-white/10 text-xs text-slate-300 rounded-lg transition-colors"
                  >
                    Unblock
                  </button>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
};
