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

        /// <summary>How many of a building the club may own at a given Clubhouse level.</summary>
        public int AllowedCount(string buildingId, int clubhouseLevel)
        {
            var def = GetBuilding(buildingId);
            int allowed = 0;
            foreach (var limit in def.Limits)
                if (limit.ClubhouseLevel <= clubhouseLevel) allowed = limit.Count;
            return allowed;
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
                    def.IsHeadquarters || def.RequiredClubhouse == null ? 0 : def.RequiredClubhouse[level - 1],
                    requirements,
                    stats,
                    def.Producer?.RatePerHour.Evaluate(level) ?? 0,
                    def.Producer?.Capacity.Evaluate(level) ?? 0);
            }
            return table;
        }
    }

    /// <summary>One precomputed level of a building.</summary>
    public sealed class BuildingLevel
    {
        public BuildingLevel(int level, long cost, long buildSeconds, int requiredClubhouse,
            IReadOnlyList<LevelRequirement> requirements, IReadOnlyDictionary<string, long> stats,
            long ratePerHour, long capacity)
        {
            Level = level;
            Cost = cost;
            BuildSeconds = buildSeconds;
            RequiredClubhouse = requiredClubhouse;
            Requirements = requirements;
            Stats = stats;
            RatePerHour = ratePerHour;
            Capacity = capacity;
        }

        public int Level { get; }
        public long Cost { get; }
        public long BuildSeconds { get; }
        public int RequiredClubhouse { get; }
        public IReadOnlyList<LevelRequirement> Requirements { get; }
        public IReadOnlyDictionary<string, long> Stats { get; }
        public long RatePerHour { get; }
        public long Capacity { get; }
    }
}
