/* 손맛 — 라우팅, 타이머, 챔질/릴링 게임, 화면 렌더링 */

(function () {
  const el = id => document.getElementById(id);

  /* ---------------------------------------------------------- */
  /* 재사용 카운트다운 (일시정지/재개 지원)                        */
  /* ---------------------------------------------------------- */
  class Countdown {
    constructor(durationMs, onTick, onComplete) {
      this.durationMs = durationMs;
      this.onTick = onTick;
      this.onComplete = onComplete;
      this.endTime = null;
      this.timerId = null;
      this.isPaused = false;
      this.pauseStart = null;
    }
    start() {
      this.endTime = Date.now() + this.durationMs;
      this.isPaused = false;
      this._tick();
    }
    _tick() {
      if (this.isPaused) return;
      const remaining = this.endTime - Date.now();
      this.onTick(Math.max(0, remaining));
      if (remaining <= 0) {
        this.stop();
        this.onComplete();
        return;
      }
      this.timerId = setTimeout(() => this._tick(), 200);
    }
    pause() {
      if (this.isPaused) return;
      this.isPaused = true;
      this.pauseStart = Date.now();
      clearTimeout(this.timerId);
    }
    resume() {
      if (!this.isPaused) return;
      const pausedFor = Date.now() - this.pauseStart;
      this.endTime += pausedFor;
      this.isPaused = false;
      this._tick();
    }
    stop() {
      clearTimeout(this.timerId);
    }
  }

  /* ---------------------------------------------------------- */
  /* 전역 상태                                                     */
  /* ---------------------------------------------------------- */
  const state = loadState();
  const ui = {
    durationMin: state.settings.lastDuration || 25,
    selectedBait: state.settings.selectedBait || 'dduckbap'
  };

  let currentScreen = 'start';
  let sessionCtx = null;
  let focusCountdown = null;
  let biteCountdown = null;
  let reelState = null;
  let collectionFilter = 'all';

  let autoPaused = false;
  let hiddenAt = null;
  const VISIBILITY_GRACE_MS = 5000;

  const BITE_WINDOWS_MS = [1300, 1100, 900];

  /* ---------------------------------------------------------- */
  /* 유틸                                                          */
  /* ---------------------------------------------------------- */
  function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatTimeOfDay(date) {
    let h = date.getHours();
    const m = date.getMinutes();
    const ampm = h < 12 ? '오전' : '오후';
    h = h % 12;
    if (h === 0) h = 12;
    return `${ampm} ${h}:${String(m).padStart(2, '0')}`;
  }

  function formatMinutesHM(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);
    return `${h}시간 ${m}분`;
  }

  function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diffToMonday);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  let toastTimer = null;
  function showToast(msg, ms) {
    const t = el('toast');
    t.textContent = msg;
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-visible'), ms || 2200);
  }

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('is-active', 'is-entering');
    });
    const target = document.querySelector(`.screen[data-screen="${name}"]`);
    if (!target) return;
    target.classList.add('is-active');
    requestAnimationFrame(() => target.classList.add('is-entering'));
    currentScreen = name;
  }

  /* ---------------------------------------------------------- */
  /* 세션 로그 / 통계 반영                                          */
  /* ---------------------------------------------------------- */
  function logSession(entry) {
    const now = new Date();
    const full = Object.assign(
      {
        id: 's' + now.getTime() + Math.random().toString(36).slice(2, 7),
        dateISO: now.toISOString(),
        date: formatDateKey(now)
      },
      entry
    );
    state.sessionLog.push(full);
    if (state.sessionLog.length > 300) {
      state.sessionLog.splice(0, state.sessionLog.length - 300);
    }
    state.stats.totalFocusMinutes += entry.durationMin || 0;
    saveState(state);
  }

  function recordCatch(fishId, sizeCm, caughtAtDate) {
    const existing = state.collection[fishId];
    const bestSize = existing ? Math.max(existing.bestSizeCm, sizeCm) : sizeCm;
    state.collection[fishId] = {
      caught: true,
      bestSizeCm: bestSize,
      lastSizeCm: sizeCm,
      caughtAt: caughtAtDate.toISOString(),
      catchCount: (existing ? existing.catchCount : 0) + 1
    };
    state.stats.totalCatches += 1;
    saveState(state);
  }

  function countSessionsToday(log) {
    const key = formatDateKey(new Date());
    return log.filter(e => e.date === key).length;
  }

  function recentCatchesThisWeek(log) {
    const start = startOfWeek(new Date());
    return log
      .filter(e => e.fishId && new Date(e.dateISO) >= start)
      .sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
  }

  function computeWeeklyMinutes(log) {
    const start = startOfWeek(new Date());
    const arr = [0, 0, 0, 0, 0, 0, 0];
    log.forEach(entry => {
      const d = new Date(entry.dateISO);
      if (d >= start) {
        const diffDays = Math.floor((d - start) / 86400000);
        if (diffDays >= 0 && diffDays < 7) arr[diffDays] += entry.durationMin || 0;
      }
    });
    return arr;
  }

  function computeStreakDays(log) {
    const daysWithSession = new Set(log.map(e => e.date));
    let streak = 0;
    const cursor = new Date();
    while (daysWithSession.has(formatDateKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function relativeDayLabel(dateISO) {
    const d = new Date(dateISO);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dOnly = new Date(d);
    dOnly.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - dOnly) / 86400000);
    const timeStr = formatTimeOfDay(d);
    if (diffDays === 0) return `오늘 · ${timeStr}`;
    if (diffDays === 1) return `어제 · ${timeStr}`;
    return `${diffDays}일 전 · ${timeStr}`;
  }

  /* ---------------------------------------------------------- */
  /* 1. 시작 화면                                                   */
  /* ---------------------------------------------------------- */
  const DIAL_CIRCUMFERENCE = 2 * Math.PI * 96;

  function updateDialUi() {
    el('durationValue').textContent = ui.durationMin;
    const frac = Math.min(ui.durationMin / 60, 1);
    el('dialProgress').setAttribute(
      'stroke-dasharray',
      `${(frac * DIAL_CIRCUMFERENCE).toFixed(1)} ${DIAL_CIRCUMFERENCE.toFixed(1)}`
    );
    document.querySelectorAll('.preset-chip').forEach(chip => {
      chip.classList.toggle('is-active', Number(chip.dataset.preset) === ui.durationMin);
    });
  }

  function updateBaitUi() {
    document.querySelectorAll('.bait-chip').forEach(chip => {
      chip.classList.toggle('is-active', chip.dataset.bait === ui.selectedBait);
    });
  }

  el('btnMinus').addEventListener('click', () => {
    ui.durationMin = Math.max(5, ui.durationMin - 5);
    updateDialUi();
  });
  el('btnPlus').addEventListener('click', () => {
    ui.durationMin = Math.min(90, ui.durationMin + 5);
    updateDialUi();
  });
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      ui.durationMin = Number(chip.dataset.preset);
      updateDialUi();
    });
  });
  document.querySelectorAll('.bait-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      ui.selectedBait = chip.dataset.bait;
      updateBaitUi();
    });
  });

  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-nav');
      if (target === 'collection') renderCollection();
      if (target === 'stats') renderStats();
      showScreen(target);
    });
  });

  el('btnCast').addEventListener('click', startFishing);

  function startFishing() {
    state.settings.lastDuration = ui.durationMin;
    state.settings.selectedBait = ui.selectedBait;
    saveState(state);

    const todaysCount = countSessionsToday(state.sessionLog) + 1;
    el('focusBadge').textContent = `${ui.durationMin}분 집중 · ${todaysCount}회차`;

    const totalMs = ui.durationMin * 60 * 1000;
    sessionCtx = {
      durationMin: ui.durationMin,
      bait: ui.selectedBait,
      totalMs,
      remainingMs: totalMs,
      biteAttempt: 0,
      biteReactionSec: null
    };

    el('focusProgressFill').style.width = '0%';
    setPauseIcon(false);
    showScreen('focus');
    Sound.play('ambient');

    focusCountdown = new Countdown(
      totalMs,
      remainingMs => updateFocusUi(remainingMs, totalMs),
      () => {
        sessionCtx.remainingMs = 0;
        focusCountdown = null;
        onFocusComplete();
      }
    );
    focusCountdown.start();
  }

  /* ---------------------------------------------------------- */
  /* 2. 집중 대기 화면                                              */
  /* ---------------------------------------------------------- */
  function updateFocusUi(remainingMs, totalMs) {
    if (sessionCtx) sessionCtx.remainingMs = remainingMs;
    const remainingSec = Math.ceil(remainingMs / 1000);
    const m = Math.floor(remainingSec / 60);
    const s = remainingSec % 60;
    el('focusTimer').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    const progressPct = Math.min(100, ((totalMs - remainingMs) / totalMs) * 100);
    el('focusProgressFill').style.width = progressPct + '%';
  }

  function setPauseIcon(isPaused) {
    const icon = el('pauseIcon');
    icon.innerHTML = isPaused
      ? '<path d="M6 4l14 8-14 8V4z"></path>'
      : '<rect x="5" y="4" width="5" height="16" rx="1.5"></rect><rect x="14" y="4" width="5" height="16" rx="1.5"></rect>';
  }

  el('btnPause').addEventListener('click', () => {
    if (!focusCountdown) return;
    const paused = el('btnPause').dataset.paused === 'true';
    if (paused) focusCountdown.resume();
    else focusCountdown.pause();
    el('btnPause').dataset.paused = (!paused).toString();
    setPauseIcon(!paused);
  });

  el('btnStop').addEventListener('click', abortFishing);

  function abortFishing() {
    if (focusCountdown) {
      focusCountdown.stop();
      focusCountdown = null;
    }
    const elapsedMs = sessionCtx ? sessionCtx.totalMs - sessionCtx.remainingMs : 0;
    const focusedMinutes = Math.max(0, Math.round(elapsedMs / 60000));
    if (focusedMinutes > 0) {
      logSession({ durationMin: focusedMinutes, fishId: null, biteReactionSec: null, missed: true, reason: '중단' });
    }
    sessionCtx = null;
    showToast('낚시를 중단했어요');
    showScreen('start');
  }

  /* ---------------------------------------------------------- */
  /* 3. 입질 / 챔질                                                 */
  /* ---------------------------------------------------------- */
  function onFocusComplete() {
    Sound.play('bite');
    sessionCtx.biteAttempt = 0;
    showScreen('bite');
    runBiteAttempt();
  }

  function runBiteAttempt() {
    sessionCtx.biteAttempt++;
    const attempt = sessionCtx.biteAttempt;
    const windowMs = BITE_WINDOWS_MS[attempt - 1];
    sessionCtx.biteAttemptStartedAt = Date.now();
    sessionCtx.biteAttemptRemainingMs = windowMs;

    el('biteHint').textContent = attempt === 1 ? '지금 탭해서 챔질하세요' : `다시 기회예요! (${attempt}/3)`;
    el('biteSub').textContent = '찌가 물속으로 빨려 들어가요';

    biteCountdown = new Countdown(
      windowMs,
      remainingMs => {
        if (sessionCtx) sessionCtx.biteAttemptRemainingMs = remainingMs;
      },
      () => {
        biteCountdown = null;
        onBiteMiss(attempt);
      }
    );
    biteCountdown.start();
  }

  el('btnChaemjil').addEventListener('click', () => {
    if (!biteCountdown || !sessionCtx) return;
    const elapsed = Date.now() - sessionCtx.biteAttemptStartedAt;
    biteCountdown.stop();
    biteCountdown = null;
    sessionCtx.biteReactionSec = Math.round((elapsed / 1000) * 100) / 100;
    Sound.play('ui');
    startReeling();
  });

  function onBiteMiss(attempt) {
    if (attempt < 3) {
      el('biteSub').textContent = '아깝다, 다시 집중하세요';
      setTimeout(() => {
        if (currentScreen === 'bite' && sessionCtx) runBiteAttempt();
      }, 600);
    } else {
      finalizeMissedFishing('찌가 다시 잠잠해졌어요');
    }
  }

  function finalizeMissedFishing(reason) {
    const focusedMinutes = sessionCtx ? sessionCtx.durationMin : 0;
    if (focusedMinutes > 0) {
      logSession({ durationMin: focusedMinutes, fishId: null, biteReactionSec: null, missed: true, reason });
    }
    sessionCtx = null;
    el('missedReason').textContent = reason;
    showScreen('missed');
  }

  el('btnMissedBack').addEventListener('click', () => showScreen('start'));

  /* ---------------------------------------------------------- */
  /* 4. 릴링                                                        */
  /* ---------------------------------------------------------- */
  function startReeling() {
    showScreen('reeling');
    el('reelingWarning').classList.remove('is-visible');
    reelState = { progress: 0, tension: 40, holding: false, locked: false, pulseTimer: null, decayTimer: null };
    updateReelingUi();

    reelState.decayTimer = setInterval(() => {
      if (!reelState) return;
      reelState.progress = Math.max(0, reelState.progress - 1.4);
      reelState.tension = Math.max(15, reelState.tension - 3.5);
      updateReelingUi();
    }, 300);

    const reelBtn = el('btnReel');

    const pulse = () => {
      if (!reelState || reelState.locked) return;
      reelState.progress = Math.min(100, reelState.progress + 6 + Math.random() * 4);
      reelState.tension = Math.min(100, reelState.tension + 8 + Math.random() * 6);
      if (reelState.tension >= 96) {
        reelState.locked = true;
        el('reelingWarning').classList.add('is-visible');
        setTimeout(() => {
          if (reelState) {
            reelState.locked = false;
            el('reelingWarning').classList.remove('is-visible');
          }
        }, 500);
      }
      updateReelingUi();
      if (reelState.progress >= 100) finishReeling();
    };

    const onDown = e => {
      e.preventDefault();
      if (!reelState || reelState.holding) return;
      reelState.holding = true;
      pulse();
      if (!reelState) return; // pulse()가 릴링을 완료시켜 reelState를 정리했을 수 있음
      reelState.pulseTimer = setInterval(pulse, 150);
    };
    const onUp = () => {
      if (!reelState) return;
      reelState.holding = false;
      clearInterval(reelState.pulseTimer);
    };

    reelBtn.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    reelState.cleanup = () => {
      reelBtn.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      clearInterval(reelState.decayTimer);
      clearInterval(reelState.pulseTimer);
    };
  }

  function updateReelingUi() {
    if (!reelState) return;
    el('reelingPercent').textContent = Math.round(reelState.progress) + '%';
    el('reelingBarFill').style.width = reelState.progress + '%';
    const top = 100 - reelState.tension;
    el('tensionMarker').style.top = top + '%';
    const angle = ((reelState.tension - 50) / 50) * 6;
    el('reelingFishSvg').style.transform = `rotate(${angle}deg)`;
  }

  function finishReeling() {
    if (reelState && reelState.cleanup) reelState.cleanup();
    reelState = null;
    Sound.play('catch');

    const { fish, sizeCm } = pickCatch(sessionCtx.durationMin);
    const caughtAt = new Date();

    logSession({
      durationMin: sessionCtx.durationMin,
      fishId: fish.id,
      sizeCm,
      biteReactionSec: sessionCtx.biteReactionSec,
      missed: false
    });
    recordCatch(fish.id, sizeCm, caughtAt);

    renderResultScreen(fish, sizeCm, sessionCtx.durationMin, sessionCtx.biteReactionSec, caughtAt);
    sessionCtx = null;
    showScreen('result');
  }

  /* ---------------------------------------------------------- */
  /* 5. 결과 화면                                                    */
  /* ---------------------------------------------------------- */
  function renderResultScreen(fish, sizeCm, durationMin, reactionSec, caughtAtDate) {
    el('rarityBadge').textContent = RARITY[fish.rarity].label + ' 등급';
    el('rarityBadge').dataset.rarity = fish.rarity;
    el('resultFishSvg').innerHTML = fishSvgLarge(fish.color);
    el('resultFishName').textContent = fish.name;
    el('resultFishMeta').textContent = `${sizeCm}cm · ${formatTimeOfDay(caughtAtDate)} 포획`;
    el('resultDuration').textContent = `${durationMin}분`;
    el('resultReaction').textContent = reactionSec != null ? `${reactionSec}초` : '-';
    el('resultTotalCatches').textContent = `${state.stats.totalCatches}마리`;

    const weekCatches = recentCatchesThisWeek(state.sessionLog).length;
    el('resultFootnote').textContent = `이번 주 ${weekCatches}번째 손맛이에요`;
  }

  el('btnGoCollection').addEventListener('click', () => {
    renderCollection();
    showScreen('collection');
  });
  el('btnFishAgain').addEventListener('click', () => showScreen('start'));

  /* ---------------------------------------------------------- */
  /* 6. 도감 화면                                                    */
  /* ---------------------------------------------------------- */
  document.querySelectorAll('#filterRow .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      collectionFilter = chip.dataset.filter;
      document.querySelectorAll('#filterRow .filter-chip').forEach(c => c.classList.toggle('is-active', c === chip));
      renderCollection();
    });
  });

  function renderCollection() {
    const totalCount = FISH.length;
    const caughtCount = FISH.filter(f => state.collection[f.id] && state.collection[f.id].caught).length;
    el('collectionCountText').textContent = `${caughtCount} / ${totalCount} 마리 수집`;
    const pct = totalCount ? Math.round((caughtCount / totalCount) * 100) : 0;
    el('collectionPctText').textContent = pct + '%';
    el('collectionProgressFill').style.width = pct + '%';

    const list = FISH.filter(f => collectionFilter === 'all' || f.rarity === collectionFilter);
    el('fishGrid').innerHTML = list
      .map(f => {
        const rec = state.collection[f.id];
        if (rec && rec.caught) {
          return `<div class="fish-card">
            <div class="fish-card-icon">${fishSvg(f.color, { dispW: 52, dispH: 29 })}</div>
            <div class="fish-card-name">${f.name}</div>
            <div class="fish-card-meta">${rec.bestSizeCm}cm</div>
            <div class="fish-card-rarity">${RARITY[f.rarity].label}</div>
          </div>`;
        }
        return `<div class="fish-card is-uncaught">
          <div class="fish-card-icon">${silhouetteSvg()}</div>
          <div class="fish-card-name">???</div>
          <div class="fish-card-meta">미포획</div>
        </div>`;
      })
      .join('');
  }

  /* ---------------------------------------------------------- */
  /* 7. 통계 화면                                                    */
  /* ---------------------------------------------------------- */
  function renderStats() {
    el('statTotalFocus').textContent = formatMinutesHM(state.stats.totalFocusMinutes);
    el('statTotalCatches').textContent = `${state.stats.totalCatches}마리`;
    el('statStreak').textContent = `${computeStreakDays(state.sessionLog)}일 연속 출조`;

    const weekly = computeWeeklyMinutes(state.sessionLog);
    const maxVal = Math.max(60, ...weekly);
    const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];
    const todayIdx = (new Date().getDay() + 6) % 7;
    el('weeklyBars').innerHTML = weekly
      .map((v, i) => {
        const heightPct = v > 0 ? Math.max(4, Math.round((v / maxVal) * 100)) : 2;
        return `<div class="weekly-bar-col ${i === todayIdx ? 'is-today' : ''}">
          <div class="weekly-bar" style="height:${heightPct}%"></div>
          <span class="weekly-bar-label">${dayLabels[i]}</span>
        </div>`;
      })
      .join('');

    const recent = recentCatchesThisWeek(state.sessionLog).slice(0, 5);
    const listEl = el('recentList');
    if (recent.length === 0) {
      listEl.innerHTML = '<div class="recent-empty">이번 주엔 아직 손맛을 못 봤어요</div>';
    } else {
      listEl.innerHTML = recent
        .map(entry => {
          const fish = fishById(entry.fishId);
          if (!fish) return '';
          return `<div class="recent-item">
            <div class="recent-item-icon">${fishSvg(fish.color, { dispW: 40, dispH: 23 })}</div>
            <div class="recent-item-info">
              <div class="recent-item-name">${fish.name}</div>
              <div class="recent-item-time">${relativeDayLabel(entry.dateISO)}</div>
            </div>
            <div class="recent-item-size">${entry.sizeCm}cm</div>
          </div>`;
        })
        .join('');
    }
  }

  /* ---------------------------------------------------------- */
  /* 3단계. 탭/창 이탈 감지                                          */
  /* ---------------------------------------------------------- */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (currentScreen === 'focus' && focusCountdown && !focusCountdown.isPaused) {
        focusCountdown.pause();
        autoPaused = true;
        hiddenAt = Date.now();
      } else if (currentScreen === 'bite' && biteCountdown && !biteCountdown.isPaused) {
        biteCountdown.pause();
        autoPaused = true;
        hiddenAt = Date.now();
      }
      return;
    }

    if (!autoPaused || !hiddenAt) return;
    const hiddenDuration = Date.now() - hiddenAt;
    autoPaused = false;
    hiddenAt = null;

    if (hiddenDuration <= VISIBILITY_GRACE_MS) {
      if (currentScreen === 'focus' && focusCountdown) focusCountdown.resume();
      if (currentScreen === 'bite' && biteCountdown) biteCountdown.resume();
      return;
    }

    if (currentScreen === 'focus') {
      if (focusCountdown) {
        focusCountdown.stop();
        focusCountdown = null;
      }
      const elapsedMs = sessionCtx ? sessionCtx.totalMs - sessionCtx.remainingMs : 0;
      const focusedMinutes = Math.max(0, Math.round(elapsedMs / 60000));
      if (focusedMinutes > 0) {
        logSession({ durationMin: focusedMinutes, fishId: null, biteReactionSec: null, missed: true, reason: '자리비움' });
      }
      sessionCtx = null;
      el('missedReason').textContent = '자리를 비운 사이 찌를 놓쳤어요';
      showScreen('missed');
    } else if (currentScreen === 'bite') {
      if (biteCountdown) {
        biteCountdown.stop();
        biteCountdown = null;
      }
      finalizeMissedFishing('자리를 비운 사이 찌를 놓쳤어요');
    }
  });

  /* ---------------------------------------------------------- */
  /* 초기화                                                          */
  /* ---------------------------------------------------------- */
  updateDialUi();
  updateBaitUi();
  showScreen('start');
})();
