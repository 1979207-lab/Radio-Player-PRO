/* Radio Player PRO — русское голосовое управление */
(() => {
  'use strict';
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const button = document.getElementById('voiceBtn');
  const wakeButton = document.getElementById('voiceWakeBtn');
  const output = document.getElementById('voiceStatus');
  if (!button || !wakeButton || !output) return;

  let recognition = null;
  let mode = 'idle'; // idle | command | wake
  let armed = false;
  let restartWake = false;
  let speaking = false;
  let armTimer = null;

  const say = (message) => {
    output.textContent = message;
    output.classList.remove('error');
    if (!('speechSynthesis' in window)) return;
    try {
      speaking = true;
      if (recognition && mode !== 'idle') recognition.stop();
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'ru-RU';
      utterance.rate = 1;
      utterance.onend = utterance.onerror = () => {
        speaking = false;
        if (mode === 'wake' && recognition) {
          try { recognition.start(); } catch (_) {}
        }
      };
      window.speechSynthesis.speak(utterance);
    } catch (_) { speaking = false; }
  };

  const normalize = value => value.toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е').replace(/[?!.,;:]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  function setMode(next) {
    mode = next;
    button.classList.toggle('active', next === 'command');
    wakeButton.classList.toggle('active', next === 'wake');
    wakeButton.setAttribute('aria-pressed', String(next === 'wake'));
    button.textContent = next === 'command' ? '🎙️ Слушаю…' : '🎙️ Голосовая команда';
    wakeButton.textContent = next === 'wake' ? '👂 Прослушивание включено' : '👂 Привет, радио';
  }

  function stopListening() {
    mode = 'idle'; armed = false; restartWake = false;
    clearTimeout(armTimer);
    if (recognition) { try { recognition.stop(); } catch (_) {} }
    setMode('idle');
    output.textContent = 'Голосовое управление выключено';
  }

  function currentStation() {
    return Number.isInteger(current) && current >= 0 && STATIONS[current] ? STATIONS[current].name : '';
  }

  function command(raw) {
    const original = raw.trim();
    const text = normalize(original);
    if (!text) return false;

    if (/^(стоп|пауза|останови( радио)?|выключи( радио)?)$/.test(text)) {
      if (playing) playBtn.click();
      say('Радио остановлено'); return true;
    }
    if (/^(играй|продолжи|включи радио|запусти радио|воспроизведение)$/.test(text)) {
      if (!playing) playBtn.click();
      say('Включаю радио'); return true;
    }
    if (/(следующ(ая|ую) станци(ю|я)|дальше|следующая)$/.test(text)) {
      select((current + 1 + STATIONS.length) % STATIONS.length);
      say('Следующая станция: ' + currentStation()); return true;
    }
    if (/(предыдущ(ая|ую) станци(ю|я)|назад|предыдущая)$/.test(text)) {
      select((current - 1 + STATIONS.length) % STATIONS.length);
      say('Предыдущая станция: ' + currentStation()); return true;
    }
    if (/случайн(ую|ая) станци(ю|я)/.test(text)) {
      randomBtn.click(); say('Включаю случайную станцию: ' + currentStation()); return true;
    }
    if (/добавь в избранное|в избранное/.test(text)) {
      if (current < 0) { say('Сначала выберите станцию'); return true; }
      if (!favorites.has(current)) toggleFavorite(current);
      say('Добавила в избранное: ' + currentStation()); return true;
    }
    if (/убери из избранного|удали из избранного/.test(text)) {
      if (current >= 0 && favorites.has(current)) toggleFavorite(current);
      say('Готово'); return true;
    }
    if (/включи избранное|покажи избранное/.test(text)) {
      category = 'Избранное'; query = ''; searchEl.value = '';
      renderTabs(); renderList();
      if (favorites.size) {
        const first = [...favorites][0]; select(first);
        say('Включаю избранное: ' + STATIONS[first].name);
      } else say('Избранных станций пока нет');
      return true;
    }

    const volumeMatch = text.match(/громкость(?: на)? (\d{1,3})(?: процентов?)?/);
    if (volumeMatch) {
      const percent = Math.max(0, Math.min(100, Number(volumeMatch[1])));
      audio.volume = percent / 100; volEl.value = audio.volume; save();
      say('Громкость ' + percent + ' процентов'); return true;
    }
    if (/громче|увеличь громкость/.test(text)) {
      audio.volume = Math.min(1, audio.volume + 0.1); volEl.value = audio.volume; save();
      say('Громкость ' + Math.round(audio.volume * 100) + ' процентов'); return true;
    }
    if (/тише|уменьши громкость/.test(text)) {
      audio.volume = Math.max(0, audio.volume - 0.1); volEl.value = audio.volume; save();
      say('Громкость ' + Math.round(audio.volume * 100) + ' процентов'); return true;
    }
    if (/без звука|выключи звук|отключи звук/.test(text)) {
      audio.volume = 0; volEl.value = 0; save(); say('Звук выключен'); return true;
    }

    let stationQuery = text
      .replace(/^(найди|найти|включи|поставь|запусти) (станцию |радио )?/, '')
      .replace(/^(станцию |радио )/, '').trim();
    if (stationQuery && stationQuery.length >= 2) {
      const index = STATIONS.findIndex(st => normalize(st.name).includes(stationQuery));
      if (index >= 0) {
        category = 'Все'; query = ''; searchEl.value = '';
        renderTabs(); select(index); say('Включаю ' + STATIONS[index].name); return true;
      }
      const matches = STATIONS.filter(st => normalize(st.name).includes(stationQuery));
      if (matches.length > 1) { say('Нашла несколько станций. Назовите точнее'); return true; }
    }
    say('Не поняла команду. Скажите: следующая станция, громкость 30 процентов или включи Радио Рекорд');
    return false;
  }

  function initRecognition() {
    if (!Recognition) {
      output.textContent = 'В этом браузере распознавание речи не поддерживается. Попробуйте Chrome на Android.';
      output.classList.add('error');
      button.disabled = wakeButton.disabled = true;
      return false;
    }
    if (recognition) return true;
    recognition = new Recognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = event => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      if (mode === 'command') {
        setMode('idle');
        command(transcript);
        mode = 'idle';
      } else if (mode === 'wake') {
        const clean = normalize(transcript);
        const wake = clean.indexOf('привет радио');
        if (wake >= 0) {
          const remainder = clean.slice(wake + 'привет радио'.length).trim();
          if (remainder) { command(remainder); armed = false; }
          else {
            armed = true;
            say('Слушаю. Какая команда?');
            clearTimeout(armTimer);
            armTimer = setTimeout(() => { armed = false; if (mode === 'wake') output.textContent = 'Скажите «Привет, радио», чтобы дать команду'; }, 8000);
          }
        } else if (armed) {
          clearTimeout(armTimer); armed = false; command(transcript);
        }
      }
    };
    recognition.onerror = event => {
      const messages = {
        'not-allowed': 'Разрешите доступ к микрофону в настройках браузера',
        'service-not-allowed': 'Сервис распознавания речи запрещён браузером',
        'no-speech': 'Речь не услышана. Попробуйте ещё раз',
        'network': 'Ошибка сети при распознавании речи',
        'audio-capture': 'Микрофон не найден'
      };
      output.textContent = messages[event.error] || ('Ошибка микрофона: ' + event.error);
      output.classList.add('error');
      if (mode === 'command') setMode('idle');
    };
    recognition.onend = () => {
      if (mode === 'wake' && !speaking) {
        setTimeout(() => { if (mode === 'wake') { try { recognition.start(); } catch (_) {} } }, 350);
      } else if (mode === 'command') {
        setMode('idle');
      }
    };
    return true;
  }

  button.addEventListener('click', () => {
    if (!initRecognition()) return;
    if (mode === 'wake') stopListening();
    if (mode === 'command') { stopListening(); return; }
    setMode('command');
    output.textContent = 'Говорите команду…';
    try { recognition.start(); }
    catch (_) { setMode('idle'); output.textContent = 'Не удалось включить микрофон. Повторите попытку'; output.classList.add('error'); }
  });

  wakeButton.addEventListener('click', () => {
    if (!initRecognition()) return;
    if (mode === 'wake') { stopListening(); return; }
    if (recognition) { try { recognition.stop(); } catch (_) {} }
    armed = false; setMode('wake');
    output.textContent = 'Слушаю фразу «Привет, радио». Не блокируйте экран';
    try { recognition.start(); }
    catch (_) { setMode('idle'); output.textContent = 'Не удалось запустить прослушивание'; output.classList.add('error'); }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'wake') {
      output.textContent = 'Браузер свернут: постоянное прослушивание может остановиться';
    }
  });
  if (!Recognition) {
    output.textContent = 'Голосовое управление доступно в браузере с поддержкой Web Speech API (например, Chrome Android)';
  }
})();