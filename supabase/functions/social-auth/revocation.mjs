// Shared by explicit unlink and full account deletion. Never log credentials.
export async function revokePendingApple(db, providers, userId, includeLinked = false) {
  const pending = await db.from('social_auth_revocations').select('*').eq('user_id', userId);
  if (pending.error) throw new Error('APPLE_REVOCATION_FAILED');
  for (const link of pending.data || []) {
    await providers.revokeApple(link);
    const result = await db.from('social_auth_revocations').delete().eq('id', link.id).eq('user_id', userId);
    if (result.error) throw new Error('APPLE_REVOCATION_FAILED');
  }
  if (!includeLinked) return;
  const linked = await db.from('social_account_links').select('*').eq('user_id', userId).eq('provider', 'apple');
  if (linked.error) throw new Error('APPLE_REVOCATION_FAILED');
  for (const link of linked.data || []) await providers.revokeApple(link);
}
