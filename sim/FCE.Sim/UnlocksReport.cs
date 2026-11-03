using System.Collections.Generic;
using System.IO;
using System.Linq;
using FCE.Core.Content;
using FCE.Core.Economy;
using FCE.Core.Systems;

namespace FCE.Sim
{
    /// <summary>What every Stadium level costs and opens. A Stadium level should open a new chapter, not just bigger numbers.</summary>
    static class UnlocksReport
    {
        public static int Print(ContentDb content, TextWriter o)
        {
            o.WriteLine();
            o.WriteLine("=== STADIUM LEVELS ===");
            o.WriteLine("  Lvl  Cost          Build    New buildings / copies                       Caps  Land  Crews  New levels  Chapter");
            var empty = new List<int>();
            for (int level = 2; level <= content.Headquarters.MaxLevel; level++)
            {
                var l = content.GetLevel(content.Headquarters.Id, level);
                var u = StadiumUnlocks.Between(content, level - 1, level);
                var newThings = u.NewBuildings.Select(n => n.def.Name)
                    .Concat(u.ExtraInstances.Select(e => $"{e.def.Name} #{e.to}")).ToList();
                if (newThings.Count == 0) empty.Add(level);
                string things = newThings.Count == 0 ? "-" : string.Join(", ", newThings);
                if (things.Length > 44) things = things.Substring(0, 41) + "...";
                o.WriteLine($"  {level,3}  {MoneyFormat.Full(l.Cost),-12}  {MoneyFormat.Duration(l.BuildSeconds),-7}  {things,-44}  {u.RaisedCaps.Count,4}  {u.NewLandTiles,4}  {(u.ExtraCrews > 0 ? "+" + u.ExtraCrews : ""),5}  {u.NewUpgradeLevels,10}  {u.NewChapter?.Name}");
            }

            if (empty.Count == 0) return 0;
            o.WriteLine($"  WARN Stadium levels {Ranges(empty)} open no new buildings yet. Each should open a new chapter of the club; content to come.");
            return 1;
        }

        static string Ranges(List<int> levels)
        {
            var parts = new List<string>();
            for (int i = 0; i < levels.Count;)
            {
                int j = i;
                while (j + 1 < levels.Count && levels[j + 1] == levels[j] + 1) j++;
                parts.Add(i == j ? levels[i].ToString() : $"{levels[i]}-{levels[j]}");
                i = j + 1;
            }
            return string.Join(", ", parts);
        }
    }
}
