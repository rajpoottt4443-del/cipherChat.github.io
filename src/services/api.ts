import { AuthUser, ContactItem, ConversationItem, MessageItem, PublicUser, UserSession } from '../types/index.ts';

const TOKEN_KEY = 'cipherchat_auth_token_v1';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = 'An unexpected error occurred.';
    try {
      const errorData = await response.json();
      errorMsg = errorData.error || errorData.message || errorMsg;
    } catch {
      errorMsg = await response.text() || errorMsg;
    }
    throw new Error(errorMsg);
  }

  // Handle empty or text responses
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  }
  return (await response.text()) as unknown as T;
}

export const api = {
  auth: {
    register: (data: {
      email: string;
      password: string;
      display_name: string;
      username: string;
      public_identity_key: string;
      public_key_fingerprint: string;
    }) => request<{ message: string; token: string; user: AuthUser; verification_code: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

    login: (identifier: string, password: string) =>
      request<{ message: string; token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      }),

    verifyEmail: (code?: string, bypass?: boolean) =>
      request<{ message: string; user: AuthUser }>('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ code, bypass }),
      }),

    resendVerification: () =>
      request<{ message: string; verification_code: string; user: AuthUser }>('/api/auth/resend-verification', {
        method: 'POST',
      }),

    me: () => request<{ user: AuthUser }>('/api/auth/me'),

    logout: () =>
      request<{ message: string }>('/api/auth/logout', {
        method: 'POST',
      }),

    changePassword: (current_password: string, new_password: string) =>
      request<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password, new_password }),
      }),

    resetPasswordRequest: (email: string) =>
      request<{ message: string; reset_token?: string; security_warning?: string }>('/api/auth/reset-password-request', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),

    resetPassword: (reset_token: string, new_password: string) =>
      request<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ reset_token, new_password }),
      }),
  },

  user: {
    updateProfile: (data: {
      display_name?: string;
      username?: string;
      avatar_url?: string;
      settings?: Partial<AuthUser['settings']>;
    }) =>
      request<{ message: string; user: AuthUser }>('/api/user/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    updateIdentityKey: (public_identity_key: string, public_key_fingerprint: string) =>
      request<{ message: string; user: AuthUser }>('/api/user/identity-key', {
        method: 'PUT',
        body: JSON.stringify({ public_identity_key, public_key_fingerprint }),
      }),

    deleteAccount: () =>
      request<{ message: string }>('/api/user/account', {
        method: 'DELETE',
      }),

    getSessions: () => request<{ sessions: UserSession[] }>('/api/user/sessions'),

    deleteSession: (sessionId: string) =>
      request<{ message: string }>(`/api/user/sessions/${sessionId}`, {
        method: 'DELETE',
      }),

    revokeOtherSessions: () =>
      request<{ message: string }>('/api/user/sessions/revoke-others', {
        method: 'POST',
      }),
  },

  users: {
    lookup: (uniqueId: string) =>
      request<{
        user: PublicUser;
        relationship_status: 'none' | 'pending' | 'accepted' | 'declined' | 'blocked';
        relationship_id: string | null;
        is_requester: boolean;
      }>(`/api/users/lookup?unique_id=${encodeURIComponent(uniqueId)}`),
  },

  contacts: {
    list: () => request<{ contacts: ContactItem[] }>('/api/contacts'),

    sendRequest: (data: { target_unique_id?: string; target_user_id?: string }) =>
      request<{ message: string; contact: ContactItem }>('/api/contacts/request', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    respond: (contactId: string, action: 'accepted' | 'declined' | 'blocked') =>
      request<{ message: string; conversationId?: string; contact: any }>(`/api/contacts/${contactId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
  },

  conversations: {
    list: () => request<{ conversations: ConversationItem[] }>('/api/conversations'),

    getMessages: (conversationId: string) =>
      request<{ messages: MessageItem[] }>(`/api/conversations/${conversationId}/messages`),

    sendMessage: (conversationId: string, data: { encrypted_payload: any; reply_to_id?: string }) =>
      request<{ message: string; data: MessageItem }>(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  messages: {
    delete: (messageId: string) =>
      request<{ message: string }>(`/api/messages/${messageId}`, {
        method: 'DELETE',
      }),
  },

  attachments: {
    upload: (encrypted_data: string, filename_hint: string, content_type: string) =>
      request<{
        attachment_id: string;
        download_url: string;
        size_bytes: number;
        filename_hint: string;
      }>('/api/attachments/upload', {
        method: 'POST',
        body: JSON.stringify({ encrypted_data, filename_hint, content_type }),
      }),

    download: async (attachmentId: string): Promise<string> => {
      const response = await fetch(`/api/attachments/${attachmentId}`);
      if (!response.ok) throw new Error('Attachment download failed');
      return await response.text();
    },
  },

  reports: {
    submit: (reported_user_id: string, reason: string, details?: string) =>
      request<{ message: string; report_id: string }>('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ reported_user_id, reason, details }),
      }),
  },

  admin: {
    getStats: () => request<any>('/api/admin/stats'),
    getUsers: () => request<{ users: any[] }>('/api/admin/users'),
    updateUserStatus: (userId: string, status: 'active' | 'suspended') =>
      request<{ message: string; user: any }>(`/api/admin/users/${userId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),
    getReports: () => request<{ reports: any[] }>('/api/admin/reports'),
    resolveReport: (reportId: string) =>
      request<{ message: string; report: any }>(`/api/admin/reports/${reportId}/resolve`, {
        method: 'POST',
      }),
  },
};
