# Резервное копирование «Хроники-78»

## Что защищается

Автоматический backup включает:

1. PostgreSQL/Supabase: роли, схема и данные.
2. Supabase Storage: бакеты `archive-media` и `chat-media`.
3. Исходный код сайта вместе с историей Git.
4. `MANIFEST.txt` и SHA-256 контрольные суммы.

Архив шифруется AES-256-CBC с PBKDF2. В публичный GitHub попадает только файл `.enc`.

Расписание: понедельник и четверг, 01:30 UTC. Также доступен ручной запуск через GitHub Actions.

## Одноразовая настройка GitHub Secrets

Откройте репозиторий:

`Settings → Secrets and variables → Actions → New repository secret`

Создайте ровно четыре секрета.

### 1. SUPABASE_DB_URL

В Supabase откройте проект «Хроники-78» → **Connect** и скопируйте строку подключения к PostgreSQL (Session pooler или Direct connection) с паролем базы.

Сохраните всю строку как:

`SUPABASE_DB_URL`

### 2–3. Ключи Supabase Storage S3

В Supabase:

**Storage → S3 Configuration / S3 → Access keys**

Включите S3, если он ещё не включён, и создайте новую пару ключей.

Сразу сохраните:

- Access Key ID → `SUPABASE_S3_ACCESS_KEY_ID`
- Secret Access Key → `SUPABASE_S3_SECRET_ACCESS_KEY`

Secret Access Key показывается один раз.

Эти ключи имеют полный доступ к Storage. Никогда не помещайте их в index.html, сообщения чата, GitHub-файлы или README.

### 4. Пароль шифрования

Создайте отдельный длинный пароль (рекомендуется 24+ случайных символа) и сохраните его как:

`BACKUP_ENCRYPTION_PASSWORD`

**Этот пароль необходимо дополнительно сохранить вне GitHub**, например в менеджере паролей или в другом защищённом месте. Потеря пароля означает невозможность расшифровать backup.

## Проверка после настройки

GitHub → **Actions → Chronicles-78 encrypted backup → Run workflow**.

Успешный запуск должен создать Artifact с именем вида:

`chronicles78-backup-YYYYMMDDTHHMMSSZ`

Внутри будет только зашифрованный `.tar.gz.enc`.

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

Штатные database backups Supabase и эта независимая копия дополняют друг друга. Бэкап базы Supabase сам по себе не восстанавливает удалённые Storage-файлы, поэтому `archive-media` и `chat-media` копируются отдельно.
