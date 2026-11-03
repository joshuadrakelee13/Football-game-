using System.Collections.Generic;
using FCE.Core.Content;
using StatIds = FCE.Core.Content.Stats;

namespace FCE.Core.Systems
{
    /// <summary>
    /// Everything a Stadium level opens up, derived from content rather than written by hand, so it can never
    /// drift from what the rules actually allow. A Stadium upgrade is meant to open a new chapter of the club:
    /// new buildings starting at level 1, more of the ones the club already has, higher level caps, more land.
    /// </summary>
    public sealed class StadiumUnlocks
    {
        public int FromLevel { get; private set; }
        public int ToLevel { get; private set; }

        /// <summary>Building types that become available for the first time, with how many may be built.</summary>
        public List<(BuildingDef def, int count)> NewBuildings { get; } = new List<(BuildingDef, int)>();
        /// <summary>Additional copies of buildings already available. Each new copy starts at level 1.</summary>
        public List<(BuildingDef def, int from, int to)> ExtraInstances { get; } = new List<(BuildingDef, int, int)>();
        /// <summary>Buildings that may now be upgraded further.</summary>
        public List<(BuildingDef def, int from, int to)> RaisedCaps { get; } = new List<(BuildingDef, int, int)>();
        /// <summary>Tiles of land added to the buildable area.</summary>
        public int NewLandTiles { get; private set; }
        public int ExtraCrews { get; private set; }
        public Dictionary<string, long> Reward { get; } = new Dictionary<string, long>();
        /// <summary>The chapter that begins at this level, or null if the club stays in the same one.</summary>
        public ChapterDef NewChapter { get; private set; }

        /// <summary>
        /// Upgrade levels this Stadium level makes available across all buildings: every level of every new building
        /// and new copy, plus the extra levels on raised caps. The single measure of "how much new progression".
        /// </summary>
        public int NewUpgradeLevels { get; private set; }

        public bool OpensNothing => NewBuildings.Count == 0 && ExtraInstances.Count == 0 && RaisedCaps.Count == 0 && NewLandTiles == 0;

        public static StadiumUnlocks Between(ContentDb content, int from, int to)
        {
            var u = new StadiumUnlocks { FromLevel = from, ToLevel = to };
            foreach (var def in content.BuildingOrder)
            {
                if (def.IsHeadquarters) continue;
                int countBefore = content.AllowedCount(def.Id, from), countAfter = content.AllowedCount(def.Id, to);
                int capBefore = content.MaxLevelAt(def.Id, from), capAfter = content.MaxLevelAt(def.Id, to);

                if (countBefore == 0 && countAfter > 0)
                {
                    u.NewBuildings.Add((def, countAfter));
                    u.NewUpgradeLevels += capAfter * countAfter;
                    continue;
                }
                if (countAfter > countBefore)
                {
                    u.ExtraInstances.Add((def, countBefore, countAfter));
                    u.NewUpgradeLevels += capAfter * (countAfter - countBefore);
                }
                if (countBefore > 0 && capAfter > capBefore)
                {
                    u.RaisedCaps.Add((def, capBefore, capAfter));
                    u.NewUpgradeLevels += (capAfter - capBefore) * countBefore;
                }
            }

            var site = content.Economy.Site;
            var a = site.AreaAt(from);
            var b = site.AreaAt(to);
            u.NewLandTiles = b.Width * b.Height - a.Width * a.Height;

            if (from >= 1)
            {
                var hq = content.Headquarters;
                long crews(int level) => level >= 1 && content.GetLevel(hq.Id, level).Stats.TryGetValue(StatIds.ConstructionCrews, out var c) ? c : 0;
                u.ExtraCrews = (int)(crews(to) - crews(from));
            }

            foreach (var r in content.Economy.StadiumRewards)
                if (r.Level == to)
                    foreach (var kv in r.Currencies) u.Reward[kv.Key] = kv.Value;

            foreach (var c in content.Economy.Chapters)
                if (c.FromLevel == to && to > 1) u.NewChapter = c;
            return u;
        }
    }
}
