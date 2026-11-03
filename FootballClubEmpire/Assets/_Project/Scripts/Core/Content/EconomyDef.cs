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

        /// <summary>Named stages of the club's development, by Stadium level: "Grassroots", "Established professional"...</summary>
        public List<ChapterDef> Chapters { get; set; } = new List<ChapterDef>();

        /// <summary>One-off rewards paid when the Stadium reaches a level.</summary>
        public List<StadiumReward> StadiumRewards { get; set; } = new List<StadiumReward>();

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

    /// <summary>
    /// The club grounds: a grid of tiles. The buildable part grows as the Stadium is upgraded: each entry in
    /// <see cref="Areas"/> is the usable rectangle from that Stadium level on, and contains the one before it.
    /// </summary>
    public sealed class SiteDef
    {
        public int Width { get; set; } = 40;
        public int Height { get; set; } = 40;
        public List<SiteArea> Areas { get; set; } = new List<SiteArea>();

        /// <summary>The buildable rectangle at a Stadium level.</summary>
        public RectDef AreaAt(int stadiumLevel)
        {
            RectDef area = null;
            foreach (var a in Areas)
                if (a.StadiumLevel <= stadiumLevel) area = a.Area;
            return area ?? (Areas.Count > 0 ? Areas[0].Area : new RectDef { Width = Width, Height = Height });
        }
    }

    public sealed class SiteArea
    {
        public int StadiumLevel { get; set; }
        public RectDef Area { get; set; }
    }

    public sealed class ChapterDef
    {
        /// <summary>The Stadium level this chapter begins at.</summary>
        public int FromLevel { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
    }

    public sealed class StadiumReward
    {
        public int Level { get; set; }
        public Dictionary<string, long> Currencies { get; set; } = new Dictionary<string, long>();
    }

    public sealed class RectDef
    {
        public int X { get; set; }
        public int Y { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }

        public bool Contains(int x, int y, int w, int h) =>
            x >= X && y >= Y && x + w <= X + Width && y + h <= Y + Height;

        public bool Contains(RectDef other) => Contains(other.X, other.Y, other.Width, other.Height);
    }
}
