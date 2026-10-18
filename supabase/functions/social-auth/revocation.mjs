// Full account deletion only. Legacy email-account links must never revoke a separate social account.
export async function revokePendingApple(db, providers, userId, includeLinked = false) {
  let registered = [];
  if (includeLinked) {
    const result = await db.from('social_login_accounts').select('*').eq('user_id', userId).eq('provider', 'apple');
    if (result.error) throw new Error('APPLE_REVOCATION_FAILED');
    registered = result.data || [];
    if (!registered.length) return;
  }
  const pending = await db.from('social_auth_revocations').select('*').eq('user_id', userId);
  if (pending.error) throw new Error('APPLE_REVOCATION_FAILED');
  for (const link of pending.data || []) {
    await providers.revokeApple(link);
    const result = await db.from('social_auth_revocations').delete().eq('id', link.id).eq('user_id', userId);
    if (result.error) throw new Error('APPLE_REVOCATION_FAILED');
  }
  if (!includeLinked) return;
  for (const account of registered) await providers.revokeApple(account);
}
