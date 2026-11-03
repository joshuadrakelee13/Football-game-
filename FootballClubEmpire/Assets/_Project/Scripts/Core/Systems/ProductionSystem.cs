using System.Collections.Generic;
using FCE.Core.State;

namespace FCE.Core.Systems
{
    /// <summary>
    /// Buildings that earn money in cycles (£5 every 5 seconds). Takings wait in the building until collected,
    /// and a full building stops earning. Production pauses while the building itself is being upgraded.
    /// All arithmetic is whole numbers, and splitting time into any number of ticks gives the same result as one tick.
    /// </summary>
    internal static class ProductionSystem
    {
        /// <summary>Advances every producer to <paramref name="time"/>. Returns what was earned, by currency.</summary>
        public static Dictionary<string, long> TickAll(GameContext ctx, long time)
        {
            Dictionary<string, long> earned = null;
            foreach (var building in ctx.State.Buildings)
            {
                if (building.Producer == null) continue;
                long gained = Tick(ctx, building, time);
                if (gained <= 0) continue;
                string currency = ctx.Content.GetBuilding(building.Def).Producer.Currency;
                if (earned == null) earned = new Dictionary<string, long>();
                earned[currency] = (earned.TryGetValue(currency, out var v) ? v : 0) + gained;
            }
            return earned;
        }

        static long Tick(GameContext ctx, BuildingState building, long time)
        {
            var p = building.Producer;
            long elapsed = time - p.LastTick;
            if (elapsed <= 0) return 0;
            p.LastTick = time;
            if (building.Level < 1 || building.IsUnderConstruction) return 0;

            var level = ctx.Content.GetLevel(building.Def, building.Level);
            if (p.Stored >= level.Capacity) { p.CycleProgress = 0; return 0; }

            long progress = p.CycleProgress + elapsed;
            long cycles = progress / level.CycleSeconds;
            p.CycleProgress = progress % level.CycleSeconds;
            if (cycles == 0) return 0;

            // Compare cycle counts rather than multiplying, so a building left for years cannot overflow.
            long room = level.Capacity - p.Stored;
            long cyclesToFill = (room + level.AmountPerCycle - 1) / level.AmountPerCycle;
            long gained = cycles >= cyclesToFill ? room : cycles * level.AmountPerCycle;
            p.Stored += gained;
            if (p.Stored >= level.Capacity) p.CycleProgress = 0;
            return gained;
        }

        public static void OnConstructionStarted(GameContext ctx, BuildingState building)
        {
            if (building.Producer != null) building.Producer.LastTick = ctx.State.Now;
        }

        public static void OnConstructionEnded(GameContext ctx, BuildingState building)
        {
            if (building.Level < 1) return;
            if (building.Producer == null && ctx.Content.GetBuilding(building.Def).Producer != null)
                building.Producer = new ProducerState();
            if (building.Producer != null) building.Producer.LastTick = ctx.State.Now;
        }

        // ---- Collecting --------------------------------------------------------------------------------------

        public static CommandResult Collect(GameContext ctx, int buildingId)
        {
            var building = ctx.FindBuilding(buildingId);
            if (building == null) return CommandResult.Fail(Errors.NotFound);
            if (building.Producer == null || building.Producer.Stored <= 0) return CommandResult.Fail(Errors.NothingToCollect);
            CollectFrom(ctx, building);
            return CommandResult.Success(buildingId);
        }

        /// <summary>Collects from every producer with takings waiting. Fails only if there was nothing anywhere.</summary>
        public static CommandResult CollectAll(GameContext ctx)
        {
            bool any = false;
            foreach (var building in ctx.State.Buildings)
                if (building.Producer != null && building.Producer.Stored > 0) { CollectFrom(ctx, building); any = true; }
            return any ? CommandResult.Success() : CommandResult.Fail(Errors.NothingToCollect);
        }

        static void CollectFrom(GameContext ctx, BuildingState building)
        {
            var def = ctx.Content.GetBuilding(building.Def).Producer;
            var p = building.Producer;
            // The game was advanced to now before this command, so a full building has been idling with its cycle
            // reset; emptying it restarts earning from this moment, not from when it filled.
            // At the economy ceiling the wallet accepts less than was offered; the rest stays in the building.
            long added = ctx.Credit(def.Currency, p.Stored, def.IncomeCategory);
            p.Stored -= added;
            if (added > 0) ctx.Raise(new TakingsCollected(ctx.State.Now, building.Id, def.Currency, added));
        }
    }
}
