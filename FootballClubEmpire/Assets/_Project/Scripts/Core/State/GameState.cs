using System.Collections.Generic;

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
        /// <summary>Whole units waiting to be collected.</summary>
        public long Stored { get; set; }
        /// <summary>
        /// Production carried between ticks in unit-seconds-per-hour (rate x seconds, not yet divided by 3600),
        /// so splitting time into many small ticks yields exactly what one large tick would.
        /// </summary>
        public long Remainder { get; set; }
        public long LastTick { get; set; }
    }

    /// <summary>Currency balances. Sorted so saves are byte-for-byte stable.</summary>
    public sealed class Wallet
    {
        public SortedDictionary<string, long> Balances { get; set; } = new SortedDictionary<string, long>();

        public long Get(string currency) => Balances.TryGetValue(currency, out var v) ? v : 0;

        public bool CanAfford(string currency, long amount) => amount <= 0 || Get(currency) >= amount;

        internal void Add(string currency, long amount)
        {
            if (amount < 0) throw new System.ArgumentOutOfRangeException(nameof(amount));
            Balances[currency] = Get(currency) + amount;
        }

        internal void Spend(string currency, long amount)
        {
            if (amount < 0) throw new System.ArgumentOutOfRangeException(nameof(amount));
            if (!CanAfford(currency, amount)) throw new System.InvalidOperationException($"Cannot afford {amount} {currency}.");
            Balances[currency] = Get(currency) - amount;
        }
    }
}
