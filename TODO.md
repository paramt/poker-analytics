# TODO

## Bugs
- [x] Villain cards sometimes don't show on the table / action log (show actions not always rendering)
- [x] Equity calculation causing heavy UI load
    - either make this a background worker or get rid of equity calculation altogether
    - also, are we recalulating every time we go back and forth between the flop/turn/river? run it once at the beginning and cache it
    - are we running this calculation on mobile? hopefully not, since we dont display it

## Features
- [ ] Move through hands with right/left arrow keys, use up/down for moving through the action
- [ ] Improve LLM classifier (better prompts / tagging accuracy)
    - Give Claude more context: hero's made hand on each street, and opponents' made hands on each street
- [ ] Equity calculation for each player — preflop equity using lookup tables
- [ ] Villain profiles — view per-opponent stats (VPIP, PFR, tendencies) built from hand history
- [ ] Persist stats across sessions — aggregate stats over multiple uploaded CSVs
