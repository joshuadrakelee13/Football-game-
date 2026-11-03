using System.Collections.Generic;
using System.Linq;
using FCE.Core.Content;
using FCE.Core.State;
using FCE.Core.Time;

namespace FCE.Core.Tests
{
    /// <summary>A fresh club on a manual clock, with helpers for moving time and finding buildings.</summary>
    sealed class TestGame
    {
        public const long Start = 1_700_000_000;

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

        public IEnumerable<T> EventsOf<T>() where T : GameEvent => Events.OfType<T>();

        /// <summary>Builds or upgrades a building to a level, finishing each step by waiting, regardless of cost.</summary>
        public void ForceLevel(int buildingId, int level)
        {
            var b = Game.FindBuilding(buildingId);
            while (b.Level < level)
            {
                GiveCash(10_000_000);
                var r = Game.StartUpgrade(buildingId);
                if (!r.Ok) throw new System.InvalidOperationException($"Cannot upgrade {b.Def} to {b.Level + 1}: {r.Error}");
                Wait(b.Construction.EndsAt - Clock.UtcNowSeconds);
            }
        }
    }
}
