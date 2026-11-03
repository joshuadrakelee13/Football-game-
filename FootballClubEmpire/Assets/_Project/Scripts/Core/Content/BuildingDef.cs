using System.Collections.Generic;

namespace FCE.Core.Content
{
    /// <summary>
    /// Everything about a type of building, as authored in Content/Buildings/*.json.
    /// Level 1 is the first built level: its cost and build time are what it costs to place the building.
    /// </summary>
    public sealed class BuildingDef
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        /// <summary>stadium, training, youth, medical, commercial, operations or media.</summary>
        public string Department { get; set; }

        /// <summary>The Clubhouse. Exactly one building must be the headquarters; its level gates everything else.</summary>
        public bool IsHeadquarters { get; set; }

        public int FootprintWidth { get; set; } = 1;
        public int FootprintHeight { get; set; } = 1;

        public int MaxLevel { get; set; }

        public string CostCurrency { get; set; } = Currencies.Cash;
        /// <summary>Cost to reach each level (level 1 = cost to build).</summary>
        public Curve Cost { get; set; }
        /// <summary>Seconds to reach each level.</summary>
        public Curve BuildSeconds { get; set; }

        /// <summary>
        /// Clubhouse level needed to start building each level, one entry per level.
        /// Not used on the headquarters itself (see <see cref="LevelRequirements"/>).
        /// </summary>
        public int[] RequiredClubhouse { get; set; }

        /// <summary>Additional "building X at level Y" requirements for specific levels.</summary>
        public List<LevelRequirement> LevelRequirements { get; set; } = new List<LevelRequirement>();

        /// <summary>How many of this building the club may own, by Clubhouse level. Sorted by Clubhouse level.</summary>
        public List<CountLimit> Limits { get; set; } = new List<CountLimit>();

        /// <summary>The stats this building contributes at each level.</summary>
        public List<StatGrant> Stats { get; set; } = new List<StatGrant>();

        /// <summary>Set when this building generates a currency over time.</summary>
        public ProducerDef Producer { get; set; }
    }

    public sealed class LevelRequirement
    {
        /// <summary>The level of this building that the requirement applies to.</summary>
        public int AtLevel { get; set; }
        public string Building { get; set; }
        public int Level { get; set; }
    }

    public sealed class CountLimit
    {
        public int ClubhouseLevel { get; set; }
        public int Count { get; set; }
    }

    public sealed class StatGrant
    {
        public string Stat { get; set; }
        /// <summary>The building's total contribution at each level (not the increase over the previous level).</summary>
        public Curve Value { get; set; }
    }

    /// <summary>
    /// A building that earns money in cycles: <c>AmountPerCycle</c> every <c>CycleSeconds</c>, e.g. £5 every 5 seconds.
    /// Earnings wait in the building until collected; once <c>Capacity</c> is full it stops earning, which is what
    /// bounds offline income and rewards checking in.
    /// </summary>
    public sealed class ProducerDef
    {
        public string Currency { get; set; } = Currencies.Cash;
        /// <summary>Ledger income category the takings are recorded under, e.g. "food_drink".</summary>
        public string IncomeCategory { get; set; }
        public Curve AmountPerCycle { get; set; }
        public Curve CycleSeconds { get; set; }
        public Curve Capacity { get; set; }
    }
}
