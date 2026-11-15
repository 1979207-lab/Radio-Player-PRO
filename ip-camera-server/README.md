# Phone IP Camera — локальный ONVIF/RTSP мост

Проект превращает Android-телефон в виртуальную IP-камеру для локального NVR.

## Схема

Android PWA (камера телефона)
→ HTTPS/WSS
→ Node.js + FFmpeg
→ MediaMTX (RTSP publisher)
→ ONVIF Proxy (виртуальная ONVIF Profile S камера)
→ видеорегистратор.

PWA не может сама открыть RTSP-порт или отвечать на ONVIF WS-Discovery. Поэтому ONVIF и RTSP реализуются на постоянно работающем компьютере.

## Важно про Windows и обнаружение ONVIF

Для Windows используется Docker Desktop в режиме bridge. В таком режиме multicast WS-Discovery через Docker Desktop обычно не проходит. Поэтому автоматическое обнаружение не включено: камеру нужно добавить в NVR вручную по IP и ONVIF-порту. Это поддерживается теми регистраторами, где есть поля IP/порт/логин/пароль.

Если позже выяснится, что регистратор принимает только автоматическое обнаружение, сервер лучше перенести на Linux-хост с host networking или отдельный Linux mini-PC.

## Требования

- Windows 10/11 x64 с Docker Desktop и WSL2.
- Телефон Android с Chrome.
- Телефон, компьютер и NVR в одной локальной сети.
- Видеорегистратор с ручным добавлением ONVIF-устройства.
- На компьютере должны быть свободны TCP-порты 8080, 8081, 8443 и 8554.

## Установка на Windows

1. Установите и запустите Docker Desktop (backend WSL2).
2. Скопируйте файл \`.env.example\` в \`.env\` в этой папке.
3. Откройте PowerShell и выполните \`ipconfig\`. Найдите IPv4 активного сетевого адаптера, например \`192.168.1.50\`.
4. В файле \`.env\` укажите этот адрес в \`HOST_IP\`. Задайте собственные длинные значения \`CAMERA_TOKEN\` и \`ONVIF_WEB_PASSWORD\`.
5. Откройте PowerShell в корне репозитория и выполните:

\`\`\`powershell
docker compose --env-file ip-camera-server/.env -f ip-camera-server/docker-compose.yml up -d --build
\`\`\`

6. Проверьте контейнеры:

\`\`\`powershell
docker compose --env-file ip-camera-server/.env -f ip-camera-server/docker-compose.yml ps
\`\`\`

7. Скопируйте корневой сертификат локального Caddy CA из контейнера:

\`\`\`powershell
docker cp ip-camera-caddy:/data/caddy/pki/authorities/local/root.crt .\phonecam-root.crt
\`\`\`

8. Передайте \`phonecam-root.crt\` на Android и установите как сертификат CA: Настройки → Безопасность → Шифрование и учётные данные → Установить сертификат → Сертификат CA. Названия пунктов зависят от версии Android. Если Chrome не принимает сертификат на вашем устройстве, PWA не сможет открыть защищённое соединение — это нужно проверить до настройки регистратора.

9. На телефоне откройте \`https://HOST_IP:8443/\`, заменив HOST_IP своим IP компьютера. Введите \`CAMERA_TOKEN\` из файла \`.env\`, выберите камеру и нажмите «Запустить камеру».

Если приложение опубликовано через GitHub Pages, его также можно открыть по адресу \`https://1979207-lab.github.io/Radio-Player-PRO/ip-camera/\`, но в поле «Адрес локального сервера» нужно указать \`https://HOST_IP:8443\` и доверить сертификат локального сервера.

## Добавление в видеорегистратор

1. Откройте в NVR меню «Камера» → «Добавить устройство».
2. Выберите протокол **ONVIF**.
3. Введите IP компьютера из \`HOST_IP\`.
4. Порт ONVIF: **8081**.
5. Если есть поле пути службы, укажите \`/onvif/device_service\`.
6. На первом этапе оставьте логин и пароль ONVIF пустыми: в демонстрационной конфигурации ONVIF-аутентификация устройства не включена. Пароль веб-панели ONVIF Proxy — отдельный и не является паролем камеры.
7. Сохраните устройство. Регистратор должен получить профиль и RTSP URI через ONVIF. RTSP-порт прокси на компьютере — **8554**.

Не вводите RTSP URL наугад: правильный URI должен прийти из ONVIF GetStreamUri. Если регистратор предлагает только ручной RTSP, сначала проверим адрес через ONVIF Proxy или VLC.

## Панели и порты

- PWA / HTTPS / WSS: \`https://HOST_IP:8443/\`
- ONVIF Proxy web UI: \`http://HOST_IP:8080/\` (логин и пароль из .env)
- ONVIF SOAP: TCP 8081
- RTSP, выдаваемый ONVIF Proxy: TCP 8554
- MediaMTX доступен только внутри Docker-сети.
- UDP 3702 не публикуется в Windows bridge-сборке, так как WS-Discovery multicast через Docker Desktop недоступен.

## Проверка и обслуживание

Логи:
\`\`\`powershell
docker compose --env-file ip-camera-server/.env -f ip-camera-server/docker-compose.yml logs -f app
docker compose --env-file ip-camera-server/.env -f ip-camera-server/docker-compose.yml logs -f onvif-proxy
docker compose --env-file ip-camera-server/.env -f ip-camera-server/docker-compose.yml logs -f mediamtx
\`\`\`

Остановка:
\`\`\`powershell
docker compose --env-file ip-camera-server/.env -f ip-camera-server/docker-compose.yml down
\`\`\`

Обновление:
\`\`\`powershell
docker compose --env-file ip-camera-server/.env -f ip-camera-server/docker-compose.yml pull
docker compose --env-file ip-camera-server/.env -f ip-camera-server/docker-compose.yml up -d --build
\`\`\`

## Ограничения и безопасность

- Это первая интеграционная версия; реальную совместимость нужно проверить с конкретной моделью NVR.
- Android может приостановить камеру при блокировке экрана, сворачивании Chrome, энергосбережении или перегреве. Для теста держите экран включённым, телефон на зарядке и PWA на переднем плане.
- Не открывайте порты сервера в интернет и не настраивайте проброс портов на роутере.
- Измените оба пароля и ключ в .env. Веб-панель ONVIF Proxy не должна быть доступна посторонним.
- NETIP пока не реализован: используем стандартный ONVIF, поскольку регистратор его поддерживает.
- PWA передаёт видео без звука; микрофон намеренно отключён.

## Лицензия и сторонние компоненты

ONVIF Proxy используется как отдельный компонент с лицензией MIT: https://github.com/Aiaid/onvif-proxy
MediaMTX: https://github.com/bluenviron/mediamtx
