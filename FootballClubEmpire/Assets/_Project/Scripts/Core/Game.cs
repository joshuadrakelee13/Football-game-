using System;
using System.Collections.Generic;
using FCE.Core.Content;
using FCE.Core.State;
using FCE.Core.Systems;
using FCE.Core.Time;

namespace FCE.Core
{
    /// <summary>
    /// The one entry point to the game rules. The UI, the balance harness and the tests all drive the game through
    /// these methods and learn what happened from <see cref="EventRaised"/>.
    ///
    /// Every action first brings the simulation up to the clock's current time, so a player tapping "upgrade" on a
    /// building whose previous upgrade finished a second ago sees that completion applied first.
    /// </summary>
    public sealed class Game
    {
        readonly GameContext _ctx;
        readonly IClock _clock;

        public Game(ContentDb content, GameState state, IClock clock)
        {
            Content = content ?? throw new ArgumentNullException(nameof(content));
            State = state ?? throw new ArgumentNullException(nameof(state));
            _clock = clock ?? throw new ArgumentNullException(nameof(clock));
            _ctx = new GameContext(content, state);
        }

        /// <summary>A brand new club, as defined by economy.json.</summary>
        public static GameState NewGame(ContentDb content, long now)
        {
            var state = new GameState { Now = now, CreatedAt = now };
            foreach (var kv in content.Economy.StartingWallet) state.Wallet.Balances[kv.Key] = kv.Value;
            foreach (var start in content.Economy.StartingBuildings)
            {
                var def = content.GetBuilding(start.Building);
                state.Buildings.Add(new BuildingState
                {
                    Id = state.NextBuildingId++,
                    Def = def.Id,
                    Level = start.Level,
                    X = start.X,
                    Y = start.Y,
                    Producer = def.Producer != null ? new ProducerState { LastTick = now } : null,
                });
            }
            return state;
        }

        public ContentDb Content { get; }
        public GameState State { get; }

        /// <summary>Raised after each operation, in the order things happened.</summary>
        public event Action<GameEvent> EventRaised;

        // ---- Time -------------------------------------------------------------------------------------------------

        /// <summary>Brings the game up to the current time. Call every frame or tick, and on resume from background.</summary>
        public AdvanceReport Update()
        {
            var report = Timeline.AdvanceTo(_ctx, _clock.UtcNowSeconds);
            Flush();
            return report;
        }

        // ---- Actions ----------------------------------------------------------------------------------------------

        public CommandResult PlaceBuilding(string buildingDef, int x, int y) =>
            Run(() => ConstructionSystem.Place(_ctx, buildingDef, x, y));

        public CommandResult StartUpgrade(int buildingId) =>
            Run(() => ConstructionSystem.StartUpgrade(_ctx, buildingId));

        /// <summary>Finishes a project now, paying Club Credits (free in the last few seconds).</summary>
        public CommandResult FinishNow(int buildingId) =>
            Run(() => ConstructionSystem.FinishNow(_ctx, buildingId));

        public CommandResult CancelConstruction(int buildingId) =>
            Run(() => ConstructionSystem.Cancel(_ctx, buildingId));

        CommandResult Run(Func<CommandResult> action)
        {
            Timeline.AdvanceTo(_ctx, _clock.UtcNowSeconds);
            var result = action();
            Flush();
            return result;
        }

        void Flush()
        {
            if (_ctx.Pending.Count == 0) return;
            var events = _ctx.Pending.ToArray();
            _ctx.Pending.Clear();
            var handler = EventRaised;
            if (handler == null) return;
            foreach (var e in events) handler(e);
        }

        // ---- Queries ----------------------------------------------------------------------------------------------
        // Queries read the state as of the last update. Call Update() first if you need it to the second.

        public long Now => State.Now;
        public int ClubhouseLevel => _ctx.ClubhouseLevel;
        public ClubStats Stats => _ctx.Stats;
        public int TotalCrews => _ctx.TotalCrews;
        public int FreeCrews => _ctx.FreeCrews;
        public long Balance(string currency) => State.Wallet.Get(currency);
        public IReadOnlyList<BuildingState> Buildings => State.Buildings;
        public BuildingState FindBuilding(int id) => _ctx.FindBuilding(id);

        /// <summary>Why a building could not be placed here right now, or null if it can.</summary>
        public string CheckPlacement(string buildingDef, int x, int y) => ConstructionSystem.ValidatePlace(_ctx, buildingDef, x, y);

        /// <summary>How many more of this building the club may place at its current Clubhouse level.</summary>
        public int RemainingAllowance(string buildingDef) =>
            Content.AllowedCount(buildingDef, ClubhouseLevel) - _ctx.CountOwned(buildingDef);

        public long FinishNowCost(int buildingId)
        {
            var b = _ctx.FindBuilding(buildingId);
            return b?.Construction == null ? 0 : ConstructionSystem.FinishNowCost(_ctx, b);
        }

        /// <summary>Everything the upgrade panel needs to show for a building's next level.</summary>
        public UpgradeQuote QuoteUpgrade(int buildingId)
        {
            var b = _ctx.FindBuilding(buildingId);
            if (b == null) return null;
            var def = Content.GetBuilding(b.Def);
            var quote = new UpgradeQuote { BuildingId = b.Id, Def = def, CurrentLevel = b.Level, IsMaxLevel = b.Level >= def.MaxLevel };
            if (quote.IsMaxLevel) { quote.BlockedBy = Errors.MaxLevel; return quote; }

            var next = Content.GetLevel(def.Id, b.Level + 1);
            quote.NextLevel = next;
            quote.BlockedBy = ConstructionSystem.ValidateUpgrade(_ctx, b.Id);
            foreach (var kv in next.Stats)
            {
                long current = b.Level >= 1 && Content.GetLevel(def.Id, b.Level).Stats.TryGetValue(kv.Key, out var c) ? c : 0;
                quote.StatChanges.Add(new StatChange(kv.Key, current, kv.Value));
            }
            return quote;
        }
    }

    public sealed class UpgradeQuote
    {
        public int BuildingId { get; internal set; }
        public BuildingDef Def { get; internal set; }
        public int CurrentLevel { get; internal set; }
        public bool IsMaxLevel { get; internal set; }
        /// <summary>The level being bought: its cost, build time and requirements. Null at max level.</summary>
        public BuildingLevel NextLevel { get; internal set; }
        /// <summary>Null when the upgrade can start right now, otherwise an <see cref="Errors"/> code.</summary>
        public string BlockedBy { get; internal set; }
        public bool CanStart => BlockedBy == null;
        public List<StatChange> StatChanges { get; } = new List<StatChange>();
    }

    public readonly struct StatChange
    {
        public StatChange(string stat, long from, long to) { Stat = stat; From = from; To = to; }
        public string Stat { get; }
        public long From { get; }
        public long To { get; }
    }
}
