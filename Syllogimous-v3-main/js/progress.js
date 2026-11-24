const TYPE_TO_OVERRIDES = {
    "distinction"  : [ "overrideDistinctionPremises", "overrideDistinctionTime" ],
    "linear"       : [ "overrideLinearPremises"     , "overrideLinearTime" ],
    "syllogism"    : [ "overrideSyllogismPremises"  , "overrideSyllogismTime" ],
    "binary"       : [ "overrideBinaryPremises"     , "overrideBinaryTime" ],
    "space-two-d"  : [ "overrideDirectionPremises"  , "overrideDirectionTime" ],
    "space-three-d": [ "overrideDirection3DPremises", "overrideDirection3DTime" ],
    "space-time"   : [ "overrideDirection4DPremises", "overrideDirection4DTime" ],
    "anchor-space" : [ "overrideAnchorSpacePremises", "overrideAnchorSpaceTime" ],
    "influence" : [ "overrideInfluencePremises", "overrideInfluenceTime" ],
    "requirement" : [ "overrideRequirementPremises", "overrideRequirementTime" ],
    "contexts" : [ "overrideContextsPremises", "overrideContextsTime" ],
    "balance" : [ "overrideBalancePremises", "overrideBalanceTime" ],
    "ring" : [ "overrideRingPremises", "overrideRingTime" ],
    "hierarchy" : [ "overrideHierarchyPremises", "overrideHierarchyTime" ],
    "difference" : [ "overrideDifferencePremises", "overrideDifferenceTime" ],
    "intervals" : [ "overrideIntervalsPremises", "overrideIntervalsTime" ],
    "perspective" : [ "overridePerspectivePremises", "overridePerspectiveTime" ],
    "fmt-name" : [ "overrideFmtNamePremises", "overrideFmtNameTime" ],
    "fmt-missing" : [ "overrideFmtMissingPremises", "overrideFmtMissingTime" ],
    "fmt-repair" : [ "overrideFmtRepairPremises", "overrideFmtRepairTime" ],
    "mapping"      : [ "overrideMappingPremises"    , "overrideMappingTime" ],
};

const progressTracker = document.getElementById("progress-tracker");
const dailyProgressTracker = document.getElementById("daily-progress-container");
const weeklyProgressTracker = document.getElementById("weekly-progress-container");

function findAutoProgressionTrailing() {
    return Math.max(5, Math.min(savedata.autoProgressionTrailing || 20, 50));
}

// ---------------------------------------------------------------- the progression
// Each type has its own level (premises and time) at each arity, so every type sits at its own edge
// instead of the easy ones carrying the hard ones on a pooled score.
//
// Going UP still takes a perfect run: N right in a row (20 by default) across the mixed stream,
// every item at its own type's level. One miss anywhere breaks it. When a run completes, every type
// that took part in it and has been right at least RUN_EVIDENCE times in a row at its current level
// goes up a step; the others keep their count and go up on a later run.
// Going DOWN is charged to the type that missed: DEMOTE_MISSES misses among its last DEMOTE_WINDOW
// items at its level step that type down, and only that type.
//
// A step up is load first: if the time limit is within the budget (seconds per premise), add a
// premise and that premise's time; if not, take time off toward the budget. A step down is time
// first: add time while it stays under 1.5x the budget per premise, then drop a premise.
const RUN_EVIDENCE = 3, DEMOTE_MISSES = 2, DEMOTE_WINDOW = 8;

function levelArity() {
    const a = +savedata.arity || 2;
    return a >= 3 ? Math.min(5, a) : 2;
}
function levelKey(type) { return type + '@' + levelArity(); }

// The overrides always hold the levels of the CURRENT arity (the generators read them). When the
// arity dial moves, they are stored under the old arity and the new arity's levels are put back.
// An arity met for the first time starts from the levels you had.
function syncArityLevels() {
    const a = levelArity(), from = savedata.levelsArity;
    if (from === a) return;
    const levels = { ...(savedata.levels || {}) };
    for (const [type, [pKey, tKey]] of Object.entries(TYPE_TO_OVERRIDES)) {
        if (from != null && (savedata[pKey] || savedata[tKey])) levels[type + '@' + from] = { P: savedata[pKey], T: savedata[tKey] };
        const L = levels[type + '@' + a];
        if (L) { savedata[pKey] = L.P; savedata[tKey] = L.T; }
    }
    savedata.levels = levels;
    savedata.levelsArity = a;
}

function runState() {
    const st = appState.run || (appState.run = { streak: 0, inRun: [], own: {}, recent: {} });
    st.own = st.own || {}; st.recent = st.recent || {}; st.inRun = st.inRun || [];
    return st;
}

function stepLevel(type, dir) {
    const [pKey, tKey] = TYPE_TO_OVERRIDES[type];
    let P = savedata[pKey] || savedata.premises, T = savedata[tKey] || +savedata.timer;
    const b = Math.max(1, +savedata.autoProgressionGoal || 10);
    const drop = savedata.autoProgressionTimeDrop || 5, bump = savedata.autoProgressionTimeBump || 5;
    if (dir > 0) {
        if (T <= b * P) { P += 1; T += b; }
        else T = Math.max(Math.round(b * P), T - drop);
    } else {
        if (T + bump <= 1.5 * b * P || P <= 2) T += bump;
        else P -= 1;
    }
    savedata[pKey] = Math.max(2, Math.min(30, P));
    savedata[tKey] = Math.max(5, Math.min(600, Math.round(T)));
    savedata.levels = { ...(savedata.levels || {}), [levelKey(type)]: { P: savedata[pKey], T: savedata[tKey] } };
    savedata.levelsArity = levelArity();
}

class ProgressStore {
    calculateKey(question) {
        return this.calculateKeyFromCustomType(question, question.type);
    }

    calculateKeyFromCustomType(question, type) {
        let plen = question.premises;
        let countdown = question.countdown;
        let key = `${type}-${plen}-${countdown}`;
        if (question.modifiers && question.modifiers.length !== 0) {
            key += `-${question.modifiers.join('-')}`
        }
        return key;
    }

    convertForDatabase(question) {
        const q = {...question};
        q.timestamp = q.answeredAt;
        // interrogate: the clock stopped when the premises were hidden, so the time is the study time
        q.timeElapsed = (q.hiddenAt || q.answeredAt) - q.startedAt;
        delete q.hiddenAt;
        q.premises = q.plen || q.premises.length;
        q.countdown = q.tlen || q.countdown || savedata.timer;
        q.key = this.calculateKey(q);
        delete q.plen;
        delete q.startedAt;
        delete q.answeredAt;
        delete q.wordCoordMap;
        delete q.bucket;
        delete q.buckets;
        delete q.operations;
        delete q.conclusion;
        delete q.isValid;
        delete q.answerUser;
        delete q.category;
        delete q.subresults;
        delete q.tlen;
        return q;
    }

    async storeCompletedQuestion(question) {
        const q = this.convertForDatabase(question);
        if (savedata.autoProgression) this.levelChange(q);
        await storeProgressData(q);
    }

    levelChange(q) {
        syncArityLevels();
        const st = runState();
        const type = TYPE_TO_OVERRIDES[q.type] ? q.type : null;
        const key = type && levelKey(type);
        const right = q.correctness === 'right';
        let changed = false;
        if (key) st.recent[key] = [...(st.recent[key] || []), right].slice(-DEMOTE_WINDOW);
        if (right) {
            st.streak++;
            if (key) {
                st.own[key] = (st.own[key] || 0) + 1;
                if (!st.inRun.includes(type)) st.inRun.push(type);
            }
            if (st.streak >= findAutoProgressionTrailing()) {
                for (const t of st.inRun) {
                    const k = levelKey(t);
                    if ((st.own[k] || 0) >= RUN_EVIDENCE) {
                        stepLevel(t, 1);
                        st.own[k] = 0; st.recent[k] = [];
                        changed = true;
                    }
                }
                st.streak = 0; st.inRun = [];
            }
        } else {
            st.streak = 0; st.inRun = [];
            if (key) {
                st.own[key] = 0;
                if (st.recent[key].filter(r => !r).length >= DEMOTE_MISSES) {
                    stepLevel(type, -1);
                    st.recent[key] = [];
                    changed = true;
                }
            }
        }
        if (changed) {
            q.didTriggerProgress = true;
            populateSettings();
        }
    }

    async renderCurrentProgress(question) {
        await this.renderAutoProgressionTrailing(question);
        await this.renderDailyProgress();
        await this.renderWeeklyProgress();
    }

    async renderAutoProgressionTrailing(question) {
        progressTracker.innerHTML = '';
        if (!savedata.autoProgression) {
            progressTracker.classList.remove('visible');
            return;
        }
        progressTracker.classList.add('visible');
        // the current run: filled for each right answer in a row, empty for what is left
        const n = findAutoProgressionTrailing(), streak = runState().streak;
        const width = 100 / n;
        for (let i = 0; i < n; i++) {
            const span = document.createElement('span');
            span.classList.add('trailing-dot', i < streak ? 'success' : 'empty');
            span.style.width = `${width.toFixed(2)}%`;
            progressTracker.appendChild(span);
        }
    }

    async renderDailyProgress() {
        if (!savedata.dailyProgressGoal) {
            dailyProgressTracker.classList.remove('visible');
            return;
        }
        dailyProgressTracker.classList.add('visible');
        const progressToday = await getTodayRRTProgress();
        const minutesSpent = progressToday.map(q => q.timeElapsed).reduce((a, b) => a + b, 0) / 1000 / 60;
        this.fillProgressTracker(dailyProgressTracker, minutesSpent, savedata.dailyProgressGoal);
    }

    async renderWeeklyProgress() {
        if (!savedata.weeklyProgressGoal) {
            weeklyProgressTracker.classList.remove('visible');
            return;
        }
        weeklyProgressTracker.classList.add('visible');
        const progressWeek = await getWeekRRTProgress();
        const minutesSpent = progressWeek.map(q => q.timeElapsed).reduce((a, b) => a + b, 0) / 1000 / 60;
        this.fillProgressTracker(weeklyProgressTracker, minutesSpent, savedata.weeklyProgressGoal);
    }

    fillProgressTracker(tracker, minutesSpent, goal) {
        const percentComplete = Math.max(0, Math.min(100 * minutesSpent / goal, 100));
        tracker.querySelector('.progress-fill').style.height = `${percentComplete}%`;
        tracker.querySelector('.progress-value').innerText = `${Math.floor(minutesSpent)} / ${goal}`;
        if (percentComplete >= 100) {
            tracker.querySelector('.progress-fill').classList.remove('halfway');
            tracker.querySelector('.progress-fill').classList.add('complete');
        } else if (percentComplete >= 50) {
            tracker.querySelector('.progress-fill').classList.add('halfway');
            tracker.querySelector('.progress-fill').classList.remove('complete');
        } else {
            tracker.querySelector('.progress-fill').classList.remove('halfway');
            tracker.querySelector('.progress-fill').classList.remove('complete');
        }
    }
}

const PROGRESS_STORE = new ProgressStore();
