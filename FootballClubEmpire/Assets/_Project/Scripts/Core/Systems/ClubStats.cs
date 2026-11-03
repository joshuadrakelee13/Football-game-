using System.Collections.Generic;
using FCE.Core.Content;
using FCE.Core.State;

namespace FCE.Core.Systems
{
    /// <summary>
    /// The club's derived statistics: each stat's base value plus every building's contribution at its completed level.
    /// This is the single place where facilities turn into effects. Squad development, matchday income and
    /// promotion eligibility all read from here.
    /// </summary>
    public sealed class ClubStats
    {
        readonly Dictionary<string, long> _values;

        internal ClubStats(Dictionary<string, long> values) { _values = values; }

        public long Get(string statId) => _values.TryGetValue(statId, out var v) ? v : 0;

        public IReadOnlyDictionary<string, long> All => _values;
    }

    internal static class StatsSystem
    {
        public static ClubStats Compute(ContentDb content, GameState state)
        {
            var values = new Dictionary<string, long>();
            foreach (var stat in content.Stats.Values) values[stat.Id] = stat.BaseValue;

            foreach (var building in state.Buildings)
            {
                // A building under upgrade keeps giving its current level's benefits; only completion changes them.
                if (building.Level < 1) continue;
                foreach (var kv in content.GetLevel(building.Def, building.Level).Stats)
                    values[kv.Key] = (values.TryGetValue(kv.Key, out var v) ? v : 0) + kv.Value;
            }
            return new ClubStats(values);
        }
    }
}
