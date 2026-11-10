-- 2026-11-10 (한국): 건의사항/Q&A 신규 글 및 관리자 답변 알림. 기존 글 소급 발송 없음.
begin;
alter table public.user_notifications drop constraint user_notifications_notification_type_check;
alter table public.user_notifications add constraint user_notifications_notification_type_check check (
 notification_type in ('post_comment','post_participant_comment','post_reaction_like','post_reaction_dislike',
 'store_new_item','admin_announcement','suggestion_new','suggestion_reply','qna_new','qna_reply')
);

create or replace function public.handle_inquiry_notification_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
 v_board text;
 v_label text;
 v_thread_id bigint;
 v_recipient uuid;
 v_reply boolean := TG_TABLE_NAME in ('suggestion_admin_comments','qna_admin_comments');
begin
 v_board := case when TG_TABLE_NAME in ('suggestions','suggestion_admin_comments') then 'suggestion' else 'qna' end;
 v_label := case when v_board = 'suggestion' then '건의사항' else 'Q&A' end;
 if v_reply then
   if not public.is_admin_user(new.author_id) then return new; end if;
   if v_board = 'suggestion' then
     v_thread_id := new.suggestion_id;
     select author_id into v_recipient from public.suggestions where id = v_thread_id;
   else
     v_thread_id := new.thread_id;
     select author_id into v_recipient from public.qna_threads where id = v_thread_id;
   end if;
 else
   v_thread_id := new.id;
 end if;
 -- 본문을 복사하지 않아 비밀글/답변 내용이 알림 및 푸시에 노출되지 않는다.
 insert into public.user_notifications
 (recipient_user_id,actor_user_id,actor_nickname,notification_type,title,message,action_url,metadata)
 select p.id,new.author_id,coalesce(nullif(new.author_nickname,''),'익명'),
 v_board || case when v_reply then '_reply' else '_new' end,
 case when v_reply then v_label || '에 답변이 등록됐어.' else '새 ' || v_label || '이 등록됐어.' end,
 case when v_reply then '작성한 글의 관리자 답변을 확인해줘.' else '새 글을 확인해줘.' end,
 '/' || v_board || '.html?thread=' || v_thread_id::text,
 jsonb_build_object('board_type',v_board,'thread_id',v_thread_id,'source_id',new.id)
 from public.profiles p
 where (case when v_reply then p.id = v_recipient else p.is_admin = true end)
   and p.id <> new.author_id;
 return new;
end;
$$;
revoke all on function public.handle_inquiry_notification_insert() from public, anon, authenticated;
drop trigger if exists trg_suggestions_notification on public.suggestions;
create trigger trg_suggestions_notification after insert on public.suggestions
for each row execute function public.handle_inquiry_notification_insert();
drop trigger if exists trg_suggestion_admin_comments_notification on public.suggestion_admin_comments;
create trigger trg_suggestion_admin_comments_notification after insert on public.suggestion_admin_comments
for each row execute function public.handle_inquiry_notification_insert();
drop trigger if exists trg_qna_threads_notification on public.qna_threads;
create trigger trg_qna_threads_notification after insert on public.qna_threads
for each row execute function public.handle_inquiry_notification_insert();
drop trigger if exists trg_qna_admin_comments_notification on public.qna_admin_comments;
create trigger trg_qna_admin_comments_notification after insert on public.qna_admin_comments
for each row execute function public.handle_inquiry_notification_insert();
commit;
