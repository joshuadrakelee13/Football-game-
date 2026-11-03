using System;
using System.Collections.Generic;
using System.Linq;
using FCE.Core.Content;
using FCE.Core.State;

namespace FCE.Core.Systems
{
    /// <summary>
    /// Placing buildings and upgrading them on real-time timers. Every project occupies one construction crew
    /// from start to completion. Completion happens only through <see cref="CompleteDue"/>, driven by the timeline,
    /// so a project finishes at exactly the right moment whether the game was open or not.
    /// </summary>
    internal static class ConstructionSystem
    {
        // ---- Placement ----------------------------------------------------------------------------------------

        public static string ValidatePlace(GameContext ctx, string defId, int x, int y)
        {
            if (defId == null || !ctx.Content.Buildings.TryGetValue(defId, out var def)) return Errors.UnknownBuilding;
            if (ctx.CountOwned(defId) >= ctx.Content.AllowedCount(defId, ctx.ClubhouseLevel)) return Errors.LimitReached;

            var first = ctx.Content.GetLevel(defId, 1);
            string requirement = CheckRequirements(ctx, def, first);
            if (requirement != null) return requirement;

            string position = SitePlacement.Check(ctx, def, x, y, ignoreBuildingId: 0);
            if (position != null) return position;

            if (ctx.FreeCrews < 1) return Errors.NoFreeCrew;
            if (!ctx.State.Wallet.CanAfford(def.CostCurrency, first.Cost)) return Errors.NotEnoughCurrency;
            return null;
        }

        public static CommandResult Place(GameContext ctx, string defId, int x, int y)
        {
            string error = ValidatePlace(ctx, defId, x, y);
            if (error != null) return CommandResult.Fail(error);

            var def = ctx.Content.GetBuilding(defId);
            var building = new BuildingState
            {
                Id = ctx.State.NextBuildingId++,
                Def = defId,
                Level = 0,
                X = x,
                Y = y,
            };
            ctx.State.Buildings.Add(building);
            ctx.Raise(new BuildingPlaced(ctx.State.Now, building.Id, defId, x, y));
            Begin(ctx, building, def, 1);
            return CommandResult.Success(building.Id);
        }

        // ---- Upgrades -----------------------------------------------------------------------------------------

        public static string ValidateUpgrade(GameContext ctx, int buildingId)
        {
            var building = ctx.FindBuilding(buildingId);
            if (building == null) return Errors.NotFound;
            if (building.IsUnderConstruction) return Errors.AlreadyUnderConstruction;
            var def = ctx.Content.GetBuilding(building.Def);
            if (building.Level >= def.MaxLevel) return Errors.MaxLevel;

            var next = ctx.Content.GetLevel(def.Id, building.Level + 1);
            string requirement = CheckRequirements(ctx, def, next);
            if (requirement != null) return requirement;

            if (ctx.FreeCrews < 1) return Errors.NoFreeCrew;
            if (!ctx.State.Wallet.CanAfford(def.CostCurrency, next.Cost)) return Errors.NotEnoughCurrency;
            return null;
        }

        public static CommandResult StartUpgrade(GameContext ctx, int buildingId)
        {
            string error = ValidateUpgrade(ctx, buildingId);
            if (error != null) return CommandResult.Fail(error);

            var building = ctx.FindBuilding(buildingId);
            Begin(ctx, building, ctx.Content.GetBuilding(building.Def), building.Level + 1);
            return CommandResult.Success(buildingId);
        }

        /// <summary>Clubhouse level, then other-building requirements. Returns the first unmet one, or null.</summary>
        static string CheckRequirements(GameContext ctx, BuildingDef def, BuildingLevel level)
        {
            if (!def.IsHeadquarters && ctx.ClubhouseLevel < level.RequiredClubhouse) return Errors.ClubhouseTooLow;
            foreach (var req in level.Requirements)
                if (ctx.HighestLevel(req.Building) < req.Level) return Errors.RequirementNotMet;
            return null;
        }

        static void Begin(GameContext ctx, BuildingState building, BuildingDef def, int targetLevel)
        {
            var level = ctx.Content.GetLevel(def.Id, targetLevel);
            ctx.Debit(def.CostCurrency, level.Cost);
            building.Construction = new ConstructionState
            {
                TargetLevel = targetLevel,
                StartedAt = ctx.State.Now,
                EndsAt = ctx.State.Now + level.BuildSeconds,
                Paid = level.Cost,
                PaidCurrency = def.CostCurrency,
            };
            ProductionSystem.OnConstructionStarted(ctx, building);
            ctx.Raise(new UpgradeStarted(ctx.State.Now, building.Id, targetLevel, building.Construction.EndsAt, def.CostCurrency, level.Cost));

            // Zero-second levels (rare, but allowed in content) complete on the spot rather than waiting a tick.
            if (level.BuildSeconds <= 0) Complete(ctx, building);
        }

        // ---- Finishing early and cancelling -------------------------------------------------------------------

        public static long FinishNowCost(GameContext ctx, BuildingState building) =>
            Pricing.FinishNowCost(ctx.Content.Economy, Math.Max(0, building.Construction.EndsAt - ctx.State.Now));

        public static CommandResult FinishNow(GameContext ctx, int buildingId)
        {
            var building = ctx.FindBuilding(buildingId);
            if (building == null) return CommandResult.Fail(Errors.NotFound);
            if (!building.IsUnderConstruction) return CommandResult.Fail(Errors.NotUnderConstruction);

            long cost = FinishNowCost(ctx, building);
            if (!ctx.State.Wallet.CanAfford(Currencies.Credits, cost)) return CommandResult.Fail(Errors.NotEnoughCurrency);

            ctx.Debit(Currencies.Credits, cost);
            ctx.Raise(new UpgradeFinishedEarly(ctx.State.Now, buildingId, cost));
            Complete(ctx, building);
            return CommandResult.Success(buildingId);
        }

        public static CommandResult Cancel(GameContext ctx, int buildingId)
        {
            var building = ctx.FindBuilding(buildingId);
            if (building == null) return CommandResult.Fail(Errors.NotFound);
            if (!building.IsUnderConstruction) return CommandResult.Fail(Errors.NotUnderConstruction);

            var project = building.Construction;
            long refund = project.Paid * ctx.Content.Economy.CancelRefundPercent / 100;
            building.Construction = null;
            bool removed = building.Level == 0;
            if (removed) ctx.State.Buildings.Remove(building);
            else ProductionSystem.OnConstructionEnded(ctx, building);

            ctx.Credit(project.PaidCurrency, refund);
            ctx.Raise(new UpgradeCancelled(ctx.State.Now, buildingId, removed, project.PaidCurrency, refund));
            return CommandResult.Success(buildingId);
        }

        // ---- Completion (timeline-driven) ---------------------------------------------------------------------

        /// <summary>The earliest moment any project finishes, or null when nothing is being built.</summary>
        public static long? NextCompletion(GameState state)
        {
            long? next = null;
            foreach (var b in state.Buildings)
                if (b.Construction != null && (next == null || b.Construction.EndsAt < next)) next = b.Construction.EndsAt;
            return next;
        }

        /// <summary>Completes every project due at or before <paramref name="time"/>, earliest first, ties by building id.</summary>
        public static void CompleteDue(GameContext ctx, long time)
        {
            var due = new List<BuildingState>();
            foreach (var b in ctx.State.Buildings)
                if (b.Construction != null && b.Construction.EndsAt <= time) due.Add(b);
            foreach (var b in due.OrderBy(b => b.Construction.EndsAt).ThenBy(b => b.Id)) Complete(ctx, b);
        }

        static void Complete(GameContext ctx, BuildingState building)
        {
            building.Level = building.Construction.TargetLevel;
            building.Construction = null;
            ctx.InvalidateStats();
            ProductionSystem.OnConstructionEnded(ctx, building);
            ctx.Raise(new UpgradeCompleted(ctx.State.Now, building.Id, building.Def, building.Level));
        }
    }
}
