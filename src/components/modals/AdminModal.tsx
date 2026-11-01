import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import { ShieldAlert, Users, Activity, AlertTriangle, CheckCircle, Ban, X, Shield, RefreshCw } from 'lucide-react';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({ isOpen, onClose }) => {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'reports'>('overview');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadAdminData();
    }
  }, [isOpen]);

  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      const [s, u, r] = await Promise.all([
        api.admin.getStats(),
        api.admin.getUsers(),
        api.admin.getReports(),
      ]);
      setStats(s);
      setUsers(u.users);
      setReports(r.reports);
    } catch (e) {
      console.error('Failed loading admin data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    await api.admin.updateUserStatus(userId, nextStatus as any);
    await loadAdminData();
  };

  const handleResolveReport = async (reportId: string) => {
    await api.admin.resolveReport(reportId);
    await loadAdminData();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-[#151B23] border border-white/10 rounded-2xl shadow-2xl p-6 text-white relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center justify-between mb-4 pr-8 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">CipherChat Security & Admin Console</h2>
              <p className="text-xs text-slate-400">Platform governance with strictly zero access to user plaintext messages</p>
            </div>
          </div>
          <button
            onClick={loadAdminData}
            disabled={isLoading}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Zero-Knowledge Guarantee Banner */}
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-4 flex items-center gap-3 text-xs text-emerald-300 shrink-0">
          <Shield className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <strong>Zero-Knowledge Architecture Enforced:</strong> Administrators and moderators can only manage account status and resolve user abuse reports. Decryption of user messages or file attachments is mathematically prohibited.
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-[#0B0F14] rounded-xl mb-4 border border-white/5 shrink-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'overview' ? 'bg-[#151B23] text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>System Telemetry</span>
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'users' ? 'bg-[#151B23] text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Accounts ({users.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'reports' ? 'bg-[#151B23] text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Abuse Reports ({reports.length})</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {activeTab === 'overview' && stats && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#0B0F14] border border-white/5">
                  <span className="text-[11px] text-slate-400 block mb-1">Total Users</span>
                  <span className="text-2xl font-bold text-white font-mono">{stats.total_users}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0B0F14] border border-white/5">
                  <span className="text-[11px] text-slate-400 block mb-1">Active Now</span>
                  <span className="text-2xl font-bold text-emerald-400 font-mono">{stats.active_now}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0B0F14] border border-white/5">
                  <span className="text-[11px] text-slate-400 block mb-1">Verified Emails</span>
                  <span className="text-2xl font-bold text-[#3987FF] font-mono">{stats.verified_users}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0B0F14] border border-white/5">
                  <span className="text-[11px] text-slate-400 block mb-1">Suspended Accounts</span>
                  <span className="text-2xl font-bold text-rose-400 font-mono">{stats.suspended_users}</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#0B0F14] border border-white/5 space-y-2">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Health Metrics</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-white/5">
                    <span className="text-slate-400">Server Uptime:</span>
                    <span className="font-mono text-white">{Math.round(stats.server_uptime_seconds)} seconds</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-white/5">
                    <span className="text-slate-400">Memory Usage:</span>
                    <span className="font-mono text-white">{stats.memory_usage_mb} MB</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-white/5">
                    <span className="text-slate-400">Zero-Knowledge Plaintexts:</span>
                    <span className="font-mono text-emerald-400">0 (Zero Stored)</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-white/5">
                    <span className="text-slate-400">Server Key Access:</span>
                    <span className="font-mono text-emerald-400">0 (No Private Keys)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Unique ID</th>
                    <th className="py-2.5 px-3">Display Name</th>
                    <th className="py-2.5 px-3">Username</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 font-mono text-[#3987FF] font-medium">{u.unique_id}</td>
                      <td className="py-2.5 px-3 text-white font-medium">{u.display_name}</td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono">@{u.username}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                          u.role === 'admin' ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-700 text-slate-300'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          u.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {u.role !== 'admin' && (
                          <button
                            onClick={() => handleToggleUserStatus(u.id, u.status)}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                              u.status === 'active'
                                ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white'
                                : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500 hover:text-white'
                            }`}
                          >
                            {u.status === 'active' ? 'Suspend' : 'Unsuspend'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'reports' && (
            reports.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500 italic">
                No user abuse reports have been filed.
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map(r => (
                  <div
                    key={r.id}
                    className="p-4 rounded-xl bg-[#0B0F14] border border-white/5 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-rose-400">{r.reason}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400">Reported User: <strong className="text-white font-mono">{r.reported_unique_id}</strong> ({r.reported_name})</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        r.status === 'resolved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {r.status}
                      </span>
                    </div>

                    {r.details && (
                      <p className="text-xs text-slate-300 bg-[#151B23] p-2.5 rounded-lg border border-white/5">
                        "{r.details}"
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px] text-slate-500">
                      <span>Reported by: {r.reporter_unique_id}</span>
                      {r.status === 'pending' && (
                        <button
                          onClick={() => handleResolveReport(r.id)}
                          className="px-3 py-1 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500 hover:text-white rounded-lg transition-colors font-medium text-xs flex items-center gap-1"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Mark Resolved
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
