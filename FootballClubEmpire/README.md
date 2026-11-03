# Football Club Empire

A mobile club-building game: take a grassroots football club with a roped-off pitch and a tea hatch, and build it
into a world-class football organisation. Unity 6 (C#), for Android and iOS.

## Status

The game rules are being built first, engine-free and fully tested. The Unity presentation layer (camera, world,
UI) has not been started yet.

| System | State |
|---|---|
| Content pipeline (buildings, stats, economy as validated JSON) | Done |
| Stadium as the progression gate: 25 levels, 5 chapters, level caps, instance counts, land, rewards | Done |
| Construction: placement, timed and instant upgrades, crews, finish-now, cancel | Done |
| Production: cycle-based income, storage, collection, offline earnings | Done |
| Grounded economy: £999bn ceiling, finance ledger, money formatting | Done |
| Saving and loading: versioned, atomic, crash-safe, self-repairing | Done |
| Economy and progression balancing harness | Done |
| Chapter 1 (Grassroots, Stadium 1-5) content: 10 buildings | First pass, tuned |
| Unity layer: boot, isometric world, building visuals, HUD, panels | Not started |
| Expenses (wages, running costs), league pyramid, squad, mini-games, daily objectives | Not started |

## Layout

```
FootballClubEmpire/                     the Unity project
  Assets/_Project/Scripts/Core/         every game rule; no UnityEngine dependency (FCE.Core.asmdef)
  Assets/_Project/Resources/Content/    all numbers: buildings, stats, economy, as JSON
  Assets/_Project/Tests/EditMode/       the test suite, run by Unity's Test Runner and by dotnet alike
sim/                                    headless .NET build of Core, tests and the balancing tool
```

Core compiles at C# 9 under both Unity and `dotnet`, so anything that passes here builds in Unity.

## Running it without Unity

Needs the [.NET 8 SDK](https://dotnet.microsoft.com/download).

```bash
dotnet test sim/FCE.Core.Tests
```

```bash
dotnet run --project sim/FCE.Sim -- all
```

The balancing tool has four reports: `levels` (every building level's cost, build time, income and payback),
`stadium` (what each Stadium level costs and opens), `experience` (simulated players from install, with no
purchases), and `all`. Add `--profile active|regular|collector` or `--days N` to `experience`.

**No content number is final until this tool has measured it.** The targets it checks live in
`sim/FCE.Sim/Thresholds.cs`.

## Opening it in Unity

Install Unity 6 LTS (6000.0 or later) with Android and iOS build support, then add the `FootballClubEmpire`
folder in Unity Hub. On first open Unity resolves the packages in `Packages/manifest.json` (URP, Input System,
Newtonsoft JSON, Test Framework). Run the tests from Window > General > Test Runner > EditMode. There is no scene to
play yet.

## Design rules the content must follow

**The Stadium is the gate.** Its level is the club's tier. Each Stadium level should open a new chapter of the
club: new buildings, extra copies of existing ones, higher level caps, more land. It should never just make
numbers bigger. Stadium upgrades are the slow, expensive milestones. Everything they open is affordable,
starting from level 1.

**Every building instance progresses on its own.** A second Drinks Stand unlocked at Stadium 5 starts at level 1
with level-1 prices, whatever the first one has reached.

**The economy is grounded.** Pounds only, with a hard ceiling of £999bn on any balance or price. A Drinks Stand
makes £5 every 5 seconds. Fast early progress comes from cheap, instant upgrades and frequent unlocks, never from
inflated income. Every upgrade shows its cost, build time, income change and payback period.

**Producer upgrades follow a payback ladder.** Each upgrade pays for itself in about a minute of extra income at
level 2, rising about 1.27x per level to 12-24 hours of production by level 30. Income rises at most about 20% in
one level.

**The first session is fast.** Levels 1-3 or 1-4 are instant. Early upgrades take seconds and early Stadium
levels take minutes. In the harness, an active player reaches Stadium 4 within the first two hours with about 120
upgrades.

## What the harness currently says

- **The first two hours:**
  - Stadium 2 at about 9 minutes, Stadium 3 at about 42 minutes, Stadium 4 at about 1h 50m
  - about one upgrade a minute
  - nothing-to-do time is 0%
- **Days 1-3 against days 4-7:** about 23 upgrades per hour played early, about 6 later. The early game is clearly
  faster.
- **Stadium 5:** the first major milestone (£450k, 3 hours) arrives on day 3-4 for an active player and day 6 for
  one who mostly collects offline income.
- **The ceiling holds:** the highest balance in Grassroots is about £870k.
- **Gaps:**
  - Stadium levels 7, 10, 12 and 15-25 open no new buildings yet. That content is still to be written.
  - From day 4 onwards, building alone fills only a few minutes of a session. Mini-games, the league, the squad
    and more buildings per chapter are what will fill the rest. Expenses (wages and running costs) are not in yet;
    when they arrive the economy will be retuned around them.
