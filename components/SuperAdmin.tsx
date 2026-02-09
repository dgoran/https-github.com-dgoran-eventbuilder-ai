
import React, { useState, useEffect } from 'react';
import { Trash2, Save, Key, Layout, LogOut, Users, X, Check, Activity, AlertCircle, Wifi, AlertTriangle, Lock } from 'lucide-react';
import { Button, Modal } from './UIComponents';
import { EventPlan, AdminSettings, Registrant } from '../types';
import { getEvents, deleteEvent, getAdminSettings, saveAdminSettings } from '../services/storageService';
import { getApiAuthHeaders, getApiUrl } from '../services/config';

interface SuperAdminProps {
  onLogout: () => void;
  currentEventId?: string;
  onEventDeleted?: (id: string) => void;
}

interface ManagedUser {
  id: string;
  email: string;
  role: 'organizer' | 'admin';
  firstName: string;
  lastName: string;
  organizationName: string;
  emailVerifiedAt: number | null;
  hasPassword: boolean;
  activeSessions: number;
  oauthProviders: string[];
  createdAt: number | null;
}

export const SuperAdmin: React.FC<SuperAdminProps> = ({ onLogout, currentEventId, onEventDeleted }) => {
  const [events, setEvents] = useState<EventPlan[]>([]);
  const [settings, setSettings] = useState<AdminSettings>({
    geminiApiKey: '',
    zoomApiKey: '',
    zoomAccountId: '',
    zoomClientId: '',
    zoomClientSecret: '',
    bigMarkerApiKey: '',
    bigMarkerChannelId: '',
    sendgridApiKey: '',
    smtpHost: '',
    smtp2goApiKey: '',
    smtp2goFrom: ''
  });
  const [activeTab, setActiveTab] = useState<'events' | 'keys' | 'users'>('events');
  const [selectedEventForRegistrants, setSelectedEventForRegistrants] = useState<EventPlan | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [isTestingBigMarker, setIsTestingBigMarker] = useState(false);
  const [isFindingBigMarkerChannel, setIsFindingBigMarkerChannel] = useState(false);
  const [bigMarkerChannelName, setBigMarkerChannelName] = useState('');
  const [isTestingZoom, setIsTestingZoom] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<string | null>(null);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [usersSearch, setUsersSearch] = useState('');
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [userActionId, setUserActionId] = useState<string | null>(null);
  const [selectedUserForPassword, setSelectedUserForPassword] = useState<ManagedUser | null>(null);
  const [managedPassword, setManagedPassword] = useState('');
  const [managedPasswordConfirm, setManagedPasswordConfirm] = useState('');
  const [managedPasswordError, setManagedPasswordError] = useState<string | null>(null);
  const [isManagingPassword, setIsManagingPassword] = useState(false);
  const [isSuperadminAuthenticated, setIsSuperadminAuthenticated] = useState(false);
  const [isSuperadminCheckingSession, setIsSuperadminCheckingSession] = useState(true);
  const [superadminUsername, setSuperadminUsername] = useState('admin');
  const [superadminPassword, setSuperadminPassword] = useState('admin');
  const [superadminAuthError, setSuperadminAuthError] = useState<string | null>(null);
  const [isSuperadminSubmitting, setIsSuperadminSubmitting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newSuperadminUsername, setNewSuperadminUsername] = useState('');
  const [newSuperadminPassword, setNewSuperadminPassword] = useState('');
  const [confirmSuperadminPassword, setConfirmSuperadminPassword] = useState('');

  useEffect(() => {
    checkSuperadminSession();
  }, []);

  const checkSuperadminSession = async () => {
    setIsSuperadminCheckingSession(true);
    try {
      const response = await fetch(getApiUrl('/api/superadmin/me'), { credentials: 'include' });
      if (!response.ok) {
        setIsSuperadminAuthenticated(false);
        return;
      }
      const body = await response.json().catch(() => ({}));
      const username = String(body.username || 'admin');
      setSuperadminUsername(username);
      setNewSuperadminUsername(username);
      setIsSuperadminAuthenticated(true);
      await Promise.all([loadData(), checkServerStatus()]);
    } catch (error) {
      setIsSuperadminAuthenticated(false);
    } finally {
      setIsSuperadminCheckingSession(false);
    }
  };

  const handleSuperadminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuperadminAuthError(null);
    setIsSuperadminSubmitting(true);
    try {
      const response = await fetch(getApiUrl('/api/superadmin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: superadminUsername.trim(),
          password: superadminPassword
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || 'Failed to sign in as superadmin');
      }
      setIsSuperadminAuthenticated(true);
      setNewSuperadminUsername(String(body.username || superadminUsername).trim());
      setCurrentPassword('');
      setNewSuperadminPassword('');
      setConfirmSuperadminPassword('');
      await Promise.all([loadData(), checkServerStatus()]);
    } catch (error) {
      setSuperadminAuthError(error instanceof Error ? error.message : 'Failed to sign in as superadmin');
    } finally {
      setIsSuperadminSubmitting(false);
    }
  };

  const handleSuperadminLogout = async () => {
    await fetch(getApiUrl('/api/superadmin/logout'), {
      method: 'POST',
      credentials: 'include'
    }).catch(() => undefined);
    setIsSuperadminAuthenticated(false);
    setSuperadminAuthError(null);
    setCurrentPassword('');
    setNewSuperadminPassword('');
    setConfirmSuperadminPassword('');
    onLogout();
  };

  const handleChangeSuperadminCredentials = async () => {
    setSuperadminAuthError(null);
    if (newSuperadminPassword !== confirmSuperadminPassword) {
      setSuperadminAuthError('New password and confirmation do not match.');
      return;
    }
    setIsSuperadminSubmitting(true);
    try {
      const response = await fetch(getApiUrl('/api/superadmin/change-credentials'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword,
          newUsername: newSuperadminUsername.trim(),
          newPassword: newSuperadminPassword,
          confirmPassword: confirmSuperadminPassword
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || 'Failed to change credentials');
      }
      setSuperadminUsername(String(body.username || newSuperadminUsername).trim());
      setCurrentPassword('');
      setNewSuperadminPassword('');
      setConfirmSuperadminPassword('');
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    } catch (error) {
      setSuperadminAuthError(error instanceof Error ? error.message : 'Failed to change credentials');
    } finally {
      setIsSuperadminSubmitting(false);
    }
  };

  const checkServerStatus = async () => {
    try {
      const res = await fetch(getApiUrl('/api/health'));
      if (res.ok) {
        setServerStatus('online');
      } else {
        setServerStatus('offline');
      }
    } catch (e) {
      setServerStatus('offline');
    }
  };

  const loadData = async () => {
    try {
      const loadedEvents = await getEvents();
      // Sort by date created desc
      loadedEvents.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setEvents(loadedEvents);

      const loadedSettings = await getAdminSettings();
      setSettings(loadedSettings);
      await loadUsers();
    } catch (error) {
      console.error("Failed to load admin data", error);
    }
  };

  const loadUsers = async () => {
    setIsUsersLoading(true);
    try {
      const response = await fetch(getApiUrl('/api/admin/users'), {
        credentials: 'include',
        headers: { ...getApiAuthHeaders() }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || 'Failed to load users');
      }
      const users = Array.isArray(body.users) ? body.users : [];
      setManagedUsers(users);
    } catch (error) {
      console.error('Failed to load users', error);
      setManagedUsers([]);
    } finally {
      setIsUsersLoading(false);
    }
  };

  const handleUserRoleChange = async (user: ManagedUser, role: 'organizer' | 'admin') => {
    setUserActionId(user.id);
    try {
      const response = await fetch(getApiUrl(`/api/admin/users/${encodeURIComponent(user.id)}`), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getApiAuthHeaders() },
        body: JSON.stringify({
          firstName: user.firstName,
          lastName: user.lastName,
          organizationName: user.organizationName,
          role
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || 'Failed to update user role');
      }
      await loadUsers();
    } catch (error: any) {
      alert(error?.message || 'Failed to update user role');
    } finally {
      setUserActionId(null);
    }
  };

  const handleRevokeUserSessions = async (user: ManagedUser) => {
    setUserActionId(user.id);
    try {
      const response = await fetch(getApiUrl(`/api/admin/users/${encodeURIComponent(user.id)}/revoke-sessions`), {
        method: 'POST',
        credentials: 'include',
        headers: { ...getApiAuthHeaders() }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || 'Failed to revoke sessions');
      }
      await loadUsers();
    } catch (error: any) {
      alert(error?.message || 'Failed to revoke user sessions');
    } finally {
      setUserActionId(null);
    }
  };

  const handleDeleteUser = async (user: ManagedUser) => {
    const confirmed = window.confirm(`Delete user ${user.email}? This cannot be undone.`);
    if (!confirmed) return;
    setUserActionId(user.id);
    try {
      const response = await fetch(getApiUrl(`/api/admin/users/${encodeURIComponent(user.id)}`), {
        method: 'DELETE',
        credentials: 'include',
        headers: { ...getApiAuthHeaders() }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || 'Failed to delete user');
      }
      await loadUsers();
    } catch (error: any) {
      alert(error?.message || 'Failed to delete user');
    } finally {
      setUserActionId(null);
    }
  };

  const openPasswordModal = (user: ManagedUser) => {
    setSelectedUserForPassword(user);
    setManagedPassword('');
    setManagedPasswordConfirm('');
    setManagedPasswordError(null);
  };

  const closePasswordModal = () => {
    setSelectedUserForPassword(null);
    setManagedPassword('');
    setManagedPasswordConfirm('');
    setManagedPasswordError(null);
    setIsManagingPassword(false);
  };

  const handleSetManagedPassword = async () => {
    if (!selectedUserForPassword) return;
    setManagedPasswordError(null);
    if (!managedPassword || managedPassword.length < 8) {
      setManagedPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (managedPassword !== managedPasswordConfirm) {
      setManagedPasswordError('Password and confirmation must match.');
      return;
    }

    setIsManagingPassword(true);
    try {
      const response = await fetch(getApiUrl(`/api/admin/users/${encodeURIComponent(selectedUserForPassword.id)}/password`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getApiAuthHeaders() },
        body: JSON.stringify({ newPassword: managedPassword })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || 'Failed to set user password');
      }
      await loadUsers();
      closePasswordModal();
    } catch (error: any) {
      setManagedPasswordError(error?.message || 'Failed to set user password');
    } finally {
      setIsManagingPassword(false);
    }
  };

  const handleClearManagedPassword = async () => {
    if (!selectedUserForPassword) return;
    const confirmed = window.confirm(`Clear password for ${selectedUserForPassword.email}?`);
    if (!confirmed) return;

    setManagedPasswordError(null);
    setIsManagingPassword(true);
    try {
      const response = await fetch(getApiUrl(`/api/admin/users/${encodeURIComponent(selectedUserForPassword.id)}/password`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getApiAuthHeaders() },
        body: JSON.stringify({ clearPassword: true })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || 'Failed to clear user password');
      }
      await loadUsers();
      closePasswordModal();
    } catch (error: any) {
      setManagedPasswordError(error?.message || 'Failed to clear user password');
    } finally {
      setIsManagingPassword(false);
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    const targetId = String(id).trim();
    if (!targetId) return;

    setEventToDelete(targetId);
    setShowDeleteConfirm(true);
  };

  const performDelete = async () => {
    if (!eventToDelete) return;

    const success = await deleteEvent(eventToDelete);

    if (success) {
      // Optimistically remove from UI
      setEvents(prevEvents => prevEvents.filter(ev => String(ev.id).trim() !== eventToDelete));

      // Notify parent if the currently active event was deleted
      if (currentEventId && String(currentEventId).trim() === eventToDelete) {
        if (onEventDeleted) {
          onEventDeleted(eventToDelete);
        }
      }
      setShowDeleteConfirm(false);
      setEventToDelete(null);
    } else {
      alert("Could not delete event. It may have already been removed. Reloading list...");
      loadData();
      setShowDeleteConfirm(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await saveAdminSettings(settings);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
      await loadData();
    } catch (error: any) {
      alert(error?.message || 'Failed to save settings');
    }
  };

  const handleTestBigMarker = async () => {
    const typedKey = (settings.bigMarkerApiKey || '').trim();
    const typedChannelId = (settings.bigMarkerChannelId || '').trim();
    const hasStoredServerKey = !!settings.hasBigMarkerKey;
    const hasStoredChannelId = !!settings.hasBigMarkerChannelId;
    if (!typedKey && !hasStoredServerKey) {
      alert("Please enter an API Key first or save one to the server.");
      return;
    }
    setIsTestingBigMarker(true);
    try {
      const response = await fetch(getApiUrl('/api/admin/test-bigmarker'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getApiAuthHeaders() },
        body: JSON.stringify({
          bigMarkerApiKey: typedKey,
          bigMarkerChannelId: typedChannelId
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || `BigMarker connection failed (${response.status})`);
      }
      const channelIdUsed = body.channelId || typedChannelId || (hasStoredChannelId ? '[stored on server]' : 'none');
      alert(`BigMarker connection successful.\nSource: ${body.source || 'api'}\nChannel ID: ${channelIdUsed}`);
    } catch (error: any) {
      alert(`BigMarker connection failed.\n\n${error?.message || 'Unknown error'}`);
    } finally {
      setIsTestingBigMarker(false);
    }
  };

  const handleFindBigMarkerChannelId = async () => {
    const queryName = (bigMarkerChannelName || '').trim();
    if (!queryName) {
      alert('Enter a BigMarker channel name first.');
      return;
    }

    setIsFindingBigMarkerChannel(true);
    try {
      const params = new URLSearchParams();
      params.set('name', queryName);
      const typedKey = (settings.bigMarkerApiKey || '').trim();
      if (typedKey) {
        params.set('apiKey', typedKey);
      }

      const response = await fetch(getApiUrl(`/api/admin/bigmarker/channels?${params.toString()}`), {
        credentials: 'include',
        headers: { ...getApiAuthHeaders() }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || `Channel lookup failed (${response.status})`);
      }

      const matches = Array.isArray(body.matches) ? body.matches : [];
      if (matches.length === 0) {
        alert(`No BigMarker channels found for name: "${queryName}"`);
        return;
      }

      const best = matches[0];
      const resolvedId = String(best.channel_id || '').trim();
      if (resolvedId) {
        setSettings({ ...settings, bigMarkerChannelId: resolvedId });
      }

      if (matches.length === 1) {
        alert(`Matched channel: ${best.name}\nChannel ID: ${resolvedId}`);
      } else {
        const preview = matches.slice(0, 5).map((m: any) => `${m.name} -> ${m.channel_id}`).join('\n');
        alert(`Multiple channels matched. Auto-selected first:\n${best.name} -> ${resolvedId}\n\nTop matches:\n${preview}`);
      }
    } catch (error: any) {
      alert(`Failed to find channel.\n\n${error?.message || 'Unknown error'}`);
    } finally {
      setIsFindingBigMarkerChannel(false);
    }
  };

  const handleTestZoom = async () => {
    const typedToken = (settings.zoomApiKey || '').trim();
    const typedAccountId = (settings.zoomAccountId || '').trim();
    const typedClientId = (settings.zoomClientId || '').trim();
    const typedClientSecret = (settings.zoomClientSecret || '').trim();
    const hasTypedS2S = !!(typedAccountId && typedClientId && typedClientSecret);
    const hasStored = !!(settings.hasZoomKey || settings.hasZoomAccountId || settings.hasZoomClientId || settings.hasZoomClientSecret);
    if (!typedToken && !hasTypedS2S && !hasStored) {
      alert('Please enter Zoom credentials first or save them to the server.');
      return;
    }

    setIsTestingZoom(true);
    try {
      const response = await fetch(getApiUrl('/api/admin/test-zoom'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getApiAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          zoomApiKey: typedToken,
          zoomAccountId: typedAccountId,
          zoomClientId: typedClientId,
          zoomClientSecret: typedClientSecret
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || `Zoom connection failed (${response.status})`);
      }
      const email = body.user?.email ? `\nUser: ${body.user.email}` : '';
      const accountId = body.user?.account_id ? `\nAccount: ${body.user.account_id}` : '';
      const source = body.source ? `\nSource: ${body.source}` : '';
      alert(`Zoom connection successful.${email}${accountId}${source}`);
    } catch (error: any) {
      alert(`Zoom connection failed.\n\n${error?.message || 'Unknown error'}`);
    } finally {
      setIsTestingZoom(false);
    }
  };

  const RegistrantsModal = () => {
    if (!selectedEventForRegistrants) return null;
    const list = selectedEventForRegistrants.registrants || [];

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
          <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
            <div>
              <h3 className="text-xl font-bold text-slate-800">Event Registrants</h3>
              <p className="text-sm text-slate-500">{selectedEventForRegistrants.title}</p>
            </div>
            <button onClick={() => setSelectedEventForRegistrants(null)} className="text-slate-400 hover:text-slate-600">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto">
            {list.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No registrants found for this event yet.</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-3 text-sm font-semibold text-slate-500">Name</th>
                    <th className="pb-3 text-sm font-semibold text-slate-500">Email</th>
                    <th className="pb-3 text-sm font-semibold text-slate-500">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {list.map((reg, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-3 text-slate-800 font-medium">{reg.name}</td>
                      <td className="py-3 text-slate-600">{reg.email}</td>
                      <td className="py-3 text-slate-400 text-sm">{new Date(reg.registeredAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-between items-center">
            <span className="text-sm text-slate-500">Total: <strong>{list.length}</strong></span>
            <button onClick={() => setSelectedEventForRegistrants(null)} className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50">Close</button>
          </div>
        </div>
      </div>
    );
  };

  const filteredUsers = managedUsers.filter((user) => {
    const q = usersSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      user.email.toLowerCase().includes(q) ||
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(q) ||
      (user.organizationName || '').toLowerCase().includes(q)
    );
  });

  if (isSuperadminCheckingSession) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="inline-flex items-center gap-2 text-slate-600">
          <Activity className="w-4 h-4 animate-spin" />
          Checking superadmin session...
        </div>
      </div>
    );
  }

  if (!isSuperadminAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <form onSubmit={handleSuperadminLogin} className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-5">
          <div className="flex items-center gap-2 text-slate-900">
            <Lock className="w-5 h-5" />
            <h2 className="text-xl font-bold">SuperAdmin Sign In</h2>
          </div>
          <p className="text-sm text-slate-600">
            Restricted area. Temporary default credentials are <span className="font-semibold">admin / admin</span>.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
            <input
              value={superadminUsername}
              onChange={(e) => setSuperadminUsername(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={superadminPassword}
              onChange={(e) => setSuperadminPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              autoComplete="current-password"
              required
            />
          </div>
          {superadminAuthError && (
            <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
              {superadminAuthError}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onLogout}
              className="px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isSuperadminSubmitting}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-2.5"
            >
              {isSuperadminSubmitting ? 'Signing In...' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex relative">
      <RegistrantsModal />

      {/* Toast Notification */}
      {showSuccessToast && (
        <div className="fixed top-6 right-6 z-[100] bg-green-600 text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 animate-bounce-in">
          <div className="bg-white/20 p-1 rounded-full">
            <Check className="w-5 h-5" />
          </div>
          <span className="font-bold">API Configuration Saved Successfully</span>
        </div>
      )}

      {/* Admin Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex-shrink-0 flex flex-col h-screen sticky top-0">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold text-red-400">SuperAdmin</h1>
          <p className="text-xs text-slate-400 mt-1">Backend Management</p>
        </div>
        <nav className="flex-grow p-4 space-y-2">
          <button
            onClick={() => setActiveTab('events')}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${activeTab === 'events' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Layout className="w-5 h-5" /> Events Database
          </button>
          <button
            onClick={() => setActiveTab('keys')}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${activeTab === 'keys' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Key className="w-5 h-5" /> API Integrations
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${activeTab === 'users' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Users className="w-5 h-5" /> User Management
          </button>
        </nav>
        <div className="p-4 border-t border-slate-800">
          <div className={`flex items-center gap-2 mb-4 text-xs font-medium ${serverStatus === 'online' ? 'text-green-400' : 'text-red-400'
            }`}>
            {serverStatus === 'online' ? <Activity className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            Backend: {serverStatus === 'checking' ? 'Checking...' : (serverStatus === 'online' ? 'Online' : 'Offline')}
          </div>
          <button onClick={handleSuperadminLogout} className="w-full text-left px-4 py-2 text-slate-400 hover:text-white flex items-center gap-2">
            <LogOut className="w-4 h-4" /> Exit Admin
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-grow p-8 overflow-auto h-screen">
        {activeTab === 'events' ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-800">Managed Webinars</h2>
              <button
                onClick={loadData}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Refresh List
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-4 font-semibold text-slate-600 text-sm w-1/3">Title</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm">Created</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm">Registrants</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm">Budget</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">No events found in database.</td>
                    </tr>
                  ) : events.map(event => (
                    <tr key={event.id} className="hover:bg-slate-50">
                      <td className="p-4 font-medium text-slate-800">
                        <div className="truncate max-w-xs">{event.title}</div>
                      </td>
                      <td className="p-4 text-slate-500 text-sm">
                        {event.createdAt ? new Date(event.createdAt).toLocaleDateString() : 'Unknown'}
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => setSelectedEventForRegistrants(event)}
                          className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-medium text-sm bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors"
                        >
                          <Users className="w-4 h-4" />
                          {event.registrants ? event.registrants.length : 0}
                        </button>
                      </td>
                      <td className="p-4 text-slate-500 text-sm">{event.budget.currency}{event.budget.totalBudget.toLocaleString()}</td>
                      <td className="p-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, String(event.id))}
                          className="text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50 transition-colors inline-block cursor-pointer"
                          title="Delete Event"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'users' ? (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <h2 className="text-2xl font-bold text-slate-800">User Management</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={usersSearch}
                  onChange={(e) => setUsersSearch(e.target.value)}
                  placeholder="Search by email, name, organization"
                  className="w-80 max-w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <button
                  onClick={loadUsers}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Refresh
                </button>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-4 font-semibold text-slate-600 text-sm">Email</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm">Role</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm">Password</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm">Session</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm">Created</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isUsersLoading ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">Loading users...</td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">No users found.</td>
                    </tr>
                  ) : filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="p-4">
                        <div className="font-medium text-slate-800">{user.email}</div>
                        <div className="text-xs text-slate-500">
                          {user.firstName || user.lastName ? `${user.firstName} ${user.lastName}`.trim() : 'No name'}{user.organizationName ? ` • ${user.organizationName}` : ''}
                        </div>
                      </td>
                      <td className="p-4">
                        <select
                          value={user.role}
                          onChange={(e) => handleUserRoleChange(user, e.target.value as 'organizer' | 'admin')}
                          disabled={userActionId === user.id}
                          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                        >
                          <option value="organizer">Organizer</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="p-4 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${user.hasPassword ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {user.hasPassword ? 'Set' : 'Not set'}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-slate-600">{user.activeSessions} active</td>
                      <td className="p-4 text-sm text-slate-500">{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}</td>
                      <td className="p-4 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => openPasswordModal(user)}
                          disabled={userActionId === user.id}
                          className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2 py-1 rounded border border-indigo-200"
                        >
                          Password
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevokeUserSessions(user)}
                          disabled={userActionId === user.id}
                          className="text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 px-2 py-1 rounded border border-amber-200"
                        >
                          Revoke Sessions
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(user)}
                          disabled={userActionId === user.id}
                          className="text-xs bg-red-50 text-red-700 hover:bg-red-100 px-2 py-1 rounded border border-red-200"
                        >
                          Delete User
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">API & Integration Keys</h2>
            <div className="space-y-6">

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold text-violet-900 mb-4 flex items-center gap-2">
                  <Key className="w-5 h-5" /> AI Configuration
                </h3>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Gemini API Key</label>
                  <input
                    type="password"
                    value={settings.geminiApiKey || ''}
                    onChange={e => setSettings({ ...settings, geminiApiKey: e.target.value.trim() })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="AIza..."
                  />
                  {!settings.geminiApiKey && settings.hasGeminiKey && (
                    <p className="text-xs text-emerald-700 mt-1">A Gemini API key is already stored securely on the server.</p>
                  )}
                  <p className="text-xs text-slate-500 mt-2">
                    Security: restrict this key in Google AI Studio/Cloud to Gemini API only, limit allowed origins/IPs, and rotate immediately if exposed.
                  </p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold text-indigo-900 mb-4 flex items-center gap-2">
                  <Key className="w-5 h-5" /> Webinar Platforms
                </h3>
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={handleTestZoom}
                    disabled={isTestingZoom}
                    className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded border border-indigo-200 flex items-center gap-1 transition-colors"
                  >
                    {isTestingZoom ? (
                      <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></span>
                    ) : (
                      <Wifi className="w-3 h-3" />
                    )}
                    Test Zoom Connection
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Zoom Server-to-Server Account ID</label>
                    <input
                      type="password"
                      value={settings.zoomAccountId || ''}
                      onChange={e => setSettings({ ...settings, zoomAccountId: e.target.value.trim() })}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      placeholder="Your Zoom Account ID"
                    />
                    {!settings.zoomAccountId && settings.hasZoomAccountId && (
                      <p className="text-xs text-emerald-700 mt-1">A Zoom Account ID is already stored securely on the server.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Zoom Server-to-Server Client ID</label>
                    <input
                      type="password"
                      value={settings.zoomClientId || ''}
                      onChange={e => setSettings({ ...settings, zoomClientId: e.target.value.trim() })}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      placeholder="Your Zoom Client ID"
                    />
                    {!settings.zoomClientId && settings.hasZoomClientId && (
                      <p className="text-xs text-emerald-700 mt-1">A Zoom Client ID is already stored securely on the server.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Zoom Server-to-Server Client Secret</label>
                    <input
                      type="password"
                      value={settings.zoomClientSecret || ''}
                      onChange={e => setSettings({ ...settings, zoomClientSecret: e.target.value.trim() })}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      placeholder="Your Zoom Client Secret"
                    />
                    {!settings.zoomClientSecret && settings.hasZoomClientSecret && (
                      <p className="text-xs text-emerald-700 mt-1">A Zoom Client Secret is already stored securely on the server.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Zoom Raw API Token (Fallback)</label>
                    <input
                      type="password"
                      value={settings.zoomApiKey || ''}
                      onChange={e => setSettings({ ...settings, zoomApiKey: e.target.value.trim() })}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      placeholder="eyJhbGciOiJIUzI1NiJ9..."
                    />
                    {!settings.zoomApiKey && settings.hasZoomKey && (
                      <p className="text-xs text-emerald-700 mt-1">A Zoom token is already stored securely on the server.</p>
                    )}
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-slate-700">BigMarker API Key</label>
                      <button
                        type="button"
                        onClick={handleTestBigMarker}
                        disabled={isTestingBigMarker}
                        className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2 py-1 rounded border border-indigo-200 flex items-center gap-1 transition-colors"
                      >
                        {isTestingBigMarker ? (
                          <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></span>
                        ) : (
                          <Wifi className="w-3 h-3" />
                        )}
                        Test Connection
                      </button>
                    </div>
                    <input
                      type="password"
                      value={settings.bigMarkerApiKey}
                      onChange={e => setSettings({ ...settings, bigMarkerApiKey: e.target.value.trim() })}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      placeholder="bm_api_..."
                    />
                    {!settings.bigMarkerApiKey && settings.hasBigMarkerKey && (
                      <p className="text-xs text-emerald-700 mt-1">A BigMarker API key is already stored securely on the server.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">BigMarker Channel ID (Hosted By)</label>
                    <input
                      type="text"
                      value={settings.bigMarkerChannelId || ''}
                      onChange={e => setSettings({ ...settings, bigMarkerChannelId: e.target.value.replace(/[^\d]/g, '') })}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      placeholder="123456"
                    />
                    {!settings.bigMarkerChannelId && settings.hasBigMarkerChannelId && (
                      <p className="text-xs text-emerald-700 mt-1">A BigMarker Channel ID is already stored on the server.</p>
                    )}
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-slate-700">Find Channel ID By Name</label>
                      <button
                        type="button"
                        onClick={handleFindBigMarkerChannelId}
                        disabled={isFindingBigMarkerChannel}
                        className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2 py-1 rounded border border-indigo-200 flex items-center gap-1 transition-colors"
                      >
                        {isFindingBigMarkerChannel ? (
                          <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></span>
                        ) : (
                          <Wifi className="w-3 h-3" />
                        )}
                        Find Channel ID
                      </button>
                    </div>
                    <input
                      type="text"
                      value={bigMarkerChannelName}
                      onChange={e => setBigMarkerChannelName(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      placeholder="Exact or partial channel name"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold text-emerald-900 mb-4 flex items-center gap-2">
                  <Key className="w-5 h-5" /> Email & SMTP
                </h3>
                <div className="mb-4">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                    settings.activeEmailRelay === 'smtp2go'
                      ? 'bg-emerald-100 text-emerald-800'
                      : settings.activeEmailRelay === 'smtp'
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-slate-100 text-slate-700'
                  }`}>
                    Active Relay: {settings.activeEmailRelay === 'smtp2go' ? 'SMTP2GO API' : settings.activeEmailRelay === 'smtp' ? 'Legacy SMTP' : 'None'}
                  </span>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">SendGrid API Key</label>
                    <input
                      type="password"
                      value={settings.sendgridApiKey}
                      onChange={e => setSettings({ ...settings, sendgridApiKey: e.target.value.trim() })}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      placeholder="SG.xxxxx..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">SMTP2GO API Key</label>
                    <input
                      type="password"
                      value={settings.smtp2goApiKey || ''}
                      onChange={e => setSettings({ ...settings, smtp2goApiKey: e.target.value.trim() })}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      placeholder="smtp2go_api_key_..."
                    />
                    {!settings.smtp2goApiKey && settings.hasSmtp2goKey && (
                      <p className="text-xs text-emerald-700 mt-1">An SMTP2GO API key is already stored securely on the server.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">SMTP2GO Sender (From)</label>
                    <input
                      type="text"
                      value={settings.smtp2goFrom || ''}
                      onChange={e => setSettings({ ...settings, smtp2goFrom: e.target.value.trim() })}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      placeholder="EventBuilder <noreply@yourdomain.com>"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Host (Legacy)</label>
                    <input
                      type="text"
                      value={settings.smtpHost}
                      onChange={e => setSettings({ ...settings, smtpHost: e.target.value.trim() })}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      placeholder="smtp.example.com"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Lock className="w-5 h-5" /> SuperAdmin Credentials
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Current Username</label>
                    <input
                      type="text"
                      value={superadminUsername}
                      disabled
                      className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">New Username</label>
                    <input
                      type="text"
                      value={newSuperadminUsername}
                      onChange={e => setNewSuperadminUsername(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                    <input
                      type="password"
                      value={newSuperadminPassword}
                      onChange={e => setNewSuperadminPassword(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmSuperadminPassword}
                      onChange={e => setConfirmSuperadminPassword(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleChangeSuperadminCredentials}
                    disabled={isSuperadminSubmitting}
                    className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-lg"
                  >
                    {isSuperadminSubmitting ? 'Updating...' : 'Update SuperAdmin Credentials'}
                  </button>
                </div>
                {superadminAuthError && (
                  <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 mt-4">
                    {superadminAuthError}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleSaveSettings}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-indigo-200"
              >
                <Save className="w-5 h-5" /> Save Configuration
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Event"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4 bg-red-50 p-4 rounded-xl border border-red-100 text-red-800">
            <div className="bg-red-100 p-2 rounded-full flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="font-semibold">This action cannot be undone.</p>
              <p className="text-sm opacity-90">Doing so will permanently delete the event plan and all its associated data.</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={performDelete}>
              Delete Event
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!selectedUserForPassword}
        onClose={closePasswordModal}
        title="Manage User Password"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            User: <span className="font-semibold text-slate-800">{selectedUserForPassword?.email || ''}</span>
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
            <input
              type="password"
              value={managedPassword}
              onChange={(e) => setManagedPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
            <input
              type="password"
              value={managedPasswordConfirm}
              onChange={(e) => setManagedPasswordConfirm(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="Repeat password"
            />
          </div>
          {managedPasswordError && (
            <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
              {managedPasswordError}
            </p>
          )}
          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={handleClearManagedPassword}
              disabled={isManagingPassword}
              className="text-sm bg-red-50 text-red-700 hover:bg-red-100 px-3 py-2 rounded-lg border border-red-200"
            >
              Clear Password
            </button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={closePasswordModal}>
                Cancel
              </Button>
              <button
                type="button"
                onClick={handleSetManagedPassword}
                disabled={isManagingPassword}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg"
              >
                {isManagingPassword ? 'Saving...' : 'Set Password'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
