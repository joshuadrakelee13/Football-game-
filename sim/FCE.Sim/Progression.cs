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
    /// Plays a club from install with a <see cref="Bot"/> on a <see cref="PlayProfile"/>'s schedule, through the real
    /// game rules, and measures the experience: what the player achieved by each point, how their time in the game
    /// was spent, when each Stadium level arrived and what it opened up.
    /// </summary>
    static class Progression
    {
        // Monday 5 January 2026, 00:00 UTC.
        const long Midnight = 1_767_571_200;
        const long Install = Midnight + PlayProfile.InstallMinute * 60L;

        sealed class Snapshot
        {
            public string Label;
            public int Stadium, Upgrades, Buildings, Types, Unlocked;
            public long Cash, Earned;
            public double SessionMinutes;
        }

        sealed class Phase
        {
            public string Label;
            public long From, To;
            public double SessionSeconds;
            public Dictionary<Moment, double> Seconds = Enum.GetValues(typeof(Moment)).Cast<Moment>().ToDictionary(m => m, m => 0.0);
        }

        public static int Run(ContentDb content, PlayProfile profile, int days, TextWriter o)
        {
            var clock = new ManualClock(Midnight);
            var state = Game.NewGame(content, Midnight);
            var game = new Game(content, state, clock);
            var bot = new Bot(game);

            int upgrades = 0;
            var stadiumReached = new SortedDictionary<int, long>();
            var firstSessionSpend = new SortedDictionary<string, long>();
            long firstSessionEnd = Install + profile.FirstSessionMinutes * 60L;
            game.EventRaised += e =>
            {
                if (e is UpgradeCompleted) upgrades++;
                if (e is StadiumLevelReached s) stadiumReached[s.Level] = s.At;
                if (e is UpgradeStarted started && started.At < firstSessionEnd && started.Currency == Currencies.Cash)
                {
                    var def = content.GetBuilding(state.Buildings.First(b => b.Id == started.BuildingId).Def);
                    string group = def.IsHeadquarters ? "Stadium" : def.Producer != null ? "producers" : "facilities";
                    firstSessionSpend[group] = (firstSessionSpend.TryGetValue(group, out var v) ? v : 0) + started.Cost;
                }
            };

            var checkpoints = new List<(long at, string label)>
            {
                (Install + 30 * 60, "30 minutes in"), (Install + 60 * 60, "1 hour in"), (Install + 120 * 60, "2 hours in"),
                (Midnight + 86400, "end of day 1"), (Midnight + 3 * 86400, "end of day 3"),
                (Midnight + 7 * 86400, "end of day 7"), (Midnight + 30 * 86400, "end of day 30"),
            }.Where(c => c.at <= Midnight + days * 86400L).ToList();
            var snapshots = new List<Snapshot>();

            var phases = new List<Phase>
            {
                new Phase { Label = "first session", From = Install, To = Install + profile.FirstSessionMinutes * 60L },
                new Phase { Label = "days 1-3", From = Midnight, To = Midnight + 3 * 86400 },
                new Phase { Label = "days 4-7", From = Midnight + 3 * 86400, To = Midnight + 7 * 86400 },
                new Phase { Label = "days 8-30", From = Midnight + 7 * 86400, To = Midnight + 30 * 86400 },
            };

            long maxBalanceGrassroots = 0, longestIdle = 0, idleRun = 0;
            double sessionSeconds = 0;
            var waitingOnReturn = new List<long>();
            bool wasPlaying = false;
            int checkpoint = 0;
            long end = Midnight + days * 86400L;

            while (clock.UtcNowSeconds < end)
            {
                long now = clock.UtcNowSeconds;
                bool playing = profile.IsPlaying((now - Midnight) / 60);
                long step = playing ? 10 : 60;
                game.Update();

                if (playing && !wasPlaying)
                    waitingOnReturn.Add(state.Buildings.Where(b => b.Producer != null).Sum(b => b.Producer.Stored));

                if (playing)
                {
                    int before = upgrades;
                    var moment = bot.PlayTurn();
                    sessionSeconds += step;
                    foreach (var p in phases)
                        if (now >= p.From && now < p.To) { p.SessionSeconds += step; p.Seconds[moment] += step; }
                    idleRun = moment == Moment.NothingToDo ? idleRun + step : 0;
                    longestIdle = Math.Max(longestIdle, idleRun);
                }
                else idleRun = 0;
                wasPlaying = playing;

                if (game.StadiumLevel <= 5) maxBalanceGrassroots = Math.Max(maxBalanceGrassroots, game.Balance(Currencies.Cash));

                clock.Advance(step);
                while (checkpoint < checkpoints.Count && clock.UtcNowSeconds >= checkpoints[checkpoint].at)
                {
                    game.Update();
                    snapshots.Add(Snap(game, state, checkpoints[checkpoint].label, upgrades, sessionSeconds));
                    checkpoint++;
                }
            }

            Print(content, profile, days, snapshots, phases, stadiumReached, maxBalanceGrassroots, longestIdle, waitingOnReturn, game, o);
            o.WriteLine($"  First session spent        {string.Join(", ", firstSessionSpend.Select(kv => $"{kv.Key} {MoneyFormat.Full(kv.Value)}"))}");
            return Check(content, profile, snapshots, phases, stadiumReached, maxBalanceGrassroots, longestIdle, o);
        }

        static Snapshot Snap(Game game, Core.State.GameState state, string label, int upgrades, double sessionSeconds) => new Snapshot
        {
            Label = label,
            Stadium = game.StadiumLevel,
            Upgrades = upgrades,
            Buildings = state.Buildings.Count,
            Types = state.Buildings.Select(b => b.Def).Distinct().Count(),
            Unlocked = game.Content.BuildingOrder.Count(d => game.Content.AllowedCount(d.Id, game.StadiumLevel) > 0),
            Cash = game.Balance(Currencies.Cash),
            Earned = state.Ledger.Lifetime.TotalIncome,
            SessionMinutes = sessionSeconds / 60,
        };

        static void Print(ContentDb content, PlayProfile profile, int days, List<Snapshot> snapshots, List<Phase> phases,
            SortedDictionary<int, long> stadiumReached, long maxBalance, long longestIdle, List<long> waitingOnReturn, Game game, TextWriter o)
        {
            o.WriteLine();
            o.WriteLine($"=== PLAYER EXPERIENCE: {profile.Name} ({profile.Description}), {days} days, no purchases ===");
            o.WriteLine();
            o.WriteLine("  Checkpoint      Played   Stadium  Upgrades  Buildings  Types  Unlocked       Cash       Earned");
            foreach (var s in snapshots)
                o.WriteLine($"  {s.Label,-14}  {MoneyFormat.Duration((long)(s.SessionMinutes * 60)),7}  {s.Stadium,7}  {s.Upgrades,8}  {s.Buildings,9}  {s.Types,5}  {s.Unlocked,8}  {MoneyFormat.Full(s.Cash),9}  {MoneyFormat.Full(s.Earned),11}");

            o.WriteLine();
            o.WriteLine("  How time in the game was spent");
            o.WriteLine("  Phase           In game   Acting  Waiting for crews  Saving up  Nothing to do");
            foreach (var p in phases.Where(p => p.SessionSeconds > 0))
                o.WriteLine($"  {p.Label,-14}  {MoneyFormat.Duration((long)p.SessionSeconds),8}  {Share(p, Moment.Acting),6}  {Share(p, Moment.WaitingForCrews),17}  {Share(p, Moment.Saving),9}  {Share(p, Moment.NothingToDo),13}");
            o.WriteLine($"  Longest stretch with nothing to do: {MoneyFormat.Duration(longestIdle)}");
            o.WriteLine($"  Activities available besides building: 0 (mini-games, squad and league are not built yet)");

            o.WriteLine();
            o.WriteLine("  Stadium  Reached                        Opened up");
            foreach (var kv in stadiumReached)
            {
                var u = game.UnlocksAtStadium(kv.Key);
                o.WriteLine($"  {kv.Key,7}  {When(kv.Value),-29}  {Describe(u)}");
            }
            int maxStadium = content.Headquarters.MaxLevel;
            int reached = stadiumReached.Count == 0 ? 1 : stadiumReached.Keys.Max();
            if (reached < maxStadium) o.WriteLine($"  {reached + 1,7}  not within {days} days");

            o.WriteLine();
            o.WriteLine($"  Highest balance (Grassroots)  {MoneyFormat.Full(maxBalance)}");
            o.WriteLine($"  Waiting on return             median {MoneyFormat.Full(Median(waitingOnReturn))}, largest {MoneyFormat.Full(waitingOnReturn.DefaultIfEmpty(0).Max())}");
        }

        static int Check(ContentDb content, PlayProfile profile, List<Snapshot> snapshots, List<Phase> phases,
            SortedDictionary<int, long> stadiumReached, long maxBalance, long longestIdle, TextWriter o)
        {
            int warnings = 0;
            void Warn(string message) { o.WriteLine($"  WARN {message}"); warnings++; }
            Snapshot At(string label) => snapshots.FirstOrDefault(s => s.Label == label);
            double DayOf(int level) => stadiumReached.TryGetValue(level, out var at) ? (at - Midnight) / 86400.0 : double.PositiveInfinity;

            var first30 = At("30 minutes in");
            if (first30 != null && first30.Upgrades < Thresholds.MinUpgradesFirst30Minutes)
                Warn($"only {first30.Upgrades} upgrades in the first 30 minutes; target is at least {Thresholds.MinUpgradesFirst30Minutes}");
            if (stadiumReached.TryGetValue(2, out var s2) && (s2 - Install) / 60.0 > Thresholds.MaxMinutesToStadium2)
                Warn($"Stadium 2 took {(s2 - Install) / 60.0:0} minutes; target is within {Thresholds.MaxMinutesToStadium2}");

            foreach (var p in phases.Where(p => p.SessionSeconds > 0))
            {
                double nothing = p.Seconds[Moment.NothingToDo] / p.SessionSeconds;
                if (nothing > Thresholds.MaxNothingToDoShare)
                    Warn($"{p.Label}: nothing at all to do for {nothing:P0} of the time in game; target is under {Thresholds.MaxNothingToDoShare:P0}");
            }
            var firstSession = phases[0];
            if (firstSession.SessionSeconds > 0)
            {
                double waiting = firstSession.Seconds[Moment.WaitingForCrews] / firstSession.SessionSeconds;
                if (waiting > Thresholds.MaxWaitingShareFirstSession)
                    Warn($"first session: waiting for crews {waiting:P0} of the time; target is under {Thresholds.MaxWaitingShareFirstSession:P0}");
            }

            if (maxBalance > Thresholds.MaxGrassrootsBalance)
                Warn($"balance reached {MoneyFormat.Full(maxBalance)} during Grassroots; ceiling is {MoneyFormat.Full(Thresholds.MaxGrassrootsBalance)}");

            if (profile == PlayProfile.Active)
            {
                if (DayOf(5) < Thresholds.ActiveStadium5Days.min)
                    Warn($"an active player reached Stadium 5 on day {DayOf(5) + 1:0.0}; target is no sooner than day {Thresholds.ActiveStadium5Days.min + 1}");
                if (DayOf(5) > Thresholds.ActiveStadium5Days.max)
                    Warn($"an active player had not reached Stadium 5 by day {Thresholds.ActiveStadium5Days.max + 1}");
            }

            // Early days should move faster than the ones after.
            var d3 = At("end of day 3");
            var d7 = At("end of day 7");
            var d1 = At("end of day 1");
            if (d1 != null && d3 != null && d7 != null && d7.SessionMinutes > d3.SessionMinutes)
            {
                double early = d3.Upgrades / Math.Max(1, d3.SessionMinutes / 60);
                double later = (d7.Upgrades - d3.Upgrades) / Math.Max(1, (d7.SessionMinutes - d3.SessionMinutes) / 60);
                o.WriteLine($"  Upgrades per hour played: {early:0} in days 1-3, {later:0} in days 4-7");
                if (early <= later) Warn("days 1-3 were not faster than days 4-7");
            }
            return warnings;
        }

        static string Share(Phase p, Moment m) => $"{p.Seconds[m] / p.SessionSeconds:P0}";

        static string Describe(Core.Systems.StadiumUnlocks u)
        {
            var parts = new List<string>();
            if (u.NewBuildings.Count > 0) parts.Add("new: " + string.Join(", ", u.NewBuildings.Select(n => n.def.Name)));
            foreach (var e in u.ExtraInstances) parts.Add($"{Ordinal(e.to)} {e.def.Name}");
            if (u.ExtraCrews > 0) parts.Add($"+{u.ExtraCrews} crew");
            parts.Add($"{u.NewUpgradeLevels} new upgrade levels");
            return string.Join("; ", parts);
        }

        static string Ordinal(int n) => n == 2 ? "2nd" : n == 3 ? "3rd" : $"{n}th";

        static string When(long at)
        {
            long s = at - Midnight;
            long sinceInstall = at - Install;
            return $"day {s / 86400 + 1}, {s % 86400 / 3600:00}:{s % 3600 / 60:00} ({MoneyFormat.Duration(sinceInstall)} in)";
        }

        static long Median(List<long> values)
        {
            if (values.Count == 0) return 0;
            var sorted = values.OrderBy(v => v).ToList();
            return sorted[sorted.Count / 2];
        }
    }
}
