# Резервное копирование «Хроники-78»

## Что защищается

Автоматический backup включает:

1. PostgreSQL/Supabase: роли, схема, данные и история `supabase_migrations`.
2. Supabase Storage: автоматически копируются **все** buckets, доступные через S3 на момент запуска. На 2026-10-03 это `archive-media`, `archive-originals`, `archive-pending`, `chat-media`.
3. Исходный код сайта вместе с полной историей Git. В репозитории должны храниться актуальные исходники всех развёрнутых Edge Functions.
4. `MANIFEST.txt` и SHA-256 контрольные суммы.

Архив шифруется AES-256-CBC с PBKDF2. В GitHub Actions Artifact попадает только зашифрованный `.tar.gz.enc`.

Расписание: понедельник и четверг, 01:30 UTC. Также доступен ручной запуск через GitHub Actions.

## Одноразовая настройка GitHub Secrets

Откройте репозиторий:

`Settings → Secrets and variables → Actions → New repository secret`

Создайте ровно четыре секрета. Значения секретов нельзя помещать в файлы репозитория, README, issue, commit message или сообщения чата.

### 1. SUPABASE_DB_URL

В Supabase откройте проект «Хроники-78» → **Connect** → **Session pooler** и скопируйте строку подключения к PostgreSQL.

В строке замените `[YOUR-PASSWORD]` фактическим паролем базы данных. Если пароль содержит зарезервированные URL-символы, они должны быть percent-encoded.

Сохраните всю строку как:

`SUPABASE_DB_URL`

Session pooler предпочтителен для GitHub-hosted runner, поскольку он работает через IPv4.

### 2–3. Ключи Supabase Storage S3

В Supabase:

**Storage → Configuration → S3**

Включите S3 protocol, если он ещё не включён, и создайте отдельную пару server-side access keys для резервного копирования.

Сразу сохраните:

- Access Key ID → `SUPABASE_S3_ACCESS_KEY_ID`
- Secret Access Key → `SUPABASE_S3_SECRET_ACCESS_KEY`

Secret Access Key показывается один раз.

Эти ключи имеют полный доступ к Storage и обходят RLS. Никогда не помещайте их в клиентский код или GitHub-файлы.

### 4. Пароль шифрования

Создайте отдельный длинный случайный пароль (рекомендуется не менее 24 символов) и сохраните его как:

`BACKUP_ENCRYPTION_PASSWORD`

**Этот пароль обязательно сохранить вне GitHub**, например в менеджере паролей. Потеря пароля означает невозможность расшифровать backup.

## Проверка после настройки

GitHub → **Actions → Chronicles-78 encrypted backup → Run workflow**.

Шаг `Validate backup secrets` теперь проверяет все четыре имени за один запуск и сообщает полный список отсутствующих секретов, не выводя их значения.

Успешный запуск должен создать Artifact с именем вида:

`chronicles78-backup-YYYYMMDDTHHMMSSZ`

Внутри будет только зашифрованный `.tar.gz.enc`.

## Что должно оказаться внутри после расшифровки

- `database/roles.sql`
- `database/schema.sql`
- `database/data.sql`
- `database/migration_history_schema.sql`
- `database/migration_history_data.sql`
- `storage/<bucket>/...` для каждого Storage bucket
- `source/chronicles78-preview.git.bundle`
- `MANIFEST.txt`
- `SHA256SUMS.txt`

## Расшифровка

На Mac/Linux:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in chronicles78-backup-YYYYMMDDTHHMMSSZ.tar.gz.enc \
  -out chronicles78-backup.tar.gz
tar -xzf chronicles78-backup.tar.gz
```

OpenSSL запросит `BACKUP_ENCRYPTION_PASSWORD`.

После распаковки проверьте:

```bash
cd backup
sha256sum -c SHA256SUMS.txt
```

## Важно

Штатные database backups Supabase и эта независимая копия дополняют друг друга. Бэкап базы сам по себе не восстанавливает физические Storage-объекты, поэтому они копируются отдельно через S3.

Edge Function secrets, OAuth secrets, API keys и другие внешние секреты в backup намеренно не включаются. Их необходимо хранить отдельно в защищённом менеджере секретов.

На 2026-10-03 выявлено, что последние автоматические backup-run завершались на `Validate backup secrets`: отсутствовал как минимум `SUPABASE_DB_URL`. До восстановления GitHub Actions secrets штатный backup не считается работоспособным.
