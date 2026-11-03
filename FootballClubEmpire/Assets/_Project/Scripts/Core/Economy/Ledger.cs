using System.Collections.Generic;

namespace FCE.Core.Economy
{
    /// <summary>
    /// Where every pound came from and went, by category. Kept per UTC day for the recent past and as lifetime totals,
    /// so the finance screen can answer "what did I earn today, and on what?" at any point in a long career.
    /// Only the main currency is tracked; Club Credits are not club finances.
    /// </summary>
    public sealed class Ledger
    {
        /// <summary>How many recent days are kept in detail.</summary>
        public const int DaysKept = 14;

        public SortedDictionary<long, LedgerDay> Days { get; set; } = new SortedDictionary<long, LedgerDay>();
        public LedgerDay Lifetime { get; set; } = new LedgerDay();

        public static long DayOf(long time) => time >= 0 ? time / 86400 : (time - 86399) / 86400;

        internal void Record(long time, string category, long signedAmount)
        {
            if (signedAmount == 0) return;
            long day = DayOf(time);
            if (!Days.TryGetValue(day, out var book)) Days[day] = book = new LedgerDay();
            book.Add(category, signedAmount);
            Lifetime.Add(category, signedAmount);

            while (Days.Count > DaysKept)
            {
                using (var e = Days.Keys.GetEnumerator()) { e.MoveNext(); Days.Remove(e.Current); }
            }
        }

        public LedgerDay Day(long time) => Days.TryGetValue(DayOf(time), out var book) ? book : new LedgerDay();
    }

    public sealed class LedgerDay
    {
        public SortedDictionary<string, long> Income { get; set; } = new SortedDictionary<string, long>();
        public SortedDictionary<string, long> Expenses { get; set; } = new SortedDictionary<string, long>();

        public long TotalIncome { get { long t = 0; foreach (var v in Income.Values) t += v; return t; } }
        public long TotalExpenses { get { long t = 0; foreach (var v in Expenses.Values) t += v; return t; } }
        public long Net => TotalIncome - TotalExpenses;

        internal void Add(string category, long signedAmount)
        {
            var book = signedAmount > 0 ? Income : Expenses;
            long amount = System.Math.Abs(signedAmount);
            book[category] = (book.TryGetValue(category, out var v) ? v : 0) + amount;
        }
    }

    /// <summary>Ledger categories the rules use directly. Producers name theirs in content.</summary>
    public static class LedgerCategories
    {
        public const string Construction = "construction";
        public const string Refunds = "refunds";
    }
}
