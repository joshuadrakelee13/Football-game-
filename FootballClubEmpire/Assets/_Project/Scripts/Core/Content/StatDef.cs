namespace FCE.Core.Content
{
    /// <summary>
    /// A club statistic that buildings contribute to (stadium capacity, training quality, construction crews...).
    /// A club's value for a stat is <see cref="BaseValue"/> plus every completed building's contribution at its current level.
    /// </summary>
    public sealed class StatDef
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public long BaseValue { get; set; }
        /// <summary>How the UI should show the number: "number", "percent" or "money".</summary>
        public string Format { get; set; } = "number";
    }
}
