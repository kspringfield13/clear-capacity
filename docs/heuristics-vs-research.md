# Are ClearCapacity's heuristics actually grounded? — a research memo

*The capacity model is full of hand-set constants — the 40% reliable-capacity ceiling,
the 0.72 reactive penalty, the context-switch thresholds, the 40-hour baseline. This
memo checks those constants against the published research. Verdict up front: the
**directions** are mostly well-grounded; the **exact numbers** are hand-tuned, and two
of them are worth a second look. Backlog items distilled from the "What I'd change"
section live in `STATUS.md` under "Capacity Model Calibration."*

---

## TL;DR scorecard

| Heuristic in the code | Real-world basis | Verdict |
|---|---|---|
| `reliable_new_work_capacity_pct` capped at **0–40%** | Queueing theory (M/M/1), DeMarco's *Slack* | ✅ **Well-grounded in spirit.** Leaving ~40% headroom keeps you left of the ~80% "knee" where wait-time explodes. |
| **0.72** reactive-work penalty | Mark et al. (CHI 2008): interruptions add stress/effort, not just time | ✅ Right direction (reactive work delivers less sustainable capacity). Magnitude is arbitrary. |
| `context_switch_score` nudge at **0.6** / narrative at **0.45** | Fragmentation research; attention spans ~47s (Mark 2023) | ✅ Penalizing fragmentation is correct; if anything the app **under-weights** it. Thresholds arbitrary. |
| `HEAVY_DAY_MEETING_HOURS = 4` | Meeting-load studies | ✅ Reasonable (half a workday). |
| `denseMeetings >= 18%` of week (~7.2h) | Collaboration now ~85% of the work week | ⚠️ Possibly **too low** — will fire almost always. |
| **40-hour** baseline denominator | Pencavel/Stanford: output falls after 50h, ~zero gain past 55h | ✅ Fine as an accounting denominator; deep-work reality is much smaller. |

---

## 1. The 40% reliable-capacity ceiling is the most defensible number in the app

The code caps `reliable_new_work_capacity_pct` at 40% and subtracts penalties from a
100% baseline. "40%" looks like a vibe. It mostly isn't.

**Queueing theory, exactly.** For an M/M/1 queue, the mean number in system is
`L = ρ/(1−ρ)` and residence time scales as `1/(1−ρ)`, where ρ is utilization. Worked out:

| Utilization ρ | Residence-time blow-up `1/(1−ρ)` |
|---|---|
| 50% | 2× |
| 60% | 2.5× |
| 75% | 4× |
| 80% | 5× |
| 90% | 10× |
| 95% | 20× |

The "knee" sits around **80%** — past it, latency goes vertical. A knowledge worker
is a single server with stochastic arrivals (the reactive work), so the same curve
applies. If you let *existing* commitments run ~60% and only promise new work up to
~40% more, total target utilization lands near that 80% knee — exactly where you want
to be. **Capping new commitments well below "all remaining hours" is not conservatism;
it's the only stable operating point.** DeMarco's *Slack* makes the same argument
qualitatively: "organizations get more efficient only by sacrificing their ability to
change," and 100%-busy knowledge workers minimize *system* throughput.

*Caveat:* the specific 40% is still hand-set. The principled version would target
**total** utilization ≈ 80% and back out the new-work allowance from current load,
rather than a fixed 0–40% clamp. But as heuristics go, this one earns its keep.

## 2. The 0.72 reactive penalty discounts the right thing

Mark, Gudith & Klocke (CHI 2008), *The Cost of Interrupted Work: More Speed and
Stress*, found the **counterintuitive** result: interrupted tasks were completed
slightly *faster* (~no quality loss) — but at the cost of **higher stress,
frustration, time pressure, and effort**. The popular "23 min 15 s to get back to
focus" figure comes from Mark's broader research and is real but oversimplified; the
deeper point is that the cost of reactive work shows up as **unsustainable effort, not
slower clocks.**

That's a subtle vindication of the design: it penalizes reactive work's contribution
to **capacity** (sustainable throughput), not its raw speed. Discounting reactive
hours to ~72% of face value is the right *shape*. The exact 0.72 is arbitrary — but
erring toward a steeper discount would be defensible given the stress externality the
study documents.

## 3. Fragmentation is probably under-weighted, not over-weighted

`context_switch_score` triggers a proactive nudge at 0.6 and colors the narrative at
0.45. Reasonable. But the macro numbers suggest fragmentation is the *dominant* tax on
knowledge work, not a side risk:

- Collaborative activity (email, chat, calls, meetings) is **~85% of the work week**;
  the average knowledge worker has **<6 hours/week** — barely an hour a day — for
  uninterrupted focus.
- Mark's 2023 follow-up clocks average sustained attention on a screen at **~47
  seconds**.

So a fragmentation/WIP penalty that maxes out modestly may be *too gentle*. The
`wip_load_score = unique_projects / 10` in particular is linear and forgiving;
context-switching cost is closer to combinatorial.

## 4. Meeting thresholds: the daily one is good, the weekly one may cry wolf

`HEAVY_DAY_MEETING_HOURS = 4` (warn the day before) is a sensible "half your day is
gone" line. But `denseMeetings >= 18%` of a 40h week (~7.2h) as the narrative
threshold looks **low** relative to how meeting-saturated modern weeks are — it'll fire
for almost everyone, which dilutes the signal. Consider scaling it to the user's own
rolling baseline (which the app already computes for the capacity chips) instead of an
absolute cut.

## 5. The 40-hour baseline is fine — and the 40% cap accidentally lands near the deep-work sweet spot

Pencavel (Stanford) is the canonical citation: output per hour falls after ~50h/week
and **total** output barely rises past 55h — 70h produces ~nothing more than 55h.
Newer knowledge-work estimates put the *deep-work* sweet spot at ~25–35h/week. So 40h
is a fair **denominator** for accounting, even though real focus capacity inside it is
far smaller.

Worth noting: 40% of a 40h week ≈ **16h** of "reliable new work." Stack that on top of
existing recurring + reactive commitments and you land inside the 25–35h
sustainable-focus band. The app's most important output number is, by luck or good
instinct, in the right ballpark.

---

## What I'd change (smallest → boldest)

1. **Re-baseline the 18% meeting threshold** to the user's rolling median (the
   machinery already exists for the capacity chips). Cheap, removes a cry-wolf signal.
2. **Document the 0.72 / 0.55 / 40% constants** with these citations so they stop
   reading as magic numbers.
3. **Make the WIP penalty super-linear** — context-switching cost grows faster than
   the count of concurrent projects.
4. **Bolder:** replace the fixed 0–40% clamp with a *target-utilization* model — aim
   total committed load at the ~80% queueing knee and derive the new-work allowance
   from current load. More principled, more explainable, same spirit.

---

## Sources

- Mark, Gudith & Klocke (2008), *The Cost of Interrupted Work: More Speed and Stress*, CHI '08 — https://dl.acm.org/doi/10.1145/1357054.1357072
- John D. Cook, *Server utilization: Joel on queueing* (M/M/1 `ρ/(1−ρ)`, stretch factors) — https://www.johndcook.com/blog/2009/01/30/server-utilization-joel-on-queuing/
- Dan Slimmon, *The most important thing to understand about queues* — https://blog.danslimmon.com/2016/08/26/the-most-important-thing-to-understand-about-queues/
- Tom DeMarco, *Slack: Getting Past Burnout, Busywork, and the Myth of Total Efficiency* — https://www.goodreads.com/book/show/123715.Slack
- John Pencavel (Stanford), *The Productivity of Working Hours* — https://economics.stanford.edu/publications/diminishing-returns-work-consequence-long-working-hours
- Microsoft/industry focus-time stats (collaboration ~85% of week, <6h focus) — https://speakwiseapp.com/blog/knowledge-worker-productivity-statistics
- On the "23 minutes" figure's nuance — https://blog.oberien.de/2023/11/05/23-minutes-15-seconds.html

*Compiled 2026-06 from a research pass over the model's hand-set constants. Numbers
above are heuristics, not derived parameters — treat them as starting points to tune.*
