using FCE.Core.Content;

namespace FCE.Core.Systems
{
    /// <summary>Where buildings may stand: inside the buildable area and not on top of each other.</summary>
    internal static class SitePlacement
    {
        public static string Check(GameContext ctx, BuildingDef def, int x, int y, int ignoreBuildingId)
        {
            var area = ctx.Content.Economy.Site.BuildableArea;
            if (!area.Contains(x, y, def.FootprintWidth, def.FootprintHeight)) return Errors.InvalidPosition;

            foreach (var other in ctx.State.Buildings)
            {
                if (other.Id == ignoreBuildingId) continue;
                var otherDef = ctx.Content.GetBuilding(other.Def);
                bool overlaps =
                    x < other.X + otherDef.FootprintWidth && other.X < x + def.FootprintWidth &&
                    y < other.Y + otherDef.FootprintHeight && other.Y < y + def.FootprintHeight;
                if (overlaps) return Errors.Overlaps;
            }
            return null;
        }
    }
}
