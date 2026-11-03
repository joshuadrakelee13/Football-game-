using FCE.Core.State;

namespace FCE.Core.Systems
{
    /// <summary>Buildings that generate currency over time. (Implemented in the next step.)</summary>
    internal static class ProductionSystem
    {
        public static void OnConstructionStarted(GameContext ctx, BuildingState building) { }
        public static void OnConstructionEnded(GameContext ctx, BuildingState building) { }
        public static void TickAll(GameContext ctx, long time) { }
    }
}
