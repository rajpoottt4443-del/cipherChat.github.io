import React, { useState } from 'react';
import { api } from '../../services/api.ts';
import { PublicUser } from '../../types/index.ts';
import { AlertTriangle, X, CheckCircle } from 'lucide-react';

interface ReportUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  peer: PublicUser;
}

export const ReportUserModal: React.FC<ReportUserModalProps> = ({ isOpen, onClose, peer }) => {
  const [reason, setReason] = useState('Spam or Solicitation');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.reports.submit(peer.id, reason, details);
      setIsSubmitted(true);
      setTimeout(() => {
        setIsSubmitted(false);
        onClose();
      }, 1800);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#151B23] border border-white/10 rounded-2xl shadow-2xl p-6 text-white relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Report User</h2>
            <p className="text-xs text-slate-400">{peer.display_name} (<span className="font-mono">{peer.unique_id}</span>)</p>
          </div>
        </div>

        {isSubmitted ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="text-sm font-semibold text-white">Report Submitted</p>
            <p className="text-xs text-slate-400">Our security team will review account violations.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Reason for Report</label>
              <select
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full py-2 px-3 rounded-lg bg-[#0B0F14] border border-white/10 text-white text-xs focus:outline-none focus:border-[#3987FF]"
              >
                <option value="Spam or Solicitation">Spam or Solicitation</option>
                <option value="Harassment or Threatening Behavior">Harassment or Threatening Behavior</option>
                <option value="Impersonation Attempt">Impersonation Attempt</option>
                <option value="Malicious Content or Phishing Link">Malicious Content or Phishing Link</option>
                <option value="Other Safety Violation">Other Safety Violation</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Additional Details (Optional)</label>
              <textarea
                rows={3}
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder="Describe the incident (private message contents remain end-to-end encrypted and are not transmitted with reports)."
                className="w-full py-2 px-3 rounded-lg bg-[#0B0F14] border border-white/10 text-white placeholder-slate-600 text-xs focus:outline-none focus:border-[#3987FF]"
              />
            </div>

            <div className="text-[11px] text-slate-500 italic">
              🔒 Privacy notice: Administrators can never read encrypted messages from this conversation.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
