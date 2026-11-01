import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useChat } from '../../context/ChatContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import {
  MessageSquarePlus,
  Users,
  Settings,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  Copy,
  Check,
  Search,
  Lock,
  Sun,
  Moon,
  Share2,
} from 'lucide-react';

interface SidebarProps {
  onOpenNewChat: () => void;
  onOpenContacts: () => void;
  onOpenSettings: () => void;
  onOpenAudit: () => void;
  onOpenAdmin: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenNewChat,
  onOpenContacts,
  onOpenSettings,
  onOpenAudit,
  onOpenAdmin,
}) => {
  const { user, logout, isOnline, theme, toggleTheme } = useAuth();
  const { conversations, activeConversation, selectConversation, onlineUsers } = useChat();

  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState(false);

  if (!user) return null;

  const copyMyId = () => {
    navigator.clipboard.writeText(user.unique_id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleShareId = () => {
    if (navigator.share) {
      navigator.share({
        title: 'CipherChat Unique ID',
        text: `Connect with me on CipherChat with my private ID: ${user.unique_id}`,
      }).catch(() => copyMyId());
    } else {
      copyMyId();
    }
  };

  // Filter conversations
  const filteredConversations = conversations.filter(c => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      c.peer.display_name.toLowerCase().includes(query) ||
      c.peer.unique_id.toLowerCase().includes(query) ||
      c.peer.username.toLowerCase().includes(query)
    );
  });

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <aside className="w-full md:w-80 lg:w-96 h-full flex flex-col bg-[#151B23] border-r border-white/5 select-none shrink-0">
      {/* Top Profile & Brand Lockup */}
      <div className="p-4 border-b border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar
              name={user.display_name}
              uniqueId={user.unique_id}
              avatarUrl={user.avatar_url}
              size="md"
              isOnline={isOnline}
              showOnlineIndicator
            />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                {user.display_name}
                {user.role === 'admin' && (
                  <span className="text-[9px] bg-purple-500/20 text-purple-300 font-mono px-1.5 py-0.2 rounded border border-purple-500/30">
                    ADMIN
                  </span>
                )}
              </h2>
              <span className="text-[11px] text-slate-400 font-mono block truncate">
                @{user.username}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={toggleTheme}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              title={`Toggle theme (Current: ${theme})`}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={onOpenSettings}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              title="Settings & Encryption Keys"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={logout}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-white/5 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* My Unique ID Card */}
        <div className="p-2.5 rounded-xl bg-[#0B0F14] border border-white/5 flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
              My Unique ID
            </span>
            <span className="font-mono text-xs font-semibold text-[#3987FF] tracking-wider block">
              {user.unique_id}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={copyMyId}
              className="px-2 py-1 text-xs text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-md transition-colors flex items-center gap-1"
              title="Copy Unique ID"
            >
              {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="text-[11px]">{copiedId ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={handleShareId}
              className="p-1.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-md transition-colors"
              title="Share ID"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Action Strip: New Chat + Contacts + Audit */}
      <div className="p-3 border-b border-white/5 flex gap-2">
        <button
          onClick={onOpenNewChat}
          className="flex-1 py-2 px-3 bg-[#3987FF] hover:bg-[#2b74e6] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md shadow-[#3987FF]/20"
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span>New Chat</span>
        </button>
        <button
          onClick={onOpenContacts}
          className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl transition-colors border border-white/5"
          title="Contacts & Chat Requests"
        >
          <Users className="w-4 h-4" />
        </button>
        <button
          onClick={onOpenAudit}
          className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl transition-colors border border-emerald-500/20"
          title="Cryptographic Security Audit Suite"
        >
          <ShieldCheck className="w-4 h-4" />
        </button>
        {user.role === 'admin' && (
          <button
            onClick={onOpenAdmin}
            className="p-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-xl transition-colors border border-purple-500/20"
            title="Admin Console"
          >
            <ShieldAlert className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Conversation Search Bar */}
      <div className="p-3 border-b border-white/5">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full py-1.5 pl-9 pr-3 rounded-xl bg-[#0B0F14] border border-white/5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#3987FF]"
          />
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/[0.03]">
        {filteredConversations.length === 0 ? (
          <div className="text-center py-12 px-4 space-y-2">
            <Lock className="w-8 h-8 text-slate-600 mx-auto opacity-60" />
            <p className="text-xs font-semibold text-slate-300">No active conversations</p>
            <p className="text-[11px] text-slate-500 max-w-[200px] mx-auto">
              Start an end-to-end encrypted chat with another user's Unique ID.
            </p>
            <button
              onClick={onOpenNewChat}
              className="mt-2 text-xs text-[#3987FF] hover:underline font-medium inline-block"
            >
              + Search by ID
            </button>
          </div>
        ) : (
          filteredConversations.map(conv => {
            const isSelected = activeConversation?.id === conv.id;
            const isPeerOnline = onlineUsers[conv.peer.id] ?? conv.peer.is_online;

            return (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`p-3.5 flex items-center gap-3 cursor-pointer transition-colors relative ${
                  isSelected
                    ? 'bg-[#3987FF]/15 border-l-2 border-[#3987FF]'
                    : 'hover:bg-white/[0.02]'
                }`}
              >
                <Avatar
                  name={conv.peer.display_name}
                  uniqueId={conv.peer.unique_id}
                  avatarUrl={conv.peer.avatar_url}
                  size="md"
                  isOnline={Boolean(isPeerOnline)}
                  showOnlineIndicator
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h3 className="text-xs font-semibold text-white truncate">
                      {conv.peer.display_name}
                    </h3>
                    <span className="text-[10px] text-slate-500 font-mono shrink-0 ml-1">
                      {formatTime(conv.last_message_at)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-slate-400 truncate max-w-[170px] flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                      <span>{conv.last_message_preview || '🔒 Encrypted message'}</span>
                    </p>

                    {conv.unread_count > 0 && (
                      <span className="bg-[#3987FF] text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center shrink-0">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Privacy Status Pill */}
      <div className="p-3 border-t border-white/5 bg-[#0B0F14]/60 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span>{isOnline ? 'Network Connected' : 'Reconnecting...'}</span>
        </div>
        <span className="font-mono text-[10px] text-slate-500">AES-256-GCM</span>
      </div>
    </aside>
  );
};
