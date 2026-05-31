import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { success: false, message: 'POST 요청만 허용됩니다.' },
      405,
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('MALLINOI_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(
        { success: false, message: '회원탈퇴 서버 설정이 누락되었습니다.' },
        500,
      );
    }

    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!jwt) {
      return jsonResponse(
        { success: false, message: '로그인이 필요합니다.' },
        401,
      );
    }

    const body = await req.json().catch(() => ({}));
    if (body?.confirmText !== '회원탈퇴') {
      return jsonResponse(
        { success: false, message: '회원탈퇴 확인 문구가 올바르지 않습니다.' },
        400,
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: userData, error: userError } =
      await userClient.auth.getUser(jwt);

    if (userError || !userData?.user?.id) {
      return jsonResponse(
        { success: false, message: '로그인 정보를 확인하지 못했습니다.' },
        401,
      );
    }

    const userId = userData.user.id;
    const { error: cleanupError } = await userClient.rpc(
      'cleanup_my_account_data',
    );

    if (cleanupError) {
      console.error('[delete-account] cleanup failed:', cleanupError);
      return jsonResponse(
        {
          success: false,
          message: '계정 데이터 정리 중 오류가 발생했습니다.',
        },
        500,
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { error: deleteError } =
      await adminClient.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error('[delete-account] auth delete failed:', deleteError);
      return jsonResponse(
        { success: false, message: 'Auth 계정 삭제 중 오류가 발생했습니다.' },
        500,
      );
    }

    return jsonResponse({
      success: true,
      message: '회원탈퇴가 완료되었습니다.',
    });
  } catch (error) {
    console.error('[delete-account] unexpected failure:', error);
    return jsonResponse(
      { success: false, message: '회원탈퇴 처리 중 오류가 발생했습니다.' },
      500,
    );
  }
});
