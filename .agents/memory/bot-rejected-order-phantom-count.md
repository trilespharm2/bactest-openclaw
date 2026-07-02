---
name: Bot rejected-order phantom position count
description: Why a bot position_count condition can read >0 with 0 live positions, and the rule that fixes it.
---

# Rejected orders can phantom-count against the position cap

**Symptom:** A bot `position_count` condition (e.g. tag "IMX", `< 1`) evaluates
FALSE with 0 live positions, blocking all new trades.

**Root cause:** Tradier can ACCEPT a multileg order (returns an order id, so it
gets registered in the tag store as `seen:false`) and then REJECT it
asynchronously. The trade-count store keeps a placed-but-never-seen order counted
for a 6h grace window (`_TAG_NEVERSEEN_MAX_AGE`) to cover fill latency. A rejected
order sits in that same never-seen state; it is only dropped if the broker's
`/orders` status map STILL explicitly reports it rejected/canceled. Once the
rejected order scrolls out of Tradier's returned order list (or the condition
never re-evaluates while it is still listed), it keeps counting → count=1 with 0
positions.

**Rule that fixes it:** A freshly-placed order ALWAYS appears in Tradier `/orders`
immediately (open/pending/filled/rejected). So if a tracked, never-seen
(`seen:false`), not-live order is ABSENT from a *populated* broker order list, it
has reached a terminal state — drop it, don't count it.

**Why:** absence from a real order list is not fill latency; it is a
rejected/canceled order that left the working set.

**How to apply / guards (all required):**
- Only when `known_ids = {id for id in status_by_id if id}` is non-empty — never
  drop on an empty/failed `/orders` fetch (would mass-drop legit orders).
- Only under `not live_hit` — a live position always wins.
- Only when `not bucket.get('seen')` — a previously-seen fill that briefly
  vanishes from both feeds must be retained (treated as closed, not dropped-early).
- Safe vs eval-before-place ordering: the placing tick registers the order AFTER
  eval_condition runs, so a brand-new order is never subject to the absence rule
  until the next tick when it appears in `/orders`.
