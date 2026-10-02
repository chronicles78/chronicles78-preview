-- Chronicles-78: explicit administrator admission workflow
-- Applied to project fnwpkmjjdhflnqghnogj on 2026-10-02.

drop policy if exists profiles_read_self_pending on public.profiles;
drop policy if exists profiles_read_active on public.profiles;
create policy profiles_read_active
on public.profiles
for select
to authenticated
using (
  private.is_active_user()
  or id = (select auth.uid())
);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public','private'
as $function$
declare
  v_consent boolean;
  v_text constant text := $consent$
Я добровольно даю владельцу и редакции проекта «Хроники-78» согласие на обработку моих персональных данных и использование моего изображения для ведения закрытого электронного архива выпускников. К таким данным относятся мои имя и ФИО, класс/группа, e-mail и сведения профиля, моё изображение на архивных и загруженных фотографиях, сообщения, воспоминания, комментарии и иные материалы, которые я размещаю в проекте, а также служебные сведения о моей активности внутри архива: время посещения, открытые разделы, тип устройства и активность в чате. Эти сведения используются только для внутренней статистики, понимания востребованности разделов, работы чата, модерации и развития архива. Для этой статистики проект не сохраняет IP-адрес и не создаёт цифровой fingerprint устройства. Я разрешаю сбор, запись, систематизацию, хранение, уточнение, извлечение и использование этих данных, а также предоставление доступа к материалам закрытого архива зарегистрированным участникам в пределах правил проекта. Это согласие не является согласием на размещение моих персональных данных и изображения в открытом доступе для неопределённого круга лиц, в социальных сетях, рекламе или иных внешних публикациях: для такой публикации требуется отдельное разрешение. Согласие действует до его отзыва либо до прекращения проекта. Запрос на исправление, ограничение использования, удаление данных или отзыв согласия можно направить через раздел «Профиль → Приватность».
$consent$;
begin
  v_consent := coalesce((new.raw_user_meta_data->>'consent_personal_data')::boolean,false);

  insert into public.profiles(id,display_name,role,is_active,access_blocked)
  values(
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),split_part(new.email,'@',1)),
    'member',
    false,
    false
  )
  on conflict(id) do update
  set display_name=excluded.display_name,
      updated_at=now();

  if v_consent then
    insert into public.user_consents(user_id,consent_code,consent_version,consent_text)
    values(new.id,'archive_personal_data','2026-09-30-v3',v_text)
    on conflict(user_id,consent_code,consent_version)
    do update set withdrawn_at=null, accepted_at=now(), consent_text=excluded.consent_text;
  end if;

  return new;
end
$function$;

create or replace function public.accept_archive_personal_data_consent()
returns void
language plpgsql
security definer
set search_path to 'public','private'
as $function$
declare
  v_uid uuid := auth.uid();
  v_text constant text := $consent$
Я добровольно даю владельцу и редакции проекта «Хроники-78» согласие на обработку моих персональных данных и использование моего изображения для ведения закрытого электронного архива выпускников. К таким данным относятся мои имя и ФИО, класс/группа, e-mail и сведения профиля, моё изображение на архивных и загруженных фотографиях, сообщения, воспоминания, комментарии и иные материалы, которые я размещаю в проекте, а также служебные сведения о моей активности внутри архива: время посещения, открытые разделы, тип устройства и активность в чате. Эти сведения используются только для внутренней статистики, понимания востребованности разделов, работы чата, модерации и развития архива. Для этой статистики проект не сохраняет IP-адрес и не создаёт цифровой fingerprint устройства. Я разрешаю сбор, запись, систематизацию, хранение, уточнение, извлечение и использование этих данных, а также предоставление доступа к материалам закрытого архива зарегистрированным участникам в пределах правил проекта. Это согласие не является согласием на размещение моих персональных данных и изображения в открытом доступе для неопределённого круга лиц, в социальных сетях, рекламе или иных внешних публикациях: для такой публикации требуется отдельное разрешение. Согласие действует до его отзыва либо до прекращения проекта. Запрос на исправление, ограничение использования, удаление данных или отзыв согласия можно направить через раздел «Профиль → Приватность».
$consent$;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  insert into public.user_consents(user_id,consent_code,consent_version,consent_text)
  values(v_uid,'archive_personal_data','2026-09-30-v3',v_text)
  on conflict(user_id,consent_code,consent_version)
  do update set withdrawn_at=null, accepted_at=now(), consent_text=excluded.consent_text;

  update public.profiles
  set updated_at=now()
  where id=v_uid;
end
$function$;

create or replace function public.admin_set_profile_access(
  p_user_id uuid,
  p_is_active boolean,
  p_person_id text default null,
  p_class_group text default null
)
returns void
language plpgsql
security definer
set search_path to 'public','private','auth'
as $function$
begin
  if private.current_role()<>'admin' then
    raise exception 'not allowed';
  end if;

  if not exists(select 1 from public.profiles where id=p_user_id and role='member') then
    raise exception 'member profile not found';
  end if;

  if p_is_active then
    if not exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null) then
      raise exception 'email not confirmed';
    end if;

    if not exists(
      select 1
      from public.user_consents c
      where c.user_id=p_user_id
        and c.consent_code='archive_personal_data'
        and c.consent_version='2026-09-30-v3'
        and c.withdrawn_at is null
    ) then
      raise exception 'consent not accepted';
    end if;
  end if;

  update public.profiles
  set is_active=p_is_active,
      access_blocked=not p_is_active,
      person_id=case when p_person_id is null then person_id else nullif(p_person_id,'') end,
      class_group=case when p_class_group is null then class_group else nullif(p_class_group,'') end,
      updated_at=now()
  where id=p_user_id and role='member';
end
$function$;

create or replace function private.notify_admins_candidate_confirmed()
returns trigger
language plpgsql
security definer
set search_path to 'public','private'
as $function$
declare
  a record;
  candidate_name text;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    select display_name into candidate_name from public.profiles where id=new.id;
    for a in
      select id from public.profiles
      where role='admin' and is_active=true and access_blocked=false
    loop
      insert into public.notifications(user_id,kind,title,body,entity_type,entity_id)
      values(
        a.id,
        'access_request',
        'Новая заявка на доступ',
        coalesce(candidate_name,new.email,'Новый участник')||' подтвердил(а) e-mail и ожидает решения администратора.',
        'access_candidate',
        new.id::text
      );
    end loop;
  end if;
  return new;
end
$function$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function private.notify_admins_candidate_confirmed();
