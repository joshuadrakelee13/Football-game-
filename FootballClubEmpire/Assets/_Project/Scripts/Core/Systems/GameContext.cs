using System.Collections.Generic;
using System.Linq;
using FCE.Core.Content;
using FCE.Core.State;
using StatIds = FCE.Core.Content.Stats;

namespace FCE.Core.Systems
{
    /// <summary>The content, the state and the events raised so far in the current operation. Shared by all systems.</summary>
    internal sealed class GameContext
    {
        ClubStats _stats;

        public GameContext(ContentDb content, GameState state)
        {
            Content = content;
            State = state;
        }

        public ContentDb Content { get; }
        public GameState State { get; }
        public List<GameEvent> Pending { get; } = new List<GameEvent>();

        public void Raise(GameEvent e) => Pending.Add(e);

        public ClubStats Stats => _stats ?? (_stats = StatsSystem.Compute(Content, State));

        /// <summary>Call whenever a building's completed level changes or a building is added or removed.</summary>
        public void InvalidateStats() => _stats = null;

        public BuildingState FindBuilding(int id) => State.Buildings.FirstOrDefault(b => b.Id == id);

        public int ClubhouseLevel
        {
            get
            {
                var hq = State.Buildings.FirstOrDefault(b => b.Def == Content.Headquarters.Id);
                return hq?.Level ?? 0;
            }
        }

        /// <summary>The highest completed level among the club's buildings of a type, or 0.</summary>
        public int HighestLevel(string def)
        {
            int best = 0;
            foreach (var b in State.Buildings)
                if (b.Def == def && b.Level > best) best = b.Level;
            return best;
        }

        public int CountOwned(string def) => State.Buildings.Count(b => b.Def == def);

        public int BusyCrews => State.Buildings.Count(b => b.IsUnderConstruction);

        public int TotalCrews => (int)Stats.Get(StatIds.ConstructionCrews);

        public int FreeCrews => TotalCrews - BusyCrews;

        public void Credit(string currency, long amount)
        {
            if (amount <= 0) return;
            State.Wallet.Add(currency, amount);
            Raise(new WalletChanged(State.Now, currency, amount, State.Wallet.Get(currency)));
        }

        public void Debit(string currency, long amount)
        {
            if (amount <= 0) return;
            State.Wallet.Spend(currency, amount);
            Raise(new WalletChanged(State.Now, currency, -amount, State.Wallet.Get(currency)));
        }
    }
}
