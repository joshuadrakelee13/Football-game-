using System.Collections.Generic;
using FCE.Core.Economy;

namespace FCE.Core.State
{
    /// <summary>
    /// Everything that is saved. Plain data with no behaviour, so it serialises cleanly and can be inspected in a save file.
    /// Derived values (stats, crews, what is affordable) are never stored; they are recomputed from this and the content.
    /// </summary>
    public sealed class GameState
    {
        /// <summary>The latest moment the simulation has been advanced to. Never moves backwards.</summary>
        public long Now { get; set; }
        public long CreatedAt { get; set; }
        public Wallet Wallet { get; set; } = new Wallet();
        public Ledger Ledger { get; set; } = new Ledger();
        public List<BuildingState> Buildings { get; set; } = new List<BuildingState>();
        public int NextBuildingId { get; set; } = 1;
    }

    public sealed class BuildingState
    {
        public int Id { get; set; }
        /// <summary>The <see cref="Content.BuildingDef"/> id.</summary>
        public string Def { get; set; }
        /// <summary>The completed level. 0 while a newly placed building is still under construction.</summary>
        public int Level { get; set; }
        public int X { get; set; }
        public int Y { get; set; }
        /// <summary>The project in progress, or null.</summary>
        public ConstructionState Construction { get; set; }
        /// <summary>Stock waiting to be collected, for buildings that produce.</summary>
        public ProducerState Producer { get; set; }

        public bool IsUnderConstruction => Construction != null;
    }

    public sealed class ConstructionState
    {
        public int TargetLevel { get; set; }
        public long StartedAt { get; set; }
        public long EndsAt { get; set; }
        /// <summary>What was paid, so a cancellation refunds the right amount even if content prices change later.</summary>
        public long Paid { get; set; }
        public string PaidCurrency { get; set; }
    }

    public sealed class ProducerState
    {
        /// <summary>Takings waiting to be collected.</summary>
        public long Stored { get; set; }
        /// <summary>
        /// Seconds into the current cycle, carried between ticks so that many small ticks earn exactly what one
        /// large tick would.
        /// </summary>
        public long CycleProgress { get; set; }
        public long LastTick { get; set; }
    }

    /// <summary>Currency balances. Sorted so saves are byte-for-byte stable.</summary>
    public sealed class Wallet
    {
        public SortedDictionary<string, long> Balances { get; set; } = new SortedDictionary<string, long>();

        public long Get(string currency) => Balances.TryGetValue(currency, out var v) ? v : 0;

        public bool CanAfford(string currency, long amount) => amount <= 0 || Get(currency) >= amount;

        /// <summary>Adds up to the <see cref="Money.MaxBalance"/> ceiling. Returns how much was actually added.</summary>
        internal long Add(string currency, long amount)
        {
            if (amount < 0) throw new System.ArgumentOutOfRangeException(nameof(amount));
            long current = Get(currency);
            long added = System.Math.Min(amount, Money.MaxBalance - current);
            if (added < 0) added = 0;
            Balances[currency] = current + added;
            return added;
        }

        internal void Spend(string currency, long amount)
        {
            if (amount < 0) throw new System.ArgumentOutOfRangeException(nameof(amount));
            if (!CanAfford(currency, amount)) throw new System.InvalidOperationException($"Cannot afford {amount} {currency}.");
            Balances[currency] = Get(currency) - amount;
        }
    }
}
