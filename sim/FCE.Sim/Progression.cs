using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using FCE.Core;
using FCE.Core.Content;
using FCE.Core.Economy;
using FCE.Core.Time;

namespace FCE.Sim
{
    /// <summary>
    /// Plays a club from day one with a <see cref="Bot"/>, on a real-time schedule from a <see cref="PlayProfile"/>,
    /// through the actual game rules. The game is advanced every simulated minute (the rules give the same result
    /// however time is sliced), but the bot only acts during sessions.
    /// </summary>
    static class Progression
    {
        // Monday 5 January 2026, 00:00 UTC. Sessions are at fixed times of day from here.
        const long Start = 1_767_571_200;

        public static int Run(ContentDb content, PlayProfile profile, int days, bool printDaily, TextWriter o)
        {
            var clock = new ManualClock(Start);
            var state = Game.NewGame(content, Start);
            var game = new Game(content, state, clock);
            var bot = new Bot(game);

            var clubhouseReached = new SortedDictionary<int, long> { [1] = Start };
            game.EventRaised += e =>
            {
                if (e is UpgradeCompleted c && c.Def == content.Headquarters.Id) clubhouseReached[c.NewLevel] = c.At;
            };

            long maxBalance = 0, potential = 0, lastIncomeTotal = 0;
            double crewBusyMinutes = 0, crewMinutes = 0;
            long? everythingMaxedAt = null;
            var waitingOnReturn = new List<long>();
            var fullOnReturn = new List<int>();
            var dailyRows = new List<string>();
            bool wasPlaying = false;

            for (long minute = 0; minute < days * 1440L; minute++)
            {
                if (minute > 0) clock.Advance(60);
                game.Update();

                int minuteOfDay = (int)(minute % 1440);
                bool playing = profile.IsPlaying(minuteOfDay);
                if (playing && !wasPlaying)
                {
                    // The player just opened the game: what has built up since they left?
                    waitingOnReturn.Add(state.Buildings.Where(b => b.Producer != null).Sum(b => b.Producer.Stored));
                    fullOnReturn.Add(state.Buildings.Count(b => b.Producer != null && b.Level >= 1 &&
                        b.Producer.Stored >= content.GetLevel(b.Def, b.Level).Capacity));
                }
                if (playing) bot.PlayTurn();
                wasPlaying = playing;

                // What every producer could have earned this minute if it were never left full.
                foreach (var b in state.Buildings)
                    if (b.Producer != null && b.Level >= 1 && !b.IsUnderConstruction)
                        potential += (long)(content.GetLevel(b.Def, b.Level).IncomePerHour / 60);

                crewMinutes += game.TotalCrews;
                crewBusyMinutes += game.TotalCrews - game.FreeCrews;
                maxBalance = Math.Max(maxBalance, game.Balance(Currencies.Cash));
                if (everythingMaxedAt == null && AllMaxed(game)) everythingMaxedAt = clock.UtcNowSeconds;

                if (minuteOfDay == 1439)
                {
                    var book = state.Ledger.Day(clock.UtcNowSeconds);
                    long income = state.Ledger.Lifetime.TotalIncome;
                    dailyRows.Add($"  {minute / 1440 + 1,4}  {game.StadiumLevel,3}  {MoneyFormat.Full(game.Balance(Currencies.Cash)),12}  {MoneyFormat.Full(income - lastIncomeTotal),10}  {MoneyFormat.Full(book.TotalExpenses),10}  {LevelsOwned(game),5}");
                    lastIncomeTotal = income;
                }
            }

            long stillWaiting = state.Buildings.Where(b => b.Producer != null).Sum(b => b.Producer.Stored);
            long produced = state.Ledger.Lifetime.Income.Where(kv => kv.Key != LedgerCategories.Refunds).Sum(kv => kv.Value) + stillWaiting;
            double efficiency = potential > 0 ? (double)produced / potential : 0;

            o.WriteLine();
            o.WriteLine($"=== PROGRESSION: {profile.Name} ({profile.Description}), {days} days, no purchases ===");
            o.WriteLine();
            o.WriteLine("  Clubhouse  Reached");
            foreach (var kv in clubhouseReached)
                o.WriteLine($"  {kv.Key,9}  {When(kv.Value)}");
            int maxHq = content.Headquarters.MaxLevel;
            if (!clubhouseReached.ContainsKey(maxHq)) o.WriteLine($"  {maxHq,9}  not within {days} days");

            if (printDaily)
            {
                o.WriteLine();
                o.WriteLine("   Day   CH       Balance      Earned       Spent  Levels");
                foreach (var row in dailyRows) o.WriteLine(row);
            }

            o.WriteLine();
            o.WriteLine($"  Earned in total        {MoneyFormat.Full(produced)}");
            o.WriteLine($"  Spent on construction  {MoneyFormat.Full(state.Ledger.Lifetime.Expenses.TryGetValue(LedgerCategories.Construction, out var built) ? built : 0)}");
            o.WriteLine($"  Highest balance        {MoneyFormat.Full(maxBalance)}");
            o.WriteLine($"  Balance at the end     {MoneyFormat.Full(game.Balance(Currencies.Cash))}");
            o.WriteLine($"  Waiting on return      median {MoneyFormat.Full(Median(waitingOnReturn))}, largest {MoneyFormat.Full(waitingOnReturn.DefaultIfEmpty(0).Max())}");
            o.WriteLine($"  Producers full on return  {fullOnReturn.Average():0.0} on average");
            o.WriteLine($"  Production captured    {efficiency:P0} of what was possible (the rest was lost to full buildings)");
            o.WriteLine($"  Crews busy             {crewBusyMinutes / Math.Max(1, crewMinutes):P0} of the time");
            o.WriteLine($"  Building levels        {LevelsOwned(game)} of {content.BuildingOrder.Sum(d => d.MaxLevel * MaxCount(content, d))} possible");
            o.WriteLine($"  Everything maxed       {(everythingMaxedAt.HasValue ? When(everythingMaxedAt.Value) : "no")}");

            int warnings = 0;
            void Warn(string message) { o.WriteLine($"  WARN {message}"); warnings++; }
            if (maxBalance > Thresholds.MaxGrassrootsBalance)
                Warn($"balance reached {MoneyFormat.Full(maxBalance)}, above the grassroots ceiling of {MoneyFormat.Full(Thresholds.MaxGrassrootsBalance)}");
            if (profile == PlayProfile.Engaged && clubhouseReached.TryGetValue(maxHq, out var maxAt) &&
                (maxAt - Start) / 86400.0 < Thresholds.MinDaysToMaxClubhouse)
                Warn($"an engaged player reached Clubhouse {maxHq} in {(maxAt - Start) / 86400.0:0.0} days; target is at least {Thresholds.MinDaysToMaxClubhouse}");
            if (profile == PlayProfile.Engaged && efficiency < Thresholds.MinEngagedEfficiency)
                Warn($"an engaged player captured only {efficiency:P0} of possible production; buildings fill up too fast");
            if (everythingMaxedAt.HasValue)
                Warn($"all content was finished on {When(everythingMaxedAt.Value)}");
            return warnings;
        }

        static bool AllMaxed(Game game) =>
            game.Content.BuildingOrder.All(d => game.Buildings.Count(b => b.Def == d.Id && b.Level >= d.MaxLevel) >= MaxCount(game.Content, d));

        static int MaxCount(ContentDb content, BuildingDef d) => d.Limits.Max(l => l.Count);

        static int LevelsOwned(Game game) => game.Buildings.Sum(b => b.Level);

        static string When(long at)
        {
            long s = at - Start;
            return $"day {s / 86400 + 1}, {s % 86400 / 3600:00}:{s % 3600 / 60:00}  ({MoneyFormat.Duration(s)} in)";
        }

        static long Median(List<long> values)
        {
            if (values.Count == 0) return 0;
            var sorted = values.OrderBy(v => v).ToList();
            return sorted[sorted.Count / 2];
        }
    }
}
