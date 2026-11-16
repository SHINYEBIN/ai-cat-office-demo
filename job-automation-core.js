// Shared by the PC office and the static public demo.
function startJobAutomation({ key, listJobs, readRequirements, defaultProfile, searchMessage, reviewMessage, reservationMessage }) {
  const dialog = document.querySelector('#job-automation');
  const form = document.querySelector('#job-automation-form');
  const status = document.querySelector('#job-automation-status');
  const reportList = document.querySelector('#job-automation-report');
  const pause = document.querySelector('#job-automation-pause');
  const runNow = document.querySelector('#job-automation-run');
  const submit = form.querySelector('button[type=submit]');
  let running = false;

  function read() {
    return JSON.parse(localStorage.getItem(key) || 'null');
  }

  function write(config) {
    localStorage.setItem(key, JSON.stringify(config));
  }

  function parseRequest(request) {
    if (!/채용\s*공고/.test(request)) return;
    const match = request.match(/(오전|오후)?\s*(\d{1,2})\s*(?:시(?:\s*(?:(\d{1,2})\s*분|반))?|:\s*(\d{2}))/);
    if (!match) return;
    const hour = Number(match[2]);
    const minute = Number(match[3] || match[4] || (match[0].includes('반') ? 30 : 0));
    if (minute > 59 || hour > 23 || (match[1] && (hour < 1 || hour > 12))) return;
    const clockHour = match[1] ? hour % 12 + (match[1] === '오후' ? 12 : 0) : hour;
    return [clockHour, minute].map(value => String(value).padStart(2, '0')).join(':');
  }

  function reservationStart(request, time, now = Date.now()) {
    const seoul = now + 9 * 3600000;
    const current = new Date(seoul).toISOString();
    const today = current.slice(0, 10);
    const passed = time <= current.slice(11, 16);
    if (passed && /오늘/.test(request) && !/매일|내일/.test(request)) return;
    return /내일/.test(request) || passed ? new Date(seoul + 86400000).toISOString().slice(0, 10) : today;
  }

  function matches(job, terms) {
    const text = [job.title, job.organization, job.region, job.employment].join(' ').toLowerCase();
    const types = job.employment.toLowerCase().split(/[,·/]+/).map(type => type.trim());
    return terms.every(term => ['정규직', '비정규직', '무기계약직', '인턴'].includes(term)
      ? types.includes(term) : text.includes(term));
  }

  function assessRequirements(text, profile) {
    if (!text) return { outcome: '확인 필요', reason: '원문에서 응시자격을 확인하지 못했어요.' };
    const lines = text.split('\n').map(line => line.replace(/^[\s○●•-]+/, '').trim()).filter(Boolean);
    const degrees = { '고등학교 졸업': 0, 고졸: 0, 전문학사: 1, 전문대졸: 1, 대졸: 2, 학사: 2, 석사: 3, 박사: 4 };
    const unresolved = [];
    for (const line of lines) {
      if (/^(?:(?:응시자격|지원자격|공통)(?:\s*사항)?\s*[:：]?$|(?:학력|경력|학력\s*및\s*경력)\s*[:：]?\s*(?:무관|제한\s*없음)[.。]?$|신입\s*(?:지원\s*가능|가능)[.。]?$)/.test(line)) continue;
      const education = /^(?:학력\s*[:：]\s*)?(고등학교 졸업|고졸|전문학사|전문대졸|대졸|학사|석사|박사)(?:\s*학위)?\s*(?:이상\s*)?(?:소지자|졸업자|이상)[.。]?$/.exec(line);
      const experience = /^(?:경력\s*[:：]\s*)?(?:관련\s*(?:분야\s*)?경력\s*)?(\d+(?:\.\d+)?)\s*년\s*이상(?:\s*(?:경력(?:자)?|보유(?:자)?))?[.。]?$/.exec(line);
      if (education && profile?.education !== '') {
        if (profile?.education == null) { unresolved.push(line); continue; }
        if (Number(profile.education) < degrees[education[1]]) return { outcome: '조건 미충족', reason: line };
      } else if (experience && profile?.experience !== '') {
        if (profile?.experience == null) { unresolved.push(line); continue; }
        if (Number(profile.experience) < Number(experience[1])) return { outcome: '조건 미충족', reason: line };
      } else unresolved.push(line);
    }
    if (!lines.length || unresolved.length) return {
      outcome: '확인 필요', reason: unresolved.join(' / ').slice(0, 180) || '비교할 요건이 없어요.'
    };
    return { outcome: '1차 승인', reason: '공고에서 확인한 학력·경력 조건을 충족해요.' };
  }

  function render(config, message) {
    pause.hidden = runNow.hidden = !config;
    pause.textContent = config?.paused ? '재개' : '일시정지';
    submit.disabled = pause.disabled = running;
    runNow.disabled = running || Boolean(config?.paused);
    status.textContent = message || (config
      ? (config.repeat === false ? '한 번 ' : '매일 ') + config.time + ' · 서울 시간 · ' +
        (config.paused ? '일시정지' : config.repeat === false && config.lastRun ? '실행 완료' : '예약 중') +
        (config.firstDay && !config.lastRun ? '\n첫 실행 ' + config.firstDay + ' ' + config.time : '') +
        (config.report ? '\n' + config.report.message : '') : '');
    status.style.whiteSpace = 'pre-line';
    reportList.replaceChildren();
    for (const job of config?.report?.jobs || []) {
      const row = document.createElement('li');
      const link = document.createElement(job.url ? 'a' : 'strong');
      if (job.url) {
        link.href = job.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      link.textContent = job.organization + ' · ' + job.title;
      row.append(link, document.createTextNode(' · 마감 ' + job.deadline));
      if (job.outcome) {
        const review = document.createElement('p');
        review.className = 'muted';
        review.textContent = '코코 · ' + job.outcome + ' · ' + job.reason;
        row.append(review);
      }
      reportList.append(row);
    }
  }

  async function check(manual = false) {
    if (running || !navigator.locks) return;
    try {
      await navigator.locks.request(key, { ifAvailable: true }, async lock => {
        if (!lock) return;
        const config = read();
        const now = new Date(Date.now() + 9 * 3600000).toISOString();
        const day = now.slice(0, 10);
        if (!config || config.paused || (!manual &&
            ((config.firstDay && day < config.firstDay) || now.slice(11, 16) < config.time ||
              config.lastRun === day || (config.repeat === false && config.lastRun)))) return;
        running = true;
        config.lastRun = day;
        write(config);
        render(config, searchMessage);
        try {
          const jobs = await listJobs(day);
          const shortlist = jobs.filter(job => job.deadline >= day && matches(job, config.terms))
            .sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 5);
          render(config, reviewMessage);
          const reviews = [];
          for (const job of shortlist) {
            if (read()?.revision !== config.revision) return;
            let outcome;
            try {
              const requirements = await readRequirements(job);
              outcome = assessRequirements(requirements, config.profile);
            } catch (error) {
              if (error.rateLimited) throw error;
              outcome = { outcome: '확인 필요', reason: '원문 조회에 실패했어요.' };
            }
            reviews.push({ ...job, ...outcome });
          }
          if (read()?.revision !== config.revision) return;
          const approved = reviews.filter(job => job.outcome === '1차 승인');
          const registered = new Set(config.registered);
          const additions = approved.filter(job => !registered.has(job.id));
          const result = {};
          window.dispatchEvent(new CustomEvent('cat-office-register-job-deadlines', { detail: { jobs: additions, result } }));
          if (result.registered === undefined) throw new Error('보리가 일정을 저장하지 못했어요.');
          for (const job of additions) registered.add(job.id);
          config.registered = [...registered];
          config.report = { jobs: reviews, message: day + ' · 루루 조사 ' + jobs.length +
            '건 → 코코 1차 승인 ' + approved.length + '건 · 확인 필요 ' +
            reviews.filter(job => job.outcome === '확인 필요').length + '건 → 보리 신규 등록 ' + result.registered + '건' };
        } catch (error) {
          if (error.rateLimited) config.paused = true;
          config.report = { message: day + ' · ' + (error.name === 'TimeoutError' || error.name === 'TypeError'
            ? '공개 채용 출처에 연결하지 못했어요. 지금 조사로 다시 시도할 수 있어요.' : error.message) };
        } finally {
          running = false;
          if (read()?.revision === config.revision) write(config);
          render(read());
        }
      });
    } catch {
      running = false;
      render(null, '이 브라우저에서 반복 업무 상태를 저장하지 못했어요.');
    }
  }

  function openSettings() {
    const config = read();
    form.elements.request.value = config?.request || '';
    form.elements.keywords.value = config?.terms.join(', ') || '';
    form.elements.education.value = config?.profile?.education ?? defaultProfile?.education ?? '';
    form.elements.experience.value = config?.profile?.experience ?? defaultProfile?.experience ?? '';
    render(config, navigator.locks ? '' : '반복 업무를 지원하는 PC용 Chrome에서 열어 주세요.');
    dialog.showModal();
  }

  function saveReservation(request, time, terms, profile) {
    const previous = read();
    const firstDay = reservationStart(request, time);
    if (!firstDay) return;
    const repeat = /매일/.test(request);
    const config = { ...previous, request, time, terms, firstDay, repeat,
      profile: profile ?? previous?.profile ?? defaultProfile, paused: false, revision: crypto.randomUUID() };
    delete config.lastRun;
    write(config);
    render(config);
    return config;
  }

  window.addEventListener('cat-office-repeat-assignment', event => {
    const result = event.detail;
    if (result.employee !== 'lulu' || !/채용\s*공고/.test(result.title)) return;
    if (/예약\s*설정/.test(result.title) && !/매일/.test(result.title)) {
      result.handled = true;
      result.open = openSettings;
      return;
    }
    const time = parseRequest(result.title);
    if (!time && !/매일|예약|오늘|내일|오전|오후|\d\s*시/.test(result.title)) return;
    if (!time || !navigator.locks) {
      result.error = time ? '반복 업무를 지원하는 PC용 Chrome에서 열어 주세요.'
        : '“매일 오전 9시에 채용공고 조사해줘”처럼 시작 시간을 넣어 주세요.';
      return;
    }
    try {
      const config = saveReservation(result.title, time, read()?.terms || []);
      if (!config) {
        result.error = '오늘의 해당 시각이 지났어요. 내일 또는 이후 시각을 입력해 주세요.';
        return;
      }
      result.handled = true;
      result.message = reservationMessage(time, config);
    } catch {
      result.error = '반복 업무 예약을 저장하지 못했어요.';
    }
  });
  form.onsubmit = event => {
    event.preventDefault();
    const request = form.elements.request.value.trim();
    const time = parseRequest(request);
    if (!time) {
      status.textContent = '“매일 오전 9시에 채용공고 조사해줘”처럼 입력해 주세요.';
      return;
    }
    const terms = form.elements.keywords.value.toLowerCase().split(',').map(term => term.trim()).filter(Boolean);
    const config = saveReservation(request, time, terms, {
      education: form.elements.education.value,
      experience: form.elements.experience.value
    });
    if (!config) status.textContent = '오늘의 해당 시각이 지났어요. 내일 또는 이후 시각을 입력해 주세요.';
  };
  pause.onclick = () => {
    const config = read();
    config.paused = !config.paused;
    config.revision = crypto.randomUUID();
    write(config);
    render(config);
    if (!config.paused) void check();
  };
  runNow.onclick = () => void check(true);
  window.addEventListener('storage', event => {
    if (event.key === key && dialog.open) render(read());
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
  setInterval(check, 15000);
  void check();
}
