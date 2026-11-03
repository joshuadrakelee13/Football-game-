using System.Collections.Generic;
using System.Linq;
using FCE.Core.Economy;

namespace FCE.Core.Content
{
    /// <summary>
    /// Checks authored content for mistakes that would otherwise surface as a broken game: dangling references,
    /// curves that do not cover every level, building levels no Stadium level ever opens, requirements that can
    /// never be met, prices above the economy ceiling, overlapping start buildings.
    /// Runs on every load, in the headless tests and from the Unity editor menu.
    /// </summary>
    public static class ContentValidator
    {
        public static List<string> Validate(
            IList<CurrencyDef> currencies,
            IList<StatDef> stats,
            IList<BuildingDef> buildings,
            EconomyDef economy)
        {
            var errors = new List<string>();
            var currencyIds = Ids(currencies.Select(c => c.Id), "currency", errors);
            var statIds = Ids(stats.Select(s => s.Id), "stat", errors);
            Ids(buildings.Select(b => b.Id), "building", errors);
            var byId = buildings.Where(b => !string.IsNullOrEmpty(b.Id)).GroupBy(b => b.Id).ToDictionary(g => g.Key, g => g.First());

            if (!currencyIds.Contains(Currencies.Cash)) errors.Add($"Currency '{Currencies.Cash}' must be defined.");
            if (!statIds.Contains(Stats.ConstructionCrews)) errors.Add($"Stat '{Stats.ConstructionCrews}' must be defined.");

            var hqs = buildings.Where(b => b.IsHeadquarters).ToList();
            if (hqs.Count != 1) errors.Add($"Exactly one building must be the headquarters (found {hqs.Count}).");
            var hq = hqs.Count == 1 ? hqs[0] : null;
            int maxStadium = hq?.MaxLevel ?? 1;

            foreach (var b in buildings) ValidateBuilding(b, maxStadium, currencyIds, statIds, economy, errors);
            foreach (var b in buildings) ValidateRequirements(b, byId, errors);
            ValidateEconomy(economy, byId, hq, currencyIds, errors);
            return errors;
        }

        static HashSet<string> Ids(IEnumerable<string> ids, string kind, List<string> errors)
        {
            var set = new HashSet<string>();
            foreach (var id in ids)
            {
                if (string.IsNullOrWhiteSpace(id)) { errors.Add($"A {kind} has no id."); continue; }
                if (!set.Add(id)) errors.Add($"Duplicate {kind} id '{id}'.");
            }
            return set;
        }

        static void ValidateBuilding(BuildingDef b, int maxStadium, HashSet<string> currencyIds, HashSet<string> statIds,
            EconomyDef economy, List<string> errors)
        {
            string where = $"Building '{b.Id}'";
            if (string.IsNullOrWhiteSpace(b.Name)) errors.Add($"{where} has no name.");
            if (b.MaxLevel < 1) { errors.Add($"{where} must have maxLevel >= 1."); return; }
            if (b.FootprintWidth < 1 || b.FootprintHeight < 1) errors.Add($"{where} has an empty footprint.");
            if (economy?.Site != null && (b.FootprintWidth > economy.Site.Width || b.FootprintHeight > economy.Site.Height))
                errors.Add($"{where} is larger than the site.");
            if (!currencyIds.Contains(b.CostCurrency ?? "")) errors.Add($"{where} costs unknown currency '{b.CostCurrency}'.");

            // Building a new one may cost more than its first upgrade, so prices only need to rise from level 2.
            CheckCurve(b.Cost, b.MaxLevel, $"{where} cost", errors, allowZero: true, nonDecreasingFrom: 2);
            CheckCurve(b.BuildSeconds, b.MaxLevel, $"{where} buildSeconds", errors, allowZero: true, nonDecreasingFrom: 0);

            if (b.IsHeadquarters)
            {
                if (b.LevelCaps != null && b.LevelCaps.Count > 0) errors.Add($"{where} is the headquarters; it has no level caps.");
                if (b.Limits == null || b.Limits.Count != 1 || b.Limits[0].Count != 1 || b.Limits[0].StadiumLevel != 1)
                    errors.Add($"{where}: the club has exactly one headquarters from the start.");
            }
            else
            {
                ValidateSteps(b.LevelCaps?.Select(c => (c.StadiumLevel, c.MaxLevel)).ToList(), "levelCaps", where, maxStadium, errors);
                ValidateSteps(b.Limits?.Select(c => (c.StadiumLevel, c.Count)).ToList(), "limits", where, maxStadium, errors);
                if (b.LevelCaps != null && b.LevelCaps.Count > 0)
                {
                    var last = b.LevelCaps[b.LevelCaps.Count - 1].MaxLevel;
                    if (last > b.MaxLevel) errors.Add($"{where} caps level {last} but only has {b.MaxLevel} levels.");
                    if (last < b.MaxLevel) errors.Add($"{where} levels {last + 1}-{b.MaxLevel} are never opened by any Stadium level.");
                    if (b.Limits != null && b.Limits.Count > 0 && b.Limits[0].StadiumLevel != b.LevelCaps[0].StadiumLevel)
                        errors.Add($"{where} becomes available at Stadium {b.Limits[0].StadiumLevel} but its first level cap is at Stadium {b.LevelCaps[0].StadiumLevel}; make them agree.");
                }
            }

            foreach (var grant in b.Stats ?? new List<StatGrant>())
            {
                if (!statIds.Contains(grant.Stat ?? "")) errors.Add($"{where} grants unknown stat '{grant.Stat}'.");
                CheckCurve(grant.Value, b.MaxLevel, $"{where} stat '{grant.Stat}'", errors, allowZero: true, nonDecreasingFrom: 1);
            }
            if (b.Stats != null && b.Stats.GroupBy(s => s.Stat).Any(g => g.Count() > 1)) errors.Add($"{where} grants the same stat twice.");

            if (b.Producer != null)
            {
                if (!currencyIds.Contains(b.Producer.Currency ?? "")) errors.Add($"{where} produces unknown currency '{b.Producer.Currency}'.");
                CheckCurve(b.Producer.AmountPerCycle, b.MaxLevel, $"{where} amountPerCycle", errors, allowZero: false, nonDecreasingFrom: 1);
                CheckCurve(b.Producer.CycleSeconds, b.MaxLevel, $"{where} cycleSeconds", errors, allowZero: false, nonDecreasingFrom: 0);
                CheckCurve(b.Producer.Capacity, b.MaxLevel, $"{where} capacity", errors, allowZero: false, nonDecreasingFrom: 1);
                if (b.Producer.AmountPerCycle != null && b.Producer.Capacity != null)
                    for (int level = 1; level <= b.MaxLevel; level++)
                        if (SafeEval(b.Producer.Capacity, level) < SafeEval(b.Producer.AmountPerCycle, level))
                        { errors.Add($"{where} level {level} holds less than one cycle's takings."); break; }
            }
        }

        /// <summary>A step table keyed by Stadium level: sorted, values rising, within the Stadium's range.</summary>
        static void ValidateSteps(List<(int stadium, int value)> steps, string name, string where, int maxStadium, List<string> errors)
        {
            if (steps == null || steps.Count == 0) { errors.Add($"{where} has no {name}, so it can never be built."); return; }
            for (int i = 0; i < steps.Count; i++)
            {
                if (steps[i].stadium < 1 || steps[i].stadium > maxStadium) errors.Add($"{where} {name} refers to Stadium level {steps[i].stadium}, which does not exist.");
                if (steps[i].value < 1) errors.Add($"{where} {name} entry {i} must be at least 1.");
                if (i > 0 && steps[i].stadium <= steps[i - 1].stadium) errors.Add($"{where} {name} must be sorted by Stadium level.");
                if (i > 0 && steps[i].value <= steps[i - 1].value) errors.Add($"{where} {name} must increase at every step.");
            }
        }

        /// <summary>
        /// Every "building X at level Y" requirement must be satisfiable by the time the level that needs it opens;
        /// otherwise the club is stuck forever. For the Stadium, level N's requirements must be reachable at N-1.
        /// </summary>
        static void ValidateRequirements(BuildingDef b, Dictionary<string, BuildingDef> byId, List<string> errors)
        {
            string where = $"Building '{b.Id}'";
            foreach (var req in b.LevelRequirements ?? new List<LevelRequirement>())
            {
                if (req.AtLevel < 1 || req.AtLevel > b.MaxLevel) { errors.Add($"{where} has a requirement at invalid level {req.AtLevel}."); continue; }
                if (req.Building == b.Id) { errors.Add($"{where} cannot require itself."); continue; }
                if (!byId.TryGetValue(req.Building ?? "", out var other)) { errors.Add($"{where} requires unknown building '{req.Building}'."); continue; }
                if (other.IsHeadquarters) { errors.Add($"{where}: Stadium levels gate buildings through levelCaps, not levelRequirements."); continue; }
                if (req.Level < 1 || req.Level > other.MaxLevel) { errors.Add($"{where} requires {req.Building} level {req.Level}, which does not exist."); continue; }

                int availableStadium = b.IsHeadquarters ? req.AtLevel - 1 : ContentDb.RequiredStadium(b, req.AtLevel);
                int needed = ContentDb.RequiredStadium(other, req.Level);
                if (needed > availableStadium)
                    errors.Add($"{where} level {req.AtLevel} requires {other.Id} level {req.Level}, which needs Stadium {(needed == int.MaxValue ? "(never)" : needed.ToString())}. Unreachable.");
            }
        }

        static void ValidateEconomy(EconomyDef e, Dictionary<string, BuildingDef> byId, BuildingDef hq, HashSet<string> currencyIds, List<string> errors)
        {
            if (e == null) { errors.Add("Economy is missing."); return; }
            int maxStadium = hq?.MaxLevel ?? 1;

            foreach (var kv in e.StartingWallet)
            {
                if (!currencyIds.Contains(kv.Key)) errors.Add($"Starting wallet has unknown currency '{kv.Key}'.");
                if (kv.Value < 0 || kv.Value > Money.MaxBalance) errors.Add($"Starting wallet {kv.Key} must be between 0 and the economy ceiling.");
            }

            // Ledger categories.
            var categoryKinds = new Dictionary<string, string>();
            foreach (var c in e.LedgerCategories ?? new List<LedgerCategoryDef>())
            {
                if (string.IsNullOrWhiteSpace(c.Id) || string.IsNullOrWhiteSpace(c.Name)) { errors.Add("A ledger category needs an id and a name."); continue; }
                if (c.Kind != "income" && c.Kind != "expense") errors.Add($"Ledger category '{c.Id}' must be income or expense.");
                if (categoryKinds.ContainsKey(c.Id)) errors.Add($"Duplicate ledger category '{c.Id}'.");
                categoryKinds[c.Id] = c.Kind;
            }
            RequireCategory(categoryKinds, LedgerCategories.Construction, "expense", errors);
            RequireCategory(categoryKinds, LedgerCategories.Refunds, "income", errors);
            if (e.StadiumRewards.Count > 0) RequireCategory(categoryKinds, LedgerCategories.Rewards, "income", errors);
            foreach (var b in byId.Values)
                if (b.Producer != null)
                {
                    if (!categoryKinds.TryGetValue(b.Producer.IncomeCategory ?? "", out var kind))
                        errors.Add($"Building '{b.Id}' produces under unknown ledger category '{b.Producer.IncomeCategory}'.");
                    else if (kind != "income")
                        errors.Add($"Building '{b.Id}' produces under '{b.Producer.IncomeCategory}', which is not an income category.");
                }

            // Speed-ups and refunds.
            if (e.SpeedUpCost == null || e.SpeedUpCost.Count < 2) errors.Add("speedUpCost needs at least two points.");
            else
                for (int i = 1; i < e.SpeedUpCost.Count; i++)
                    if (e.SpeedUpCost[i].Seconds <= e.SpeedUpCost[i - 1].Seconds || e.SpeedUpCost[i].Cost < e.SpeedUpCost[i - 1].Cost)
                        errors.Add("speedUpCost points must increase in seconds and not decrease in cost.");
            if (e.CancelRefundPercent < 0 || e.CancelRefundPercent > 100) errors.Add("cancelRefundPercent must be 0..100.");
            if (e.FreeFinishSeconds < 0) errors.Add("freeFinishSeconds must not be negative.");

            // Chapters and rewards.
            for (int i = 0; i < e.Chapters.Count; i++)
            {
                var c = e.Chapters[i];
                if (string.IsNullOrWhiteSpace(c.Name)) errors.Add($"Chapter {i} has no name.");
                if (i == 0 && c.FromLevel != 1) errors.Add("The first chapter must start at Stadium level 1.");
                if (i > 0 && c.FromLevel <= e.Chapters[i - 1].FromLevel) errors.Add("Chapters must be sorted by fromLevel.");
                if (c.FromLevel > maxStadium) errors.Add($"Chapter '{c.Name}' starts beyond the Stadium's max level.");
            }
            foreach (var r in e.StadiumRewards)
            {
                if (r.Level < 2 || r.Level > maxStadium) errors.Add($"Stadium reward at level {r.Level} can never be earned.");
                foreach (var kv in r.Currencies)
                {
                    if (!currencyIds.Contains(kv.Key)) errors.Add($"Stadium reward at level {r.Level} pays unknown currency '{kv.Key}'.");
                    if (kv.Value <= 0 || kv.Value > Money.MaxBalance) errors.Add($"Stadium reward at level {r.Level} must pay a positive amount within the ceiling.");
                }
            }
            if (e.StadiumRewards.GroupBy(r => r.Level).Any(g => g.Count() > 1)) errors.Add("Each Stadium level may have only one reward entry.");

            // The site and the land that opens up.
            var site = e.Site;
            if (site == null || site.Areas == null || site.Areas.Count == 0) { errors.Add("The site needs at least one buildable area."); return; }
            var whole = new RectDef { X = 0, Y = 0, Width = site.Width, Height = site.Height };
            for (int i = 0; i < site.Areas.Count; i++)
            {
                var a = site.Areas[i];
                if (a.Area == null) { errors.Add($"Site area {i} has no rectangle."); return; }
                if (i == 0 && a.StadiumLevel != 1) errors.Add("The first site area must be for Stadium level 1.");
                if (i > 0 && a.StadiumLevel <= site.Areas[i - 1].StadiumLevel) errors.Add("Site areas must be sorted by Stadium level.");
                if (a.StadiumLevel > maxStadium) errors.Add($"Site area for Stadium {a.StadiumLevel} can never open.");
                if (!whole.Contains(a.Area)) errors.Add($"Site area for Stadium {a.StadiumLevel} lies outside the site.");
                if (i > 0 && site.Areas[i - 1].Area != null && !a.Area.Contains(site.Areas[i - 1].Area))
                    errors.Add($"Site area for Stadium {a.StadiumLevel} must contain the area before it; land is never taken away.");
            }

            bool hasHq = false;
            var occupied = new HashSet<(int, int)>();
            var startArea = site.AreaAt(1);
            foreach (var sb in e.StartingBuildings)
            {
                if (!byId.TryGetValue(sb.Building ?? "", out var def)) { errors.Add($"Starting building '{sb.Building}' is unknown."); continue; }
                if (def.IsHeadquarters) hasHq = true;
                if (sb.Level < 1 || sb.Level > def.MaxLevel) errors.Add($"Starting building '{sb.Building}' has invalid level {sb.Level}.");
                if (!startArea.Contains(sb.X, sb.Y, def.FootprintWidth, def.FootprintHeight))
                    errors.Add($"Starting building '{sb.Building}' is outside the starting buildable area.");
                for (int x = sb.X; x < sb.X + def.FootprintWidth; x++)
                    for (int y = sb.Y; y < sb.Y + def.FootprintHeight; y++)
                        if (!occupied.Add((x, y))) errors.Add($"Starting building '{sb.Building}' overlaps another at ({x},{y}).");
            }
            if (!hasHq) errors.Add("The club must start with its headquarters.");
        }

        static void RequireCategory(Dictionary<string, string> kinds, string id, string kind, List<string> errors)
        {
            if (!kinds.TryGetValue(id, out var actual)) errors.Add($"Ledger category '{id}' must be defined.");
            else if (actual != kind) errors.Add($"Ledger category '{id}' must be {kind}.");
        }

        static long SafeEval(Curve c, int level)
        {
            try { return c.Evaluate(level); } catch (System.ArgumentOutOfRangeException) { return 0; }
        }

        /// <param name="nonDecreasingFrom">The first level from which values must never fall; 0 for no check.</param>
        static void CheckCurve(Curve curve, int maxLevel, string what, List<string> errors, bool allowZero, int nonDecreasingFrom)
        {
            if (curve == null) { errors.Add($"{what} is missing."); return; }
            if (curve.ExplicitCount > maxLevel) { errors.Add($"{what} lists {curve.ExplicitCount} values but there are only {maxLevel} levels."); return; }
            if (curve.ExplicitCount < maxLevel && !curve.HasFormula)
            {
                errors.Add($"{what} lists {curve.ExplicitCount} values but there are {maxLevel} levels, and no formula continues it.");
                return;
            }
            if (curve.HasFormula && curve.Growth <= 0) { errors.Add($"{what} growth must be positive."); return; }

            long previous = long.MinValue;
            for (int level = 1; level <= maxLevel; level++)
            {
                long v = curve.Evaluate(level);
                if (v < 0 || (!allowZero && v == 0)) { errors.Add($"{what} level {level} is {v}."); return; }
                if (v > Money.MaxBalance) { errors.Add($"{what} level {level} is {v}, above the £999bn economy ceiling."); return; }
                if (nonDecreasingFrom > 0 && level > nonDecreasingFrom && v < previous) { errors.Add($"{what} decreases at level {level}."); return; }
                previous = v;
            }
        }
    }
}
