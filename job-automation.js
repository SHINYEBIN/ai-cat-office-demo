(() => {
  function demoListings(day) {
    return [
      { id: 'sample-office', title: '콘텐츠 운영 담당', region: '서울', employment: '정규직',
        requirements: '학사학위 소지자\n관련 경력 2년 이상' },
      { id: 'sample-research', title: '콘텐츠 연구원', region: '서울', employment: '정규직',
        requirements: '박사학위 소지자' },
      { id: 'sample-data', title: '데이터 운영 담당', region: '서울', employment: '정규직',
        requirements: '정보처리기사 자격증 필수' }
    ].map(job => ({ ...job, id: job.id + '-' + day, organization: '가상 캣 컴퍼니', deadline: day }));
  }

  startJobAutomation({
    key: 'cat-office-public-demo-job-automation',
    listJobs: demoListings,
    readRequirements: job => job.requirements,
    showManualRun() {
      document.querySelector('#job-automation').close();
      location.hash = '#office';
      document.querySelector('#office').scrollIntoView({ block: 'start' });
    },
    showPhase(employee, label) {
      window.dispatchEvent(new CustomEvent('cat-office-automation-phase', { detail: { employee, label } }));
      if (employee) return new Promise(resolve => setTimeout(resolve, 2400));
    },
    defaultProfile: { education: '2', experience: '2' },
    searchMessage: '루루가 가상 채용공고를 확인하고 있어요.',
    reviewMessage: '코코가 가상 공고의 응시자격을 확인하고 있어요.',
    reservationMessage: (time, config) => '루루 가상 공고 조사 첫 실행을 ' + config.firstDay + ' ' + time + '로 예약했어요. ‘채용공고 예약 설정’에서 지금 실행할 수 있어요.'
  });
})();
