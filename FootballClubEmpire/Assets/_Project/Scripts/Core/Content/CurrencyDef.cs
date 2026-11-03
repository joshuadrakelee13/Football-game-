namespace FCE.Core.Content
{
    public sealed class CurrencyDef
    {
        public string Id { get; set; }
        public string Name { get; set; }
        /// <summary>Shown before amounts, e.g. "£".</summary>
        public string Symbol { get; set; }
        /// <summary>True for the premium currency. It may only buy time and cosmetics, never competitive advantage.</summary>
        public bool Premium { get; set; }
    }

    /// <summary>Ids of currencies the rules refer to directly. Everything else is data.</summary>
    public static class Currencies
    {
        public const string Cash = "cash";
        public const string Credits = "credits";
    }

    /// <summary>Ids of stats the rules refer to directly.</summary>
    public static class Stats
    {
        public const string ConstructionCrews = "construction_crews";
    }
}
