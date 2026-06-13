'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { optionalText } from '@/lib/form-helpers';
import { PASSWORD_REQUIREMENTS_TEXT, validatePassword } from '@/lib/password-validation';
import { toast } from 'sonner';
import FormField from '@/components/FormField';

export default function ProfilePage() {
  const { isLoading } = useAuth();
  // Don't mount the form until the session hydrates. Its fields seed from `user`
  // in useState initializers (below), so rendering before hydration — now that
  // AuthProvider no longer blocks the tree (VEG-320) — would seed them empty and
  // a save would blank the user's real display name/email.
  if (isLoading) {
    return <div className="max-w-2xl mx-auto text-gray-500 dark:text-gray-400">Loading…</div>;
  }
  return <ProfileForms />;
}

function ProfileForms() {
  const { user, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [loading, setLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName,
          email: optionalText(email),
        }),
      });
      await refreshProfile();
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setPwLoading(true);
    try {
      await apiFetch('/users/me/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast.success('Password changed');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Password change failed');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile</h1>

      <form
        onSubmit={handleProfileUpdate}
        className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4"
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Account Details</h2>
        <FormField
          label="Username"
          type="text"
          value={user?.username || ''}
          disabled
          onChange={() => {}}
        />
        <FormField
          label="Display Name"
          type="text"
          required
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
        />
        <FormField
          label="Email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      <form
        onSubmit={handleChangePassword}
        className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4"
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Change Password</h2>
        <FormField
          label="Current Password"
          type="password"
          value={currentPassword}
          onChange={e => setCurrentPassword(e.target.value)}
          required
        />
        <FormField
          label="New Password"
          type="password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          required
          helperText={PASSWORD_REQUIREMENTS_TEXT}
        />
        <FormField
          label="Confirm New Password"
          type="password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={pwLoading}
          className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-50"
        >
          {pwLoading ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </div>
  );
}
