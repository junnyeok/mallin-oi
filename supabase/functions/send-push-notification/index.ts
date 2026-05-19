import { createClient } from 'npm:@supabase/supabase-js@2';

// @ts-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7';

type WebhookBody = {
  type?: string;
  table?: string;
  record?: {
    id?: number;
  };
  notificationId?: number;
};

type NotificationRow = {
  id: number;
  recipient_user_id: string;
  actor_user_id: string | null;
  post_id: number | null;
  comment_id: number | null;
  notification_type: string;
  title: string;
  message: string | null;
  action_url: string | null;
  item_id: string | null;
  metadata: Record<string, unknown> | null;
};

type PushSubscriptionRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type NotificationPreferenceRow = {
  push_enabled: boolean;
  notify_comments: boolean;
  notify_replies: boolean;
  notify_reactions: boolean;
  notify_store_items: boolean;
  notify_admin_announcements: boolean;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-push-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function isAllowedByPreference(
  notificationType: string,
  pref: NotificationPreferenceRow | null,
) {
  if (!pref) return false;
  if (pref.push_enabled !== true) return false;

  if (
    notificationType === 'post_comment' ||
    notificationType === 'post_participant_comment'
  ) {
    return pref.notify_comments !== false || pref.notify_replies !== false;
  }

  if (
    notificationType === 'post_reaction_like' ||
    notificationType === 'post_reaction_dislike'
  ) {
    return pref.notify_reactions !== false;
  }

  if (notificationType === 'store_new_item') {
    return pref.notify_store_items !== false;
  }

  if (notificationType === 'admin_announcement') {
    return pref.notify_admin_announcements !== false;
  }

  return false;
}

function normalizeUrl(rawUrl: string | null, fallback = '/') {
  const value = String(rawUrl || '').trim();

  if (!value) return fallback;

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  if (value.startsWith('/')) {
    return value;
  }

  return `/${value}`;
}

function buildPayload(notification: NotificationRow) {
  const fallbackUrl = notification.post_id
    ? `/post.html?id=${notification.post_id}${
        notification.comment_id ? `&comment=${notification.comment_id}` : ''
      }`
    : '/';

  const url = normalizeUrl(notification.action_url, fallbackUrl);

  return {
    title: notification.title || '말린오이닷컴 알림',
    body: notification.message || '새 알림이 도착했어.',
    url,
    icon: '/images/android-chrome-192x192.png',
    badge: '/images/favicon-32x32.png',
    tag: `${notification.notification_type}-${notification.id}`,
    notificationId: notification.id,
    type: notification.notification_type,
    itemId: notification.item_id,
    postId: notification.post_id,
    commentId: notification.comment_id,
  };
}

async function deactivateSubscription(
  supabaseAdmin: ReturnType<typeof createClient>,
  subscriptionId: number,
) {
  await supabaseAdmin
    .from('user_push_subscriptions')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  try {
    const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET') || '';
    const receivedSecret = req.headers.get('x-push-secret') || '';

    if (webhookSecret && receivedSecret !== webhookSecret) {
      return jsonResponse({ error: 'UNAUTHORIZED' }, 401);
    }

    const supabaseUrl = getRequiredEnv('SUPABASE_URL');
    const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

    const vapidPublicKey = getRequiredEnv('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = getRequiredEnv('VAPID_PRIVATE_KEY');
    const vapidSubject = getRequiredEnv('VAPID_SUBJECT');

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const body = (await req.json()) as WebhookBody;
    const notificationId = Number(body.notificationId || body.record?.id || 0);

    if (!Number.isFinite(notificationId) || notificationId <= 0) {
      return jsonResponse({ error: 'notificationId is required' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
    });

    const { data: notification, error: notificationError } = await supabaseAdmin
      .from('user_notifications')
      .select(
        `
          id,
          recipient_user_id,
          actor_user_id,
          post_id,
          comment_id,
          notification_type,
          title,
          message,
          action_url,
          item_id,
          metadata
        `,
      )
      .eq('id', notificationId)
      .single<NotificationRow>();

    if (notificationError || !notification) {
      return jsonResponse(
        {
          error: 'NOTIFICATION_NOT_FOUND',
          detail: notificationError?.message,
        },
        404,
      );
    }

    const { data: preference, error: preferenceError } = await supabaseAdmin
      .from('user_notification_preferences')
      .select(
        `
        push_enabled,
        notify_comments,
        notify_replies,
        notify_reactions,
        notify_store_items,
        notify_admin_announcements
      `,
      )
      .eq('user_id', notification.recipient_user_id)
      .maybeSingle<NotificationPreferenceRow>();

    if (preferenceError) {
      return jsonResponse(
        {
          error: 'PREFERENCE_LOAD_FAILED',
          detail: preferenceError.message,
        },
        500,
      );
    }

    if (!isAllowedByPreference(notification.notification_type, preference)) {
      return jsonResponse({
        ok: true,
        skipped: true,
        reason: 'PUSH_DISABLED_BY_PREFERENCE',
      });
    }

    const { data: activeSubscriptions, error: activeSubscriptionError } =
      await supabaseAdmin
        .from('user_push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', notification.recipient_user_id)
        .eq('is_active', true)
        .returns<PushSubscriptionRow[]>();

    if (activeSubscriptionError) {
      return jsonResponse(
        {
          error: 'SUBSCRIPTION_LOAD_FAILED',
          detail: activeSubscriptionError.message,
        },
        500,
      );
    }

    if (!activeSubscriptions?.length) {
      return jsonResponse({
        ok: true,
        skipped: true,
        reason: 'NO_ACTIVE_SUBSCRIPTIONS',
      });
    }

    const payload = buildPayload(notification);
    const payloadText = JSON.stringify(payload);

    const results = await Promise.allSettled(
      activeSubscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payloadText,
          );

          await supabaseAdmin
            .from('user_push_subscriptions')
            .update({
              last_used_at: new Date().toISOString(),
            })
            .eq('id', sub.id);

          return {
            id: sub.id,
            ok: true,
          };
        } catch (error) {
          const statusCode =
            typeof error === 'object' && error !== null && 'statusCode' in error
              ? Number((error as { statusCode?: number }).statusCode)
              : 0;

          if (statusCode === 404 || statusCode === 410) {
            await deactivateSubscription(supabaseAdmin, sub.id);
          }

          return {
            id: sub.id,
            ok: false,
            statusCode,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    return jsonResponse({
      ok: true,
      notificationId,
      sent: results.filter(
        (result) => result.status === 'fulfilled' && result.value.ok,
      ).length,
      total: activeSubscriptions.length,
      results,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: 'EDGE_FUNCTION_FAILED',
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
