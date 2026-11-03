using System.Collections.Generic;
using System.Linq;
using FCE.Core.Economy;

namespace FCE.Core.Content
{
    /// <summary>
    /// Checks authored content for mistakes that would otherwise surface as a broken game:
    /// dangling references, curves of the wrong length, levels that can never be reached, overlapping start buildings.
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
            var buildingIds = Ids(buildings.Select(b => b.Id), "building", errors);
            var byId = buildings.Where(b => !string.IsNullOrEmpty(b.Id)).GroupBy(b => b.Id).ToDictionary(g => g.Key, g => g.First());

            if (!currencyIds.Contains(Currencies.Cash)) errors.Add($"Currency '{Currencies.Cash}' must be defined.");
            if (!statIds.Contains(Stats.ConstructionCrews)) errors.Add($"Stat '{Stats.ConstructionCrews}' must be defined.");

            var hqs = buildings.Where(b => b.IsHeadquarters).ToList();
            if (hqs.Count != 1) errors.Add($"Exactly one building must be the headquarters (found {hqs.Count}).");
            var hq = hqs.Count == 1 ? hqs[0] : null;

            foreach (var b in buildings) ValidateBuilding(b, hq, byId, currencyIds, statIds, economy, errors);
            if (hq != null) ValidateHeadquartersProgression(hq, byId, errors);
            ValidateEconomy(economy, byId, currencyIds, errors);
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

        static void ValidateBuilding(BuildingDef b, BuildingDef hq, Dictionary<string, BuildingDef> byId,
            HashSet<string> currencyIds, HashSet<string> statIds, EconomyDef economy, List<string> errors)
        {
            string where = $"Building '{b.Id}'";
            if (string.IsNullOrWhiteSpace(b.Name)) errors.Add($"{where} has no name.");
            if (b.MaxLevel < 1) { errors.Add($"{where} must have maxLevel >= 1."); return; }
            if (b.FootprintWidth < 1 || b.FootprintHeight < 1) errors.Add($"{where} has an empty footprint.");
            if (economy?.Site != null && (b.FootprintWidth > economy.Site.Width || b.FootprintHeight > economy.Site.Height))
                errors.Add($"{where} is larger than the site.");
            if (!currencyIds.Contains(b.CostCurrency ?? "")) errors.Add($"{where} costs unknown currency '{b.CostCurrency}'.");

            CheckCurve(b.Cost, b.MaxLevel, $"{where} cost", errors, allowZero: true, nonDecreasing: true);
            CheckCurve(b.BuildSeconds, b.MaxLevel, $"{where} buildSeconds", errors, allowZero: true, nonDecreasing: false);

            if (b.IsHeadquarters)
            {
                if (b.RequiredClubhouse != null) errors.Add($"{where} is the headquarters and cannot require a Clubhouse level.");
            }
            else if (b.RequiredClubhouse == null || b.RequiredClubhouse.Length != b.MaxLevel)
            {
                errors.Add($"{where} needs requiredClubhouse with exactly {b.MaxLevel} entries.");
            }
            else
            {
                for (int i = 0; i < b.RequiredClubhouse.Length; i++)
                {
                    int r = b.RequiredClubhouse[i];
                    if (r < 1) errors.Add($"{where} level {i + 1} requires Clubhouse level {r}; minimum is 1.");
                    if (hq != null && r > hq.MaxLevel) errors.Add($"{where} level {i + 1} requires Clubhouse {r}, above its max {hq.MaxLevel}.");
                    if (i > 0 && r < b.RequiredClubhouse[i - 1]) errors.Add($"{where} requiredClubhouse must not decrease (level {i + 1}).");
                }
            }

            foreach (var req in b.LevelRequirements ?? new List<LevelRequirement>())
            {
                if (req.AtLevel < 1 || req.AtLevel > b.MaxLevel) errors.Add($"{where} has a requirement at invalid level {req.AtLevel}.");
                if (req.Building == b.Id) errors.Add($"{where} cannot require itself.");
                if (!byId.TryGetValue(req.Building ?? "", out var other)) { errors.Add($"{where} requires unknown building '{req.Building}'."); continue; }
                if (req.Level < 1 || req.Level > other.MaxLevel) errors.Add($"{where} requires {req.Building} level {req.Level}, which does not exist.");
                if (other.IsHeadquarters) errors.Add($"{where}: use requiredClubhouse, not levelRequirements, for the Clubhouse.");
            }

            if (b.Limits == null || b.Limits.Count == 0) errors.Add($"{where} has no count limits, so it can never be built.");
            else
            {
                for (int i = 0; i < b.Limits.Count; i++)
                {
                    if (b.Limits[i].Count < 1) errors.Add($"{where} limit {i} has count < 1.");
                    if (i > 0 && b.Limits[i].ClubhouseLevel <= b.Limits[i - 1].ClubhouseLevel) errors.Add($"{where} limits must be sorted by clubhouseLevel.");
                    if (i > 0 && b.Limits[i].Count <= b.Limits[i - 1].Count) errors.Add($"{where} limits must increase the count.");
                }
                if (b.IsHeadquarters && (b.Limits.Count != 1 || b.Limits[0].Count != 1)) errors.Add($"{where}: the club has exactly one headquarters.");
                if (!b.IsHeadquarters && b.RequiredClubhouse != null && b.RequiredClubhouse.Length > 0 && b.Limits[0].ClubhouseLevel > b.RequiredClubhouse[0])
                    errors.Add($"{where} level 1 needs Clubhouse {b.RequiredClubhouse[0]} but cannot be owned until Clubhouse {b.Limits[0].ClubhouseLevel}; make them agree.");
            }

            foreach (var grant in b.Stats ?? new List<StatGrant>())
            {
                if (!statIds.Contains(grant.Stat ?? "")) errors.Add($"{where} grants unknown stat '{grant.Stat}'.");
                CheckCurve(grant.Value, b.MaxLevel, $"{where} stat '{grant.Stat}'", errors, allowZero: true, nonDecreasing: true);
            }
            if (b.Stats != null && b.Stats.GroupBy(s => s.Stat).Any(g => g.Count() > 1)) errors.Add($"{where} grants the same stat twice.");

            if (b.Producer != null)
            {
                if (!currencyIds.Contains(b.Producer.Currency ?? "")) errors.Add($"{where} produces unknown currency '{b.Producer.Currency}'.");
                CheckCurve(b.Producer.AmountPerCycle, b.MaxLevel, $"{where} amountPerCycle", errors, allowZero: false, nonDecreasing: true);
                CheckCurve(b.Producer.CycleSeconds, b.MaxLevel, $"{where} cycleSeconds", errors, allowZero: false, nonDecreasing: false);
                CheckCurve(b.Producer.Capacity, b.MaxLevel, $"{where} capacity", errors, allowZero: false, nonDecreasing: true);
                if (b.Producer.AmountPerCycle != null && b.Producer.Capacity != null)
                    for (int level = 1; level <= b.MaxLevel; level++)
                        if (SafeEval(b.Producer.Capacity, level) < SafeEval(b.Producer.AmountPerCycle, level))
                        { errors.Add($"{where} level {level} holds less than one cycle's takings."); break; }
            }
        }

        /// <summary>
        /// Clubhouse level N may require other buildings, but only ones that can be built and levelled
        /// with Clubhouse N-1, otherwise the club is stuck forever.
        /// </summary>
        static void ValidateHeadquartersProgression(BuildingDef hq, Dictionary<string, BuildingDef> byId, List<string> errors)
        {
            foreach (var req in hq.LevelRequirements ?? new List<LevelRequirement>())
            {
                if (!byId.TryGetValue(req.Building ?? "", out var other) || other.RequiredClubhouse == null) continue;
                if (req.Level < 1 || req.Level > other.RequiredClubhouse.Length) continue;
                int available = req.AtLevel - 1;
                int needed = other.RequiredClubhouse[req.Level - 1];
                if (needed > available)
                    errors.Add($"Clubhouse level {req.AtLevel} requires {other.Id} level {req.Level}, which itself needs Clubhouse {needed}. Unreachable.");
                if (other.Limits != null && other.Limits.Count > 0 && other.Limits[0].ClubhouseLevel > available)
                    errors.Add($"Clubhouse level {req.AtLevel} requires {other.Id}, which cannot be owned until Clubhouse {other.Limits[0].ClubhouseLevel}. Unreachable.");
            }
        }

        static void ValidateEconomy(EconomyDef e, Dictionary<string, BuildingDef> byId, HashSet<string> currencyIds, List<string> errors)
        {
            if (e == null) { errors.Add("Economy is missing."); return; }
            foreach (var kv in e.StartingWallet)
            {
                if (!currencyIds.Contains(kv.Key)) errors.Add($"Starting wallet has unknown currency '{kv.Key}'.");
                if (kv.Value < 0 || kv.Value > Money.MaxBalance) errors.Add($"Starting wallet {kv.Key} must be between 0 and the economy ceiling.");
            }

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
            foreach (var b in byId.Values)
                if (b.Producer != null)
                {
                    if (!categoryKinds.TryGetValue(b.Producer.IncomeCategory ?? "", out var kind))
                        errors.Add($"Building '{b.Id}' produces under unknown ledger category '{b.Producer.IncomeCategory}'.");
                    else if (kind != "income")
                        errors.Add($"Building '{b.Id}' produces under '{b.Producer.IncomeCategory}', which is not an income category.");
                }

            if (e.SpeedUpCost == null || e.SpeedUpCost.Count < 2) errors.Add("speedUpCost needs at least two points.");
            else
                for (int i = 1; i < e.SpeedUpCost.Count; i++)
                    if (e.SpeedUpCost[i].Seconds <= e.SpeedUpCost[i - 1].Seconds || e.SpeedUpCost[i].Cost < e.SpeedUpCost[i - 1].Cost)
                        errors.Add("speedUpCost points must increase in seconds and not decrease in cost.");

            if (e.CancelRefundPercent < 0 || e.CancelRefundPercent > 100) errors.Add("cancelRefundPercent must be 0..100.");
            if (e.FreeFinishSeconds < 0) errors.Add("freeFinishSeconds must not be negative.");

            var site = e.Site;
            if (site == null || site.BuildableArea == null) { errors.Add("Site and buildableArea are required."); return; }
            if (!new RectDef { X = 0, Y = 0, Width = site.Width, Height = site.Height }
                    .Contains(site.BuildableArea.X, site.BuildableArea.Y, site.BuildableArea.Width, site.BuildableArea.Height))
                errors.Add("buildableArea must lie within the site.");

            bool hasHq = false;
            var occupied = new HashSet<(int, int)>();
            foreach (var sb in e.StartingBuildings)
            {
                if (!byId.TryGetValue(sb.Building ?? "", out var def)) { errors.Add($"Starting building '{sb.Building}' is unknown."); continue; }
                if (def.IsHeadquarters) hasHq = true;
                if (sb.Level < 1 || sb.Level > def.MaxLevel) errors.Add($"Starting building '{sb.Building}' has invalid level {sb.Level}.");
                if (!site.BuildableArea.Contains(sb.X, sb.Y, def.FootprintWidth, def.FootprintHeight))
                    errors.Add($"Starting building '{sb.Building}' is outside the buildable area.");
                for (int x = sb.X; x < sb.X + def.FootprintWidth; x++)
                    for (int y = sb.Y; y < sb.Y + def.FootprintHeight; y++)
                        if (!occupied.Add((x, y))) errors.Add($"Starting building '{sb.Building}' overlaps another at ({x},{y}).");
            }
            if (!hasHq) errors.Add("The club must start with its headquarters.");
        }

        static long SafeEval(Curve c, int level)
        {
            try { return c.Evaluate(level); } catch (System.ArgumentOutOfRangeException) { return 0; }
        }

        static void RequireCategory(Dictionary<string, string> kinds, string id, string kind, List<string> errors)
        {
            if (!kinds.TryGetValue(id, out var actual)) errors.Add($"Ledger category '{id}' must be defined.");
            else if (actual != kind) errors.Add($"Ledger category '{id}' must be {kind}.");
        }

        static void CheckCurve(Curve curve, int maxLevel, string what, List<string> errors, bool allowZero, bool nonDecreasing)
        {
            if (curve == null) { errors.Add($"{what} is missing."); return; }
            if (curve.IsExplicit && curve.Values.Length != maxLevel)
            {
                errors.Add($"{what} lists {curve.Values.Length} values but there are {maxLevel} levels.");
                return;
            }
            if (!curve.IsExplicit && curve.Growth <= 0) { errors.Add($"{what} growth must be positive."); return; }

            long previous = long.MinValue;
            for (int level = 1; level <= maxLevel; level++)
            {
                long v = curve.Evaluate(level);
                if (v < 0 || (!allowZero && v == 0)) { errors.Add($"{what} level {level} is {v}."); return; }
                if (v > Money.MaxBalance) { errors.Add($"{what} level {level} is {v}, above the £999bn economy ceiling."); return; }
                if (nonDecreasing && v < previous) { errors.Add($"{what} decreases at level {level}."); return; }
                previous = v;
            }
        }
    }
}
