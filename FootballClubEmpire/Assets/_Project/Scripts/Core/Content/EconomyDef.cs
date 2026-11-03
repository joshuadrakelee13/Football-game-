using System.Collections.Generic;

namespace FCE.Core.Content
{
    /// <summary>Global economy and world-layout settings, authored in Content/economy.json.</summary>
    public sealed class EconomyDef
    {
        public Dictionary<string, long> StartingWallet { get; set; } = new Dictionary<string, long>();
        public List<StartingBuilding> StartingBuildings { get; set; } = new List<StartingBuilding>();

        /// <summary>Remaining-time to premium-cost table for finishing construction instantly. Interpolated linearly.</summary>
        public List<SpeedUpPoint> SpeedUpCost { get; set; } = new List<SpeedUpPoint>();
        /// <summary>Upgrades with this many seconds or fewer remaining can be finished for free.</summary>
        public long FreeFinishSeconds { get; set; }
        /// <summary>Share of the cost returned when an upgrade is cancelled.</summary>
        public int CancelRefundPercent { get; set; } = 50;

        public SiteDef Site { get; set; } = new SiteDef();

        /// <summary>Every heading money can be earned or spent under. Producers and rules refer to these by id.</summary>
        public List<LedgerCategoryDef> LedgerCategories { get; set; } = new List<LedgerCategoryDef>();
    }

    public sealed class LedgerCategoryDef
    {
        public string Id { get; set; }
        public string Name { get; set; }
        /// <summary>"income" or "expense".</summary>
        public string Kind { get; set; }
    }

    public sealed class StartingBuilding
    {
        public string Building { get; set; }
        public int Level { get; set; } = 1;
        public int X { get; set; }
        public int Y { get; set; }
    }

    public sealed class SpeedUpPoint
    {
        public long Seconds { get; set; }
        public long Cost { get; set; }
    }

    /// <summary>The club grounds: a grid of tiles, of which a rectangle is initially usable.</summary>
    public sealed class SiteDef
    {
        public int Width { get; set; } = 40;
        public int Height { get; set; } = 40;
        public RectDef BuildableArea { get; set; } = new RectDef { X = 0, Y = 0, Width = 40, Height = 40 };
    }

    public sealed class RectDef
    {
        public int X { get; set; }
        public int Y { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }

        public bool Contains(int x, int y, int w, int h) =>
            x >= X && y >= Y && x + w <= X + Width && y + h <= Y + Height;
    }
}
