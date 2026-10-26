// 紀錄存取：只存在這台電腦的瀏覽器裡
(function (root) {
  'use strict';
  const RCDD = root.RCDD = root.RCDD || {};
  const PREFIX = 'rcdd.';
  const memory = {};

  function read(key, fallback) {
    try {
      const raw = root.localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return key in memory ? memory[key] : fallback;
    }
  }
  function write(key, value) {
    memory[key] = value;
    try { root.localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* 無法儲存時只保留在記憶體 */ }
  }

  function dayKey(d) {
    const x = new Date(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }

  RCDD.storage = {
    getProfile: id => read('profile.' + id, null),
    saveProfile: (id, p) => write('profile.' + id, p),
    resetProfile(id) {
      const p = read('profile.' + id, null);
      // 保留第一次測量的最大角度，才能繼續比較進步
      write('profile.' + id, p && p.firstMax ? { firstMax: p.firstMax } : null);
    },
    listSessions: () => read('sessions', []),
    addSession(s) {
      const list = read('sessions', []);
      list.push(s);
      write('sessions', list.slice(-200));
      // 次數統計另外存，不受上面最多 200 筆的限制
      const u = read('usage', null);
      if (u) write('usage', RCDD.stats.addUsage(u, s));
    },
    // 每天每種運動的次數；第一次使用時從現有紀錄算出來
    usage() {
      let u = read('usage', null);
      if (!u) {
        u = RCDD.stats.buildUsage(read('sessions', []));
        write('usage', u);
      }
      return u;
    },
    // 集點紀錄：{ date, delta, reason, code?, status? }
    listLedger: () => read('points', []),
    addLedger(entry) {
      const list = read('points', []);
      list.push(entry);
      write('points', list);
    },
    getSetting: (k, d) => read('setting.' + k, d),
    setSetting: (k, v) => write('setting.' + k, v),
    // 連續運動天數（今天還沒做時，從昨天往回算）
    streak() {
      const days = new Set(read('sessions', []).filter(s => s.reps > 0 && !s.demo).map(s => dayKey(s.date)));
      const d = new Date();
      if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
      let n = 0;
      while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
      return n;
    },
    doneToday() {
      const today = dayKey(new Date());
      return read('sessions', []).some(s => s.reps > 0 && !s.demo && dayKey(s.date) === today);
    }
  };
})(window);
