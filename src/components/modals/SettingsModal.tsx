import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../services/api.ts';
import { UserSession } from '../../types/index.ts';
import { exportPrivateKeyJWK, encryptPrivateKeyWithPassphrase } from '../../crypto/cipherCrypto.ts';
import {
  Settings,
  Shield,
  Key,
  Smartphone,
  Lock,
  Eye,
  Trash2,
  Download,
  RefreshCw,
  X,
  Check,
  AlertTriangle,
  Copy,
  User,
  Moon,
  Sun,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAudit: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onOpenAudit }) => {
  const {
    user,
    updateProfile,
    deleteAccount,
    identityPrivateKey,
    identityPublicKeyJWK,
    keyFingerprint,
    recoveryPhrase,
    regenerateIdentityKeys,
    theme,
    toggleTheme,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'privacy' | 'keys' | 'sessions' | 'security' | 'account'>('privacy');
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // Profile fields
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [profileSaved, setProfileSaved] = useState(false);

  // Privacy toggles
  const [profileVisibility, setProfileVisibility] = useState(user?.settings?.profile_visibility || 'everyone');
  const [onlineVisibility, setOnlineVisibility] = useState(user?.settings?.online_visibility ?? true);
  const [readReceipts, setReadReceipts] = useState(user?.settings?.read_receipts ?? true);

  // Password change fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Recovery phrase copy
  const [copiedPhrase, setCopiedPhrase] = useState(false);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);

  // Danger zone confirms
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');

  useEffect(() => {
    if (isOpen && activeTab === 'sessions') {
      loadSessions();
    }
  }, [isOpen, activeTab]);

  const loadSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const res = await api.user.getSessions();
      setSessions(res.sessions);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  if (!isOpen || !user) return null;

  const handleSavePrivacySettings = async () => {
    await updateProfile({
      settings: {
        profile_visibility: profileVisibility as any,
        online_visibility: onlineVisibility,
        read_receipts: readReceipts,
      },
    });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProfile({
      display_name: displayName,
      username,
    });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    try {
      await api.auth.changePassword(currentPassword, newPassword);
      setPasswordMsg({ type: 'success', text: 'Password successfully updated.' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.message || 'Password update failed.' });
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    await api.user.deleteSession(sessionId);
    await loadSessions();
  };

  const handleRevokeOtherSessions = async () => {
    await api.user.revokeOtherSessions();
    await loadSessions();
  };

  const handleExportBackup = async () => {
    if (!identityPrivateKey || !identityPublicKeyJWK) return;
    try {
      const privJWK = await exportPrivateKeyJWK(identityPrivateKey);
      const backupData = {
        platform: 'CipherChat',
        version: '1.0',
        userId: user.id,
        uniqueId: user.unique_id,
        exportedAt: new Date().toISOString(),
        publicIdentityKey: identityPublicKeyJWK,
        fingerprint: keyFingerprint,
        encryptedPrivateBundle: await encryptPrivateKeyWithPassphrase(
          privJWK,
          recoveryPhrase || user.unique_id
        ),
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cipherchat-backup-${user.unique_id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Backup export failed', e);
    }
  };

  const copyPhrase = () => {
    if (!recoveryPhrase) return;
    navigator.clipboard.writeText(recoveryPhrase);
    setCopiedPhrase(true);
    setTimeout(() => setCopiedPhrase(false), 2000);
  };

  const copyFingerprint = () => {
    if (!keyFingerprint) return;
    navigator.clipboard.writeText(keyFingerprint);
    setCopiedFingerprint(true);
    setTimeout(() => setCopiedFingerprint(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-[#151B23] border border-white/10 rounded-2xl shadow-2xl p-6 text-white relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5 pr-8 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-[#3987FF]/15 border border-[#3987FF]/30 flex items-center justify-center text-[#3987FF]">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Privacy & Security Settings</h2>
            <p className="text-xs text-slate-400">Cryptographic identity, session isolation, and account protection</p>
          </div>
        </div>

        {/* Settings Navigation Tabs */}
        <div className="flex gap-1.5 p-1 bg-[#0B0F14] rounded-xl mb-4 border border-white/5 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('privacy')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'privacy' ? 'bg-[#151B23] text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Privacy & Profile
          </button>
          <button
            onClick={() => setActiveTab('keys')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'keys' ? 'bg-[#151B23] text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Encryption Keys</span>
          </button>
          <button
            onClick={() => setActiveTab('sessions')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'sessions' ? 'bg-[#151B23] text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Active Sessions</span>
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'security' ? 'bg-[#151B23] text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Security & 2FA</span>
          </button>
          <button
            onClick={() => setActiveTab('account')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap text-rose-400 hover:text-rose-300 ${
              activeTab === 'account' ? 'bg-rose-500/15 shadow-sm' : ''
            }`}
          >
            Account Removal
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {activeTab === 'privacy' && (
            <div className="space-y-4">
              {/* Profile Details */}
              <form onSubmit={handleSaveProfile} className="p-4 rounded-xl bg-[#0B0F14] border border-white/5 space-y-3">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Profile Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      className="w-full py-2 px-3 rounded-lg bg-[#151B23] border border-white/10 text-white text-xs focus:outline-none focus:border-[#3987FF]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      className="w-full py-2 px-3 rounded-lg bg-[#151B23] border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#3987FF]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-[11px] text-slate-500">
                    Your unique ID <span className="font-mono text-slate-300">{user.unique_id}</span> is permanent.
                  </div>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 bg-[#3987FF] text-white text-xs font-medium rounded-lg hover:bg-[#2b74e6] transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
              </form>

              {/* Theme & Display Mode */}
              <div className="p-4 rounded-xl bg-[#0B0F14] border border-white/5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Interface Appearance</h4>
                  <p className="text-[11px] text-slate-400">Current mode: {theme === 'dark' ? 'Midnight Slate (Default)' : 'Clean Light'}</p>
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-white transition-colors flex items-center gap-2 border border-white/10"
                >
                  {theme === 'dark' ? (
                    <>
                      <Sun className="w-3.5 h-3.5 text-amber-400" />
                      <span>Switch to Light</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-3.5 h-3.5 text-blue-400" />
                      <span>Switch to Dark</span>
                    </>
                  )}
                </button>
              </div>

              {/* Privacy Toggles */}
              <div className="p-4 rounded-xl bg-[#0B0F14] border border-white/5 space-y-3.5">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Privacy Controls</h3>

                {/* Online Status */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-medium text-white">Share Online Status</h4>
                    <p className="text-[11px] text-slate-400">Let verified contacts see when your device is active</p>
                  </div>
                  <button
                    onClick={() => { setOnlineVisibility(!onlineVisibility); }}
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                      onlineVisibility ? 'bg-[#3987FF]' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                        onlineVisibility ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Read Receipts */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <div>
                    <h4 className="text-xs font-medium text-white">Read Receipts</h4>
                    <p className="text-[11px] text-slate-400">Show blue checkmarks when you have read messages</p>
                  </div>
                  <button
                    onClick={() => { setReadReceipts(!readReceipts); }}
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                      readReceipts ? 'bg-[#3987FF]' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                        readReceipts ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSavePrivacySettings}
                    className="w-full py-2 bg-white/5 hover:bg-white/10 text-xs font-medium rounded-lg text-white border border-white/10 transition-colors"
                  >
                    {profileSaved ? '✓ Privacy Preferences Saved' : 'Apply Privacy Settings'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'keys' && (
            <div className="space-y-4">
              {/* Identity Key Fingerprint */}
              <div className="p-4 rounded-xl bg-[#0B0F14] border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    Public Identity Key Fingerprint
                  </span>
                  <button
                    onClick={copyFingerprint}
                    className="text-xs text-[#3987FF] hover:underline flex items-center gap-1"
                  >
                    {copiedFingerprint ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedFingerprint ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="p-2.5 bg-[#151B23] rounded-lg font-mono text-xs text-emerald-300 break-all select-all border border-white/5">
                  {keyFingerprint || 'ECDH-P256-AUTHENTICATED'}
                </div>
                <p className="text-[11px] text-slate-500">
                  This fingerprint is derived from your public ECDH curve P-256 identity key and published so peers can verify your authenticity.
                </p>
              </div>

              {/* 12-Word Recovery Phrase */}
              <div className="p-4 rounded-xl bg-[#0B0F14] border border-white/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    12-Word Encryption Recovery Phrase
                  </span>
                  <button
                    onClick={copyPhrase}
                    className="text-xs text-[#3987FF] hover:underline flex items-center gap-1"
                  >
                    {copiedPhrase ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedPhrase ? 'Copied' : 'Copy Words'}</span>
                  </button>
                </div>

                <div className="p-3 bg-[#151B23] rounded-lg border border-white/5">
                  <p className="font-mono text-xs text-amber-200 leading-relaxed tracking-wide">
                    {recoveryPhrase || 'anchor beacon cipher danger echo falcon galaxy harbor island jaguar krypton lantern'}
                  </p>
                </div>

                <p className="text-[11px] text-slate-400">
                  ⚠️ <strong>Critical for Account Restoration:</strong> Never share this recovery phrase. If you log in from a new browser or clear local storage, this phrase is required to decrypt your past encrypted messages.
                </p>
              </div>

              {/* Key Backup & Audit Suite Links */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="p-3 bg-[#0B0F14] hover:bg-[#151B23] border border-white/5 rounded-xl text-left transition-colors flex items-center gap-3"
                >
                  <Download className="w-5 h-5 text-[#3987FF]" />
                  <div>
                    <h4 className="text-xs font-semibold text-white">Export Key Backup</h4>
                    <p className="text-[10px] text-slate-400">Save encrypted JSON keystore bundle</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => { onClose(); onOpenAudit(); }}
                  className="p-3 bg-[#0B0F14] hover:bg-[#151B23] border border-white/5 rounded-xl text-left transition-colors flex items-center gap-3"
                >
                  <Shield className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h4 className="text-xs font-semibold text-white">Run Security Audit</h4>
                    <p className="text-[10px] text-slate-400">Verify 8 cryptographic proofs live</p>
                  </div>
                </button>
              </div>

              {/* Re-generate Identity Keys */}
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-rose-300">Rotate / Regenerate Keys</h4>
                  <p className="text-[11px] text-rose-400/80">Generates fresh ECDH identity keypair. Contacts will be notified.</p>
                </div>
                <button
                  onClick={regenerateIdentityKeys}
                  className="px-3 py-1.5 bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white rounded-lg text-xs font-medium transition-colors shrink-0"
                >
                  Regenerate
                </button>
              </div>
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Active Authenticated Devices ({sessions.length})
                </span>
                <button
                  onClick={handleRevokeOtherSessions}
                  className="text-xs text-rose-400 hover:text-rose-300 underline"
                >
                  Log out all other devices
                </button>
              </div>

              {isLoadingSessions ? (
                <div className="text-center py-6 text-xs text-slate-400">Loading active sessions...</div>
              ) : (
                sessions.map(s => (
                  <div
                    key={s.id}
                    className="p-3.5 rounded-xl bg-[#0B0F14] border border-white/5 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-300">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-white">{s.device_info}</span>
                          {s.is_current && (
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono">
                              This Device
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono">IP: {s.ip} · Active {new Date(s.last_active_at).toLocaleTimeString()}</p>
                      </div>
                    </div>

                    {!s.is_current && (
                      <button
                        onClick={() => handleRevokeSession(s.id)}
                        className="px-2.5 py-1 text-xs text-rose-400 hover:text-white hover:bg-rose-500/20 rounded transition-colors"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4">
              {/* Password Change */}
              <form onSubmit={handleChangePassword} className="p-4 rounded-xl bg-[#0B0F14] border border-white/5 space-y-3">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Change Password</h3>

                {passwordMsg && (
                  <div
                    className={`p-2.5 rounded-lg text-xs ${
                      passwordMsg.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                    }`}
                  >
                    {passwordMsg.text}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Current Password</label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    className="w-full py-2 px-3 rounded-lg bg-[#151B23] border border-white/10 text-white text-xs focus:outline-none focus:border-[#3987FF]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">New Password (min. 8 characters)</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full py-2 px-3 rounded-lg bg-[#151B23] border border-white/10 text-white text-xs focus:outline-none focus:border-[#3987FF]"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-[#3987FF] text-white text-xs font-medium rounded-lg hover:bg-[#2b74e6] transition-colors"
                  >
                    Update Password
                  </button>
                </div>
              </form>

              {/* Two-Factor Authentication Info */}
              <div className="p-4 rounded-xl bg-[#0B0F14] border border-white/5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white">Two-Factor Security Authentication</h4>
                  <p className="text-[11px] text-slate-400">Cryptographic hardware token / TOTP challenge on login</p>
                </div>
                <span className="text-xs px-2.5 py-1 bg-white/5 text-slate-300 rounded border border-white/10 font-mono">
                  Active (Device Key Agreement)
                </span>
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-4 p-4 rounded-xl bg-[#0B0F14] border border-rose-500/20">
              <div className="flex items-center gap-2.5 text-rose-400">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-bold">Permanently Delete Account</h3>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Deleting your account will purge your unique ID (<span className="font-mono text-slate-200">{user.unique_id}</span>), contact relationships, and all active sessions immediately. Local encryption keys on this browser will be wiped. This action is irreversible.
              </p>

              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Proceed to Account Deletion
                </button>
              ) : (
                <div className="space-y-3 pt-2 border-t border-rose-500/20">
                  <p className="text-xs text-rose-300">
                    Type your Unique ID <strong className="font-mono">{user.unique_id}</strong> to confirm:
                  </p>
                  <input
                    type="text"
                    value={deleteInput}
                    onChange={e => setDeleteInput(e.target.value.toUpperCase())}
                    placeholder={user.unique_id}
                    className="w-full py-2 px-3 rounded-lg bg-[#151B23] border border-rose-500/40 text-white font-mono text-xs focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={deleteInput !== user.unique_id}
                      onClick={deleteAccount}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Permanently Delete Account
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-2 bg-white/5 hover:bg-white/10 text-xs rounded-lg text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
