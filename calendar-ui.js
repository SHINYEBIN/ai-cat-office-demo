(() => {
  const storageKey = 'cat-office-public-demo-schedule';
  const briefingKey = 'cat-office-public-demo-last-briefing';
  const notificationKey = 'cat-office-briefing-notification';
  const panel = document.querySelector('#bori-calendar');
  const form = document.querySelector('#schedule-form');
  const dateField = document.querySelector('#schedule-date-field');
  const timeFields = document.querySelector('#schedule-time-fields');
  const list = document.querySelector('#schedule-events');
  const status = document.querySelector('#schedule-status');
  const briefing = document.querySelector('#bori-briefing');
  const briefingList = document.querySelector('#briefing-events');
  const notificationButton = document.querySelector('#briefing-notification');
  const notificationsSupported = false;
  const localDate = () => new Date(Date.now() + 9 * 3600000).toISOString();
  const displayDate = value => value.replace('T', ' ');
  let events = [];
  let editing;
  let lastBriefing;
  let notificationsEnabled = false;
  try {
    const today = localDate().slice(0, 10);
    const samples = [
      { id: 'demo-all-day', title: '[데모] 에피소드 소재 정리', start: today, end: '', allDay: true },
      { id: 'demo-meeting', title: '[데모] 팀 회의', start: today + 'T14:00', end: today + 'T14:30', allDay: false }
    ];
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? JSON.stringify(samples));
    if (Array.isArray(saved)) events = saved.filter(event => event && typeof event.title === 'string' && typeof event.start === 'string');
    lastBriefing = localStorage.getItem(briefingKey);
    notificationsEnabled = localStorage.getItem(notificationKey) === 'on';
  } catch {
    status.textContent = '저장된 일정을 읽지 못했어요.';
  }

  function save(updated) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      status.textContent = '이 브라우저에 일정을 저장하지 못했어요.';
      return false;
    }
    events = updated;
    render();
    return true;
  }

  function action(label, click) {
    const button = document.createElement('button');
    button.className = 'secondary';
    button.type = 'button';
    button.textContent = label;
    button.onclick = click;
    return button;
  }

  window.addEventListener('cat-office-register-job-deadlines', event => {
    const { jobs, result } = event.detail;
    const existing = new Set(events.map(item => item.id));
    const additions = jobs.filter(job => !existing.has('alio-' + job.id)).map(job => ({
      id: 'alio-' + job.id, title: '[지원 마감] ' + job.organization + ' · ' + job.title,
      start: job.deadline, end: '', allDay: true, source: job.url
    }));
    if (!additions.length || save([...events, ...additions])) result.registered = additions.length;
  });

  function scheduleRows(items, editable) {
    if (!items.length) {
      const empty = document.createElement('li');
      empty.textContent = editable ? '등록된 일정이 없어요.' : '오늘 예정된 일정이 없어요.';
      return [empty];
    }
    return [...items].sort((a, b) => a.start.localeCompare(b.start)).map(event => {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = event.title;
      const time = document.createElement('time');
      time.className = 'muted';
      time.dateTime = event.start;
      time.textContent = event.allDay
        ? (editable ? event.start + ' · 하루 종일' : '하루 종일')
        : (editable ? displayDate(event.start) : event.start.slice(11));
      if (!event.allDay && event.end) {
        time.textContent += ' – ' + (event.start.slice(0, 10) === event.end.slice(0, 10)
          ? event.end.slice(11) : displayDate(event.end));
      }
      row.append(title, time);
      if (event.source?.startsWith('https://job.alio.go.kr/mobile2021/recruit/recruitView.do?idx=')) {
        const source = document.createElement('a');
        source.href = event.source;
        source.target = '_blank';
        source.rel = 'noopener noreferrer';
        source.textContent = '공고 원문';
        row.append(source);
      }
      if (editable) {
        const controls = document.createElement('div');
        controls.className = 'actions';
        controls.append(action('수정', () => openEditor(event)), action('취소', () => {
          if (!window.confirm(displayDate(event.start) + ' · ' + event.title + ' 일정을 취소할까요?')) return;
          if (save(events.filter(item => item.id !== event.id))) {
            if (editing === event.id) closeEditor();
            status.textContent = '일정을 취소했어요.';
          }
        }));
        row.append(controls);
      }
      return row;
    });
  }

  function render() {
    list.replaceChildren(...scheduleRows(events, true));
  }

  function closeEditor() {
    form.hidden = true;
    editing = undefined;
    form.reset();
  }

  function updateDateFields() {
    const { allDay, date, start, end } = form.elements;
    dateField.hidden = !allDay.checked;
    timeFields.hidden = allDay.checked;
    date.disabled = !allDay.checked;
    start.disabled = end.disabled = allDay.checked;
  }

  function openEditor(event) {
    closeEditor();
    editing = event?.id;
    form.elements.title.value = event?.title || '';
    const { allDay, date, start, end } = form.elements;
    allDay.checked = event?.allDay === true;
    date.value = allDay.checked ? event.start : '';
    start.value = allDay.checked ? '' : event?.start || '';
    end.value = allDay.checked ? '' : event?.end || '';
    updateDateFields();
    form.hidden = false;
    status.textContent = '';
    form.elements.title.focus();
  }

  function showBriefing(day) {
    document.querySelector('#briefing-date').textContent = day + ' · 서울 시간';
    const today = events.filter(event =>
      event.start.slice(0, 10) <= day && (event.end || event.start).slice(0, 10) >= day);
    const groups = [['하루 종일', today.filter(event => event.allDay)],
      ['시간 지정', today.filter(event => !event.allDay)]];
    const sections = groups.filter(([, items]) => items.length).map(([label, items]) => {
      const section = document.createElement('li');
      const heading = document.createElement('h3');
      heading.textContent = label;
      const rows = document.createElement('ul');
      rows.className = 'schedule-list';
      rows.replaceChildren(...scheduleRows(items, false));
      section.append(heading, rows);
      return section;
    });
    briefingList.replaceChildren(...(sections.length ? sections : scheduleRows([], false)));
    if (!briefing.open) briefing.showModal();
  }

  let briefingAudio;

  function prepareBriefingAudio() {
    if (!notificationsEnabled || !window.AudioContext) return;
    try {
      briefingAudio ||= new AudioContext();
      if (briefingAudio.state !== 'running') void briefingAudio.resume().catch(() => {});
    } catch { /* System notifications can still be displayed. */ }
  }

  function playBriefingKnock() {
    if (briefingAudio?.state !== 'running') return false;
    const rate = briefingAudio.sampleRate;
    const buffer = briefingAudio.createBuffer(1, Math.ceil(.46 * rate), rate);
    const samples = buffer.getChannelData(0);
    for (const [start, frequency, duration] of [[0, 494, .17], [.20, 587, .22]]) {
      const offset = Math.round(start * rate);
      for (let sample = 0; sample < duration * rate; sample++) {
        const time = sample / rate;
        const phase = 2 * Math.PI * frequency * time;
        const envelope = Math.min(1, time / .009, (duration - time) / .055) * Math.exp(-3 * time / duration);
        samples[offset + sample] = envelope * (Math.sin(phase) + .32 * Math.sin(2.65 * phase)) * (8000 / 32768);
      }
    }
    const source = briefingAudio.createBufferSource();
    source.buffer = buffer;
    source.connect(briefingAudio.destination);
    source.start();
    return true;
  }

  document.addEventListener('pointerdown', prepareBriefingAudio);
  document.addEventListener('keydown', prepareBriefingAudio);

  function showStartNotification() {
    if (!notificationsSupported || !notificationsEnabled || Notification.permission !== 'granted') return;
    let played = false;
    try { played = playBriefingKnock(); } catch { /* Fall back to the system sound. */ }
    try {
      const notification = new Notification('보리 · 일정 브리핑', {
        body: '오늘 일정 브리핑드립니다!', tag: 'cat-office-briefing', silent: played
      });
      notification.onclick = () => { window.focus(); notification.close(); };
    } catch {
      status.textContent = '이 브라우저는 PC 알림을 표시하지 못했어요.';
    }
  }

  if (notificationsSupported) {
    const updateButton = () => {
      const enabled = notificationsEnabled && Notification.permission === 'granted';
      notificationButton.setAttribute('aria-pressed', String(enabled));
      notificationButton.textContent = enabled ? '브리핑 알림 끄기' : '브리핑 알림 켜기';
    };
    notificationButton.hidden = false;
    updateButton();
    notificationButton.onclick = async () => {
      notificationButton.disabled = true;
      try {
        if (notificationsEnabled && Notification.permission === 'granted') {
          notificationsEnabled = false;
        } else {
          notificationsEnabled = await Notification.requestPermission() === 'granted';
        }
        localStorage.setItem(notificationKey, notificationsEnabled ? 'on' : 'off');
        status.textContent = notificationsEnabled ? '브리핑을 시작할 때 PC 알림을 보여드릴게요.' :
          Notification.permission === 'denied' ? 'Chrome에서 이 사이트의 알림 권한을 허용해 주세요.' : '브리핑 알림이 꺼져 있어요.';
      } catch {
        status.textContent = '브리핑 알림 설정을 저장하지 못했어요.';
      } finally {
        updateButton();
        notificationButton.disabled = false;
      }
    };
  }
  window.addEventListener('bori-briefing-started', showStartNotification);

  window.addEventListener('bori-briefing-ready', event => {
    const { day, manual } = event.detail;
    if (document.hidden || document.querySelector('dialog[open]')) return;
    showBriefing(day);
    if (!manual || localDate().slice(11, 16) >= '08:30') {
      lastBriefing = day;
      try { localStorage.setItem(briefingKey, day); } catch {}
    }
  });
  document.querySelector('#calendar-brief').onclick = () => {
    panel.close();
    const day = localDate().slice(0, 10);
    if (window.dispatchEvent(new CustomEvent('bori-briefing-request', { cancelable: true, detail: { day, manual: true } }))) {
      showStartNotification();
      showBriefing(day);
    }
  };
  document.querySelector('#bori-calendar-close').onclick = () => panel.close();
  document.querySelector('#schedule-new').onclick = () => openEditor();
  document.querySelector('#schedule-back').onclick = closeEditor;
  panel.addEventListener('close', closeEditor);
  form.elements.allDay.addEventListener('change', () => {
    const { allDay, date, start } = form.elements;
    if (allDay.checked && start.value) date.value = start.value.slice(0, 10);
    updateDateFields();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(form));
    const allDay = form.elements.allDay.checked;
    const title = fields.title.trim();
    const start = allDay ? fields.date : fields.start;
    const end = allDay ? '' : fields.end;
    if (!title || !start || (end && end <= start)) {
      status.textContent = allDay ? '제목과 날짜를 입력해 주세요.'
        : '제목과 시작 시각을 입력하고, 종료는 시작보다 늦게 정해 주세요.';
      return;
    }
    const id = editing || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    const original = events.find(item => item.id === id);
    const updated = [...events.filter(item => item.id !== id), { ...original, id, title, start, end, allDay }];
    if (save(updated)) {
      closeEditor();
      status.textContent = '일정을 저장했어요.';
    }
  });
  window.addEventListener('storage', event => {
    if (event.key === briefingKey) lastBriefing = event.newValue;
    if (event.key !== storageKey) return;
    try {
      const updated = JSON.parse(event.newValue || '[]');
      if (Array.isArray(updated)) { events = updated; render(); }
    } catch {}
  });
  render();
})();
