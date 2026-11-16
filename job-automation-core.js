// Shared by the PC office and the static public demo.
function startJobAutomation({ key, listJobs, readRequirements, defaultProfile, searchMessage, reviewMessage, reservationMessage, showPhase, showManualRun }) {
  const dialog = document.querySelector('#job-automation');
  const form = document.querySelector('#job-automation-form');
  const status = document.querySelector('#job-automation-status');
  const feedback = document.querySelector('#feedback');
  const pause = document.querySelector('#job-automation-pause');
  const runNow = document.querySelector('#job-automation-run');
  const submit = form.querySelector('button[type=submit]');
  let running = false;
  let reservationTimer;

  function read() {
    return JSON.parse(localStorage.getItem(key) || 'null');
  }

  function write(config) {
    localStorage.setItem(key, JSON.stringify(config));
  }

  function parseRequest(request) {
    const match = request.match(/(오전|오후)?\s*(\d{1,2})\s*(?:시(?:\s*(?:(\d{1,2})\s*분|반))?|:\s*(\d{2}))/);
    if (!match) return;
    const hour = Number(match[2]);
    const minute = Number(match[3] || match[4] || (match[0].includes('반') ? 30 : 0));
    if (minute > 59 || hour > 23 || (match[1] && (hour < 1 || hour > 12))) return;
    let clockHour = match[1] ? hour % 12 + (match[1] === '오후' ? 12 : 0) : hour;
    if (!match[1] && !match[4] && hour >= 1 && hour <= 12 && !/내일/.test(request)) {
      const seoul = new Date(Date.now() + 9 * 3600000);
      const minuteOfDay = seoul.getUTCHours() * 60 + seoul.getUTCMinutes();
      const morning = hour % 12;
      clockHour = minuteOfDay >= morning * 60 + minute && minuteOfDay < (morning + 12) * 60 + minute
        ? morning + 12 : morning;
    }
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

  function assessRegion(region) {
    if (/서울|경기/.test(region || '')) return;
    if (!region || /외\s*\d|미정|전국/.test(region)) {
      return { outcome: '확인 필요', reason: '서울·경기 근무지가 있는지 원문에서 확인해 주세요.' };
    }
    return { outcome: '반려', reason: '서울·경기 외 근무지 · ' + region };
  }

  function publishReports(config, completed) {
    const history = config?.reports || (config?.report ? [config.report] : []);
    window.dispatchEvent(new CustomEvent('cat-office-job-reports', { detail: { history, completed } }));
  }

  function render(config, message) {
    pause.hidden = runNow.hidden = !config;
    pause.textContent = config?.paused ? '재개' : '일시정지';
    submit.disabled = pause.disabled = running;
    runNow.disabled = running || Boolean(config?.paused);
    status.textContent = message || (config
      ? (config.repeat === false ? '한 번 ' : '매일 ') + config.time + ' · 서울 시간 · ' +
        (config.paused ? '일시정지' : config.pendingRun ? '처리 중' :
          config.repeat === false && config.lastRun ? '실행 완료' : '예약 중') +
        (config.firstDay && !config.lastRun ? '\n첫 실행 ' + config.firstDay + ' ' + config.time : '') +
        (config.report ? '\n' + config.report.message : '') : '');
    status.style.whiteSpace = 'pre-line';

  }

  async function check(manual = false) {
    if (running || !navigator.locks) return;
    try {
      await navigator.locks.request(key, { ifAvailable: true }, async lock => {
        if (!lock) return;
        const config = read();
        const now = new Date(Date.now() + 9 * 3600000).toISOString();
        const day = now.slice(0, 10);
        if (!config || config.paused || (!manual && !config.pendingRun &&
            ((config.firstDay && day < config.firstDay) || now.slice(11, 16) < config.time ||
              config.lastRun === day || (config.repeat === false && config.lastRun)))) return;
        running = true;
        config.pendingRun = true;
        write(config);
        render(config, searchMessage);
        try {
          if (manual) showManualRun?.();
          const [jobs] = await Promise.all([listJobs(day), showPhase?.('lulu', '채용공고 조사')]);
          const shortlist = jobs.filter(job => job.deadline >= day && matches(job, config.terms))
            .sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 5);
          render(config, reviewMessage);
          const reviewDisplay = shortlist.length ? showPhase?.('coco', '채용공고 검토') : undefined;
          const reviews = [];
          for (const job of shortlist) {
            if (read()?.revision !== config.revision) return;
            let outcome = config.seoulGyeonggiOnly !== false ? assessRegion(job.region) : undefined;
            if (!outcome) {
              try {
                const requirements = await readRequirements(job);
                outcome = assessRequirements(requirements, config.profile);
              } catch (error) {
                if (error.rateLimited) throw error;
                outcome = { outcome: '확인 필요', reason: '원문 조회에 실패했어요.' };
              }
            }
            if (outcome.outcome === '조건 미충족') outcome.outcome = '반려';
            reviews.push({ ...job, ...outcome });
          }
          await reviewDisplay;
          if (read()?.revision !== config.revision) return;
          const approved = reviews.filter(job => job.outcome === '1차 승인');
          const registered = new Set(config.registered);
          const additions = approved.filter(job => !registered.has(job.id));
          if (additions.length && showPhase) await showPhase('bori', '마감 일정 등록');
          if (read()?.revision !== config.revision) return;
          const result = {};
          window.dispatchEvent(new CustomEvent('cat-office-register-job-deadlines', { detail: { jobs: additions, result } }));
          if (result.registered === undefined) throw new Error('보리가 일정을 저장하지 못했어요.');
          for (const job of additions) registered.add(job.id);
          config.registered = [...registered];
          const addedIds = new Set(result.registeredIds);
          const rejected = reviews.filter(job => job.outcome === '반려').length;
          const needsReview = reviews.filter(job => job.outcome === '확인 필요').length;
          config.report = { jobs: reviews.map(job => ({ ...job, calendarState: job.outcome === '1차 승인'
            ? (addedIds.has(job.id) ? '신규 등록' : '이전 등록') : '' })),
            counts: { approved: approved.length, rejected, needsReview, registered: result.registered },
            message: day + ' · 루루 조사 ' + jobs.length +
            '건 → 코코 1차 승인 ' + approved.length + '건 · 반려 ' + rejected + '건 · 확인 필요 ' +
            reviews.filter(job => job.outcome === '확인 필요').length + '건 → 보리 신규 등록 ' + result.registered + '건' };
          if (!approved.length) config.report.message += ' · 승인된 공고가 없어 등록할 일정이 없어요.';
          else if (!result.registered) config.report.message += ' · 승인된 공고는 이미 처리했어요.';
        } catch (error) {
          if (error.rateLimited) config.paused = true;
          config.report = { message: day + ' · ' + (error.name === 'TimeoutError' || error.name === 'TypeError'
            ? '공개 채용 출처에 연결하지 못했어요. 지금 조사로 다시 시도할 수 있어요.' : error.message) };
        } finally {
          running = false;
          showPhase?.();
          if (read()?.revision === config.revision) {
            const previous = read();
            config.report.completedAt = Date.now();
            const older = previous.reports || (previous.report ? [previous.report] : []);
            config.reports = [...older, config.report];
            config.lastRun = day;
            delete config.pendingRun;
            write(config);
            if (feedback && config.report) feedback.textContent = config.report.message;
            publishReports(config, config.report);
          }
          render(read());
        }
      });
    } catch {
      running = false;
      render(null, '이 브라우저에서 반복 업무 상태를 저장하지 못했어요.');
    } finally {
      armReservation();
    }
  }

  function armReservation() {
    clearTimeout(reservationTimer);
    const config = read();
    if (!config || config.paused || running || !navigator.locks ||
        (config.repeat === false && config.lastRun && !config.pendingRun)) return;
    const now = Date.now();
    const tomorrow = new Date(now + 33 * 3600000).toISOString().slice(0, 10);
    const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
    const nextDay = config.lastRun === today ? tomorrow : today;
    const day = config.firstDay > nextDay ? config.firstDay : nextDay;
    const nextAt = config.pendingRun ? now : Date.parse(day + 'T' + config.time + ':00+09:00');
    const delay = nextAt <= now ? 250 : nextAt - now;
    reservationTimer = setTimeout(check, Math.min(delay, 2147483647));
  }

  function openSettings() {
    const config = read();
    form.elements.request.value = config?.request || '';
    form.elements.keywords.value = config?.terms.join(', ') || '';
    form.elements.education.value = config?.profile?.education ?? defaultProfile?.education ?? '';
    form.elements.experience.value = config?.profile?.experience ?? defaultProfile?.experience ?? '';
    form.elements.seoulGyeonggiOnly.checked = config?.seoulGyeonggiOnly !== false;
    render(config, navigator.locks ? '' : '반복 업무를 지원하는 PC용 Chrome에서 열어 주세요.');
    dialog.showModal();
  }

  function saveReservation(request, time, terms, profile, seoulGyeonggiOnly) {
    const previous = read();
    const firstDay = reservationStart(request, time);
    if (!firstDay) return;
    const repeat = /매일/.test(request);
    const config = { ...previous, request, time, terms, firstDay, repeat,
      profile: profile ?? previous?.profile ?? defaultProfile,
      seoulGyeonggiOnly: seoulGyeonggiOnly ?? previous?.seoulGyeonggiOnly ?? true,
      paused: false, revision: crypto.randomUUID() };
    delete config.lastRun;
    delete config.pendingRun;
    write(config);
    render(config);
    armReservation();
    return config;
  }

  window.addEventListener('cat-office-repeat-assignment', event => {
    const result = event.detail;
    if (result.employee !== 'lulu') return;
    const recruiting = /채용\s*(?:공고|정보)|구인\s*공고|채용\s*조사/.test(result.title);
    if (recruiting && /예약\s*설정/.test(result.title) && !/매일/.test(result.title)) {
      result.handled = true;
      result.open = openSettings;
      return;
    }
    const time = parseRequest(result.title);
    const wantsSchedule = time || /매일|예약|오전|오후|\d\s*시/.test(result.title);
    if (!wantsSchedule) return;
    if (!recruiting && !/업무|일\s*(?:해|시켜|맡겨|부탁|예약)/.test(result.title)) {
      result.error = '루루의 예약은 채용공고 조사에 사용할 수 있어요. 업무 내용에 “채용공고 조사”를 넣어 주세요.';
      return;
    }
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
    }, form.elements.seoulGyeonggiOnly.checked);
    if (!config) status.textContent = '오늘의 해당 시각이 지났어요. 내일 또는 이후 시각을 입력해 주세요.';
  };
  pause.onclick = () => {
    const config = read();
    config.paused = !config.paused;
    config.revision = crypto.randomUUID();
    write(config);
    render(config);
    armReservation();
    if (!config.paused) void check();
  };
  runNow.onclick = () => void check(true);
  window.addEventListener('storage', event => {
    if (event.key === key) { restoreStatus(); armReservation(); }
  });
  function restoreStatus() {
    try {
      const config = read();
      if (!config) return;
      publishReports(config);
      if (!running) render(config);
      if (!feedback || running) return;
      feedback.textContent = config.pendingRun ? '루루의 조사 작업을 이어서 처리해요.'
        : config.report?.message || (config.firstDay ? reservationMessage(config.time, config)
          : '루루 채용공고 조사 예약 · 매일 ' + config.time + ' (서울 시간)');
    } catch {
      if (feedback) feedback.textContent = '저장된 루루 예약을 읽지 못했어요.';
    }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
  restoreStatus();
  void check();
}
