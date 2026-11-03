using System.Collections.Generic;
using System.Linq;
using FCE.Core.Content;
using FCE.Core.State;
using FCE.Core.Time;

namespace FCE.Core.Tests
{
    /// <summary>A fresh club on a manual clock, with helpers for moving time, building and levelling.</summary>
    sealed class TestGame
    {
        public const long Start = 1_700_000_000;

        // Free tiles inside the Stadium 1 buildable area (x 20-43, y 22-41), clear of the Stadium and Clubhouse.
        public const int FreeX = 40, FreeY = 22;

        public TestGame(ContentDb content = null)
        {
            Content = content ?? TestContent.Shipped;
            Clock = new ManualClock(Start);
            State = Game.NewGame(Content, Start);
            Game = new Game(Content, State, Clock);
            Game.EventRaised += e => Events.Add(e);
        }

        public ContentDb Content { get; }
        public ManualClock Clock { get; }
        public GameState State { get; }
        public Game Game { get; }
        public List<GameEvent> Events { get; } = new List<GameEvent>();

        public Systems.AdvanceReport Wait(long seconds)
        {
            Clock.Advance(seconds);
            return Game.Update();
        }

        public void GiveCash(long amount) => State.Wallet.Balances[Currencies.Cash] = State.Wallet.Get(Currencies.Cash) + amount;

        public BuildingState Find(string def) => State.Buildings.First(b => b.Def == def);

        public BuildingState Stadium => Find("stadium");

        public IEnumerable<T> EventsOf<T>() where T : GameEvent => Events.OfType<T>();

        /// <summary>Waits until a building's current project, if any, has finished.</summary>
        public void Finish(int buildingId)
        {
            var b = Game.FindBuilding(buildingId);
            if (b?.Construction != null) Wait(b.Construction.EndsAt - Clock.UtcNowSeconds);
        }

        /// <summary>Upgrades a building to a level, paying whatever it costs and waiting out each build.</summary>
        public void ForceLevel(int buildingId, int level)
        {
            var b = Game.FindBuilding(buildingId);
            while (b.Level < level)
            {
                GiveCash(10_000_000);
                var r = Game.StartUpgrade(buildingId);
                if (!r.Ok) throw new System.InvalidOperationException($"Cannot upgrade {b.Def} to {b.Level + 1}: {r.Error}");
                Finish(buildingId);
            }
        }

        /// <summary>Places a building wherever it fits and waits for it to be built.</summary>
        public int Build(string def)
        {
            GiveCash(10_000_000);
            var spot = Game.FindPlacement(def) ?? throw new System.InvalidOperationException($"No room for {def}.");
            var r = Game.PlaceBuilding(def, spot.x, spot.y);
            if (!r.Ok) throw new System.InvalidOperationException($"Cannot build {def}: {r.Error}");
            Finish(r.BuildingId);
            return r.BuildingId;
        }

        /// <summary>
        /// Takes the Stadium to a level, building and levelling whatever each Stadium level requires on the way.
        /// </summary>
        public void ReachStadium(int level)
        {
            while (Game.StadiumLevel < level)
            {
                var next = Content.GetLevel("stadium", Game.StadiumLevel + 1);
                foreach (var req in next.Requirements)
                {
                    var existing = State.Buildings.FirstOrDefault(b => b.Def == req.Building);
                    int id = existing?.Id ?? Build(req.Building);
                    ForceLevel(id, req.Level);
                }
                ForceLevel(Stadium.Id, Game.StadiumLevel + 1);
            }
        }
    }
}
