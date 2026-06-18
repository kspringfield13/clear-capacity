# ClearCapacity Product Demo

ClearCapacity includes an isolated, date-relative demo mode with realistic workload evidence. It does not read, overwrite, or persist the user's normal local app data, and it does not require an OpenAI API key.

[Watch the 16-second product demo](assets/clear-capacity-demo.mp4?raw=1).

## Launch

```bash
npm install
npm run demo
```

Or, while `npm run dev` is running, open:

```text
http://127.0.0.1:5173/?demo=1&screen=weekly
```

The blue **Demo** badge confirms that simulated data is active.

## Three-Minute Walkthrough

### 1. Start with the outcome

Open **Week → Capacity**.

> ClearCapacity turns lightweight local signals into an explainable capacity model. This week is 92% allocated, but the more useful planning number is 38% deterministic capacity and a 24% likely forecast after risks and assumptions are considered.

Call out:

- planned, reactive, recurring, and blocked allocation
- forecast scenarios rather than a single false-precision number
- explicit constraints, assumptions, and recommended actions

### 2. Show user control

Open **Today → Review**.

> The model never silently turns inference into truth. Two lower-confidence blocks need a quick review, and every correction becomes part of the evidence trail.

Show:

- confidence and source evidence
- confirm, relabel, and exclude controls
- Review Copilot suggestions that require user approval
- correction history

### 3. Show the underlying evidence

Open **History → Activity**.

> Calendar events and foreground-app sessions become reviewable work blocks. ClearCapacity records app, window title, and time locally, not keystrokes or document contents.

Open **History → Audit**.

> Every import, classification, correction, forecast, narrative, visual insight, and privacy action is inspectable.

Expand one audit event to show its structured details.

### 4. Show the communication layer

Open **Week → Summary**.

> The same reviewed evidence becomes an analyst reflection and an editable manager-ready summary. The language explains constraints and tradeoffs without presenting a productivity score.

Show the local editing and copy controls.

### 5. Finish with the background experience

Use the top-right compact-view control, or open:

```text
http://127.0.0.1:5173/?demo=1&mode=compact
```

> Most of the time, ClearCapacity stays out of the way. The compact widget shows current activity, observed time, review status, capacity, and an immediate privacy pause.

## Direct Demo Views

| View | URL |
| --- | --- |
| Compact widget | `/?demo=1&mode=compact` |
| Daily review | `/?demo=1&screen=daily` |
| Activity ledger | `/?demo=1&screen=ledger` |
| Weekly capacity | `/?demo=1&screen=weekly` |
| Weekly narrative | `/?demo=1&screen=narrative` |
| Audit history | `/?demo=1&screen=audit` |
| Privacy settings | `/?demo=1&screen=setup` |

## Demo Notes

- Demo dates automatically follow the current business week.
- Demo interactions are temporary and reset on refresh.
- Normal persisted data remains untouched.
- Native capture and OpenAI calls are disabled in demo mode.
- The data is intentionally realistic but fully simulated.
