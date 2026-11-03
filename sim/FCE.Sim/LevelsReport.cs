using System;
using System.IO;
using System.Linq;
using FCE.Core.Content;
using FCE.Core.Economy;

namespace FCE.Sim
{
    /// <summary>Every level of every building, with the numbers a player would weigh up and warnings where they break the design.</summary>
    static class LevelsReport
    {
        public static int Print(ContentDb content, TextWriter o)
        {
            int warnings = 0;
            o.WriteLine("=== BUILDING LEVELS ===");
            foreach (var def in content.BuildingOrder)
            {
                o.WriteLine();
                o.WriteLine($"{def.Name} ({def.Id}, {def.Department}, max level {def.MaxLevel})");
                bool producer = def.Producer != null;
                o.WriteLine(producer
                    ? "  Lvl  Cost        Build     St  Takings          Per hour    Step   Holds      Fills in  Payback"
                    : "  Lvl  Cost        Build     St  Gives");

                BuildingLevel previous = null;
                for (int level = 1; level <= def.MaxLevel; level++)
                {
                    var l = content.GetLevel(def.Id, level);
                    string head = $"  {level,3}  {MoneyFormat.Full(l.Cost),-10}  {MoneyFormat.Duration(l.BuildSeconds),-8}  {(def.IsHeadquarters ? "-" : (l.RequiredStadium == int.MaxValue ? "-" : l.RequiredStadium.ToString())),2}";
                    if (!producer)
                    {
                        var gives = string.Join(", ", l.Stats.Select(kv => $"{kv.Key} {kv.Value}"));
                        o.WriteLine($"{head}  {gives}");
                        previous = l;
                        continue;
                    }

                    double step = previous == null ? 0 : l.IncomePerHour / previous.IncomePerHour - 1;
                    double gain = l.IncomePerHour - (previous?.IncomePerHour ?? 0);
                    double paybackHours = gain > 0 ? l.Cost / gain : double.PositiveInfinity;
                    double fillMinutes = l.SecondsToFill / 60.0;

                    string flags = "";
                    if (step > Thresholds.MaxIncomeStep) flags += $" WARN income +{step:P0} in one level";
                    if (paybackHours > Thresholds.MaxPaybackHours) flags += $" WARN payback {paybackHours:0.#}h";
                    if (fillMinutes < Thresholds.MinFillMinutes) flags += $" WARN fills in {fillMinutes:0.#} min";
                    if (flags.Length > 0) warnings++;

                    o.WriteLine($"{head}  {MoneyFormat.PerCycle(l.AmountPerCycle, l.CycleSeconds),-15}  {MoneyFormat.PerHour((long)l.IncomePerHour),-10}  {(previous == null ? "" : $"+{step:P0}"),5}  {MoneyFormat.Compact(l.Capacity),-9}  {MoneyFormat.Duration(l.SecondsToFill),-8}  {Hours(paybackHours)}{flags}");
                    previous = l;
                }
            }
            return warnings;
        }

        static string Hours(double h) => double.IsInfinity(h) ? "-" : h < 1 ? $"{h * 60:0} min" : $"{h:0.#} h";
    }
}
