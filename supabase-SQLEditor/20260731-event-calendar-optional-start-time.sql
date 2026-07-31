-- 2026-07-31 이벤트 캘린더 시작시간 선택 처리
-- 기존 함수의 공유 일정 동기화 로직은 유지하면서 시작시간의 00:00 강제값만 제거한다.

begin;

do $migration$
declare
  v_signature text;
  v_definition text;
  v_updated_definition text;
begin
  foreach v_signature in array array[
    'public.create_event_calendar_todo_range(date,date,uuid,text,text,time without time zone,time without time zone)',
    'public.save_event_calendar_todo_range(uuid,text,text,time without time zone,time without time zone,date,date,uuid)',
    'public.create_event_calendar_todo_with_shared_personal(date,uuid,text,text,time without time zone)',
    'public.save_event_calendar_todo(uuid,text,text,time without time zone,time without time zone,date,uuid)'
  ]
  loop
    select pg_get_functiondef(to_regprocedure(v_signature))
      into v_definition;

    if v_definition is null then
      raise exception '필수 이벤트 캘린더 함수를 찾을 수 없습니다: %', v_signature;
    end if;

    v_updated_definition := replace(
      v_definition,
      'coalesce(p_event_time, ''00:00''::time)',
      'p_event_time'
    );
    v_updated_definition := replace(
      v_updated_definition,
      'COALESCE(p_event_time, ''00:00:00''::time without time zone)',
      'p_event_time'
    );
    v_updated_definition := regexp_replace(
      v_updated_definition,
      'DEFAULT[[:space:]]+''00:00:00''::time without time zone',
      'DEFAULT NULL::time without time zone',
      'gi'
    );

    if v_updated_definition = v_definition then
      raise exception '시작시간 기본값을 제거할 대상을 찾지 못했습니다: %', v_signature;
    end if;

    if v_updated_definition ~* 'coalesce[[:space:]]*\([[:space:]]*p_event_time' then
      raise exception '시작시간 00:00 강제값이 함수에 남아 있습니다: %', v_signature;
    end if;

    execute v_updated_definition;
  end loop;
end;
$migration$;

commit;
