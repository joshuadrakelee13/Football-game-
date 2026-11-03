using FCE.Core.Content;
using FCE.Core.Economy;
using NUnit.Framework;

namespace FCE.Core.Tests
{
    public class EconomyTests
    {
        [TestCase(0, "£0")]
        [TestCase(5, "£5")]
        [TestCase(950, "£950")]
        [TestCase(9_999, "£9,999")]
        [TestCase(10_000, "£10k")]
        [TestCase(12_599, "£12.5k")]
        [TestCase(34_500, "£34.5k")]
        [TestCase(350_999, "£350k")]
        [TestCase(999_999, "£999k")]
        [TestCase(1_000_000, "£1m")]
        [TestCase(1_259_000, "£1.25m")]
        [TestCase(42_190_000, "£42.1m")]
        [TestCase(132_480_000, "£132m")]
        [TestCase(4_200_000_000, "£4.2bn")]
        [TestCase(999_000_000_000, "£999bn")]
        [TestCase(-2_500, "-£2,500")]
        public void CompactMoneyNeverOverstates(long pounds, string expected)
        {
            Assert.That(MoneyFormat.Compact(pounds), Is.EqualTo(expected));
        }

        [Test]
        public void FullMoneyShowsEveryDigit()
        {
            Assert.That(MoneyFormat.Full(3_523_463), Is.EqualTo("£3,523,463"));
            Assert.That(MoneyFormat.Full(-120), Is.EqualTo("-£120"));
        }

        [TestCase(5, "5s")]
        [TestCase(120, "2m")]
        [TestCase(150, "2m 30s")]
        [TestCase(3900, "1h 5m")]
        [TestCase(273600, "3d 4h")]
        public void Durations(long seconds, string expected)
        {
            Assert.That(MoneyFormat.Duration(seconds), Is.EqualTo(expected));
        }

        [Test]
        public void RatesReadNaturally()
        {
            Assert.That(MoneyFormat.PerCycle(5, 5), Is.EqualTo("£5 every 5s"));
            Assert.That(MoneyFormat.PerCycle(50, 120), Is.EqualTo("£50 every 2m"));
            Assert.That(MoneyFormat.PerHour(3600), Is.EqualTo("£3,600/hr"));
        }

        [Test]
        public void BalancesStopAtTheCeiling()
        {
            var t = new TestGame();
            var placed = t.Game.PlaceBuilding("drinks_stand", 32, 12);
            t.Wait(10);
            t.State.Wallet.Balances[Currencies.Cash] = Money.MaxBalance - 20;
            t.Wait(60); // £60 waiting
            t.Game.Collect(placed.BuildingId);
            Assert.That(t.Game.Balance(Currencies.Cash), Is.EqualTo(Money.MaxBalance));
            Assert.That(t.Game.FindBuilding(placed.BuildingId).Producer.Stored, Is.EqualTo(40), "what the club cannot hold stays in the building");
        }

        [Test]
        public void ConstructionIsRecordedAsAnExpense()
        {
            var t = new TestGame();
            t.Game.PlaceBuilding("drinks_stand", 32, 12);
            var day = t.State.Ledger.Day(t.Game.Now);
            Assert.That(day.Expenses[LedgerCategories.Construction], Is.EqualTo(100));
            Assert.That(day.Net, Is.EqualTo(-100));
            Assert.That(t.State.Ledger.Lifetime.TotalExpenses, Is.EqualTo(100));
        }

        [Test]
        public void PremiumSpendingIsNotClubFinance()
        {
            var t = new TestGame();
            var hq = t.Find("clubhouse");
            t.Game.StartUpgrade(hq.Id);
            t.Game.FinishNow(hq.Id);
            Assert.That(t.State.Ledger.Lifetime.Expenses[LedgerCategories.Construction], Is.EqualTo(1200), "only the £1,200 build cost, not the credits");
        }

        [Test]
        public void LedgerKeepsAFortnightOfDays()
        {
            var t = new TestGame();
            var id = t.Game.PlaceBuilding("drinks_stand", 32, 12).BuildingId;
            for (int day = 0; day < 20; day++) { t.Wait(86400); t.Game.Collect(id); }
            Assert.That(t.State.Ledger.Days.Count, Is.EqualTo(Ledger.DaysKept));
            Assert.That(t.State.Ledger.Lifetime.Income["food_drink"], Is.EqualTo(20 * 600));
        }
    }
}
