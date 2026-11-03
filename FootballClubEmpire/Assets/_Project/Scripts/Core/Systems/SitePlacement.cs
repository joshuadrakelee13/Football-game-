using FCE.Core.Content;

namespace FCE.Core.Systems
{
    /// <summary>Where buildings may stand: inside the buildable area and not on top of each other.</summary>
    internal static class SitePlacement
    {
        public static string Check(GameContext ctx, BuildingDef def, int x, int y, int ignoreBuildingId)
        {
            var area = ctx.Content.Economy.Site.AreaAt(ctx.StadiumLevel);
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

        /// <summary>
        /// The first free spot for a building, scanning outward from the centre of the buildable area so new
        /// buildings cluster around the ground rather than in a corner. Null if nowhere fits.
        /// </summary>
        public static (int x, int y)? FindSpot(GameContext ctx, BuildingDef def)
        {
            var area = ctx.Content.Economy.Site.AreaAt(ctx.StadiumLevel);
            int cx = area.X + area.Width / 2, cy = area.Y + area.Height / 2;
            (int, int)? best = null;
            long bestDistance = long.MaxValue;
            for (int y = area.Y; y + def.FootprintHeight <= area.Y + area.Height; y++)
                for (int x = area.X; x + def.FootprintWidth <= area.X + area.Width; x++)
                {
                    long dx = x + def.FootprintWidth / 2 - cx, dy = y + def.FootprintHeight / 2 - cy;
                    long distance = dx * dx + dy * dy;
                    if (distance >= bestDistance) continue;
                    if (Check(ctx, def, x, y, 0) != null) continue;
                    best = (x, y);
                    bestDistance = distance;
                }
            return best;
        }
    }
}
