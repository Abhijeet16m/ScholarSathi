(() => {
  // This script is for the public dashboard only. Leave the separate
  // private-pages copy untouched even if it references this shared asset.
  if (!document.getElementById('view-workspace')) return;

  const grid = document.getElementById('scholarship-grid');
  const feedback = document.getElementById('dashboard-feedback');
  const search = document.getElementById('dashboard-search') || document.getElementById('search-input');
  let matches = [];
  let trackedKeys = new Set();
  let currentProfile = {};

  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };

  function initials(name) {
    return String(name || 'Student').trim().split(/\s+/).filter(Boolean)
      .slice(0, 2).map(part => part[0].toUpperCase()).join('') || 'ST';
  }

  function setIdentity(student) {
    const name = String(student.name || student.profile?.fullName || 'Student').trim() || 'Student';
    for (const id of ['greeting-name', 'profile-name', 'student-name']) setText(id, name);
    for (const id of ['avatar-initials', 'student-avatar']) setText(id, initials(name));
    currentProfile = student.profile && typeof student.profile === 'object' ? student.profile : {};
    if (window.ScholarSathiExtension && Object.keys(currentProfile).length) {
      void window.ScholarSathiExtension.request('SAVE_PROFILE', { profile: currentProfile })
        .catch(error => console.info('Scholar Assist profile sync did not complete:', error.message));
    }
    const form = document.getElementById('profile-form');
    if (form) {
      const values = {
        level: currentProfile.courseLevel,
        course: currentProfile.course,
        year: currentProfile.courseYear,
        college: currentProfile.institution,
        state: currentProfile.state,
        income: currentProfile.familyIncome,
        marks: currentProfile.percentage,
      };
      for (const [fieldName, value] of Object.entries(values)) {
        const field = form.elements.namedItem(fieldName);
        if (field && value != null) field.value = String(value);
      }
    }
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.replace('/index.html');
      throw new Error('Your sign-in session has expired.');
    }
    if (!response.ok) throw new Error(payload.error || `The server returned ${response.status}.`);
    return payload;
  }

  function setFeedback(message, isError = false) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('is-error', isError);
  }

  function makeMatchCard(match) {
    const card = document.createElement('article');
    card.className = 'scholarship-card match-card';

    const top = document.createElement('div');
    top.className = 'card-top';
    const status = document.createElement('span');
    status.className = 'match-pill';
    status.textContent = match.eligibility_status || 'Needs Verification';
    top.append(status);

    const title = document.createElement('h3');
    title.textContent = match.scholarship_name || 'Scholarship';
    const provider = document.createElement('p');
    provider.className = 'provider';
    provider.textContent = match.provider || 'Provider not listed';
    const explanation = document.createElement('p');
    explanation.className = 'match-explanation';
    const applicable = Number(match.applicable_conditions) || 0;
    const matched = Number(match.matched_conditions) || 0;
    explanation.textContent = applicable
      ? `${matched} of ${applicable} eligibility checks matched`
      : 'Review the scheme criteria with its provider.';

    const due = document.createElement('p');
    due.className = 'deadline';
    const dueDate = match.deadline ? new Date(`${String(match.deadline).slice(0, 10)}T00:00:00`) : null;
    due.textContent = dueDate && !Number.isNaN(dueDate.getTime())
      ? `Deadline ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(dueDate)}`
      : 'No deadline listed';

    const details = document.createElement('p');
    details.className = 'match-explanation';
    const failures = Array.isArray(match.failed_reasons) ? match.failed_reasons : [];
    const checks = Array.isArray(match.verification_reasons) ? match.verification_reasons : [];
    details.textContent = [...failures, ...checks].join(' · ') || 'Confirm the current requirements on the official scheme page.';
    card.append(top, title, provider, explanation, due, details);

    const actions = document.createElement('div');
    actions.className = 'application-actions';
    if (match.scholarship_id != null) {
      const key = `scheme-${match.scholarship_id}`;
      const track = document.createElement('button');
      track.type = 'button';
      track.className = 'primary';
      track.textContent = trackedKeys.has(key) ? 'In my applications' : 'Track scholarship';
      track.disabled = trackedKeys.has(key);
      track.addEventListener('click', async () => {
        track.disabled = true;
        try {
          await requestJson('/api/applications', {
            method: 'POST',
            body: JSON.stringify({ scholarshipName: match.scholarship_name, scholarshipKey: key }),
          });
          const saved = await requestJson('/api/applications');
          const applications = Array.isArray(saved.applications) ? saved.applications : [];
          trackedKeys = new Set(applications.map(item => item.scholarshipKey).filter(Boolean));
          renderApplications(applications);
          track.textContent = 'In my applications';
          setText('application-progress-count', String(applications.filter(item => !item.submitted).length));
          setText('application-count', String(applications.length));
          setFeedback('Scholarship added to your application tracker.');
        } catch (error) {
          track.disabled = false;
          setFeedback(error.message, true);
        }
      });
      actions.append(track);
    }

    if (match.application_url) {
      try {
        const url = new URL(match.application_url);
        if (url.protocol === 'https:' || url.protocol === 'http:') {
          const official = document.createElement('a');
          official.className = 'stat-link';
          official.href = url.href;
          official.target = '_blank';
          official.rel = 'noopener noreferrer';
          official.textContent = 'Official scheme page ↗';
          actions.append(official);
        }
      } catch { /* Do not render invalid database URLs as links. */ }
    }
    card.append(actions);
    return card;
  }

  function renderMatches() {
    if (!grid) return;
    const query = String(search?.value || '').trim().toLocaleLowerCase();
    const filtered = matches.filter(match =>
      `${match.scholarship_name || ''} ${match.provider || ''}`.toLocaleLowerCase().includes(query));
    setText('results-count', `${filtered.length} scholarships`);
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'match-empty';
      empty.textContent = matches.length
        ? 'No scholarships match your search.'
        : 'No scholarship matches are available for the profile details saved in your account.';
      grid.replaceChildren(empty);
      return;
    }
    grid.replaceChildren(...filtered.map(makeMatchCard));
  }

  function renderApplications(applications) {
    const progress = document.getElementById('dashboard-applications-progress');
    const list = document.getElementById('dashboard-applications-list');
    const inProgress = applications.filter(item => !item.submitted);
    if (progress) progress.textContent = String(inProgress.length);
    if (!list) return;
    if (!applications.length) {
      list.textContent = 'You are not tracking any scholarships yet.';
      return;
    }
    const items = applications.map(application => {
      const item = document.createElement('p');
      item.textContent = `${application.scholarshipName || 'Scholarship'} — ${application.submitted ? 'Submitted' : 'In progress'}`;
      return item;
    });
    list.replaceChildren(...items);
  }

  function renderDeadlines() {
    const container = document.getElementById('dashboard-deadlines');
    if (!container) return;
    const upcoming = matches.map(match => {
      const date = match.deadline ? new Date(`${String(match.deadline).slice(0, 10)}T00:00:00Z`) : null;
      return { match, date };
    }).filter(item => item.date && !Number.isNaN(item.date.getTime()) && item.date >= new Date(new Date().toISOString().slice(0, 10)))
      .sort((a, b) => a.date - b.date);
    if (!upcoming.length) {
      container.textContent = 'No upcoming deadlines were returned for your current scholarship matches.';
      return;
    }
    const rows = upcoming.map(({ match, date }) => {
      const row = document.createElement('p');
      row.textContent = `${match.scholarship_name || 'Scholarship'} — ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)}`;
      return row;
    });
    container.replaceChildren(...rows);
  }

  async function syncLocalDocuments() {
    const status = document.getElementById('dashboard-documents-status');
    if (!window.ScholarSathiExtension) {
      if (status) status.textContent = 'Scholar Assist extension is not connected in this Chrome profile.';
      return null;
    }
    try {
      const result = await window.ScholarSathiExtension.request('LIST_DOCUMENTS');
      const savedTypes = new Set((Array.isArray(result.documents) ? result.documents : []).map(document => document.type));
      for (const checkbox of document.querySelectorAll('[data-document-type]')) {
        checkbox.checked = savedTypes.has(checkbox.dataset.documentType);
      }
      if (status) status.textContent = `${savedTypes.size} document(s) saved locally in this Chrome profile.`;
      const readiness = document.getElementById('document-readiness-count');
      if (readiness) readiness.textContent = `${Math.min(100, Math.round(savedTypes.size / 12 * 100))}%`;
      return savedTypes.size;
    } catch (error) {
      if (status) status.textContent = `Could not read local extension documents: ${error.message}`;
      return null;
    }
  }

  async function loadDocumentReadiness() {
    const node = document.getElementById('document-readiness-count');
    if (!node) return;
    const saved = await syncLocalDocuments();
    if (saved == null) node.textContent = window.ScholarSathiExtension ? 'Unavailable' : 'Extension unavailable';
    else node.title = `${saved} of 12 document types saved locally in this Chrome profile.`;
  }

  async function refreshMatches() {
    const result = await requestJson('/api/scholarships/matches');
    if (!Array.isArray(result.matches)) throw new Error('The scholarship service returned an invalid response.');
    matches = result.matches;
    setText('scholarship-match-count', String(matches.filter(item => item.eligibility_status === 'Eligible').length));
    renderMatches();
    renderDeadlines();
  }

  async function saveQuickProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.getElementById('profile-status');
    const values = new FormData(form);
    const booleanValue = key => currentProfile[key] === 'Yes' ? 'true' : currentProfile[key] === 'No' ? 'false' : '';
    const profile = {
      date_of_birth: currentProfile.dob || '',
      gender: currentProfile.gender || '',
      category: currentProfile.category || '',
      domicile_state: String(values.get('state') || '').trim(),
      annual_family_income: String(values.get('income') || currentProfile.familyIncome || ''),
      qualification_level: currentProfile.qualificationLevel || '',
      qualification_marks: String(values.get('marks') || ''),
      course_level: String(values.get('level') || ''),
      course_name: String(values.get('course') || '').trim(),
      course_year: String(values.get('year') || ''),
      entrance_exam_rank: currentProfile.entranceRank || '',
      institution_name: String(values.get('college') || '').trim(),
      parent_occupation: currentProfile.parentOccupation || '',
      has_disability: booleanValue('hasDisability'),
      is_orphan: booleanValue('isOrphan'),
      receives_other_scholarship: booleanValue('receivesOtherScholarship'),
      father_name: currentProfile.fatherName || '',
      mother_name: currentProfile.motherName || '',
      mobile_number: currentProfile.mobile || '',
      district: currentProfile.district || '',
    };
    const button = form.querySelector('button[type="submit"], button:not([type])');
    if (button) button.disabled = true;
    if (status) status.textContent = 'Saving profile…';
    try {
      const result = await requestJson('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams(profile),
      });
      currentProfile = result.profile || currentProfile;
      if (status) status.textContent = 'Profile saved to your account.';
      await refreshMatches().catch(error => setFeedback(error.message, true));
    } catch (error) {
      if (status) status.textContent = error.message;
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function loadScholarshipMatches() {
    try {
      const result = await requestJson('/api/scholarships/matches');
      if (!Array.isArray(result.matches)) throw new Error('The scholarship service returned an invalid response.');
      matches = result.matches;
      const eligible = matches.filter(item => item.eligibility_status === 'Eligible').length;
      setText('scholarship-match-count', String(eligible));
      renderMatches();
      renderDeadlines();
    } catch (error) {
      setText('scholarship-match-count', '—');
      setText('results-count', 'Unable to load scholarships');
      setFeedback(error.message || 'Could not load scholarship matches.', true);
      grid?.replaceChildren();
    }
  }

  async function initialize() {
    // Do not make the page wait for Render's cold start before showing the
    // signed-in student and application tracker.
    const [identityResult, applicationsResult] = await Promise.allSettled([
      requestJson('/api/auth/me'),
      requestJson('/api/applications'),
    ]);

    if (identityResult.status !== 'fulfilled') {
      if (identityResult.reason.message !== 'Your sign-in session has expired.') {
        setFeedback(identityResult.reason.message || 'Could not load your account.', true);
      }
      return;
    }
    setIdentity(identityResult.value);

    if (applicationsResult.status === 'fulfilled' && Array.isArray(applicationsResult.value.applications)) {
      const applications = applicationsResult.value.applications;
      const inProgress = applications.filter(item => !item.submitted);
      trackedKeys = new Set(applications.map(item => item.scholarshipKey).filter(Boolean));
      setText('application-progress-count', String(inProgress.length));
      setText('application-count', String(applications.length));
      renderApplications(applications);
    } else {
      setText('application-progress-count', '—');
      setText('application-count', '—');
      setText('dashboard-applications-progress', 'Unavailable');
    }

    void loadDocumentReadiness();
    void loadScholarshipMatches();
  }

  (document.getElementById('dashboard-search-form') || document.getElementById('search-form'))?.addEventListener('submit', event => {
    event.preventDefault();
    renderMatches();
  });
  search?.addEventListener('input', renderMatches);
  document.getElementById('profile-form')?.addEventListener('submit', saveQuickProfile);
  document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => {
    const nextView = document.getElementById(`view-${button.dataset.go}`);
    if (!nextView) return;
    document.querySelectorAll('.page-view').forEach(view => view.classList.toggle('active', view === nextView));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (button.dataset.go === 'documents') void syncLocalDocuments();
  }));
  (document.getElementById('logout-button') || document.getElementById('logout'))?.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Logout request failed.');
      window.location.replace('/index.html');
    } catch (error) {
      setFeedback(error.message || 'Could not log out.', true);
    }
  });

  void initialize();
})();
