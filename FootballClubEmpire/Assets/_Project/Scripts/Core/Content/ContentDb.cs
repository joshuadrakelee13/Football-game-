using System;
using System.Collections.Generic;

namespace FCE.Core.Content
{
    /// <summary>
    /// The loaded, validated, read-only game content, with every building level precomputed so rules never
    /// evaluate curves at play time. Built by <see cref="ContentLoader"/>.
    /// </summary>
    public sealed class ContentDb
    {
        readonly Dictionary<string, BuildingLevel[]> _levels = new Dictionary<string, BuildingLevel[]>();

        internal ContentDb(
            IEnumerable<CurrencyDef> currencies,
            IEnumerable<StatDef> stats,
            IEnumerable<BuildingDef> buildings,
            EconomyDef economy)
        {
            var currencyMap = new Dictionary<string, CurrencyDef>();
            foreach (var c in currencies) currencyMap.Add(c.Id, c);
            var statMap = new Dictionary<string, StatDef>();
            foreach (var s in stats) statMap.Add(s.Id, s);
            var buildingMap = new Dictionary<string, BuildingDef>();
            var order = new List<BuildingDef>();
            foreach (var b in buildings)
            {
                buildingMap.Add(b.Id, b);
                order.Add(b);
                if (b.IsHeadquarters) Headquarters = b;
                _levels.Add(b.Id, Precompute(b));
            }

            Currencies = currencyMap;
            Stats = statMap;
            Buildings = buildingMap;
            BuildingOrder = order;
            Economy = economy;
        }

        public IReadOnlyDictionary<string, CurrencyDef> Currencies { get; }
        public IReadOnlyDictionary<string, StatDef> Stats { get; }
        public IReadOnlyDictionary<string, BuildingDef> Buildings { get; }
        /// <summary>Buildings in authored order, for stable UI listings.</summary>
        public IReadOnlyList<BuildingDef> BuildingOrder { get; }
        public BuildingDef Headquarters { get; }
        public EconomyDef Economy { get; }

        public BuildingDef GetBuilding(string id)
        {
            if (id != null && Buildings.TryGetValue(id, out var def)) return def;
            throw new KeyNotFoundException($"Unknown building '{id}'.");
        }

        /// <summary>The precomputed data for reaching <paramref name="level"/> (1..MaxLevel).</summary>
        public BuildingLevel GetLevel(string buildingId, int level)
        {
            if (!_levels.TryGetValue(buildingId, out var table))
                throw new KeyNotFoundException($"Unknown building '{buildingId}'.");
            if (level < 1 || level > table.Length)
                throw new ArgumentOutOfRangeException(nameof(level), level, $"{buildingId} has levels 1..{table.Length}.");
            return table[level - 1];
        }

        /// <summary>How many of a building the club may own at a given Stadium level.</summary>
        public int AllowedCount(string buildingId, int stadiumLevel)
        {
            var def = GetBuilding(buildingId);
            int allowed = 0;
            foreach (var limit in def.Limits)
                if (limit.StadiumLevel <= stadiumLevel) allowed = limit.Count;
            return allowed;
        }

        /// <summary>How far a building may be upgraded at a given Stadium level (0 if it is not available yet).</summary>
        public int MaxLevelAt(string buildingId, int stadiumLevel)
        {
            var def = GetBuilding(buildingId);
            if (def.IsHeadquarters) return def.MaxLevel;
            int cap = 0;
            foreach (var c in def.LevelCaps)
                if (c.StadiumLevel <= stadiumLevel) cap = c.MaxLevel;
            return Math.Min(cap, def.MaxLevel);
        }

        /// <summary>The named chapter of the game a Stadium level belongs to, or null if none are defined.</summary>
        public ChapterDef ChapterAt(int stadiumLevel)
        {
            ChapterDef chapter = null;
            foreach (var c in Economy.Chapters)
                if (c.FromLevel <= stadiumLevel) chapter = c;
            return chapter;
        }

        static BuildingLevel[] Precompute(BuildingDef def)
        {
            var table = new BuildingLevel[def.MaxLevel];
            for (int level = 1; level <= def.MaxLevel; level++)
            {
                var stats = new Dictionary<string, long>();
                foreach (var grant in def.Stats) stats[grant.Stat] = grant.Value.Evaluate(level);

                var requirements = new List<LevelRequirement>();
                foreach (var r in def.LevelRequirements)
                    if (r.AtLevel == level) requirements.Add(r);

                table[level - 1] = new BuildingLevel(
                    level,
                    def.Cost.Evaluate(level),
                    def.BuildSeconds.Evaluate(level),
                    RequiredStadium(def, level),
                    requirements,
                    stats,
                    def.Producer?.AmountPerCycle.Evaluate(level) ?? 0,
                    def.Producer?.CycleSeconds.Evaluate(level) ?? 0,
                    def.Producer?.Capacity.Evaluate(level) ?? 0);
            }
            return table;
        }

        /// <summary>The lowest Stadium level whose cap allows this level, or int.MaxValue if none does yet.</summary>
        internal static int RequiredStadium(BuildingDef def, int level)
        {
            if (def.IsHeadquarters) return 0;
            foreach (var c in def.LevelCaps)
                if (c.MaxLevel >= level) return c.StadiumLevel;
            return int.MaxValue;
        }
    }

    /// <summary>One precomputed level of a building.</summary>
    public sealed class BuildingLevel
    {
        public BuildingLevel(int level, long cost, long buildSeconds, int requiredStadium,
            IReadOnlyList<LevelRequirement> requirements, IReadOnlyDictionary<string, long> stats,
            long amountPerCycle, long cycleSeconds, long capacity)
        {
            Level = level;
            Cost = cost;
            BuildSeconds = buildSeconds;
            RequiredStadium = requiredStadium;
            Requirements = requirements;
            Stats = stats;
            AmountPerCycle = amountPerCycle;
            CycleSeconds = cycleSeconds;
            Capacity = capacity;
        }

        public int Level { get; }
        public long Cost { get; }
        public long BuildSeconds { get; }
        /// <summary>The Stadium level that opens this level (0 for the Stadium itself; int.MaxValue if no Stadium level does yet).</summary>
        public int RequiredStadium { get; }

        /// <summary>Instant levels complete the moment they are bought and need no construction crew.</summary>
        public bool IsInstant => BuildSeconds <= 0;
        public IReadOnlyList<LevelRequirement> Requirements { get; }
        public IReadOnlyDictionary<string, long> Stats { get; }
        /// <summary>Producers: takings per cycle (0 for buildings that do not produce).</summary>
        public long AmountPerCycle { get; }
        public long CycleSeconds { get; }
        /// <summary>Producers: how much the building holds before it stops earning.</summary>
        public long Capacity { get; }

        public bool Produces => AmountPerCycle > 0 && CycleSeconds > 0;

        /// <summary>Takings per hour while it is being collected before it fills.</summary>
        public double IncomePerHour => Produces ? AmountPerCycle * 3600.0 / CycleSeconds : 0;

        /// <summary>Seconds from empty to full: how long it can be left before it stops earning.</summary>
        public long SecondsToFill => Produces ? (Capacity + AmountPerCycle - 1) / AmountPerCycle * CycleSeconds : 0;
    }
}
