// Courses: enrol form, student sign-in / sign-out / password, and "lesson done" in the lesson player.
import { $, api, attribution, backend, formJson, showFieldError, setMsg, toast } from './lib.js';

/* Enrol: create the account (or use the existing one) and the course order, then pay. */
const enroll = $('[data-enroll-form]');
if (enroll) {
  const btn = $('[data-enroll-submit]', enroll);
  const msg = $('[data-form-msg]', enroll);
  enroll.addEventListener('submit', async (e) => {
    e.preventDefault();
    showFieldError(enroll);
    setMsg(msg, '');
    if (!enroll.reportValidity()) return;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'প্রক্রিয়া চলছে…';
    try {
      const r = await api(`/api/courses/${encodeURIComponent(enroll.dataset.course)}/order`, {
        method: 'POST',
        body: { ...formJson(enroll), agree: enroll.agree.checked, attribution: attribution() },
      });
      if (r.alreadyEnrolled) {
        setMsg(msg, 'আপনি আগেই এই কোর্সে ভর্তি আছেন — লগইন করে দেখুন।', true);
        location.href = r.studentUrl;
        return;
      }
      // Same event id as the server's Conversions API InitiateCheckout (deduplicated by Meta).
      window.SBTrack?.fire('InitiateCheckout', {
        value: r.total, currency: 'BDT', num_items: 1, content_type: 'product',
        content_ids: [`course-${enroll.dataset.courseId}`], content_name: enroll.dataset.title, content_category: enroll.dataset.category,
      }, r.initiateEventId);
      if (r.existingAccount) toast('এই নম্বরে আগের অ্যাকাউন্ট আছে — কোর্সটি সেখানেই যোগ হবে; আগের পাসওয়ার্ডেই লগইন করবেন।');
      location.href = r.free ? r.studentUrl : r.redirectUrl || backend(r.orderUrl);
    } catch (err) {
      showFieldError(enroll, err.code, err.message);
      setMsg(msg, err.message);
      btn.disabled = false;
      btn.textContent = label;
    }
  });
}

/* Student sign-in */
const login = $('[data-student-login]');
if (login) {
  login.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('[data-form-msg]', login);
    const btn = $('button', login);
    btn.disabled = true;
    try {
      await api('/api/student/login', { method: 'POST', body: formJson(login) });
      location.href = login.dataset.next || '/student';
    } catch (err) {
      setMsg(msg, err.message);
      btn.disabled = false;
    }
  });
}

$('[data-student-logout]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/api/student/logout', { method: 'POST', body: {} }).catch(() => {});
  location.href = '/student';
});

const pw = $('[data-student-password]');
if (pw) {
  pw.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('[data-form-msg]', pw);
    try {
      await api('/api/student/password', { method: 'POST', body: formJson(pw) });
      pw.reset();
      setMsg(msg, 'পাসওয়ার্ড বদলানো হয়েছে।', true);
    } catch (err) {
      showFieldError(pw, err.code, err.message);
      setMsg(msg, err.message);
    }
  });
}

/* Lesson player: mark done, then go to the next lesson. */
const done = $('[data-lesson-done]');
if (done) {
  const lessonId = Number($('[data-lesson]').dataset.lesson);
  done.addEventListener('click', async () => {
    const wasDone = done.dataset.done === '1';
    const next = done.dataset.next;
    // Already done and there is a next lesson: just go on. Already done on the last lesson: undo.
    if (wasDone && next) { location.href = next; return; }
    done.disabled = true;
    try {
      await api('/api/student/progress', { method: 'POST', body: { lessonId, done: !wasDone } });
      if (next && !wasDone) location.href = next;
      else location.reload();
    } catch (err) {
      toast(err.message, true);
      done.disabled = false;
    }
  });
}
