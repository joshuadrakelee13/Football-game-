namespace FCE.Core.Economy
{
    /// <summary>
    /// The economy's hard limits. Money is whole pounds in a <c>long</c>.
    ///
    /// Football Club Empire's economy is deliberately grounded: a grassroots club counts pounds, a Premier League club
    /// counts millions, and nothing ever counts quadrillions. <see cref="MaxBalance"/> is the absolute ceiling on any
    /// balance; content validation also refuses any single price, income or storage figure above it.
    /// </summary>
    public static class Money
    {
        /// <summary>£999 billion: the most any balance can ever hold.</summary>
        public const long MaxBalance = 999_000_000_000L;
    }
}
